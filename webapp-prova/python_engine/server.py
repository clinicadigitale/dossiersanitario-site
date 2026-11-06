from __future__ import annotations

import argparse
import datetime
import base64
import hashlib
import html
import io
import queue
import secrets
import shutil
import urllib.request
import urllib.error
import zipfile
import importlib.util
import json
import mimetypes
import re
import os
import socket
import subprocess
import sys
sys.dont_write_bytecode = True
import tempfile
import threading
import time
import traceback
import urllib.parse
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
ROOT = ENGINE_DIR.parent
INSTALLER_VERIFY_MODE = "__installing__" in str(ROOT).lower()
engine_path = str(ENGINE_DIR)
if engine_path not in sys.path:
    sys.path.insert(0, engine_path)

from dossier_engine import analyze_path
from auth_service import AuthService, AuthError
from license_manager import LicenseManager, PLAN_RANK

HOST = "127.0.0.1"
WEB_PORT = 8895
API_PORT = 8896
VERSION = "6.0.4"
UI_VERSION = "1.0.1"

RCLONE_VERSION = "1.72.1"
RCLONE_URL = f"https://downloads.rclone.org/v{RCLONE_VERSION}/rclone-v{RCLONE_VERSION}-windows-amd64.zip"
RCLONE_SHA256 = "ab532febe55e4dd1229588a7ff1d22d76df390de729379da1e6d5c5ea5ae4c32"
LOCAL_APP_DATA = Path(os.environ.get("LOCALAPPDATA", ROOT / "runtime"))
APP_DATA_DIR = LOCAL_APP_DATA / "DossierSanitarioLocale"
BROWSER_PROFILE_DIR = APP_DATA_DIR / "BrowserProfile"
TEMP_ROOT = APP_DATA_DIR / "temp"
SESSION_TEMP_DIR = TEMP_ROOT / ("session_" + str(os.getpid()))
RUNTIME_STATE_DIR = APP_DATA_DIR / "runtime"
FIRST_USE_ACK_FILE = APP_DATA_DIR / "first_use_readme_ack.json"
DEVICE_CLOUD_STATE_FILE = APP_DATA_DIR / "device_cloud_state.json"
FIRST_USE_NOTICE_VERSION = "2026-08-22-first-use-v1"
CLOUD_DIR = APP_DATA_DIR / "cloud"
BACKUP_DIR = APP_DATA_DIR / "backup"
DATA_DIR = APP_DATA_DIR / "data"
DEFAULT_MEDIA_ARCHIVE_DIR = APP_DATA_DIR / "ArchivioLocale"
MEDIA_ARCHIVE_CONFIG_FILE = APP_DATA_DIR / "media_archive.json"
MEDIA_ARCHIVE_MARKER_NAME = ".clinica_digitale_media_archive.json"
SECURITY_DIR = APP_DATA_DIR / "security_v3"
AUTH = AuthService(SECURITY_DIR)
LICENSES = LicenseManager(APP_DATA_DIR / "license", AUTH)
RCLONE_EXE = CLOUD_DIR / "rclone.exe"
BUNDLED_RCLONE_EXE = ROOT / "runtime" / "rclone" / "rclone.exe"
RCLONE_CONFIG = CLOUD_DIR / "rclone.conf"
ALLOWED_ORIGINS = {f"http://{HOST}:{WEB_PORT}", f"http://localhost:{WEB_PORT}"}

def _license_required_for(path: str, method: str) -> str:
    path = str(path or "")
    method = str(method or "").upper()
    if path.startswith("/api/calendar/google/") or path.startswith("/api/cloud/") or path.startswith("/api/doctor-export/"):
        return "MEDIUM"
    if method == "GET" and path in {
        "/api/auth/account-export",
        "/api/auth/family-temporary",
        "/api/auth/users",
        "/api/auth/health-access",
    }:
        return "FULL"
    if method == "POST" and path in {
        "/api/auth/family-temporary/create",
        "/api/auth/family-temporary/join-new",
        "/api/auth/family-temporary/finalize",
        "/api/auth/family-self-profile",
        "/api/auth/membership/apply",
        "/api/auth/users/create",
        "/api/auth/users/update",
        "/api/auth/users/reset-password",
        "/api/auth/health-access",
        "/api/auth/profile-departure/authorize",
        "/api/auth/profile-migration/exported",
    }:
        return "FULL"
    return ""

def _license_gate_result(required: str) -> tuple[bool, dict]:
    required = str(required or "").upper()
    if not required:
        return True, {}
    status = LICENSES.status(force=False)
    current = str(status.get("plan") or "FREE").upper()
    if PLAN_RANK.get(current, 0) >= PLAN_RANK.get(required, 0):
        return True, status
    return False, {
        "ok": False,
        "error": f"Questa funzione richiede il piano {required}.",
        "code": "license_plan_required",
        "requiredPlan": required,
        "currentPlan": current,
        "dossierId": status.get("dossierId", ""),
    }

def _request_account_plan_gate(token: str) -> tuple[bool, dict]:
    """Invalidate effective use of an already-open secondary session after downgrade.

    The account record is never deleted. FREE and MEDIUM keep it stored but only the
    administrator may operate the Dossier; FULL re-enables secondary accounts.
    """
    token = str(token or "").strip()
    if not token:
        return True, {}
    try:
        user = AUTH.require_session(token)
    except AuthError:
        # Let the destination handler return the canonical session error.
        return True, {}
    if str(user.get("role") or "") == "administrator":
        return True, {}
    status = LICENSES.status(force=False)
    current = str(status.get("plan") or "FREE").upper()
    if PLAN_RANK.get(current, 0) >= PLAN_RANK.get("FULL", 2):
        return True, status
    try:
        AUTH.logout(token)
    except Exception:
        pass
    return False, {
        "ok": False,
        "error": "Gli account aggiuntivi sono disponibili nel piano FULL. I dati e le credenziali restano conservati.",
        "code": "license_plan_required",
        "requiredPlan": "FULL",
        "currentPlan": current,
        "dossierId": status.get("dossierId", ""),
    }

def _enforce_account_plan(result: dict) -> dict:
    """Only FULL may open a session for non-administrator accounts.

    Existing accounts and credentials remain stored. Downgrade never deletes them;
    it only prevents their use until FULL is restored.
    """
    if not isinstance(result, dict):
        return result
    user = result.get("user") or {}
    if str(user.get("role") or "") == "administrator":
        return result
    status = LICENSES.status(force=False)
    current = str(status.get("plan") or "FREE").upper()
    if PLAN_RANK.get(current, 0) >= PLAN_RANK.get("FULL", 2):
        return result
    token = str(result.get("token") or "")
    if token:
        try:
            AUTH.logout(token)
        except Exception:
            pass
    raise AuthError(
        "Gli account aggiuntivi sono disponibili nel piano FULL. I dati e le credenziali restano conservati.",
        "license_plan_required",
        403,
    )
RCLONE_CALL_LOCK = threading.Lock()
RCLONE_LAST_CALL = 0.0
RCLONE_MIN_INTERVAL = 0.35
RCLONE_CONFIG_ENCRYPTION_READY = False
RCLONE_VERSION_CACHE = ""
# R26: un solo processo rclone persistente per la sessione. L'API RC resta
# vincolata esclusivamente al loopback e protetta da credenziali casuali locali.
RCLONE_RC_HOST = "127.0.0.1"
RCLONE_RC_PORT = 0
RCLONE_RC_USER = "dossier"
RCLONE_RC_LOCK = threading.RLock()
RCLONE_RC_PROC = None
RCLONE_RC_PASSWORD = None
CLOUD_UPLOAD_JOBS = {}
CLOUD_UPLOAD_JOBS_LOCK = threading.RLock()
CLOUD_UPLOAD_JOB_TTL = 60 * 60
CLOUD_DOWNLOAD_JOBS = {}
CLOUD_DOWNLOAD_JOBS_LOCK = threading.RLock()
CLOUD_DOWNLOAD_JOB_TTL = 2 * 60 * 60
CLOUD_DOWNLOAD_MAX_CHUNK = 4 * 1024 * 1024
SERVER_STARTED_AT = time.monotonic()
ORIGINAL_SYSTEM_TEMP = Path(os.environ.get("TEMP") or os.environ.get("TMP") or tempfile.gettempdir())
APP_BROWSER_LOCK = threading.RLock()
APP_BROWSER_PROC = None

def _cleanup_legacy_system_temp_residues():
    patterns = ("dossier_python_*", "dossier_upload_*", "dossier_cloud_*", "dossier_py_*", "dossier_py_job_*")
    try:
        root = ORIGINAL_SYSTEM_TEMP
        if root.exists():
            for pattern in patterns:
                for child in root.glob(pattern):
                    try:
                        if child.is_dir(): shutil.rmtree(child, ignore_errors=True)
                        else: child.unlink(missing_ok=True)
                    except Exception: pass
        # Residui delle vecchie estrazioni R35: rimuovi esclusivamente cartelle
        # dal nome proprietario e mai la cartella da cui sta girando il Dossier.
        try:
            current_root = ROOT.resolve()
            for child in root.glob("ClinicaDigitale_Dossier_R35_*"):
                try:
                    resolved = child.resolve()
                    if resolved == current_root or resolved in current_root.parents:
                        continue
                    if child.is_dir():
                        shutil.rmtree(child, ignore_errors=True)
                except Exception:
                    pass
        except Exception:
            pass
        # Recupero dopo installazione interrotta/crash: sono directory con nome
        # proprietario, mai TEMP generico di Windows.
        shutil.rmtree(APP_DATA_DIR / "temp-install", ignore_errors=True)
        shutil.rmtree(APP_DATA_DIR / "document_previews", ignore_errors=True)
        updates_dir = APP_DATA_DIR / "updates"
        if updates_dir.exists():
            for child in updates_dir.glob("*.download"):
                try: child.unlink(missing_ok=True)
                except Exception: pass
    except Exception:
        pass



# Agenda locale + integrazione Google Calendar avanzata facoltativa.
# La modalita standard resta completamente locale e non richiede account esterni.
# L'OAuth avanzato e configurato esplicitamente dal singolo utente e le credenziali/token
# restano solo su questo dispositivo protetti con Windows DPAPI.
CALENDAR_DIR = APP_DATA_DIR / "calendar"
REMINDER_DATA_DIR = CALENDAR_DIR / "reminders"
REMINDER_MANIFEST_FILE = CALENDAR_DIR / "reminder_tasks.json"
REMINDER_GROUPS_FILE = CALENDAR_DIR / "reminder_groups_v2.json"
REMINDER_EXE = ROOT / "DossierPromemoria.exe"
REMINDER_LOCK = threading.Lock()
# Un solo task Windows per tutti i riordini farmaci. Il task viene riprogrammato
# alla prossima scadenza utile e non crea una voce per ogni avviso/farmaco.
MEDICATION_REMINDER_STATE_FILE = CALENDAR_DIR / "medication_reminder_state_v1.json"
MEDICATION_REMINDER_TASK_NAME = "DossierSanitarioLocale_MedicationReminder"
MEDICATION_REMINDER_LOCK = threading.RLock()
MEDICATION_REMINDER_SNOOZE_HOURS = 12
LEGACY_GOOGLE_FILES = (CALENDAR_DIR / "google_oauth.bin", CALENDAR_DIR / "google_token.bin")
GOOGLE_CALENDAR_SECRET_FILE = CALENDAR_DIR / "google_calendar_oauth_v2.dpapi"
GOOGLE_CALENDAR_LINKS_FILE = CALENDAR_DIR / "google_calendar_links_v2.json"
GOOGLE_CALENDAR_CONSENT_FILE = CALENDAR_DIR / "google_calendar_health_consent.json"
GOOGLE_CALENDAR_LEGACY_CLAIM_FILE = CALENDAR_DIR / "google_calendar_legacy_owner_v3.json"
GOOGLE_CALENDAR_CONTEXT = threading.local()
GOOGLE_CALENDAR_CONSENT_VERSION = "2026-08-25-v1"
GOOGLE_CALENDAR_MEDICATION_CONSENT_FILE = CALENDAR_DIR / "google_calendar_medication_consent.json"
GOOGLE_CALENDAR_MEDICATION_CONSENT_VERSION = "2026-08-25-v1"
GOOGLE_CALENDAR_LOCK = threading.RLock()
GOOGLE_OAUTH_PENDING = {}
GOOGLE_OAUTH_REDIRECT_URI = f"http://127.0.0.1:{API_PORT}"
GOOGLE_OAUTH_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned"
GOOGLE_OAUTH_DEFAULT_CLIENT_ID = "958066311310-7r6i03866ahqmqtketu05r4h319vs3b3.apps.googleusercontent.com"
GOOGLE_OAUTH_OFFICIAL_SECRET_XOR_B64 = "KiIuPj01QBo4DCsBXRwYBh8oNT4bVTkdJFUbLCw+AQZYOjs="


def _google_official_client_secret() -> str:
    raw = base64.b64decode(GOOGLE_OAUTH_OFFICIAL_SECRET_XOR_B64.encode("ascii"))
    return "".join(chr(b ^ 0x6D) for b in raw)


def _google_effective_client_secret(cfg: dict) -> str:
    configured = str((cfg or {}).get("clientSecret") or "").strip()
    if configured:
        return configured
    client_id = str((cfg or {}).get("clientId") or "").strip()
    if client_id == GOOGLE_OAUTH_DEFAULT_CLIENT_ID:
        return _google_official_client_secret()
    return ""
GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"


# FIX15 diagnostica: aggiornamenti e diagnostica tecnica.
UPDATE_CONFIG_FILE = ROOT / "update_config.json"
DIAGNOSTICS_CONFIG_FILE = ROOT / "diagnostics_config.json"
UPDATE_DIR = APP_DATA_DIR / "updates"
DIAGNOSTICS_DIR = APP_DATA_DIR / "diagnostics"
DIAGNOSTICS_INSTALLATION_FILE = DIAGNOSTICS_DIR / "installation.json"
UPDATE_TEST_MARKER = UPDATE_DIR / "update_test_applied.json"
UPDATE_STATE_LOCK = threading.Lock()
DIAGNOSTICS_STATE_LOCK = threading.RLock()
LAST_UPDATE_MANIFEST = {}

# BETA1 R30: anteprima locale dei documenti con nome originale preservato.
DOCUMENT_PREVIEW_DIR = SESSION_TEMP_DIR / "document_previews"
DOCUMENT_PREVIEWS = {}
DOCUMENT_PREVIEW_LOCK = threading.RLock()
DOCUMENT_PREVIEW_TTL = 20 * 60

# FIX18 PRE-BETA: esportazione "Versione per medico" gestita dal motore locale.
DOCTOR_EXPORT_SESSIONS = {}
DOCTOR_EXPORT_LOCK = threading.RLock()
DOCTOR_EXPORT_TTL_SECONDS = 2 * 60 * 60



def _rclone_section(name: str) -> str:
    """Export exactly one rclone remote for a family activation package.

    `rclone config show` intentionally redacts password fields as
    `*** ENCRYPTED ***`; that representation is not importable on another
    device. `config dump` returns the real config values (passwords remain
    rclone-obscured), which can safely travel only inside the already
    encrypted, short-lived family package.
    """
    safe = str(name or "").strip()
    if not safe or not safe.replace("_", "").replace("-", "").isalnum():
        raise ValueError("Nome connessione cloud non valido")
    if not RCLONE_CONFIG.exists():
        raise FileNotFoundError("Configurazione cloud non disponibile")
    result = run_rclone(["config", "dump"], timeout=30)
    try:
        all_remotes = json.loads(str(result.get("stdout") or "{}"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("Configurazione cloud non leggibile") from exc
    params = all_remotes.get(safe) if isinstance(all_remotes, dict) else None
    if not isinstance(params, dict) or not params:
        raise FileNotFoundError("Connessione cloud non trovata")
    provider = str(params.get("type") or "").strip()
    if provider not in {"mega", "drive", "iclouddrive"}:
        raise ValueError("Servizio cloud non supportato")
    lines = [f"[{safe}]"]
    for key, value in params.items():
        key = str(key or "").strip()
        if not key or not key.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Configurazione cloud non valida")
        if value is None:
            value = ""
        elif not isinstance(value, str):
            value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        value = str(value).replace("\r", "").replace("\n", "")
        if "\x00" in value:
            raise ValueError("Configurazione cloud non valida")
        lines.append(f"{key} = {value}")
    return "\n".join(lines) + "\n"


def _import_rclone_section(target_name: str, section_text: str) -> str:
    safe = str(target_name or "").strip()
    if not safe or not safe.replace("_", "").replace("-", "").isalnum():
        raise ValueError("Nome connessione cloud non valido")
    raw = str(section_text or "")
    if not raw or len(raw) > 128 * 1024 or "\x00" in raw:
        raise ValueError("Configurazione cloud non valida")
    match = re.fullmatch(r"(?ms)\s*\[([A-Za-z0-9_-]+)\]\s*\n(.*?)\s*", raw)
    if not match:
        raise ValueError("Sezione cloud non valida")
    body = match.group(2).strip()
    if re.search(r"(?m)^\s*\[", body):
        raise ValueError("La configurazione contiene più connessioni")
    params = {}
    for line in body.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith(";"):
            continue
        if "=" not in line:
            raise ValueError("Configurazione cloud non valida")
        key, value = line.split("=", 1)
        params[key.strip()] = value.strip()
    provider = str(params.pop("type", "") or "").strip()
    if provider not in {"mega", "drive", "iclouddrive"}:
        raise ValueError("Servizio cloud non supportato")
    existing = {line.strip().rstrip(":") for line in run_rclone(["listremotes"], timeout=30)["stdout"].splitlines() if line.strip()}
    args = ["config", "update" if safe in existing else "create", safe]
    if safe not in existing:
        args.append(provider)
    for key, value in params.items():
        args.extend([key, value])
    args.extend(["--non-interactive", "--no-obscure"])
    run_rclone(args, timeout=120)
    stop_rclone_rcd()
    return safe


def _windows_default_http_browser_executable() -> str:
    """Resolve the user's current default HTTP browser without changing associations."""
    if os.name != "nt":
        return ""
    try:
        import winreg
        user_choice = r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, user_choice) as key:
            prog_id = str(winreg.QueryValueEx(key, "ProgId")[0] or "").strip()
        if not prog_id:
            return ""
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, prog_id + r"\shell\open\command") as key:
            command = str(winreg.QueryValueEx(key, None)[0] or "").strip()
        command = os.path.expandvars(command)
        quoted = re.match(r'^\s*"([^"]+\.exe)"', command, flags=re.I)
        if quoted:
            candidate = quoted.group(1)
        else:
            plain = re.search(r'(?i)([A-Z]:\\.*?\.exe)(?:\s|$)', command)
            candidate = plain.group(1) if plain else ""
        if candidate and Path(candidate).is_file():
            return candidate
    except Exception:
        pass
    return ""


def _windows_dossier_browser_executable() -> str:
    """Return a Chromium executable for the isolated Clinica Digitale profile."""
    if os.name != "nt":
        return ""
    candidates = []
    local = Path(os.environ.get("LOCALAPPDATA", ""))
    pf = Path(os.environ.get("ProgramFiles", ""))
    pfx86 = Path(os.environ.get("ProgramFiles(x86)", ""))
    # BLOCK4 V2: Edge is no longer the primary app container. Prefer the user's
    # non-Edge Chromium engine but ALWAYS with Clinica Digitale's dedicated
    # --user-data-dir, so personal cookies/profiles are never touched.
    default = _windows_default_http_browser_executable()
    if default and Path(default).name.lower() in {"chrome.exe", "brave.exe", "vivaldi.exe"}:
        candidates.append(default)
    candidates.extend([
        str(local / "Google/Chrome/Application/chrome.exe"),
        str(pf / "Google/Chrome/Application/chrome.exe"),
        str(pfx86 / "Google/Chrome/Application/chrome.exe"),
        str(local / "Vivaldi/Application/vivaldi.exe"),
        str(local / "BraveSoftware/Brave-Browser/Application/brave.exe"),
        str(pf / "BraveSoftware/Brave-Browser/Application/brave.exe"),
        # Edge remains only as an emergency fallback on systems with no other
        # supported Chromium engine; it is never preferred over Chrome/Vivaldi/Brave.
        str(local / "Microsoft/Edge/Application/msedge.exe"),
        str(pfx86 / "Microsoft/Edge/Application/msedge.exe"),
        str(pf / "Microsoft/Edge/Application/msedge.exe"),
    ])
    seen = set()
    for candidate in candidates:
        candidate = str(candidate or "").strip()
        key = candidate.lower()
        if not candidate or key in seen:
            continue
        seen.add(key)
        try:
            if Path(candidate).is_file():
                return candidate
        except Exception:
            continue
    return ""


def _open_external_system_browser(url: str) -> bool:
    """Open an external authorization URL in the user's normal system browser.

    This is used only for external OAuth/consent pages. Clinica Digitale itself
    remains on its isolated BrowserProfile and never borrows the personal profile.
    """
    try:
        if os.name == "nt":
            os.startfile(url)
            return True
        return bool(webbrowser.open(url, new=1))
    except Exception:
        try:
            return bool(webbrowser.open(url, new=1))
        except Exception:
            return False


def _open_dossier_browser(url: str) -> bool:
    """Open the Dossier in an isolated app-owned Chromium profile.

    Clinical IndexedDB/localStorage are persisted under DossierSanitarioLocale\\BrowserProfile.
    The user's normal Chrome/Edge/Vivaldi profiles, cookies, logins and sessions are never used.
    """
    try:
        if os.name == "nt":
            browser_exe = _windows_dossier_browser_executable()
            if not browser_exe:
                raise RuntimeError("Browser applicativo compatibile non disponibile.")
            BROWSER_PROFILE_DIR.mkdir(parents=True, exist_ok=True)
            try:
                marker = BROWSER_PROFILE_DIR / "CLINICA_DIGITALE_DATI_BROWSER.txt"
                if not marker.exists():
                    marker.write_text(
                        "Cartella riservata a Clinica Digitale - Dossier Sanitario. Non contiene e non usa i profili personali del browser.\n",
                        encoding="utf-8",
                    )
            except Exception:
                pass
            creationflags = int(getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000))
            global APP_BROWSER_PROC
            proc = subprocess.Popen(
                [
                    browser_exe,
                    f"--app={url}",
                    f"--user-data-dir={BROWSER_PROFILE_DIR}",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-sync",
                    "--disable-background-mode",
                ],
                close_fds=True,
                creationflags=creationflags,
            )
            with APP_BROWSER_LOCK:
                APP_BROWSER_PROC = proc
            return True
        webbrowser.open(url, new=1)
        return True
    except Exception as exc:
        print(f"Apertura finestra applicativa non riuscita: {exc}", flush=True)
        return False

def _query_process_image(pid: int) -> str:
    if os.name != "nt" or pid <= 0:
        return ""
    try:
        import ctypes
        from ctypes import wintypes
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
        if not handle:
            return ""
        try:
            size = wintypes.DWORD(32768)
            buffer = ctypes.create_unicode_buffer(size.value)
            if ctypes.windll.kernel32.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size)):
                return buffer.value
            return ""
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    except Exception:
        return ""


def _recover_stale_dossier_process(pid_file: Path) -> bool:
    """Terminate only our bundled Python process when a stale PID blocks the ports."""
    if os.name != "nt" or not pid_file.exists():
        return False
    try:
        pid = int(pid_file.read_text(encoding="ascii", errors="ignore").strip() or "0")
    except Exception:
        return False
    image = _query_process_image(pid)
    if not image:
        try:
            pid_file.unlink(missing_ok=True)
        except Exception:
            pass
        return False
    allowed = {
        str((ROOT / "runtime" / "python" / "python.exe").resolve()).lower(),
        str((ROOT / "runtime" / "python" / "pythonw.exe").resolve()).lower(),
    }
    try:
        normalized = str(Path(image).resolve()).lower()
    except Exception:
        normalized = str(image).lower()
    if normalized not in allowed:
        return False
    try:
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, timeout=10, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if port_free(WEB_PORT) and port_free(API_PORT):
                pid_file.unlink(missing_ok=True)
                return True
            time.sleep(0.2)
    except Exception:
        return False
    return port_free(WEB_PORT) and port_free(API_PORT)


def _read_json_file(path: Path, default=None):
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value
    except Exception:
        return {} if default is None else default


def _write_json_atomic(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def _device_cloud_state():
    row = _read_json_file(DEVICE_CLOUD_STATE_FILE, {})
    return row if isinstance(row, dict) else {}

def _device_cloud_linked() -> bool:
    return bool(_device_cloud_state().get("linked") is True)

def _set_device_cloud_linked(linked: bool, archive_id: str = ""):
    _write_json_atomic(DEVICE_CLOUD_STATE_FILE, {
        "linked": bool(linked),
        "archiveId": str(archive_id or ""),
        "updatedAtEpoch": int(time.time()),
    })

def _version_parts(value: str):
    # Sufficiente per il flusso corrente: 1.0.0-beta.1 < 1.0.0 e 6.0.4-fix15.
    import re
    text = str(value or "0").strip().lower()
    main, _, pre = text.partition("-")
    nums = [int(x) for x in re.findall(r"\d+", main)[:3]]
    while len(nums) < 3:
        nums.append(0)
    pre_rank = 1 if not pre else 0
    pre_nums = [int(x) for x in re.findall(r"\d+", pre)]
    return tuple(nums[:3]) + (pre_rank, tuple(pre_nums), pre)


def _is_newer(candidate: str, current: str) -> bool:
    return _version_parts(candidate) > _version_parts(current)


def _load_update_config():
    cfg = _read_json_file(UPDATE_CONFIG_FILE, {})
    return cfg if isinstance(cfg, dict) else {}


def _load_diagnostics_config():
    cfg = _read_json_file(DIAGNOSTICS_CONFIG_FILE, {})
    return cfg if isinstance(cfg, dict) else {}


def _diagnostics_installation():
    with DIAGNOSTICS_STATE_LOCK:
        data = _read_json_file(DIAGNOSTICS_INSTALLATION_FILE, {})
        if not isinstance(data, dict) or not data.get("installationId"):
            # Le vecchie installazioni Beta usavano cartelle/ID TESTER-*. Non
            # contengono dati clinici e non devono sopravvivere come nomenclatura
            # runtime nella 1.0.0. Si riparte con un nuovo ID installazione e un
            # consenso diagnostico separato.
            try:
                if DIAGNOSTICS_DIR.exists():
                    for legacy in DIAGNOSTICS_DIR.glob("TESTER-*"):
                        if legacy.is_dir(): shutil.rmtree(legacy, ignore_errors=True)
            except Exception:
                pass
            data = {
                "installationId": "INSTALL-" + secrets.token_hex(5).upper(),
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "consents": {},
            }
            _write_json_atomic(DIAGNOSTICS_INSTALLATION_FILE, data)
        return data


def _diagnostics_consent_accepted(cfg=None, inst=None):
    cfg = cfg or _load_diagnostics_config()
    inst = inst or _diagnostics_installation()
    notice = str(cfg.get("noticeVersion") or "")
    return bool(notice and (inst.get("consents") or {}).get(notice, {}).get("accepted"))


def _diagnostics_sanitize_text(value: str) -> str:
    text = str(value or "")
    text = re.sub(r"(?i)(?:profili|profiles)[\\/]+[^\\/\s'\"]+", r"profili/<profilo>", text)
    text = re.sub(r"(?i)(?:cestino|documenti|documents)[\\/]+[^\\/\s'\"]+\.(?:pdf|jpe?g|png|tiff?)", r"documenti/<file_clinico>", text)
    text = re.sub(r"(?i)\b(?:trash|photo|scan|document)[_-][A-Za-z0-9_.-]{8,}\.(?:pdf|jpe?g|png|tiff?)\b", "<file_clinico>", text)
    text = re.sub(r"(?i)\bC:\\Users\\[^\\\s]+", r"C:\\Users\\<utente>", text)
    return text


def _diagnostics_sanitize_value(value):
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if str(key).casefold() == "description":
                continue
            out[key] = _diagnostics_sanitize_value(item)
        return out
    if isinstance(value, list):
        return [_diagnostics_sanitize_value(item) for item in value[:100]]
    if isinstance(value, str):
        return _diagnostics_sanitize_text(value)
    return value


def _diagnostics_sanitize_event(row: dict):
    return _diagnostics_sanitize_value(dict(row or {}))


def _diagnostics_recent_events(events_path: Path, current_version: str, limit: int = 200):
    if not events_path.exists():
        return []
    rows = []
    try:
        for line in events_path.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                row = json.loads(line)
                if isinstance(row, dict): rows.append(row)
            except Exception:
                continue
    except Exception:
        return []
    if not rows:
        return []
    start = 0
    # La segnalazione deve descrivere la sessione corrente, non tutta la storia
    # diagnostica accumulata nelle release precedenti.
    for idx in range(len(rows) - 1, -1, -1):
        row = rows[idx]
        if str(row.get("type") or "") == "session-start" and str(row.get("appVersion") or "") == str(current_version or ""):
            start = idx; break
    scoped = rows[start:][-limit:]
    return [_diagnostics_sanitize_event(row) for row in scoped]


def _diagnostics_record_event(event: dict):
    cfg = _load_diagnostics_config()
    if not cfg.get("active") or not (cfg.get("diagnostics") or {}).get("enabled"):
        return {"recorded": False}
    inst = _diagnostics_installation()
    if not _diagnostics_consent_accepted(cfg, inst):
        return {"recorded": False, "reason": "consent-not-accepted"}
    installation_id = str(inst.get("installationId") or "INSTALL")
    folder = DIAGNOSTICS_DIR / installation_id
    folder.mkdir(parents=True, exist_ok=True)
    row = {
        "receivedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "installationId": installation_id,
        "appVersion": _load_update_config().get("displayVersion", VERSION),
        **{k: v for k, v in (event or {}).items() if k in {"type", "message", "source", "line", "column", "stack", "view", "userAgent", "details"}},
    }
    row = _diagnostics_sanitize_event(row)
    with (folder / "events.ndjson").open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
    return {"recorded": True, "installationId": installation_id, "transport": (cfg.get("diagnostics") or {}).get("transport", "local-only")}


def _update_allowed_hosts(cfg: dict) -> set[str]:
    return {str(x or "").strip().lower() for x in (cfg.get("allowedHosts") or []) if str(x or "").strip()}


def _validate_update_url(url: str, cfg: dict, *, kind: str = "aggiornamento") -> str:
    text = str(url or "").strip()
    parsed = urllib.parse.urlparse(text)
    host = str(parsed.hostname or "").lower()
    allowed = _update_allowed_hosts(cfg)
    if parsed.scheme.lower() != "https" or not host:
        raise RuntimeError(f"URL {kind} non sicuro")
    if allowed and host not in allowed:
        raise RuntimeError(f"Host {kind} non autorizzato: {host}")
    return text


def _update_staged_info(version: str = "", sha256: str = "") -> dict:
    staged = _read_json_file(UPDATE_DIR / "staged.json", {})
    if not isinstance(staged, dict):
        return {"ready": False}
    path = Path(str(staged.get("path") or ""))
    if not path.is_file() or path.suffix.lower() != ".exe":
        return {"ready": False}
    if version and str(staged.get("version") or "") != str(version):
        return {"ready": False}
    expected = str(sha256 or staged.get("sha256") or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        return {"ready": False}
    try:
        size = int(path.stat().st_size)
    except OSError:
        return {"ready": False}
    if str(staged.get("sha256") or "").lower() != expected:
        return {"ready": False}
    staged_bytes = int(staged.get("bytes") or 0)
    if staged_bytes and size != staged_bytes:
        return {"ready": False}
    return {"ready": True, "path": str(path), "version": str(staged.get("version") or ""), "sha256": expected, "bytes": size}


def _update_environment_status() -> dict:
    """Return a conservative auto-download policy for the current Windows device.

    Portable devices require external power and an active Wi-Fi interface.
    A desktop with no battery is considered externally powered and may use its
    fixed network connection. The actual feed request still proves Internet
    reachability before any download starts.
    """
    has_battery = False
    powered = True
    ac_line = None
    if os.name == "nt":
        try:
            import ctypes
            class SYSTEM_POWER_STATUS(ctypes.Structure):
                _fields_ = [
                    ("ACLineStatus", ctypes.c_ubyte),
                    ("BatteryFlag", ctypes.c_ubyte),
                    ("BatteryLifePercent", ctypes.c_ubyte),
                    ("SystemStatusFlag", ctypes.c_ubyte),
                    ("BatteryLifeTime", ctypes.c_uint32),
                    ("BatteryFullLifeTime", ctypes.c_uint32),
                ]
            status = SYSTEM_POWER_STATUS()
            if ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(status)):
                ac_line = int(status.ACLineStatus)
                has_battery = not bool(int(status.BatteryFlag) & 128)
                powered = (not has_battery) or ac_line == 1
        except Exception:
            powered = True

    wifi_connected = False
    if os.name == "nt":
        try:
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            result = subprocess.run(
                ["netsh", "wlan", "show", "interfaces"],
                capture_output=True, text=True, encoding="utf-8", errors="replace",
                timeout=6, creationflags=flags
            )
            text = result.stdout or ""
            wifi_connected = bool(re.search(r"(?mi)^\s*SSID\s*:\s*\S.+$", text))
        except Exception:
            wifi_connected = False

    # Su un PC fisso senza batteria la rete cablata è equivalente a una rete
    # domestica stabile. Su portatili/tablet richiediamo invece Wi-Fi + alimentazione.
    eligible = bool(powered and (wifi_connected or not has_battery))
    return {
        "powered": bool(powered),
        "hasBattery": bool(has_battery),
        "acLineStatus": ac_line,
        "wifiConnected": bool(wifi_connected),
        "autoDownloadEligible": eligible,
        "policy": "wifi-and-power" if has_battery else "fixed-device-powered",
    }


def _fetch_update_manifest(cfg: dict):
    global LAST_UPDATE_MANIFEST
    current = str(cfg.get("currentVersion") or "1.0.1")
    store_managed = bool(cfg.get("storeManaged"))
    if store_managed:
        manifest = {
            "available": False, "currentVersion": current,
            "displayCurrentVersion": str(cfg.get("displayVersion") or current),
            "storeManaged": True, "channel": str(cfg.get("channel") or ""),
            "automaticUpdates": False,
        }
        with UPDATE_STATE_LOCK:
            LAST_UPDATE_MANIFEST = manifest
        return manifest

    if cfg.get("testMode"):
        test = dict(cfg.get("testManifest") or {})
        candidate = str(test.get("version") or "")
        manifest = {
            **test,
            "available": bool(candidate and _is_newer(candidate, current)),
            "currentVersion": current,
            "displayCurrentVersion": str(cfg.get("displayVersion") or current),
            "storeManaged": False,
            "channel": str(cfg.get("channel") or "beta"),
            "automaticUpdates": bool(cfg.get("automaticUpdates")),
        }
        with UPDATE_STATE_LOCK:
            LAST_UPDATE_MANIFEST = manifest
        return manifest

    feed_url = _validate_update_url(str(cfg.get("feedUrl") or ""), cfg, kind="feed")
    request = urllib.request.Request(feed_url, headers={
        "User-Agent": "ClinicaDigitale-Updater/1.0",
        "Accept": "application/json",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        final_url = str(response.geturl() or feed_url)
        _validate_update_url(final_url, cfg, kind="feed")
        raw = response.read(256 * 1024 + 1)
    if len(raw) > 256 * 1024:
        raise RuntimeError("Manifest aggiornamento troppo grande")
    try:
        remote = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise RuntimeError("Manifest aggiornamento non valido") from exc
    if not isinstance(remote, dict):
        raise RuntimeError("Manifest aggiornamento non valido")

    candidate = str(remote.get("version") or "").strip()
    download_url = str(remote.get("downloadUrl") or "").strip()
    digest = str(remote.get("sha256") or "").strip().lower()
    if not candidate:
        raise RuntimeError("Versione aggiornamento mancante")
    if download_url:
        _validate_update_url(download_url, cfg, kind="pacchetto")
    if download_url and not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise RuntimeError("Impronta SHA-256 dell'aggiornamento non valida")

    available = bool(_is_newer(candidate, current))
    staged = _update_staged_info(candidate, digest) if available and download_url else {"ready": False}
    manifest = {
        "available": available,
        "currentVersion": current,
        "displayCurrentVersion": str(cfg.get("displayVersion") or current),
        "storeManaged": False,
        "channel": str(remote.get("channel") or cfg.get("channel") or "beta"),
        "automaticUpdates": bool(cfg.get("automaticUpdates")),
        "version": candidate,
        "displayVersion": str(remote.get("displayVersion") or candidate),
        "releaseDate": str(remote.get("releaseDate") or ""),
        "required": bool(remote.get("required")),
        "releaseNotes": remote.get("releaseNotes") if isinstance(remote.get("releaseNotes"), list) else [],
        "downloadUrl": download_url if available else "",
        "sha256": digest if available else "",
        "size": int(remote.get("size") or 0),
        "stagedReady": bool(staged.get("ready")),
    }
    with UPDATE_STATE_LOCK:
        LAST_UPDATE_MANIFEST = manifest
    return manifest


def _download_update(manifest: dict, cfg: dict):
    version = str(manifest.get("version") or "").strip()
    url = _validate_update_url(str(manifest.get("downloadUrl") or ""), cfg, kind="pacchetto")
    expected = str(manifest.get("sha256") or "").strip().lower()
    if not version or not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise RuntimeError("Dati del pacchetto di aggiornamento incompleti")

    existing = _update_staged_info(version, expected)
    if existing.get("ready"):
        return {**existing, "reused": True}

    UPDATE_DIR.mkdir(parents=True, exist_ok=True)
    safe_version = re.sub(r"[^0-9A-Za-z._-]+", "_", version)[:80] or "update"
    destination = UPDATE_DIR / f"ClinicaDigitale_{safe_version}.exe"
    temp = destination.with_suffix(".download")
    temp.unlink(missing_ok=True)
    digest = hashlib.sha256()
    total = 0
    request = urllib.request.Request(url, headers={"User-Agent": "ClinicaDigitale-Updater/1.0", "Accept": "application/octet-stream"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response, temp.open("wb") as out:
            final_url = str(response.geturl() or url)
            _validate_update_url(final_url, cfg, kind="pacchetto")
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > 1024 * 1024 * 1024:
                    raise RuntimeError("Pacchetto di aggiornamento troppo grande")
                digest.update(chunk)
                out.write(chunk)
        actual = digest.hexdigest().lower()
        if actual != expected:
            raise RuntimeError("Integrità del pacchetto di aggiornamento non valida")
        os.replace(temp, destination)
        staged = {
            "path": str(destination), "version": version, "sha256": actual,
            "bytes": total, "downloadedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        _write_json_atomic(UPDATE_DIR / "staged.json", staged)
        return {"ready": True, **staged}
    except Exception:
        temp.unlink(missing_ok=True)
        raise



def _doctor_export_cleanup():
    now = time.time()
    with DOCTOR_EXPORT_LOCK:
        stale = [key for key, row in DOCTOR_EXPORT_SESSIONS.items() if now - float(row.get("createdAt", 0)) > DOCTOR_EXPORT_TTL_SECONDS]
        for key in stale:
            DOCTOR_EXPORT_SESSIONS.pop(key, None)


def _doctor_select_parent_folder() -> str:
    if os.name != "nt":
        raise RuntimeError("La scelta della cartella e disponibile nella versione Windows del Dossier")
    helper = ROOT / "DossierFolderPicker.exe"
    if not helper.is_file():
        raise RuntimeError("Selettore cartella Windows mancante. Reinstalla questa versione del Dossier.")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    completed = subprocess.run(
        [str(helper)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=300, creationflags=flags
    )
    if completed.returncode == 2:
        return ""
    if completed.returncode != 0:
        message = (completed.stderr or "Impossibile aprire la finestra Windows di scelta cartella").strip()
        raise RuntimeError(message)
    output = (completed.stdout or "").strip()
    if not output:
        raise RuntimeError("La finestra Windows non ha restituito alcuna cartella")
    return output


def _doctor_unique_folder(parent: Path) -> Path:
    date = time.strftime("%d-%m-%Y")
    base = f"Dossier sanitario per medico - {date}"
    for n in range(1, 100):
        name = base if n == 1 else f"{base} ({n})"
        candidate = parent / name
        try:
            candidate.mkdir(parents=False, exist_ok=False)
            return candidate
        except FileExistsError:
            continue
    raise RuntimeError("Impossibile creare una nuova cartella per medico nella destinazione scelta")



def _visit_external_destination(parent: Path) -> tuple[bool, str]:
    """Allow removable media and non-system fixed drives only."""
    if os.name != "nt":
        return False, "L'esportazione per struttura sanitaria richiede una memoria esterna su Windows"
    try:
        resolved = parent.resolve()
        drive = str(resolved.drive or "").upper()
        system_drive = str(os.environ.get("SystemDrive", "C:") or "C:").upper()
        if not drive:
            return False, "Seleziona una memoria esterna con lettera di unita"
        root = drive + "\\"
        import ctypes
        drive_type = int(ctypes.windll.kernel32.GetDriveTypeW(root))
        # 2 = removable, 3 = fixed. USB SSD/HDD often report as fixed, so accept
        # a fixed drive only when it is not the Windows system drive.
        if drive_type == 2:
            return True, ""
        if drive_type == 3 and drive != system_drive:
            letter = drive.rstrip(":\\")
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            ps = f"$d=Get-Partition -DriveLetter '{letter}' -ErrorAction Stop | Get-Disk -ErrorAction Stop | Select-Object -First 1 -ExpandProperty BusType; [string]$d"
            try:
                completed = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=12, creationflags=flags)
                bus = (completed.stdout or "").strip().upper()
                if bus in {"USB", "SD", "MMC", "IEEE1394"}:
                    return True, ""
            except Exception:
                pass
        return False, "Seleziona una chiavetta USB, un SSD o un HDD esterno collegato via USB. I dischi interni non sono consentiti."
    except Exception:
        return False, "Non e stato possibile verificare che la destinazione sia una memoria esterna"


def _visit_unique_folder(parent: Path, specialty: str = "Visita", visit_date: str = "") -> Path:
    label = re.sub(r'[^A-Za-z0-9À-ÿ ._-]+', ' ', str(specialty or 'Visita')).strip()
    label = re.sub(r'\s+', ' ', label)[:70] or 'Visita'
    raw_date = str(visit_date or '').strip()
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', raw_date):
        yy, mm, dd = raw_date.split('-')
        date_label = f"{dd}-{mm}-{yy}"
    else:
        date_label = time.strftime("%d-%m-%Y")
    base = f"Clinica Digitale - {label} - {date_label}"
    for n in range(1, 100):
        name = base if n == 1 else f"{base} ({n})"
        candidate = parent / name
        try:
            candidate.mkdir(parents=False, exist_ok=False)
            return candidate
        except FileExistsError:
            continue
    raise RuntimeError("Impossibile creare la cartella della visita nella memoria esterna")


def _visit_print_html_to_pdf(html_text: str, destination: Path):
    browser = _windows_dossier_browser_executable()
    if not browser:
        raise RuntimeError("Browser Chromium non disponibile per creare automaticamente il PDF")
    work = Path(tempfile.mkdtemp(prefix="ClinicaDigitale_VisitaPdf_", dir=str(SESSION_TEMP_DIR)))
    try:
        source = work / "visita.html"
        source.write_text(str(html_text or ''), encoding='utf-8')
        profile = work / "BrowserProfile"
        args_base = [
            browser,
            "--disable-gpu",
            "--disable-extensions",
            "--no-first-run",
            "--no-default-browser-check",
            f"--user-data-dir={profile}",
            "--allow-file-access-from-files",
            "--print-to-pdf-no-header",
            f"--print-to-pdf={destination}",
            source.as_uri(),
        ]
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        attempts = ["--headless=new", "--headless"]
        last = ""
        for headless in attempts:
            try:
                completed = subprocess.run(
                    [browser, headless, *args_base[1:]],
                    capture_output=True, text=True, encoding="utf-8", errors="replace",
                    timeout=90, creationflags=flags
                )
                last = (completed.stderr or completed.stdout or '').strip()
                if completed.returncode == 0 and destination.is_file() and destination.stat().st_size > 500:
                    return
            except Exception as exc:
                last = str(exc)
        raise RuntimeError(last or "Creazione PDF non riuscita")
    finally:
        shutil.rmtree(work, ignore_errors=True)

def _doctor_safe_relative(value: str) -> Path:
    text = str(value or "").replace("\\", "/").strip("/")
    if not text or len(text) > 600:
        raise ValueError("Percorso file non valido")
    parts = [part for part in text.split("/") if part]
    if not parts or any(part in {".", ".."} or ":" in part for part in parts):
        raise ValueError("Percorso file non valido")
    return Path(*parts)


def _media_safe_token(value: str, label: str = "identificativo") -> str:
    text = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value or "").strip()).strip("._")
    if not text or len(text) > 160:
        raise ValueError(f"{label.capitalize()} non valido")
    return text


def _media_archive_read_config() -> dict:
    try:
        if MEDIA_ARCHIVE_CONFIG_FILE.is_file():
            value = json.loads(MEDIA_ARCHIVE_CONFIG_FILE.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
    except Exception:
        pass
    return {}


def _media_archive_marker(root: Path) -> Path:
    return root / MEDIA_ARCHIVE_MARKER_NAME


def _media_archive_selected_root(selected: Path) -> Path:
    selected = Path(selected)
    # If the user selects an existing Clinica Digitale archive, reuse it.
    if _media_archive_marker(selected).is_file() or selected.name.casefold() in {"archiviolocale", "clinica digitale - archivio media", "clinicadigitale_archiviomedia"}:
        return selected
    return selected / "Clinica Digitale - Archivio Media"


def _same_path(a: Path, b: Path) -> bool:
    try:
        return a.resolve() == b.resolve()
    except Exception:
        return str(a).rstrip("\\/").casefold() == str(b).rstrip("\\/").casefold()


def _media_archive_match_marker(root: Path, archive_id: str) -> bool:
    try:
        data = json.loads(_media_archive_marker(root).read_text(encoding="utf-8"))
        return bool(archive_id and str(data.get("archiveId") or "") == archive_id)
    except Exception:
        return False


def _media_archive_resolve_configured(cfg: dict) -> Path:
    raw = str(cfg.get("path") or "").strip()
    if not raw:
        return DEFAULT_MEDIA_ARCHIVE_DIR
    root = Path(raw)
    # Ripara automaticamente la configurazione prodotta da FIX10 che poteva
    # puntare all'intera DossierSanitarioLocale. I media devono vivere in una
    # sottocartella dedicata, senza coinvolgere backup, log, cloud o sicurezza.
    if _same_path(root, APP_DATA_DIR):
        repaired = APP_DATA_DIR / "Clinica Digitale - Archivio Media"
        repaired.mkdir(parents=True, exist_ok=True)
        archive_id = str(cfg.get("archiveId") or "") or secrets.token_urlsafe(18)
        marker = {"archiveId": archive_id, "createdAt": cfg.get("createdAt") or time.strftime("%Y-%m-%dT%H:%M:%S"), "product": "Clinica Digitale"}
        _media_archive_marker(repaired).write_text(json.dumps(marker, ensure_ascii=False, indent=2), encoding="utf-8")
        cfg.update({"path": str(repaired), "archiveId": archive_id, "configured": True, "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S")})
        MEDIA_ARCHIVE_CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        root = repaired
    if root.exists():
        return root
    # Unità USB/SSD: la lettera può cambiare. Cerchiamo lo stesso archivio
    # tramite marker e nome della cartella, senza assumere una lettera fissa.
    archive_id = str(cfg.get("archiveId") or "").strip()
    if os.name == "nt" and archive_id and root.name:
        for letter in "DEFGHIJKLMNOPQRSTUVWXYZ":
            candidate = Path(f"{letter}:\\") / root.name
            if candidate.exists() and _media_archive_match_marker(candidate, archive_id):
                cfg["path"] = str(candidate)
                try:
                    MEDIA_ARCHIVE_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
                    MEDIA_ARCHIVE_CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
                except Exception:
                    pass
                return candidate
    return root


def _media_archive_root(create: bool = False) -> Path:
    cfg = _media_archive_read_config()
    root = _media_archive_resolve_configured(cfg)
    if create:
        root.mkdir(parents=True, exist_ok=True)
    return root


def _media_archive_write_config(root: Path, archive_id: str = "") -> dict:
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    cfg = _media_archive_read_config()
    archive_id = archive_id or str(cfg.get("archiveId") or "") or secrets.token_urlsafe(18)
    marker = {"archiveId": archive_id, "createdAt": cfg.get("createdAt") or time.strftime("%Y-%m-%dT%H:%M:%S"), "product": "Clinica Digitale"}
    _media_archive_marker(root).write_text(json.dumps(marker, ensure_ascii=False, indent=2), encoding="utf-8")
    out = {"path": str(root), "archiveId": archive_id, "configured": True, "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S")}
    MEDIA_ARCHIVE_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    MEDIA_ARCHIVE_CONFIG_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    return out


def _media_archive_has_payload(root: Path) -> bool:
    try:
        return root.is_dir() and any(p.name != MEDIA_ARCHIVE_MARKER_NAME for p in root.iterdir())
    except Exception:
        return False


def _media_archive_status() -> dict:
    cfg = _media_archive_read_config()
    root = _media_archive_resolve_configured(cfg)
    available = root.is_dir()
    free = None
    total = None
    if available:
        try:
            usage = shutil.disk_usage(root)
            free, total = usage.free, usage.total
        except Exception:
            pass
    return {"ok": True, "configured": bool(cfg.get("configured")), "path": str(root), "defaultPath": str(DEFAULT_MEDIA_ARCHIVE_DIR), "available": available, "freeBytes": free, "totalBytes": total, "archiveId": str(cfg.get("archiveId") or "")}


def _media_target(kind: str, profile_id: str, owner_id: str, relative_path: str = "") -> Path:
    kind = str(kind or "").strip().lower()
    if kind not in {"dicom", "image"}:
        raise ValueError("Tipo archivio non valido")
    profile = _media_safe_token(profile_id, "profilo")
    owner = _media_safe_token(owner_id, "esame")
    root = _media_archive_root(create=False) / profile / ("DICOM" if kind == "dicom" else "Immagini") / owner
    if not relative_path:
        return root
    rel = _doctor_safe_relative(relative_path)
    target = (root / rel).resolve()
    root_resolved = root.resolve()
    if target != root_resolved and root_resolved not in target.parents:
        raise ValueError("Percorso archivio non valido")
    return target


def _media_query(parsed):
    query = urllib.parse.parse_qs(parsed.query)
    return (
        str(query.get("kind", [""])[0] or ""),
        str(query.get("profileId", [""])[0] or ""),
        str(query.get("ownerId", [""])[0] or ""),
        str(query.get("path", [""])[0] or ""),
    )


def _doctor_optimize_image(raw: bytes, suffix: str) -> bytes:
    try:
        from PIL import Image, ImageOps
        with Image.open(io.BytesIO(raw)) as source:
            img = ImageOps.exif_transpose(source)
            img.load()
            if max(img.size) > 2600:
                img.thumbnail((2600, 2600), Image.Resampling.LANCZOS)
            out = io.BytesIO()
            ext = suffix.lower()
            if ext in {".jpg", ".jpeg"}:
                img.convert("RGB").save(out, "JPEG", quality=84, optimize=True, progressive=True)
            elif ext == ".webp":
                img.convert("RGB").save(out, "WEBP", quality=84, method=5)
            elif ext == ".png":
                img.save(out, "PNG", optimize=True, compress_level=8)
            elif ext in {".tif", ".tiff"}:
                img.save(out, "TIFF", compression="tiff_deflate")
            else:
                return raw
            candidate = out.getvalue()
            return candidate if len(candidate) < len(raw) * 0.97 else raw
    except Exception:
        return raw


def _doctor_optimize_scanned_pdf(raw: bytes) -> bytes:
    try:
        import pypdfium2 as pdfium
        from PIL import Image
        pdf = pdfium.PdfDocument(raw)
        page_count = len(pdf)
        if page_count < 1 or page_count > 250:
            try: pdf.close()
            except Exception: pass
            return raw
        text_chars = 0
        for i in range(min(page_count, 5)):
            page = pdf[i]
            try:
                text_chars += len((page.get_textpage().get_text_range() or "").strip())
            except Exception:
                pass
            finally:
                try: page.close()
                except Exception: pass
        if text_chars >= 80:
            try: pdf.close()
            except Exception: pass
            return raw
        images = []
        scale = 150 / 72.0
        for i in range(page_count):
            page = pdf[i]
            bitmap = page.render(scale=scale, rev_byteorder=True)
            pil = bitmap.to_pil().convert("RGB")
            images.append(pil.copy())
            try: bitmap.close()
            except Exception: pass
            try: page.close()
            except Exception: pass
        try: pdf.close()
        except Exception: pass
        if not images:
            return raw
        out = io.BytesIO()
        images[0].save(out, "PDF", save_all=True, append_images=images[1:], resolution=150.0, quality=84, optimize=True)
        candidate = out.getvalue()
        for image in images:
            try: image.close()
            except Exception: pass
        return candidate if len(candidate) < len(raw) * 0.94 else raw
    except Exception:
        return raw


def _doctor_optimize_bytes(raw: bytes, suffix: str) -> bytes:
    ext = suffix.lower()
    if ext in {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}:
        return _doctor_optimize_image(raw, ext)
    if ext == ".pdf":
        return _doctor_optimize_scanned_pdf(raw)
    return raw



class GoogleCalendarApiError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = int(status or 0)


def _google_calendar_set_principal(user_or_id):
    if isinstance(user_or_id, dict):
        value = str(user_or_id.get("id") or "").strip()
    else:
        value = str(user_or_id or "").strip()
    GOOGLE_CALENDAR_CONTEXT.principal_id = value
    return value


def _google_calendar_principal_id() -> str:
    return str(getattr(GOOGLE_CALENDAR_CONTEXT, "principal_id", "") or "").strip()


def _google_calendar_principal_hash(principal_id: str = "") -> str:
    value = str(principal_id or _google_calendar_principal_id() or "").strip()
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:20] if value else ""


def _google_calendar_legacy_owner() -> str:
    try:
        data = json.loads(GOOGLE_CALENDAR_LEGACY_CLAIM_FILE.read_text(encoding="utf-8"))
        return str(data.get("principalHash") or "") if isinstance(data, dict) else ""
    except Exception:
        return ""


def _google_calendar_claim_legacy(principal_hash: str) -> bool:
    if not principal_hash:
        return False
    with GOOGLE_CALENDAR_LOCK:
        current = _google_calendar_legacy_owner()
        if current:
            return current == principal_hash
        CALENDAR_DIR.mkdir(parents=True, exist_ok=True)
        temp = GOOGLE_CALENDAR_LEGACY_CLAIM_FILE.with_suffix(".tmp")
        temp.write_text(json.dumps({"principalHash": principal_hash, "claimedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()}, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(GOOGLE_CALENDAR_LEGACY_CLAIM_FILE)
        return True


def _google_calendar_user_file(base: Path) -> Path:
    principal_hash = _google_calendar_principal_hash()
    if not principal_hash:
        return base
    target = base.with_name(f"{base.stem}_{principal_hash}{base.suffix}")
    if not target.exists() and base.exists() and _google_calendar_claim_legacy(principal_hash):
        try:
            CALENDAR_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy2(base, target)
        except Exception:
            pass
    return target


def _google_calendar_load_config() -> dict:
    with GOOGLE_CALENDAR_LOCK:
        data = {}
        secret_file = _google_calendar_user_file(GOOGLE_CALENDAR_SECRET_FILE)
        if secret_file.exists():
            try:
                raw = _dpapi_unprotect(secret_file.read_bytes())
                loaded = json.loads(raw.decode("utf-8"))
                if isinstance(loaded, dict):
                    data = loaded
            except Exception:
                data = {}
        if not str(data.get("clientId") or "").strip():
            data["clientId"] = GOOGLE_OAUTH_DEFAULT_CLIENT_ID
        if not str(data.get("calendarId") or "").strip():
            data["calendarId"] = "primary"
        return data


def _google_calendar_save_config(data: dict):
    with GOOGLE_CALENDAR_LOCK:
        CALENDAR_DIR.mkdir(parents=True, exist_ok=True)
        clean = dict(data or {})
        raw = json.dumps(clean, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        protected = _dpapi_protect(raw)
        secret_file = _google_calendar_user_file(GOOGLE_CALENDAR_SECRET_FILE)
        temp = secret_file.with_suffix(secret_file.suffix + ".tmp")
        temp.write_bytes(protected)
        temp.replace(secret_file)


def _google_calendar_consent_status() -> dict:
    with GOOGLE_CALENDAR_LOCK:
        try:
            consent_file = _google_calendar_user_file(GOOGLE_CALENDAR_CONSENT_FILE)
            data = json.loads(consent_file.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                return {"granted": False, "version": GOOGLE_CALENDAR_CONSENT_VERSION, "grantedAt": "", "revokedAt": ""}
            granted = bool(data.get("granted")) and str(data.get("version") or "") == GOOGLE_CALENDAR_CONSENT_VERSION
            return {
                "granted": granted,
                "version": GOOGLE_CALENDAR_CONSENT_VERSION,
                "grantedAt": str(data.get("grantedAt") or ""),
                "revokedAt": str(data.get("revokedAt") or ""),
            }
        except Exception:
            return {"granted": False, "version": GOOGLE_CALENDAR_CONSENT_VERSION, "grantedAt": "", "revokedAt": ""}


def _google_calendar_set_consent(granted: bool) -> dict:
    with GOOGLE_CALENDAR_LOCK:
        CALENDAR_DIR.mkdir(parents=True, exist_ok=True)
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        current = _google_calendar_consent_status()
        payload = {
            "version": GOOGLE_CALENDAR_CONSENT_VERSION,
            "granted": bool(granted),
            "grantedAt": now if granted else str(current.get("grantedAt") or ""),
            "revokedAt": "" if granted else now,
        }
        consent_file = _google_calendar_user_file(GOOGLE_CALENDAR_CONSENT_FILE)
        temp = consent_file.with_suffix(consent_file.suffix + ".tmp")
        temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(consent_file)
        return _google_calendar_consent_status()



def _google_calendar_medication_consent_status() -> dict:
    with GOOGLE_CALENDAR_LOCK:
        try:
            consent_file = _google_calendar_user_file(GOOGLE_CALENDAR_MEDICATION_CONSENT_FILE)
            data = json.loads(consent_file.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                return {"granted": False, "version": GOOGLE_CALENDAR_MEDICATION_CONSENT_VERSION, "grantedAt": "", "revokedAt": ""}
            granted = bool(data.get("granted")) and str(data.get("version") or "") == GOOGLE_CALENDAR_MEDICATION_CONSENT_VERSION
            return {
                "granted": granted,
                "version": GOOGLE_CALENDAR_MEDICATION_CONSENT_VERSION,
                "grantedAt": str(data.get("grantedAt") or ""),
                "revokedAt": str(data.get("revokedAt") or ""),
            }
        except Exception:
            return {"granted": False, "version": GOOGLE_CALENDAR_MEDICATION_CONSENT_VERSION, "grantedAt": "", "revokedAt": ""}


def _google_calendar_set_medication_consent(granted: bool) -> dict:
    with GOOGLE_CALENDAR_LOCK:
        CALENDAR_DIR.mkdir(parents=True, exist_ok=True)
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        current = _google_calendar_medication_consent_status()
        payload = {
            "version": GOOGLE_CALENDAR_MEDICATION_CONSENT_VERSION,
            "granted": bool(granted),
            "grantedAt": now if granted else str(current.get("grantedAt") or ""),
            "revokedAt": "" if granted else now,
        }
        consent_file = _google_calendar_user_file(GOOGLE_CALENDAR_MEDICATION_CONSENT_FILE)
        temp = consent_file.with_suffix(consent_file.suffix + ".tmp")
        temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(consent_file)
        return _google_calendar_medication_consent_status()


def _google_calendar_require_consent():
    if not _google_calendar_consent_status().get("granted"):
        raise GoogleCalendarApiError(409, "Autorizza nelle Preferenze il trasferimento dei dati degli appuntamenti sanitari a Google Calendar.")


def _google_calendar_links() -> dict:
    with GOOGLE_CALENDAR_LOCK:
        try:
            links_file = _google_calendar_user_file(GOOGLE_CALENDAR_LINKS_FILE)
            data = json.loads(links_file.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}


def _google_calendar_write_links(data: dict):
    with GOOGLE_CALENDAR_LOCK:
        CALENDAR_DIR.mkdir(parents=True, exist_ok=True)
        links_file = _google_calendar_user_file(GOOGLE_CALENDAR_LINKS_FILE)
        temp = links_file.with_suffix(links_file.suffix + ".tmp")
        temp.write_text(json.dumps(data or {}, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(links_file)


def _google_calendar_status() -> dict:
    cfg = _google_calendar_load_config()
    token = cfg.get("token") if isinstance(cfg.get("token"), dict) else {}
    issue = str(cfg.get("oauthIssue") or "").strip()
    refresh = str(token.get("refresh_token") or "")
    access = str(token.get("access_token") or "")
    expires = float(token.get("expires_at", 0) or 0)
    # Se il token dovrebbe poter essere rinnovato ma è scaduto, verifica ora la
    # connessione. In questo modo la UI non mostra più "collegato" quando il
    # rinnovo OAuth è in realtà inutilizzabile.
    if not issue and refresh and (not access or expires <= time.time() + 90):
        try:
            _google_refresh_access_token(force=True)
            cfg = _google_calendar_load_config()
            token = cfg.get("token") if isinstance(cfg.get("token"), dict) else {}
            issue = str(cfg.get("oauthIssue") or "").strip()
            refresh = str(token.get("refresh_token") or "")
            access = str(token.get("access_token") or "")
            expires = float(token.get("expires_at", 0) or 0)
        except GoogleCalendarApiError:
            cfg = _google_calendar_load_config()
            issue = str(cfg.get("oauthIssue") or "reauthorization_required").strip()
        except Exception:
            # Rete momentaneamente assente: non trasformare un problema di
            # connettività in una revoca OAuth. La sincronizzazione riproverà.
            pass
    connected = not issue and bool(refresh or (access and expires > time.time()))
    return {
        "configured": bool(cfg.get("clientId")),
        "connected": connected,
        "needsReauthorization": bool(issue),
        "authMessage": "Google Calendar deve essere ricollegato su questo dispositivo." if issue else "",
        "calendarId": str(cfg.get("calendarId") or "primary"),
        "clientId": str(cfg.get("clientId") or ""),
        "scope": GOOGLE_OAUTH_SCOPE,
        "localOnly": True,
        "accountScoped": bool(_google_calendar_principal_id()),
        "linkedEvents": len(_google_calendar_links()),
        "healthDataConsent": _google_calendar_consent_status(),
        "medicationDataConsent": _google_calendar_medication_consent_status(),
    }


def _google_form_request(url: str, values: dict, timeout: int = 30) -> dict:
    body = urllib.parse.urlencode(values).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json", "User-Agent": "DossierSanitarioLocale/Calendar"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
            return json.loads(raw.decode("utf-8")) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try: data = json.loads(raw); msg = data.get("error_description") or data.get("error", {}).get("message") or data.get("error") or raw
        except Exception: msg = raw or str(exc)
        raise GoogleCalendarApiError(exc.code, str(msg))


def _google_token_request_with_secret_fallback(values: dict, cfg: dict) -> dict:
    request_values = dict(values or {})
    secret = _google_effective_client_secret(cfg)
    if secret:
        request_values["client_secret"] = secret
    return _google_form_request(GOOGLE_OAUTH_TOKEN_URL, request_values)


def _google_refresh_access_token(force: bool = False) -> str:
    cfg = _google_calendar_load_config()
    token = cfg.get("token") if isinstance(cfg.get("token"), dict) else {}
    access = str(token.get("access_token") or "")
    expires = float(token.get("expires_at", 0) or 0)
    if access and not force and expires > time.time() + 90:
        return access
    refresh = str(token.get("refresh_token") or "")
    if not refresh:
        raise GoogleCalendarApiError(401, "Google Calendar non collegato. Esegui prima l'autorizzazione OAuth.")
    values = {"client_id": str(cfg.get("clientId") or ""), "refresh_token": refresh, "grant_type": "refresh_token"}
    try:
        result = _google_token_request_with_secret_fallback(values, cfg)
    except GoogleCalendarApiError as exc:
        message = str(exc).lower()
        if any(marker in message for marker in ("oauth client was deleted", "invalid_client", "client_secret is missing", "invalid_grant", "token has been expired", "token has been revoked")):
            cfg["oauthIssue"] = "reauthorization_required"
            _google_calendar_save_config(cfg)
            raise GoogleCalendarApiError(401, "Google Calendar deve essere ricollegato su questo dispositivo.")
        raise
    cfg.pop("oauthIssue", None)
    token.update(result)
    token["refresh_token"] = refresh
    token["expires_at"] = time.time() + max(60, int(result.get("expires_in", 3600) or 3600))
    cfg["token"] = token
    _google_calendar_save_config(cfg)
    return str(token.get("access_token") or "")


def _google_api_request(method: str, path: str, body=None, retry_auth: bool = True):
    access = _google_refresh_access_token()
    url = GOOGLE_CALENDAR_API + path
    payload = None if body is None else json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    headers = {"Authorization": f"Bearer {access}", "Accept": "application/json", "User-Agent": "DossierSanitarioLocale/Calendar"}
    if payload is not None: headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(url, data=payload, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read()
            return json.loads(raw.decode("utf-8")) if raw else {}
    except urllib.error.HTTPError as exc:
        if exc.code == 401 and retry_auth:
            _google_refresh_access_token(force=True)
            return _google_api_request(method, path, body, retry_auth=False)
        raw = exc.read().decode("utf-8", "replace")
        try: data = json.loads(raw); msg = data.get("error", {}).get("message") or raw
        except Exception: msg = raw or str(exc)
        raise GoogleCalendarApiError(exc.code, str(msg))


def _google_event_payload(event: dict, profile_name: str = "", time_zone: str = "") -> dict:
    owner_name = '' if bool(event.get('familyMedicationGroup')) else str(event.get("calendarOwnerName") or profile_name or "").strip()
    date = str(event.get("startDate") or "")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        raise ValueError("Data appuntamento non valida")
    duration = max(1, min(24 * 60, int(event.get("durationMinutes", 60) or 60)))
    all_day = bool(event.get("allDay"))
    if all_day:
        start_date = datetime.date.fromisoformat(date)
        start = {"date": start_date.isoformat()}
        end = {"date": (start_date + datetime.timedelta(days=1)).isoformat()}
    else:
        start_time = str(event.get("startTime") or "09:00")[:5]
        start_dt = datetime.datetime.fromisoformat(f"{date}T{start_time}:00")
        end_dt = start_dt + datetime.timedelta(minutes=duration)
        start = {"dateTime": start_dt.isoformat(timespec="seconds")}
        end = {"dateTime": end_dt.isoformat(timespec="seconds")}
        if time_zone:
            start["timeZone"] = str(time_zone)
            end["timeZone"] = str(time_zone)
    details = [f"Profilo: {owner_name}" if owner_name else "", f"Tipo: {event.get('category')}" if event.get("category") else "", str(event.get("notes") or ""), f"Origine: {event.get('sourceDocumentTitle')}" if event.get("sourceDocumentTitle") else ""]
    reminders = []
    for raw in event.get("reminders") or []:
        try: minutes = int(raw)
        except Exception: continue
        if 0 < minutes <= 40320 and minutes not in [x["minutes"] for x in reminders]: reminders.append({"method": "popup", "minutes": minutes})
        if len(reminders) >= 5: break
    payload = {
        "summary": (f"{owner_name} - {str(event.get('title') or 'Promemoria sanitario')}" if owner_name else str(event.get("title") or "Promemoria sanitario")),
        "start": start,
        "end": end,
        "reminders": {"useDefault": False, "overrides": reminders},
        "extendedProperties": {"private": {"dossierEventId": str(event.get("id") or "")}},
    }
    if event.get("location"): payload["location"] = str(event.get("location"))
    description = "\n".join(x for x in details if x)
    if description: payload["description"] = description
    if str(event.get("recurrence") or "") == "yearly": payload["recurrence"] = ["RRULE:FREQ=YEARLY"]
    return payload


def _google_calendar_find_remote_events(event_id: str, calendar_id: str) -> list:
    event_id = str(event_id or "").strip()
    if not event_id:
        return []
    cal_path = urllib.parse.quote(str(calendar_id or "primary"), safe="")
    query = urllib.parse.urlencode({
        "privateExtendedProperty": f"dossierEventId={event_id}",
        "showDeleted": "false",
        "singleEvents": "false",
        "maxResults": "20",
    })
    result = _google_api_request("GET", f"/calendars/{cal_path}/events?{query}")
    items = result.get("items") if isinstance(result, dict) else []
    return [x for x in (items or []) if isinstance(x, dict) and x.get("id")]


def _google_calendar_choose_canonical(items: list, preferred_google_id: str = ""):
    preferred_google_id = str(preferred_google_id or "")
    if preferred_google_id:
        for item in items:
            if str(item.get("id") or "") == preferred_google_id:
                return item
    if not items:
        return None
    return sorted(items, key=lambda x: (str(x.get("created") or "9999"), str(x.get("id") or "")))[0]


def _google_calendar_remove_duplicate_remote_events(items: list, canonical_id: str, calendar_id: str) -> int:
    removed = 0
    cal_path = urllib.parse.quote(str(calendar_id or "primary"), safe="")
    for item in items:
        google_id = str(item.get("id") or "")
        if not google_id or google_id == canonical_id:
            continue
        try:
            encoded = urllib.parse.quote(google_id, safe="")
            _google_api_request("DELETE", f"/calendars/{cal_path}/events/{encoded}")
            removed += 1
        except GoogleCalendarApiError as exc:
            if exc.status not in (404, 410):
                raise
    return removed


def _google_calendar_event_link_status(event_ids: list) -> dict:
    links = _google_calendar_links()
    out = {}
    for raw in event_ids or []:
        event_id = str(raw or "").strip()
        if not event_id:
            continue
        link = links.get(event_id) if isinstance(links, dict) else None
        out[event_id] = {
            "linked": bool(link and link.get("googleEventId")),
            "googleEventId": str((link or {}).get("googleEventId") or ""),
            "htmlLink": str((link or {}).get("htmlLink") or ""),
            "calendarId": str((link or {}).get("calendarId") or ""),
            "updatedAt": float((link or {}).get("updatedAt") or 0),
            "syncedLocalUpdatedAt": str((link or {}).get("syncedLocalUpdatedAt") or ""),
            "attemptedLocalUpdatedAt": str((link or {}).get("attemptedLocalUpdatedAt") or ""),
            "lastError": str((link or {}).get("lastError") or ""),
        }
    return out


def _google_calendar_mark_sync_error(event: dict, error: Exception):
    event_id = str((event or {}).get("id") or "").strip()
    if not event_id:
        return
    links = _google_calendar_links()
    row = dict(links.get(event_id) or {})
    row["attemptedLocalUpdatedAt"] = str((event or {}).get("updatedAt") or "")
    row["lastError"] = str(error or "Sincronizzazione non riuscita")[:1000]
    row["updatedAt"] = time.time()
    links[event_id] = row
    _google_calendar_write_links(links)


def _google_calendar_sync_all(events: list, profile_name: str, time_zone: str) -> dict:
    if not isinstance(events, list):
        raise ValueError("Elenco appuntamenti non valido")
    summary = {"checked": 0, "created": 0, "updated": 0, "recovered": 0, "unchanged": 0, "duplicatesRemoved": 0, "deleted": 0, "errors": []}
    results = {}
    for event in events[:1000]:
        if not isinstance(event, dict):
            continue
        event_id = str(event.get("id") or "").strip()
        if not event_id:
            continue
        summary["checked"] += 1
        try:
            create_missing = str(event.get("status") or "planned") == "planned"
            result = _google_calendar_sync_event(event, profile_name, time_zone, create_missing)
            results[event_id] = result
            if result.get("deleted"):
                summary["deleted"] += 1
            elif result.get("created"):
                summary["created"] += 1
            elif result.get("recovered"):
                summary["recovered"] += 1
            elif result.get("synced"):
                summary["updated"] += 1
            else:
                summary["unchanged"] += 1
            summary["duplicatesRemoved"] += int(result.get("duplicatesRemoved") or 0)
        except Exception as exc:
            _google_calendar_mark_sync_error(event, exc)
            summary["errors"].append({"eventId": event_id, "title": str(event.get("title") or ""), "error": str(exc)})
    summary["errorCount"] = len(summary["errors"])
    summary["ok"] = not summary["errors"]
    summary["results"] = results
    return summary


def _google_calendar_delete_link(event_id: str, remote: bool = True) -> dict:
    event_id = str(event_id or "").strip()
    links = _google_calendar_links()
    link = links.get(event_id)
    deleted_remote = 0
    if remote and event_id:
        cfg = _google_calendar_load_config()
        calendar_id = str((link or {}).get("calendarId") or cfg.get("calendarId") or "primary").strip() or "primary"
        remote_items = _google_calendar_find_remote_events(event_id, calendar_id)
        # If the cache knows an event that the filtered search did not return, still
        # try that exact id. Otherwise delete only events carrying our private marker.
        ids = [str(x.get("id") or "") for x in remote_items if x.get("id")]
        cached_id = str((link or {}).get("googleEventId") or "")
        if cached_id and cached_id not in ids:
            ids.append(cached_id)
        cal_path = urllib.parse.quote(calendar_id, safe="")
        for google_id in ids:
            if not google_id:
                continue
            encoded = urllib.parse.quote(google_id, safe="")
            try:
                _google_api_request("DELETE", f"/calendars/{cal_path}/events/{encoded}")
                deleted_remote += 1
            except GoogleCalendarApiError as exc:
                if exc.status not in (404, 410):
                    raise
    if event_id in links:
        links.pop(event_id, None)
        _google_calendar_write_links(links)
    return {"linked": bool(link), "deleted": bool(deleted_remote or link), "remoteDeleted": deleted_remote}



def _google_calendar_delete_medication_linked_events() -> dict:
    links = _google_calendar_links()
    event_ids = [
        str(event_id)
        for event_id, row in (links or {}).items()
        if isinstance(row, dict) and str(row.get("sourceKind") or "") in {"therapy-reorder", "family-therapy-reorder-group"}
    ]
    summary = {"checked": len(event_ids), "deleted": 0, "errors": []}
    for event_id in event_ids:
        try:
            result = _google_calendar_delete_link(event_id, remote=True)
            if result.get("deleted"):
                summary["deleted"] += 1
        except Exception as exc:
            summary["errors"].append({"eventId": event_id, "error": str(exc)})
    summary["errorCount"] = len(summary["errors"])
    summary["ok"] = not summary["errors"]
    return summary


def _google_calendar_delete_all_linked_events() -> dict:
    event_ids = list(_google_calendar_links().keys())
    summary = {"checked": len(event_ids), "deleted": 0, "errors": []}
    for event_id in event_ids:
        try:
            result = _google_calendar_delete_link(str(event_id), remote=True)
            if result.get("deleted"):
                summary["deleted"] += 1
        except Exception as exc:
            summary["errors"].append({"eventId": str(event_id), "error": str(exc)})
    summary["errorCount"] = len(summary["errors"])
    summary["ok"] = not summary["errors"]
    return summary


def _google_calendar_sync_event(event: dict, profile_name: str, time_zone: str, create_if_missing: bool) -> dict:
    _google_calendar_require_consent()
    event_id = str(event.get("id") or "").strip()
    if str(event.get("sourceKind") or "") in {"therapy-reorder", "family-therapy-reorder-group"} and not _google_calendar_medication_consent_status().get("granted"):
        return {"linked": False, "synced": False, "skipped": True, "reason": "medication-consent"}
    if not event_id:
        raise ValueError("Identificativo appuntamento mancante")
    if str(event.get("status") or "planned") == "cancelled":
        return _google_calendar_delete_link(event_id, remote=True)
    cfg = _google_calendar_load_config()
    if not cfg.get("clientId"):
        raise GoogleCalendarApiError(409, "Integrazione Google Calendar avanzata non configurata")
    calendar_id = str(cfg.get("calendarId") or "primary").strip() or "primary"
    links = _google_calendar_links()
    link = links.get(event_id)
    if link and str(link.get("calendarId") or "primary") != calendar_id:
        _google_calendar_delete_link(event_id, remote=True)
        links = _google_calendar_links()
        link = None

    body = _google_event_payload(event, profile_name, time_zone)
    cal_path = urllib.parse.quote(calendar_id, safe="")
    preferred_google_id = str((link or {}).get("googleEventId") or "")

    # Recover identity from Google before any POST. This survives reinstallations,
    # local cache loss and device changes and prevents duplicate Dossier events.
    remote_items = _google_calendar_find_remote_events(event_id, calendar_id)
    canonical = _google_calendar_choose_canonical(remote_items, preferred_google_id)
    recovered = bool(canonical and (not link or str(canonical.get("id") or "") != preferred_google_id))
    duplicates_removed = 0
    result = None
    if canonical:
        canonical_id = str(canonical.get("id") or "")
        duplicates_removed = _google_calendar_remove_duplicate_remote_events(remote_items, canonical_id, calendar_id)
        encoded = urllib.parse.quote(canonical_id, safe="")
        try:
            result = _google_api_request("PATCH", f"/calendars/{cal_path}/events/{encoded}", body)
        except GoogleCalendarApiError as exc:
            if exc.status not in (404, 410):
                raise
            canonical = None
            result = None

    created = False
    if not canonical:
        if not create_if_missing:
            return {"linked": False, "synced": False, "duplicatesRemoved": duplicates_removed}
        result = _google_api_request("POST", f"/calendars/{cal_path}/events", body)
        created = True

    if not isinstance(result, dict) or not result.get("id"):
        raise GoogleCalendarApiError(502, "Google Calendar non ha restituito l'identificativo dell'evento")
    links = _google_calendar_links()
    links[event_id] = {
        "googleEventId": str(result.get("id")),
        "calendarId": calendar_id,
        "htmlLink": str(result.get("htmlLink") or ""),
        "updatedAt": time.time(),
        "syncedLocalUpdatedAt": str(event.get("updatedAt") or ""),
        "attemptedLocalUpdatedAt": str(event.get("updatedAt") or ""),
        "lastError": "",
        "sourceKind": str(event.get("sourceKind") or ""),
    }
    _google_calendar_write_links(links)
    return {
        "linked": True,
        "synced": True,
        "created": created,
        "recovered": recovered and not created,
        "duplicatesRemoved": duplicates_removed,
        "googleEventId": str(result.get("id")),
        "htmlLink": str(result.get("htmlLink") or ""),
        "calendarId": calendar_id,
    }

def _calendar_cleanup_legacy_google():
    for path in LEGACY_GOOGLE_FILES:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


def _calendar_manifest() -> dict:
    try:
        if not REMINDER_MANIFEST_FILE.exists():
            return {}
        data = json.loads(REMINDER_MANIFEST_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _calendar_write_manifest(data: dict):
    CALENDAR_DIR.mkdir(parents=True, exist_ok=True)
    temp = REMINDER_MANIFEST_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(REMINDER_MANIFEST_FILE)


def _calendar_groups() -> dict:
    try:
        if not REMINDER_GROUPS_FILE.exists():
            return {}
        data = json.loads(REMINDER_GROUPS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _calendar_write_groups(data: dict):
    CALENDAR_DIR.mkdir(parents=True, exist_ok=True)
    temp = REMINDER_GROUPS_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(REMINDER_GROUPS_FILE)


def _calendar_group_payload(group: dict) -> dict:
    members = group.get("members") if isinstance(group, dict) else {}
    rows = [x for x in (members or {}).values() if isinstance(x, dict)]
    rows.sort(key=lambda x: (str(x.get("profile") or "").casefold(), str(x.get("title") or "").casefold(), str(x.get("eventId") or "")))
    messages = [str(x.get("message") or "").strip() for x in rows if str(x.get("message") or "").strip()]
    return {
        "title": "Dossier Sanitario Locale",
        "message": "\n\n".join(messages),
    }


def _calendar_write_group_payload(group: dict):
    path_text = str((group or {}).get("dataPath") or "").strip()
    if not path_text:
        return
    path = Path(path_text)
    try:
        if path.parent.resolve() != REMINDER_DATA_DIR.resolve():
            return
    except Exception:
        return
    REMINDER_DATA_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(_calendar_group_payload(group), ensure_ascii=False), encoding="utf-8")


def _calendar_task_slug(value: str) -> str:
    return hashlib.sha256(str(value or "evento").encode("utf-8")).hexdigest()[:20]


def _calendar_ps_quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _calendar_run_powershell(script: str, timeout: int = 30):
    if os.name != "nt":
        raise RuntimeError("Programmazione avvisi Windows disponibile solo su Windows")
    proc = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "errore PowerShell").strip()
        raise RuntimeError(detail[:1200])
    return (proc.stdout or "").strip()


def _calendar_unregister_task(task_name: str):
    if os.name != "nt" or not task_name:
        return
    script = f"Unregister-ScheduledTask -TaskName {_calendar_ps_quote(task_name)} -Confirm:$false -ErrorAction SilentlyContinue"
    try:
        _calendar_run_powershell(script, timeout=15)
    except Exception:
        pass


def _calendar_cancel_event(event_id: str) -> int:
    event_id = str(event_id or "").strip()
    if not event_id:
        return 0
    with REMINDER_LOCK:
        manifest = _calendar_manifest()
        groups = _calendar_groups()
        task_names = list(manifest.get(event_id) or [])
        for name in task_names:
            task_name = str(name or "")
            group = groups.get(task_name)
            if isinstance(group, dict):
                members = group.get("members") if isinstance(group.get("members"), dict) else {}
                members.pop(event_id, None)
                group["members"] = members
                if members:
                    _calendar_write_group_payload(group)
                    groups[task_name] = group
                else:
                    _calendar_unregister_task(task_name)
                    path_text = str(group.get("dataPath") or "").strip()
                    if path_text:
                        try: Path(path_text).unlink(missing_ok=True)
                        except OSError: pass
                    groups.pop(task_name, None)
            else:
                # Task legacy: era dedicato a un singolo evento e può essere rimosso interamente.
                _calendar_unregister_task(task_name)
        manifest.pop(event_id, None)
        _calendar_write_manifest(manifest)
        _calendar_write_groups(groups)
        prefix = _calendar_task_slug(event_id)
        try:
            if REMINDER_DATA_DIR.exists():
                for path in REMINDER_DATA_DIR.glob(f"{prefix}_*.json"):
                    path.unlink(missing_ok=True)
        except OSError:
            pass
        return len(task_names)


def _calendar_event_start(event: dict):
    import datetime as _dt
    date_text = str(event.get("startDate") or "").strip()
    if not date_text:
        raise ValueError("Data dell'appuntamento mancante")
    time_text = "09:00" if bool(event.get("allDay")) else str(event.get("startTime") or "09:00").strip()[:5]
    try:
        return _dt.datetime.strptime(f"{date_text} {time_text}", "%Y-%m-%d %H:%M")
    except ValueError as exc:
        raise ValueError("Data o ora dell'appuntamento non valida") from exc


def _calendar_schedule_event(event: dict, profile_name: str = "") -> dict:
    import datetime as _dt
    event_id = str(event.get("id") or "").strip()
    if not event_id:
        raise ValueError("Identificativo appuntamento mancante")
    _calendar_cancel_event(event_id)
    if str(event.get("status") or "planned") != "planned":
        return {"scheduledCount": 0, "skippedCount": 0}
    reminders = []
    for raw in event.get("reminders") or []:
        try:
            minutes = int(raw)
        except Exception:
            continue
        if minutes < 0 or minutes > 40320 or minutes in reminders:
            continue
        reminders.append(minutes)
        if len(reminders) >= 5:
            break
    if not reminders:
        return {"scheduledCount": 0, "skippedCount": 0}
    if os.name != "nt":
        raise RuntimeError("Gli avvisi automatici sono disponibili nell'installazione Windows")
    if not REMINDER_EXE.exists():
        raise RuntimeError("Componente locale promemoria non disponibile")
    start = _calendar_event_start(event)
    now = _dt.datetime.now()
    title = str(event.get("title") or "Promemoria sanitario").strip()[:180]
    profile = str(profile_name or "").strip()[:120]
    category = str(event.get("category") or "").strip()[:80]
    when = start.strftime("%d/%m/%Y alle %H:%M") if not bool(event.get("allDay")) else start.strftime("%d/%m/%Y")
    message = f"{profile + ' · ' if profile else ''}{title}\n{when}{(' · ' + category) if category else ''}"
    REMINDER_DATA_DIR.mkdir(parents=True, exist_ok=True)
    names = []
    skipped = 0

    with REMINDER_LOCK:
        manifest = _calendar_manifest()
        groups = _calendar_groups()
        for minutes in reminders:
            alert_at = start - _dt.timedelta(minutes=minutes)
            if alert_at <= now:
                skipped += 1
                continue
            # Un solo task Windows per minuto di avviso. Tutti i membri/eventi che
            # scattano nello stesso istante vengono mostrati nello stesso avviso.
            group_key = alert_at.strftime("%Y-%m-%dT%H:%M")
            group_slug = _calendar_task_slug("family-alert:" + group_key)
            task_name = f"DossierSanitarioLocale_Group_{group_slug}"
            data_path = REMINDER_DATA_DIR / f"group_{group_slug}.json"
            group = groups.get(task_name) if isinstance(groups.get(task_name), dict) else {
                "alertAt": alert_at.isoformat(timespec="minutes"),
                "dataPath": str(data_path),
                "members": {},
            }
            members = group.get("members") if isinstance(group.get("members"), dict) else {}
            members[event_id] = {
                "eventId": event_id,
                "profile": profile,
                "title": title,
                "message": message,
            }
            group["members"] = members
            group["alertAt"] = alert_at.isoformat(timespec="minutes")
            group["dataPath"] = str(data_path)
            _calendar_write_group_payload(group)
            if task_name not in groups:
                at_text = alert_at.strftime("%Y-%m-%d %H:%M")
                action_arg = f'--file "{data_path}"'
                script = (
                    "$ErrorActionPreference='Stop';"
                    f"$action=New-ScheduledTaskAction -Execute {_calendar_ps_quote(str(REMINDER_EXE))} -Argument {_calendar_ps_quote(action_arg)};"
                    f"$at=[datetime]::ParseExact({_calendar_ps_quote(at_text)},'yyyy-MM-dd HH:mm',[Globalization.CultureInfo]::InvariantCulture);"
                    "$trigger=New-ScheduledTaskTrigger -Once -At $at;"
                    "$user=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name;"
                    "$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited;"
                    "$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable;"
                    f"Register-ScheduledTask -TaskName {_calendar_ps_quote(task_name)} -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null"
                )
                _calendar_run_powershell(script, timeout=30)
            groups[task_name] = group
            names.append(task_name)
        manifest[event_id] = names
        _calendar_write_manifest(manifest)
        _calendar_write_groups(groups)
    return {"scheduledCount": len(names), "skippedCount": skipped, "taskNames": names}


def _medication_state() -> dict:
    with MEDICATION_REMINDER_LOCK:
        try:
            if not MEDICATION_REMINDER_STATE_FILE.exists():
                return {"version": 1, "profiles": {}, "actions": []}
            data = json.loads(MEDICATION_REMINDER_STATE_FILE.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError("stato non valido")
            data.setdefault("version", 1); data.setdefault("profiles", {}); data.setdefault("actions", [])
            return data
        except Exception:
            return {"version": 1, "profiles": {}, "actions": []}


def _medication_write_state(data: dict):
    with MEDICATION_REMINDER_LOCK:
        CALENDAR_DIR.mkdir(parents=True, exist_ok=True)
        temp = MEDICATION_REMINDER_STATE_FILE.with_suffix(".tmp")
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(MEDICATION_REMINDER_STATE_FILE)


def _medication_parse_date(value: str):
    try:
        return datetime.datetime.strptime(str(value or "")[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def _medication_depletion_date(start_date: str, total_units: float, daily_units: float, therapy_days: list) -> str:
    start = _medication_parse_date(start_date)
    remaining = float(total_units or 0); units = float(daily_units or 0)
    if not start or remaining <= 0 or units <= 0:
        return ""
    allowed = set(str(x) for x in (therapy_days or ["mon","tue","wed","thu","fri","sat","sun"]))
    day_keys = ["mon","tue","wed","thu","fri","sat","sun"]
    cursor = start
    for _ in range(36525):
        if day_keys[cursor.weekday()] in allowed:
            if remaining + 0.0000001 < units:
                return cursor.isoformat()
            remaining -= units
            if remaining <= 0.0000001:
                return (cursor + datetime.timedelta(days=1)).isoformat()
        cursor += datetime.timedelta(days=1)
    return ""


def _medication_hash(value: str) -> str:
    h = 2166136261
    for ch in str(value or ""):
        h ^= ord(ch)
        h = (h * 16777619) & 0xffffffff
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    if h == 0: return "0"
    out = ""
    while h:
        h, r = divmod(h, 36); out = chars[r] + out
    return out


def _medication_lead_days(stock: dict) -> int:
    try:
        value = int(round(float(stock.get("reorderLeadDays", 7) or 7)))
    except Exception:
        value = 7
    return max(1, min(60, value))


def _medication_profile_groups(profile: dict) -> list:
    stocks_map = {str(k): v for k, v in (profile.get("stocks") or {}).items() if isinstance(v, dict)}
    event_map = profile.get("eventStockKeys") if isinstance(profile.get("eventStockKeys"), dict) else {}

    # L'Agenda definisce i gruppi operativi: Windows deve usare esattamente
    # gli stessi confini e non deve ricombinare eventi familiari distinti.
    mapped_groups = []
    seen = set()
    for event_id, raw_keys in event_map.items():
        keys = [str(k) for k in (raw_keys or []) if str(k) in stocks_map]
        signature = tuple(sorted(set(keys)))
        if not signature or signature in seen:
            continue
        group = [stocks_map[k] for k in signature]
        group = [x for x in group if _medication_parse_date(x.get("depletionDate")) and _medication_parse_date(x.get("reorderDate"))]
        if not group:
            continue
        seen.add(signature)
        mapped_groups.append(group)
    if mapped_groups:
        mapped_groups.sort(key=lambda group: str(min((x.get("reorderDate") or "9999-12-31") for x in group)))
        return mapped_groups

    # Compatibilita' con stati Windows legacy privi della mappa eventi.
    stocks = [x for x in stocks_map.values() if _medication_parse_date(x.get("depletionDate")) and _medication_parse_date(x.get("reorderDate"))]
    prescription = sorted([x for x in stocks if x.get("requiresPrescription") is not False], key=lambda x: (str(x.get("reorderDate") or "9999-12-31"), str(x.get("medication") or "").casefold()))
    purchase = sorted([x for x in stocks if x.get("requiresPrescription") is False], key=lambda x: (str(x.get("reorderDate") or "9999-12-31"), str(x.get("medication") or "").casefold()))
    gap = max(0, min(10, int(profile.get("groupDays", 7) or 0)))
    groups = []
    for stock in prescription:
        if not groups:
            groups.append([stock]); continue
        a = _medication_parse_date(groups[-1][0].get("reorderDate")); b = _medication_parse_date(stock.get("reorderDate"))
        if not a or not b or (b-a).days > gap: groups.append([stock])
        else: groups[-1].append(stock)
    groups.extend([[stock] for stock in purchase])
    groups.sort(key=lambda group: str((group[0] if group else {}).get("reorderDate") or "9999-12-31"))
    return groups


def _medication_group_id(profile_id: str, group: list) -> str:
    keys = sorted(str(x.get("stockKey") or x.get("therapyId") or "") for x in group if x.get("stockKey") or x.get("therapyId"))
    return f"therapy-reorder-{profile_id}-{_medication_hash('|'.join(keys))}"


def _medication_group_event(profile_id: str, profile: dict, group: list) -> dict:
    reorder_date = min(str(x.get("reorderDate") or "9999-12-31") for x in group)
    names = []
    for x in group:
        name = str(x.get("medication") or "Farmaco").strip()
        if name and name not in names: names.append(name)
    short = str(profile.get("profileShortName") or profile.get("profileName") or "Profilo").strip().split()[0] or "Profilo"
    requires_prescription = all(x.get("requiresPrescription") is not False for x in group)
    title = f"{short}: {' + '.join(names)} il {_medication_format_date(reorder_date)}" if requires_prescription else f"{short}: riordino {' + '.join(names)} il {_medication_format_date(reorder_date)}"
    notes = ["Promemoria automatico per la richiesta/riordino dei farmaci con ricetta, calcolato dalla scheda Terapie." if requires_prescription else "Promemoria automatico di acquisto/riordino per farmaco senza ricetta, calcolato dalla scheda Terapie."]
    for x in group:
        notes.append(f"{x.get('medication') or 'Farmaco'}: nuova scorta necessaria dal {_medication_format_date(str(x.get('depletionDate') or ''))}.")
    return {
        "id": _medication_group_id(profile_id, group), "profileId": profile_id, "category": "Ricetta" if requires_prescription else "Altro", "title": title,
        "startDate": reorder_date, "startTime": "09:00", "allDay": False, "durationMinutes": 30, "status": "planned",
        "doctorId": "", "doctorName": "", "location": "", "notes": "\n".join(notes),
        "reminders": list(profile.get("reminders") or [60])[:5], "recurrence": "none", "sourceKind": "therapy-reorder",
        "sourceTherapyIds": sorted({str(i) for x in group for i in (x.get("sourceTherapyIds") or [x.get("therapyId")]) if i}),
        "medicationStockKeys": sorted({str(x.get("stockKey") or "") for x in group if x.get("stockKey")}),
        "medicationNames": names, "medicationReorder": True, "medicationReorderMode": "prescription" if requires_prescription else "purchase", "requiresPrescription": requires_prescription,
    }


def _medication_format_date(value: str) -> str:
    d = _medication_parse_date(value)
    return d.strftime("%d/%m/%Y") if d else str(value or "")


def _medication_group_alert_at(profile: dict, group: list, now: datetime.datetime | None = None) -> datetime.datetime:
    now = now or datetime.datetime.now()
    snoozes = []
    for stock in group:
        raw = str(stock.get("snoozeUntil") or "")
        if raw:
            try: snoozes.append(datetime.datetime.fromisoformat(raw))
            except Exception: pass
    if snoozes:
        future = [x for x in snoozes if x > now]
        if future: return min(future)
    reorder = _medication_parse_date(min(str(x.get("reorderDate") or "9999-12-31") for x in group))
    return datetime.datetime.combine(reorder or now.date(), datetime.time(9, 0))


def _medication_next_due(data: dict, now: datetime.datetime | None = None):
    now = now or datetime.datetime.now(); candidates = []
    for profile_id, profile in (data.get("profiles") or {}).items():
        if not isinstance(profile, dict): continue
        for group in _medication_profile_groups(profile):
            at = _medication_group_alert_at(profile, group, now)
            candidates.append((at, str(profile_id), profile, group))
    if not candidates: return None
    candidates.sort(key=lambda row: row[0])
    return candidates[0]


def _medication_due_now(data: dict, now: datetime.datetime | None = None) -> list:
    now = now or datetime.datetime.now()
    limit = now + datetime.timedelta(minutes=1)
    candidates = []
    for profile_id, profile in (data.get("profiles") or {}).items():
        if not isinstance(profile, dict):
            continue
        for group in _medication_profile_groups(profile):
            at = _medication_group_alert_at(profile, group, now)
            if at <= limit:
                candidates.append((at, str(profile_id), profile, group))
    candidates.sort(key=lambda row: (row[0], str((row[2] or {}).get("profileName") or "").casefold(), row[1]))
    return candidates


def _medication_unregister_task():
    if os.name != "nt": return
    try: _calendar_unregister_task(MEDICATION_REMINDER_TASK_NAME)
    except Exception: pass


def _medication_schedule_next_task(data: dict | None = None) -> dict:
    data = data or _medication_state(); _medication_unregister_task()
    due = _medication_next_due(data)
    if not due: return {"scheduled": False, "nextAt": ""}
    at, _, _, _ = due; now = datetime.datetime.now()
    if at <= now: at = now + datetime.timedelta(seconds=20)
    if os.name != "nt": return {"scheduled": False, "nextAt": at.isoformat(timespec="seconds")}
    pythonw = ROOT / "runtime" / "python" / "pythonw.exe"
    if not pythonw.exists(): pythonw = ROOT / "runtime" / "python" / "python.exe"
    if not pythonw.exists(): raise RuntimeError("Runtime Python locale non disponibile per i promemoria farmaci")
    script_path = ENGINE_DIR / "server.py"
    action_arg = f'"{script_path}" --medication-agent'
    at_text = at.strftime("%Y-%m-%d %H:%M:%S")
    script = (
        "$ErrorActionPreference='Stop';"
        f"$action=New-ScheduledTaskAction -Execute {_calendar_ps_quote(str(pythonw))} -Argument {_calendar_ps_quote(action_arg)};"
        f"$at=[datetime]::ParseExact({_calendar_ps_quote(at_text)},'yyyy-MM-dd HH:mm:ss',[Globalization.CultureInfo]::InvariantCulture);"
        "$trigger=New-ScheduledTaskTrigger -Once -At $at;"
        "$user=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name;"
        "$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited;"
        "$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable;"
        f"Register-ScheduledTask -TaskName {_calendar_ps_quote(MEDICATION_REMINDER_TASK_NAME)} -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null"
    )
    _calendar_run_powershell(script, timeout=30)
    return {"scheduled": True, "nextAt": at.isoformat(timespec="seconds"), "taskName": MEDICATION_REMINDER_TASK_NAME}


def _medication_upsert_event(event: dict, profile_name: str) -> dict:
    source_kind = str(event.get("sourceKind") or "")
    family_group = source_kind == "family-therapy-reorder-group" or bool(event.get("familyMedicationGroup"))
    if source_kind not in {"therapy-reorder", "family-therapy-reorder-group"}:
        raise ValueError("Evento farmaci non valido")
    if family_group:
        principal = _google_calendar_principal_hash() or hashlib.sha256(str(profile_name or "family").encode("utf-8")).hexdigest()[:20]
        profile_id = f"__family__:{principal}"
        flattened = []
        for member in event.get("familyMedicationItems") or []:
            if not isinstance(member, dict):
                continue
            owner_profile_id = str(member.get("profileId") or "").strip()
            owner_name = str(member.get("profileName") or "").strip()
            for raw in member.get("items") or []:
                if not isinstance(raw, dict):
                    continue
                original_key = str(raw.get("stockKey") or raw.get("therapyId") or "").strip()
                if not owner_profile_id or not original_key:
                    continue
                flattened.append({**raw, "stockKey": f"{owner_profile_id}::{original_key}", "originalStockKey": original_key, "ownerProfileId": owner_profile_id, "ownerProfileName": owner_name})
        items = flattened
    else:
        profile_id = str(event.get("profileId") or "").strip()
        if not profile_id:
            raise ValueError("Profilo mancante")
        items = event.get("medicationReorderItems") if isinstance(event.get("medicationReorderItems"), list) else []
    data = _medication_state(); profiles = data.setdefault("profiles", {}); profile = profiles.setdefault(profile_id, {})
    profile["familyGroup"] = bool(family_group)
    profile["profileName"] = str(profile_name or profile.get("profileName") or ("Famiglia" if family_group else "Profilo")).strip()[:180]
    profile["profileShortName"] = "Famiglia" if family_group else str(event.get("title") or "Profilo").split(":",1)[0].strip()[:120]
    profile["groupDays"] = max(0,min(10,int(event.get("medicationReorderGroupDays", profile.get("groupDays",7)) or 0)))
    profile["reminders"] = [60]
    stocks = profile.setdefault("stocks", {}); event_map = profile.setdefault("eventStockKeys", {})
    stock_keys=[]
    for raw in items:
        if not isinstance(raw, dict): continue
        key=str(raw.get("stockKey") or raw.get("therapyId") or "").strip()
        if not key: continue
        current=stocks.get(key) if isinstance(stocks.get(key),dict) else {}
        stock={**current, **raw, "stockKey":key}
        if current.get("backgroundAdvanced"):
            for field in ("depletionDate","reorderDate","packStartDate","snoozeUntil"):
                if current.get(field): stock[field]=current[field]
        stocks[key]=stock; stock_keys.append(key)
    event_id=str(event.get("id") or "")
    event_map[event_id]=sorted(set(stock_keys))
    # Non conservare Google ids nel task Windows: la sincronizzazione Google e'
    # responsabilita dell'Agenda autenticata e raggruppata.
    profile["googleEventIds"]=[]
    # Elimina scorte non piu referenziate da alcun evento di questo contesto.
    still={str(k) for vals in event_map.values() for k in (vals or [])}
    for key in list(stocks.keys()):
        if key not in still and not (isinstance(stocks.get(key),dict) and stocks[key].get("backgroundAdvanced")):
            stocks.pop(key,None)
    _medication_write_state(data)
    result=_medication_schedule_next_task(data)
    return {**result,"profileId":profile_id,"stockCount":len(stocks)}


def _medication_cancel_event(event_id: str, profile_id: str = "") -> dict:
    data=_medication_state(); removed=0
    targets=[(profile_id,(data.get("profiles") or {}).get(profile_id))] if profile_id else list((data.get("profiles") or {}).items())
    for pid,profile in targets:
        if not isinstance(profile,dict): continue
        event_map=profile.setdefault("eventStockKeys",{}); keys=list(event_map.pop(str(event_id or ""),[]) or [])
        # Rimuovi una scorta solo se non è più referenziata da un altro gruppo/evento.
        still={str(k) for vals in event_map.values() for k in (vals or [])}
        for key in keys:
            if key not in still and key in (profile.get("stocks") or {}): profile["stocks"].pop(key,None); removed+=1
        profile["googleEventIds"]=[x for x in (profile.get("googleEventIds") or []) if str(x)!=str(event_id or "")]
    _medication_write_state(data); result=_medication_schedule_next_task(data)
    return {**result,"removedStocks":removed}


def _medication_actions_for_profile(profile_id: str) -> list:
    data=_medication_state(); return [dict(x) for x in (data.get("actions") or []) if isinstance(x,dict) and str(x.get("profileId") or "")==str(profile_id or "")]


def _medication_consume_actions(ids: list) -> int:
    wanted={str(x) for x in (ids or []) if x}; data=_medication_state(); actions=list(data.get("actions") or []); before=len(actions)
    consumed=[x for x in actions if isinstance(x,dict) and str(x.get("id") or "") in wanted]
    data["actions"]=[x for x in actions if str((x or {}).get("id") or "") not in wanted]
    # Una volta consumita l'azione dal Dossier, i valori avanzati sono ormai nel DB clinico.
    consumed_keys={(str(x.get("profileId") or ""),str(x.get("stockKey") or "")) for x in consumed}
    for profile_id,profile in (data.get("profiles") or {}).items():
        if not isinstance(profile,dict): continue
        for stock_key,stock in (profile.get("stocks") or {}).items():
            if not isinstance(stock,dict): continue
            owner_id=str(stock.get("ownerProfileId") or profile_id)
            owner_key=str(stock.get("originalStockKey") or stock_key)
            if (owner_id,owner_key) in consumed_keys:
                stock.pop("backgroundAdvanced",None)
    _medication_write_state(data); return before-len(data.get("actions") or [])


def _medication_task_dialog(title: str, content: str, multi: bool = False) -> str:
    if os.name != "nt": return "snooze"
    try:
        import ctypes
        from ctypes import wintypes
        class BUTTON(ctypes.Structure): _fields_=[("nButtonID",ctypes.c_int),("pszButtonText",wintypes.LPCWSTR)]
        class CONFIG(ctypes.Structure):
            _fields_=[("cbSize",wintypes.UINT),("hwndParent",wintypes.HWND),("hInstance",wintypes.HINSTANCE),("dwFlags",wintypes.UINT),("dwCommonButtons",wintypes.UINT),("pszWindowTitle",wintypes.LPCWSTR),("pszMainIcon",wintypes.LPCWSTR),("pszMainInstruction",wintypes.LPCWSTR),("pszContent",wintypes.LPCWSTR),("cButtons",wintypes.UINT),("pButtons",ctypes.POINTER(BUTTON)),("nDefaultButton",ctypes.c_int),("cRadioButtons",wintypes.UINT),("pRadioButtons",ctypes.c_void_p),("nDefaultRadioButton",ctypes.c_int),("pszVerificationText",wintypes.LPCWSTR),("pszExpandedInformation",wintypes.LPCWSTR),("pszExpandedControlText",wintypes.LPCWSTR),("pszCollapsedControlText",wintypes.LPCWSTR),("pszFooterIcon",wintypes.LPCWSTR),("pszFooter",wintypes.LPCWSTR),("pfCallback",ctypes.c_void_p),("lpCallbackData",ctypes.c_void_p),("cxWidth",wintypes.UINT)]
        purchased_label="Tutto acquistato" if multi else "Acquistato"
        buttons=(BUTTON*3)(BUTTON(1001,purchased_label),BUTTON(1002,"Rimanda di 12 ore"),BUTTON(1003,"Apri Dossier"))
        cfg=CONFIG();cfg.cbSize=ctypes.sizeof(CONFIG);cfg.dwFlags=0x00000008|0x00000010|0x01000000;cfg.pszWindowTitle="Clinica Digitale";cfg.pszMainInstruction=title;cfg.pszContent=content;cfg.cButtons=3;cfg.pButtons=buttons;cfg.nDefaultButton=1001;cfg.cxWidth=420
        pressed=ctypes.c_int();radio=ctypes.c_int();verification=wintypes.BOOL()
        fn=ctypes.WinDLL("comctl32").TaskDialogIndirect;fn.argtypes=[ctypes.POINTER(CONFIG),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(wintypes.BOOL)];fn.restype=ctypes.c_long
        hr=fn(ctypes.byref(cfg),ctypes.byref(pressed),ctypes.byref(radio),ctypes.byref(verification))
        if hr==0:
            return {1001:"purchased",1002:"snooze",1003:"open"}.get(pressed.value,"snooze")
    except Exception:
        pass
    try:
        import ctypes
        purchased_help="Tutto acquistato" if multi else "Acquistato"
        text=content+f"\n\nSì = {purchased_help}\nNo = Rimanda di 12 ore\nAnnulla = Apri Dossier"
        result=ctypes.windll.user32.MessageBoxW(None,text,title,0x00000003|0x00000040|0x00040000)
        return {6:"purchased",7:"snooze",2:"open"}.get(result,"snooze")
    except Exception:
        return "snooze"


def _medication_google_reconcile_profile(profile_id: str, profile: dict):
    # Google Calendar viene sincronizzato esclusivamente dall'Agenda autorizzata
    # dell'utente connesso. Il task Windows in background non possiede una
    # sessione applicativa e non deve creare eventi Google individuali.
    return


def _medication_agent_main() -> int:
    try:
        data=_medication_state(); now=datetime.datetime.now(); due_rows=_medication_due_now(data,now)
        if not due_rows:
            _medication_schedule_next_task(data); return 0

        sections=[]
        for _,profile_id,profile,group in due_rows:
            profile_label=str(profile.get("profileName") or "Profilo").strip() or "Profilo"
            item_lines=[]
            for stock in group:
                owner=str(stock.get("ownerProfileName") or "").strip()
                owner_prefix=(owner + " · ") if owner and owner.casefold()!=profile_label.casefold() else ""
                item_lines.append(f"• {owner_prefix}{stock.get('medication') or 'Farmaco'} · nuova scorta necessaria dal {_medication_format_date(str(stock.get('depletionDate') or ''))}")
            sections.append(profile_label+"\n"+"\n".join(item_lines))

        multi=len(due_rows)>1 or len({row[1] for row in due_rows})>1
        content="\n\n".join(sections)+"\n\nConferma '"+("Tutto acquistato" if multi else "Acquistato")+"' solo quando tutte le nuove scorte elencate sono realmente disponibili. Se una quantità acquistata è diversa da quella abituale, apri il Dossier per aggiornarla."
        action=_medication_task_dialog("Riordino farmaci",content,multi=multi)
        if action=="open":
            try: subprocess.Popen([str(ROOT / "ClinicaDigitaleAppLauncher.exe")],creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
            except Exception: pass
            action="snooze"

        if action=="purchased":
            purchase_at=datetime.datetime.now(); purchase_date=purchase_at.date().isoformat(); actions=data.setdefault("actions",[])
            touched_profiles=set()
            for _,profile_id,profile,group in due_rows:
                touched_profiles.add(profile_id)
                for stock in group:
                    previous=str(stock.get("depletionDate") or ""); cycle_start=previous
                    total=float(stock.get("totalUnits") or (float(stock.get("packUnits") or 0)*float(stock.get("packCount") or 1)))
                    next_depletion=_medication_depletion_date(cycle_start,total,float(stock.get("dailyUnits") or 0),list(stock.get("therapyDays") or []))
                    if not next_depletion: continue
                    next_reorder=(_medication_parse_date(next_depletion)-datetime.timedelta(days=_medication_lead_days(stock))).isoformat()
                    aid=secrets.token_urlsafe(12)
                    action_profile_id=str(stock.get("ownerProfileId") or profile_id)
                    action_stock_key=str(stock.get("originalStockKey") or stock.get("stockKey") or "")
                    actions.append({"id":aid,"type":"purchased","profileId":action_profile_id,"stockKey":action_stock_key,"sourceTherapyIds":list(stock.get("sourceTherapyIds") or []),"purchasedAt":purchase_at.isoformat(),"purchaseDate":purchase_date,"cycleStartDate":cycle_start,"previousDepletionDate":previous,"packCount":stock.get("packCount"),"packUnits":stock.get("packUnits")})
                    stock["packStartDate"]=cycle_start;stock["depletionDate"]=next_depletion;stock["reorderDate"]=next_reorder;stock["snoozeUntil"]="";stock["backgroundAdvanced"]=True
                profile["stocks"]={str(x.get("stockKey") or x.get("therapyId") or ""):x for x in (profile.get("stocks") or {}).values() if isinstance(x,dict) and (x.get("stockKey") or x.get("therapyId"))}
            for profile_id in touched_profiles:
                profile=(data.get("profiles") or {}).get(profile_id)
                if isinstance(profile,dict): _medication_google_reconcile_profile(profile_id,profile)
        else:
            until=(datetime.datetime.now()+datetime.timedelta(hours=MEDICATION_REMINDER_SNOOZE_HOURS)).isoformat(timespec="seconds")
            for _,profile_id,profile,group in due_rows:
                group_keys={str(x.get("stockKey") or "") for x in group}
                for key,stock in (profile.get("stocks") or {}).items():
                    if str(key) in group_keys and isinstance(stock,dict): stock["snoozeUntil"]=until

        _medication_write_state(data);_medication_schedule_next_task(data);return 0
    except Exception:
        try: _medication_schedule_next_task(_medication_state())
        except Exception: pass
        return 1


_calendar_cleanup_legacy_google()

# V6.0.1 lifecycle fix: when the Dossier browser window is closed,
# the local Python engine is shut down as well. A short grace period
# prevents a normal page reload from terminating the engine.
APP_LIFECYCLE_LOCK = threading.Lock()
APP_LAST_HEARTBEAT = 0.0
APP_CLOSE_REQUESTED_AT = 0.0
APP_ACTIVE_LIFECYCLE_ID = ""
APP_CLOSING_LIFECYCLE_ID = ""
APP_STOP_EVENT = threading.Event()
APP_SHELL_LOCK = threading.RLock()
APP_SHELL_PROC = None
# R35: stato di chiusura esplicito, visibile immediatamente ai launcher concorrenti.
APP_EXPLICIT_CLOSING_EVENT = threading.Event()
APP_CLOSE_GRACE_SECONDS = 3.0
# L'heartbeat resta diagnostico. Non deve mai terminare il motore: i browser
# possono rallentare o sospendere i timer delle schede in background.
APP_HEARTBEAT_TIMEOUT_SECONDS = 0.0
APP_LEASE_LOCK = threading.RLock()
APP_ACTIVE_LEASES: set[str] = set()
# R30: modalità verifier esplicita. Il file viene reinstallato a ogni
# aggiornamento/installazione e resta presente per tutta la verifica del CORE.
# Viene eliminato soltanto quando il CORE chiude esplicitamente il verifier.
INSTALLER_VERIFY_ONCE_MARKER = RUNTIME_STATE_DIR / "INSTALLER_VERIFY_R35.flag"
LEGACY_INSTALLER_VERIFY_ONCE_MARKER = ROOT / "runtime" / "INSTALLER_VERIFY_R35.flag"

def _installer_verify_marker_present() -> bool:
    try:
        return INSTALLER_VERIFY_ONCE_MARKER.is_file() or LEGACY_INSTALLER_VERIFY_ONCE_MARKER.is_file()
    except OSError:
        return False

def _clear_installer_verify_marker() -> None:
    errors = []
    for marker in (INSTALLER_VERIFY_ONCE_MARKER, LEGACY_INSTALLER_VERIFY_ONCE_MARKER):
        try: marker.unlink(missing_ok=True)
        except OSError as exc: errors.append(str(exc))
    if errors:
        print(f"Impossibile rimuovere il marcatore verifier: {'; '.join(errors)}", flush=True)

# V6.0.4: OCR asincrono con avanzamento reale per documenti multipagina.
OCR_JOBS_LOCK = threading.Lock()
OCR_JOBS: dict[str, dict] = {}
OCR_JOB_TTL_SECONDS = 60 * 60

def _cleanup_ocr_jobs():
    cutoff = time.time() - OCR_JOB_TTL_SECONDS
    with OCR_JOBS_LOCK:
        stale = [job_id for job_id, job in OCR_JOBS.items() if float(job.get("updatedAt", 0) or 0) < cutoff]
        for job_id in stale:
            OCR_JOBS.pop(job_id, None)

def _update_ocr_job(job_id: str, **values):
    with OCR_JOBS_LOCK:
        job = OCR_JOBS.get(job_id)
        if not job:
            return
        job.update(values)
        job["updatedAt"] = time.time()

def _run_ocr_job(job_id: str, temp_path: str, original_name: str):
    started = time.perf_counter()
    def progress(info):
        data = dict(info or {})
        _update_ocr_job(
            job_id,
            progress=max(0.0, min(100.0, float(data.get("progress", 0) or 0))),
            stage=str(data.get("stage", "analysis") or "analysis"),
            message=str(data.get("message", "Analisi in corso") or "Analisi in corso"),
            processedPages=int(data.get("processedPages", 0) or 0),
            totalPages=int(data.get("totalPages", 0) or 0),
        )
    try:
        result = analyze_path(temp_path, original_name, progress_callback=progress)
        result.update({
            "ok": True,
            "language": "it-Latn",
            "originalName": original_name,
            "elapsedSeconds": round(time.perf_counter() - started, 2),
        })
        _update_ocr_job(
            job_id, done=True, progress=100.0, stage="complete",
            message="Analisi del documento completata",
            processedPages=int(result.get("processedPages", 0) or 0),
            totalPages=int(result.get("pageCount", 0) or 0),
            result=result, error="",
        )
    except Exception as exc:
        traceback.print_exc()
        _update_ocr_job(job_id, done=True, progress=100.0, stage="error", message="Analisi non riuscita", error=str(exc), result=None)
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass

def app_heartbeat(lifecycle_id: str = ""):
    global APP_LAST_HEARTBEAT, APP_CLOSE_REQUESTED_AT, APP_ACTIVE_LIFECYCLE_ID, APP_CLOSING_LIFECYCLE_ID
    now = time.monotonic()
    lifecycle_id = str(lifecycle_id or "").strip()[:160]
    with APP_LIFECYCLE_LOCK:
        # Un heartbeat già partito dalla finestra che si sta chiudendo non deve
        # annullare la richiesta di arresto. Un reload reale genera invece un
        # lifecycle_id nuovo e mantiene correttamente in vita il motore.
        if APP_CLOSE_REQUESTED_AT and lifecycle_id and lifecycle_id == APP_CLOSING_LIFECYCLE_ID:
            return
        APP_LAST_HEARTBEAT = now
        if lifecycle_id:
            APP_ACTIVE_LIFECYCLE_ID = lifecycle_id
        APP_CLOSE_REQUESTED_AT = 0.0
        APP_CLOSING_LIFECYCLE_ID = ""


def app_closing(lifecycle_id: str = ""):
    global APP_CLOSE_REQUESTED_AT, APP_CLOSING_LIFECYCLE_ID
    lifecycle_id = str(lifecycle_id or "").strip()[:160]
    with APP_LIFECYCLE_LOCK:
        APP_CLOSE_REQUESTED_AT = time.monotonic()
        APP_CLOSING_LIFECYCLE_ID = lifecycle_id or APP_ACTIVE_LIFECYCLE_ID


def app_lease_opened(lifecycle_id: str) -> None:
    global APP_CLOSE_REQUESTED_AT, APP_ACTIVE_LIFECYCLE_ID, APP_CLOSING_LIFECYCLE_ID
    lifecycle_id = str(lifecycle_id or "").strip()[:160]
    if not lifecycle_id:
        return
    with APP_LEASE_LOCK:
        APP_ACTIVE_LEASES.add(lifecycle_id)
    with APP_LIFECYCLE_LOCK:
        APP_ACTIVE_LIFECYCLE_ID = lifecycle_id
        APP_CLOSE_REQUESTED_AT = 0.0
        APP_CLOSING_LIFECYCLE_ID = ""


def app_lease_closed(lifecycle_id: str) -> None:
    lifecycle_id = str(lifecycle_id or "").strip()[:160]
    if not lifecycle_id:
        return
    with APP_LEASE_LOCK:
        APP_ACTIVE_LEASES.discard(lifecycle_id)
        remaining = bool(APP_ACTIVE_LEASES)
    if not remaining and not INSTALLER_VERIFY_MODE and not APP_STOP_EVENT.is_set():
        # A reload closes the old lease before opening the new one. The normal
        # close grace period absorbs that brief transition without leaving the
        # engine resident after a real browser/window termination.
        app_closing(lifecycle_id)


def lifecycle_watchdog():
    while not APP_STOP_EVENT.wait(0.25):
        now = time.monotonic()
        with APP_LIFECYCLE_LOCK:
            requested = APP_CLOSE_REQUESTED_AT
        if requested and now - requested >= APP_CLOSE_GRACE_SECONDS:
            print("Chiusura interfaccia rilevata: arresto completo del motore locale.", flush=True)
            APP_STOP_EVENT.set()
            return


def terminate_owned_children():
    # Chiude esclusivamente la shell avviata da questa istanza. Non esegue scansioni
    # globali dei processi e non termina processi per somiglianza di nome/comando.
    global APP_SHELL_PROC
    with APP_SHELL_LOCK:
        proc = APP_SHELL_PROC
        APP_SHELL_PROC = None
    if proc is not None:
        try:
            if proc.poll() is None:
                # Normal closure is initiated by the UI/native window. Let the
                # shell finish its own WM_CLOSE sequence first so the embedded
                # page can dispatch /api/app/close and Chromium can close cleanly.
                try:
                    proc.wait(timeout=2.5)
                except subprocess.TimeoutExpired:
                    proc.terminate()
                    try:
                        proc.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        proc.kill()
        except Exception:
            pass


def terminate_owned_browser():
    """Terminate only the dedicated browser process tree launched by this engine."""
    global APP_BROWSER_PROC
    with APP_BROWSER_LOCK:
        proc = APP_BROWSER_PROC
        APP_BROWSER_PROC = None
    if proc is None:
        return
    try:
        if proc.poll() is not None:
            return
        if os.name == "nt":
            flags = int(getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000))
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8, creationflags=flags)
        else:
            proc.terminate()
    except Exception:
        try:
            if proc.poll() is None:
                proc.kill()
        except Exception:
            pass


def _windows_desktop_dir() -> Path | None:
    if os.name != "nt":
        return None
    try:
        import winreg
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path) as key:
            value, _ = winreg.QueryValueEx(key, "Desktop")
        expanded = os.path.expandvars(str(value))
        return Path(expanded)
    except Exception:
        home = Path(os.environ.get("USERPROFILE", ""))
        return home / "Desktop" if str(home) else None


def _consolidate_dossier_shortcuts_in(folder: Path | None):
    """Keep one stable Dossier shortcut and replace obsolete/versioned copies."""
    if os.name != "nt" or folder is None:
        return
    try:
        folder = Path(folder)
        if not folder.is_dir():
            return
        candidates = [p for p in folder.glob("Dossier Sanitario Locale*.lnk") if p.is_file()]
        if not candidates:
            return
        stable = folder / "Dossier Sanitario Locale.lnk"
        exact = folder / f"Dossier Sanitario Locale V{VERSION}.lnk"
        if exact.exists():
            source = exact
        else:
            source = max(candidates, key=lambda p: p.stat().st_mtime_ns)
        if source != stable:
            tmp = folder / "Dossier Sanitario Locale.__nuovo__.lnk"
            shutil.copy2(source, tmp)
            os.replace(tmp, stable)
        for item in candidates:
            if item != stable:
                try:
                    item.unlink()
                except OSError:
                    pass
    except Exception as error:
        print(f"Pulizia collegamenti non completata: {error}", flush=True)


def _ps_quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _ensure_dossier_shortcut(folder: Path | None) -> bool:
    """Create/repair the user shortcut so it targets the actual app launcher.

    The installer-created link is not trusted as the only launch path: on some
    Windows 10/11 installations the historical StartHost wrapper can return while
    the local engine is still alive, making a Desktop double-click appear to do
    nothing. The stable shortcut now points directly to AppLauncher, while the
    icon is read from the dedicated .ico file rather than from an EXE resource.
    """
    if os.name != "nt" or folder is None:
        return False
    folder = Path(folder)
    target = ROOT / "ClinicaDigitaleAppLauncher.exe"
    icon = ROOT / "assets" / "dossier_sanitario.ico"
    if not target.exists() or not icon.exists():
        return False
    try:
        folder.mkdir(parents=True, exist_ok=True)
        link = folder / "Dossier Sanitario Locale.lnk"
        script = (
            "$ErrorActionPreference='Stop';"
            "$ws=New-Object -ComObject WScript.Shell;"
            f"$s=$ws.CreateShortcut({_ps_quote(str(link))});"
            f"$s.TargetPath={_ps_quote(str(target))};"
            f"$s.WorkingDirectory={_ps_quote(str(ROOT))};"
            f"$s.IconLocation={_ps_quote(str(icon)+',0')};"
            "$s.Description='Clinica Digitale - Dossier Sanitario';"
            "$s.WindowStyle=1;"
            "$s.Save();"
        )
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout or "creazione collegamento non riuscita").strip())
        return link.exists()
    except Exception as error:
        print(f"Riparazione collegamento non completata: {error}", flush=True)
        return False


def consolidate_dossier_shortcuts():
    if os.name != "nt":
        return
    desktop = _windows_desktop_dir()
    _consolidate_dossier_shortcuts_in(desktop)
    _ensure_dossier_shortcut(desktop)
    appdata = Path(os.environ.get("APPDATA", ""))
    if str(appdata):
        programs = appdata / "Microsoft" / "Windows" / "Start Menu" / "Programs"
        _consolidate_dossier_shortcuts_in(programs)
        _consolidate_dossier_shortcuts_in(programs / "Dossier Sanitario Locale")
        # Repair whichever Start Menu location already exists, without creating
        # additional duplicate folders solely for the sake of the shortcut.
        if (programs / "Dossier Sanitario Locale").is_dir():
            _ensure_dossier_shortcut(programs / "Dossier Sanitario Locale")
        else:
            _ensure_dossier_shortcut(programs)



def _sanitize_download_filename(name: str) -> str:
    value = str(name or "documento").replace("\\", "_").replace("/", "_").replace("\r", " ").replace("\n", " ").strip()
    value = "".join(ch for ch in value if ord(ch) >= 32 and ch not in '<>:"|?*')
    value = value.strip(" .")[:180]
    return value or "documento"


def _cleanup_document_previews(now=None):
    now = time.time() if now is None else float(now)
    with DOCUMENT_PREVIEW_LOCK:
        expired = [token for token, row in DOCUMENT_PREVIEWS.items() if float(row.get("expiresAt", 0)) <= now or not Path(row.get("path", "")).exists()]
        for token in expired:
            row = DOCUMENT_PREVIEWS.pop(token, None) or {}
            try:
                Path(row.get("path", "")).unlink(missing_ok=True)
            except Exception:
                pass
    try:
        DOCUMENT_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        for child in DOCUMENT_PREVIEW_DIR.iterdir():
            if child.is_file() and now - child.stat().st_mtime > DOCUMENT_PREVIEW_TTL * 2:
                child.unlink(missing_ok=True)
    except Exception:
        pass


def _create_document_preview(raw: bytes, original_name: str, mime_type: str):
    _cleanup_document_previews()
    DOCUMENT_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    name = _sanitize_download_filename(original_name)
    ext = Path(name).suffix
    token = secrets.token_urlsafe(24)
    temp_name = f"preview_{secrets.token_hex(8)}{ext}"
    path = DOCUMENT_PREVIEW_DIR / temp_name
    path.write_bytes(raw)
    guessed = mimetypes.guess_type(name)[0] or "application/octet-stream"
    mime = str(mime_type or guessed).split(";", 1)[0].strip() or guessed
    with DOCUMENT_PREVIEW_LOCK:
        DOCUMENT_PREVIEWS[token] = {"path": str(path), "name": name, "mime": mime, "expiresAt": time.time() + DOCUMENT_PREVIEW_TTL}
    return token, name, mime


def module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def json_bytes(data) -> bytes:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


class CommonHeadersMixin:
    def end_headers(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-File-Name, X-Mime-Type, X-Remote-Path, X-Dossier-Request, X-Dossier-Session, X-Dossier-Client, X-Doctor-Export-Id, X-Relative-Path, X-Optimize-Medical")
        self.send_header("Access-Control-Expose-Headers", "Content-Disposition")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class StaticHandler(CommonHeadersMixin, SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print(time.strftime("%H:%M:%S"), "WEB", fmt % args, flush=True)

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        if path in {"/", "/index.html"}:
            current = urllib.parse.parse_qs(parsed.query).get("v", [""])[0]
            if current != UI_VERSION:
                self.send_response(302)
                self.send_header("Location", f"/index.html?v={UI_VERSION}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.path = "/index.html"
        else:
            self.path = path
        return super().do_GET()


class ApiHandler(CommonHeadersMixin, BaseHTTPRequestHandler):
    server_version = "DossierSanitarioPython/6.0"

    def log_message(self, fmt, *args):
        print(time.strftime("%H:%M:%S"), "API", fmt % args, flush=True)

    def send_json(self, status: int, data):
        payload = json_bytes(data)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_html(self, status: int, html: str):
        payload = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def auth_token(self) -> str:
        return str(self.headers.get("X-Dossier-Session", "") or "").strip()

    def auth_response(self, action):
        try:
            result = action()
            self.send_json(200, {"ok": True, **(result or {})})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc()
            self.send_json(500, {"ok": False, "error": f"Errore autenticazione: {exc}", "code": "auth_internal"})

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        if path == "/api/license/status":
            force = str((urllib.parse.parse_qs(parsed.query or "").get("force") or [""])[0]).lower() in {"1","true","yes"}
            self.send_json(200, LICENSES.status(force=force)); return
        required_plan = _license_required_for(path, "GET")
        allowed, gate = _license_gate_result(required_plan)
        if not allowed:
            self.send_json(403, gate); return
        account_allowed, account_gate = _request_account_plan_gate(self.auth_token())
        if not account_allowed:
            self.send_json(403, account_gate); return
        if path == "/api/app/lease":
            lifecycle_id = str((urllib.parse.parse_qs(parsed.query or "").get("lifecycleId") or [""])[0]).strip()[:160]
            if not lifecycle_id:
                self.send_json(400, {"ok": False, "error": "Identificativo finestra mancante"}); return
            origin = self.headers.get("Origin", "")
            if origin and origin not in ALLOWED_ORIGINS:
                self.send_json(403, {"ok": False, "error": "Origine non autorizzata"}); return
            app_lease_opened(lifecycle_id)
            try:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Accel-Buffering", "no")
                self.end_headers()
                while not APP_STOP_EVENT.wait(1.5):
                    self.wfile.write(b": clinica-digitale-alive\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                pass
            finally:
                app_lease_closed(lifecycle_id)
            return
        if path == "/" and ("code" in urllib.parse.parse_qs(parsed.query) or "error" in urllib.parse.parse_qs(parsed.query)):
            self.handle_calendar_google_oauth_callback(parsed); return
        if path == "/api/calendar/google/status":
            try:
                self._calendar_session()
                self.send_json(200, {"ok": True, **_google_calendar_status()})
            except AuthError as exc: self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
            except Exception as exc: self.send_json(500, {"ok": False, "error": str(exc)})
            return
        if path == "/api/calendar/google/events/status":
            try:
                self._calendar_session()
                query = urllib.parse.parse_qs(parsed.query or "")
                raw_ids = (query.get("ids") or [""])[0]
                ids = [urllib.parse.unquote(x) for x in raw_ids.split(",") if x][:1000]
                self.send_json(200, {"ok": True, "events": _google_calendar_event_link_status(ids)})
            except AuthError as exc: self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
            except Exception as exc: self.send_json(500, {"ok": False, "error": str(exc)})
            return
        if path == "/api/document-preview":
            _cleanup_document_previews()
            token = urllib.parse.parse_qs(parsed.query).get("token", [""])[0]
            with DOCUMENT_PREVIEW_LOCK:
                row = dict(DOCUMENT_PREVIEWS.get(token) or {})
            file_path = Path(row.get("path", "")) if row else None
            if not row or not file_path or not file_path.exists():
                self.send_html(404, "<h1>Anteprima non più disponibile</h1><p>Riapri il documento dal Dossier.</p>")
                return
            raw = file_path.read_bytes()
            name = _sanitize_download_filename(row.get("name") or file_path.name)
            ascii_name = ''.join(ch if 32 <= ord(ch) < 127 and ch not in '\"' else '_' for ch in name) or 'documento'
            encoded_name = urllib.parse.quote(name, safe='')
            self.send_response(200)
            self.send_header("Content-Type", row.get("mime") or "application/octet-stream")
            self.send_header("Content-Disposition", f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{encoded_name}")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return
        if path == "/api/system/first-use":
            first_use = _read_json_file(FIRST_USE_ACK_FILE, {})
            accepted = bool(isinstance(first_use, dict) and first_use.get("accepted") is True and str(first_use.get("noticeVersion") or "") == FIRST_USE_NOTICE_VERSION)
            self.send_json(200, {"ok": True, "accepted": accepted, "noticeVersion": FIRST_USE_NOTICE_VERSION})
            return
        if path == "/api/auth/status":
            self.auth_response(lambda: AUTH.status())
            return
        if path == "/api/auth/device-cloud-status":
            self.send_json(200, {"ok": True, "linked": _device_cloud_linked()})
            return
        if path == "/api/auth/recovery-question":
            try:
                email = urllib.parse.parse_qs(parsed.query).get("email", [""])[0]
                self.send_json(200, {"ok": True, **AUTH.recovery_question(email)})
            except AuthError as exc:
                self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
            except Exception as exc:
                self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})
            return
        if path == "/api/auth/account-export":
            self.auth_response(lambda: {"account": AUTH.export_current_account(self.auth_token())})
            return
        if path == "/api/auth/family-temporary":
            self.auth_response(lambda: {"accesses": AUTH.list_temporary_family_accesses(self.auth_token())})
            return
        if path == "/api/cloud/remote-export":
            try:
                AUTH.require_session(self.auth_token(), administrator=True)
                name = urllib.parse.parse_qs(parsed.query).get("name", [""])[0]
                self.send_json(200, {"ok": True, "name": name, "section": _rclone_section(name)})
            except AuthError as exc:
                self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
            except Exception as exc:
                self.send_json(500, {"ok": False, "error": str(exc)})
            return
        if path == "/api/auth/users":
            self.auth_response(lambda: {"users": AUTH.list_users(self.auth_token())})
            return
        if path == "/api/auth/health-access":
            self.auth_response(lambda: AUTH.health_access_status(self.auth_token()))
            return
        if path == "/api/auth/preferences":
            self.auth_response(lambda: {"preferences": AUTH.get_preferences(self.auth_token())})
            return
        if path == "/api/auth/warnings":
            self.auth_response(lambda: AUTH.get_warnings_status(self.auth_token()))
            return
        if path == "/api/auth/backup":
            self.auth_response(lambda: {"bundle": AUTH.export_backup(self.auth_token())})
            return
        if path == "/api/ocr/status":
            _cleanup_ocr_jobs()
            job_id = urllib.parse.parse_qs(parsed.query).get("id", [""])[0]
            with OCR_JOBS_LOCK:
                job = OCR_JOBS.get(job_id)
                snapshot = dict(job) if job else None
            if not snapshot:
                self.send_json(404, {"ok": False, "error": "Analisi OCR non trovata"})
                return
            response = {k: v for k, v in snapshot.items() if k not in {"createdAt", "updatedAt"}}
            response["ok"] = not bool(response.get("error"))
            self.send_json(200, response)
            return
        if path == "/api/calendar/local/status":
            try:
                AUTH.require_session(self.auth_token())
                supported = os.name == "nt" and REMINDER_EXE.exists()
                med_state=_medication_state();med_due=_medication_next_due(med_state)
                self.send_json(200, {"ok": True, "supported": supported, "engine": "Windows Task Scheduler" if supported else "Controllo interno mentre il Dossier è aperto", "scheduledEvents": len(_calendar_manifest()) if supported else 0, "medicationReminder": {"singleTask": True, "scheduled": bool(med_due)}})
            except AuthError as exc:
                self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
            except Exception as exc:
                self.send_json(500, {"ok": False, "error": str(exc)})
            return
        if path == "/api/calendar/medication/local/actions":
            try:
                AUTH.require_session(self.auth_token())
                profile_id=urllib.parse.parse_qs(parsed.query).get("profileId",[""])[0]
                self.send_json(200,{"ok":True,"actions":_medication_actions_for_profile(profile_id)})
            except AuthError as exc:
                self.send_json(exc.status,{"ok":False,"error":str(exc),"code":exc.code})
            except Exception as exc:
                self.send_json(500,{"ok":False,"error":str(exc)})
            return
        if path == "/api/updates/environment":
            try:
                self.send_json(200, {"ok": True, **_update_environment_status()})
            except Exception as exc:
                self.send_json(200, {"ok": False, "autoDownloadEligible": False, "error": str(exc)})
            return
        if path == "/api/updates/check":
            try:
                cfg = _load_update_config()
                manifest = _fetch_update_manifest(cfg)
                self.send_json(200, {"ok": True, **manifest, "displayCurrentVersion": cfg.get("displayVersion", VERSION), "channel": cfg.get("channel", ""), "environment": _update_environment_status()})
            except Exception as exc:
                self.send_json(200, {"ok": False, "available": False, "error": str(exc), "currentVersion": _load_update_config().get("currentVersion", VERSION), "environment": _update_environment_status()})
            return
        if path == "/api/diagnostics/status":
            try:
                cfg = _load_diagnostics_config(); inst = _diagnostics_installation()
                self.send_json(200, {"ok": True, "config": cfg, "installationId": inst.get("installationId"), "consents": inst.get("consents", {})})
            except Exception as exc:
                self.send_json(500, {"ok": False, "error": str(exc)})
            return
        if path == "/api/diagnostics/report-package":
            self.handle_diagnostics_report_package()
            return
        if path == "/api/health":
            query = urllib.parse.parse_qs(parsed.query)
            launcher_probe = query.get("probe", [""])[0] == "launcher"
            # R30: un normale /api/health non modifica mai il ciclo di vita del
            # motore. Il CORE installer chiude esplicitamente il verifier tramite
            # POST /api/app/close. In questo modo una richiesta health tardiva non
            # puo trasformare l'avvio finale dell'utente in un verifier e spegnerlo.
            rapid = module_available("rapidocr") and module_available("onnxruntime")
            pdf = module_available("pypdfium2")
            self.send_json(200, {
                "ok": bool(pdf), "ocrAvailable": rapid, "ocrInitialized": False,
                "ocrDeferred": True, "nativePdfAvailable": pdf, "scannerAvailable": None,
                "scannerChecked": False, "language": "it-Latn",
                "engine": "Python integrato · PDFium con coordinate · RapidOCR ONNX",
                "error": "" if pdf else "Motore PDF Python non installato", "version": VERSION,
                "uiVersion": UI_VERSION,
                "installerProbeSeen": bool(INSTALLER_VERIFY_MODE and not launcher_probe),
                "installerVerifyMode": bool(INSTALLER_VERIFY_MODE),
                "closing": bool(APP_STOP_EVENT.is_set() or APP_EXPLICIT_CLOSING_EVENT.is_set()),
            })
            # R36: il motore avviato espressamente come verifier dall'installer
            # deve liberare le porte subito dopo il probe riuscito. Il POST /close
            # resta supportato, ma non e piu l'unico modo per terminare il verifier.
            # Il probe del launcher (?probe=launcher) non spegne mai un'istanza.
            if INSTALLER_VERIFY_MODE and not launcher_probe:
                _clear_installer_verify_marker()
                APP_EXPLICIT_CLOSING_EVENT.set()
                threading.Timer(0.75, APP_STOP_EVENT.set).start()
            return
        if path == "/api/security/qr":
            self.handle_qr(urllib.parse.parse_qs(parsed.query).get("data", [""])[0])
            return
        if path == "/api/local/status":
            APP_DATA_DIR.mkdir(parents=True, exist_ok=True); BACKUP_DIR.mkdir(parents=True, exist_ok=True); DATA_DIR.mkdir(parents=True, exist_ok=True); DEFAULT_MEDIA_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
            usage = shutil.disk_usage(APP_DATA_DIR); media_status = _media_archive_status()
            self.send_json(200, {"ok": True, "appDataDir": str(APP_DATA_DIR), "backupDir": str(BACKUP_DIR), "dataDir": str(DATA_DIR), "mediaArchiveDir": media_status.get("path"), "mediaArchiveAvailable": media_status.get("available"), "freeBytes": usage.free})
            return
        if path == "/api/media/archive/status":
            self.handle_media_archive_status(); return
        if path == "/api/media/file":
            self.handle_media_file(parsed); return
        if path == "/api/cloud/status":
            self.send_json(200, cloud_status())
            return
        if path == "/api/cloud/quota":
            query = urllib.parse.parse_qs(parsed.query)
            self.handle_cloud_quota(query.get("remote", [""])[0])
            return
        if path == "/api/cloud/remotes":
            try:
                result = run_rclone(["listremotes"], timeout=30)
                remotes = [line.rstrip(":") for line in result["stdout"].splitlines() if line.strip()]
                self.send_json(200, {"ok": True, "remotes": remotes})
            except Exception as exc:
                self.send_json(500, {"ok": False, "error": str(exc)})
            return
        if path == "/api/cloud/discover":
            query = urllib.parse.parse_qs(parsed.query)
            remote = query.get("remote", [""])[0]
            base_path = query.get("basePath", ["Dossier Sanitario Locale"])[0]
            self.handle_cloud_discover(remote, base_path)
            return
        if path == "/api/cloud/list":
            query = urllib.parse.parse_qs(parsed.query)
            remote = query.get("remote", [""])[0]
            self.handle_cloud_list(remote)
            return
        if path == "/api/cloud/download":
            query = urllib.parse.parse_qs(parsed.query)
            remote = query.get("remote", [""])[0]
            self.handle_cloud_download(remote)
            return
        if path == "/api/cloud/stream":
            query = urllib.parse.parse_qs(parsed.query)
            remote = query.get("remote", [""])[0]
            self.handle_cloud_stream(remote)
            return
        if path == "/api/cloud/download-progress":
            query = urllib.parse.parse_qs(parsed.query)
            self.handle_cloud_download_progress(query.get("id", [""])[0])
            return
        if path == "/api/cloud/download-chunk":
            query = urllib.parse.parse_qs(parsed.query)
            self.handle_cloud_download_chunk(query.get("id", [""])[0], query.get("offset", ["0"])[0], query.get("length", ["0"])[0])
            return
        if path == "/api/cloud/upload-progress":
            query = urllib.parse.parse_qs(parsed.query)
            self.handle_cloud_upload_progress(query.get("id", [""])[0])
            return
        if path == "/api/cloud/stat":
            query = urllib.parse.parse_qs(parsed.query)
            self.handle_cloud_stat(query.get("remote", [""])[0])
            return
        self.send_json(404, {"ok": False, "error": "Endpoint non trovato"})

    def handle_qr(self, data: str):
        if not data or len(data) > 4096:
            self.send_json(400, {"ok": False, "error": "Dati QR non validi"})
            return
        try:
            vendor = ENGINE_DIR / "vendor"
            if str(vendor) not in sys.path:
                sys.path.insert(0, str(vendor))
            import qrcode
            import qrcode.image.svg
            image = qrcode.make(data, image_factory=qrcode.image.svg.SvgPathImage, box_size=7, border=3)
            stream = io.BytesIO(); image.save(stream); payload = stream.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers(); self.wfile.write(payload)
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": f"QR non disponibile: {exc}"})

    def handle_cloud_quota(self, remote: str):
        try:
            name = str(remote or "").strip().rstrip(":")
            if not name or not re.fullmatch(r"[A-Za-z0-9_.-]{1,120}", name):
                self.send_json(400, {"ok": False, "error": "Connessione cloud non valida"}); return
            spec = f"{name}:"
            try:
                result = run_rclone(["about", spec, "--json"], timeout=120)
                payload = parse_rclone_json(result.get("stdout", ""))
                total = int(payload.get("total") or 0); used = int(payload.get("used") or 0); free_raw = payload.get("free"); free = int(free_raw if free_raw is not None else max(0, total-used))
                supported = any(key in payload for key in ("total", "used", "free"))
                self.send_json(200, {"ok": True, "supported": bool(supported), "total": total, "used": used, "free": free, "trashed": int(payload.get("trashed") or 0), "other": int(payload.get("other") or 0)})
            except Exception as exc:
                self.send_json(200, {"ok": True, "supported": False, "total": 0, "used": 0, "free": 0, "error": _friendly_cloud_error(exc)})
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_cloud_discover(self, remote: str, base_path: str):
        if not valid_remote_path(remote):
            self.send_json(400, {"ok": False, "error": "Percorso cloud non valido"}); return
        try:
            result = discover_dossier_archives(remote, base_path)
            self.send_json(200, {"ok": True, **result})
        except Exception as exc:
            traceback.print_exc()
            self.send_json(500, {"ok": False, "error": "Non è stato possibile verificare l’archivio del Dossier nel servizio cloud."})

    def handle_cloud_list(self, remote: str):
        if not valid_remote_path(remote):
            self.send_json(400, {"ok": False, "error": "Percorso cloud non valido"}); return
        try:
            items = rc_remote_list(remote, recursive=True, files_only=True)
            self.send_json(200, {"ok": True, "items": items})
        except Exception as exc:
            text = str(exc).lower()
            if "not found" in text or "directory" in text and "found" in text:
                self.send_json(200, {"ok": True, "items": []}); return
            self.send_json(500, {"ok": False, "error": "Non è stato possibile leggere l’archivio cloud. Riprova la sincronizzazione."})

    def handle_cloud_stat(self, remote: str):
        if not valid_remote_path(remote):
            self.send_json(400, {"ok": False, "error": "Percorso cloud non valido"}); return
        try:
            item = rc_remote_stat(remote, allow_missing=True)
            self.send_json(200, {"ok": True, "exists": bool(item), "item": item or None})
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})


    def handle_cloud_download(self, remote: str):
        if not valid_remote_path(remote):
            self.send_json(400, {"ok": False, "error": "Percorso cloud non valido"}); return

        # La lista e il download devono vedere lo stesso stato MEGA.
        # Non eseguire un preflight stat separato e non creare un file locale
        # temporaneo: cat legge direttamente l'oggetto indicato dalla CLI.
        last_error = None
        for attempt in range(3):
            try:
                payload = run_rclone_bytes(["cat", remote], timeout=900)
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(len(payload)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(payload)
                return
            except Exception as exc:
                last_error = exc
                if _rclone_not_found(exc):
                    if attempt < 2:
                        time.sleep((0.45, 1.20)[attempt])
                        continue
                    self.send_json(404, {
                        "ok": False,
                        "code": "cloud_remote_missing",
                        "error": "File cloud non trovato. Il Dossier lo rinviera alla prossima sincronizzazione."
                    })
                    return
                if attempt < 2:
                    time.sleep((0.45, 1.20)[attempt])
                    continue
                break

        self.send_json(500, {"ok": False, "error": _friendly_cloud_error(last_error)})

    def handle_cloud_stream(self, remote: str):
        """Scarica prima il file cloud in TEMP proprietario, lo verifica e solo
        dopo lo trasferisce al browser locale. Evita che una breve interruzione
        MEGA/rclone tronchi uno snapshot durante il ripristino.
        """
        if not valid_remote_path(remote):
            self.send_json(400, {"ok": False, "error": "Percorso cloud non valido"}); return
        staged = None
        started = False
        try:
            stat = parse_rclone_json(run_rclone(["lsjson", remote, "--stat"], timeout=90)["stdout"])
            expected_size = int(stat.get("Size", -1) or -1)
            stage_dir = SESSION_TEMP_DIR / "cloud_downloads"
            stage_dir.mkdir(parents=True, exist_ok=True)
            staged = stage_dir / ("cloud_" + secrets.token_hex(16) + ".bin")
            last_error = None
            for attempt in range(3):
                try:
                    staged.unlink(missing_ok=True)
                    run_rclone([
                        "copyto", remote, str(staged),
                        "--retries", "8",
                        "--low-level-retries", "20",
                        "--retries-sleep", "2s",
                        "--transfers", "1",
                        "--checkers", "1",
                    ], timeout=1800)
                    if not staged.exists():
                        raise RuntimeError("Il file cloud non è stato creato nel deposito temporaneo locale")
                    actual_size = staged.stat().st_size
                    if expected_size >= 0 and actual_size != expected_size:
                        raise RuntimeError(f"Download cloud incompleto: attesi {expected_size} byte, ricevuti {actual_size}")
                    break
                except Exception as exc:
                    last_error = exc
                    staged.unlink(missing_ok=True)
                    if attempt < 2:
                        time.sleep((1.0, 2.5)[attempt])
                        continue
                    raise
            size = staged.stat().st_size
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(size))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            started = True
            with staged.open("rb") as source:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:
            try:
                if not started:
                    self.send_json(500, {"ok": False, "error": _friendly_cloud_error(exc)})
            except Exception:
                pass
        finally:
            if staged is not None:
                try: staged.unlink(missing_ok=True)
                except Exception: pass

    def do_POST(self):
        origin = self.headers.get("Origin", "")
        if origin and origin not in ALLOWED_ORIGINS:
            self.send_json(403, {"ok": False, "error": "Origine non autorizzata"}); return
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        if path == "/api/license/refresh":
            self.send_json(200, LICENSES.status(force=True)); return
        required_plan = _license_required_for(path, "POST")
        allowed, gate = _license_gate_result(required_plan)
        if not allowed:
            self.send_json(403, gate); return
        if path != "/api/auth/logout":
            account_allowed, account_gate = _request_account_plan_gate(self.auth_token())
            if not account_allowed:
                self.send_json(403, account_gate); return
        if path == "/api/app/heartbeat":
            try: data = self.read_json(max_size=4096)
            except Exception: data = {}
            app_heartbeat(str((data or {}).get("lifecycleId") or "")); self.send_json(200, {"ok": True}); return
        if path == "/api/app/closing":
            try: data = self.read_json(max_size=4096)
            except Exception: data = {}
            app_closing(str((data or {}).get("lifecycleId") or "")); self.send_json(200, {"ok": True}); return
        if path == "/api/app/close":
            # R35: rendi la transizione visibile PRIMA di rispondere al CORE.
            # Il launcher finale può così distinguere senza race un verifier in chiusura
            # da una vera istanza utente già attiva.
            APP_EXPLICIT_CLOSING_EVENT.set()
            if INSTALLER_VERIFY_MODE:
                _clear_installer_verify_marker()
            self.send_json(200, {"ok": True})
            threading.Timer(0.20, APP_STOP_EVENT.set).start()
            return
        if path == "/api/system/first-use/accept":
            try:
                APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
                temp = FIRST_USE_ACK_FILE.with_suffix(".tmp")
                temp.write_text(json.dumps({"accepted": True, "noticeVersion": FIRST_USE_NOTICE_VERSION, "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}), encoding="utf-8")
                os.replace(temp, FIRST_USE_ACK_FILE)
                self.send_json(200, {"ok": True, "accepted": True})
            except Exception:
                self.send_json(500, {"ok": False, "error": "Non è stato possibile registrare la conferma del primo utilizzo."})
            return
        if path == "/api/auth/setup": self.handle_auth_setup(); return
        if path == "/api/auth/setup-personal": self.handle_auth_setup_personal(); return
        if path == "/api/auth/family-temporary/create": self.handle_auth_family_temporary_create(); return
        if path == "/api/auth/family-temporary/join-new": self.handle_auth_family_temporary_join_new(); return
        if path == "/api/auth/family-temporary/finalize": self.handle_auth_family_temporary_finalize(); return
        if path == "/api/auth/family-self-profile": self.handle_auth_family_self_profile(); return
        if path == "/api/auth/membership/apply": self.handle_auth_membership_apply(); return
        if path == "/api/auth/family-bootstrap-restore": self.handle_auth_family_bootstrap_restore(); return
        if path == "/api/auth/bootstrap-restore": self.handle_auth_bootstrap_restore(); return
        if path == "/api/auth/login": self.handle_auth_login(); return
        if path == "/api/auth/logout": self.handle_auth_logout(); return
        if path == "/api/auth/device-cloud-state": self.handle_auth_device_cloud_state(); return
        if path == "/api/auth/preferences": self.handle_auth_preferences_update(); return
        if path == "/api/auth/warnings/accept": self.handle_auth_warnings_accept(); return
        if path == "/api/auth/backup/validate": self.handle_auth_backup_validate(); return
        if path == "/api/auth/backup/restore": self.handle_auth_backup_restore(); return
        if path == "/api/auth/users/create": self.handle_auth_user_create(); return
        if path == "/api/auth/users/update": self.handle_auth_user_update(); return
        if path == "/api/auth/health-access": self.handle_auth_health_access_update(); return
        if path == "/api/auth/users/reset-password": self.handle_auth_user_reset_password(); return
        if path == "/api/auth/change-password": self.handle_auth_change_password(); return
        if path == "/api/auth/legacy-personalize": self.handle_auth_legacy_personalize(); return
        if path == "/api/auth/profile-migration/exported": self.handle_auth_profile_migration_exported(); return
        if path == "/api/auth/profile-departure/authorize": self.handle_auth_profile_departure_authorize(); return
        if path == "/api/auth/recovery/generate": self.handle_auth_recovery_generate(); return
        if path == "/api/auth/recover": self.handle_auth_recover(); return
        if path == "/api/auth/recover-question": self.handle_auth_recover_question(); return
        if path == "/api/auth/recovery-question/update": self.handle_auth_recovery_question_update(); return
        if path == "/api/auth/mfa/start": self.handle_auth_mfa_start(); return
        if path == "/api/auth/mfa/confirm": self.handle_auth_mfa_confirm(); return
        if path == "/api/auth/mfa/disable": self.handle_auth_mfa_disable(); return
        if path == "/api/auth/developer-mfa": self.handle_auth_developer_mfa(); return
        if path == "/api/security/device-secret/protect": self.handle_device_secret_protect(); return
        if path == "/api/security/device-secret/unprotect": self.handle_device_secret_unprotect(); return
        if path == "/api/calendar/local/schedule": self.handle_calendar_local_schedule(); return
        if path == "/api/calendar/local/cancel": self.handle_calendar_local_cancel(); return
        if path == "/api/calendar/medication/local/schedule": self.handle_calendar_medication_local_schedule(); return
        if path == "/api/calendar/medication/local/cancel": self.handle_calendar_medication_local_cancel(); return
        if path == "/api/calendar/medication/local/actions/consume": self.handle_calendar_medication_actions_consume(); return
        if path == "/api/calendar/google/configure": self.handle_calendar_google_configure(); return
        if path == "/api/calendar/google/consent": self.handle_calendar_google_consent(); return
        if path == "/api/calendar/google/medication-consent": self.handle_calendar_google_medication_consent(); return
        if path == "/api/calendar/google/oauth/start": self.handle_calendar_google_oauth_start(); return
        if path == "/api/calendar/google/disconnect": self.handle_calendar_google_disconnect(); return
        if path == "/api/calendar/google/event/sync": self.handle_calendar_google_event_sync(); return
        if path == "/api/calendar/google/events/sync-all": self.handle_calendar_google_events_sync_all(); return
        if path == "/api/calendar/google/event/delete": self.handle_calendar_google_event_delete(); return
        if path == "/api/visit-export/select-folder": self.handle_visit_export_select_folder(); return
        if path == "/api/visit-export/pdf": self.handle_visit_export_pdf(); return
        if path == "/api/doctor-export/select-folder": self.handle_doctor_export_select_folder(); return
        if path == "/api/doctor-export/file": self.handle_doctor_export_file(); return
        if path == "/api/doctor-export/complete": self.handle_doctor_export_complete(); return
        if path == "/api/updates/download": self.handle_updates_download(); return
        if path == "/api/updates/install": self.handle_updates_install(); return
        if path == "/api/updates/test-reset": self.handle_updates_test_reset(); return
        if path == "/api/diagnostics/consent": self.handle_diagnostics_consent(); return
        if path == "/api/diagnostics/event": self.handle_diagnostics_event(); return
        if path == "/api/document-preview/start": self.handle_document_preview_start(); return
        if path == "/api/ocr/start": self.handle_ocr_start(); return
        if path == "/api/ocr": self.handle_ocr(); return
        if path == "/api/scan": self.handle_scan(); return
        if path == "/api/media/archive/select": self.handle_media_archive_select(); return
        if path == "/api/media/store": self.handle_media_store(parsed); return
        if path == "/api/media/delete": self.handle_media_delete(); return
        if path == "/api/local/backup": self.handle_local_backup(); return
        if path == "/api/cloud/install": self.handle_cloud_install(); return
        if path == "/api/cloud/configure": self.handle_cloud_configure(); return
        if path == "/api/cloud/remote-import": self.handle_cloud_remote_import(); return
        if path == "/api/cloud/mkdir": self.handle_cloud_mkdir(); return
        if path == "/api/cloud/upload": self.handle_cloud_upload(); return
        if path == "/api/cloud/upload-start": self.handle_cloud_upload_start(); return
        if path == "/api/cloud/download-start": self.handle_cloud_download_start(); return
        if path == "/api/cloud/download-finish": self.handle_cloud_download_finish(); return
        if path == "/api/cloud/delete": self.handle_cloud_delete(); return
        self.send_json(404, {"ok": False, "error": "Endpoint non trovato"})

    def read_body(self, max_size: int = 250 * 1024 * 1024) -> bytes:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            raise ValueError("File vuoto")
        if length > max_size:
            raise ValueError("File troppo grande: limite 250 MB")
        remaining = length
        chunks = []
        while remaining:
            chunk = self.rfile.read(min(1024 * 1024, remaining))
            if not chunk:
                raise ConnectionError("Caricamento interrotto")
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def read_json(self, max_size: int = 1024 * 1024):
        raw = self.read_body(max_size=max_size)
        try: return json.loads(raw.decode("utf-8"))
        except Exception as exc: raise ValueError(f"Richiesta JSON non valida: {exc}")


    def handle_media_archive_status(self):
        try:
            AUTH.require_session(self.auth_token())
            self.send_json(200, _media_archive_status())
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc), "code": "media_archive_status"})

    def handle_media_archive_select(self):
        try:
            AUTH.require_session(self.auth_token())
            selected_value = _doctor_select_parent_folder()
            if not selected_value:
                self.send_json(200, {"ok": True, "cancelled": True}); return
            selected_parent = Path(selected_value)
            if not selected_parent.is_dir():
                raise ValueError("La destinazione selezionata non e una cartella valida")
            new_root = _media_archive_selected_root(selected_parent)
            new_root.mkdir(parents=True, exist_ok=True)
            # Verifica scrittura nella cartella media dedicata prima di cambiare configurazione.
            probe = new_root / (".clinica_digitale_write_test_" + secrets.token_hex(4))
            probe.write_bytes(b"ok"); probe.unlink(missing_ok=True)
            old_cfg = _media_archive_read_config()
            old_root = _media_archive_resolve_configured(old_cfg)
            # FIX10 poteva registrare per errore l'intera APP_DATA_DIR come archivio media.
            # Non migrare mai backup, cloud, log, sicurezza o runtime come se fossero DICOM.
            if _same_path(old_root, APP_DATA_DIR):
                old_root = DEFAULT_MEDIA_ARCHIVE_DIR
            archive_id = str(old_cfg.get("archiveId") or "")
            migrated_files = 0; migrated_bytes = 0; previous_available = old_root.is_dir()
            same = _same_path(old_root, new_root)
            if not same and _media_archive_has_payload(old_root):
                for source in old_root.rglob("*"):
                    if not source.is_file() or source.name == MEDIA_ARCHIVE_MARKER_NAME:
                        continue
                    rel = source.relative_to(old_root)
                    target = new_root / rel
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target)
                    if target.stat().st_size != source.stat().st_size:
                        raise IOError(f"Copia incompleta: {rel}")
                    migrated_files += 1; migrated_bytes += source.stat().st_size
            cfg = _media_archive_write_config(new_root, archive_id=archive_id)
            status = _media_archive_status()
            status.update({"cancelled": False, "migratedFiles": migrated_files, "migratedBytes": migrated_bytes, "previousPath": str(old_root), "previousAvailable": previous_available, "keptPreviousCopy": bool(not same and previous_available and migrated_files)})
            self.send_json(200, status)
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "media_archive_select"})

    def handle_media_store(self, parsed):
        try:
            AUTH.require_session(self.auth_token())
            kind, profile_id, owner_id, relative_path = _media_query(parsed)
            if not relative_path:
                raise ValueError("Nome file archivio mancante")
            archive_root = _media_archive_root(create=False)
            if not archive_root.is_dir():
                raise RuntimeError("Archivio media gestito non disponibile. Collega l'unità o scegli una nuova destinazione.")
            destination = _media_target(kind, profile_id, owner_id, relative_path)
            raw = self.read_body(max_size=1024 * 1024 * 1024)
            destination.parent.mkdir(parents=True, exist_ok=True)
            temp = destination.with_name(destination.name + ".tmp")
            temp.write_bytes(raw)
            os.replace(temp, destination)
            if not destination.is_file() or destination.stat().st_size != len(raw):
                raise IOError("Verifica del file DICOM salvato non riuscita")
            self.send_json(200, {"ok": True, "savedBytes": len(raw), "archive": "ArchivioLocale", "relativePath": relative_path, "savedPath": str(destination)})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            self.send_json(400, {"ok": False, "error": str(exc), "code": "media_store"})

    def handle_media_file(self, parsed):
        try:
            AUTH.require_session(self.auth_token())
            kind, profile_id, owner_id, relative_path = _media_query(parsed)
            if not relative_path:
                raise ValueError("Nome file archivio mancante")
            archive_root = _media_archive_root(create=False)
            if not archive_root.is_dir():
                self.send_json(503, {"ok": False, "error": "Archivio media gestito non disponibile. Collega l’unità o rendi accessibile il percorso configurato.", "code": "media_archive_unavailable"}); return
            source = _media_target(kind, profile_id, owner_id, relative_path)
            if not source.is_file():
                self.send_json(404, {"ok": False, "error": "File dell’Archivio gestito non disponibile", "code": "media_missing"}); return
            mime = mimetypes.guess_type(source.name)[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(source.stat().st_size))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            with source.open("rb") as handle:
                while True:
                    chunk = handle.read(1024 * 1024)
                    if not chunk: break
                    self.wfile.write(chunk)
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            self.send_json(400, {"ok": False, "error": str(exc), "code": "media_read"})

    def handle_media_delete(self):
        try:
            AUTH.require_session(self.auth_token())
            data = self.read_json(max_size=32 * 1024)
            archive_root = _media_archive_root(create=False)
            if not archive_root.is_dir():
                raise RuntimeError("Archivio media gestito non disponibile. Collega l’unità prima di eliminare i file.")
            target = _media_target(str(data.get("kind") or ""), str(data.get("profileId") or ""), str(data.get("ownerId") or ""))
            if target.is_dir():
                shutil.rmtree(target, ignore_errors=False)
            elif target.exists():
                target.unlink(missing_ok=True)
            self.send_json(200, {"ok": True})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except FileNotFoundError:
            self.send_json(200, {"ok": True})
        except Exception as exc:
            self.send_json(400, {"ok": False, "error": str(exc), "code": "media_delete"})

    def handle_calendar_google_configure(self):
        try:
            self._calendar_session()
            data = self.read_json(max_size=128 * 1024)
            use_official = bool(data.get("official"))
            client_id = GOOGLE_OAUTH_DEFAULT_CLIENT_ID if use_official else str(data.get("clientId") or "").strip()
            submitted_secret = str(data.get("clientSecret") or "").strip()
            calendar_id = str(data.get("calendarId") or "primary").strip() or "primary"
            current = _google_calendar_load_config()
            if not client_id: client_id = str(current.get("clientId") or GOOGLE_OAUTH_DEFAULT_CLIENT_ID)
            # FIX6: selecting the official client must never erase an already stored
            # client secret. The old path wrote an empty string and later refreshes
            # failed with "client_secret is missing".
            current_secret = str(current.get("clientSecret") or "").strip()
            client_secret = submitted_secret or current_secret
            if not client_id or not client_id.endswith(".apps.googleusercontent.com"):
                raise ValueError("Client ID OAuth Google non valido")
            if len(calendar_id) > 320: raise ValueError("Calendario Google non valido")
            changed = client_id != current.get("clientId") or (submitted_secret and submitted_secret != current_secret)
            cfg = {"clientId": client_id, "clientSecret": client_secret, "calendarId": calendar_id}
            if not changed and isinstance(current.get("token"), dict): cfg["token"] = current["token"]
            _google_calendar_save_config(cfg)
            self.send_json(200, {"ok": True, **_google_calendar_status()})
        except AuthError as exc: self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc: self.send_json(400, {"ok": False, "error": str(exc), "code": "google_calendar_config"})

    def handle_calendar_google_consent(self):
        try:
            self._calendar_session()
            data = self.read_json(max_size=32 * 1024)
            granted = bool(data.get("granted"))
            consent = _google_calendar_set_consent(granted)
            cleanup = None
            if not granted:
                _google_calendar_set_medication_consent(False)
                cleanup = _google_calendar_delete_all_linked_events()
            self.send_json(200, {"ok": True, "healthDataConsent": consent, "cleanup": cleanup})
        except AuthError as exc: self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc: self.send_json(400, {"ok": False, "error": str(exc), "code": "google_calendar_consent"})


    def handle_calendar_google_medication_consent(self):
        try:
            self._calendar_session()
            data = self.read_json(max_size=32 * 1024)
            granted = bool(data.get("granted"))
            if granted and not _google_calendar_consent_status().get("granted"):
                raise ValueError("Autorizza prima la sincronizzazione generale degli appuntamenti sanitari con Google Calendar.")
            consent = _google_calendar_set_medication_consent(granted)
            cleanup = None
            if not granted:
                cleanup = _google_calendar_delete_medication_linked_events()
            self.send_json(200, {"ok": True, "medicationDataConsent": consent, "cleanup": cleanup})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            self.send_json(400, {"ok": False, "error": str(exc), "code": "google_calendar_medication_consent"})


    def handle_calendar_google_oauth_start(self):
        try:
            user = self._calendar_session()
            _google_calendar_require_consent()
            cfg = _google_calendar_load_config(); client_id = str(cfg.get("clientId") or "")
            if not client_id: raise ValueError("Configura prima il Client ID OAuth Google nelle Preferenze")
            state = secrets.token_urlsafe(32); verifier = secrets.token_urlsafe(64)
            challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).decode("ascii").rstrip("=")
            with GOOGLE_CALENDAR_LOCK:
                GOOGLE_OAUTH_PENDING[state] = {"verifier": verifier, "createdAt": time.time(), "principalId": str(user.get("id") or "")}
            params = {"client_id": client_id, "redirect_uri": GOOGLE_OAUTH_REDIRECT_URI, "response_type": "code", "scope": GOOGLE_OAUTH_SCOPE, "access_type": "offline", "prompt": "consent", "state": state, "code_challenge": challenge, "code_challenge_method": "S256"}
            calendar_hint = str(cfg.get("calendarId") or "").strip()
            if "@" in calendar_hint:
                params["login_hint"] = calendar_hint
            auth_url = GOOGLE_OAUTH_AUTH_URL + "?" + urllib.parse.urlencode(params)
            opened = _open_external_system_browser(auth_url)
            self.send_json(200, {"ok": True, "authUrl": auth_url, "redirectUri": GOOGLE_OAUTH_REDIRECT_URI, "opened": opened})
        except AuthError as exc: self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc: self.send_json(400, {"ok": False, "error": str(exc), "code": "google_calendar_oauth_start"})

    def handle_calendar_google_oauth_callback(self, parsed):
        query = urllib.parse.parse_qs(parsed.query); state = str(query.get("state", [""])[0] or "")
        if query.get("error"):
            self.send_html(400, "<html><body style='font-family:Segoe UI;padding:32px'><h2>Autorizzazione Google Calendar non completata</h2><p>Puoi chiudere questa scheda e tornare al Dossier.</p></body></html>"); return
        code = str(query.get("code", [""])[0] or "")
        with GOOGLE_CALENDAR_LOCK: pending = GOOGLE_OAUTH_PENDING.pop(state, None)
        if not pending or time.time() - float(pending.get("createdAt", 0) or 0) > 600 or not code:
            self.send_html(400, "<html><body style='font-family:Segoe UI;padding:32px'><h2>Richiesta OAuth scaduta o non valida</h2><p>Torna al Dossier e ripeti Collega account Google.</p></body></html>"); return
        try:
            _google_calendar_set_principal(str(pending.get("principalId") or ""))
            cfg = _google_calendar_load_config(); values = {"client_id": str(cfg.get("clientId") or ""), "code": code, "code_verifier": str(pending.get("verifier") or ""), "redirect_uri": GOOGLE_OAUTH_REDIRECT_URI, "grant_type": "authorization_code"}
            result = _google_token_request_with_secret_fallback(values, cfg)
            if not result.get("access_token"): raise ValueError("Google non ha restituito un token di accesso")
            old = cfg.get("token") if isinstance(cfg.get("token"), dict) else {}
            if not result.get("refresh_token") and old.get("refresh_token"): result["refresh_token"] = old["refresh_token"]
            result["expires_at"] = time.time() + max(60, int(result.get("expires_in", 3600) or 3600)); cfg["token"] = result; cfg.pop("oauthIssue", None); _google_calendar_save_config(cfg)
            self.send_html(200, "<html><body style='font-family:Segoe UI;padding:32px'><h2>Google Calendar collegato</h2><p>L'autorizzazione e stata salvata solo su questo dispositivo. Puoi chiudere questa scheda e tornare al Dossier.</p><script>setTimeout(()=>{try{window.close()}catch(e){}},1200)</script></body></html>")
        except Exception as exc:
            message = str(exc)
            if "client_secret" in message.lower() or "invalid_client" in message.lower():
                try:
                    cfg = _google_calendar_load_config(); cfg["oauthIssue"] = "reauthorization_required"; _google_calendar_save_config(cfg)
                except Exception:
                    pass
                message = "Google Calendar deve essere ricollegato su questo dispositivo. Nessun dato dell’Agenda è stato modificato."
            self.send_html(500, f"<html><body style='font-family:Segoe UI;padding:32px'><h2>Collegamento Google Calendar non riuscito</h2><p>{html.escape(message)}</p></body></html>")

    def handle_calendar_google_disconnect(self):
        try:
            self._calendar_session()
            cfg = _google_calendar_load_config(); cfg.pop("token", None); cfg.pop("oauthIssue", None); _google_calendar_save_config(cfg)
            self.send_json(200, {"ok": True, **_google_calendar_status()})
        except AuthError as exc: self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc: self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_calendar_google_event_sync(self):
        try:
            self._calendar_session()
            data = self.read_json(max_size=256 * 1024); event = data.get("event") if isinstance(data.get("event"), dict) else {}
            result = _google_calendar_sync_event(event, str(data.get("profileName") or ""), str(data.get("timeZone") or ""), bool(data.get("createIfMissing")))
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc: self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except GoogleCalendarApiError as exc:
            try: _google_calendar_mark_sync_error(event, exc)
            except Exception: pass
            self.send_json(502 if exc.status >= 500 else 409, {"ok": False, "error": str(exc), "googleStatus": exc.status, "code": "google_calendar_api"})
        except Exception as exc:
            try: _google_calendar_mark_sync_error(event, exc)
            except Exception: pass
            self.send_json(400, {"ok": False, "error": str(exc), "code": "google_calendar_sync"})

    def handle_calendar_google_events_sync_all(self):
        try:
            self._calendar_session()
            data = self.read_json(max_size=4 * 1024 * 1024)
            events = data.get("events") if isinstance(data, dict) else []
            result = _google_calendar_sync_all(events or [], str(data.get("profileName") or ""), str(data.get("timeZone") or ""))
            self.send_json(200 if result.get("ok") else 207, {"ok": bool(result.get("ok")), **result})
        except AuthError as exc: self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except GoogleCalendarApiError as exc: self.send_json(502 if exc.status >= 500 else 409, {"ok": False, "error": str(exc), "googleStatus": exc.status, "code": "google_calendar_api"})
        except Exception as exc: self.send_json(400, {"ok": False, "error": str(exc), "code": "google_calendar_sync_all"})

    def handle_calendar_google_event_delete(self):
        try:
            self._calendar_session()
            data = self.read_json(max_size=64 * 1024); result = _google_calendar_delete_link(str(data.get("eventId") or ""), remote=True)
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc: self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except GoogleCalendarApiError as exc: self.send_json(409, {"ok": False, "error": str(exc), "googleStatus": exc.status, "code": "google_calendar_api"})
        except Exception as exc: self.send_json(400, {"ok": False, "error": str(exc), "code": "google_calendar_delete"})

    def handle_visit_export_select_folder(self):
        try:
            AUTH.require_session(self.auth_token())
            data = self.read_json(max_size=64 * 1024)
            _doctor_export_cleanup()
            parent_value = _doctor_select_parent_folder()
            if not parent_value:
                self.send_json(200, {"ok": True, "cancelled": True}); return
            parent = Path(parent_value)
            if not parent.is_dir():
                raise ValueError("La destinazione selezionata non e una cartella valida")
            allowed, reason = _visit_external_destination(parent)
            if not allowed:
                self.send_json(409, {"ok": False, "error": reason, "code": "external_media_required"}); return
            root = _visit_unique_folder(parent, str(data.get("specialty") or "Visita"), str(data.get("visitDate") or ""))
            export_id = secrets.token_urlsafe(24)
            with DOCTOR_EXPORT_LOCK:
                DOCTOR_EXPORT_SESSIONS[export_id] = {"root": str(root), "createdAt": time.time(), "files": 0, "kind": "visit-external"}
            self.send_json(200, {"ok": True, "cancelled": False, "exportId": export_id, "folderName": root.name, "folderPath": str(root)})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_visit_export_pdf(self):
        try:
            export_id = str(self.headers.get("X-Doctor-Export-Id", "") or "").strip()
            rel = _doctor_safe_relative(self.headers.get("X-Relative-Path", "Riepilogo_visita.pdf"))
            _doctor_export_cleanup()
            with DOCTOR_EXPORT_LOCK:
                row = dict(DOCTOR_EXPORT_SESSIONS.get(export_id) or {})
            if not row or row.get("kind") != "visit-external":
                self.send_json(410, {"ok": False, "error": "Sessione di esportazione scaduta. Ripeti l'esportazione della visita."}); return
            root = Path(str(row.get("root") or ""))
            if not root.is_dir():
                raise RuntimeError("Memoria esterna non disponibile")
            html_bytes = self.read_body(max_size=25 * 1024 * 1024)
            html_text = html_bytes.decode('utf-8', errors='replace')
            destination = root / rel
            destination.parent.mkdir(parents=True, exist_ok=True)
            _visit_print_html_to_pdf(html_text, destination)
            with DOCTOR_EXPORT_LOCK:
                if export_id in DOCTOR_EXPORT_SESSIONS:
                    DOCTOR_EXPORT_SESSIONS[export_id]["files"] = int(DOCTOR_EXPORT_SESSIONS[export_id].get("files", 0)) + 1
            self.send_json(200, {"ok": True, "savedBytes": destination.stat().st_size})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_doctor_export_select_folder(self):
        try:
            AUTH.require_session(self.auth_token())
            _doctor_export_cleanup()
            parent_value = _doctor_select_parent_folder()
            if not parent_value:
                self.send_json(200, {"ok": True, "cancelled": True}); return
            parent = Path(parent_value)
            if not parent.is_dir():
                raise ValueError("La destinazione selezionata non e una cartella valida")
            root = _doctor_unique_folder(parent)
            export_id = secrets.token_urlsafe(24)
            with DOCTOR_EXPORT_LOCK:
                DOCTOR_EXPORT_SESSIONS[export_id] = {"root": str(root), "createdAt": time.time(), "files": 0}
            self.send_json(200, {"ok": True, "cancelled": False, "exportId": export_id, "folderName": root.name, "folderPath": str(root)})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_doctor_export_file(self):
        try:
            export_id = str(self.headers.get("X-Doctor-Export-Id", "") or "").strip()
            rel = _doctor_safe_relative(self.headers.get("X-Relative-Path", ""))
            _doctor_export_cleanup()
            with DOCTOR_EXPORT_LOCK:
                row = dict(DOCTOR_EXPORT_SESSIONS.get(export_id) or {})
            if not row:
                self.send_json(410, {"ok": False, "error": "Sessione di esportazione scaduta. Ripeti Versione per medico."}); return
            root = Path(str(row.get("root") or ""))
            if not root.is_dir():
                raise RuntimeError("Cartella di esportazione non disponibile")
            raw = self.read_body(max_size=600 * 1024 * 1024)
            original_bytes = len(raw)
            optimize = str(self.headers.get("X-Optimize-Medical", "")) == "1"
            if optimize:
                raw = _doctor_optimize_bytes(raw, rel.suffix)
            destination = root / rel
            destination.parent.mkdir(parents=True, exist_ok=True)
            temp = destination.with_name(destination.name + ".tmp")
            temp.write_bytes(raw)
            os.replace(temp, destination)
            with DOCTOR_EXPORT_LOCK:
                if export_id in DOCTOR_EXPORT_SESSIONS:
                    DOCTOR_EXPORT_SESSIONS[export_id]["files"] = int(DOCTOR_EXPORT_SESSIONS[export_id].get("files", 0)) + 1
            self.send_json(200, {"ok": True, "originalBytes": original_bytes, "savedBytes": len(raw), "optimized": bool(optimize and len(raw) < original_bytes)})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_doctor_export_complete(self):
        try:
            data = self.read_json(max_size=32 * 1024)
            export_id = str(data.get("exportId") or "")
            with DOCTOR_EXPORT_LOCK:
                row = DOCTOR_EXPORT_SESSIONS.pop(export_id, None)
            self.send_json(200, {"ok": True, "folderPath": (row or {}).get("root", ""), "files": int((row or {}).get("files", 0))})
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_updates_download(self):
        try:
            cfg = _load_update_config()
            if cfg.get("storeManaged"):
                self.send_json(409, {"ok": False, "error": "Gli aggiornamenti Windows sono gestiti da Microsoft Store"}); return
            with UPDATE_STATE_LOCK:
                manifest = dict(LAST_UPDATE_MANIFEST or {})
            if cfg.get("testMode"):
                self.send_json(200, {"ok": True, "simulated": True, "ready": True, "version": manifest.get("version") or (cfg.get("testManifest") or {}).get("version")})
                return
            if not manifest.get("available"):
                manifest = _fetch_update_manifest(cfg)
            if not manifest.get("available"):
                self.send_json(409, {"ok": False, "error": "Nessun aggiornamento disponibile"}); return
            result = _download_update(manifest, cfg)
            self.send_json(200, {"ok": True, "ready": True, "version": manifest.get("version"), **result})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_updates_install(self):
        try:
            cfg = _load_update_config()
            if cfg.get("storeManaged"):
                self.send_json(409, {"ok": False, "error": "Gli aggiornamenti Windows sono gestiti da Microsoft Store"}); return
            if cfg.get("testMode"):
                UPDATE_DIR.mkdir(parents=True, exist_ok=True)
                _write_json_atomic(UPDATE_TEST_MARKER, {"appliedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "version": (cfg.get("testManifest") or {}).get("version")})
                self.send_json(200, {"ok": True, "simulated": True, "message": "Simulazione aggiornamento completata"})
                return
            staged = _read_json_file(UPDATE_DIR / "staged.json", {})
            path = Path(str(staged.get("path") or ""))
            if not path.exists() or path.suffix.lower() != ".exe":
                self.send_json(409, {"ok": False, "error": "Aggiornamento scaricato non disponibile"}); return
            digest = hashlib.sha256(path.read_bytes()).hexdigest().lower()
            if digest != str(staged.get("sha256") or "").lower():
                self.send_json(409, {"ok": False, "error": "Integrità del pacchetto non valida"}); return
            creationflags = 0
            if os.name == "nt": creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            # Rispondi prima al browser. L'installer chiuderà questo motore quando
            # inizierà l'aggiornamento: avviarlo prima della risposta creava una
            # race in cui l'interfaccia poteva mostrare un errore pur avendo già
            # lanciato correttamente l'aggiornamento.
            self.send_json(200, {"ok": True, "started": True, "version": staged.get("version")})
            def _launch_staged_update():
                try:
                    subprocess.Popen([str(path)], cwd=str(path.parent), creationflags=creationflags)
                except Exception:
                    traceback.print_exc()
            timer = threading.Timer(0.8, _launch_staged_update)
            timer.daemon = True
            timer.start()
            return
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_updates_test_reset(self):
        try:
            cfg = _load_update_config()
            if not cfg.get("testMode"):
                self.send_json(403, {"ok": False, "error": "Funzione disponibile solo nella modalità tecnica privata"}); return
            UPDATE_TEST_MARKER.unlink(missing_ok=True)
            self.send_json(200, {"ok": True})
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_document_preview_start(self):
        try:
            raw = self.read_body(max_size=250 * 1024 * 1024)
            encoded = str(self.headers.get("X-File-Name", "") or "")
            original_name = urllib.parse.unquote(encoded) if encoded else "documento.bin"
            mime_type = str(self.headers.get("X-Mime-Type", "") or "")
            token, name, mime = _create_document_preview(raw, original_name, mime_type)
            self.send_json(200, {"ok": True, "url": f"http://{HOST}:{API_PORT}/api/document-preview?token={urllib.parse.quote(token)}", "fileName": name, "mimeType": mime})
        except Exception as exc:
            traceback.print_exc()
            self.send_json(500, {"ok": False, "error": "Impossibile preparare l'anteprima del documento"})

    def handle_diagnostics_report_package(self):
        try:
            cfg = _load_diagnostics_config()
            inst = _diagnostics_installation()
            if not _diagnostics_consent_accepted(cfg, inst):
                self.send_json(403, {"ok": False, "error": "Diagnostica tecnica non autorizzata"}); return
            installation_id = str(inst.get("installationId") or "INSTALL")
            folder = DIAGNOSTICS_DIR / installation_id
            events = folder / "events.ndjson"
            current_version = _load_update_config().get("displayVersion", VERSION)
            scoped_events = _diagnostics_recent_events(events, current_version, limit=200)
            meta = {
                "schema": 2,
                "installationId": installation_id,
                "appVersion": current_version,
                "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "diagnosticsTransport": (cfg.get("diagnostics") or {}).get("transport", ""),
                "containsClinicalData": False,
                "eventsScope": "sessione corrente",
                "eventsIncluded": len(scoped_events),
                "sanitized": True,
            }
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
                zf.writestr("diagnostica_tecnica.json", json.dumps(meta, ensure_ascii=False, indent=2))
                zf.writestr("LEGGIMI.txt", "Pacchetto diagnostico Clinica Digitale - Dossier Sanitario 1.0.1.\r\nContiene esclusivamente eventi tecnici sanitizzati della sessione corrente. Non include descrizioni libere, documenti sanitari, testi clinici, credenziali, nomi dei profili o percorsi dei file clinici.\r\n")
                if scoped_events:
                    payload_events = "\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in scoped_events) + "\n"
                    zf.writestr("events.ndjson", payload_events)
            payload = buffer.getvalue()
            stamp = time.strftime("%Y%m%d_%H%M%S")
            filename = f"ClinicaDigitale_Diagnostica_{installation_id}_{stamp}.zip"
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
        except Exception as exc:
            traceback.print_exc()
            self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_diagnostics_consent(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            cfg = _load_diagnostics_config(); notice = str(data.get("noticeVersion") or cfg.get("noticeVersion") or "")
            if not notice:
                raise ValueError("Versione informativa mancante")
            accepted = bool(data.get("accepted"))
            with DIAGNOSTICS_STATE_LOCK:
                inst = _read_json_file(DIAGNOSTICS_INSTALLATION_FILE, {})
                if not isinstance(inst, dict) or not inst.get("installationId"):
                    inst = _diagnostics_installation()
                consents = dict(inst.get("consents") or {})
                consents[notice] = {"accepted": accepted, "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
                inst["consents"] = consents
                _write_json_atomic(DIAGNOSTICS_INSTALLATION_FILE, inst)
            self.send_json(200, {"ok": True, "accepted": accepted, "installationId": inst.get("installationId")})
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_diagnostics_event(self):
        try:
            data = self.read_json(max_size=256 * 1024)
            result = _diagnostics_record_event(data if isinstance(data, dict) else {})
            self.send_json(200, {"ok": True, **result})
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_auth_setup(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            result = AUTH.setup(data.get("displayName", ""), data.get("username", ""), data.get("password", ""), data.get("email", ""), data.get("recoveryQuestion", ""), data.get("recoveryAnswer", ""))
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})


    def handle_auth_setup_personal(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            result = AUTH.setup_personal(data.get("displayName", ""), data.get("username", ""), data.get("password", ""), data.get("email", ""), data.get("recoveryQuestion", ""), data.get("recoveryAnswer", ""))
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_family_temporary_create(self):
        try:
            data = self.read_json(max_size=256 * 1024)
            access = AUTH.create_temporary_family_access(self.auth_token(), data)
            self.send_json(200, {"ok": True, "access": access})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_family_temporary_join_new(self):
        try:
            data = self.read_json(max_size=128 * 1024)
            result = AUTH.join_new_family_member(data)
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_family_self_profile(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            result = AUTH.link_own_family_profile(self.auth_token(), data.get("profileId", ""))
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_family_temporary_finalize(self):
        try:
            data = self.read_json(max_size=1024 * 1024)
            result = AUTH.finalize_temporary_family_access(self.auth_token(), data)
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_membership_apply(self):
        try:
            data = self.read_json(max_size=256 * 1024)
            user = AUTH.apply_membership(self.auth_token(), data)
            self.send_json(200, {"ok": True, "user": user})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_family_bootstrap_restore(self):
        try:
            data = self.read_json(max_size=16 * 1024 * 1024)
            result = AUTH.restore_family_bootstrap(data)
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_bootstrap_restore(self):
        try:
            data = self.read_json(max_size=16 * 1024 * 1024)
            result = AUTH.restore_backup_uninitialized(data)
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_login(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            result = AUTH.login(data.get("username", ""), data.get("password", ""), data.get("otp", ""), require_mfa=_device_cloud_linked())
            result = _enforce_account_plan(result)
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_logout(self):
        AUTH.logout(self.auth_token()); self.send_json(200, {"ok": True})

    def handle_auth_device_cloud_state(self):
        try:
            AUTH.require_session(self.auth_token())
            data = self.read_json(max_size=64 * 1024)
            linked = bool(data.get("linked") is True)
            _set_device_cloud_linked(linked, str(data.get("archiveId", "") or ""))
            self.send_json(200, {"ok": True, "linked": linked})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_preferences_update(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            preferences = AUTH.update_preferences(self.auth_token(), data)
            self.send_json(200, {"ok": True, "preferences": preferences})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_backup_validate(self):
        try:
            data = self.read_json(max_size=16 * 1024 * 1024)
            result = AUTH.validate_backup(self.auth_token(), data)
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_backup_restore(self):
        try:
            data = self.read_json(max_size=16 * 1024 * 1024)
            result = AUTH.restore_backup(self.auth_token(), data)
            if data.get("deviceCloudLinked") is True:
                _set_device_cloud_linked(True, str(data.get("archiveId", "") or ""))
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_user_create(self):
        try:
            data = self.read_json(max_size=128 * 1024)
            user = AUTH.create_user(self.auth_token(), data)
            self.send_json(200, {"ok": True, "user": user})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_user_update(self):
        try:
            data = self.read_json(max_size=128 * 1024)
            user = AUTH.update_user(self.auth_token(), data)
            self.send_json(200, {"ok": True, "user": user})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_health_access_update(self):
        try:
            data = self.read_json(max_size=128 * 1024)
            result = AUTH.update_health_access(self.auth_token(), data)
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_user_reset_password(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            codes = AUTH.reset_user_password(self.auth_token(), str(data.get("id", "")), str(data.get("password", "")))
            self.send_json(200, {"ok": True, "codes": codes})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_legacy_personalize(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            result = AUTH.personalize_legacy_credentials(
                self.auth_token(), data.get("oldPassword", ""), data.get("newPassword", ""),
                data.get("recoveryQuestion", ""), data.get("recoveryAnswer", "")
            )
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_profile_migration_exported(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            result = AUTH.register_profile_migration_export(
                self.auth_token(), data.get("profileId", ""), data.get("packageSha256", ""), data.get("receiptChallengeSha256", "")
            )
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_profile_departure_authorize(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            result = AUTH.authorize_profile_departure(
                self.auth_token(), data.get("profileId", ""), data.get("password", ""), data.get("packageSha256", ""), data.get("receipt")
            )
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_change_password(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            result = AUTH.change_password(self.auth_token(), data.get("oldPassword", ""), data.get("newPassword", ""))
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_recovery_generate(self):
        try:
            codes = AUTH.generate_recovery(self.auth_token())
            self.send_json(200, {"ok": True, "codes": codes})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_recover(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            result = AUTH.recover(data.get("username", ""), data.get("code", ""), data.get("newPassword", ""))
            result = _enforce_account_plan(result)
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_recover_question(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            result = AUTH.recover_with_question(data.get("email", ""), data.get("answer", ""), data.get("newPassword", ""))
            result = _enforce_account_plan(result)
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_recovery_question_update(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            result = AUTH.update_recovery_question(self.auth_token(), data.get("password", ""), data.get("question", ""), data.get("answer", ""))
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_device_secret_protect(self):
        try:
            AUTH.require_session(self.auth_token())
            data = self.read_json(max_size=64 * 1024)
            value = str(data.get("value", "") or "")
            if not value or len(value) > 32768:
                raise ValueError("Segreto locale non valido")
            protected = _dpapi_protect(value.encode("utf-8"))
            encoded = base64.urlsafe_b64encode(protected).decode("ascii")
            self.send_json(200, {"ok": True, "protected": encoded})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "device_secret_error"})

    def handle_device_secret_unprotect(self):
        try:
            AUTH.require_session(self.auth_token())
            data = self.read_json(max_size=64 * 1024)
            encoded = str(data.get("protected", "") or "")
            if not encoded or len(encoded) > 65536:
                raise ValueError("Segreto locale non valido")
            padded = encoded + "=" * ((4 - len(encoded) % 4) % 4)
            raw = base64.urlsafe_b64decode(padded.encode("ascii"))
            value = _dpapi_unprotect(raw).decode("utf-8")
            self.send_json(200, {"ok": True, "value": value})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": "Segreto locale non disponibile su questo dispositivo", "code": "device_secret_unavailable"})

    def handle_auth_mfa_start(self):
        try:
            result = AUTH.mfa_start(self.auth_token())
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_mfa_confirm(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            codes = AUTH.mfa_confirm(self.auth_token(), data.get("nonce", ""), data.get("otp", ""), data.get("password", ""))
            self.send_json(200, {"ok": True, "codes": codes})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_auth_developer_mfa(self):
        try:
            data = self.read_json(max_size=16 * 1024)
            result = AUTH.verify_developer_mfa(self.auth_token(), data.get("otp", ""))
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "developer_mfa_internal"})

    def handle_auth_mfa_disable(self):
        try:
            codes = AUTH.mfa_disable(self.auth_token())
            self.send_json(200, {"ok": True, "codes": codes})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc), "code": "auth_internal"})

    def handle_local_backup(self):
        name = urllib.parse.unquote(self.headers.get("X-File-Name", "dossier_sanitario_backup.zip"))
        safe = "".join(ch for ch in Path(name).name if ch.isalnum() or ch in "._-")[:180]
        if not safe.lower().endswith(".zip"):
            safe += ".zip"
        temp_path = None
        try:
            raw = self.read_body(max_size=1024 * 1024 * 1024)
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            destination = BACKUP_DIR / safe
            fd, temp_path = tempfile.mkstemp(prefix="dossier_backup_", dir=str(BACKUP_DIR)); os.close(fd)
            Path(temp_path).write_bytes(raw)
            os.replace(temp_path, destination); temp_path = None
            self.send_json(200, {"ok": True, "path": str(destination), "bytes": len(raw)})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": _friendly_cloud_error(exc)})
        finally:
            if temp_path:
                try: os.remove(temp_path)
                except OSError: pass


    def handle_auth_warnings_accept(self):
        try:
            payload = self.read_json(max_size=128 * 1024)
            self.auth_response(lambda: AUTH.accept_warnings(self.auth_token(), payload))
        except ValueError as exc:
            self.send_json(400, {"ok": False, "error": str(exc), "code": "invalid_request"})

    def handle_cloud_install(self):
        try:
            result = install_rclone()
            self.send_json(200, {"ok": True, **result})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_cloud_configure(self):
        config_snapshot = None
        config_existed = RCLONE_CONFIG.exists()
        provider = ""
        is_continue = False
        try:
            stop_rclone_rcd()
            data = self.read_json()
            name = str(data.get("name", "")).strip()
            provider = str(data.get("provider", "")).strip()
            is_continue = bool(data.get("continue"))
            if not name.replace("_", "").replace("-", "").isalnum(): raise ValueError("Nome connessione non valido")
            if provider not in {"mega", "drive", "iclouddrive"}: raise ValueError("Servizio cloud non supportato")
            params = data.get("params") or {}

            # MEGA non richiede la procedura guidata completa. Con --all rclone
            # restituisce domande aggiuntive anche se user e pass sono gia forniti.
            # La configurazione viene considerata valida solo dopo un vero accesso.
            if provider == "mega" and not is_continue:
                config_snapshot = RCLONE_CONFIG.read_bytes() if config_existed else None
                remotes_result = run_rclone(["listremotes"], timeout=30)
                existing = {line.strip().rstrip(":") for line in remotes_result["stdout"].splitlines() if line.strip()}
                # Le connessioni restore_* sono temporanee. Manteniamo soltanto
                # quella del tentativo corrente, senza toccare i remote normali.
                if name.startswith("restore_mega_"):
                    for old_name in sorted(x for x in existing if x.startswith("restore_mega_") and x != name):
                        try:
                            run_rclone(["config", "delete", old_name], timeout=30)
                            existing.discard(old_name)
                        except Exception:
                            pass
                args = ["config", "update" if name in existing else "create", name]
                if name not in existing:
                    args.append("mega")
                for key, value in params.items():
                    if key and value is not None:
                        args.extend([str(key), str(value)])
                args.extend(["--non-interactive", "--obscure"])
                result = run_rclone(args, timeout=600)
                response = parse_rclone_json(result["stdout"])
                if response.get("State"):
                    option = response.get("Option") or {}
                    detail = response.get("Error") or option.get("Help") or option.get("Question") or option.get("Name")
                    raise RuntimeError(str(detail or "MEGA richiede un dato aggiuntivo per completare la configurazione").strip())
                run_rclone(["lsd", f"{name}:"], timeout=120)
                self.send_json(200, {"ok": True, "complete": True, "verified": True})
                return

            args = ["config", "update" if is_continue else "create", name]
            if not is_continue: args.append(provider)
            for key, value in params.items():
                if key and value is not None: args.extend([str(key), str(value)])
            args.extend(["--non-interactive", "--all", "--obscure"])
            if is_continue:
                args.extend(["--continue", "--state", str(data.get("state", "")), "--result", str(data.get("result", ""))])
            result = run_rclone(args, timeout=600)
            response = parse_rclone_json(result["stdout"])
            self.send_json(200, {"ok": True, "complete": not bool(response.get("State")), "question": response if response.get("State") else None, "output": result["stdout"][-2000:]})
        except Exception as exc:
            if provider == "mega" and not is_continue:
                try:
                    if config_existed and config_snapshot is not None:
                        RCLONE_CONFIG.write_bytes(config_snapshot)
                    elif not config_existed:
                        RCLONE_CONFIG.unlink(missing_ok=True)
                except Exception:
                    traceback.print_exc()
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc)})


    def handle_cloud_remote_import(self):
        try:
            AUTH.require_session(self.auth_token())
            data = self.read_json(max_size=256 * 1024)
            if not RCLONE_EXE.exists():
                raise RuntimeError("Connettore cloud non installato")
            name = _import_rclone_section(str(data.get("name", "") or ""), str(data.get("section", "") or ""))
            # Verify the imported remote can at least be addressed. Do not require a
            # particular folder here: the archive validation happens immediately after.
            run_rclone(["lsd", f"{name}:"], timeout=90)
            self.send_json(200, {"ok": True, "name": name})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_cloud_mkdir(self):
        try:
            remote = str(self.read_json().get("remote", ""))
            if not valid_remote_path(remote): raise ValueError("Percorso cloud non valido")
            fs, path = _split_remote_spec(remote); rc_call("operations/mkdir", {"fs": fs, "remote": path}, timeout=120); self.send_json(200, {"ok": True})
        except Exception as exc: self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_cloud_download_start(self):
        try:
            data = self.read_json(max_size=64 * 1024)
            remote = str(data.get("remote", "") or "")
            if not valid_remote_path(remote):
                self.send_json(400, {"ok": False, "error": "Percorso cloud non valido"}); return
            job_id = secrets.token_hex(16)
            now = time.time()
            with CLOUD_DOWNLOAD_JOBS_LOCK:
                for old_id, job in list(CLOUD_DOWNLOAD_JOBS.items()):
                    if now - float(job.get("updatedAt", now)) > CLOUD_DOWNLOAD_JOB_TTL:
                        old_path = str(job.get("path", "") or "")
                        CLOUD_DOWNLOAD_JOBS.pop(old_id, None)
                        if old_path:
                            try: Path(old_path).unlink(missing_ok=True)
                            except Exception: pass
                CLOUD_DOWNLOAD_JOBS[job_id] = {
                    "status": "queued", "stage": "prepare", "bytes": 0, "totalBytes": 0,
                    "percent": 0, "error": "", "sha256": "", "path": "", "remote": remote,
                    "updatedAt": now,
                }
            threading.Thread(target=cloud_download_worker, args=(job_id, remote), daemon=True).start()
            self.send_json(202, {"ok": True, "jobId": job_id})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": _friendly_cloud_error(exc)})

    def handle_cloud_download_progress(self, job_id: str):
        if not job_id:
            self.send_json(400, {"ok": False, "error": "Download non identificato"}); return
        with CLOUD_DOWNLOAD_JOBS_LOCK:
            job = dict(CLOUD_DOWNLOAD_JOBS.get(job_id) or {})
        if not job:
            self.send_json(404, {"ok": False, "error": "Download non trovato o già scaduto"}); return
        public = {k: v for k, v in job.items() if k not in ("path", "remote")}
        self.send_json(200, {"ok": True, **public})

    def handle_cloud_download_chunk(self, job_id: str, offset_raw: str, length_raw: str):
        if not job_id:
            self.send_json(400, {"ok": False, "error": "Download non identificato"}); return
        with CLOUD_DOWNLOAD_JOBS_LOCK:
            job = dict(CLOUD_DOWNLOAD_JOBS.get(job_id) or {})
        if not job:
            self.send_json(404, {"ok": False, "error": "Download non trovato o già scaduto"}); return
        if job.get("status") != "ready":
            self.send_json(409, {"ok": False, "error": "Download cloud non ancora pronto"}); return
        try:
            offset = int(offset_raw or 0); length = int(length_raw or 0)
            total = int(job.get("totalBytes", 0) or 0)
            if offset < 0 or length <= 0 or length > CLOUD_DOWNLOAD_MAX_CHUNK or offset >= total:
                raise ValueError("Intervallo del blocco non valido")
            expected = min(length, total - offset)
            path = Path(str(job.get("path", "") or ""))
            if not path.exists() or path.stat().st_size != total:
                raise RuntimeError("File temporaneo del download non disponibile")
            with path.open("rb") as source:
                source.seek(offset)
                raw = source.read(expected)
            if len(raw) != expected:
                raise RuntimeError(f"Blocco locale incompleto: attesi {expected} byte, letti {len(raw)}")
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Dossier-Chunk-Offset", str(offset))
            self.end_headers()
            self.wfile.write(raw); self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            # Il browser ritenta esclusivamente questo blocco.
            return
        except Exception as exc:
            try: self.send_json(500, {"ok": False, "error": str(exc)})
            except Exception: pass

    def handle_cloud_download_finish(self):
        try:
            data = self.read_json(max_size=16 * 1024)
            job_id = str(data.get("jobId", "") or "")
            if not job_id:
                self.send_json(400, {"ok": False, "error": "Download non identificato"}); return
            with CLOUD_DOWNLOAD_JOBS_LOCK:
                job = CLOUD_DOWNLOAD_JOBS.pop(job_id, None)
            if job:
                path = str(job.get("path", "") or "")
                if path:
                    try: Path(path).unlink(missing_ok=True)
                    except Exception: pass
            self.send_json(200, {"ok": True})
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_cloud_upload_start(self):
        if self.headers.get("X-Dossier-Client", "").strip().lower() != "r41-sync-readfix-firstuse":
            self.send_json(409, {"ok": False, "error": "Questa scheda appartiene a una versione precedente del Dossier. Chiudila e usa la versione 1.0.1 appena installata."}); return
        remote = urllib.parse.unquote(self.headers.get("X-Remote-Path", ""))
        if not valid_remote_path(remote):
            self.send_json(400, {"ok": False, "error": "Percorso cloud non valido"}); return
        temp_path = None
        try:
            raw = self.read_body(max_size=1024 * 1024 * 1024)
            fd, temp_path = tempfile.mkstemp(prefix="dossier_upload_"); os.close(fd)
            Path(temp_path).write_bytes(raw)
            job_id = secrets.token_hex(16)
            now = time.time()
            with CLOUD_UPLOAD_JOBS_LOCK:
                for old_id, job in list(CLOUD_UPLOAD_JOBS.items()):
                    if now - float(job.get("updatedAt", now)) > CLOUD_UPLOAD_JOB_TTL:
                        CLOUD_UPLOAD_JOBS.pop(old_id, None)
                CLOUD_UPLOAD_JOBS[job_id] = {"status": "queued", "bytes": 0, "totalBytes": len(raw), "percent": 0, "error": "", "updatedAt": now}
            threading.Thread(target=cloud_upload_worker, args=(job_id, temp_path, remote, len(raw)), daemon=True).start()
            temp_path = None
            self.send_json(202, {"ok": True, "jobId": job_id, "totalBytes": len(raw)})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": str(exc)})
        finally:
            if temp_path:
                try: os.remove(temp_path)
                except OSError: pass

    def handle_cloud_upload_progress(self, job_id: str):
        if not job_id:
            self.send_json(400, {"ok": False, "error": "Trasferimento non identificato"}); return
        with CLOUD_UPLOAD_JOBS_LOCK:
            job = dict(CLOUD_UPLOAD_JOBS.get(job_id) or {})
        if not job:
            self.send_json(404, {"ok": False, "error": "Trasferimento non trovato o già scaduto"}); return
        self.send_json(200, {"ok": True, **job})

    def handle_cloud_upload(self):
        if self.headers.get("X-Dossier-Client", "").strip().lower() != "r41-sync-readfix-firstuse":
            self.send_json(409, {"ok": False, "error": "Questa scheda appartiene a una versione precedente del Dossier. Chiudila e usa la versione 1.0.1 appena installata."}); return
        remote = urllib.parse.unquote(self.headers.get("X-Remote-Path", ""))
        if not valid_remote_path(remote): self.send_json(400, {"ok": False, "error": "Percorso cloud non valido"}); return
        temp_path = None
        try:
            raw = self.read_body(max_size=1024 * 1024 * 1024)
            fd, temp_path = tempfile.mkstemp(prefix="dossier_upload_"); os.close(fd); Path(temp_path).write_bytes(raw)
            transactional_cloud_upload(temp_path, remote, len(raw))
            self.send_json(200, {"ok": True, "bytes": len(raw), "committed": True})
        except Exception as exc:
            traceback.print_exc(); self.send_json(500, {"ok": False, "error": _friendly_cloud_error(exc)})
        finally:
            if temp_path:
                try: os.remove(temp_path)
                except OSError: pass

    def handle_cloud_delete(self):
        try:
            remote = str(self.read_json().get("remote", ""))
            if not valid_remote_path(remote): raise ValueError("Percorso cloud non valido")
            run_rclone(["deletefile", remote], timeout=120); self.send_json(200, {"ok": True})
        except Exception as exc: self.send_json(500, {"ok": False, "error": str(exc)})

    def _calendar_session(self):
        user = AUTH.require_session(self.auth_token())
        _google_calendar_set_principal(user)
        return user

    def handle_calendar_local_schedule(self):
        try:
            self._calendar_session()
            payload = self.read_json(max_size=256 * 1024)
            event = payload.get("event") or {}
            profile_name = str(payload.get("profileName") or "")
            result = _calendar_schedule_event(event, profile_name)
            self.send_json(200, {"ok": True, **result})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_calendar_local_cancel(self):
        try:
            self._calendar_session()
            payload = self.read_json(max_size=64 * 1024)
            count = _calendar_cancel_event(str(payload.get("eventId") or ""))
            self.send_json(200, {"ok": True, "cancelledCount": count})
        except AuthError as exc:
            self.send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code})
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})

    def handle_calendar_medication_local_schedule(self):
        try:
            self._calendar_session();payload=self.read_json(max_size=512*1024);event=payload.get("event") if isinstance(payload.get("event"),dict) else {}
            result=_medication_upsert_event(event,str(payload.get("profileName") or ""));self.send_json(200,{"ok":True,**result})
        except AuthError as exc:self.send_json(exc.status,{"ok":False,"error":str(exc),"code":exc.code})
        except Exception as exc:self.send_json(500,{"ok":False,"error":str(exc)})

    def handle_calendar_medication_local_cancel(self):
        try:
            self._calendar_session();payload=self.read_json(max_size=64*1024);result=_medication_cancel_event(str(payload.get("eventId") or ""),str(payload.get("profileId") or ""));self.send_json(200,{"ok":True,**result})
        except AuthError as exc:self.send_json(exc.status,{"ok":False,"error":str(exc),"code":exc.code})
        except Exception as exc:self.send_json(500,{"ok":False,"error":str(exc)})

    def handle_calendar_medication_actions_consume(self):
        try:
            self._calendar_session();payload=self.read_json(max_size=128*1024);count=_medication_consume_actions(payload.get("ids") if isinstance(payload.get("ids"),list) else []);self.send_json(200,{"ok":True,"consumed":count})
        except AuthError as exc:self.send_json(exc.status,{"ok":False,"error":str(exc),"code":exc.code})
        except Exception as exc:self.send_json(500,{"ok":False,"error":str(exc)})

    def handle_ocr_start(self):
        _cleanup_ocr_jobs()
        encoded = self.headers.get("X-File-Name", "documento.bin")
        try:
            original_name = urllib.parse.unquote(encoded)
        except Exception:
            original_name = "documento.bin"
        ext = Path(original_name).suffix.lower()
        if ext not in {".pdf", ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}:
            self.send_json(415, {"ok": False, "error": "Formato non supportato. Usa PDF, JPG, PNG, BMP, TIFF o WEBP."})
            return
        temp_path = None
        try:
            raw = self.read_body()
            fd, temp_path = tempfile.mkstemp(prefix="dossier_py_job_", suffix=ext)
            os.close(fd)
            Path(temp_path).write_bytes(raw)
            job_id = secrets.token_urlsafe(18)
            now = time.time()
            with OCR_JOBS_LOCK:
                OCR_JOBS[job_id] = {
                    "jobId": job_id, "done": False, "progress": 2.0, "stage": "upload",
                    "message": "Documento ricevuto, avvio analisi", "processedPages": 0, "totalPages": 0,
                    "result": None, "error": "", "createdAt": now, "updatedAt": now,
                }
            threading.Thread(target=_run_ocr_job, args=(job_id, temp_path, original_name), daemon=True, name=f"ocr-{job_id[:8]}").start()
            temp_path = None
            self.send_json(202, {"ok": True, "jobId": job_id, "progress": 2, "message": "Analisi avviata"})
        except Exception as exc:
            traceback.print_exc()
            self.send_json(500, {"ok": False, "error": f"Avvio riconoscimento Python non riuscito: {exc}"})
        finally:
            if temp_path:
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

    def handle_ocr(self):
        encoded = self.headers.get("X-File-Name", "documento.bin")
        try:
            original_name = urllib.parse.unquote(encoded)
        except Exception:
            original_name = "documento.bin"
        ext = Path(original_name).suffix.lower()
        if ext not in {".pdf", ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}:
            self.send_json(415, {"ok": False, "error": "Formato non supportato. Usa PDF, JPG, PNG, BMP, TIFF o WEBP."})
            return
        temp_path = None
        try:
            raw = self.read_body()
            fd, temp_path = tempfile.mkstemp(prefix="dossier_py_", suffix=ext)
            os.close(fd)
            Path(temp_path).write_bytes(raw)
            started = time.perf_counter()
            result = analyze_path(temp_path, original_name)
            result.update({
                "ok": True,
                "language": "it-Latn",
                "originalName": original_name,
                "elapsedSeconds": round(time.perf_counter() - started, 2),
            })
            self.send_json(200, result)
        except Exception as exc:
            traceback.print_exc()
            self.send_json(500, {"ok": False, "error": f"Riconoscimento Python non riuscito: {exc}"})
        finally:
            if temp_path:
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

    def handle_scan(self):
        script = ROOT / "python_engine" / "scan_wia.ps1"
        if not script.exists():
            self.send_json(500, {"ok": False, "error": "Componente scanner non presente"})
            return
        try:
            proc = subprocess.run(
                ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)],
                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            output = (proc.stdout or "").strip().splitlines()
            if proc.returncode != 0 or not output:
                error = (proc.stderr or proc.stdout or "Scansione non riuscita").strip()
                raise RuntimeError(error)
            data = json.loads(output[-1])
            self.send_json(200, data)
        except subprocess.TimeoutExpired:
            self.send_json(504, {"ok": False, "error": "Tempo massimo dello scanner superato"})
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": f"Scanner non disponibile: {exc}"})


def _dpapi_protect(data: bytes) -> bytes:
    if os.name != "nt": return data
    import ctypes
    from ctypes import wintypes
    class DATA_BLOB(ctypes.Structure): _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]
    buf = ctypes.create_string_buffer(data); in_blob = DATA_BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_byte))); out_blob = DATA_BLOB()
    if not ctypes.windll.crypt32.CryptProtectData(ctypes.byref(in_blob), "Dossier Sanitario Locale", None, None, None, 0, ctypes.byref(out_blob)): raise ctypes.WinError()
    try: return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally: ctypes.windll.kernel32.LocalFree(out_blob.pbData)

def _dpapi_unprotect(data: bytes) -> bytes:
    if os.name != "nt": return data
    import ctypes
    from ctypes import wintypes
    class DATA_BLOB(ctypes.Structure): _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]
    buf = ctypes.create_string_buffer(data); in_blob = DATA_BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_byte))); out_blob = DATA_BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)): raise ctypes.WinError()
    try: return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally: ctypes.windll.kernel32.LocalFree(out_blob.pbData)

def rclone_config_password() -> str:
    CLOUD_DIR.mkdir(parents=True, exist_ok=True); path = CLOUD_DIR / "config_pass.bin"
    if path.exists(): return _dpapi_unprotect(path.read_bytes()).decode("ascii")
    password = secrets.token_urlsafe(32); path.write_bytes(_dpapi_protect(password.encode("ascii")))
    try: os.chmod(path, 0o600)
    except OSError: pass
    return password

def rclone_env():
    env = os.environ.copy(); env["RCLONE_CONFIG_PASS"] = rclone_config_password(); return env


def _rc_auth_header():
    global RCLONE_RC_PASSWORD
    if not RCLONE_RC_PASSWORD:
        RCLONE_RC_PASSWORD = secrets.token_urlsafe(24)
    token = base64.b64encode(f"{RCLONE_RC_USER}:{RCLONE_RC_PASSWORD}".encode("utf-8")).decode("ascii")
    return "Basic " + token


def _rc_url(command: str) -> str:
    return f"http://{RCLONE_RC_HOST}:{RCLONE_RC_PORT}/{command.lstrip('/')}"


def _rc_raw_call(command: str, payload=None, timeout=60):
    data = json.dumps(payload or {}).encode("utf-8")
    req = urllib.request.Request(
        _rc_url(command), data=data, method="POST",
        headers={"Content-Type": "application/json", "Authorization": _rc_auth_header(), "User-Agent": "ClinicaDigitale-R41"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read(16 * 1024 * 1024)
    except urllib.error.HTTPError as exc:
        raw = exc.read(2 * 1024 * 1024)
        try:
            body = json.loads(raw.decode("utf-8", "replace"))
            detail = str(body.get("error") or body.get("message") or "").strip()
        except Exception:
            detail = raw.decode("utf-8", "replace").strip()
        raise RuntimeError(detail or f"Servizio cloud rclone: errore HTTP {exc.code}") from exc
    if not raw:
        return {}
    try:
        return json.loads(raw.decode("utf-8", "replace"))
    except Exception as exc:
        raise RuntimeError("Risposta non valida dal servizio cloud locale") from exc


def _rclone_rc_alive() -> bool:
    try:
        result = _rc_raw_call("core/version", {}, timeout=1.2)
        return bool(result)
    except Exception:
        return False


def stop_rclone_rcd():
    global RCLONE_RC_PROC
    with RCLONE_RC_LOCK:
        proc = RCLONE_RC_PROC
        if proc is not None:
            try:
                if proc.poll() is None:
                    try: _rc_raw_call("core/quit", {"exitCode": 0}, timeout=1.0)
                    except Exception: pass
                    try: proc.wait(timeout=2.0)
                    except Exception: proc.kill()
            except Exception:
                pass
        RCLONE_RC_PROC = None


def _choose_loopback_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((RCLONE_RC_HOST, 0))
        return int(sock.getsockname()[1])


def ensure_rclone_rcd():
    global RCLONE_RC_PROC, RCLONE_RC_PASSWORD, RCLONE_RC_PORT
    if not RCLONE_EXE.exists():
        raise RuntimeError("Connettore cloud non installato")
    with RCLONE_RC_LOCK:
        if RCLONE_RC_PROC is not None and RCLONE_RC_PROC.poll() is None and _rclone_rc_alive():
            return
        stop_rclone_rcd()
        RCLONE_RC_PORT = _choose_loopback_port()
        RCLONE_RC_PASSWORD = secrets.token_urlsafe(24)
        command = [
            str(RCLONE_EXE), "--config", str(RCLONE_CONFIG), "--log-level", "ERROR", "rcd",
            "--rc-addr", f"{RCLONE_RC_HOST}:{RCLONE_RC_PORT}",
            "--rc-user", RCLONE_RC_USER, "--rc-pass", RCLONE_RC_PASSWORD,
            "--rc-job-expire-duration", "10m", "--rc-job-expire-interval", "30s",
            "--rc-server-read-timeout", "35m", "--rc-server-write-timeout", "35m",
        ]
        RCLONE_RC_PROC = subprocess.Popen(
            command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            env=rclone_env(), creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        deadline = time.monotonic() + 10.0
        while time.monotonic() < deadline:
            if RCLONE_RC_PROC.poll() is not None:
                raise RuntimeError("Il servizio cloud locale non è riuscito ad avviarsi")
            if _rclone_rc_alive():
                return
            time.sleep(0.15)
        try: RCLONE_RC_PROC.kill()
        except Exception: pass
        RCLONE_RC_PROC = None
        raise RuntimeError("Il servizio cloud locale non risponde")


def rc_call(command: str, payload=None, timeout=120, retry=True):
    ensure_rclone_rcd()
    try:
        return _rc_raw_call(command, payload or {}, timeout=timeout)
    except (urllib.error.URLError, ConnectionError, TimeoutError, OSError) as exc:
        if not retry:
            raise RuntimeError("Il servizio cloud locale si è interrotto") from exc
        stop_rclone_rcd()
        ensure_rclone_rcd()
        return _rc_raw_call(command, payload or {}, timeout=timeout)


def _split_remote_spec(value: str):
    if not valid_remote_path(value):
        raise ValueError("Percorso cloud non valido")
    name, path = value.split(":", 1)
    return name + ":", path.lstrip("/\\")


def _cli_remote_list(remote: str, recursive=True, files_only=True):
    """Fallback affidabile per i provider che possono restituire risultati vuoti via RC.

    Il comando CLI usa lo stesso rclone.exe e lo stesso rclone.conf gia verificati
    durante la configurazione del provider. Serve soprattutto al ripristino iniziale
    su installazioni vergini, dove MEGA puo risultare autenticato ma operations/list
    del demone RC restituire una lista vuota.
    """
    args = ["lsjson", remote, "--no-mimetype"]
    if recursive:
        args.append("--recursive")
    if files_only:
        args.append("--files-only")
    try:
        raw = run_rclone(args, timeout=180)["stdout"]
    except Exception as exc:
        if _rclone_not_found(exc):
            return []
        raise
    parsed = parse_rclone_json(raw)
    if isinstance(parsed, list):
        return parsed
    if not str(raw or "").strip():
        return []
    raise RuntimeError("Il servizio cloud ha restituito un elenco non valido")



def _safe_cloud_subpath(value: str) -> str:
    text = str(value or "").replace("\\", "/").strip().strip("/")
    if not text or len(text) > 500 or "\x00" in text or "\n" in text or "\r" in text or ":" in text:
        raise ValueError("Cartella cloud non valida")
    parts = [part for part in text.split("/") if part not in ("", ".")]
    if not parts or any(part == ".." for part in parts):
        raise ValueError("Cartella cloud non valida")
    return "/".join(parts)


def _cli_dir_names(remote: str):
    """Elenca solo le cartelle di un singolo livello senza usare il demone RC.

    lsf e lsd usano percorsi indipendenti di output: il secondo viene usato come
    fallback per rendere il ripristino MEGA robusto anche quando un comando di
    listing restituisce inaspettatamente un output vuoto.
    """
    names = []
    try:
        raw = run_rclone(["lsf", remote, "--dirs-only", "--format", "p"], timeout=120)["stdout"]
        names = [line.strip().rstrip("/\\") for line in raw.splitlines() if line.strip()]
    except Exception as exc:
        if not _rclone_not_found(exc):
            raise
    if names:
        return names
    try:
        raw = run_rclone(["lsd", remote], timeout=120)["stdout"]
    except Exception as exc:
        if _rclone_not_found(exc):
            return []
        raise
    for line in raw.splitlines():
        line = line.rstrip()
        match = re.match(r"^\s*\S+\s+\S+\s+\S+\s+\S+\s+(.*)$", line)
        if match and match.group(1).strip():
            names.append(match.group(1).strip().rstrip("/\\"))
    return names


def _cli_file_items(remote: str):
    """Elenca i file di un singolo livello con fallback lsf.

    Il percorso primario usa lsjson per mantenere Size/ModTime. Se il provider
    restituisce una lista vuota, lsf consente comunque di recuperare i nomi.
    """
    try:
        raw = run_rclone(["lsjson", remote, "--files-only", "--no-mimetype"], timeout=120)["stdout"]
        parsed = parse_rclone_json(raw)
        if isinstance(parsed, list) and parsed:
            return parsed
    except Exception as exc:
        if not _rclone_not_found(exc):
            raise
    try:
        raw = run_rclone(["lsf", remote, "--files-only", "--format", "p"], timeout=120)["stdout"]
    except Exception as exc:
        if _rclone_not_found(exc):
            return []
        raise
    return [{"Path": line.strip(), "Name": line.strip(), "IsDir": False} for line in raw.splitlines() if line.strip()]


def _snapshot_sort_key(item: dict):
    mod_time = str(item.get("ModTime") or "")
    path = str(item.get("Path") or item.get("Name") or "")
    # I nomi snapshot includono la data ISO e costituiscono un fallback
    # deterministico quando il provider non espone ModTime.
    date_match = re.search(r"(20\d{2}-\d{2}-\d{2}T\d{2}[-:]\d{2}[-:]\d{2})", path)
    embedded = date_match.group(1).replace(":", "-") if date_match else ""
    return (mod_time, embedded, path)


def _read_cloud_json_cli(remote: str) -> dict:
    try:
        raw = run_rclone(["cat", remote], timeout=120)["stdout"]
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except Exception as exc:
        if _rclone_not_found(exc):
            return {}
        raise


def discover_dossier_archives(remote: str, base_path: str = "Dossier Sanitario Locale") -> dict:
    """Scopre gli archivi Dossier senza dipendere dalla scansione ricorsiva RC.

    Per la prima configurazione usa direttamente il percorso standard/basePath,
    elenca un solo livello per volta e verifica ogni manifest/snapshot. Solo come
    compatibilità finale viene mantenuta la vecchia ricerca ricorsiva.
    """
    fs, root_path = _split_remote_spec(remote)
    if root_path:
        raise ValueError("La ricerca iniziale deve partire dalla radice del servizio cloud")
    base = _safe_cloud_subpath(base_path or "Dossier Sanitario Locale")
    base_remote = fs + base

    root_dirs = _cli_dir_names(fs)
    root_names = {name.casefold(): name for name in root_dirs}
    base_leaf = base.split("/")[-1]
    base_found = False

    # Il percorso standard viene provato direttamente anche se il listing della
    # radice è incompleto, perché alcuni backend possono elencare e stat-are in
    # modo differente.
    try:
        archive_dirs = _cli_dir_names(base_remote)
        base_found = bool(archive_dirs) or base_leaf.casefold() in root_names
    except Exception as exc:
        if _rclone_not_found(exc):
            archive_dirs = []
        else:
            raise

    archives = []
    invalid = 0
    for directory in archive_dirs:
        leaf = directory.replace("\\", "/").rstrip("/").split("/")[-1]
        if not leaf.lower().startswith("archive_"):
            continue
        archive_root = f"{base}/{directory}".replace("//", "/").strip("/")
        manifest_remote = f"{fs}{archive_root}/archive.json"
        manifest = _read_cloud_json_cli(manifest_remote)
        archive_id = str(manifest.get("archiveId") or "")
        if manifest.get("format") != "DSL5-CLOUD" or not archive_id.startswith("archive_"):
            invalid += 1
            continue
        snapshot_root = f"{archive_root}/snapshots"
        snapshot_items = [
            item for item in _cli_file_items(f"{fs}{snapshot_root}")
            if str(item.get("Path") or item.get("Name") or "").lower().endswith(".dsl5")
        ]
        if not snapshot_items:
            invalid += 1
            continue
        snapshot_items.sort(key=_snapshot_sort_key, reverse=True)
        snap = dict(snapshot_items[0])
        snap_name = str(snap.get("Path") or snap.get("Name") or "").replace("\\", "/").lstrip("/")
        snap["Path"] = f"{snapshot_root}/{snap_name}".replace("//", "/")
        snap["Name"] = snap_name.split("/")[-1]
        archives.append({
            "id": archive_id,
            "displayName": str(manifest.get("displayName") or "Archivio Dossier"),
            "root": archive_root,
            "basePath": str(manifest.get("basePath") or base),
            "manifestPath": f"{archive_root}/archive.json",
            "snapshot": snap,
            "modTime": str(snap.get("ModTime") or ""),
            "createdAt": str(manifest.get("createdAt") or ""),
        })

    if archives:
        archives.sort(key=lambda item: (str(item.get("modTime") or ""), str(item.get("snapshot", {}).get("Path") or "")), reverse=True)
        return {"archives": archives, "reason": "", "baseFolderFound": True, "strategy": "direct"}

    # Compatibilità con eventuali archivi storici collocati in un basePath
    # diverso. La scansione ricorsiva resta solo un fallback, non il percorso
    # principale del ripristino.
    try:
        items = _cli_remote_list(fs, recursive=True, files_only=True)
    except Exception:
        items = []
    manifests = [
        item for item in items
        if not item.get("IsDir") and re.search(r"(^|/)archive_[^/]+/archive\.json$", str(item.get("Path") or item.get("Name") or ""), re.I)
    ]
    for item in manifests:
        path = str(item.get("Path") or item.get("Name") or "").replace("\\", "/").lstrip("/")
        root = re.sub(r"/archive\.json$", "", path, flags=re.I)
        manifest = _read_cloud_json_cli(fs + path)
        archive_id = str(manifest.get("archiveId") or "")
        if manifest.get("format") != "DSL5-CLOUD" or not archive_id.startswith("archive_"):
            continue
        snaps = [
            dict(x) for x in items
            if not x.get("IsDir")
            and str(x.get("Path") or x.get("Name") or "").replace("\\", "/").startswith(root + "/snapshots/")
            and str(x.get("Path") or x.get("Name") or "").lower().endswith(".dsl5")
        ]
        if not snaps:
            continue
        snaps.sort(key=_snapshot_sort_key, reverse=True)
        archives.append({
            "id": archive_id,
            "displayName": str(manifest.get("displayName") or "Archivio Dossier"),
            "root": root,
            "basePath": str(manifest.get("basePath") or root.rsplit("/", 1)[0] or "Dossier Sanitario Locale"),
            "manifestPath": path,
            "snapshot": snaps[0],
            "modTime": str(snaps[0].get("ModTime") or ""),
            "createdAt": str(manifest.get("createdAt") or ""),
        })
    if archives:
        archives.sort(key=lambda item: (str(item.get("modTime") or ""), str(item.get("snapshot", {}).get("Path") or "")), reverse=True)
        return {"archives": archives, "reason": "", "baseFolderFound": base_found, "strategy": "recursive-fallback"}

    if not base_found:
        reason = "base_folder_missing"
    elif invalid:
        reason = "archive_invalid"
    else:
        reason = "no_archive"
    return {"archives": [], "reason": reason, "baseFolderFound": bool(base_found), "strategy": "direct"}



def rc_remote_stat(remote: str, allow_missing=True):
    """Legge lo stato remoto dalla stessa vista CLI usata da lista e download."""
    return _cloud_remote_stat(remote, allow_missing=allow_missing, retries=2)


def rc_remote_list(remote: str, recursive=True, files_only=True):
    """Elenca il cloud con un'unica vista CLI coerente.

    R40 aveva mantenuto operations/list del demone RC come percorso primario e
    usava la CLI solo quando RC restituiva una lista vuota. Su MEGA questo puo'
    produrre due viste diverse dello stesso archivio: RC puo' conservare una
    voce che la CLI non vede piu', mentre il download successivo usa la CLI.
    La sincronizzazione usa quindi sempre lsjson tramite _cli_remote_list.
    """
    return _cli_remote_list(remote, recursive=recursive, files_only=files_only)


def _local_fs_and_remote(path: str):
    p = Path(path).resolve()
    return str(p.parent), p.name


def rc_copyfile_sync(src: str, dst: str, *, src_is_remote: bool, timeout=1800):
    # I trasferimenti di singoli file non passano dal demone RC. Su Windows e MEGA
    # operations/copyfile puo' interpretare in modo ambiguo un filesystem locale o
    # un percorso appena enumerato. La CLI copyto usa invece il percorso completo.
    run_rclone(["copyto", src, dst], timeout=timeout)


def rc_copyfile_job(src: str, dst: str, group: str, *, src_is_remote=False):
    if src_is_remote:
        src_fs, src_remote = _split_remote_spec(src); dst_fs, dst_remote = _local_fs_and_remote(dst)
    else:
        src_fs, src_remote = _local_fs_and_remote(src); dst_fs, dst_remote = _split_remote_spec(dst)
    return rc_call("operations/copyfile", {
        "srcFs": src_fs, "srcRemote": src_remote, "dstFs": dst_fs, "dstRemote": dst_remote,
        "_async": True, "_group": group,
    }, timeout=30)


def cloud_status():
    global RCLONE_VERSION_CACHE
    result = {"ok": True, "installed": RCLONE_EXE.exists(), "version": "", "configExists": RCLONE_CONFIG.exists(), "cloudDir": str(CLOUD_DIR)}
    if RCLONE_EXE.exists():
        try:
            if not RCLONE_VERSION_CACHE:
                RCLONE_VERSION_CACHE = run_rclone(["version"], timeout=20)["stdout"].splitlines()[0]
            result["version"] = RCLONE_VERSION_CACHE
        except Exception as exc: result["error"] = str(exc)
    return result

def install_rclone():
    if os.name != "nt": raise RuntimeError("Il connettore cloud integrato può essere installato soltanto su Windows")
    CLOUD_DIR.mkdir(parents=True, exist_ok=True)
    if RCLONE_EXE.exists(): return {"installed": True, "version": run_rclone(["version"], timeout=20)["stdout"].splitlines()[0]}
    # La distribuzione Microsoft Store può includere rclone nel pacchetto. In quel
    # caso viene copiato nella cartella dati scrivibile senza scaricare/eseguire
    # componenti esterni. Il download ufficiale verificato resta solo come fallback
    # per la variante Win32 tradizionale finché il pacchetto Store non è disponibile.
    if BUNDLED_RCLONE_EXE.is_file():
        shutil.copy2(BUNDLED_RCLONE_EXE, RCLONE_EXE)
        return {"installed": True, "version": run_rclone(["version"], timeout=20)["stdout"].splitlines()[0], "source": "bundled"}
    # Anche il fallback Win32 usa esclusivamente la sessione TEMP proprietaria.
    # Il pacchetto scaricato viene eliminato in ogni percorso, compresi errori di
    # rete, hash o ZIP, così non può accumularsi fra avvii.
    SESSION_TEMP_DIR.mkdir(parents=True, exist_ok=True)
    archive = SESSION_TEMP_DIR / f"rclone-{RCLONE_VERSION}.zip"
    archive.unlink(missing_ok=True)
    try:
        request = urllib.request.Request(RCLONE_URL, headers={"User-Agent": f"DossierSanitarioLocale/{VERSION}"})
        with urllib.request.urlopen(request, timeout=120) as response, archive.open("wb") as output:
            shutil.copyfileobj(response, output)
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        if digest.lower() != RCLONE_SHA256.lower():
            raise RuntimeError("Controllo di integrità del connettore cloud non superato")
        with zipfile.ZipFile(archive) as zf:
            member = next((n for n in zf.namelist() if n.endswith("/rclone.exe")), None)
            if not member:
                raise RuntimeError("Eseguibile rclone non trovato nel pacchetto")
            with zf.open(member) as src, RCLONE_EXE.open("wb") as dst:
                shutil.copyfileobj(src, dst)
        return {"installed": True, "version": run_rclone(["version"], timeout=20)["stdout"].splitlines()[0], "source": "verified-official-fallback"}
    except Exception:
        RCLONE_EXE.unlink(missing_ok=True)
        raise
    finally:
        archive.unlink(missing_ok=True)

def _cloud_staging_remote(remote: str) -> str:
    return f"{remote}.uploading-{int(time.time())}-{secrets.token_hex(6)}"

def _cloud_remote_stat(remote: str, *, allow_missing: bool = False, retries: int = 1) -> dict:
    last_error = None
    for attempt in range(max(1, int(retries))):
        try:
            return parse_rclone_json(run_rclone(["lsjson", remote, "--stat"], timeout=90)["stdout"])
        except Exception as exc:
            last_error = exc
            if not _rclone_not_found(exc):
                raise
            if attempt + 1 < max(1, int(retries)):
                time.sleep(0.35)
                continue
            if allow_missing:
                return {}
            raise RuntimeError(f"Il file cloud atteso non è ancora disponibile: {remote}") from exc
    if allow_missing:
        return {}
    raise last_error or RuntimeError("Verifica cloud non completata")

def _cloud_verify_size(remote: str, expected: int, *, retries: int = 4) -> dict:
    # MEGA can expose the result of a completed operation with a short delay.
    # Retry both an absent object and a temporarily stale size instead of
    # treating the first observation as a definitive transfer failure.
    attempts = max(1, int(retries))
    last_error = None
    last_size = -1
    for attempt in range(attempts):
        try:
            stat = _cloud_remote_stat(remote, allow_missing=True, retries=1)
            last_size = int(stat.get("Size", -1) or -1) if stat else -1
            if stat and (expected < 0 or last_size == int(expected)):
                return stat
            last_error = None
        except Exception as exc:
            last_error = exc
        if attempt + 1 < attempts:
            time.sleep(min(0.40 + (attempt * 0.20), 1.80))
    if last_error is not None:
        raise RuntimeError(f"Verifica cloud non completata per {remote}") from last_error
    if last_size < 0:
        raise RuntimeError(f"Il file cloud atteso non è ancora disponibile: {remote}")
    raise RuntimeError(f"Verifica trasferimento non superata: attesi {expected} byte, rilevati {last_size}")

def _cloud_delete_best_effort(remote: str):
    try:
        run_rclone(["deletefile", remote], timeout=120)
    except Exception:
        pass

def _cloud_finalize_staged_upload(staging: str, remote: str, local_source: str, total_bytes: int) -> str:
    """Finalize a verified upload without depending on MEGA moveto alone.

    The primary path remains staging -> moveto -> final.  If MEGA reports an
    error while finalizing, first verify whether the operation actually became
    visible remotely.  Only when the final object is still not verifiable do
    we upload the already verified local encrypted blob directly to the final
    path and verify it again.  The caller may create the commit marker only
    after this function returns successfully.
    """
    expected = int(total_bytes)
    _cloud_verify_size(staging, expected, retries=10)

    # Idempotent retry: a previous attempt may already have completed even if
    # the client never received the final acknowledgement.
    try:
        _cloud_verify_size(remote, expected, retries=2)
        _cloud_delete_best_effort(staging)
        return "already-final"
    except Exception:
        pass

    move_error = None
    try:
        run_rclone([
            "moveto", staging, remote,
            "--retries", "5", "--low-level-retries", "15", "--retries-sleep", "2s",
        ], timeout=900)
    except Exception as exc:
        move_error = exc

    # A provider can return an error while the remote operation has actually
    # completed.  Trust the verified final object, not the process exit alone.
    try:
        _cloud_verify_size(remote, expected, retries=10)
        _cloud_delete_best_effort(staging)
        return "moveto" if move_error is None else "moveto-confirmed-after-error"
    except Exception as verify_error:
        first_verify_error = verify_error

    source = Path(local_source)
    if not source.is_file():
        cause = move_error or first_verify_error
        raise RuntimeError("La copia locale verificata non è più disponibile per completare il trasferimento cloud") from cause
    local_size = int(source.stat().st_size)
    if local_size != expected:
        raise RuntimeError(f"Copia locale non valida durante il recupero cloud: attesi {expected} byte, rilevati {local_size}")

    # Provider-neutral fallback: do not rely on server-side rename semantics.
    # Reuse the original encrypted local blob, then require a fresh remote size
    # verification before reporting success.
    fallback_error = None
    try:
        run_rclone([
            "copyto", str(source), remote,
            "--retries", "8", "--low-level-retries", "20", "--retries-sleep", "2s",
            "--transfers", "1", "--checkers", "1",
        ], timeout=1800)
    except Exception as exc:
        fallback_error = exc

    try:
        _cloud_verify_size(remote, expected, retries=12)
    except Exception as final_verify_error:
        cause = fallback_error or move_error or final_verify_error
        raise RuntimeError("Impossibile rendere definitiva e verificare la copia cloud") from cause

    _cloud_delete_best_effort(staging)
    return "direct-copy" if fallback_error is None else "direct-copy-confirmed-after-error"

def transactional_cloud_upload(temp_path: str, remote: str, total_bytes: int):
    staging = _cloud_staging_remote(remote)
    _cloud_delete_best_effort(staging)
    try:
        run_rclone([
            "copyto", temp_path, staging,
            "--retries", "8", "--low-level-retries", "20", "--retries-sleep", "2s",
            "--transfers", "1", "--checkers", "1",
        ], timeout=1800)
        _cloud_finalize_staged_upload(staging, remote, temp_path, total_bytes)
    except Exception:
        _cloud_delete_best_effort(staging)
        raise


def _update_cloud_download_job(job_id: str, **values):
    with CLOUD_DOWNLOAD_JOBS_LOCK:
        job = CLOUD_DOWNLOAD_JOBS.get(job_id)
        if not job:
            return
        job.update(values)
        job["updatedAt"] = time.time()


def cloud_download_worker(job_id: str, remote: str):
    staged = None
    try:
        _update_cloud_download_job(job_id, status="running", stage="stat", percent=2)
        stat = parse_rclone_json(run_rclone(["lsjson", remote, "--stat"], timeout=90)["stdout"])
        expected_size = int(stat.get("Size", -1) or -1)
        if expected_size <= 0:
            raise RuntimeError("Dimensione del file cloud non valida")
        stage_dir = SESSION_TEMP_DIR / "cloud_downloads"
        stage_dir.mkdir(parents=True, exist_ok=True)
        staged = stage_dir / ("cloud_" + job_id + ".bin")
        _update_cloud_download_job(job_id, status="running", stage="download", bytes=0, totalBytes=expected_size, percent=5, path=str(staged))
        last_error = None
        for attempt in range(3):
            try:
                staged.unlink(missing_ok=True)
                run_rclone([
                    "copyto", remote, str(staged),
                    "--retries", "8", "--low-level-retries", "20", "--retries-sleep", "2s",
                    "--transfers", "1", "--checkers", "1",
                ], timeout=1800)
                if not staged.exists():
                    raise RuntimeError("Il file cloud non è stato creato nel deposito temporaneo locale")
                actual_size = staged.stat().st_size
                if actual_size != expected_size:
                    raise RuntimeError(f"Download cloud incompleto: attesi {expected_size} byte, ricevuti {actual_size}")
                break
            except Exception as exc:
                last_error = exc
                staged.unlink(missing_ok=True)
                if attempt < 2:
                    _update_cloud_download_job(job_id, status="running", stage="retry", percent=5, error="")
                    time.sleep((1.0, 2.5)[attempt])
                    continue
                raise
        _update_cloud_download_job(job_id, status="running", stage="verify", bytes=expected_size, totalBytes=expected_size, percent=94)
        h = hashlib.sha256()
        with staged.open("rb") as source:
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk: break
                h.update(chunk)
        _update_cloud_download_job(job_id, status="ready", stage="ready", bytes=expected_size, totalBytes=expected_size, percent=100, sha256=h.hexdigest(), error="", path=str(staged))
        staged = None  # retained until explicit finish or TTL cleanup
    except Exception as exc:
        if staged is not None:
            try: staged.unlink(missing_ok=True)
            except Exception: pass
        _update_cloud_download_job(job_id, status="error", stage="error", error=_friendly_cloud_error(exc))


def _update_cloud_upload_job(job_id: str, **values):
    with CLOUD_UPLOAD_JOBS_LOCK:
        job = CLOUD_UPLOAD_JOBS.get(job_id)
        if not job:
            return
        job.update(values)
        job["updatedAt"] = time.time()


def run_rclone_copyto_progress(src: str, dst: str, total_bytes: int, progress_callback, timeout=1800):
    global RCLONE_LAST_CALL
    if not RCLONE_EXE.exists():
        raise RuntimeError("Connettore cloud non installato")
    command = [str(RCLONE_EXE), "--config", str(RCLONE_CONFIG), "--use-json-log", "--log-level", "NOTICE", "copyto", src, dst, "--stats", "1s", "--stats-log-level", "NOTICE"]
    with RCLONE_CALL_LOCK:
        wait = RCLONE_MIN_INTERVAL - (time.monotonic() - RCLONE_LAST_CALL)
        if wait > 0: time.sleep(wait)
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace", env=rclone_env(), creationflags=flags, bufsize=1)
        lines = queue.Queue()
        def reader(stream):
            try:
                for line in iter(stream.readline, ""):
                    if line: lines.put(line.strip())
            finally:
                try: stream.close()
                except Exception: pass
        threading.Thread(target=reader, args=(proc.stderr,), daemon=True, name="rclone-upload-stats").start()
        started = time.monotonic(); stderr_tail=[]; last_bytes=0
        while proc.poll() is None:
            if time.monotonic() - started > timeout:
                try: proc.kill()
                except Exception: pass
                raise subprocess.TimeoutExpired(command, timeout)
            try: line = lines.get(timeout=.25)
            except queue.Empty: continue
            if not line: continue
            parsed = None
            try: parsed = json.loads(line)
            except Exception:
                stderr_tail.append(line); stderr_tail=stderr_tail[-12:]; continue
            done = parsed.get("bytes")
            total = parsed.get("totalBytes") or total_bytes
            if done is None and isinstance(parsed.get("stats"), dict):
                done = parsed["stats"].get("bytes"); total = parsed["stats"].get("totalBytes") or total
            try: done = max(0, int(done or 0)); total = max(0, int(total or total_bytes or 0))
            except Exception: continue
            if done < last_bytes: done = last_bytes
            last_bytes = done
            pct = int(round(done / total * 100)) if total > 0 else None
            progress_callback(done, total, pct)
        # Drain final lines without blocking.
        while True:
            try: line=lines.get_nowait()
            except queue.Empty: break
            try:
                parsed=json.loads(line); done=int(parsed.get("bytes") or parsed.get("stats",{}).get("bytes") or 0); total=int(parsed.get("totalBytes") or parsed.get("stats",{}).get("totalBytes") or total_bytes or 0); pct=int(round(done/total*100)) if total else None; progress_callback(done,total,pct)
            except Exception:
                if line: stderr_tail.append(line); stderr_tail=stderr_tail[-12:]
        stdout = proc.stdout.read() if proc.stdout else ""
        RCLONE_LAST_CALL = time.monotonic()
    if proc.returncode != 0:
        detail = "\n".join(stderr_tail).strip() or str(stdout or "").strip() or f"Operazione cloud non riuscita (codice {proc.returncode})"
        raise RcloneCommandError(proc.returncode, detail, ["copyto", src, dst])
    progress_callback(total_bytes, total_bytes, 100)

def cloud_upload_worker(job_id: str, temp_path: str, remote: str, total_bytes: int):
    """Upload asincrono rapido con conferma applicativa.

    I pacchetti di sincronizzazione usano gia un file .commit separato: il file
    dati non viene considerato valido dagli altri dispositivi finche il marker
    non e stato caricato. Per questo non serve aggiungere anche staging remoto,
    doppie verifiche e moveto a ogni singolo upload. rclone copyto completa il
    trasferimento prima di restituire successo; per i file dati manteniamo una
    sola verifica remota di dimensione. I marker .commit, molto piccoli, sono
    considerati confermati dal successo di copyto stesso.
    """
    try:
        _update_cloud_upload_job(job_id, status="running", stage="upload", bytes=0, totalBytes=total_bytes, percent=0)
        def _progress(done, total, pct):
            value = None if pct is None else max(0, min(100, int(pct)))
            _update_cloud_upload_job(job_id, stage="upload", bytes=max(0, int(done or 0)), totalBytes=max(0, int(total or total_bytes)), percent=value)
        run_rclone_copyto_progress(temp_path, remote, total_bytes, _progress, timeout=1800)
        if not str(remote).lower().endswith(".commit"):
            _update_cloud_upload_job(job_id, stage="verify", bytes=total_bytes, totalBytes=total_bytes, percent=None)
            _cloud_verify_size(remote, total_bytes, retries=3)
        _update_cloud_upload_job(job_id, status="done", stage="done", bytes=total_bytes, totalBytes=total_bytes, percent=100, error="")
    except Exception as exc:
        _update_cloud_upload_job(job_id, status="error", stage="error", error=_friendly_cloud_error(exc))
    finally:
        try: os.remove(temp_path)
        except OSError: pass

def _friendly_cloud_error(exc: Exception) -> str:
    raw = str(exc or "").strip()
    low = raw.lower()
    if "source doesn't exist or is a directory and destination is a file" in low:
        return "Un file dell’archivio cloud non è stato letto correttamente. Le modifiche locali restano in attesa e la sincronizzazione può essere riprovata."
    if "not found" in low or "directory" in low and "found" in low:
        return "Il percorso cloud non è ancora disponibile. Il Dossier riproverà senza perdere le modifiche locali."
    if "timeout" in low or "timed out" in low:
        return "Il servizio cloud non ha risposto entro il tempo previsto. Le modifiche locali restano in attesa."
    if "authentication" in low or "login" in low or "password" in low:
        return "Il servizio cloud non ha accettato l’autenticazione. Verifica il collegamento del servizio."
    if raw:
        return "Sincronizzazione cloud non completata. Le modifiche locali sono state conservate e possono essere riprovate."
    return "Sincronizzazione cloud non completata."


class RcloneCommandError(RuntimeError):
    def __init__(self, returncode: int, message: str, command_args=None):
        super().__init__(message)
        self.returncode = int(returncode)
        self.command_args = list(command_args or [])

def _rclone_not_found(exc: Exception) -> bool:
    if isinstance(exc, RcloneCommandError) and exc.returncode in (3, 4):
        return True
    text = str(exc).lower()
    return any(token in text for token in ("directory not found", "file not found", "object not found", "not found"))

def run_rclone(args, timeout=300):
    global RCLONE_LAST_CALL
    if not RCLONE_EXE.exists(): raise RuntimeError("Connettore cloud non installato")
    command = [str(RCLONE_EXE), "--config", str(RCLONE_CONFIG), "--log-level", "ERROR", *args]
    with RCLONE_CALL_LOCK:
        wait = RCLONE_MIN_INTERVAL - (time.monotonic() - RCLONE_LAST_CALL)
        if wait > 0: time.sleep(wait)
        proc = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout, env=rclone_env(), creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        RCLONE_LAST_CALL = time.monotonic()
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        if not detail:
            if proc.returncode == 3: detail = "Directory cloud non trovata"
            elif proc.returncode == 4: detail = "File cloud non trovato"
            else: detail = f"Operazione cloud non riuscita (codice {proc.returncode})"
        raise RcloneCommandError(proc.returncode, detail, args)
    return {"stdout": proc.stdout or "", "stderr": proc.stderr or "", "returncode": proc.returncode}

def run_rclone_bytes(args, timeout=900):
    global RCLONE_LAST_CALL
    if not RCLONE_EXE.exists(): raise RuntimeError("Connettore cloud non installato")
    command = [str(RCLONE_EXE), "--config", str(RCLONE_CONFIG), "--log-level", "ERROR", *args]
    with RCLONE_CALL_LOCK:
        wait = RCLONE_MIN_INTERVAL - (time.monotonic() - RCLONE_LAST_CALL)
        if wait > 0: time.sleep(wait)
        proc = subprocess.run(command, capture_output=True, text=False, timeout=timeout, env=rclone_env(), creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        RCLONE_LAST_CALL = time.monotonic()
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or b"").decode("utf-8", "replace").strip()
        if not detail:
            if proc.returncode == 3: detail = "Directory cloud non trovata"
            elif proc.returncode == 4: detail = "File cloud non trovato"
            else: detail = f"Operazione cloud non riuscita (codice {proc.returncode})"
        raise RcloneCommandError(proc.returncode, detail, args)
    return bytes(proc.stdout or b"")

def parse_rclone_json(output: str):
    text = (output or "").strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.rfind("{\n")
        if start >= 0:
            try:
                return json.loads(text[start:])
            except json.JSONDecodeError:
                pass
    return {}


def valid_remote_path(value: str) -> bool:
    if not value or len(value) > 1000 or "\x00" in value or "\n" in value or "\r" in value:
        return False
    if ":" not in value:
        return False
    remote = value.split(":", 1)[0]
    return remote.replace("_", "").replace("-", "").isalnum()


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex((HOST, port)) != 0


def serve(server: ThreadingHTTPServer):
    server.serve_forever(poll_interval=0.25)


def configure_log(path: str | None):
    if not path:
        return None
    log_path = Path(path).expanduser().resolve()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    stream = log_path.open("a", encoding="utf-8", buffering=1)
    sys.stdout = stream
    sys.stderr = stream
    return stream


def parse_args():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--log-file", default="")
    parser.add_argument("--medication-agent", action="store_true")
    return parser.parse_args()


def update_windows_registration_version():
    if os.name != "nt" or INSTALLER_VERIFY_MODE:
        return
    try:
        import winreg
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\ClinicaDigitaleDossierSanitario"
        uninstaller = ROOT / "Disinstalla Clinica Digitale.exe"
        icon = ROOT / "assets" / "dossier_sanitario_app.ico"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
            winreg.SetValueEx(key, "DisplayName", 0, winreg.REG_SZ, "Clinica Digitale - Dossier Sanitario")
            winreg.SetValueEx(key, "DisplayVersion", 0, winreg.REG_SZ, "1.0.1")
            winreg.SetValueEx(key, "Publisher", 0, winreg.REG_SZ, "Clinica Digitale")
            winreg.SetValueEx(key, "InstallLocation", 0, winreg.REG_SZ, str(ROOT))
            if icon.exists():
                winreg.SetValueEx(key, "DisplayIcon", 0, winreg.REG_SZ, str(icon))
            if uninstaller.exists():
                command = f'"{uninstaller}"'
                winreg.SetValueEx(key, "UninstallString", 0, winreg.REG_SZ, command)
                winreg.SetValueEx(key, "QuietUninstallString", 0, winreg.REG_SZ, command)
            winreg.SetValueEx(key, "NoModify", 0, winreg.REG_DWORD, 1)
            winreg.SetValueEx(key, "NoRepair", 0, winreg.REG_DWORD, 1)
            try: winreg.DeleteValue(key, "NoRemove")
            except FileNotFoundError: pass
    except Exception as exc:
        print(f"Registrazione Windows non aggiornata: {exc}", flush=True)


def _existing_instance_health():
    try:
        with urllib.request.urlopen(f"http://{HOST}:{API_PORT}/api/health?probe=launcher", timeout=0.8) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except Exception:
        return None

def _request_existing_instance_close() -> bool:
    """Ask an older/transitioning Dossier engine to release the fixed ports.

    This is deliberately local-only and uses the pre-existing unauthenticated
    lifecycle endpoint. It prevents an upgrade from reopening an old payload
    that was still alive on 127.0.0.1 after the new files were installed.
    """
    try:
        req = urllib.request.Request(
            f"http://{HOST}:{API_PORT}/api/app/close",
            data=b"{}",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=1.5) as response:
            return 200 <= int(getattr(response, "status", 200)) < 300
    except Exception:
        return False

def _wait_ports_free(timeout: float = 15.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if port_free(WEB_PORT) and port_free(API_PORT):
            return True
        time.sleep(0.20)
    return port_free(WEB_PORT) and port_free(API_PORT)

def _wait_for_previous_verify_instance(timeout: float = 20.0) -> bool:
    """Distingue un Dossier realmente attivo dal motore transitorio dell'installer.

    Durante la chiusura del health-check le porte possono restare occupate per
    qualche secondo e /api/health può essere momentaneamente irraggiungibile.
    In quel caso non bisogna perdere l'avvio finale richiesto dall'utente.
    """
    if port_free(WEB_PORT) and port_free(API_PORT):
        return True
    deadline = time.monotonic() + timeout
    saw_transition = False
    while time.monotonic() < deadline:
        if port_free(WEB_PORT) and port_free(API_PORT):
            return True
        state = _existing_instance_health()
        if state:
            if state.get("installerVerifyMode") or state.get("closing"):
                # Un verifier o un processo che ha già ricevuto /api/app/close è
                # sempre transitorio: attendi la reale liberazione delle porte.
                saw_transition = True
            elif not saw_transition:
                # Istanza normale già attiva: non crearne una seconda.
                return False
        else:
            # Nessuna risposta mentre le porte risultano ancora occupate: può
            # essere la brevissima fase di shutdown del motore di verifica.
            saw_transition = True
        time.sleep(0.20)
    return port_free(WEB_PORT) and port_free(API_PORT)

def _open_browser_after_readiness(url: str):
    # Il CORE dell'installer avvia temporaneamente il motore per il health-check.
    # Aspettiamo il probe prima di decidere se questa sia una vera apertura utente.
    if APP_STOP_EVENT.wait(3.0):
        return
    if APP_STOP_EVENT.is_set():
        return
    _open_dossier_browser(url)

def _cleanup_local_cloud_temps():
    """Remove all Dossier-owned disposable files left by current or crashed sessions."""
    try:
        APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
        TEMP_ROOT.mkdir(parents=True, exist_ok=True)
        # A single Dossier engine is allowed on the fixed local ports, so any previous
        # session directory is stale at this point. Remove it immediately, not after hours.
        for child in list(TEMP_ROOT.iterdir()):
            try:
                if child == SESSION_TEMP_DIR:
                    continue
                if child.is_dir():
                    shutil.rmtree(child, ignore_errors=True)
                else:
                    child.unlink(missing_ok=True)
            except Exception:
                pass
        SESSION_TEMP_DIR.mkdir(parents=True, exist_ok=True)
        os.environ["TEMP"] = str(SESSION_TEMP_DIR)
        os.environ["TMP"] = str(SESSION_TEMP_DIR)
        os.environ["PIP_CACHE_DIR"] = str(SESSION_TEMP_DIR / "pip-cache")
        tempfile.tempdir = str(SESSION_TEMP_DIR)
        # I residui delle vecchie release nel TEMP di Windows vengono puliti
        # usando ORIGINAL_SYSTEM_TEMP acquisito prima di reindirizzare TEMP/TMP.
    except Exception as exc:
        print(f"Pulizia temporanei rinviata: {exc}", flush=True)

def _cleanup_all_dossier_temps():
    try:
        with DOCUMENT_PREVIEW_LOCK:
            DOCUMENT_PREVIEWS.clear()
        shutil.rmtree(TEMP_ROOT, ignore_errors=True)
    except Exception:
        pass


def _windows_version_supported() -> bool:
    if os.name != "nt":
        return True
    try:
        return int(sys.getwindowsversion().major) >= 10
    except Exception:
        return False


def main() -> int:
    global INSTALLER_VERIFY_MODE
    if not _windows_version_supported():
        print("Clinica Digitale richiede Windows 10 o una versione successiva.", flush=True)
        return 3
    args = parse_args()
    if args.medication_agent:
        return _medication_agent_main()
    installer_verify_once = _installer_verify_marker_present()
    if installer_verify_once:
        INSTALLER_VERIFY_MODE = True
        args.no_browser = True
    log_stream = configure_log(args.log_file)
    pid_file = RUNTIME_STATE_DIR / "server.pid"
    pid_file.parent.mkdir(parents=True, exist_ok=True)
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True); BACKUP_DIR.mkdir(parents=True, exist_ok=True); DATA_DIR.mkdir(parents=True, exist_ok=True)
    _cleanup_legacy_system_temp_residues()
    _cleanup_local_cloud_temps()
    consolidate_dossier_shortcuts()
    update_windows_registration_version()
    url = f"http://{HOST}:{WEB_PORT}/index.html?v={UI_VERSION}"

    if not port_free(WEB_PORT) or not port_free(API_PORT):
        existing = _existing_instance_health()
        if existing and not existing.get("installerVerifyMode") and not existing.get("closing"):
            existing_ui = str(existing.get("uiVersion") or "").strip()
            if existing_ui == UI_VERSION:
                print("Il Dossier è già attivo: riapertura dell'interfaccia nella finestra applicativa.", flush=True)
                _open_dossier_browser(url)
                return 0
            # A healthy engine without this exact UI revision is an older installed
            # instance. Close it before starting R41 so a reinstall/update can never
            # reopen the previous R39/R40 interface from an already-running process.
            print(f"Istanza precedente rilevata ({existing_ui or 'revisione non dichiarata'}): aggiornamento del motore locale.", flush=True)
            _request_existing_instance_close()
            if not _wait_ports_free(15.0):
                if not _recover_stale_dossier_process(pid_file) or not _wait_ports_free(5.0):
                    print("Il motore precedente non ha liberato le porte dopo la richiesta di aggiornamento.", flush=True)
                    return 2
        elif not _wait_for_previous_verify_instance():
            # If no healthy Dossier answers, recover only a verified stale process
            # belonging to the bundled Python runtime. Never kill unrelated PIDs.
            if not _recover_stale_dossier_process(pid_file):
                print(f"Le porte {WEB_PORT} o {API_PORT} sono occupate e il motore precedente non è recuperabile in sicurezza.", flush=True)
                return 2

    web_server = ThreadingHTTPServer((HOST, WEB_PORT), StaticHandler)
    api_server = ThreadingHTTPServer((HOST, API_PORT), ApiHandler)
    web_server.daemon_threads = True
    api_server.daemon_threads = True

    threading.Thread(target=serve, args=(web_server,), daemon=True).start()
    threading.Thread(target=serve, args=(api_server,), daemon=True).start()
    pid_file.write_text(str(os.getpid()), encoding="ascii")
    global APP_LAST_HEARTBEAT, APP_CLOSE_REQUESTED_AT
    with APP_LIFECYCLE_LOCK:
        APP_LAST_HEARTBEAT = 0.0
        APP_CLOSE_REQUESTED_AT = 0.0
    APP_STOP_EVENT.clear()
    APP_EXPLICIT_CLOSING_EVENT.clear()
    threading.Thread(target=lifecycle_watchdog, daemon=True).start()
    if installer_verify_once:
        def _verify_safety_timeout():
            # Il CORE chiude normalmente il verifier via /api/app/close. Questo è
            # soltanto un paracadute: un verifier non deve mai restare sulle porte.
            if not APP_STOP_EVENT.wait(8.0):
                _clear_installer_verify_marker()
                APP_STOP_EVENT.set()
        threading.Thread(target=_verify_safety_timeout, daemon=True, name="installer-verify-timeout").start()

    print("DOSSIER SANITARIO LOCALE V6.0.4 · MOTORE PYTHON INTEGRATO", flush=True)
    print(f"Interfaccia: http://{HOST}:{WEB_PORT}/index.html?v={UI_VERSION}", flush=True)
    print(f"Motore:     http://{HOST}:{API_PORT}/api/health", flush=True)
    print("PDF digitali: PDFium con testo e coordinate", flush=True)
    print("Scansioni e foto: RapidOCR ONNX caricato soltanto al primo utilizzo", flush=True)

    if not args.no_browser and not INSTALLER_VERIFY_MODE:
        threading.Thread(target=_open_browser_after_readiness, args=(url,), daemon=True, name="browser-readiness").start()
    try:
        while not APP_STOP_EVENT.wait(0.5):
            pass
    except KeyboardInterrupt:
        APP_STOP_EVENT.set()
    finally:
        web_server.shutdown()
        api_server.shutdown()
        web_server.server_close()
        api_server.server_close()
        try:
            pid_file.unlink(missing_ok=True)
        except Exception:
            pass
        stop_rclone_rcd()
        terminate_owned_browser()
        terminate_owned_children()
        _cleanup_all_dossier_temps()
        if log_stream:
            log_stream.flush()
            log_stream.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
