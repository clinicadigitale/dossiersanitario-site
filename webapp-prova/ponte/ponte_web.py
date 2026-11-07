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
    s = motore()
    corpo = bytes(corpo or b"")
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
