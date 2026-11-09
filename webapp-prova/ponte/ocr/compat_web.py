"""Allineamenti della webapp all'exe per la lettura di foto e scansioni.

1. cv2.warpPerspective: Pyodide ha OpenCV 4.10, l'exe OpenCV 5.0, che ritaglia le righe
   di testo con un algoritmo diverso. Qui c'e' lo stesso calcolo di OpenCV 5.0.
2. Foto JPEG: Pillow di Pyodide (10.2) decodifica alcune JPEG in modo leggermente diverso
   da Pillow 12.3 dell'exe. Il decodificatore del browser (libjpeg-turbo) da' invece gli
   stessi pixel, quindi le JPEG vengono decodificate dal browser.
"""
import io

from warp5 import warp_perspective_cubic_replicate

_applicato = False


def _patch_cv2():
    import cv2
    import numpy as np
    orig = cv2.warpPerspective

    def warpPerspective(src, M, dsize, dst=None, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=None):
        if (flags == cv2.INTER_CUBIC and borderMode == cv2.BORDER_REPLICATE and dst is None
                and isinstance(src, np.ndarray) and src.dtype == np.uint8 and src.ndim in (2, 3)):
            return warp_perspective_cubic_replicate(src, M, dsize)
        kw = {"flags": flags, "borderMode": borderMode}
        if borderValue is not None:
            kw["borderValue"] = borderValue
        return orig(src, M, dsize, **kw) if dst is None else orig(src, M, dsize, dst, **kw)

    cv2.warpPerspective = warpPerspective


def _patch_jpeg():
    from PIL import Image
    orig_open = Image.open

    def open_(fp, mode="r", formats=None):
        im = orig_open(fp, mode, formats) if formats is not None else orig_open(fp, mode)
        try:
            if im.format != "JPEG" or im.mode not in ("RGB", "L"):
                return im
            if hasattr(fp, "read"):
                pos = fp.tell() if hasattr(fp, "tell") else None
                fp.seek(0); dati = fp.read()
                if pos is not None:
                    fp.seek(pos)
            else:
                with open(fp, "rb") as fh:
                    dati = fh.read()
            import js
            from pyodide.ffi import run_sync, to_js
            r = run_sync(js.decodificaJpeg(to_js(memoryview(dati))))
            w, h = int(r.w), int(r.h)
            if (w, h) != im.size:
                return im
            nuova = Image.frombytes("RGBA", (w, h), r.data.to_bytes()).convert("RGB")
            if im.mode == "L":
                nuova = nuova.convert("L")
            nuova.info = dict(im.info)
            nuova.format = "JPEG"
            return nuova
        except Exception as exc:  # in caso di problemi resta la decodifica di Pillow
            print("decodifica JPEG del browser non usata:", exc)
            return im

    Image.open = open_


def applica(jpeg=True):
    global _applicato
    if _applicato:
        return
    _patch_cv2()
    if jpeg:
        _patch_jpeg()
    _applicato = True
