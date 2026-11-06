from __future__ import annotations

import base64
import datetime as _dt
import hashlib
import hmac
import json
import os
import threading
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any

WORKER_URL = "https://clinica-digitale-licenze.dossiersanitario.workers.dev"
KEY_ID = "clinica-digitale-license-rsa-2026-01"
PUBLIC_KEY_PEM = """-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAq/OJ5yRuOGRz2Zwz8/3p
84qNJp1DUrXckaSM63jmHht0y3fR2R48ghAYika56K7FqAxrvWfviGNUISyI0nCz
zPf/Jv08eTATEMfYP4jbIDqiTIaCdjzarlNRicqcPG/ZOc8Ncpe2EQaKTRdqzeuG
JmZP9jQ86w75nHOapDrYb7uMu2TeZybOBPEFSoTo4jlb0KGbgarcTGPDsIS64wCG
R73tV3uUzwAzljRhv4ldOFt076uzmiJRK1ZzBp2f45WPZ3qtJnCJT967M3RwpGYw
uFnKAZU7caMXqPqo6GuPoyvjcH8+KzIpRPtx9OFND3sYCTMfG/skcHGuTxM2v0a9
hLetp50QRerumyvIiBswhVH9coyY5F+nuKFTaQXK+HnLrzT0CDAlLbJJTrkKGswz
Hv8VP+LLbud7iqSxaAY8RUz64R0NMH8gZMabGM/2iGhXXHCgpZ1h2z/Wr47lh25X
4rqzbZZbhKgs5m+/J+VkBf3u+xK7iRHvSXc+sOuLSUl1AgMBAAE=
-----END PUBLIC KEY-----"""
# The line above is validated at startup against the notarized fingerprint.
# Keep the fingerprint as an independent anti-tamper invariant.
PUBLIC_KEY_FINGERPRINT = "87303ade37c5be2f0dd9c0491aa5c70398dbb868bac598e115ebcefdec4dbc4a"
PLANS = ("FREE", "MEDIUM", "FULL")
PLAN_RANK = {"FREE": 0, "MEDIUM": 1, "FULL": 2}
DIGESTINFO_SHA256 = bytes.fromhex("3031300d060960864801650304020105000420")


def _b64url_decode(value: str) -> bytes:
    raw = str(value or "").encode("ascii")
    raw += b"=" * ((4 - len(raw) % 4) % 4)
    return base64.urlsafe_b64decode(raw)


def _utcnow() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def _parse_time(value: Any) -> _dt.datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        result = _dt.datetime.fromisoformat(text)
        if result.tzinfo is None:
            result = result.replace(tzinfo=_dt.timezone.utc)
        return result.astimezone(_dt.timezone.utc)
    except Exception:
        return None


def _read_len(data: bytes, offset: int) -> tuple[int, int]:
    first = data[offset]
    offset += 1
    if first < 0x80:
        return first, offset
    count = first & 0x7F
    if not count or count > 4:
        raise ValueError("DER length non valido")
    end = offset + count
    if end > len(data):
        raise ValueError("DER troncato")
    return int.from_bytes(data[offset:end], "big"), end


def _read_tlv(data: bytes, offset: int, expected: int | None = None) -> tuple[int, bytes, int]:
    if offset >= len(data):
        raise ValueError("DER troncato")
    tag = data[offset]
    offset += 1
    length, offset = _read_len(data, offset)
    end = offset + length
    if end > len(data):
        raise ValueError("DER troncato")
    if expected is not None and tag != expected:
        raise ValueError("DER inatteso")
    return tag, data[offset:end], end


def _rsa_public_numbers(pem: str = PUBLIC_KEY_PEM) -> tuple[int, int, bytes]:
    body = "".join(line.strip() for line in pem.splitlines() if "-----" not in line)
    der = base64.b64decode(body)
    if hashlib.sha256(der).hexdigest() != PUBLIC_KEY_FINGERPRINT:
        raise ValueError("Chiave pubblica licenze non valida")
    _, outer, _ = _read_tlv(der, 0, 0x30)
    _, _algorithm, offset = _read_tlv(outer, 0, 0x30)
    _, bit_string, _ = _read_tlv(outer, offset, 0x03)
    if not bit_string or bit_string[0] != 0:
        raise ValueError("Chiave RSA non valida")
    _, rsa_seq, _ = _read_tlv(bit_string[1:], 0, 0x30)
    _, n_raw, offset = _read_tlv(rsa_seq, 0, 0x02)
    _, e_raw, _ = _read_tlv(rsa_seq, offset, 0x02)
    return int.from_bytes(n_raw, "big"), int.from_bytes(e_raw, "big"), der


_RSA_N, _RSA_E, _PUBLIC_DER = _rsa_public_numbers()


def verify_signature(payload: bytes, signature: bytes) -> bool:
    try:
        k = (_RSA_N.bit_length() + 7) // 8
        if len(signature) != k:
            return False
        decoded = pow(int.from_bytes(signature, "big"), _RSA_E, _RSA_N).to_bytes(k, "big")
        digest = hashlib.sha256(payload).digest()
        trailer = DIGESTINFO_SHA256 + digest
        pad_len = k - len(trailer) - 3
        if pad_len < 8:
            return False
        expected = b"\x00\x01" + (b"\xff" * pad_len) + b"\x00" + trailer
        return hmac.compare_digest(decoded, expected)
    except Exception:
        return False


class LicenseManager:
    """Central license resolver for the local Windows engine.

    FREE is always the fail-safe state. MEDIUM/FULL are accepted only after a
    valid RSA signature whose dossierId matches the local Dossier identity.
    """

    def __init__(self, root: Path, auth_service: Any, worker_url: str = WORKER_URL):
        self.root = Path(root)
        self.cache_file = self.root / "entitlement_cache_v1.json"
        self.installation_id_file = self.root / "installation_id_v1.txt"
        self.auth = auth_service
        self.worker_url = str(worker_url).rstrip("/")
        self.lock = threading.RLock()
        self._memory_status: dict[str, Any] | None = None
        self._memory_until: _dt.datetime | None = None
        self._usage_reported = False

    def _identity_user(self) -> dict[str, Any] | None:
        try:
            users = list((self.auth.status() or {}).get("users") or [])
        except Exception:
            users = []
        active = [u for u in users if u.get("active") is not False and str(u.get("id") or "")]
        admins = [u for u in active if str(u.get("role") or "") == "administrator" or str(u.get("accessLevel") or "") == "administrator"]
        pool = admins or active
        if not pool:
            return None
        pool.sort(key=lambda u: (str(u.get("createdAt") or ""), str(u.get("id") or "")))
        return pool[0]

    def dossier_identity(self) -> dict[str, str]:
        user = self._identity_user()
        if not user:
            return {"dossierId": "", "accountEmail": "", "accountUserId": ""}
        user_id = str(user.get("id") or "").strip()
        digest = hashlib.sha256(("clinica-digitale-license-v1:" + user_id).encode("utf-8")).hexdigest().upper()
        return {
            "dossierId": "CD-" + digest[:32],
            "accountEmail": str(user.get("email") or "").strip(),
            "accountUserId": user_id,
        }

    def _read_cache(self) -> dict[str, Any]:
        try:
            data = json.loads(self.cache_file.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _write_cache(self, data: dict[str, Any] | None):
        self.root.mkdir(parents=True, exist_ok=True)
        if not data:
            try:
                self.cache_file.unlink(missing_ok=True)
            except Exception:
                pass
            return
        temp = self.cache_file.with_suffix(".tmp")
        temp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        os.replace(temp, self.cache_file)

    def _validated_token(self, token: dict[str, Any], expected_dossier_id: str) -> dict[str, Any]:
        if not isinstance(token, dict):
            raise ValueError("Token licenza mancante")
        if str(token.get("keyId") or "") != KEY_ID:
            raise ValueError("Chiave licenza non riconosciuta")
        payload_raw = _b64url_decode(str(token.get("payload") or ""))
        signature = _b64url_decode(str(token.get("signature") or ""))
        if not verify_signature(payload_raw, signature):
            raise ValueError("Firma licenza non valida")
        payload = json.loads(payload_raw.decode("utf-8"))
        if not isinstance(payload, dict) or int(payload.get("schema") or 0) != 1:
            raise ValueError("Formato licenza non valido")
        if str(payload.get("dossierId") or "") != expected_dossier_id:
            raise ValueError("Licenza riferita a un altro Dossier")
        plan = str(payload.get("plan") or "").upper()
        if plan not in PLANS:
            raise ValueError("Piano licenza non valido")
        now = _utcnow()
        not_after = _parse_time(payload.get("notAfter"))
        valid_until = _parse_time(payload.get("validUntil"))
        if not_after is None or not_after <= now:
            raise ValueError("Licenza offline scaduta")
        if valid_until is not None and valid_until <= now:
            raise ValueError("Licenza scaduta")
        return payload

    def _cache_status(self, identity: dict[str, str]) -> dict[str, Any] | None:
        data = self._read_cache()
        if str(data.get("dossierId") or "") != identity.get("dossierId"):
            return None
        try:
            payload = self._validated_token(data.get("token") or {}, identity["dossierId"])
        except Exception:
            return None
        return self._status_from_payload(identity, payload, data.get("entitlement") or {}, offline=True, cached=True, reason="cache_signed")

    def _status_from_payload(self, identity: dict[str, str], payload: dict[str, Any], entitlement: dict[str, Any], *, offline: bool, cached: bool, reason: str) -> dict[str, Any]:
        return {
            "ok": True,
            "plan": str(payload.get("plan") or "FREE").upper(),
            "dossierId": identity.get("dossierId", ""),
            "accountEmail": identity.get("accountEmail", ""),
            "licenseId": str(payload.get("licenseId") or entitlement.get("licenseId") or ""),
            "source": str(payload.get("source") or entitlement.get("source") or ""),
            "validUntil": str(payload.get("validUntil") or entitlement.get("validUntil") or ""),
            "issuedAt": str(payload.get("issuedAt") or ""),
            "refreshAfter": str(payload.get("refreshAfter") or ""),
            "notAfter": str(payload.get("notAfter") or ""),
            "offline": bool(offline),
            "cached": bool(cached),
            "reason": reason,
        }

    def _free_status(self, identity: dict[str, str], reason: str, *, offline: bool = False) -> dict[str, Any]:
        return {
            "ok": True,
            "plan": "FREE",
            "dossierId": identity.get("dossierId", ""),
            "accountEmail": identity.get("accountEmail", ""),
            "licenseId": "",
            "source": "",
            "validUntil": "",
            "issuedAt": "",
            "refreshAfter": "",
            "notAfter": "",
            "offline": bool(offline),
            "cached": False,
            "reason": reason,
        }

    def _installation_id(self) -> str:
        try:
            value = self.installation_id_file.read_text(encoding="utf-8").strip()
            if 8 <= len(value) <= 160 and all(ch.isalnum() or ch in "._:-" for ch in value):
                return value
        except Exception:
            pass
        value = str(uuid.uuid4())
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            temp = self.installation_id_file.with_suffix(".tmp")
            temp.write_text(value, encoding="utf-8")
            os.replace(temp, self.installation_id_file)
        except Exception:
            pass
        return value

    def _usage_ping_worker(self, identity: dict[str, str]):
        try:
            dossier_id = str(identity.get("dossierId") or "").strip()
            if not dossier_id:
                return
            body = json.dumps({
                "dossierId": dossier_id,
                "installationId": self._installation_id(),
                "appVersion": "1.0.1",
                "platform": "Windows",
            }, separators=(",", ":")).encode("utf-8")
            request = urllib.request.Request(
                self.worker_url + "/v1/usage/ping",
                data=body,
                headers={"Content-Type": "application/json", "User-Agent": "ClinicaDigitale-Windows/1.0.1"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=4.0) as response:
                response.read(4096)
        except Exception:
            # Le statistiche tecniche non devono mai bloccare avvio, licenza o uso offline.
            pass

    def _report_usage_once(self, identity: dict[str, str]):
        if self._usage_reported or not str(identity.get("dossierId") or "").strip():
            return
        self._usage_reported = True
        threading.Thread(
            target=self._usage_ping_worker,
            args=(dict(identity),),
            name="ClinicaDigitaleUsagePing",
            daemon=True,
        ).start()

    def _remote_resolve(self, dossier_id: str) -> dict[str, Any]:
        body = json.dumps({"dossierId": dossier_id}, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            self.worker_url + "/v1/license/resolve",
            data=body,
            headers={"Content-Type": "application/json", "User-Agent": "ClinicaDigitale-Windows/1.0.1"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=6.0) as response:
            raw = response.read(256 * 1024)
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict) or data.get("ok") is not True:
            raise RuntimeError("Risposta del servizio licenze non valida")
        return data

    def status(self, *, force: bool = False) -> dict[str, Any]:
        with self.lock:
            identity = self.dossier_identity()
            dossier_id = identity.get("dossierId", "")
            if dossier_id:
                self._report_usage_once(identity)
            if not force and self._memory_status and self._memory_until and self._memory_until > _utcnow() and self._memory_status.get("dossierId") == dossier_id:
                return dict(self._memory_status)
            if not dossier_id:
                self._write_cache(None)
                return self._free_status(identity, "account_not_initialized")

            cached = self._cache_status(identity)
            if cached and not force:
                refresh_after = _parse_time(cached.get("refreshAfter"))
                if refresh_after and refresh_after > _utcnow():
                    self._memory_status = dict(cached)
                    self._memory_until = refresh_after
                    return cached

            try:
                remote = self._remote_resolve(dossier_id)
                remote_plan = str(remote.get("plan") or "FREE").upper()
                if remote_plan == "FREE" or not remote.get("entitlement") or not remote.get("token"):
                    self._write_cache(None)
                    result = self._free_status(identity, "server_free")
                    self._memory_status = dict(result)
                    self._memory_until = _utcnow() + _dt.timedelta(hours=1)
                    return result
                payload = self._validated_token(remote.get("token") or {}, dossier_id)
                plan = str(payload.get("plan") or "FREE").upper()
                if remote_plan != plan:
                    raise ValueError("Piano licenza incoerente")
                cache = {"dossierId": dossier_id, "entitlement": remote.get("entitlement") or {}, "token": remote.get("token") or {}}
                self._write_cache(cache)
                result = self._status_from_payload(identity, payload, remote.get("entitlement") or {}, offline=False, cached=False, reason="server_signed")
                self._memory_status = dict(result)
                self._memory_until = _parse_time(result.get("refreshAfter")) or (_utcnow() + _dt.timedelta(hours=1))
                return result
            except Exception as exc:
                cached = self._cache_status(identity)
                if cached:
                    cached["offline"] = True
                    cached["cached"] = True
                    cached["reason"] = "offline_signed_cache"
                    cached["warning"] = "Servizio licenze non raggiungibile: uso temporaneo della licenza firmata già verificata."
                    self._memory_status = dict(cached)
                    self._memory_until = _utcnow() + _dt.timedelta(minutes=10)
                    return cached
                result = self._free_status(identity, "offline_no_valid_token", offline=True)
                result["warning"] = "Servizio licenze non raggiungibile: piano FREE applicato in sicurezza."
                result["detail"] = str(exc)[:200]
                self._memory_status = dict(result)
                self._memory_until = _utcnow() + _dt.timedelta(minutes=10)
                return result

    def has_plan(self, required: str) -> bool:
        required = str(required or "FREE").upper()
        current = str(self.status(force=False).get("plan") or "FREE").upper()
        return PLAN_RANK.get(current, 0) >= PLAN_RANK.get(required, 0)
