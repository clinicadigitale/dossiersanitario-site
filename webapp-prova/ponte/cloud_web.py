"""Cloud del Dossier nel browser.

Nell'exe il motore parla con MEGA e Google Drive tramite rclone.exe, un programma
Windows. Nel browser rclone non puo' girare: qui i comandi che il motore invia a
rclone vengono eseguiti con un collegamento diretto dal browser (js: cloudOp nel
worker del motore). Il codice di sincronizzazione del motore e dell'interfaccia
resta quello originale: cambia solo chi esegue il singolo comando.

Le connessioni sono salvate come le salva rclone (password "offuscata" con lo
stesso metodo di rclone), cosi' il pacchetto familiare creato dall'exe resta
compatibile; il file e' cifrato con la chiave del dispositivo.
"""
import base64, json, os, re

_s = None
_PROTEGGI = None
_SPROTEGGI = None

# Chiave pubblica che rclone usa per "offuscare" le password (non e' una cifratura
# di sicurezza: la protezione vera e' la cifratura del file e del pacchetto familiare).
_CHIAVE_OFFUSCA = bytes([0x9c, 0x93, 0x5b, 0x48, 0x73, 0x0a, 0x55, 0x4d, 0x6b, 0xfd, 0x7c, 0x63, 0xc8, 0x86, 0xa9, 0x2b,
                         0xd3, 0x90, 0x19, 0x8e, 0xb8, 0x12, 0x8a, 0xfb, 0xf4, 0xde, 0x16, 0x2b, 0x8b, 0x95, 0xf6, 0x38])


def offusca(testo):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    iv = os.urandom(16)
    enc = Cipher(algorithms.AES(_CHIAVE_OFFUSCA), modes.CTR(iv)).encryptor()
    dati = iv + enc.update(str(testo).encode("utf-8")) + enc.finalize()
    return base64.urlsafe_b64encode(dati).decode("ascii").rstrip("=")


def rivela(testo):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    t = str(testo or "")
    dati = base64.urlsafe_b64decode(t + "=" * (-len(t) % 4))
    if len(dati) < 16:
        raise ValueError("password della connessione cloud non valida")
    dec = Cipher(algorithms.AES(_CHIAVE_OFFUSCA), modes.CTR(dati[:16])).decryptor()
    return (dec.update(dati[16:]) + dec.finalize()).decode("utf-8")


# ---------------------------------------------------------------------------
# Configurazione delle connessioni (equivalente di rclone.conf)
def _leggi_config():
    p = _s.RCLONE_CONFIG
    if not p.exists():
        return {}
    try:
        dati = _SPROTEGGI(p.read_bytes())
        valore = json.loads(dati.decode("utf-8") or "{}")
        return valore if isinstance(valore, dict) else {}
    except Exception as exc:
        raise RuntimeError("Configurazione cloud non leggibile") from exc


def _scrivi_config(cfg):
    p = _s.RCLONE_CONFIG
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(_PROTEGGI(json.dumps(cfg, ensure_ascii=False).encode("utf-8")))


class _Errore(Exception):
    pass


def _errore(codice, testo, args):
    return _s.RcloneCommandError(codice, testo, args)


def _remoto(spec):
    """'nome:percorso/file' -> (nome, 'percorso/file'). Un percorso che inizia con / e' del disco locale."""
    t = str(spec or "")
    if t.startswith("/") or ":" not in t:
        return None, t
    nome, percorso = t.split(":", 1)
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,120}", nome):
        return None, t
    return nome, percorso.replace("\\", "/").strip("/")


def _parametri(nome, args):
    cfg = _leggi_config()
    conn = cfg.get(nome)
    if not isinstance(conn, dict):
        raise _errore(1, f"Connessione cloud non trovata: {nome}", args)
    tipo = str(conn.get("type") or "")
    if tipo == "mega":
        return {"type": "mega", "name": nome, "user": str(conn.get("user") or ""), "pass": rivela(conn.get("pass") or "")}
    if tipo == "drive":
        return {"type": "drive", "token": str(conn.get("token") or ""), "client_id": str(conn.get("client_id") or ""), "client_secret": str(conn.get("client_secret") or "")}
    raise _errore(1, "Servizio cloud non disponibile nel browser", args)


def _js(op, conn, dati=None, **valori):
    """Esegue un'operazione cloud nel browser e attende il risultato."""
    import js
    from pyodide.ffi import run_sync, to_js
    corpo = to_js(bytes(dati)) if dati is not None else None
    r = run_sync(js.cloudOp(op, json.dumps(conn), json.dumps(valori), corpo))
    esito = r.to_py() if hasattr(r, "to_py") else r
    if not isinstance(esito, dict):
        raise RuntimeError("Risposta non valida dal collegamento cloud")
    return esito


def _esegui(op, nome, args, dati=None, **valori):
    esito = _js(op, _parametri(nome, args), dati, **valori)
    if esito.get("ok"):
        return esito
    codice = str(esito.get("code") or "")
    testo = str(esito.get("error") or "Operazione cloud non riuscita")
    if codice == "notfound_dir":
        raise _errore(3, "directory not found", args)
    if codice == "notfound":
        raise _errore(4, "object not found", args)
    if codice == "auth":
        raise _errore(1, "Authentication failed: " + testo, args)
    raise _errore(1, testo, args)


def _flag(args, nome):
    return nome in args


def _lsd_riga(item):
    mt = str(item.get("ModTime") or "2000-01-01T00:00:00Z")
    data, ora = mt[:10], mt[11:19] or "00:00:00"
    return f"{-1:>12} {data} {ora} {-1:>12} {item.get('Name')}"


def _comando(args):
    args = [str(a) for a in args]
    if not args:
        raise _errore(1, "comando cloud vuoto", args)
    cmd = args[0]
    pos = [a for a in args[1:] if not a.startswith("--")]

    if cmd == "version":
        return "Collegamento cloud dal browser\n"
    if cmd == "listremotes":
        return "".join(f"{n}:\n" for n in _leggi_config())
    if cmd == "config":
        sotto = args[1] if len(args) > 1 else ""
        if sotto == "dump":
            return json.dumps(_leggi_config(), ensure_ascii=False)
        if sotto == "delete":
            cfg = _leggi_config(); cfg.pop(args[2], None); _scrivi_config(cfg); return ""
        if sotto in ("create", "update"):
            return _config_crea(args)
        raise _errore(1, f"comando di configurazione non disponibile: {sotto}", args)

    if cmd == "about":
        nome, _ = _remoto(pos[0])
        esito = _esegui("about", nome, args)
        return json.dumps({k: esito.get(k) for k in ("total", "used", "free") if esito.get(k) is not None})

    if cmd in ("lsd", "lsf", "lsjson"):
        nome, percorso = _remoto(pos[0])
        if _flag(args, "--stat"):
            esito = _esegui("stat", nome, args, path=percorso)
            return json.dumps(esito.get("item") or {})
        solo_file = _flag(args, "--files-only")
        solo_cartelle = _flag(args, "--dirs-only") or cmd == "lsd"
        ricorsivo = _flag(args, "--recursive") or _flag(args, "-R")
        esito = _esegui("list", nome, args, path=percorso, recursive=ricorsivo, filesOnly=solo_file, dirsOnly=solo_cartelle)
        items = esito.get("items") or []
        if cmd == "lsjson":
            return json.dumps(items, ensure_ascii=False)
        if cmd == "lsd":
            return "".join(_lsd_riga(x) + "\n" for x in items)
        return "".join((x["Path"] + ("/" if x.get("IsDir") else "")) + "\n" for x in items)

    if cmd == "cat":
        nome, percorso = _remoto(pos[0])
        return _esegui("read", nome, args, path=percorso)["data"]

    if cmd == "mkdir":
        nome, percorso = _remoto(pos[0])
        _esegui("mkdir", nome, args, path=percorso); return ""

    if cmd in ("deletefile", "delete"):
        nome, percorso = _remoto(pos[0])
        _esegui("delete", nome, args, path=percorso); return ""

    if cmd in ("copyto", "moveto"):
        src, dst = pos[0], pos[1]
        ns, ps = _remoto(src)
        nd, pd = _remoto(dst)
        if ns and nd:
            if ns != nd:
                raise _errore(1, "copia tra connessioni diverse non disponibile", args)
            _esegui("move" if cmd == "moveto" else "copy", ns, args, path=ps, to=pd); return ""
        if nd:  # dal disco locale al cloud
            with open(src, "rb") as fh:
                dati = fh.read()
            _esegui("write", nd, args, dati=dati, path=pd)
            if cmd == "moveto":
                os.remove(src)
            return ""
        if ns:  # dal cloud al disco locale
            dati = _esegui("read", ns, args, path=ps)["data"]
            os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
            with open(dst, "wb") as fh:
                fh.write(dati)
            if cmd == "moveto":
                _esegui("delete", ns, args, path=ps)
            return ""
        raise _errore(1, "percorsi di copia non validi", args)

    raise _errore(1, f"comando cloud non disponibile nel browser: {cmd}", args)


def _config_crea(args):
    # config create NOME [tipo] chiave valore ... --non-interactive --obscure|--no-obscure [--all] [--continue ...]
    nome = args[2]
    resto = [a for a in args[3:]]
    offusca_valori = "--obscure" in resto
    resto = [a for a in resto if not a.startswith("--")]
    cfg = _leggi_config()
    conn = dict(cfg.get(nome) or {})
    if args[1] == "create" and resto and resto[0] in ("mega", "drive", "iclouddrive"):
        conn["type"] = resto.pop(0)
    coppie = dict(zip(resto[0::2], resto[1::2]))
    for k, v in coppie.items():
        if k in ("pass", "password") and offusca_valori:
            v = offusca(v)
        conn["pass" if k == "password" else k] = v
    tipo = conn.get("type")
    if tipo == "drive":
        raise _errore(1, "Google Drive nel browser è in preparazione: per ora collega MEGA.", args)
    if tipo == "iclouddrive":
        raise _errore(1, "Apple iCloud non è disponibile nella versione web.", args)
    if tipo != "mega":
        raise _errore(1, "Servizio cloud non supportato", args)
    if not conn.get("user") or not conn.get("pass"):
        raise _errore(1, "Inserisci e-mail e password MEGA", args)
    cfg[nome] = conn
    _scrivi_config(cfg)
    return "{}"


def run_rclone(args, timeout=300):
    try:
        uscita = _comando(list(args))
    except _s.RcloneCommandError:
        raise
    except Exception as exc:
        raise _errore(1, str(exc), list(args)) from exc
    if isinstance(uscita, (bytes, bytearray, memoryview)):
        uscita = bytes(uscita).decode("utf-8", "replace")
    return {"stdout": uscita or "", "stderr": "", "returncode": 0}


def run_rclone_bytes(args, timeout=900):
    args = [str(a) for a in args]
    if args and args[0] == "cat":
        nome, percorso = _remoto([a for a in args[1:] if not a.startswith("--")][0])
        return bytes(_esegui("read", nome, args, path=percorso)["data"])
    uscita = run_rclone(args, timeout)["stdout"]
    return uscita.encode("utf-8")


def run_rclone_copyto_progress(src, dst, total_bytes, progress_callback, timeout=1800):
    run_rclone(["copyto", src, dst], timeout)
    progress_callback(total_bytes, total_bytes, 100)


def rc_call(command, payload=None, timeout=120, retry=True):
    p = dict(payload or {})
    if command == "core/version":
        return {"version": "browser"}
    if command == "operations/mkdir":
        nome = str(p.get("fs") or "").rstrip(":")
        _esegui("mkdir", nome, [command], path=str(p.get("remote") or "").strip("/"))
        return {}
    if command == "operations/copyfile":
        src = f"{p.get('srcFs')}{p.get('srcRemote')}" if str(p.get("srcFs", "")).endswith(":") else os.path.join(str(p.get("srcFs")), str(p.get("srcRemote")))
        dst = f"{p.get('dstFs')}{p.get('dstRemote')}" if str(p.get("dstFs", "")).endswith(":") else os.path.join(str(p.get("dstFs")), str(p.get("dstRemote")))
        run_rclone(["copyto", src, dst], timeout)
        return {"jobid": 0}
    raise RuntimeError(f"Operazione cloud non disponibile nel browser: {command}")


def adatta(server, proteggi, sproteggi):
    """Collega il motore originale al cloud del browser al posto di rclone.exe."""
    global _s, _PROTEGGI, _SPROTEGGI
    _s, _PROTEGGI, _SPROTEGGI = server, proteggi, sproteggi
    s = server
    # il motore controlla che rclone.exe esista: nel browser al suo posto c'e' questo segnaposto
    s.CLOUD_DIR.mkdir(parents=True, exist_ok=True)
    if not s.RCLONE_EXE.exists():
        s.RCLONE_EXE.write_text("collegamento cloud del browser\n", encoding="utf-8")
    s.run_rclone = run_rclone
    s.run_rclone_bytes = run_rclone_bytes
    s.run_rclone_copyto_progress = run_rclone_copyto_progress
    s.rc_call = rc_call
    s._rc_raw_call = lambda command, payload=None, timeout=60: rc_call(command, payload, timeout)
    s._rclone_rc_alive = lambda: True
    s.ensure_rclone_rcd = lambda: None
    s.stop_rclone_rcd = lambda: None
    s.install_rclone = lambda: {"installed": True, "version": "Collegamento cloud dal browser", "source": "browser"}
    # nessuna pausa artificiale tra un comando e l'altro: non c'e' un processo esterno da rispettare
    s.RCLONE_MIN_INTERVAL = 0
