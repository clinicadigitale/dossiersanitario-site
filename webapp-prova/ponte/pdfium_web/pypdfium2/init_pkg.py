"""pypdfium2 per la webapp del Dossier.

Ricalca, per le sole funzioni usate dal motore del Dossier, il comportamento di
pypdfium2 5.12.1 dell'exe, chiamando la stessa versione di PDFium
(pdfium-binaries chromium/7947) compilata per WebAssembly (ponte/pdfium_ponte.js).
"""
import math
from codecs import decode
from pathlib import Path

__all__ = ("PdfDocument", "PdfPage", "PdfTextPage", "PdfBitmap", "PdfiumError")

PDFIUM_VERSION = "152.0.7947"
FPDF_ANNOT = 0x01
FPDF_REVERSE_BYTE_ORDER = 0x10
FPDFBitmap_BGR = 2

ErrorToStr = {
    0: "Success",
    1: "Unknown error",
    2: "File access error",
    3: "Data format error",
    4: "Incorrect password error",
    5: "Unsupported security scheme error",
    6: "Page not found or content error",
}

_P = None


def _ponte():
    global _P
    if _P is None:
        import js
        _P = js.pdfiumPonte
    return _P


def _js_bytes(data):
    from pyodide.ffi import to_js
    return to_js(memoryview(data))


class PdfiumError(RuntimeError):
    def __init__(self, msg, err_code=None):
        super().__init__(msg)
        self.err_code = err_code


class PdfDocument:
    def __init__(self, input, password=None, autoclose=False):
        if isinstance(input, str):
            input = Path(input)
        if isinstance(input, Path):
            input = input.expanduser().resolve()
            if not input.is_file():
                raise FileNotFoundError(input)
            data = input.read_bytes()
        elif isinstance(input, (bytes, bytearray, memoryview)):
            data = bytes(input)
        else:
            raise TypeError(f"Invalid input type '{type(input).__name__}'")
        self._input = input
        self.raw = 0
        p = _ponte()
        raw = p.apri(_js_bytes(data), None if password is None else str(password))
        if not raw or p.numeroPagine(raw) < 1:
            err_code = int(p.ultimoErrore())
            if raw:
                p.chiudiDocumento(raw)
            raise PdfiumError(f"Failed to load document (PDFium: {ErrorToStr.get(err_code, err_code)}).", err_code=err_code)
        self.raw = raw
        self._kids = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def __len__(self):
        return int(_ponte().numeroPagine(self.raw))

    def __iter__(self):
        for i in range(len(self)):
            yield self[i]

    def __getitem__(self, i):
        return self.get_page(i)

    def get_page(self, index):
        raw_page = _ponte().caricaPagina(self.raw, int(index))
        if not raw_page:
            raise PdfiumError("Failed to load page.")
        page = PdfPage(raw_page, self)
        self._kids.append(page)
        return page

    def close(self):
        if self.raw:
            for kid in self._kids:
                kid.close()
            self._kids = []
            _ponte().chiudiDocumento(self.raw)
            self.raw = 0

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass


class PdfPage:
    def __init__(self, raw, pdf):
        self.raw = raw
        self.pdf = pdf
        self._kids = []

    def get_width(self):
        return float(_ponte().larghezza(self.raw))

    def get_height(self):
        return float(_ponte().altezza(self.raw))

    def get_size(self):
        return (self.get_width(), self.get_height())

    def get_textpage(self):
        raw_textpage = _ponte().caricaTesto(self.raw)
        if not raw_textpage:
            raise PdfiumError("Failed to load text page.")
        textpage = PdfTextPage(raw_textpage, self)
        self._kids.append(textpage)
        return textpage

    def render(self, scale=1, rotation=0, crop=(0, 0, 0, 0), may_draw_forms=True, rev_byteorder=False, **kwargs):
        # Solo le impostazioni usate dal motore del Dossier: BGR (o RGB con rev_byteorder),
        # fondo bianco, annotazioni.
        if rotation != 0 or tuple(crop) != (0, 0, 0, 0) or kwargs:
            raise NotImplementedError("Opzioni di disegno non disponibili nella versione web")
        width = math.ceil(self.get_width() * scale)
        height = math.ceil(self.get_height() * scale)
        if width < 1 or height < 1:
            raise ValueError("Crop exceeds page dimensions")
        flags = FPDF_ANNOT | (FPDF_REVERSE_BYTE_ORDER if rev_byteorder else 0)
        buf = _ponte().disegna(self.raw, width, height, flags)
        if buf is None:
            raise PdfiumError("Failed to create bitmap.")
        return PdfBitmap(bytes(buf.to_py()), width, height, width * 3, bool(rev_byteorder))

    def close(self):
        if self.raw:
            for kid in self._kids:
                kid.close()
            self._kids = []
            _ponte().chiudiPagina(self.raw)
            self.raw = 0


class PdfTextPage:
    def __init__(self, raw, page):
        self.raw = raw
        self.page = page

    def count_chars(self):
        n_chars = int(_ponte().contaCaratteri(self.raw))
        if n_chars == -1:
            raise PdfiumError("Failed to get character count.")
        return n_chars

    def _get_active_text_range(self, c_start, c_end, l_passive=0, r_passive=0):
        if c_start > c_end:
            return 0
        t_start = int(_ponte().indiceTesto(self.raw, c_start))
        if t_start == -1:
            return self._get_active_text_range(c_start + 1, c_end, l_passive + 1, r_passive)
        t_end = int(_ponte().indiceTesto(self.raw, c_end))
        if t_end == -1:
            return self._get_active_text_range(c_start, c_end - 1, l_passive, r_passive + 1)
        return t_start, t_end, l_passive, r_passive

    def get_text_range(self, index=0, count=-1, errors="ignore"):
        if count == -1:
            count = self.count_chars() - index
        active_range = self._get_active_text_range(index, index + count - 1)
        if active_range == 0:
            return ""
        t_start, t_end, l_passive, r_passive = active_range
        index += l_passive
        count -= l_passive + r_passive
        in_count = t_end + 2 - t_start
        out_count, units = _ponte().testo(self.raw, index, count, in_count)
        out_count = int(out_count)
        assert in_count >= out_count, f"Buffer too small: {in_count} vs {out_count}"
        import array
        buffer = array.array("H", units.to_py())
        # come pypdfium2: memoryview(buffer)[:out_count-1]
        return decode(memoryview(buffer)[:out_count - 1], "utf-16-le", errors=errors)

    def get_charbox(self, index, loose=False):
        if loose:
            raise NotImplementedError("Riquadro esteso non disponibile nella versione web")
        ok, l, r, b, t = _ponte().riquadro(self.raw, int(index))
        if not ok:
            raise PdfiumError("Failed to get charbox.")
        return float(l), float(b), float(r), float(t)

    def close(self):
        if self.raw:
            _ponte().chiudiTesto(self.raw)
            self.raw = 0


class PdfBitmap:
    def __init__(self, buffer, width, height, stride, rev_byteorder=False):
        self.buffer = buffer
        self.width = width
        self.height = height
        self.stride = stride
        self.format = FPDFBitmap_BGR
        self.rev_byteorder = rev_byteorder
        self.n_channels = 3
        self.mode = "RGB" if rev_byteorder else "BGR"

    def to_pil(self):
        from PIL import Image
        image = Image.frombuffer("RGB", (self.width, self.height), self.buffer, "raw", self.mode, self.stride, 1)
        image.readonly = False
        return image

    def close(self):
        pass
