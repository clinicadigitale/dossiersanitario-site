from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import tempfile
import threading
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PBKDF2_ITERATIONS = 260_000
MAX_FAILED_ATTEMPTS = 5
LOCK_SECONDS = 60
SESSION_SECONDS = 12 * 60 * 60
RECOVERY_QUESTION_LOCK_SECONDS = 15 * 60
USERNAME_RE = re.compile(r"\s+")
BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"


class AuthError(Exception):
    def __init__(self, message: str, code: str = "auth_error", status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_username(value: str) -> str:
    return USERNAME_RE.sub(" ", str(value or "").strip()).casefold()

def normalize_email(value: str) -> str:
    return str(value or "").strip().casefold()

def normalize_recovery_answer(value: str) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).strip().casefold()
    return USERNAME_RE.sub(" ", text)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    raw = str(value or "")
    return base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))


def _hash_password(password: str, salt: bytes, iterations: int = PBKDF2_ITERATIONS) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, dklen=32)


def _hash_recovery(code: str) -> str:
    normalized = re.sub(r"[^A-Z0-9]", "", str(code or "").upper())
    return hashlib.sha256(normalized.encode("ascii", "ignore")).hexdigest()


def _recovery_codes() -> list[str]:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    out: list[str] = []
    for _ in range(10):
        chars = "".join(secrets.choice(alphabet) for _ in range(12))
        out.append(f"{chars[:4]}-{chars[4:8]}-{chars[8:]}")
    return out


def _totp(secret: str, when: float | None = None, step: int = 30, digits: int = 6) -> str:
    when = time.time() if when is None else when
    counter = int(when // step).to_bytes(8, "big")
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, counter, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = int.from_bytes(digest[offset:offset + 4], "big") & 0x7FFFFFFF
    return str(value % (10 ** digits)).zfill(digits)


def _verify_totp(secret: str, token: str) -> bool:
    clean = re.sub(r"\D", "", str(token or ""))
    if len(clean) != 6:
        return False
    now = time.time()
    return any(hmac.compare_digest(_totp(secret, now + offset), clean) for offset in (-60, -30, 0, 30, 60))


MFA_SECRET_ITERATIONS = 260_000
MFA_SECRET_PREFIX = "pwv1:"


def _password_ok(user: dict[str, Any], password: str) -> bool:
    salt = _unb64(user["passwordSalt"])
    expected = _unb64(user["passwordHash"])
    actual = _hash_password(str(password or ""), salt, int(user.get("passwordIterations") or PBKDF2_ITERATIONS))
    return hmac.compare_digest(expected, actual)


def _mfa_secret_key(password: str, salt: bytes) -> tuple[bytes, bytes]:
    material = hashlib.pbkdf2_hmac(
        "sha256", str(password or "").encode("utf-8"), salt, MFA_SECRET_ITERATIONS, dklen=64
    )
    return material[:32], material[32:]


def _mfa_secret_stream(key: bytes, nonce: bytes, length: int) -> bytes:
    out = bytearray()
    counter = 0
    while len(out) < length:
        block = hmac.new(key, b"Dossier-MFA-ENC\x00" + nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        out.extend(block)
        counter += 1
    return bytes(out[:length])


def _portable_mfa_protect(secret: str, password: str) -> str:
    raw = str(secret or "").encode("ascii")
    salt = secrets.token_bytes(16)
    nonce = secrets.token_bytes(16)
    enc_key, mac_key = _mfa_secret_key(password, salt)
    stream = _mfa_secret_stream(enc_key, nonce, len(raw))
    ciphertext = bytes(a ^ b for a, b in zip(raw, stream))
    tag = hmac.new(mac_key, b"Dossier-MFA-V1\x00" + salt + nonce + ciphertext, hashlib.sha256).digest()
    return MFA_SECRET_PREFIX + _b64(salt + nonce + ciphertext + tag)


def _portable_mfa_unprotect(value: str, password: str) -> str:
    value = str(value or "")
    if not value.startswith(MFA_SECRET_PREFIX):
        raise AuthError("Segreto personale del secondo fattore non valido", "invalid_mfa_envelope", 500)
    try:
        packed = _unb64(value[len(MFA_SECRET_PREFIX):])
        if len(packed) < 16 + 16 + 1 + 32:
            raise ValueError("dimensione")
        salt, nonce = packed[:16], packed[16:32]
        ciphertext, tag = packed[32:-32], packed[-32:]
        enc_key, mac_key = _mfa_secret_key(password, salt)
        expected = hmac.new(mac_key, b"Dossier-MFA-V1\x00" + salt + nonce + ciphertext, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, tag):
            raise AuthError("Password non valida per il secondo fattore", "invalid_mfa_password", 401)
        stream = _mfa_secret_stream(enc_key, nonce, len(ciphertext))
        return bytes(a ^ b for a, b in zip(ciphertext, stream)).decode("ascii")
    except AuthError:
        raise
    except Exception as exc:
        raise AuthError(f"Segreto personale del secondo fattore non leggibile: {exc}", "invalid_mfa_envelope", 500)


def _dpapi_protect(raw: bytes) -> str:
    if os.name != "nt":
        # Usato soltanto per i test automatici non Windows.
        return "test:" + _b64(raw)
    import ctypes
    from ctypes import wintypes

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]

    def blob(data: bytes):
        buf = ctypes.create_string_buffer(data)
        return DATA_BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_ubyte))), buf

    in_blob, in_buf = blob(raw)
    out_blob = DATA_BLOB()
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    if not crypt32.CryptProtectData(ctypes.byref(in_blob), "Dossier Sanitario Locale", None, None, None, 0, ctypes.byref(out_blob)):
        raise OSError("Protezione DPAPI non riuscita")
    try:
        protected = ctypes.string_at(out_blob.pbData, out_blob.cbData)
        return "dpapi:" + _b64(protected)
    finally:
        kernel32.LocalFree(out_blob.pbData)
        _ = in_buf


def _dpapi_unprotect(value: str) -> bytes:
    value = str(value or "")
    if value.startswith("test:"):
        return _unb64(value[5:])
    if not value.startswith("dpapi:"):
        raise AuthError("Segreto di autenticazione non valido", "invalid_secret", 500)
    if os.name != "nt":
        raise AuthError("Questo codice di accesso era protetto dal computer Windows su cui è stato creato e non si può aprire nel browser: riattiva la verifica in due passaggi", "dpapi_unavailable", 500)

    import ctypes
    from ctypes import wintypes

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]

    raw = _unb64(value[6:])
    buf = ctypes.create_string_buffer(raw)
    in_blob = DATA_BLOB(len(raw), ctypes.cast(buf, ctypes.POINTER(ctypes.c_ubyte)))
    out_blob = DATA_BLOB()
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    if not crypt32.CryptUnprotectData(ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)):
        raise AuthError("Impossibile aprire il segreto locale", "invalid_secret", 500)
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


class AuthService:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.file = self.root / "users.json"
        self.audit_file = self.root / "auth_audit.jsonl"
        self.lock = threading.RLock()
        self.sessions: dict[str, dict[str, Any]] = {}
        self.pending_mfa: dict[str, dict[str, Any]] = {}
        self.root.mkdir(parents=True, exist_ok=True)

    def _blank(self) -> dict[str, Any]:
        return {"version": 6, "users": [], "invitations": [], "temporaryFamilyAccesses": []}

    def _load(self) -> dict[str, Any]:
        if not self.file.exists():
            return self._blank()
        try:
            data = json.loads(self.file.read_text(encoding="utf-8"))
            if not isinstance(data, dict) or not isinstance(data.get("users"), list):
                raise ValueError("formato non valido")
            if not isinstance(data.get("invitations"), list):
                data["invitations"] = []
            if not isinstance(data.get("temporaryFamilyAccesses"), list):
                data["temporaryFamilyAccesses"] = []
            data["version"] = max(6, int(data.get("version", 3) or 3))
            return data
        except Exception as exc:
            raise AuthError(f"Archivio credenziali non leggibile: {exc}", "auth_store_invalid", 500)

    def _save(self, data: dict[str, Any]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix="users_", suffix=".tmp", dir=str(self.root))
        os.close(fd)
        temp = Path(temp_name)
        try:
            temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(temp, self.file)
            try:
                os.chmod(self.file, 0o600)
            except OSError:
                pass
        finally:
            try:
                temp.unlink(missing_ok=True)
            except OSError:
                pass

    def _audit(self, event: str, user_id: str = "", details: dict[str, Any] | None = None) -> None:
        row = {"at": utc_now(), "event": event, "userId": user_id, "details": details or {}}
        try:
            with self.audit_file.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
        except OSError:
            pass

    CAPABILITY_KEYS = (
        "viewOtherProfiles", "editOtherProfiles", "importDocuments", "editDocuments",
        "deleteDocuments", "viewDiagnoses", "editDiagnoses", "viewTherapies",
        "editTherapies", "exportPdf", "backup", "restore", "manageUsers",
        "managePermissions",
    )

    @classmethod
    def _default_capabilities(cls, access_level: str) -> dict[str, bool]:
        if access_level == "administrator":
            return {key: True for key in cls.CAPABILITY_KEYS}
        if access_level == "editor":
            enabled = {
                "viewOtherProfiles", "editOtherProfiles", "importDocuments", "editDocuments",
                "deleteDocuments", "viewDiagnoses", "editDiagnoses", "viewTherapies",
                "editTherapies", "exportPdf", "manageUsers", "managePermissions",
            }
            return {key: key in enabled for key in cls.CAPABILITY_KEYS}
        enabled = {"viewOtherProfiles", "viewDiagnoses", "viewTherapies", "exportPdf"}
        return {key: key in enabled for key in cls.CAPABILITY_KEYS}

    @classmethod
    def _access_level(cls, user: dict[str, Any]) -> str:
        if user.get("role") == "administrator":
            return "administrator"
        stored = str(user.get("accessLevel", "") or "").strip().lower()
        if stored in {"editor", "viewer"}:
            return stored
        permissions = user.get("profilePermissions") or {}
        if any(str(value).lower() in {"edit", "admin"} for value in permissions.values()):
            return "editor"
        return "viewer"

    @classmethod
    def _sanitize_capabilities(cls, value: Any, access_level: str) -> dict[str, bool]:
        defaults = cls._default_capabilities(access_level)
        if access_level == "administrator":
            return defaults
        if isinstance(value, dict):
            for key in cls.CAPABILITY_KEYS:
                if key in value:
                    defaults[key] = bool(value[key])
        if access_level == "viewer":
            for key in (
                "editOtherProfiles", "importDocuments", "editDocuments", "deleteDocuments",
                "editDiagnoses", "editTherapies", "backup", "restore", "manageUsers",
                "managePermissions",
            ):
                defaults[key] = False
        return defaults

    @staticmethod
    def _sanitize_profile_permissions(value: Any, *, allow_edit: bool = True) -> dict[str, str]:
        if not isinstance(value, dict):
            return {}
        allowed = {"none", "view", "edit"} if allow_edit else {"none", "view"}
        out: dict[str, str] = {}
        for key, permission in value.items():
            key = str(key or "").strip()
            permission = str(permission or "none").strip().lower()
            if not key or key == "*":
                continue
            if permission == "admin":
                permission = "edit" if allow_edit else "view"
            if permission in allowed:
                out[key] = permission
        return out

    def _can_manage_users(self, user: dict[str, Any]) -> bool:
        level = self._access_level(user)
        caps = self._sanitize_capabilities(user.get("capabilities"), level)
        return level == "administrator" or (level == "editor" and caps.get("manageUsers", False))

    def _can_manage_permissions(self, user: dict[str, Any]) -> bool:
        level = self._access_level(user)
        caps = self._sanitize_capabilities(user.get("capabilities"), level)
        return level == "administrator" or (level == "editor" and caps.get("managePermissions", False))

    def require_capability(self, token: str, capability: str) -> dict[str, Any]:
        user = self.require_session(token)
        level = self._access_level(user)
        caps = self._sanitize_capabilities(user.get("capabilities"), level)
        if level != "administrator" and not caps.get(capability, False):
            raise AuthError("Operazione non autorizzata", "forbidden", 403)
        return user

    def _public_user(self, user: dict[str, Any]) -> dict[str, Any]:
        access_level = self._access_level(user)
        role = "administrator" if access_level == "administrator" else "member"
        profile_permissions = {"*": "admin"} if role == "administrator" else self._sanitize_profile_permissions(
            user.get("profilePermissions"), allow_edit=access_level == "editor"
        )
        capabilities = self._sanitize_capabilities(user.get("capabilities"), access_level)
        return {
            "id": user["id"],
            "displayName": user.get("displayName", ""),
            "username": user.get("username", ""),
            "usernameKey": user.get("usernameKey", ""),
            "email": user.get("email", ""),
            "hasRecoveryQuestion": bool(user.get("recoveryQuestion") and user.get("recoveryAnswerHash")),
            "role": role,
            "accessLevel": access_level,
            "active": user.get("active", True),
            "profilePermissions": profile_permissions,
            "capabilities": capabilities,
            "linkedProfileId": str(user.get("linkedProfileId", "") or ""),
            "mfaEnabled": bool(user.get("mfaEnabled")),
            "mfaReenrollRequired": bool(user.get("mfaReenrollRequired")),
            "requiresCredentialPersonalization": bool(role != "administrator" and user.get("credentialOwnership") != "personal"),
            "profileDepartureAuthorized": bool(user.get("profileDepartureAuthorization")),
            "profileDepartureAuthorizedAt": str((user.get("profileDepartureAuthorization") or {}).get("authorizedAt", "") or ""),
            "pendingAssociation": bool(user.get("pendingAssociation")),
            "recoveryCodesAvailable": len(user.get("recoveryCodeHashes") or []),
            "createdAt": user.get("createdAt", ""),
            "updatedAt": user.get("updatedAt", ""),
            "lastLoginAt": user.get("lastLoginAt", ""),
            "securityPreferences": {
                "timeoutMinutes": max(1, min(60, int((user.get("securityPreferences") or {}).get("timeoutMinutes", 15) or 15))),
                "mfaRequiredForCloud": True,
            },
            "healthDataConsents": dict(user.get("healthDataConsents") or {}),
            "consentRequiredProfileIds": sorted({
                str(row.get("linkedProfileId") or "")
                for row in (self._load().get("users") or [])
                if row.get("active") is not False
                and str(row.get("id") or "") != str(user.get("id") or "")
                and str(row.get("linkedProfileId") or "")
            }),
        }

    def _find(self, data: dict[str, Any], username: str) -> dict[str, Any] | None:
        key = normalize_username(username)
        email_key = normalize_email(username)
        return next((u for u in data["users"] if u.get("usernameKey") == key or (email_key and normalize_email(u.get("email")) == email_key)), None)

    def _find_email(self, data: dict[str, Any], email: str) -> dict[str, Any] | None:
        key = normalize_email(email)
        if not key:
            return None
        return next((u for u in data["users"] if normalize_email(u.get("email")) == key), None)

    def _set_recovery_question(self, user: dict[str, Any], question: str, answer: str) -> None:
        question = str(question or "").strip()
        answer = normalize_recovery_answer(answer)
        if len(question) < 5:
            raise AuthError("La domanda di recupero deve contenere almeno 5 caratteri", "weak_recovery_question")
        if len(answer) < 3:
            raise AuthError("La risposta di recupero deve contenere almeno 3 caratteri", "weak_recovery_answer")
        salt = secrets.token_bytes(16)
        user["recoveryQuestion"] = question
        user["recoveryAnswerSalt"] = _b64(salt)
        user["recoveryAnswerHash"] = _b64(_hash_password(answer, salt))
        user["recoveryAnswerIterations"] = PBKDF2_ITERATIONS
        user["recoveryFailedAttempts"] = 0
        user["recoveryLockUntil"] = 0

    def _recovery_answer_ok(self, user: dict[str, Any], answer: str) -> bool:
        try:
            salt = _unb64(user.get("recoveryAnswerSalt", ""))
            expected = _unb64(user.get("recoveryAnswerHash", ""))
            actual = _hash_password(normalize_recovery_answer(answer), salt, int(user.get("recoveryAnswerIterations") or PBKDF2_ITERATIONS))
            return hmac.compare_digest(expected, actual)
        except Exception:
            return False

    def _find_id(self, data: dict[str, Any], user_id: str) -> dict[str, Any] | None:
        return next((u for u in data["users"] if u.get("id") == user_id), None)

    def _new_session(self, user: dict[str, Any], mfa_secret: str = "", mfa_verified_at: float = 0.0) -> str:
        token = secrets.token_urlsafe(36)
        self.sessions[token] = {
            "userId": user["id"],
            "created": time.time(),
            "lastSeen": time.time(),
            "mfaSecret": str(mfa_secret or ""),
            "mfaVerifiedAt": float(mfa_verified_at or 0.0),
        }
        return token

    def require_session(self, token: str, administrator: bool = False) -> dict[str, Any]:
        with self.lock:
            row = self.sessions.get(str(token or ""))
            if not row or time.time() - row["lastSeen"] > SESSION_SECONDS:
                self.sessions.pop(str(token or ""), None)
                raise AuthError("Sessione non valida o scaduta", "session_expired", 401)
            data = self._load()
            user = self._find_id(data, row["userId"])
            if not user or user.get("active") is False:
                raise AuthError("Utente non disponibile", "user_disabled", 403)
            if administrator and user.get("role") != "administrator":
                raise AuthError("Operazione riservata all’amministratore", "forbidden", 403)
            row["lastSeen"] = time.time()
            return user

    def _repair_machine_bound_mfa(self, data: dict[str, Any]) -> bool:
        """Convert first-run/restored legacy DPAPI MFA into a forced re-enrolment state.

        Old archives may contain a TOTP secret protected by Windows DPAPI. That secret is
        intentionally bound to the Windows profile/machine that created it and cannot be
        decrypted on a second computer. If it is readable here we leave it untouched so
        login can migrate it to the portable password envelope. If it is not readable,
        possession of the restored archive plus the account password is used only to
        permit login; MFA must then be configured again before the Dossier opens.
        """
        changed = False
        for user in data.get("users") or []:
            if not user.get("mfaEnabled"):
                continue
            if user.get("mfaSecretEnvelope"):
                continue
            legacy = str(user.get("mfaSecretProtected", "") or "")
            if not legacy:
                continue
            try:
                _dpapi_unprotect(legacy)
                continue
            except Exception:
                user["mfaEnabled"] = False
                user["mfaReenrollRequired"] = True
                user.pop("mfaSecretProtected", None)
                user["updatedAt"] = utc_now()
                changed = True
        return changed

    def status(self) -> dict[str, Any]:
        with self.lock:
            data = self._load()
            if self._repair_machine_bound_mfa(data):
                self._save(data)
                self._audit("mfa-restore-reenroll-required", "", {"users": [u.get("id", "") for u in data.get("users") or [] if u.get("mfaReenrollRequired")]})
            users = [self._public_user(u) for u in data["users"] if u.get("active") is not False]
            return {"initialized": bool(data["users"]), "users": users}

    def setup(self, display_name: str, username: str, password: str, email: str = "", recovery_question: str = "", recovery_answer: str = "") -> dict[str, Any]:
        display_name = str(display_name or "").strip()
        username = str(username or "").strip()
        password = str(password or "")
        email = normalize_email(email)
        if not display_name or not username:
            raise AuthError("Compila nome visualizzato e nome utente", "missing_fields")
        if len(password) < 10:
            raise AuthError("La password deve contenere almeno 10 caratteri", "weak_password")
        if "@" not in email:
            raise AuthError("Inserisci un indirizzo e-mail valido", "invalid_email")
        with self.lock:
            data = self._load()
            if data["users"]:
                raise AuthError("L’amministratore è già stato creato", "already_initialized", 409)
            salt = secrets.token_bytes(16)
            client_salt = secrets.token_bytes(16)
            user = {
                "id": "user_" + secrets.token_hex(16),
                "displayName": display_name,
                "username": username,
                "usernameKey": normalize_username(username),
                "email": email,
                "role": "administrator",
                "credentialOwnership": "personal",
                "active": True,
                "profilePermissions": {"*": "admin"},
                "accessLevel": "administrator",
                "capabilities": self._default_capabilities("administrator"),
                "passwordSalt": _b64(salt),
                "passwordHash": _b64(_hash_password(password, salt)),
                "passwordIterations": PBKDF2_ITERATIONS,
                "clientSalt": _b64(client_salt),
                "mfaEnabled": False,
                "recoveryCodeHashes": [],
                "failedAttempts": 0,
                "lockUntil": 0,
                "createdAt": utc_now(),
                "updatedAt": utc_now(),
            }
            self._set_recovery_question(user, recovery_question, recovery_answer)
            data["users"].append(user)
            self._save(data)
            token = self._new_session(user)
            self._audit("initial-admin", user["id"])
            return {"token": token, "user": self._public_user(user), "clientSalt": user["clientSalt"]}


    def setup_personal(self, display_name: str, username: str, password: str, email: str = "", recovery_question: str = "", recovery_answer: str = "") -> dict[str, Any]:
        """Create a personal account on a fresh device without creating a Dossier."""
        display_name = str(display_name or "").strip()
        username = str(username or "").strip()
        password = str(password or "")
        email = normalize_email(email)
        if not display_name or not username:
            raise AuthError("Compila nome visualizzato e nome utente", "missing_fields")
        if len(password) < 10:
            raise AuthError("La password deve contenere almeno 10 caratteri", "weak_password")
        if "@" not in email:
            raise AuthError("Inserisci un indirizzo e-mail valido", "invalid_email")
        with self.lock:
            data = self._load()
            if data["users"]:
                raise AuthError("Su questo dispositivo esiste già un account", "already_initialized", 409)
            salt = secrets.token_bytes(16)
            user = {
                "id": "user_" + secrets.token_hex(16),
                "displayName": display_name,
                "username": username,
                "usernameKey": normalize_username(username),
                "email": email,
                "role": "member",
                "credentialOwnership": "personal",
                "active": True,
                "pendingAssociation": True,
                "profilePermissions": {},
                "accessLevel": "viewer",
                "capabilities": {key: False for key in self.CAPABILITY_KEYS},
                "linkedProfileId": "",
                "passwordSalt": _b64(salt),
                "passwordHash": _b64(_hash_password(password, salt)),
                "passwordIterations": PBKDF2_ITERATIONS,
                "clientSalt": _b64(secrets.token_bytes(16)),
                "mfaEnabled": False,
                "recoveryCodeHashes": [],
                "failedAttempts": 0,
                "lockUntil": 0,
                "createdAt": utc_now(),
                "updatedAt": utc_now(),
            }
            self._set_recovery_question(user, recovery_question, recovery_answer)
            data["users"].append(user)
            self._save(data)
            token = self._new_session(user)
            self._audit("personal-account-created", user["id"])
            return {"token": token, "user": self._public_user(user), "clientSalt": user["clientSalt"]}

    def export_current_account(self, token: str) -> dict[str, Any]:
        current = self.require_session(token)
        with self.lock:
            data = self._load()
            user = dict(self._find_id(data, current["id"]) or {})
            if not user:
                raise AuthError("Account non disponibile", "not_found", 404)
            allowed = {
                "id", "displayName", "username", "usernameKey", "email", "passwordSalt",
                "passwordHash", "passwordIterations", "clientSalt", "mfaEnabled",
                "mfaSecretEnvelope", "recoveryCodeHashes", "recoveryQuestion", "recoveryAnswerSalt", "recoveryAnswerHash", "recoveryAnswerIterations", "recoveryFailedAttempts", "recoveryLockUntil", "securityPreferences",
                "generalWarningsAcceptance", "linkedProfileId", "createdAt", "updatedAt",
            }
            exported = {key: user[key] for key in allowed if key in user}
            exported["usernameKey"] = normalize_username(exported.get("usernameKey") or exported.get("username"))
            return exported

    def create_temporary_family_access(self, token: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Create a generic 48-hour one-time family activation.

        The administrator communicates only the 15-character family password. The encrypted
        transport package is published by the client to the neutral relay. No profile is selected
        in advance: an existing member can authenticate with the credentials already present in
        the family store, while a new member can create a personal account.
        """
        actor = self.require_session(token, administrator=True)
        archive_id = str(payload.get("archiveId", "") or "").strip()
        profile_id = str(payload.get("profileId", "") or "").strip()
        profile_name = str(payload.get("profileName", "") or "").strip()
        if not archive_id:
            raise AuthError("Archivio familiare non disponibile", "invalid_family_access")
        activation_id = "family_" + secrets.token_hex(16)
        upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
        lower = "abcdefghijkmnopqrstuvwxyz"
        digits = "23456789"
        specials = "!@#$%&*?"
        chars = [secrets.choice(upper), secrets.choice(lower), secrets.choice(digits), secrets.choice(specials)]
        pool = upper + lower + digits + specials
        chars.extend(secrets.choice(pool) for _ in range(11))
        secrets.SystemRandom().shuffle(chars)
        temporary_password = "".join(chars)
        join_secret = secrets.token_urlsafe(32)
        salt = secrets.token_bytes(16)
        expires_epoch = int(time.time() + 48 * 3600)
        row = {
            "id": activation_id,
            "generic": not bool(profile_id),
            "profileId": profile_id,
            "profileName": profile_name,
            "archiveId": archive_id,
            "accessLevel": "viewer",
            "profilePermissions": ({profile_id: "edit"} if profile_id else {}),
            "capabilities": self._default_capabilities("viewer"),
            "temporaryPasswordSalt": _b64(salt),
            "temporaryPasswordHash": _b64(_hash_password(temporary_password, salt)),
            "temporaryPasswordIterations": PBKDF2_ITERATIONS,
            "joinSecretHash": hashlib.sha256(join_secret.encode("utf-8")).hexdigest(),
            "createdAt": utc_now(),
            "expiresAtEpoch": expires_epoch,
            "status": "pending",
            "createdBy": actor.get("id", ""),
        }
        with self.lock:
            data = self._load()
            rows = list(data.get("temporaryFamilyAccesses") or [])
            now = time.time()
            for old in rows:
                if old.get("status") == "pending" and float(old.get("expiresAtEpoch") or 0) < now:
                    old["status"] = "expired"
            rows.append(row)
            history = [x for x in rows if x.get("status") != "pending"][-100:]
            active = [x for x in rows if x.get("status") == "pending"][-100:]
            data["temporaryFamilyAccesses"] = history + active
            self._save(data)
            self._audit("family-temporary-access-created", actor["id"], {
                "activationId": activation_id,
                "expiresAtEpoch": expires_epoch,
                "generic": True,
            })
        public = {k: v for k, v in row.items() if k not in {"temporaryPasswordSalt", "temporaryPasswordHash", "temporaryPasswordIterations", "joinSecretHash"}}
        public["temporaryPassword"] = temporary_password
        public["joinSecret"] = join_secret
        return public

    def join_new_family_member(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Create or safely re-personalize the account used by a family member.

        A profile-bound 48-hour family password may be used to recover access to an
        existing health profile even when the old local account record is missing or
        its credentials are no longer usable. In that case the clinical profile is
        preserved and only the personal authentication record is created/replaced.
        """
        activation_id = str(payload.get("activationId", "") or "").strip()
        join_secret = str(payload.get("joinSecret", "") or "").strip()
        display_name = str(payload.get("displayName", "") or "").strip()
        username = str(payload.get("username", "") or "").strip()
        password = str(payload.get("password", "") or "")
        email = normalize_email(payload.get("email", ""))
        if not activation_id or not join_secret:
            raise AuthError("Accesso familiare non valido", "invalid_family_activation")
        if not display_name or not username or "@" not in email:
            raise AuthError("Compila nome, e-mail e nome utente", "missing_fields")
        if len(password) < 10:
            raise AuthError("La password deve contenere almeno 10 caratteri", "weak_password")
        with self.lock:
            data = self._load()
            activation = next((x for x in data.get("temporaryFamilyAccesses") or [] if x.get("id") == activation_id), None)
            if not activation:
                raise AuthError("Accesso familiare non riconosciuto", "family_activation_not_found", 404)
            if activation.get("status") != "pending" or float(activation.get("expiresAtEpoch") or 0) < time.time():
                raise AuthError("Questo accesso familiare non è più utilizzabile", "family_activation_expired", 410)
            expected = str(activation.get("joinSecretHash", "") or "")
            actual = hashlib.sha256(join_secret.encode("utf-8")).hexdigest()
            if not expected or not hmac.compare_digest(expected, actual):
                raise AuthError("Accesso familiare non valido", "invalid_family_activation", 403)

            profile_id = str(activation.get("profileId", "") or "").strip()
            profile_user = None
            if profile_id:
                profile_user = next(
                    (u for u in data["users"] if u.get("role") != "administrator"
                     and str(u.get("linkedProfileId", "") or "") == profile_id),
                    None,
                )

            username_key = normalize_username(username)
            username_owner = next(
                (u for u in data["users"]
                 if normalize_username(u.get("usernameKey") or u.get("username")) == username_key),
                None,
            )
            email_owner = next(
                (u for u in data["users"] if email and normalize_email(u.get("email")) == email),
                None,
            )
            allowed_existing_id = str(profile_user.get("id", "") or "") if profile_user else ""
            for owner, code, message in (
                (username_owner, "duplicate_username", "Questo nome utente è già associato a un altro account."),
                (email_owner, "duplicate_email", "Questa e-mail è già associata a un altro account."),
            ):
                if owner and str(owner.get("id", "") or "") != allowed_existing_id:
                    raise AuthError(message, code, 409)

            salt = secrets.token_bytes(16)
            now = utc_now()
            if profile_user:
                user = dict(profile_user)
                user_id = str(profile_user.get("id", "") or "") or ("user_" + secrets.token_hex(16))
                created_at = profile_user.get("createdAt", now)
                access_level = profile_user.get("accessLevel", activation.get("accessLevel", "viewer"))
                capabilities = dict(profile_user.get("capabilities") or activation.get("capabilities") or self._default_capabilities(access_level))
                profile_permissions = dict(profile_user.get("profilePermissions") or activation.get("profilePermissions") or {})
            else:
                user = {}
                user_id = "user_" + secrets.token_hex(16)
                created_at = now
                access_level = activation.get("accessLevel", "viewer")
                capabilities = dict(activation.get("capabilities") or self._default_capabilities(access_level))
                profile_permissions = dict(activation.get("profilePermissions") or {})

            if profile_id:
                profile_permissions[profile_id] = "edit"

            user.update({
                "id": user_id,
                "displayName": display_name,
                "username": username,
                "usernameKey": username_key,
                "email": email,
                "role": "member",
                "credentialOwnership": "personal",
                "active": True,
                "pendingAssociation": False,
                "profilePermissions": profile_permissions,
                "accessLevel": access_level,
                "capabilities": capabilities,
                "linkedProfileId": profile_id,
                "passwordSalt": _b64(salt),
                "passwordHash": _b64(_hash_password(password, salt)),
                "passwordIterations": PBKDF2_ITERATIONS,
                "clientSalt": _b64(secrets.token_bytes(16)),
                "mfaEnabled": False,
                "recoveryCodeHashes": [],
                "failedAttempts": 0,
                "lockUntil": 0,
                "createdAt": created_at,
                "updatedAt": now,
            })
            user.pop("mfaSecretEnvelope", None)
            user.pop("mfaSecretProtected", None)
            user.pop("mfaReenrollRequired", None)
            self._set_recovery_question(user, payload.get("recoveryQuestion", ""), payload.get("recoveryAnswer", ""))

            if profile_user:
                data["users"][data["users"].index(profile_user)] = user
                event = "family-profile-account-repersonalized"
            else:
                data["users"].append(user)
                event = "family-new-member-created"

            activation["claimedByUserId"] = user["id"]
            activation["claimedAt"] = now
            self._save(data)
            token = self._new_session(user)
            self._audit(event, user["id"], {"activationId": activation_id, "profileId": profile_id})
            return {"token": token, "user": self._public_user(user), "clientSalt": user["clientSalt"]}

    def link_own_family_profile(self, token: str, profile_id: str) -> dict[str, Any]:
        current = self.require_session(token)
        profile_id = str(profile_id or "").strip()
        if not profile_id:
            raise AuthError("Profilo non valido", "invalid_profile")
        if self._access_level(current) == "administrator":
            raise AuthError("L'amministratore gestisce i profili dalla normale area Profili", "invalid_profile_link", 409)
        with self.lock:
            data = self._load()
            user = self._find_id(data, current["id"])
            if not user:
                raise AuthError("Account non disponibile", "not_found", 404)
            existing = str(user.get("linkedProfileId", "") or "")
            if existing and existing != profile_id:
                raise AuthError("Il tuo account è già collegato a un profilo sanitario", "profile_already_linked", 409)
            user["linkedProfileId"] = profile_id
            user["profilePermissions"] = {**dict(user.get("profilePermissions") or {}), profile_id: "edit"}
            user["updatedAt"] = utc_now()
            self._save(data)
            self._audit("family-self-profile-linked", user["id"], {"profileId": profile_id})
            return {"user": self._public_user(user)}

    def list_temporary_family_accesses(self, token: str) -> list[dict[str, Any]]:
        self.require_session(token, administrator=True)
        with self.lock:
            data = self._load()
            now = time.time()
            changed = False
            out = []
            for row in data.get("temporaryFamilyAccesses") or []:
                if row.get("status") == "pending" and float(row.get("expiresAtEpoch") or 0) < now:
                    row["status"] = "expired"
                    changed = True
                out.append({k: v for k, v in row.items() if k not in {"temporaryPasswordSalt", "temporaryPasswordHash", "temporaryPasswordIterations"}})
            if changed:
                self._save(data)
            out.sort(key=lambda x: str(x.get("createdAt", "")), reverse=True)
            return out

    def finalize_temporary_family_access(self, token: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Import or update the definitive member credential record after MFA activation."""
        actor = self.require_session(token, administrator=True)
        activation_id = str(payload.get("activationId", "") or "").strip()
        account = payload.get("account") if isinstance(payload, dict) else None
        if not activation_id or not isinstance(account, dict):
            raise AuthError("Attivazione familiare incompleta", "invalid_family_activation")
        with self.lock:
            data = self._load()
            activation = next((x for x in data.get("temporaryFamilyAccesses") or [] if x.get("id") == activation_id), None)
            if not activation:
                raise AuthError("Accesso provvisorio non riconosciuto", "family_activation_not_found", 404)
            if activation.get("status") == "pending" and float(activation.get("expiresAtEpoch") or 0) < time.time():
                activation["status"] = "expired"; self._save(data)
                raise AuthError("L’accesso provvisorio è scaduto", "family_activation_expired", 410)
            user_id = str(account.get("id", "") or "").strip()
            username = str(account.get("username", "") or "").strip()
            username_key = normalize_username(account.get("usernameKey") or username)
            if not user_id or not username or not username_key:
                raise AuthError("Account personale definitivo non valido", "invalid_account")
            required = ("passwordSalt", "passwordHash", "clientSalt", "recoveryQuestion", "recoveryAnswerSalt", "recoveryAnswerHash")
            if any(not account.get(key) for key in required):
                raise AuthError("Credenziali personali definitive incomplete", "invalid_account")
            if not account.get("mfaEnabled") or not account.get("mfaSecretEnvelope"):
                raise AuthError("Configura il codice temporaneo personale prima di completare l’accesso familiare", "family_mfa_required", 409)

            if activation.get("generic"):
                email_key = normalize_email(account.get("email"))
                existing = self._find_id(data, user_id)
                if not existing:
                    existing = next((u for u in data["users"] if u.get("role") != "administrator" and (normalize_username(u.get("usernameKey") or u.get("username")) == username_key or (email_key and normalize_email(u.get("email")) == email_key))), None)
                if activation.get("status") == "completed" and str(activation.get("completedUserId", "") or "") not in {"", user_id, str(existing.get("id") if existing else "")}:
                    raise AuthError("Questo accesso provvisorio è già stato utilizzato", "family_activation_used", 409)
                incoming = dict(account)
                if existing:
                    preserved = {
                        "id": existing.get("id"), "role": existing.get("role", "member"),
                        "accessLevel": existing.get("accessLevel", "viewer"),
                        "profilePermissions": dict(existing.get("profilePermissions") or {}),
                        "capabilities": dict(existing.get("capabilities") or {}),
                        "linkedProfileId": str(existing.get("linkedProfileId", "") or ""),
                        "createdAt": existing.get("createdAt", incoming.get("createdAt", utc_now())),
                    }
                    requested_link = str(incoming.get("linkedProfileId", "") or "")
                    if not preserved["linkedProfileId"] and requested_link:
                        preserved["linkedProfileId"] = requested_link
                        preserved["profilePermissions"][requested_link] = "edit"
                    user = {**existing, **incoming, **preserved}
                    user["credentialOwnership"] = "personal"
                    user["active"] = True
                    user["pendingAssociation"] = False
                    user["failedAttempts"] = 0; user["lockUntil"] = 0; user["updatedAt"] = utc_now()
                    data["users"][data["users"].index(existing)] = user
                else:
                    user = dict(incoming)
                    user["role"] = "member"; user["credentialOwnership"] = "personal"; user["active"] = True; user["pendingAssociation"] = False
                    user["accessLevel"] = "viewer"; user["capabilities"] = self._default_capabilities("viewer")
                    link = str(incoming.get("linkedProfileId", "") or "")
                    user["linkedProfileId"] = link
                    user["profilePermissions"] = {link: "edit"} if link else {}
                    user["failedAttempts"] = 0; user["lockUntil"] = 0; user["updatedAt"] = utc_now()
                    data["users"].append(user)
                activation["status"] = "completed"
                activation["completedAt"] = activation.get("completedAt") or utc_now()
                activation["completedUserId"] = user["id"]
                self._save(data)
                self._audit("family-temporary-access-completed", user["id"], {"activationId": activation_id, "generic": True, "linkedProfileId": user.get("linkedProfileId", "")})
                return {"user": self._public_user(user), "activation": {k: v for k, v in activation.items() if not k.startswith("temporaryPassword") and k != "joinSecretHash"}}

            # Historical profile-bound activation retained for backward compatibility.
            if activation.get("status") == "completed":
                if str(activation.get("completedUserId", "") or "") != user_id:
                    raise AuthError("Questo accesso provvisorio è già stato utilizzato", "family_activation_used", 409)
                existing = self._find_id(data, user_id)
                if not existing:
                    raise AuthError("L’account familiare completato non è più disponibile", "family_account_missing", 409)
                return {"user": self._public_user(existing), "activation": {k: v for k, v in activation.items() if not k.startswith("temporaryPassword")}}
            if activation.get("status") != "pending":
                raise AuthError("Questo accesso provvisorio non è più utilizzabile", "family_activation_used", 409)
            for existing in data["users"]:
                if existing.get("role") == "administrator": continue
                same_profile = str(existing.get("linkedProfileId", "") or "") == str(activation.get("profileId", "") or "")
                same_username = normalize_username(existing.get("usernameKey") or existing.get("username")) == username_key
                if (same_profile or same_username) and existing.get("id") != user_id:
                    existing["active"] = False; existing["replacedByUserId"] = user_id; existing["updatedAt"] = utc_now()
            duplicate = next((u for u in data["users"] if u.get("id") == user_id), None)
            user = dict(account)
            user.update({"id": user_id, "username": username, "usernameKey": username_key, "displayName": str(account.get("displayName", "") or username).strip(), "role": "member", "credentialOwnership": "personal", "active": True, "pendingAssociation": False, "accessLevel": activation.get("accessLevel", "viewer"), "profilePermissions": dict(activation.get("profilePermissions") or {}), "capabilities": dict(activation.get("capabilities") or {}), "linkedProfileId": activation.get("profileId", ""), "failedAttempts": 0, "lockUntil": 0, "updatedAt": utc_now()})
            user.pop("mfaSecretProtected", None)
            if duplicate: data["users"][data["users"].index(duplicate)] = user
            else: data["users"].append(user)
            activation["status"] = "completed"; activation["completedAt"] = utc_now(); activation["completedUserId"] = user_id
            self._save(data)
            self._audit("family-temporary-access-completed", user_id, {"activationId": activation_id, "profileId": activation.get("profileId", "")})
            return {"user": self._public_user(user), "activation": {k: v for k, v in activation.items() if not k.startswith("temporaryPassword")}}

    def apply_membership(self, token: str, payload: dict[str, Any]) -> dict[str, Any]:
        current = self.require_session(token)
        grant_user = payload.get("user") if isinstance(payload, dict) else None
        if not isinstance(grant_user, dict):
            raise AuthError("Autorizzazione familiare non valida", "invalid_membership")
        if str(grant_user.get("id", "") or "") != str(current.get("id", "") or ""):
            raise AuthError("L'autorizzazione appartiene a un altro account", "membership_user_mismatch", 403)
        with self.lock:
            data = self._load()
            user = self._find_id(data, current["id"])
            user["role"] = "member"
            user["active"] = True
            user["pendingAssociation"] = False
            user["accessLevel"] = str(grant_user.get("accessLevel", "viewer") or "viewer")
            user["profilePermissions"] = self._sanitize_profile_permissions(
                grant_user.get("profilePermissions"), allow_edit=user["accessLevel"] == "editor"
            )
            user["capabilities"] = self._sanitize_capabilities(grant_user.get("capabilities"), user["accessLevel"])
            user["linkedProfileId"] = str(grant_user.get("linkedProfileId", "") or "")
            user["updatedAt"] = utc_now()
            self._save(data)
            self._audit("family-membership-applied", user["id"], {"profileId": user["linkedProfileId"]})
            return self._public_user(user)

    def login(self, username: str, password: str, otp: str = "", require_mfa: bool = True) -> dict[str, Any]:
        with self.lock:
            data = self._load()
            user = self._find(data, username)
            if not user or user.get("active") is False:
                raise AuthError("Nome utente o password non validi", "invalid_credentials", 401)
            now = time.time()
            if float(user.get("lockUntil") or 0) > now:
                remaining = max(1, int(float(user["lockUntil"]) - now))
                raise AuthError(f"Accesso sospeso temporaneamente. Riprova tra {remaining} secondi", "temporarily_locked", 429)
            if not _password_ok(user, password):
                failures = int(user.get("failedAttempts") or 0) + 1
                if failures >= MAX_FAILED_ATTEMPTS:
                    user["failedAttempts"] = 0
                    user["lockUntil"] = now + LOCK_SECONDS
                else:
                    user["failedAttempts"] = failures
                user["updatedAt"] = utc_now()
                self._save(data)
                self._audit("login-failed", user["id"], {"failures": failures})
                raise AuthError("Nome utente o password non validi", "invalid_credentials", 401)
            session_mfa_secret = ""
            session_mfa_verified_at = 0.0
            verified_with_totp = False
            requires_personalization = bool(self._access_level(user) != "administrator" and user.get("credentialOwnership") != "personal")
            if user.get("mfaEnabled") and not requires_personalization:
                verified = not require_mfa
                clean_recovery = re.sub(r"[^A-Z0-9]", "", str(otp or "").upper())
                if not require_mfa:
                    try:
                        envelope = str(user.get("mfaSecretEnvelope", "") or "")
                        legacy = str(user.get("mfaSecretProtected", "") or "")
                        if envelope:
                            session_mfa_secret = _portable_mfa_unprotect(envelope, password)
                        elif legacy:
                            session_mfa_secret = _dpapi_unprotect(legacy).decode("ascii")
                    except Exception:
                        session_mfa_secret = ""
                elif len(re.sub(r"\D", "", str(otp or ""))) == 6:
                    envelope = str(user.get("mfaSecretEnvelope", "") or "")
                    legacy = str(user.get("mfaSecretProtected", "") or "")
                    if envelope:
                        secret = _portable_mfa_unprotect(envelope, password)
                    elif legacy:
                        secret = _dpapi_unprotect(legacy).decode("ascii")
                    else:
                        raise AuthError("Configurazione del secondo fattore incompleta", "mfa_secret_missing", 500)
                    verified = _verify_totp(secret, otp)
                    if verified:
                        verified_with_totp = True
                        session_mfa_secret = secret
                        session_mfa_verified_at = time.time()
                    if verified and not envelope:
                        user["mfaSecretEnvelope"] = _portable_mfa_protect(secret, password)
                        user.pop("mfaSecretProtected", None)
                        data["version"] = max(3, int(data.get("version", 2) or 2))
                        self._audit("mfa-secret-migrated", user["id"], {"mode": "password-portable"})
                elif clean_recovery:
                    digest = _hash_recovery(clean_recovery)
                    hashes = list(user.get("recoveryCodeHashes") or [])
                    if digest in hashes:
                        hashes.remove(digest)
                        user["recoveryCodeHashes"] = hashes
                        verified = True
                        try:
                            envelope = str(user.get("mfaSecretEnvelope", "") or "")
                            legacy = str(user.get("mfaSecretProtected", "") or "")
                            if envelope:
                                session_mfa_secret = _portable_mfa_unprotect(envelope, password)
                            elif legacy:
                                session_mfa_secret = _dpapi_unprotect(legacy).decode("ascii")
                        except Exception:
                            session_mfa_secret = ""
                if not verified:
                    code = "mfa_required" if not otp else "invalid_otp"
                    message = "Inserisci il codice temporaneo o un codice di recupero" if not otp else "Codice temporaneo o codice di recupero non valido"
                    raise AuthError(message, code, 401)
            user["failedAttempts"] = 0
            user["lockUntil"] = 0
            user["lastLoginAt"] = utc_now()
            user["updatedAt"] = utc_now()
            self._save(data)
            token = self._new_session(
                user,
                mfa_secret=session_mfa_secret,
                mfa_verified_at=session_mfa_verified_at if verified_with_totp else 0.0,
            )
            self._audit("login", user["id"])
            return {"token": token, "user": self._public_user(user), "clientSalt": user["clientSalt"]}

    def logout(self, token: str) -> None:
        with self.lock:
            row = self.sessions.pop(str(token or ""), None)
            if row:
                self._audit("logout", row.get("userId", ""))

    def list_users(self, token: str) -> list[dict[str, Any]]:
        actor = self.require_session(token)
        if not (self._can_manage_users(actor) or self._can_manage_permissions(actor)):
            raise AuthError("Non sei autorizzato a gestire gli utenti o i permessi", "forbidden", 403)
        with self.lock:
            users = [self._public_user(u) for u in self._load()["users"]]
            rank = {"administrator": 0, "editor": 1, "viewer": 2}
            users.sort(key=lambda u: (rank.get(u.get("accessLevel", "viewer"), 9), str(u.get("displayName", "")).casefold(), str(u.get("username", "")).casefold()))
            return users


    def health_access_status(self, token: str) -> dict[str, Any]:
        current = self.require_session(token)
        profile_id = str(current.get("linkedProfileId", "") or "").strip()
        if not profile_id:
            return {"profileId": "", "users": []}
        with self.lock:
            data = self._load()
            owner = self._find_id(data, current["id"])
            users = []
            for target in data.get("users") or []:
                if target.get("active") is False or str(target.get("id") or "") == str(owner.get("id") or ""):
                    continue
                grants = target.get("healthDataConsents") if isinstance(target.get("healthDataConsents"), dict) else {}
                row = grants.get(profile_id) if isinstance(grants, dict) else None
                granted = bool(isinstance(row, dict) and row.get("granted") and str(row.get("ownerUserId") or "") == str(owner.get("id") or ""))
                users.append({
                    "id": str(target.get("id") or ""),
                    "displayName": str(target.get("displayName") or target.get("username") or ""),
                    "username": str(target.get("username") or ""),
                    "granted": granted,
                })
            users.sort(key=lambda row: (str(row.get("displayName") or "").casefold(), str(row.get("username") or "").casefold()))
            return {"profileId": profile_id, "users": users}

    def update_health_access(self, token: str, payload: dict[str, Any]) -> dict[str, Any]:
        current = self.require_session(token)
        profile_id = str(current.get("linkedProfileId", "") or "").strip()
        if not profile_id:
            raise AuthError("Il tuo account non è collegato a un profilo sanitario", "health_profile_missing", 409)
        grants = payload.get("grants") if isinstance(payload, dict) else None
        if not isinstance(grants, list):
            raise AuthError("Autorizzazioni sanitarie non valide", "invalid_health_access")
        requested: dict[str, bool] = {}
        for item in grants:
            if not isinstance(item, dict):
                continue
            user_id = str(item.get("userId") or "").strip()
            if user_id and user_id != str(current.get("id") or ""):
                requested[user_id] = bool(item.get("granted"))
        with self.lock:
            data = self._load()
            owner = self._find_id(data, current["id"])
            if not owner:
                raise AuthError("Account non trovato", "not_found", 404)
            changed = []
            for target in data.get("users") or []:
                target_id = str(target.get("id") or "")
                if target_id not in requested or target.get("active") is False:
                    continue
                consents = target.get("healthDataConsents")
                if not isinstance(consents, dict):
                    consents = {}
                granted = requested[target_id]
                if granted:
                    consents[profile_id] = {
                        "granted": True,
                        "ownerUserId": str(owner.get("id") or ""),
                        "grantedAt": utc_now(),
                    }
                else:
                    consents.pop(profile_id, None)
                target["healthDataConsents"] = consents
                target["updatedAt"] = utc_now()
                changed.append({"userId": target_id, "granted": granted})
            owner["updatedAt"] = utc_now()
            self._save(data)
            for item in changed:
                self._audit("health-data-access-consent", owner["id"], {
                    "profileId": profile_id,
                    "targetUserId": item["userId"],
                    "granted": item["granted"],
                })
            return self.health_access_status(token)

    def get_warnings_status(self, token: str) -> dict[str, Any]:
        current = self.require_session(token)
        with self.lock:
            data = self._load()
            user = self._find_id(data, current["id"])
            accepted = dict(user.get("generalWarningsAcceptance") or {})
            return {"accepted": bool(accepted), **accepted}

    def accept_warnings(self, token: str, payload: dict[str, Any]) -> dict[str, Any]:
        current = self.require_session(token)
        version = str(payload.get("version", "")).strip()
        text = str(payload.get("text", "")).strip()
        device = str(payload.get("device", "")).strip()[:500]
        if not version or len(text) < 100:
            raise AuthError("Testo o versione delle avvertenze non validi", "invalid_warnings")
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        acceptance = {"accepted": True, "version": version, "acceptedAt": utc_now(), "textSha256": digest, "device": device}
        with self.lock:
            data = self._load(); user = self._find_id(data, current["id"])
            user["generalWarningsAcceptance"] = acceptance; user["updatedAt"] = utc_now(); self._save(data)
            self._audit("general-warnings-accepted", user["id"], {"version": version, "textSha256": digest, "device": device})
        return acceptance

    def get_preferences(self, token: str) -> dict[str, Any]:
        current = self.require_session(token)
        with self.lock:
            data = self._load()
            user = self._find_id(data, current["id"])
            raw = dict(user.get("securityPreferences") or {})
            try:
                timeout = int(raw.get("timeoutMinutes", 15) or 15)
            except (TypeError, ValueError):
                timeout = 15
            return {"timeoutMinutes": max(1, min(60, timeout)), "mfaRequiredForCloud": True}

    def update_preferences(self, token: str, payload: dict[str, Any]) -> dict[str, Any]:
        current = self.require_session(token)
        try:
            timeout = int(payload.get("timeoutMinutes", 15) or 15)
        except (TypeError, ValueError):
            raise AuthError("Tempo di blocco non valido", "invalid_timeout")
        if timeout < 1 or timeout > 60:
            raise AuthError("Il tempo di blocco deve essere compreso tra 1 e 60 minuti", "invalid_timeout")
        with self.lock:
            data = self._load()
            user = self._find_id(data, current["id"])
            user["securityPreferences"] = {"timeoutMinutes": timeout, "mfaRequiredForCloud": True}
            user["updatedAt"] = utc_now()
            self._save(data)
            self._audit("security-preferences-updated", user["id"], {"timeoutMinutes": timeout})
            return dict(user["securityPreferences"])

    def create_user(self, token: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self.require_session(token, administrator=True)
        display_name = str(payload.get("displayName", "")).strip()
        username = str(payload.get("username", "")).strip()
        password = str(payload.get("password", ""))
        access_level = str(payload.get("accessLevel", "viewer") or "viewer").strip().lower()
        if access_level not in {"editor", "viewer"}:
            access_level = "viewer"
        if not display_name or not username:
            raise AuthError("Compila nome e nome utente", "missing_fields")
        if len(password) < 10:
            raise AuthError("La password deve contenere almeno 10 caratteri", "weak_password")
        with self.lock:
            data = self._load()
            if self._find(data, username):
                raise AuthError("Questo nome utente esiste già", "duplicate_username", 409)
            salt = secrets.token_bytes(16)
            user = {
                "id": "user_" + secrets.token_hex(16),
                "displayName": display_name,
                "username": username,
                "usernameKey": normalize_username(username),
                "role": "member",
                "credentialOwnership": "administrator-created",
                "accessLevel": access_level,
                "active": True,
                "profilePermissions": self._sanitize_profile_permissions(payload.get("profilePermissions"), allow_edit=access_level == "editor"),
                "capabilities": self._sanitize_capabilities(payload.get("capabilities"), access_level),
                "linkedProfileId": str(payload.get("linkedProfileId", "") or "").strip(),
                "passwordSalt": _b64(salt),
                "passwordHash": _b64(_hash_password(password, salt)),
                "passwordIterations": PBKDF2_ITERATIONS,
                "clientSalt": _b64(secrets.token_bytes(16)),
                "mfaEnabled": False,
                "recoveryCodeHashes": [],
                "failedAttempts": 0,
                "lockUntil": 0,
                "createdAt": utc_now(),
                "updatedAt": utc_now(),
            }
            data["users"].append(user)
            self._save(data)
            self._audit("user-created", user["id"], {"actorUserId": actor["id"], "accessLevel": access_level})
            return self._public_user(user)

    def update_user(self, token: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self.require_session(token)
        actor_level = self._access_level(actor)
        if actor_level != "administrator" and not self._can_manage_permissions(actor):
            raise AuthError("Non sei autorizzato a modificare i permessi", "forbidden", 403)
        user_id = str(payload.get("id", ""))
        with self.lock:
            data = self._load()
            user = self._find_id(data, user_id)
            if not user:
                raise AuthError("Utente non trovato", "not_found", 404)
            target_level = self._access_level(user)
            if target_level == "administrator":
                raise AuthError("L’amministratore può essere modificato soltanto accedendo con le sue credenziali personali", "administrator_protected", 403)
            if actor_level != "administrator":
                if actor["id"] == user["id"]:
                    raise AuthError("Non puoi modificare i tuoi stessi privilegi", "self_escalation_blocked", 403)
                if target_level != "viewer":
                    raise AuthError("Un utente con funzioni di modifica può gestire soltanto utenti in consultazione", "target_level_forbidden", 403)
                requested_level = str(payload.get("accessLevel", "viewer") or "viewer").strip().lower()
                if requested_level != "viewer":
                    raise AuthError("Non puoi elevare il livello di un altro utente", "privilege_escalation_blocked", 403)
            else:
                requested_level = str(payload.get("accessLevel", target_level) or target_level).strip().lower()
                if requested_level not in {"editor", "viewer"}:
                    requested_level = target_level if target_level in {"editor", "viewer"} else "viewer"
                target_level = requested_level

            if payload.get("displayName") is not None:
                display_name = str(payload["displayName"]).strip()
                if not display_name:
                    raise AuthError("Il nome visualizzato non può essere vuoto", "missing_fields")
                user["displayName"] = display_name
            if payload.get("linkedProfileId") is not None:
                user["linkedProfileId"] = str(payload.get("linkedProfileId", "") or "").strip()
            if payload.get("active") is not None:
                user["active"] = bool(payload["active"])
            user["role"] = "member"
            user["accessLevel"] = target_level
            if isinstance(payload.get("profilePermissions"), dict):
                user["profilePermissions"] = self._sanitize_profile_permissions(
                    payload["profilePermissions"], allow_edit=target_level == "editor"
                )
            if isinstance(payload.get("capabilities"), dict):
                user["capabilities"] = self._sanitize_capabilities(payload["capabilities"], target_level)
            else:
                user["capabilities"] = self._sanitize_capabilities(user.get("capabilities"), target_level)
            user["updatedAt"] = utc_now()
            self._save(data)
            public = self._public_user(user)
            self._audit("user-updated", user["id"], {
                "actorUserId": actor["id"],
                "actorAccessLevel": actor_level,
                "accessLevel": public.get("accessLevel"),
                "active": public.get("active", True),
                "linkedProfileId": public.get("linkedProfileId", ""),
                "profilePermissions": public.get("profilePermissions", {}),
                "capabilities": public.get("capabilities", {}),
            })
            return public

    def export_backup(self, token: str) -> dict[str, Any]:
        actor = self.require_capability(token, "backup")
        with self.lock:
            data = self._load()
            try:
                audit = self.audit_file.read_text(encoding="utf-8") if self.audit_file.exists() else ""
            except OSError:
                audit = ""
            self._audit("security-backup-exported", actor["id"], {"users": len(data.get("users") or [])})
            return {
                "formatVersion": 1,
                "createdAt": utc_now(),
                "exportedBy": actor.get("id", ""),
                "usersStore": data,
                "authAudit": audit,
            }

    @staticmethod
    def _validate_backup_store(value: Any) -> dict[str, Any]:
        if not isinstance(value, dict) or not isinstance(value.get("users"), list):
            raise AuthError("Archivio utenti del backup non valido", "backup_users_invalid", 400)
        users = value.get("users") or []
        if not users:
            raise AuthError("Il backup non contiene utenti", "backup_users_empty", 400)
        ids: set[str] = set()
        usernames: set[str] = set()
        administrators = 0
        clean_users: list[dict[str, Any]] = []
        for raw in users:
            if not isinstance(raw, dict):
                raise AuthError("Record utente non valido nel backup", "backup_user_invalid", 400)
            user = dict(raw)
            user_id = str(user.get("id", "") or "").strip()
            username = str(user.get("username", "") or "").strip()
            username_key = normalize_username(user.get("usernameKey") or username)
            if not user_id or not username or not username_key:
                raise AuthError("Utente privo di identificativo o nome utente", "backup_user_invalid", 400)
            if user_id in ids or username_key in usernames:
                raise AuthError("Il backup contiene utenti duplicati", "backup_user_duplicate", 400)
            if not user.get("passwordSalt") or not user.get("passwordHash"):
                raise AuthError("Il backup contiene credenziali incomplete", "backup_credentials_missing", 400)
            ids.add(user_id)
            usernames.add(username_key)
            user["usernameKey"] = username_key
            if user.get("role") == "administrator":
                administrators += 1
            clean_users.append(user)
        if administrators != 1:
            raise AuthError("Il backup deve contenere un solo amministratore", "backup_admin_invalid", 400)
        version = int(value.get("version", 2) or 2)
        clean_store = {"version": max(6, version), "users": clean_users}
        invitations = value.get("invitations") if isinstance(value.get("invitations"), list) else []
        temporary = value.get("temporaryFamilyAccesses") if isinstance(value.get("temporaryFamilyAccesses"), list) else []
        clean_store["invitations"] = [dict(x) for x in invitations if isinstance(x, dict)][-200:]
        clean_store["temporaryFamilyAccesses"] = [dict(x) for x in temporary if isinstance(x, dict)][-200:]
        return clean_store

    def restore_family_bootstrap(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Load the authenticated family security store before family login.

        This may replace stale local authentication state left by prior installations,
        but only when the family package contains the matching pending activation and
        join-secret proof. The previous local account store is preserved first.
        Clinical data is not touched here.
        """
        bundle = payload.get("bundle") if isinstance(payload, dict) else None
        if not isinstance(bundle, dict):
            raise AuthError("Pacchetto familiare non valido", "family_bootstrap_invalid", 400)
        activation_id = str(payload.get("activationId", "") or "").strip()
        join_secret = str(payload.get("joinSecret", "") or "").strip()
        if not activation_id or not join_secret:
            raise AuthError("Autorizzazione familiare incompleta", "family_bootstrap_invalid", 400)
        store = self._validate_backup_store(bundle.get("usersStore"))
        activation = next(
            (x for x in store.get("temporaryFamilyAccesses") or [] if str(x.get("id", "") or "") == activation_id),
            None,
        )
        if not activation:
            raise AuthError("Accesso familiare non riconosciuto", "family_activation_not_found", 404)
        if activation.get("status") != "pending" or float(activation.get("expiresAtEpoch") or 0) < time.time():
            raise AuthError("Questo accesso familiare non è più utilizzabile", "family_activation_expired", 410)
        expected = str(activation.get("joinSecretHash", "") or "")
        actual = hashlib.sha256(join_secret.encode("utf-8")).hexdigest()
        if not expected or not hmac.compare_digest(expected, actual):
            raise AuthError("Accesso familiare non valido", "invalid_family_activation", 403)

        with self.lock:
            previous = self._load()
            safety_copy = ""
            if previous.get("users") or previous.get("temporaryFamilyAccesses"):
                backup_path = self.root / f"users_before_family_join_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                try:
                    backup_path.write_text(json.dumps(previous, ensure_ascii=False, indent=2), encoding="utf-8")
                    safety_copy = str(backup_path)
                except OSError as exc:
                    raise AuthError(
                        f"Impossibile creare la copia di sicurezza dell'accesso locale precedente: {exc}",
                        "family_bootstrap_safety_copy_failed",
                        500,
                    )
            self._repair_machine_bound_mfa(store)
            self._save(store)
            self.sessions.clear()
            self.pending_mfa.clear()
            self._audit("family-security-bootstrap-restored", "", {
                "users": len(store["users"]),
                "activationId": activation_id,
                "replacedLocalUsers": len(previous.get("users") or []),
                "safetyCopy": safety_copy,
            })
            return {
                "users": [self._public_user(u) for u in store["users"] if u.get("active") is not False],
                "restored": True,
                "safetyCopy": safety_copy,
            }

    def restore_backup_uninitialized(self, payload: dict[str, Any]) -> dict[str, Any]:
        bundle = payload.get("bundle") if isinstance(payload, dict) else None
        if not isinstance(bundle, dict):
            bundle = payload if isinstance(payload, dict) else {}
        store = self._validate_backup_store(bundle.get("usersStore"))
        audit = str(bundle.get("authAudit", "") or "")
        with self.lock:
            current = self._load()
            if current.get("users"):
                raise AuthError("L'archivio locale è già configurato", "already_initialized", 409)
            self._repair_machine_bound_mfa(store)
            self._save(store)
            if audit:
                try:
                    self.audit_file.write_text(audit, encoding="utf-8")
                except OSError:
                    pass
            self.sessions.clear()
            self.pending_mfa.clear()
            self._audit("security-backup-restored-first-run", "", {"users": len(store["users"])})
            return {
                "users": [self._public_user(u) for u in store["users"] if u.get("active") is not False],
                "administrators": 1,
                "restored": True,
            }

    def validate_backup(self, token: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.require_session(token, administrator=True)
        bundle = payload.get("bundle") if isinstance(payload, dict) else None
        if not isinstance(bundle, dict):
            bundle = payload if isinstance(payload, dict) else {}
        store = self._validate_backup_store(bundle.get("usersStore"))
        return {"users": len(store["users"]), "administrators": 1, "valid": True}

    def restore_backup(self, token: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self.require_session(token, administrator=True)
        bundle = payload.get("bundle") if isinstance(payload, dict) else None
        if not isinstance(bundle, dict):
            bundle = payload if isinstance(payload, dict) else {}
        store = self._validate_backup_store(bundle.get("usersStore"))
        audit = str(bundle.get("authAudit", "") or "")
        with self.lock:
            previous = self._load()
            backup_path = self.root / f"users_before_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            try:
                backup_path.write_text(json.dumps(previous, ensure_ascii=False, indent=2), encoding="utf-8")
            except OSError as exc:
                raise AuthError(f"Impossibile creare la copia di sicurezza degli utenti: {exc}", "backup_security_copy_failed", 500)
            self._save(store)
            if audit:
                try:
                    self.audit_file.write_text(audit, encoding="utf-8")
                except OSError:
                    pass
            self._audit("security-backup-restored", actor.get("id", ""), {
                "users": len(store["users"]),
                "previousUsers": len(previous.get("users") or []),
                "safetyCopy": str(backup_path),
            })
            self.sessions.clear()
            self.pending_mfa.clear()
            return {
                "users": len(store["users"]),
                "administrators": 1,
                "safetyCopy": str(backup_path),
                "reloginRequired": True,
            }

    def personalize_legacy_credentials(self, token: str, old_password: str, new_password: str, recovery_question: str, recovery_answer: str) -> dict[str, Any]:
        """Transfer an administrator-created legacy member account to the adult who owns it.

        The old password is used only to prove control of the existing account. The definitive
        password and recovery answer are chosen by the member. Any legacy MFA secret is removed:
        when a cloud archive is active the client immediately requires a fresh personal TOTP
        before clinical data are opened.
        """
        current = self.require_session(token)
        if self._access_level(current) == "administrator":
            raise AuthError("L'account amministratore è già personale", "administrator_not_legacy", 409)
        if len(str(new_password or "")) < 10:
            raise AuthError("La nuova password deve contenere almeno 10 caratteri", "weak_password")
        with self.lock:
            data = self._load()
            user = self._find_id(data, current["id"])
            if not user or not _password_ok(user, old_password):
                raise AuthError("La password attuale non è corretta", "invalid_credentials", 401)
            if user.get("credentialOwnership") == "personal":
                raise AuthError("Le credenziali di questo account sono già personali", "already_personal", 409)
            new_salt = secrets.token_bytes(16)
            user["passwordSalt"] = _b64(new_salt)
            user["passwordHash"] = _b64(_hash_password(new_password, new_salt))
            user["passwordIterations"] = PBKDF2_ITERATIONS
            user["clientSalt"] = _b64(secrets.token_bytes(16))
            self._set_recovery_question(user, recovery_question, recovery_answer)
            user["credentialOwnership"] = "personal"
            user["credentialsPersonalizedAt"] = utc_now()
            user["mfaEnabled"] = False
            user["mfaReenrollRequired"] = False
            user.pop("mfaSecretEnvelope", None)
            user.pop("mfaSecretProtected", None)
            user["recoveryCodeHashes"] = []
            user["updatedAt"] = utc_now()
            self._save(data)
            self._audit("legacy-credentials-personalized", user["id"], {"owner": "member"})
            return {"user": self._public_user(user), "clientSalt": user["clientSalt"]}

    def register_profile_migration_export(self, token: str, profile_id: str, package_sha256: str, receipt_challenge_sha256: str) -> dict[str, Any]:
        current = self.require_session(token)
        if self._access_level(current) == "administrator":
            raise AuthError("La migrazione personale deve essere registrata dall'adulto titolare del profilo", "subject_required", 403)
        profile_id = str(profile_id or "").strip()
        if not profile_id or str(current.get("linkedProfileId", "") or "") != profile_id:
            raise AuthError("Puoi registrare soltanto la migrazione del tuo profilo personale", "profile_mismatch", 403)
        package_sha256 = str(package_sha256 or "").strip().lower()
        challenge = str(receipt_challenge_sha256 or "").strip().lower()
        for value, code, label in ((package_sha256, "invalid_migration_hash", "Impronta del pacchetto"), (challenge, "invalid_receipt_challenge", "Impronta di verifica")):
            if len(value) != 64 or any(ch not in "0123456789abcdef" for ch in value):
                raise AuthError(f"{label} non valida", code)
        with self.lock:
            data = self._load()
            user = self._find_id(data, current["id"])
            if not user:
                raise AuthError("Account non disponibile", "account_missing", 404)
            row = {
                "profileId": profile_id,
                "packageSha256": package_sha256,
                "receiptChallengeSha256": challenge,
                "exportedAt": utc_now(),
            }
            user["profileMigrationExport"] = row
            user.pop("profileDepartureAuthorization", None)
            user["updatedAt"] = utc_now()
            self._save(data)
            self._audit("profile-migration-exported", user["id"], {"profileId": profile_id, "packageSha256": package_sha256})
            return {"registered": True, "migration": row}

    @staticmethod
    def _verify_profile_migration_receipt(receipt: dict[str, Any], export: dict[str, Any], profile_id: str) -> dict[str, Any]:
        if not isinstance(receipt, dict) or receipt.get("format") != "profile-migration-receipt" or int(receipt.get("formatVersion") or 0) != 1:
            raise AuthError("Ricevuta di migrazione non riconosciuta", "invalid_migration_receipt")
        package_sha256 = str(receipt.get("packageSha256") or "").strip().lower()
        if package_sha256 != str(export.get("packageSha256") or "").strip().lower():
            raise AuthError("La ricevuta non appartiene al pacchetto esportato da questo Dossier", "receipt_package_mismatch", 409)
        source_profile_id = str(receipt.get("sourceProfileId") or "").strip()
        if source_profile_id != profile_id:
            raise AuthError("La ricevuta appartiene a un altro profilo", "receipt_profile_mismatch", 409)
        secret_text = str(receipt.get("receiptSecret") or "").strip()
        try:
            secret = _unb64(secret_text)
        except Exception as exc:
            raise AuthError("Ricevuta di migrazione danneggiata", "invalid_migration_receipt") from exc
        if len(secret) != 32:
            raise AuthError("Ricevuta di migrazione danneggiata", "invalid_migration_receipt")
        challenge = hashlib.sha256(secret).hexdigest()
        if not hmac.compare_digest(challenge, str(export.get("receiptChallengeSha256") or "").strip().lower()):
            raise AuthError("La ricevuta non dimostra l'apertura del pacchetto originale", "receipt_challenge_mismatch", 409)
        receipt_id = str(receipt.get("receiptId") or "").strip()
        imported_profile_id = str(receipt.get("importedProfileId") or "").strip()
        imported_at = str(receipt.get("importedAt") or "").strip()
        try:
            verified_rows = int(receipt.get("verifiedRows") or 0)
        except Exception:
            verified_rows = 0
        if not receipt_id or not imported_profile_id or not imported_at or verified_rows <= 0:
            raise AuthError("La ricevuta non contiene una verifica completa dell'importazione", "incomplete_migration_receipt", 409)
        message = f"CDMR1|{receipt_id}|{package_sha256}|{source_profile_id}|{imported_profile_id}|{imported_at}|{verified_rows}".encode("utf-8")
        expected = hmac.new(secret, message, hashlib.sha256).hexdigest()
        actual = str(receipt.get("proof") or "").strip().lower()
        if not actual or not hmac.compare_digest(expected, actual):
            raise AuthError("Firma tecnica della ricevuta non valida", "invalid_migration_receipt_proof", 409)
        return {
            "receiptId": receipt_id,
            "packageSha256": package_sha256,
            "sourceProfileId": source_profile_id,
            "importedProfileId": imported_profile_id,
            "importedAt": imported_at,
            "verifiedRows": verified_rows,
            "verifiedAt": utc_now(),
        }

    def authorize_profile_departure(self, token: str, profile_id: str, password: str, package_sha256: str = "", receipt: dict[str, Any] | None = None) -> dict[str, Any]:
        """Record the adult subject's explicit authorization for later removal from the origin family dossier.

        Export and deletion authorization are deliberately separate. This method never deletes data.
        """
        current = self.require_session(token)
        if self._access_level(current) == "administrator":
            raise AuthError("L'amministratore non può autorizzare la cancellazione al posto dell'interessato", "subject_required", 403)
        profile_id = str(profile_id or "").strip()
        if not profile_id or str(current.get("linkedProfileId", "") or "") != profile_id:
            raise AuthError("Puoi autorizzare soltanto la rimozione del tuo profilo personale", "profile_mismatch", 403)
        package_sha256 = str(package_sha256 or "").strip().lower()
        if package_sha256 and (len(package_sha256) != 64 or any(ch not in "0123456789abcdef" for ch in package_sha256)):
            raise AuthError("Impronta del pacchetto di migrazione non valida", "invalid_migration_hash")
        with self.lock:
            data = self._load()
            user = self._find_id(data, current["id"])
            if not user or not _password_ok(user, password):
                raise AuthError("La password personale non è corretta", "invalid_credentials", 401)
            export = dict(user.get("profileMigrationExport") or {})
            if not export or str(export.get("profileId") or "") != profile_id or str(export.get("packageSha256") or "").lower() != package_sha256:
                raise AuthError("Esportazione di migrazione non registrata o non corrispondente", "migration_export_not_registered", 409)
            verified_receipt = self._verify_profile_migration_receipt(receipt or {}, export, profile_id)
            authorization = {
                "profileId": profile_id,
                "authorizedAt": utc_now(),
                "authorizationId": secrets.token_urlsafe(24),
                "packageSha256": package_sha256,
                "receipt": verified_receipt,
            }
            user["profileDepartureAuthorization"] = authorization
            user["updatedAt"] = utc_now()
            self._save(data)
            self._audit("profile-departure-authorized", user["id"], {"profileId": profile_id, "packageSha256": package_sha256, "receiptId": verified_receipt.get("receiptId", "")})
            return {"authorized": True, "authorization": authorization, "user": self._public_user(user)}

    def change_password(self, token: str, old_password: str, new_password: str) -> dict[str, Any]:
        current = self.require_session(token)
        if len(str(new_password or "")) < 10:
            raise AuthError("La nuova password deve contenere almeno 10 caratteri", "weak_password")
        with self.lock:
            data = self._load()
            user = self._find_id(data, current["id"])
            if not _password_ok(user, old_password):
                raise AuthError("La password attuale non è corretta", "invalid_credentials", 401)
            mfa_secret = ""
            if user.get("mfaEnabled"):
                if user.get("mfaSecretEnvelope"):
                    mfa_secret = _portable_mfa_unprotect(user.get("mfaSecretEnvelope", ""), old_password)
                elif user.get("mfaSecretProtected"):
                    mfa_secret = _dpapi_unprotect(user.get("mfaSecretProtected", "")).decode("ascii")
            new_salt = secrets.token_bytes(16)
            user["passwordSalt"] = _b64(new_salt)
            user["passwordHash"] = _b64(_hash_password(new_password, new_salt))
            user["clientSalt"] = _b64(secrets.token_bytes(16))
            if mfa_secret:
                user["mfaSecretEnvelope"] = _portable_mfa_protect(mfa_secret, new_password)
                user.pop("mfaSecretProtected", None)
                data["version"] = max(3, int(data.get("version", 2) or 2))
            user["updatedAt"] = utc_now()
            self._save(data)
            self._audit("password-changed", user["id"])
            return {"user": self._public_user(user), "clientSalt": user["clientSalt"]}

    def generate_recovery(self, token: str) -> list[str]:
        current = self.require_session(token)
        with self.lock:
            data = self._load()
            user = self._find_id(data, current["id"])
            codes = _recovery_codes()
            user["recoveryCodeHashes"] = [_hash_recovery(c) for c in codes]
            user["recoveryCodesCreatedAt"] = utc_now()
            user["updatedAt"] = utc_now()
            self._save(data)
            self._audit("recovery-generated", user["id"])
            return codes

    def recover(self, username: str, code: str, new_password: str) -> dict[str, Any]:
        if len(str(new_password or "")) < 10:
            raise AuthError("La password deve contenere almeno 10 caratteri", "weak_password")
        digest = _hash_recovery(code)
        with self.lock:
            data = self._load()
            user = self._find(data, username)
            if not user or digest not in (user.get("recoveryCodeHashes") or []):
                raise AuthError("Codice di recupero non valido", "invalid_recovery", 401)
            hashes = list(user.get("recoveryCodeHashes") or [])
            hashes.remove(digest)
            user["recoveryCodeHashes"] = hashes
            salt = secrets.token_bytes(16)
            user["passwordSalt"] = _b64(salt)
            user["passwordHash"] = _b64(_hash_password(new_password, salt))
            user["clientSalt"] = _b64(secrets.token_bytes(16))
            user["mfaEnabled"] = False
            user.pop("mfaSecretProtected", None)
            user.pop("mfaSecretEnvelope", None)
            user["failedAttempts"] = 0
            user["lockUntil"] = 0
            user["updatedAt"] = utc_now()
            self._save(data)
            token = self._new_session(user)
            self._audit("password-recovery", user["id"])
            return {"token": token, "user": self._public_user(user), "clientSalt": user["clientSalt"]}

    def recovery_question(self, email: str) -> dict[str, Any]:
        with self.lock:
            data = self._load()
            user = self._find_email(data, email)
            if not user or not user.get("recoveryQuestion") or not user.get("recoveryAnswerHash"):
                raise AuthError("Credenziali non riconosciute", "recovery_not_available", 404)
            lock_until = float(user.get("recoveryLockUntil") or 0)
            if lock_until > time.time():
                wait = max(1, int((lock_until - time.time() + 59) // 60))
                raise AuthError(f"Recupero temporaneamente bloccato. Riprova tra circa {wait} minuti", "recovery_locked", 429)
            return {"question": str(user.get("recoveryQuestion") or ""), "email": str(user.get("email") or "")}

    def recover_with_question(self, email: str, answer: str, new_password: str) -> dict[str, Any]:
        if len(str(new_password or "")) < 10:
            raise AuthError("La password deve contenere almeno 10 caratteri", "weak_password")
        with self.lock:
            data = self._load()
            user = self._find_email(data, email)
            if not user or not user.get("recoveryQuestion") or not user.get("recoveryAnswerHash"):
                raise AuthError("Credenziali non riconosciute", "recovery_not_available", 404)
            lock_until = float(user.get("recoveryLockUntil") or 0)
            if lock_until > time.time():
                wait = max(1, int((lock_until - time.time() + 59) // 60))
                raise AuthError(f"Recupero temporaneamente bloccato. Riprova tra circa {wait} minuti", "recovery_locked", 429)
            if not self._recovery_answer_ok(user, answer):
                attempts = int(user.get("recoveryFailedAttempts") or 0) + 1
                user["recoveryFailedAttempts"] = attempts
                if attempts >= MAX_FAILED_ATTEMPTS:
                    user["recoveryLockUntil"] = time.time() + RECOVERY_QUESTION_LOCK_SECONDS
                    user["recoveryFailedAttempts"] = 0
                self._save(data)
                self._audit("recovery-question-failed", user.get("id", ""), {"attempt": attempts})
                if attempts >= MAX_FAILED_ATTEMPTS:
                    raise AuthError("Troppi tentativi errati. Il recupero è temporaneamente bloccato", "recovery_locked", 429)
                raise AuthError("Risposta di recupero non corretta", "invalid_recovery_answer", 401)
            salt = secrets.token_bytes(16)
            user["passwordSalt"] = _b64(salt)
            user["passwordHash"] = _b64(_hash_password(new_password, salt))
            user["clientSalt"] = _b64(secrets.token_bytes(16))
            user["mfaEnabled"] = False
            user.pop("mfaSecretProtected", None)
            user.pop("mfaSecretEnvelope", None)
            user["failedAttempts"] = 0
            user["lockUntil"] = 0
            user["recoveryFailedAttempts"] = 0
            user["recoveryLockUntil"] = 0
            user["updatedAt"] = utc_now()
            self._save(data)
            token = self._new_session(user)
            self._audit("password-recovery-question", user["id"])
            return {"token": token, "user": self._public_user(user), "clientSalt": user["clientSalt"]}

    def update_recovery_question(self, token: str, password: str, question: str, answer: str) -> dict[str, Any]:
        current = self.require_session(token)
        with self.lock:
            data = self._load()
            user = self._find_id(data, current["id"])
            if not user or not _password_ok(user, password):
                raise AuthError("La password attuale non è corretta", "invalid_credentials", 401)
            self._set_recovery_question(user, question, answer)
            user["updatedAt"] = utc_now()
            self._save(data)
            self._audit("recovery-question-updated", user["id"])
            return {"user": self._public_user(user)}

    def mfa_start(self, token: str) -> dict[str, str]:
        user = self.require_session(token)
        secret = base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")
        nonce = secrets.token_urlsafe(24)
        self.pending_mfa[nonce] = {"userId": user["id"], "secret": secret, "expires": time.time() + 600}
        issuer = "Dossier Sanitario Locale"
        account = user.get("username", "utente")
        from urllib.parse import quote
        uri = f"otpauth://totp/{quote(issuer)}:{quote(account)}?secret={secret}&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period=30"
        return {"nonce": nonce, "secret": secret, "uri": uri}

    def mfa_confirm(self, token: str, nonce: str, otp: str, password: str) -> list[str]:
        user = self.require_session(token)
        pending = self.pending_mfa.get(str(nonce or ""))
        if not pending or pending["expires"] < time.time() or pending["userId"] != user["id"]:
            raise AuthError("Configurazione OTP scaduta. Ripeti la procedura", "mfa_setup_expired", 400)
        if not _verify_totp(pending["secret"], otp):
            raise AuthError("Il codice temporaneo non è valido", "invalid_otp", 401)
        with self.lock:
            data = self._load()
            stored = self._find_id(data, user["id"])
            if not stored or not _password_ok(stored, password):
                raise AuthError("La password del Dossier non è corretta", "invalid_credentials", 401)
            codes = _recovery_codes()
            stored["mfaEnabled"] = True
            stored["mfaSecretEnvelope"] = _portable_mfa_protect(pending["secret"], password)
            stored.pop("mfaSecretProtected", None)
            stored.pop("mfaReenrollRequired", None)
            data["version"] = max(3, int(data.get("version", 2) or 2))
            stored["recoveryCodeHashes"] = [_hash_recovery(c) for c in codes]
            stored["updatedAt"] = utc_now()
            self._save(data)
            self.pending_mfa.pop(str(nonce or ""), None)
            session_row = self.sessions.get(str(token or ""))
            if session_row is not None:
                session_row["mfaSecret"] = pending["secret"]
                session_row["mfaVerifiedAt"] = time.time()
            self._audit("mfa-enabled", stored["id"])
            return codes

    def verify_developer_mfa(self, token: str, otp: str = "") -> dict[str, Any]:
        user = self.require_session(token)
        if not user.get("mfaEnabled"):
            raise AuthError(
                "Per attivare la modalità sviluppatore devi prima attivare il codice temporaneo personale nelle impostazioni di sicurezza.",
                "developer_mfa_not_enabled",
                409,
            )
        now = time.time()
        with self.lock:
            row = self.sessions.get(str(token or ""))
            if not row:
                raise AuthError("Sessione non valida o scaduta", "session_expired", 401)
            verified_at = float(row.get("mfaVerifiedAt") or 0.0)
            age = now - verified_at if verified_at else 10**9
            if verified_at and age <= 300:
                return {
                    "verified": True,
                    "fresh": True,
                    "needsOtp": False,
                    "validForSeconds": max(0, int(300 - age)),
                }
            secret = str(row.get("mfaSecret") or "")
            if not secret:
                raise AuthError(
                    "La sessione non dispone del codice temporaneo verificabile. Effettua Logout, accedi nuovamente con il tuo Authenticator e riprova.",
                    "developer_mfa_session_unavailable",
                    409,
                )
            if not str(otp or "").strip():
                return {"verified": False, "fresh": False, "needsOtp": True, "validForSeconds": 0}
            if not _verify_totp(secret, otp):
                raise AuthError("Il codice temporaneo non è valido", "invalid_otp", 401)
            row["mfaVerifiedAt"] = now
            self._audit("developer-mfa-verified", user["id"])
            return {"verified": True, "fresh": False, "needsOtp": False, "validForSeconds": 300}

    def mfa_disable(self, token: str) -> list[str]:
        user = self.require_session(token)
        with self.lock:
            data = self._load()
            stored = self._find_id(data, user["id"])
            codes = _recovery_codes()
            stored["mfaEnabled"] = False
            stored.pop("mfaSecretProtected", None)
            stored.pop("mfaSecretEnvelope", None)
            stored["recoveryCodeHashes"] = [_hash_recovery(c) for c in codes]
            stored["updatedAt"] = utc_now()
            self._save(data)
            self._audit("mfa-disabled", stored["id"])
            return codes

    def reset_user_password(self, token: str, user_id: str, password: str) -> list[str]:
        self.require_session(token, administrator=True)
        if len(str(password or "")) < 10:
            raise AuthError("La password deve contenere almeno 10 caratteri", "weak_password")
        with self.lock:
            data = self._load()
            user = self._find_id(data, user_id)
            if not user:
                raise AuthError("Utente non trovato", "not_found", 404)
            salt = secrets.token_bytes(16)
            codes = _recovery_codes()
            user["passwordSalt"] = _b64(salt)
            user["passwordHash"] = _b64(_hash_password(password, salt))
            user["passwordIterations"] = PBKDF2_ITERATIONS
            user["clientSalt"] = _b64(secrets.token_bytes(16))
            user["mfaEnabled"] = False
            user.pop("mfaSecretProtected", None)
            user.pop("mfaSecretEnvelope", None)
            user["recoveryCodeHashes"] = [_hash_recovery(c) for c in codes]
            user["failedAttempts"] = 0
            user["lockUntil"] = 0
            user["updatedAt"] = utc_now()
            self._save(data)
            self._audit("admin-password-reset", user["id"])
            return codes
