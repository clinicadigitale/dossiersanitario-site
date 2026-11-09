"""Ponte tra la webapp e il motore originale del Dossier.

Esegue le richieste che l'interfaccia invierebbe al motore locale
(http://127.0.0.1:8896) passando direttamente all'ApiHandler originale
di server.py, senza aprire porte di rete. Il codice del motore non viene
modificato: qui ci sono solo gli adattamenti per l'ambiente browser.
"""
import io, os, sys, types

def _modulo(nome, **attr):
    import importlib.machinery
    m = types.ModuleType(nome)
    m.__spec__ = importlib.machinery.ModuleSpec(nome, None)
    for k, v in attr.items():
        setattr(m, k, v)
    sys.modules[nome] = m
    return m

def prepara_ambiente(dati_dir, motore_dir):
    os.environ.setdefault("LOCALAPPDATA", dati_dir)
    os.makedirs(dati_dir, exist_ok=True)
    if motore_dir not in sys.path:
        sys.path.insert(0, motore_dir)
    vend = os.path.join(motore_dir, "vendor")
    if os.path.isdir(vend) and vend not in sys.path:
        sys.path.insert(0, vend)
    # mimetypes prima dello stub di winreg, così non legge il registro
    import mimetypes
    sys.modules.setdefault("winreg", None)
    mimetypes.init()
    if sys.modules.get("winreg") is None:
        sys.modules.pop("winreg", None)
    try:
        import winreg  # noqa
    except ImportError:
        def _no(*a, **k):
            raise OSError("registro di Windows non disponibile nel browser")
        _modulo("winreg", HKEY_CURRENT_USER=1, HKEY_LOCAL_MACHINE=2, HKEY_CLASSES_ROOT=0,
                KEY_READ=1, KEY_WRITE=2, KEY_ALL_ACCESS=3, KEY_SET_VALUE=2, REG_SZ=1, REG_DWORD=4,
                REG_EXPAND_SZ=2, OpenKey=_no, OpenKeyEx=_no, CreateKey=_no, CreateKeyEx=_no,
                QueryValueEx=_no, SetValueEx=_no, DeleteValue=_no, DeleteKey=_no, CloseKey=lambda *a: None,
                EnumKey=_no, EnumValue=_no)
    for nome in ("rapidocr", "pypdfium2"):
        try:
            __import__(nome)
        except ImportError:
            class _Assente:
                def __init__(self, *a, **k):
                    raise RuntimeError(f"{nome} non ancora disponibile nella versione web")
                def __getattr__(self, n):
                    raise RuntimeError(f"{nome} non ancora disponibile nella versione web")
            m = _modulo(nome, RapidOCR=_Assente, PdfDocument=_Assente)
            m.__getattr__ = lambda n, _nome=nome: (_ for _ in ()).throw(RuntimeError(f"{_nome} non ancora disponibile nella versione web"))
    try:
        import cv2  # noqa
    except ImportError:
        _modulo("cv2")
    try:
        from ctypes import wintypes  # noqa
    except Exception:
        import ctypes
        w = _modulo("ctypes.wintypes", DWORD=ctypes.c_uint32, BOOL=ctypes.c_int, HANDLE=ctypes.c_void_p,
                    LPCWSTR=ctypes.c_wchar_p, LPWSTR=ctypes.c_wchar_p, UINT=ctypes.c_uint, WORD=ctypes.c_ushort,
                    BYTE=ctypes.c_ubyte, LPVOID=ctypes.c_void_p, HWND=ctypes.c_void_p, LONG=ctypes.c_long,
                    ULONG=ctypes.c_ulong, HKEY=ctypes.c_void_p, LPCSTR=ctypes.c_char_p, HMODULE=ctypes.c_void_p)
        ctypes.wintypes = w
    if sys.platform == "emscripten":
        # Nel browser non esistono processi paralleli: le attività in sottofondo
        # del motore vengono eseguite subito, nello stesso flusso.
        import threading
        def _start(self):
            try:
                if self._target:
                    self._target(*self._args, **self._kwargs)
            except Exception as exc:  # come un thread: l'errore non ferma il chiamante
                print("attività di sottofondo:", exc)
        threading.Thread.start = _start
        threading.Thread.join = lambda self, *a, **k: None
        threading.Thread.is_alive = lambda self: False
        try:
            import pyodide_http
            pyodide_http.patch_all()
        except Exception as exc:
            print("rete del motore non attivata:", exc)

_server = None

def motore():
    global _server
    if _server is None:
        import server as _s
        _server = _s
    return _server

# Accesso Google "Clinica Digitale - Webapp" (tipo Applicazione web, progetto
# clinica-digitale-calendar). Quello dell'exe e' di tipo Desktop e accetta solo
# il ritorno su 127.0.0.1, che nel browser non esiste.
_GOOGLE_WEB_ID = "958066311310-b3oeqar4hshckgq1dpl766aq35vc3biq.apps.googleusercontent.com"
_GOOGLE_WEB_SECRET_XOR_B64 = "KiIuPj01QCYmLiM5ICdaDjUYKy4qKRUDOAMCXCQ8XwEFFVk="

def adatta_google(indirizzo_ritorno):
    """Fa usare al motore l'accesso Google per il web e la pagina di ritorno della webapp."""
    import base64
    s = motore()
    desktop_id = s.GOOGLE_OAUTH_DEFAULT_CLIENT_ID
    desktop_secret = s._google_official_client_secret()
    web_secret = "".join(chr(b ^ 0x6D) for b in base64.b64decode(_GOOGLE_WEB_SECRET_XOR_B64))
    s.GOOGLE_OAUTH_REDIRECT_URI = indirizzo_ritorno
    s.GOOGLE_OAUTH_DEFAULT_CLIENT_ID = _GOOGLE_WEB_ID
    s._google_official_client_secret = lambda: web_secret
    carica_originale = s._google_calendar_load_config
    def carica():
        _migra_google()
        cfg = carica_originale()
        # una configurazione arrivata dall'exe punta all'accesso Desktop: nel browser va quello web
        if str(cfg.get("clientId") or "") in ("", desktop_id):
            cfg["clientId"] = _GOOGLE_WEB_ID
            if str(cfg.get("clientSecret") or "") == desktop_secret:
                cfg["clientSecret"] = ""
        return cfg
    s._google_calendar_load_config = carica
    # la pagina di Google la apre il ponte nel browser (bridge.js)
    s._open_external_system_browser = lambda url: True

# ---------------------------------------------------------------------------
# Cifratura dei segreti locali.
# Nell'exe Windows protegge chiavi e credenziali con DPAPI. Nel browser la
# chiave del dispositivo e' una chiave AES casuale, conservata dal worker
# cifrata con una chiave non esportabile del browser (WebCrypto): qui arriva
# solo in memoria, mai scritta in chiaro.
_CHIAVE = None
_PREFISSO = b"web1:"
_AAD = b"Dossier Sanitario Locale"

def imposta_chiave(chiave):
    global _CHIAVE
    chiave = bytes(chiave)
    if len(chiave) != 32:
        raise ValueError("chiave del dispositivo non valida")
    _CHIAVE = chiave

def _proteggi(dati):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    if _CHIAVE is None:
        raise RuntimeError("Chiave del dispositivo non disponibile")
    nonce = os.urandom(12)
    return _PREFISSO + nonce + AESGCM(_CHIAVE).encrypt(nonce, bytes(dati), _AAD)

def _sproteggi(dati):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    dati = bytes(dati)
    if dati.startswith(_PREFISSO):
        if _CHIAVE is None:
            raise RuntimeError("Chiave del dispositivo non disponibile")
        return AESGCM(_CHIAVE).decrypt(dati[5:17], dati[17:], _AAD)
    # dato salvato prima della cifratura: viene riscritto cifrato al primo salvataggio
    return dati

def adatta_cifratura():
    s = motore()
    s._dpapi_protect = _proteggi
    s._dpapi_unprotect = _sproteggi

def _migra_google():
    """Riscrive cifrata la configurazione Google salvata in chiaro prima della cifratura."""
    s = motore()
    try:
        f = s._google_calendar_user_file(s.GOOGLE_CALENDAR_SECRET_FILE)
        if f.exists() and not f.read_bytes().startswith(_PREFISSO):
            import json
            cfg = json.loads(f.read_bytes().decode("utf-8"))
            if isinstance(cfg, dict):
                s._google_calendar_save_config(cfg)
    except Exception as exc:
        print("configurazione Google non migrata:", exc)

# ---------------------------------------------------------------------------
# Avvisi del browser.
# L'exe affida gli avvisi alle Operazioni pianificate di Windows. Qui il motore
# continua a preparare e salvare gli avvisi con il suo codice; il ponte li
# legge e la pagina li mostra come notifiche del browser.
class _OsWindows:
    """Fa credere al motore di essere su Windows solo dentro le funzioni degli avvisi."""
    name = "nt"
    def __init__(self, vero):
        self._vero = vero
    def __getattr__(self, nome):
        return getattr(self._vero, nome)

_AZIONE_FARMACI = None
_DIALOGO_FARMACI = None

def adatta_avvisi(dati_dir):
    s = motore()
    segno = os.path.join(dati_dir, "avvisi_browser.attivo")
    with open(segno, "w") as fh:
        fh.write("1")
    from pathlib import Path
    s.REMINDER_EXE = Path(segno)
    s._calendar_run_powershell = lambda script, timeout=30: None
    for nome in ("_calendar_schedule_event", "_calendar_cancel_event", "_calendar_unregister_task"):
        originale = getattr(s, nome)
        def avvolta(*a, _o=originale, **k):
            vero = s.os
            s.os = _OsWindows(vero)
            try:
                return _o(*a, **k)
            finally:
                s.os = vero
        setattr(s, nome, avvolta)
    prossimo = s._medication_schedule_next_task
    def programma(data=None):
        r = prossimo(data)
        if r.get("nextAt"):
            r = {**r, "scheduled": True, "taskName": "avvisi del browser"}
        return r
    s._medication_schedule_next_task = programma
    def dialogo(titolo, testo, multi=False):
        global _DIALOGO_FARMACI
        if _AZIONE_FARMACI:
            return _AZIONE_FARMACI
        _DIALOGO_FARMACI = {"titolo": titolo, "testo": testo, "multi": bool(multi)}
        raise RuntimeError("dialogo farmaci: mostrato dal browser")
    s._medication_task_dialog = dialogo

def _file_mostrati():
    s = motore()
    return s.CALENDAR_DIR / "avvisi_browser_mostrati.json"

def promemoria_scaduti():
    """Gruppi di promemoria arrivati all'ora di avviso e non ancora mostrati."""
    import datetime, json
    s = motore()
    f = _file_mostrati()
    try:
        mostrati = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
    except Exception:
        mostrati = {}
    adesso = datetime.datetime.now()
    uscita = []
    with s.REMINDER_LOCK:
        gruppi = s._calendar_groups()
        for nome, g in gruppi.items():
            if not isinstance(g, dict):
                continue
            quando = str(g.get("alertAt") or "")
            try:
                ora = datetime.datetime.fromisoformat(quando)
            except Exception:
                continue
            if ora > adesso or mostrati.get(nome) == quando:
                continue
            membri = [m for m in (g.get("members") or {}).values() if isinstance(m, dict)]
            if membri:
                uscita.append({"id": nome, "alertAt": quando, "messaggi": [str(m.get("message") or "") for m in membri]})
            mostrati[nome] = quando
        validi = {k: v for k, v in mostrati.items() if k in gruppi}
        if uscita or validi != mostrati:
            s.CALENDAR_DIR.mkdir(parents=True, exist_ok=True)
            f.write_text(json.dumps(validi), encoding="utf-8")
    return uscita

def farmaci_da_mostrare():
    """Esegue il controllo farmaci dell'exe e restituisce il testo del suo dialogo, se c'e'."""
    global _DIALOGO_FARMACI
    s = motore()
    _DIALOGO_FARMACI = None
    s._medication_agent_main()
    return _DIALOGO_FARMACI

def farmaci_azione(azione):
    """Applica 'Acquistato' o 'Rimanda di 12 ore' con lo stesso codice del promemoria dell'exe."""
    global _AZIONE_FARMACI
    if azione not in ("purchased", "snooze"):
        raise ValueError("azione non valida")
    s = motore()
    _AZIONE_FARMACI = azione
    try:
        return s._medication_agent_main()
    finally:
        _AZIONE_FARMACI = None

# ---------------------------------------------------------------------------
# Esportazioni (versione per medico, visita su memoria esterna): nell'exe si sceglie
# una cartella con la finestra di Windows e il motore ci scrive i file. Nella webapp
# il motore scrive gli stessi file in una cartella temporanea del browser e alla fine
# li consegna come un unico file ZIP da scaricare.
_ESPORTAZIONI = {}

def adatta_esportazioni():
    import io, secrets, shutil, zipfile
    from pathlib import Path
    s = motore()
    radice = Path("/tmp/esportazioni")

    def scegli_cartella():
        d = radice / secrets.token_hex(6)
        d.mkdir(parents=True, exist_ok=True)
        return str(d)

    s._doctor_select_parent_folder = scegli_cartella
    s._visit_external_destination = lambda parent: (True, "")

    def completa(self):
        try:
            data = self.read_json(max_size=32 * 1024)
            export_id = str(data.get("exportId") or "")
            with s.DOCTOR_EXPORT_LOCK:
                row = s.DOCTOR_EXPORT_SESSIONS.pop(export_id, None)
            root = Path(str((row or {}).get("root") or "/nessuna"))
            info = {"ok": True, "folderPath": str(root), "files": int((row or {}).get("files", 0))}
            if row and root.is_dir():
                buf = io.BytesIO()
                with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                    for f in sorted(root.rglob("*")):
                        if f.is_file():
                            z.write(f, arcname=str(Path(root.name) / f.relative_to(root)))
                nome = root.name + ".zip"
                did = secrets.token_hex(8)
                _ESPORTAZIONI[did] = (nome, buf.getvalue())
                shutil.rmtree(root.parent, ignore_errors=True)
                info.update(folderPath=nome, download="/ponte/esportazione/" + did, downloadName=nome)
            self.send_json(200, info)
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})

    s.ApiHandler.handle_doctor_export_complete = completa

    # L'Archivio DICOM nella webapp usa una cartella del computer scelta nel browser:
    # finche' non e' collegato, la scelta della cartella dal motore non e' disponibile.
    def archivio_dicom(self):
        self.send_json(409, {"ok": False, "error": "La cartella dell'Archivio DICOM si sceglie dal browser: funzione in preparazione nella versione web.", "code": "web_media_archive"})

    s.ApiHandler.handle_media_archive_select = archivio_dicom

def adatta_cloud():
    """MEGA (e in seguito Google Drive) collegati dal browser al posto di rclone.exe."""
    import cloud_web
    cloud_web.adatta(motore(), _proteggi, _sproteggi)

def _rispondi(stato, dati):
    import json
    corpo = json.dumps(dati, ensure_ascii=False).encode("utf-8")
    return stato, [("Content-Type", "application/json; charset=utf-8")], corpo

def _richiesta_ponte(metodo, percorso, corpo):
    import json
    try:
        if percorso == "/ponte/avvisi" and metodo == "GET":
            return _rispondi(200, {"ok": True, "promemoria": promemoria_scaduti(), "farmaci": farmaci_da_mostrare()})
        if percorso == "/ponte/farmaci/azione" and metodo == "POST":
            dati = json.loads(corpo.decode("utf-8") or "{}")
            return _rispondi(200, {"ok": True, "esito": farmaci_azione(str(dati.get("azione") or ""))})
        if percorso.startswith("/ponte/esportazione/") and metodo == "GET":
            voce = _ESPORTAZIONI.pop(percorso.rsplit("/", 1)[-1], None)
            if not voce:
                return _rispondi(404, {"ok": False, "error": "file da scaricare non piu' disponibile"})
            nome, dati = voce
            # il nome del file lo mette la pagina (puo' contenere lettere accentate)
            return 200, [("Content-Type", "application/zip")], dati
        return _rispondi(404, {"ok": False, "error": "percorso del ponte sconosciuto"})
    except Exception as exc:
        return _rispondi(500, {"ok": False, "error": str(exc)})

class _Sock:
    def __init__(self, dati):
        self._in = io.BytesIO(dati)
        self.out = bytearray()
    def makefile(self, mode="r", *a, **k):
        if "r" in mode:
            return self._in
        s = self
        class _W(io.RawIOBase):
            def writable(self): return True
            def write(self, b):
                s.out += bytes(b); return len(b)
        return io.BufferedWriter(_W())
    def sendall(self, b): self.out += bytes(b)
    def send(self, b): self.out += bytes(b); return len(b)
    def settimeout(self, *a): pass
    def setsockopt(self, *a): pass
    def getpeername(self): return ("127.0.0.1", 0)
    def fileno(self): return -1
    def close(self): pass
    def shutdown(self, *a): pass

class _Server:
    server_address = ("127.0.0.1", 8896)
    def shutdown(self): pass

def _dechunk(b):
    out = bytearray(); i = 0
    while True:
        j = b.index(b"\r\n", i); n = int(b[i:j].split(b";")[0], 16)
        if n == 0: break
        out += b[j + 2:j + 2 + n]; i = j + 2 + n + 2
    return bytes(out)

def richiesta(metodo, percorso, intestazioni, corpo=b""):
    """Esegue una richiesta sull'ApiHandler originale. Ritorna (stato, intestazioni, corpo)."""
    corpo = bytes(corpo or b"")
    if percorso.startswith("/ponte/"):
        return _richiesta_ponte(metodo, percorso.split("?", 1)[0], corpo)
    s = motore()
    h = {k.lower(): v for k, v in dict(intestazioni or {}).items()}
    h["host"] = "127.0.0.1:8896"
    h["origin"] = "http://127.0.0.1:8895"
    h["content-length"] = str(len(corpo))
    h["connection"] = "close"
    testa = f"{metodo} {percorso} HTTP/1.1\r\n" + "".join(f"{k}: {v}\r\n" for k, v in h.items()) + "\r\n"
    sock = _Sock(testa.encode("latin-1") + corpo)
    s.ApiHandler(sock, ("127.0.0.1", 0), _Server())
    raw = bytes(sock.out)
    if not raw:
        return 502, [], b"risposta vuota dal motore"
    fine = raw.index(b"\r\n\r\n")
    righe = raw[:fine].decode("latin-1").split("\r\n")
    stato = int(righe[0].split(" ")[1])
    hh = [tuple(x.split(": ", 1)) for x in righe[1:] if ": " in x]
    dati = raw[fine + 4:]
    if any(k.lower() == "transfer-encoding" and "chunked" in v.lower() for k, v in hh):
        dati = _dechunk(dati)
    return stato, hh, dati
