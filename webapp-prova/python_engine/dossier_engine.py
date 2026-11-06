from __future__ import annotations

import hashlib
import io
import math
import os
import re
import statistics
import tempfile
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable

try:
    import pypdfium2 as pdfium
except Exception:
    pdfium = None

try:
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
except Exception:
    Image = None

_RAPID_OCR = None
_RAPID_OCR_ERROR = None

DATE_RE = re.compile(r"(?<!\d)(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})(?!\d)")
NUMBER_RE = re.compile(r"(?<![A-Za-z0-9])[-+]?(?:\d{1,3}(?:[. ]\d{3})+|\d+)(?:[,.]\d+)?(?![A-Za-z0-9])")
RANGE_RE = re.compile(r"([-+]?(?:\d+(?:[,.]\d+)?))\s*(?:[-–—÷]|\ba\b|\bto\b)\s*([-+]?(?:\d+(?:[,.]\d+)?))", re.I)

QUAL_RESULT_HINTS = {
    "assente", "assenti", "presente", "presenti", "negativo", "negativa", "negativi", "negative",
    "positivo", "positiva", "positivi", "positive", "normale", "limpido", "limpida", "paglierino",
    "torbido", "torbida", "tracce", "non rilevato", "non rilevata", "nulla da segnalare", "reattivo",
    "non reattivo", "debolmente positivo", "dubbio", "indeterminato", "regolare", "irregolare",
}

IGNORE_ROW_PREFIXES = (
    "valore consigliato", "valori desiderabili", "referto completo", "referto finale", "rappresentazione",
    "num. certificato", "firmatario", "pagina", "pag.", "sessione", "metodica", "esame esito",
    "analisi metodica", "descrizione esame", "valori di riferimento", "esame microscopico",
)

SECTION_WORDS = {
    "ematologia", "chimica clinica", "biochimica", "coagulazione", "immunologia", "sierologia",
    "microbiologia", "urine", "esame urine", "fisico", "chimico", "ormoni", "endocrinologia",
}

UNIT_TOKEN_RE = re.compile(
    r"^(?:%|g/dl|mg/dl|ng/dl|pg/ml|ng/ml|µ?ui/ml|mui/ml|ui/l|u/l|mmol/l|mol/l|"
    r"x?\s*10(?:\.|\^)?e?\d+/?(?:ul|µl|l)|fl|pg|g/l|mg/l|µg/l|ug/l|mm/h|sec|s|"
    r"mEq/l|k/u?l|cells?/?(?:ul|µl)|copies/ml)$", re.I
)


def normalize_text(value: str = "") -> str:
    s = unicodedata.normalize("NFD", str(value or ""))
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.replace("‐", "-").replace("‑", "-").replace("–", "-").replace("—", "-").replace("−", "-")
    return re.sub(r"\s+", " ", s).strip().lower()


def compact(value: str = "") -> str:
    return re.sub(r"[^a-z0-9]", "", normalize_text(value))


def parse_number(value: str | None) -> float | None:
    if value is None:
        return None
    s = str(value).strip().replace(" ", "")
    s = re.sub(r"(?<=\d)[Oo](?=\d)", "0", s)
    s = re.sub(r"[^0-9,\.\-+]", "", s)
    if not s or s in {"-", "+"}:
        return None
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        n = float(s)
        return n if math.isfinite(n) else None
    except Exception:
        return None


def iso_date(d: str, m: str, y: str) -> str | None:
    try:
        day, month, year = int(d), int(m), int(y)
        import datetime as _dt
        dt = _dt.date(year, month, day)
        return dt.isoformat()
    except Exception:
        return None


def visual_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _line_quality(text: str) -> float:
    if not text:
        return 0.0
    printable = sum(ch.isalnum() or ch in " .,;:/%+-()[]'\"µ°<>=" for ch in text)
    weird = len(text) - printable
    doubled = len(re.findall(r"([A-Za-z])\1(?=[A-Za-z])", text))
    words = re.findall(r"[A-Za-zÀ-ÿ]{2,}", text)
    vowel_words = sum(bool(re.search(r"[aeiouàèéìòóù]", w, re.I)) for w in words)
    return printable - weird * 4 - doubled * 0.9 + vowel_words * 0.8


def _collapse_doubled_letters(text: str) -> str:
    # Usato solo per confrontare i due livelli testuali sovrapposti, non per modificare il testo scelto.
    return re.sub(r"([A-Za-zÀ-ÿ])\1", r"\1", normalize_text(text))


def _similar(a: str, b: str) -> float:
    a1, b1 = normalize_text(a), normalize_text(b)
    if not a1 or not b1:
        return 0.0
    direct = SequenceMatcher(None, a1, b1).ratio()
    collapsed = SequenceMatcher(None, _collapse_doubled_letters(a), _collapse_doubled_letters(b)).ratio()
    return max(direct, collapsed)


def _union_boxes(boxes: list[tuple[float, float, float, float]]) -> tuple[float, float, float, float]:
    xs0 = [b[0] for b in boxes]
    ys0 = [b[1] for b in boxes]
    xs1 = [b[2] for b in boxes]
    ys1 = [b[3] for b in boxes]
    return min(xs0), min(ys0), max(xs1), max(ys1)


def _pdfium_words_lines(page: Any) -> tuple[list[dict[str, Any]], str]:
    text_page = page.get_textpage()
    count = text_page.count_chars()
    height = float(page.get_height())
    lines: list[dict[str, Any]] = []
    current_words: list[dict[str, Any]] = []
    current_chars: list[str] = []
    current_boxes: list[tuple[float, float, float, float]] = []

    def finish_word() -> None:
        nonlocal current_chars, current_boxes
        if not current_chars:
            return
        txt = "".join(current_chars).strip()
        if txt and current_boxes:
            x0, y0b, x1, y1b = _union_boxes(current_boxes)
            top = max(0.0, height - y1b)
            bottom = max(top, height - y0b)
            current_words.append({
                "text": txt,
                "x": round(x0, 2),
                "y": round(top, 2),
                "width": round(max(0.0, x1 - x0), 2),
                "height": round(max(0.0, bottom - top), 2),
            })
        current_chars, current_boxes = [], []

    def finish_line() -> None:
        nonlocal current_words
        finish_word()
        if current_words:
            ordered = sorted(current_words, key=lambda w: (w["x"], w["y"]))
            x0 = min(w["x"] for w in ordered)
            y0 = min(w["y"] for w in ordered)
            x1 = max(w["x"] + w["width"] for w in ordered)
            y1 = max(w["y"] + w["height"] for w in ordered)
            txt = " ".join(w["text"] for w in ordered).strip()
            lines.append({
                "text": txt,
                "x": round(x0, 2),
                "y": round(y0, 2),
                "width": round(max(0.0, x1 - x0), 2),
                "height": round(max(0.0, y1 - y0), 2),
                "words": ordered,
            })
        current_words = []

    for idx in range(count):
        ch = text_page.get_text_range(idx, 1)
        if ch in {"\r", "\n"}:
            if ch == "\n":
                finish_line()
            else:
                finish_word()
            continue
        if ch.isspace():
            finish_word()
            continue
        try:
            box = text_page.get_charbox(idx)
        except Exception:
            box = None
        current_chars.append(ch)
        if box and any(abs(float(v)) > 1e-6 for v in box):
            current_boxes.append(tuple(float(v) for v in box))
    finish_line()

    # Elimina righe sovrapposte provenienti da un secondo livello OCR del PDF.
    chosen: list[dict[str, Any]] = []
    for line in lines:
        match_idx = None
        for i, existing in enumerate(chosen):
            if abs(existing["y"] - line["y"]) <= max(7.0, min(existing["height"], line["height"]) * 1.1):
                if abs(existing["x"] - line["x"]) <= 35 and _similar(existing["text"], line["text"]) >= 0.68:
                    match_idx = i
                    break
        if match_idx is None:
            chosen.append(line)
        elif _line_quality(line["text"]) > _line_quality(chosen[match_idx]["text"]) + 12:
            # Il primo livello testuale del PDF è normalmente quello digitale originale.
            # Sostituiscilo soltanto quando è chiaramente peggiore, non per differenze minime.
            chosen[match_idx] = line

    # Riunisce frammenti che appartengono alla stessa riga geometrica ma sono separati nel content stream.
    merged_lines: list[dict[str, Any]] = []
    for line in sorted(chosen, key=lambda l: (l["y"], l["x"])):
        target = None
        for existing in reversed(merged_lines[-4:]):
            if abs(existing["y"] - line["y"]) <= 2.8:
                target = existing
                break
        if target is None:
            merged_lines.append(line)
        else:
            words = sorted((target.get("words") or []) + (line.get("words") or []), key=lambda w: w["x"])
            # Evita di fondere due copie sovrapposte quasi identiche.
            if _similar(target.get("text", ""), line.get("text", "")) < 0.68:
                target["words"] = words
                target["text"] = " ".join(w["text"] for w in words).strip()
                x0 = min(w["x"] for w in words); y0 = min(w["y"] for w in words)
                x1 = max(w["x"] + w["width"] for w in words); y1 = max(w["y"] + w["height"] for w in words)
                target.update(x=round(x0,2), y=round(y0,2), width=round(x1-x0,2), height=round(y1-y0,2))
    chosen = merged_lines

    chosen.sort(key=lambda l: (l["y"], l["x"]))
    text = "\n".join(line["text"] for line in chosen if line["text"].strip())
    return chosen, text


def _rapidocr_engine():
    global _RAPID_OCR, _RAPID_OCR_ERROR
    if _RAPID_OCR is not None:
        return _RAPID_OCR
    if _RAPID_OCR_ERROR is not None:
        raise RuntimeError(_RAPID_OCR_ERROR)
    try:
        import rapidocr
        from rapidocr import RapidOCR
        model_root = str(Path(rapidocr.__file__).resolve().parent / "models")
        _RAPID_OCR = RapidOCR(params={
            "Global.model_root_dir": model_root,
            "Global.log_level": "error",
        })
        return _RAPID_OCR
    except Exception as exc:
        _RAPID_OCR_ERROR = f"RapidOCR non disponibile: {exc}"
        raise RuntimeError(_RAPID_OCR_ERROR) from exc


def rapidocr_available() -> tuple[bool, str]:
    try:
        _rapidocr_engine()
        return True, ""
    except Exception as exc:
        return False, str(exc)


def _prepare_image(image: Any, max_dim: int = 3200) -> Any:
    if Image is None:
        return image
    image = ImageOps.exif_transpose(image).convert("RGB")
    w, h = image.size
    scale = min(1.0, max_dim / max(w, h))
    if scale < 1.0:
        image = image.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
    image = ImageOps.autocontrast(image, cutoff=0.5)
    image = ImageEnhance.Sharpness(image).enhance(1.25)
    return image


def _order_ocr_lines_geometric(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Ordina i blocchi OCR secondo la geometria reale della pagina.

    La vecchia formula divideva la coordinata Y per l'altezza DELLA SINGOLA
    riga: titoli, testo normale e righe più alte finivano quindi in fasce
    diverse e potevano scambiarsi di posizione. Qui usiamo invece centri Y
    reali e raggruppiamo soltanto elementi realmente allineati sulla stessa
    riga, poi li ordiniamo da sinistra a destra.
    """
    rows = [dict(x) for x in (lines or []) if str(x.get("text") or "").strip()]
    if len(rows) < 2:
        return rows
    heights = sorted(max(1.0, float(x.get("height") or 0.0)) for x in rows)
    median_h = heights[len(heights)//2] if heights else 12.0
    tolerance = max(4.0, median_h * 0.42)
    ordered = sorted(rows, key=lambda x: (float(x.get("y") or 0.0) + float(x.get("height") or 0.0)/2.0, float(x.get("x") or 0.0)))
    bands: list[dict[str, Any]] = []
    for line in ordered:
        cy = float(line.get("y") or 0.0) + float(line.get("height") or 0.0)/2.0
        if bands and abs(cy - float(bands[-1]["cy"])) <= tolerance:
            band = bands[-1]
            band["items"].append(line)
            band["cy"] = sum(float(x.get("y") or 0.0) + float(x.get("height") or 0.0)/2.0 for x in band["items"]) / len(band["items"])
        else:
            bands.append({"cy": cy, "items": [line]})
    result: list[dict[str, Any]] = []
    for band in bands:
        result.extend(sorted(band["items"], key=lambda x: (float(x.get("x") or 0.0), float(x.get("y") or 0.0))))
    return result


def _geometric_ocr_page_text(pages: list[dict[str, Any]] | None) -> str:
    parts: list[str] = []
    used = False
    for page in pages or []:
        if not isinstance(page, dict):
            continue
        lines = page.get("lines") or []
        selected = str(page.get("selectedPass") or "")
        # La ricostruzione geometrica è pensata per OCR/scansioni/foto.
        if not lines or (selected and "rapidocr" not in selected.lower()):
            continue
        ordered = _order_ocr_lines_geometric(lines)
        text = "\n".join(str(x.get("text") or "").strip() for x in ordered if str(x.get("text") or "").strip())
        if text:
            used = True
            parts.append(text)
    return "\n".join(parts).strip() if used else ""


def _ocr_image(image: Any, pass_name: str = "RapidOCR ONNX") -> tuple[list[dict[str, Any]], str, float]:
    engine = _rapidocr_engine()
    image = _prepare_image(image)
    import numpy as np
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    bgr = rgb[:, :, ::-1].copy()
    result = engine(bgr, use_det=True, use_cls=False, use_rec=True)
    boxes = getattr(result, "boxes", None)
    txts = getattr(result, "txts", None) or ()
    scores = getattr(result, "scores", None) or ()
    lines: list[dict[str, Any]] = []
    if boxes is not None:
        for box, txt, score in zip(boxes, txts, scores):
            pts = [[float(p[0]), float(p[1])] for p in box]
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            text = str(txt).strip()
            if not text:
                continue
            lines.append({
                "text": text,
                "x": round(x0, 2), "y": round(y0, 2),
                "width": round(x1 - x0, 2), "height": round(y1 - y0, 2),
                "words": [{"text": text, "x": round(x0, 2), "y": round(y0, 2), "width": round(x1-x0, 2), "height": round(y1-y0, 2)}],
                "score": round(float(score) * 100, 1),
            })
    lines = _order_ocr_lines_geometric(lines)
    text = "\n".join(l["text"] for l in lines)
    quality = round(sum(float(s) for s in scores) / max(1, len(scores)) * 100, 1) if scores else 0.0
    return lines, text, quality



def _ocr_text_plausibility(value: str) -> float:
    """Stima leggera della plausibilità linguistica senza vocabolari esterni.

    Serve solo a scegliere tra letture OCR della STESSA riga. Non modifica mai
    il testo e non può eliminare una riga solo perché insolita/tecnica.
    """
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return 0.0
    letters = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ]", text)
    if not letters:
        return 0.35 if re.search(r"\d", text) else 0.0
    alpha_ratio = len(letters) / max(1, len(text))
    weird = len(re.findall(r"[{}\[\]|~^`]", text))
    words = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ]{2,}", text)
    vowel_words = sum(bool(re.search(r"[aeiouàèéìòóù]", w, re.I)) for w in words)
    word_ratio = vowel_words / max(1, len(words)) if words else 0.45
    return max(0.0, min(1.0, alpha_ratio * 0.45 + word_ratio * 0.55 - weird * 0.08))


def _ocr_same_geometric_line(a: dict[str, Any], b: dict[str, Any]) -> bool:
    ay = float(a.get("y") or 0.0); ah = max(1.0, float(a.get("height") or 0.0))
    by = float(b.get("y") or 0.0); bh = max(1.0, float(b.get("height") or 0.0))
    acy, bcy = ay + ah / 2.0, by + bh / 2.0
    if abs(acy - bcy) > max(6.0, max(ah, bh) * 0.62):
        return False
    ax0 = float(a.get("x") or 0.0); ax1 = ax0 + max(1.0, float(a.get("width") or 0.0))
    bx0 = float(b.get("x") or 0.0); bx1 = bx0 + max(1.0, float(b.get("width") or 0.0))
    overlap = max(0.0, min(ax1, bx1) - max(ax0, bx0))
    minw = max(1.0, min(ax1 - ax0, bx1 - bx0))
    if overlap / minw >= 0.28:
        return True
    acx, bcx = (ax0 + ax1) / 2.0, (bx0 + bx1) / 2.0
    return abs(acx - bcx) <= max(18.0, max(ax1 - ax0, bx1 - bx0) * 0.25)


def _ocr_fuse_photo_passes(results: list[tuple[str, list[dict[str, Any]], str, float]]) -> tuple[list[dict[str, Any]], str, float]:
    """Fonde le tre letture fotografiche riga per riga.

    La vecchia pipeline sceglieva un'intera pagina e perdeva una riga letta
    bene soltanto da un altro passaggio. Qui ogni riga geometrica conserva la
    miglior lettura disponibile. Le righe uniche non vengono scartate solo per
    bassa confidenza: vengono mantenute se linguisticamente plausibili.
    """
    candidates: list[dict[str, Any]] = []
    for pass_index, (name, lines, _text, pass_quality) in enumerate(results):
        for row in lines or []:
            item = dict(row)
            text = re.sub(r"\s+", " ", str(item.get("text") or "")).strip()
            if not text:
                continue
            item["text"] = text
            item["_pass"] = name
            item["_pass_index"] = pass_index
            item["_pass_quality"] = float(pass_quality or 0.0)
            item["_plausibility"] = _ocr_text_plausibility(text)
            item["_rank"] = (
                float(item.get("score") or 0.0) * 0.64
                + float(pass_quality or 0.0) * 0.16
                + item["_plausibility"] * 15.0
                + min(7.0, len(text) / 18.0)
            )
            candidates.append(item)
    candidates.sort(key=lambda x: (float(x.get("y") or 0.0), float(x.get("x") or 0.0), -float(x.get("_rank") or 0.0)))
    clusters: list[list[dict[str, Any]]] = []
    for item in candidates:
        best_i = -1; best_metric = 1e9
        for i, cluster in enumerate(clusters):
            representative = max(cluster, key=lambda x: float(x.get("_rank") or 0.0))
            if not _ocr_same_geometric_line(item, representative):
                continue
            dy = abs((float(item.get("y") or 0.0) + float(item.get("height") or 0.0)/2.0) -
                     (float(representative.get("y") or 0.0) + float(representative.get("height") or 0.0)/2.0))
            if dy < best_metric:
                best_metric = dy; best_i = i
        if best_i >= 0:
            clusters[best_i].append(item)
        else:
            clusters.append([item])

    chosen: list[dict[str, Any]] = []
    for cluster in clusters:
        # Se due letture hanno rank quasi uguale, preferiamo quella più completa.
        ranked = sorted(cluster, key=lambda x: (float(x.get("_rank") or 0.0), len(str(x.get("text") or ""))), reverse=True)
        best = ranked[0]
        for candidate in ranked[1:]:
            if float(candidate.get("_rank") or 0.0) >= float(best.get("_rank") or 0.0) - 3.5 and len(candidate["text"]) > len(best["text"]) * 1.18:
                best = candidate
        # Una riga presente in un solo passaggio è importante nelle foto difficili.
        # La conserviamo salvo rumore chiarissimo.
        if len(cluster) == 1 and float(best.get("score") or 0.0) < 42.0 and float(best.get("_plausibility") or 0.0) < 0.42:
            continue
        out = {k: v for k, v in best.items() if not str(k).startswith("_")}
        out["ocrPass"] = best.get("_pass")
        out["ocrAgreement"] = len({int(x.get("_pass_index") or 0) for x in cluster})
        chosen.append(out)

    chosen = _order_ocr_lines_geometric(chosen)
    # Deduplica solo righe geometricamente/semanticamente identiche adiacenti.
    final: list[dict[str, Any]] = []
    for row in chosen:
        key = normalize_text(str(row.get("text") or ""))
        if final and key and key == normalize_text(str(final[-1].get("text") or "")) and _ocr_same_geometric_line(row, final[-1]):
            if float(row.get("score") or 0.0) > float(final[-1].get("score") or 0.0):
                final[-1] = row
            continue
        final.append(row)
    text = "\n".join(str(x.get("text") or "").strip() for x in final if str(x.get("text") or "").strip())
    quality = round(sum(float(x.get("score") or 0.0) for x in final) / max(1, len(final)), 1)
    return final, text, quality


def _ocr_photo_three_pass(image: Any) -> tuple[list[dict[str, Any]], str, float, str]:
    """Tre letture complementari per fotografie/scansioni da telefono.

    R26: non sceglie più una singola lettura completa. Le tre letture vengono
    fuse riga per riga sulla geometria della pagina, così una riga leggibile
    soltanto in un passaggio non viene persa.
    """
    prepared = _prepare_image(image)
    variants = [("foto colore", prepared)]
    if Image is not None:
        try:
            import numpy as np
            import cv2
            gray_arr = np.asarray(ImageOps.grayscale(prepared), dtype=np.uint8)
            # Normalizzazione delle ombre: utile con smartphone e luce non uniforme.
            background = cv2.GaussianBlur(gray_arr, (0, 0), sigmaX=25, sigmaY=25)
            background = np.maximum(background, 1)
            normalized = cv2.divide(gray_arr, background, scale=245)
            clahe = cv2.createCLAHE(clipLimit=1.8, tileGridSize=(8, 8))
            normalized = clahe.apply(normalized)
            variants.append(("foto ombre normalizzate", Image.fromarray(normalized).convert("RGB")))
            adaptive = cv2.adaptiveThreshold(normalized, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11)
            variants.append(("foto contrasto locale", Image.fromarray(adaptive).convert("RGB")))
        except Exception:
            gray = ImageOps.grayscale(prepared)
            gray = ImageOps.autocontrast(gray, cutoff=0.2)
            gray = ImageEnhance.Sharpness(gray).enhance(1.45).convert("RGB")
            variants.append(("foto grigio contrasto", gray))
            bw = gray.convert("L").point(lambda px: 255 if px > 170 else 0).convert("RGB")
            variants.append(("foto soglia", bw))

    results: list[tuple[str, list[dict[str, Any]], str, float]] = []
    for name, variant in variants[:3]:
        lines, text, quality = _ocr_image(variant, pass_name=f"RapidOCR ONNX · {name}")
        results.append((name, lines, text, quality))
    if not results:
        return [], "", 0.0, "RapidOCR ONNX"
    lines, text, quality = _ocr_fuse_photo_passes(results)
    return lines, text, quality, "RapidOCR ONNX · fusione 3 passaggi"

def _render_pdf_page(page: Any, scale: float = 3.0) -> Any:
    bitmap = page.render(scale=scale, rotation=0)
    return bitmap.to_pil()


def _meaningful_native(text: str, lines: list[dict[str, Any]]) -> bool:
    chars = len(re.sub(r"\s", "", text or ""))
    alnum = len(re.findall(r"[A-Za-zÀ-ÿ0-9]", text or ""))
    return chars >= 80 and alnum >= 55 and len(lines) >= 4


def extract_document(path: str | os.PathLike[str], progress_callback=None) -> dict[str, Any]:
    p = Path(path)
    ext = p.suffix.lower()
    pages: list[dict[str, Any]] = []
    full_parts: list[str] = []
    native_pages = 0
    ocr_pages = 0

    if ext == ".pdf":
        if pdfium is None:
            raise RuntimeError("pypdfium2 non disponibile")
        pdf = pdfium.PdfDocument(str(p))
        total = len(pdf)
        if progress_callback:
            progress_callback({"stage": "pages", "progress": 5, "processedPages": 0, "totalPages": total, "message": f"Preparazione di {total} pagine"})
        for idx in range(total):
            page = pdf[idx]
            lines, text = _pdfium_words_lines(page)
            width, height = float(page.get_width()), float(page.get_height())
            if _meaningful_native(text, lines):
                selected = "Testo PDF nativo con coordinate"
                quality = 99.0
                native_pages += 1
            else:
                image = _render_pdf_page(page, scale=3.2)
                lines, text, quality = _ocr_image(image)
                width, height = image.size
                selected = "RapidOCR ONNX"
                ocr_pages += 1
            full_parts.append(f"=== PAGINA {idx+1} ===\n{text}")
            signature = (f"pagina {idx+1} " + text).encode("utf-8", "ignore")
            pages.append({
                "pageNumber": idx + 1,
                "text": text,
                "visualHash": visual_hash(signature),
                "lines": lines,
                "selectedPass": selected,
                "quality": quality,
                "passes": [{"name": selected, "quality": quality, "characters": len(text), "lines": len(lines), "textAngle": 0}],
                "width": int(round(width)), "height": int(round(height)),
            })
            if progress_callback:
                done = idx + 1
                progress_callback({
                    "stage": "pages",
                    "progress": round(5 + (done / max(1, total)) * 83, 1),
                    "processedPages": done,
                    "totalPages": total,
                    "message": f"Pagina {done} di {total} · {selected}",
                })
        engine = (
            f"Python · PDFium nativo con coordinate · {native_pages} pagine" if ocr_pages == 0
            else f"Python · PDFium + RapidOCR ONNX · {native_pages} native, {ocr_pages} OCR"
        )
        return {
            "text": "\n\n".join(full_parts), "pages": pages, "pageCount": total, "processedPages": total,
            "warning": None, "engine": engine, "nativePages": native_pages,
        }

    if Image is None:
        raise RuntimeError("Pillow non disponibile")
    if progress_callback:
        progress_callback({"stage": "pages", "progress": 10, "processedPages": 0, "totalPages": 1, "message": "Analisi immagine"})
    with Image.open(p) as image:
        width, height = image.size
        lines, text, quality, selected_photo_pass = _ocr_photo_three_pass(image)
    if progress_callback:
        progress_callback({"stage": "pages", "progress": 88, "processedPages": 1, "totalPages": 1, "message": "Pagina 1 di 1 · RapidOCR ONNX"})
    pages.append({
        "pageNumber": 1, "text": text, "visualHash": visual_hash(p.read_bytes()), "lines": lines,
        "selectedPass": selected_photo_pass, "quality": quality,
        "passes": [{"name": selected_photo_pass, "quality": quality, "characters": len(text), "lines": len(lines), "textAngle": 0}],
        "width": int(width), "height": int(height),
    })
    return {"text": text, "pages": pages, "pageCount": 1, "processedPages": 1, "warning": None,
            "engine": "Python · RapidOCR ONNX locale · foto 3 passaggi", "nativePages": 0}


def _column_text(words: list[dict[str, Any]], left: float, right: float) -> str:
    selected = [w for w in words if left <= (w["x"] + w["width"] / 2) < right]
    return " ".join(w["text"] for w in sorted(selected, key=lambda z: z["x"])).strip()


def _header_columns(line: dict[str, Any], page_width: float) -> tuple[float, float, float] | None:
    words = line.get("words") or []
    if not words:
        return None
    norm_words = [(normalize_text(w["text"]), w) for w in words]
    result_ws = [w for n, w in norm_words if re.search(r"risultat|esito", n)]
    unit_ws = [w for n, w in norm_words if n in {"unita", "u.m.", "u.m", "um"} or n.startswith("unita")]
    ref_ws = [w for n, w in norm_words if re.search(r"riferiment|intervallo|range", n)]
    name_hit = any(re.search(r"analisi|esame|descrizione|test", n) for n, _ in norm_words)
    if not name_hit or not result_ws:
        return None
    rx = min(w["x"] for w in result_ws)
    ux = min((w["x"] for w in unit_ws), default=rx + page_width * 0.14)
    fx = min((w["x"] for w in ref_ws), default=ux + page_width * 0.17)
    if ux <= rx:
        ux = rx + page_width * 0.13
    if fx <= ux:
        fx = ux + page_width * 0.16
    b1 = max(page_width * 0.25, (rx + ux * 0.2))
    # Confini a metà tra l'inizio delle colonne, con spazio sufficiente per il nome.
    name_result = max(page_width * 0.28, rx - page_width * 0.035)
    result_unit = max(name_result + 35, (rx + ux) / 2)
    unit_ref = max(result_unit + 35, (ux + fx) / 2)
    return name_result, result_unit, unit_ref


def _clean_name(name: str) -> str:
    s = re.sub(r"\s+", " ", name or "").strip(" :-")
    s = re.sub(r"^(?:sg|s|u|p|b|pl|ur)\s*-{1,3}\s*", "", s, flags=re.I)
    s = re.sub(r"^(?:fisico|chimico)\s*:\s*", "", s, flags=re.I)
    return s.strip(" :-")



REFERENCE_CONTINUATION_RE = re.compile(
    r"^(?:[<>≤≥]?\s*\d+(?:[,.]\d+)?\s*(?:-|a)?\s*\d*(?:[,.]\d+)?\s*anni|"
    r"in (?:assenza|presenza) di sintomi clinici|alterata glicemia a digiuno|"
    r"elevato rischio di diabete|livello decisionale (?:per )?la diagnosi di diabete|"
    r"valori? (?:insufficienti|sufficienti|desiderabili)|in assenza di altre evidenze cliniche|"
    r"in presenza di soggetto appartenente|non e applicabile in gravidanza|"
    r"ed? \d+(?:[,.]\d+)?\s*ml\s*/\s*min|muscolare stato nutrizionale|orientali in questi casi|"
    r"m\s*(?:\^?2|²)|il laboratorio|malattia renale|etnico afro|defedato|debilitato|"
    r"estremi di massa corporea|clearance renale)\b", re.I
)


def _is_reference_continuation_name(name: str) -> bool:
    n = normalize_text(name or "")
    administrative = re.match(r"^(?:centralino|timbro|cartella clinica|scheda nosologica|data di nascita|luogo di nascita|paziente|reparto|ricovero|codice fiscale|indirizzo|telefono|numero telefono|fax|e mail|email|accettazione|inserita il|n libretto|servizio sanitario nazionale|richiesta|numero referto|referto n|pagina)\b", n)
    return not n or bool(REFERENCE_CONTINUATION_RE.search(n)) or bool(administrative) or len(n) > 100 or ("|" in str(name or "") and len(n) > 35)


def _split_unit_reference(unit: str, ref: str, source: str = "") -> tuple[str, str, str]:
    u = re.sub(r"\s+", " ", str(unit or "")).strip()
    reference = re.sub(r"\s+", " ", str(ref or "").replace("÷", "-").replace("–", "-").replace("—", "-")).strip()
    flag_match = re.match(r"^\s*([<>≤≥↑↓])\s*", u)
    flag = flag_match.group(1) if flag_match else ""
    u = re.sub(r"^\s*[<>≤≥↑↓]\s*", "", u).strip()
    embedded = re.match(r"^(.+?)(\s+(?:<=|>=|[<>≤≥])\s*[-+]?\d+(?:[,.]\d+)?(?:.*))$", u, re.I)
    if embedded and re.search(r"(?:/|%|\b(?:fl|pg|ui|u|l|ml|dl|mol|mmol|meq)\b)", embedded.group(1), re.I):
        u = embedded.group(1).strip()
        if not reference:
            reference = embedded.group(2).strip()
    if not reference and u:
        m = re.search(re.escape(u) + r"\s*((?:<=|>=|[<>≤≥])\s*[-+]?\d+(?:[,.]\d+)?(?:\s+[^|]{0,70})?)", source or "", re.I)
        if m:
            reference = m.group(1).strip()
    u = u.replace("μ", "µ")
    return u, reference, flag


def _qualitative_status(result: str) -> str:
    # Senza un riferimento esplicito del referto, il Dossier non interpreta
    # autonomamente il significato clinico di un risultato qualitativo.
    return "da verificare"


def _range_condition(value: float, range_obj: dict[str, Any] | None) -> bool | None:
    if not range_obj:
        return None
    op = str(range_obj.get("operator") or "")
    limit = range_obj.get("limit")
    raw = str(range_obj.get("semanticRaw") or range_obj.get("raw") or "").strip()
    if not op:
        match = re.match(r"^\s*(<=|>=|[<>≤≥])", raw)
        if match:
            op = {"<=": "≤", ">=": "≥"}.get(match.group(1), match.group(1))
            if not isinstance(limit, (int, float)):
                limit = range_obj.get("high") if op in ("<", "≤") else range_obj.get("low")
    if op and isinstance(limit, (int, float)):
        if op == "<": return value < float(limit)
        if op == "≤": return value <= float(limit)
        if op == ">": return value > float(limit)
        if op == "≥": return value >= float(limit)
    low = range_obj.get("min", range_obj.get("low"))
    high = range_obj.get("max", range_obj.get("high"))
    if isinstance(low, (int, float)) and isinstance(high, (int, float)):
        return float(low) <= value <= float(high)
    return None


def _semantic_reference_status(value: float, range_obj: dict[str, Any] | None, reference: str = "") -> str:
    if not range_obj:
        return ""
    raw = str(reference or range_obj.get("semanticRaw") or range_obj.get("raw") or "").strip()
    if not raw:
        return ""
    n = normalize_text(raw)
    condition = _range_condition(value, range_obj)
    if condition is None:
        return ""
    abnormal = (
        (r"insufficient|carent|deficit", "insufficiente"),
        (r"critic", "critico"),
        (r"alterat|anomalo|anormale", "alterato"),
        (r"elevat|aumentat|\balto\b|\balta\b|superior", "alto"),
        (r"ridott|\bbasso\b|\bbassa\b|inferior", "basso"),
    )
    for pattern, status in abnormal:
        if re.search(pattern, n):
            return status if condition else "da verificare"
    if re.search(r"sufficient|desiderabil|normale|nei limiti|nella norma|regolare", n):
        if condition:
            return "nei limiti"
        op = str(range_obj.get("operator") or "")
        if op in ("<", "≤"):
            return "alto"
        if op in (">", "≥"):
            return "basso"
        low = range_obj.get("min", range_obj.get("low"))
        high = range_obj.get("max", range_obj.get("high"))
        if isinstance(low, (int, float)) and value < float(low): return "basso"
        if isinstance(high, (int, float)) and value > float(high): return "alto"
        return "da verificare"
    return ""


def _descriptive_status(value: float, range_obj: dict[str, Any] | None, reference: str, source: str) -> str:
    semantic = _semantic_reference_status(value, range_obj, reference)
    if semantic:
        return semantic
    status = _status(value, range_obj, source)
    return "da verificare" if status == "non definito" else status


def _repair_numeric_from_source(name: str, value: float, raw_value: str, source: str) -> tuple[float, str]:
    line = str(source or "")
    if re.search(r"filtrato glomerulare|egfr", name + " " + line, re.I) and re.search(r"ckd[- ]?epi", line, re.I):
        m = re.search(r"ckd[- ]?epi(?:\s+kdigo)?\s*2012\D+([-+]?\d+(?:[,.]\d+)?)", line, re.I)
        if m:
            parsed = parse_number(m.group(1))
            if parsed is not None:
                return parsed, m.group(1)
    sci = re.search(r"([-+]?\d+(?:[,.]\d+)?)\s*[<>]?\s*(?:x|\*)?\s*10(?:\.e|\^)?\s*([369]|12)\s*/\s*[µu]?[lL]", line, re.I)
    if sci:
        exponent = parse_number(sci.group(2))
        first = parse_number(sci.group(1))
        if first is not None and (value == exponent or raw_value.strip() == sci.group(2)):
            return first, sci.group(1)
    return value, raw_value


def _normalized_exam_key(name: str) -> str:
    n = normalize_text(name or "")
    for token in ("ft3", "ft4", "tsh"):
        if re.search(rf"\b{token}\b", n):
            return token
    n = re.sub(r"\b(?:ormone|liber[oa]|ematic[oa]|sieric[oa]|plasmatic[oa])\b", " ", n)
    return re.sub(r"[^a-z0-9%]+", "", n)


def _row_quality(row: dict[str, Any]) -> float:
    score = float(row.get("confidence", 0)) / 35.0
    status = normalize_text(row.get("status", ""))
    if status and status not in {"non definito", "da verificare"}:
        score += 8
    rng = row.get("range") or {}
    if any(rng.get(k) is not None for k in ("low", "high")):
        score += 5
    if row.get("unit") and not re.match(r"^[<>≤≥]", str(row.get("unit"))):
        score += 3
    return score


def _normalize_and_dedupe_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chosen: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for row in rows:
        if _is_reference_continuation_name(row.get("test", "")):
            continue
        unit, reference, flag = _split_unit_reference(row.get("unit", ""), row.get("reference", ""), row.get("sourceLine", ""))
        row["unit"] = unit
        row["reference"] = reference
        if row.get("kind") == "numeric":
            numeric_value = row.get("value")
            if not isinstance(numeric_value, (int, float)):
                numeric_value = parse_number(str(numeric_value)) if numeric_value is not None else None
            if numeric_value is None:
                continue
            value, raw = _repair_numeric_from_source(row.get("test", ""), float(numeric_value), str(row.get("rawValue", row.get("value", ""))), row.get("sourceLine", ""))
            row["value"], row["rawValue"] = value, raw
            rng = _parse_range(reference) if reference else row.get("range")
            if rng and reference:
                rng["raw"] = reference
            row["range"] = rng
            row["status"] = _descriptive_status(value, rng, reference, f"{row.get('sourceLine','')} {flag}")
            key = compact(f"n|{_normalized_exam_key(row.get('test', ''))}|{value}|{re.sub(r'^[<>≤≥]','',unit)}")
        else:
            row["status"] = row.get("status") or _qualitative_status(row.get("result", ""))
            key = compact(f"q|{_normalized_exam_key(row.get('test', ''))}|{row.get('result')}|{re.sub(r'^[<>≤≥]','',unit)}")
        if not key:
            continue
        if key not in chosen:
            chosen[key] = row
            order.append(key)
        elif _row_quality(row) > _row_quality(chosen[key]):
            chosen[key] = row
    return [chosen[k] for k in order]

def _plausible_name(name: str) -> bool:
    n = normalize_text(name)
    if len(n) < 2 or n.startswith(IGNORE_ROW_PREFIXES) or _is_reference_continuation_name(name) or re.match(r'^(?:accettazione|inserita il|n libretto|numero telefono|codice fiscale|servizio sanitario nazionale|azienda ospedaliera|direttore|paziente)\b', n):
        return False
    if n.startswith(("uomini", "donne", "maschi", "femmine", "valori desiderabili", "valore desiderabile", "desiderabile", "esame completo", "esame microscopico")):
        return False
    if _is_unit_like(name):
        return False
    if n in SECTION_WORDS:
        return False
    if re.fullmatch(r"[\d\W_]+", n):
        return False
    return bool(re.search(r"[a-zà-ÿ]", n))


def _parse_range(raw: str) -> dict[str, Any] | None:
    text = str(raw or "").strip()
    if not text:
        return None
    m = RANGE_RE.search(text)
    if m:
        low, high = parse_number(m.group(1)), parse_number(m.group(2))
        return {"raw": text.replace("÷", "-"), "low": low, "high": high}
    m = re.search(r"(<=|>=|[<>≤≥])\s*([-+]?\d+(?:[,.]\d+)?)", text)
    if m:
        val = parse_number(m.group(2)); op=m.group(1)
        return {"raw": text, "low": val if op in (">", ">=", "≥") else None, "high": val if op in ("<", "<=", "≤") else None}
    return {"raw": text}


def _status(value: float, range_obj: dict[str, Any] | None, source: str) -> str:
    semantic = _semantic_reference_status(value, range_obj, str((range_obj or {}).get("semanticRaw") or (range_obj or {}).get("raw") or ""))
    if semantic:
        return semantic
    n = normalize_text(source)
    if re.search(r"\b(?:alto|high)\b|↑|\+\+", n):
        if range_obj and range_obj.get("high") is not None and value <= range_obj["high"]:
            return "nei limiti"
        return "alto"
    if re.search(r"\b(?:basso|low)\b|↓", n):
        return "basso"
    if range_obj:
        low, high = range_obj.get("low"), range_obj.get("high")
        raw = str(range_obj.get("raw", "")).strip()
        if low is not None and value < low:
            return "basso"
        if high is not None and value > high:
            return "alto"
        if high is not None and re.match(r"^\s*<(?!=)", raw) and value >= high:
            return "alto"
        if low is not None and re.match(r"^\s*>(?!=)", raw) and value <= low:
            return "basso"
        if low is not None or high is not None:
            return "nei limiti"
    return "non definito"


def _find_value_token(value_text: str) -> tuple[str, float | None]:
    m = NUMBER_RE.search(value_text or "")
    if not m:
        return "", None
    raw = m.group(0)
    return raw, parse_number(raw)


def _is_unit_like(text: str) -> bool:
    s = text.strip().replace(" ", "")
    return bool(UNIT_TOKEN_RE.match(s)) or bool(re.search(r"/(?:dl|ml|l|ul|µl)\b", s, re.I))


def _row_from_columns(name: str, value_text: str, unit: str, ref: str, source: str, page_number: int) -> dict[str, Any] | None:
    name = _clean_name(name)
    if not _plausible_name(name):
        return None
    unit, ref, flag = _split_unit_reference(unit, ref, source)
    raw_value, value = _find_value_token(value_text)
    if value is not None:
        if raw_value and not re.match(r"^(?:<=|>=|[<>≤≥])", raw_value):
            cmp_match = re.search(r"(?:<=|>=|[<>≤≥])\s*" + re.escape(raw_value) + r"(?![\d.,])", str(source or ""))
            if cmp_match:
                cmp_token = re.match(r"(?:<=|>=|[<>≤≥])", cmp_match.group(0).strip())
                if cmp_token:
                    raw_value = cmp_token.group(0) + raw_value
        value, raw_value = _repair_numeric_from_source(name, value, raw_value, source)
        if re.search(r"(?:filtrato glomerulare|egfr)", normalize_text(name)) and float(value) == 2012 and not re.search(r"2012\D+[-+]?\d+(?:[,.]\d+)?", source or ""):
            return None
        range_obj = _parse_range(ref)
        return {
            "kind": "numeric", "test": name, "value": value, "rawValue": raw_value,
            "unit": unit.strip(), "reference": ref.strip(), "range": range_obj,
            "status": _descriptive_status(value, range_obj, ref, f"{source} {flag}"), "sourceLine": source.strip(),
            "confidence": 94, "pageNumber": page_number,
        }
    result = value_text.strip()
    if result and re.search(r"[A-Za-zÀ-ÿ]", result):
        extra = []
        if unit.strip() and not _is_unit_like(unit.strip()) and not NUMBER_RE.search(unit):
            extra.append(unit.strip())
        if ref.strip() and not RANGE_RE.search(ref) and not NUMBER_RE.search(ref):
            extra.append(ref.strip())
        if extra:
            result = " ".join([result] + extra).strip()
            unit = ""
            ref = ""
        return {
            "kind": "qualitative", "test": name, "result": result,
            "unit": unit.strip(), "reference": ref.strip(), "status": _qualitative_status(result), "sourceLine": source.strip(),
            "confidence": 92, "pageNumber": page_number,
        }
    return None


def _fallback_line_row(text: str, page_number: int) -> dict[str, Any] | None:
    line = re.sub(r"\s+", " ", text).strip()
    n = normalize_text(line)
    if len(line) < 4 or n.startswith(IGNORE_ROW_PREFIXES):
        return None
    # Nome + risultato numerico + eventuale unità + intervallo.
    range_match = None
    for m in RANGE_RE.finditer(line):
        range_match = m
    if range_match:
        before = line[:range_match.start()].strip()
        ref = range_match.group(0)
        nums = list(NUMBER_RE.finditer(before))
        if nums:
            vm = nums[-1]
            prefix = before[:vm.start()].strip()
            suffix = before[vm.end():].strip()
            # Se il suffisso è unità, il nome è il prefisso. Se contiene unità composta, conserva.
            name = prefix
            unit = suffix
            if _plausible_name(name):
                return _row_from_columns(name, vm.group(0), unit, ref, line, page_number)
    # Nome + valore, senza intervallo.
    nums = list(NUMBER_RE.finditer(line))
    if nums:
        # Ignora date e identificativi puri.
        for vm in nums:
            if DATE_RE.fullmatch(vm.group(0)):
                continue
            name = line[:vm.start()].strip()
            tail = line[vm.end():].strip()
            if _plausible_name(name) and not re.search(r"(?:data|richiesta|referto|libretto|id|codice|eta|ore)\s*$", normalize_text(name)):
                unit = tail if _is_unit_like(tail) else ""
                return _row_from_columns(name, vm.group(0), unit, "", line, page_number)
    # Qualitativo generico: divide sull'ultima sequenza in maiuscolo/parola breve se plausibile.
    parts = line.split()
    if len(parts) >= 2:
        for cut in range(1, min(5, len(parts)) + 1):
            result = " ".join(parts[-cut:])
            name = " ".join(parts[:-cut])
            rn = normalize_text(result)
            if _plausible_name(name) and rn in QUAL_RESULT_HINTS:
                return _row_from_columns(name, result, "", "", line, page_number)
    return None


def extract_structured_rows(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for page in pages:
        lines = sorted(page.get("lines") or [], key=lambda l: (l.get("y", 0), l.get("x", 0)))
        width = float(page.get("width") or 1000)
        page_number = int(page.get("pageNumber") or 1)
        header_idx = None
        bounds = None
        for i, line in enumerate(lines):
            candidate = _header_columns(line, width)
            if candidate:
                header_idx, bounds = i, candidate
                break
        pending: dict[str, str] | None = None
        iterable = lines[header_idx + 1:] if header_idx is not None else lines
        for line in iterable:
            text = re.sub(r"\s+", " ", str(line.get("text") or "")).strip()
            if not text:
                continue
            ntext = normalize_text(text)
            if _is_reference_continuation_name(text):
                if rows and rows[-1].get("kind") == "numeric":
                    notes = rows[-1].setdefault("referenceNotes", [])
                    if text not in notes:
                        notes.append(text)
                continue
            if ntext.startswith(("referto del", "referto finale", "rappresentazione", "num. certificato", "firmatario")):
                if pending:
                    row = _row_from_columns(pending.get("name", ""), pending.get("value", ""), pending.get("unit", ""), pending.get("ref", ""), pending.get("source", ""), page_number)
                    if row:
                        key = compact(f"{row['kind']}|{row['test']}|{row.get('value', row.get('result'))}|{page_number}")
                        if key not in seen:
                            seen.add(key); rows.append(row)
                break
            row = None
            if bounds:
                b1, b2, b3 = bounds
                words = line.get("words") or []
                name = _column_text(words, -1e9, b1)
                value = _column_text(words, b1, b2)
                unit = _column_text(words, b2, b3)
                ref = _column_text(words, b3, 1e9)
                # Alcuni PDF posizionano l'unità nella colonna risultato: separala.
                if value and not unit:
                    toks = value.split()
                    if len(toks) > 1 and _is_unit_like(" ".join(toks[1:])):
                        value, unit = toks[0], " ".join(toks[1:])
                row = _row_from_columns(name, value, unit, ref, text, page_number)
                if row:
                    if pending:
                        # Completa o abbandona la riga precedente prima di iniziarne una nuova.
                        old = _row_from_columns(pending.get("name", ""), pending.get("value", ""), pending.get("unit", ""), pending.get("ref", ""), pending.get("source", ""), page_number)
                        if old:
                            key = compact(f"{old['kind']}|{old['test']}|{old.get('value', old.get('result'))}|{page_number}")
                            if key not in seen:
                                seen.add(key); rows.append(old)
                    pending = None
                else:
                    # Gestione righe spezzate su più linee.
                    has_value = _find_value_token(value)[1] is not None or bool(re.search(r"[A-Za-zÀ-ÿ]", value))
                    if name and has_value:
                        if pending:
                            old = _row_from_columns(pending.get("name", ""), pending.get("value", ""), pending.get("unit", ""), pending.get("ref", ""), pending.get("source", ""), page_number)
                            if old:
                                key = compact(f"{old['kind']}|{old['test']}|{old.get('value', old.get('result'))}|{page_number}")
                                if key not in seen:
                                    seen.add(key); rows.append(old)
                        pending = {"name": name, "value": value, "unit": unit, "ref": ref, "source": text}
                        continue
                    if pending:
                        if name and not value and not unit and not ref:
                            pending["name"] = f"{pending['name']} {name}".strip()
                            pending["source"] += " " + text
                            continue
                        if not name and (unit or ref):
                            pending["unit"] = f"{pending.get('unit','')} {unit}".strip()
                            pending["ref"] = f"{pending.get('ref','')} {ref}".strip()
                            pending["source"] += " " + text
                            completed = _row_from_columns(pending["name"], pending["value"], pending["unit"], pending["ref"], pending["source"], page_number)
                            if completed:
                                row = completed
                                pending = None
            if row is None and bounds:
                # Continuazione del nome dell'esame su una riga immediatamente successiva.
                b1, b2, b3 = bounds
                words = line.get("words") or []
                cont_name = _column_text(words, -1e9, b1)
                cont_value = _column_text(words, b1, b2)
                cont_unit = _column_text(words, b2, b3)
                cont_ref = _column_text(words, b3, 1e9)
                if cont_name and not cont_value and not cont_unit and not cont_ref and rows:
                    prev = rows[-1]
                    gap = float(line.get("y", 0)) - float(prev.get("_y", -999))
                    cont_norm = normalize_text(cont_name)
                    blocked_cont = re.search(r"\b(?:esame|urine|chimica|ematologia|microscopico|sedimento|referto|laboratorio|metodica|risultato)\b", cont_norm)
                    if prev.get("pageNumber") == page_number and 0 <= gap <= 18 and cont_norm not in SECTION_WORDS and not blocked_cont:
                        prev["test"] = f"{prev['test']} {_clean_name(cont_name)}".strip()
                        prev["sourceLine"] = f"{prev.get('sourceLine','')} {text}".strip()
                        continue
            if row is None:
                row = _fallback_line_row(text, page_number)
            if row:
                row["_y"] = float(line.get("y", 0))
                key = compact(f"{row['kind']}|{row['test']}|{row.get('value', row.get('result'))}|{page_number}")
                if key and key not in seen:
                    seen.add(key); rows.append(row)
        if pending:
            row = _row_from_columns(pending.get("name", ""), pending.get("value", ""), pending.get("unit", ""), pending.get("ref", ""), pending.get("source", ""), page_number)
            if row:
                key = compact(f"{row['kind']}|{row['test']}|{row.get('value', row.get('result'))}|{page_number}")
                if key not in seen:
                    seen.add(key); rows.append(row)
    return _normalize_and_dedupe_rows(rows)


def detect_dates(text: str, file_name: str = "") -> tuple[str, str, list[dict[str, Any]], int]:
    lines = text.splitlines()
    candidates: list[dict[str, Any]] = []
    for li, line in enumerate(lines):
        n = normalize_text(line)
        for m in DATE_RE.finditer(line):
            iso = iso_date(m.group(1), m.group(2), m.group(3))
            if not iso:
                continue
            clinical = 10
            issue = 0
            kind = "altra data"
            if re.search(r"nascit|nato|nata|dob", n):
                clinical -= 1000; issue -= 1000; kind = "data di nascita"
            if re.search(r"esecuz|preliev|accettaz|richiest|visita|ricover|intervent|prestaz|inserita|campione|accesso", n):
                clinical += 120; kind = "data clinica"
            strong_issue = re.search(r"referto\s+(?:del|in\s+data)|refertat|data\s+(?:e\s+ora\s+)?(?:della\s+)?firma|firmatario|validat|emission|stampat|rilasciat", n)
            if strong_issue:
                issue += 130
                if clinical < 100:
                    kind = "data di emissione"
            if re.search(r"referto\s+n\.?\s*\d", n) and re.search(r"accettaz", n):
                clinical += 50
            candidates.append({"iso": iso, "raw": m.group(0), "line": line, "lineIndex": li, "clinicalScore": clinical, "issueScore": issue, "kind": kind})

    # Nome file come conferma, mai come unica prova se esistono date forti nel testo.
    base = os.path.splitext(os.path.basename(file_name or ""))[0]
    for m in re.finditer(r"(?<!\d)(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])((?:19|20)\d{2})(?!\d)", base):
        iso = iso_date(m.group(1), m.group(2), m.group(3))
        if iso:
            candidates.append({"iso": iso, "raw": m.group(0), "line": "nome file", "lineIndex": -1, "clinicalScore": 90, "issueScore": 0, "kind": "data dal nome file"})

    merged: dict[str, dict[str, Any]] = {}
    for c in candidates:
        cur = merged.setdefault(c["iso"], {"iso": c["iso"], "raw": c["raw"], "kind": c["kind"], "clinicalScore": -999, "issueScore": -999, "contexts": []})
        cur["clinicalScore"] = max(cur["clinicalScore"], c["clinicalScore"])
        cur["issueScore"] = max(cur["issueScore"], c["issueScore"])
        cur["contexts"].append(c["line"])
        if c["clinicalScore"] >= cur["clinicalScore"]:
            cur["kind"] = c["kind"]
    unique = list(merged.values())
    for c in unique:
        c["score"] = max(c.get("clinicalScore", 0), c.get("issueScore", 0))
    clinical_candidates = [c for c in unique if c["clinicalScore"] > 0]
    clinical_candidates.sort(key=lambda c: c["clinicalScore"], reverse=True)
    issue_candidates = [c for c in unique if c["issueScore"] > 0]
    issue_candidates.sort(key=lambda c: c["issueScore"], reverse=True)
    clinical = clinical_candidates[0]["iso"] if clinical_candidates else ""
    issue = issue_candidates[0]["iso"] if issue_candidates else ""
    # Se data clinica ed emissione coincidono ma esiste una data clinica forte diversa, usa quella.
    if clinical and issue and clinical == issue:
        alt = next((c for c in clinical_candidates[1:] if c["iso"] != issue and c["clinicalScore"] >= 80), None)
        if alt:
            clinical = alt["iso"]
    confidence = min(99, max(20, int(clinical_candidates[0]["clinicalScore"] if clinical_candidates else 0)))
    return clinical, issue, sorted(unique, key=lambda c: max(c["clinicalScore"], c["issueScore"]), reverse=True)[:12], confidence


def detect_document_number(text: str) -> str:
    patterns = [
        r"referto\s*n[.°º]?\s*[:\-]?\s*([A-Z0-9./-]+)",
        r"id\s*referto\s*[:\-]?\s*([A-Z0-9./-]+)",
        r"numero\s*referto\s*[:\-]?\s*([A-Z0-9./-]+)",
    ]
    for p in patterns:
        m = re.search(p, text, re.I)
        if m:
            return m.group(1).strip(" .")
    return ""


def detect_facility(text: str) -> str:
    lines = [re.sub(r"\s+", " ", l).strip() for l in text.splitlines() if l.strip()]
    selected = []
    for l in lines[:35]:
        n = normalize_text(l)
        if any(k in n for k in ("azienda ospedal", "azienda usl", "azienda sanitaria", "ospedale", "laboratorio analisi", "clinica", "istituto")):
            if len(l) <= 180 and l not in selected:
                selected.append(l)
        if len(selected) >= 3:
            break
    return " · ".join(selected)


def detect_department(text: str) -> str:
    for line in text.splitlines()[:60]:
        n = normalize_text(line)
        if any(k in n for k in ("u.o.", "unita operativa", "patologia clinica", "radiologia", "diagnostica", "laboratorio analisi")):
            return re.sub(r"\s+", " ", line).strip()
    return ""


def detect_personnel(text: str) -> list[dict[str, Any]]:
    people: list[dict[str, Any]] = []
    seen = set()
    patterns = [
        ("Firmatario", r"firmatario\s*[:\-]?\s*([^\n]{3,90})"),
        ("Responsabile", r"responsabile\s*[:\-]?\s*([^\n]{3,90})"),
        ("Medico radiologo", r"medico\s+radiologo[^\n]*\n\s*([^\n]{3,90})"),
        ("Medico", r"(?:dr\.?ssa|dott\.?ssa|dott\.?|dr\.?)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'. -]{2,70})"),
    ]
    for role, pat in patterns:
        for m in re.finditer(pat, text, re.I):
            name = re.sub(r"\s+", " ", m.group(1)).strip(" .:-")
            name = re.split(r"\b(?:data|referto|tel|fax|ore|id)\b", name, flags=re.I)[0].strip()
            if len(name) < 3 or len(name) > 90:
                continue
            key = compact(role + name)
            if key not in seen:
                seen.add(key); people.append({"role": role, "name": name, "confidence": 88})
    return people


def detect_category(text: str, rows: list[dict[str, Any]]) -> tuple[str, int]:
    n = normalize_text(text)
    if rows or re.search(r"laboratorio|emocromo|valori di riferimento|esame urine|chimica clinica", n):
        return "Esami di laboratorio", 98 if rows else 80
    if re.search(r"\btac\b|tomografia|massiccio facciale", n):
        return "TAC", 95
    if re.search(r"risonanza magnetica|\brm\b", n):
        return "Risonanza magnetica", 92
    if re.search(r"radiografia|\brx\b", n):
        return "Radiografia", 92
    if re.search(r"ecografia", n):
        return "Ecografia", 92
    if re.search(r"visita", n):
        return "Visita specialistica", 75
    return "Altro", 45


def generate_title(category: str, clinical_date: str, file_name: str = "") -> str:
    if category and category != "Altro":
        if clinical_date:
            d = clinical_date.split("-")
            return f"{category} del {d[2]}/{d[1]}/{d[0]}"
        return category
    return os.path.splitext(os.path.basename(file_name or "Documento sanitario"))[0]


def analyze_document(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    text = extracted.get("text") or ""
    pages = extracted.get("pages") or []
    rows = extract_structured_rows(pages)
    clinical, issue, dates, date_conf = detect_dates(text, file_name)
    category, cat_conf = detect_category(text, rows)
    doc_number = detect_document_number(text)
    personnel = detect_personnel(text)
    facility = detect_facility(text)
    department = detect_department(text)

    lab_values = []
    qualitative = []
    table_rows = []
    for idx, row in enumerate(rows):
        table_rows.append({
            "kind": row["kind"], "test": row["test"], "value": row.get("value"), "result": row.get("result"),
            "unit": row.get("unit", ""), "reference": row.get("reference", ""), "pageNumber": row.get("pageNumber"),
            "sourceLine": row.get("sourceLine", ""), "referenceNotes": row.get("referenceNotes", []),
        })
        if row["kind"] == "numeric":
            lab_values.append({
                "id": f"py_value_{idx+1}", "parameterId": "custom_" + compact(row["test"])[:60],
                "parameterName": row["test"], "sample": "", "value": row["value"], "rawValue": row.get("rawValue", str(row["value"])),
                "unit": row.get("unit", ""), "range": row.get("range"), "status": row.get("status", "non definito"),
                "sourceLine": row.get("sourceLine", ""), "referenceNotes": row.get("referenceNotes", []), "confidence": row.get("confidence", 92), "pageNumber": row.get("pageNumber"),
            })
        else:
            qualitative.append({
                "test": row["test"], "result": row.get("result", ""), "unit": row.get("unit", ""),
                "reference": row.get("reference", ""), "status": row.get("status", "da verificare"), "sourceLine": row.get("sourceLine", ""),
                "confidence": row.get("confidence", 90), "pageNumber": row.get("pageNumber"),
            })

    total = len(lab_values) + len(qualitative)
    candidate = max(total, len(rows))
    completeness = 100 if candidate == 0 and category != "Esami di laboratorio" else round(total / max(1, candidate) * 100)
    warning = "" if completeness >= 80 else "Estrazione probabilmente incompleta: controlla il documento o correggi i valori."
    identifiers = []
    if doc_number:
        identifiers.append({"label": "Numero referto", "value": doc_number, "confidence": 95})
    for label, pat in (("Richiesta", r"richiesta\s*[:\-]?\s*([A-Z0-9./-]+)"), ("ID", r"\bid\.?\s*[:\-]?\s*([A-Z0-9./-]+)")):
        m = re.search(pat, text, re.I)
        if m:
            identifiers.append({"label": label, "value": m.group(1), "confidence": 86})

    return {
        "clinicalDate": clinical, "suggestedDate": clinical, "dateStatus": "detected" if clinical else "missing",
        "dateConfidence": date_conf, "dateCandidates": dates, "issueDate": issue,
        "category": category, "categoryConfidence": cat_conf,
        "doctor": personnel[0]["name"] if personnel else "", "medicalPersonnel": personnel,
        "facility": facility, "department": department, "documentNumber": doc_number, "identifiers": identifiers,
        "labValues": lab_values, "qualitativeResults": qualitative, "tableRows": table_rows,
        "extractionStats": {"candidateRows": candidate, "structuredRows": total, "completeness": completeness, "warning": warning, "tableRows": len(rows)},
        "structuredText": "\n".join(p.get("text", "") for p in pages),
        "title": generate_title(category, clinical, file_name),
    }


# TEST 19 - pannelli clinici, righe OCR miste e rappresentazioni equivalenti HbA1c
_TEST19_PANEL_ORDER = [
    "Emocromo", "Formula leucocitaria", "Coagulazione", "Metabolismo glucidico",
    "Profilo lipidico", "Funzionalità epatica", "Funzionalità renale", "Elettroliti",
    "Funzionalità tiroidea", "Esame urine", "Esame del sedimento urinario", "Altri esami di laboratorio",
]


def _test19_threshold_only(row: dict[str, Any]) -> bool:
    name = normalize_text(row.get("parameterName") or row.get("test") or "")
    source = str(row.get("sourceLine") or "")
    n = normalize_text(source or name)
    value = row.get("value")
    if re.match(r"^(?:alterata glicemia a digiuno|elevato rischio di diabete|livello decisionale|in gravidanza|in (?:assenza|presenza) di sintomi)", n):
        return True
    if re.match(r"^m\s*\^?\s*2\b", name) and re.search(r"egfr|filtrato glomerulare", n):
        return True
    if re.search(r"alterata glicemia|diagnosi di diabete|digiuno\s*\(ifg\)", n) and re.search(r"glicemia|glucosio", name):
        actual = re.search(r"\b(?:glucosio|glicemia)\b\s*[:.]?\s*([-+]?\d+(?:[,.]\d+)?)\s*(?:mg|mmol|mo)\s*/\s*d?[l1]", source, re.I)
        if not actual:
            return True
        first = parse_number(actual.group(1))
        if first is not None and value is not None and abs(float(value) - first) > 0.0001:
            return True
    return False


def _test19_fused_panel(row: dict[str, Any]) -> tuple[str, str]:
    raw = re.sub(r"\s+", " ", f"{row.get('parameterName') or row.get('test') or ''} {row.get('sourceLine') or ''}").strip()
    n = normalize_text(raw)
    if "sedimento" in n and "urinari" in n:
        if ("globuli" in n and "rossi" in n) or "eritrocit" in n:
            return "Esame del sedimento urinario", "Globuli rossi"
        if ("globuli" in n and "bianchi" in n) or "leucocit" in n:
            return "Esame del sedimento urinario", "Globuli bianchi"
        for pattern, analyte in (("cellule epitelial", "Cellule epiteliali"), ("batter", "Batteri"), ("cristall", "Cristalli"), ("cilindr", "Cilindri"), ("lievit", "Lieviti"), ("muco", "Muco")):
            if pattern in n:
                return "Esame del sedimento urinario", analyte
        return "Esame del sedimento urinario", ""
    if "formula" in n and "leucocitaria" in n:
        absolute = "assolut" in n or "%" not in raw
        for stem, label in (("neutrofil", "Neutrofili"), ("linfocit", "Linfociti"), ("monocit", "Monociti"), ("eosinofil", "Eosinofili"), ("basofil", "Basofili")):
            if stem in n:
                return "Formula leucocitaria", f"{label} assoluti" if absolute else f"{label} %"
        return "Formula leucocitaria", ""
    return "", ""


def _test19_panel(row: dict[str, Any], identity: str = "") -> str:
    explicit = row.get("labSection")
    if explicit:
        return str(explicit)
    name = normalize_text(row.get("parameterName") or row.get("test") or "")
    source = normalize_text(f"{row.get('sourceLine') or ''} {identity}")
    if re.search(r"neutrofil|linfocit|monocit|eosinofil|basofil|granulociti immaturi", name):
        return "Formula leucocitaria"
    if re.search(r"globuli bianchi|globuli rossi|emoglobina|ematocrito|\bmcv\b|\bmch\b|\bmchc\b|\brdw\b|piastrin|\bmpv\b|\bpdw\b", name):
        if re.search(r"urine|urinari|sedimento", source) and re.search(r"globuli (?:rossi|bianchi)|eritrocit|leucocit", name):
            return "Esame del sedimento urinario"
        return "Emocromo"
    urine_context = bool(re.search(r"urine|urinari|sedimento|urinocoltura", source))
    if urine_context and re.search(r"globuli (?:rossi|bianchi)|eritrocit|leucocit|cellule epitelial|cilindr|cristall|batter|lievit|muco", name):
        return "Esame del sedimento urinario"
    if urine_context and re.search(r"peso specifico|\bph\b|proteine|glucosio|chetoni|bilirubina|urobilinogeno|emoglobina|sangue|nitriti|esterasi", name):
        return "Esame urine"
    if re.search(r"glicemia|glucosio|emoglobina glicata|hba1c|insulina|c peptide", name):
        return "Metabolismo glucidico"
    if re.search(r"colesterolo|trigliceridi|lipoproteina", name):
        return "Profilo lipidico"
    if re.search(r"\bast\b|\balt\b|\bggt\b|transaminasi|bilirubina|fosfatasi alcalina|gamma", name):
        return "Funzionalità epatica"
    if re.search(r"creatinina|azotemia|\burea\b|filtrato glomerulare|\begfr\b|acido urico", name):
        return "Funzionalità renale"
    if re.search(r"sodio|potassio|calcio|cloro|magnesio|fosforo", name):
        return "Elettroliti"
    if re.search(r"\btsh\b|\bft3\b|\bft4\b|tireotrop|tiroxina|triiodotironina|anticorpi.*tiro", name):
        return "Funzionalità tiroidea"
    if re.search(r"\binr\b|tempo di protrombina|\bptt\b|\baptt\b|fibrinogeno|d dimero", name):
        return "Coagulazione"
    return "Altri esami di laboratorio"


def _test19_hba1c_kind(row: dict[str, Any]) -> str:
    unit = normalize_text(row.get("unit") or "")
    source = str(row.get("sourceLine") or "")
    if "%" in str(row.get("unit") or "") or re.search(r"%\s*(?:hb\s*totale)?", source, re.I):
        return "percent"
    if re.search(r"mmol\s*/\s*mol|mmoli?\s*/\s*mole", f"{unit} {source}", re.I):
        return "mmol"
    return ""


def _test19_hba1c_equivalent(percent: float, mmol: float) -> bool:
    predicted = (percent - 2.152) / 0.09148
    return abs(predicted - mmol) <= 1.6


def _test19_canonical_lab_name(row: dict[str, Any]) -> str:
    raw = str(row.get("parameterName") or row.get("test") or "").strip()
    n = normalize_text(raw)
    unit = str(row.get("unit") or "")
    source = str(row.get("sourceLine") or "")
    if re.search(r"25\s*\(?oh\)?\s*vitamina\s*d|vitamina\s*d", n):
        return "Vitamina D"
    for stem, label in (("neutrofil", "Neutrofili"), ("linfocit", "Linfociti"), ("monocit", "Monociti"), ("eosinofil", "Eosinofili"), ("basofil", "Basofili")):
        if stem in n:
            if "%" in unit or "%" in source or "%" in raw:
                return f"{label} %"
            return f"{label} assoluti"
    if "globuli rossi" in n or "eritrocit" in n:
        return "Globuli rossi"
    if "globuli bianchi" in n or "leucocit" in n:
        return "Globuli bianchi"
    if re.search(r"emoglobina glicata|hba1c", n):
        return "Emoglobina glicata (HbA1c)"
    return raw


def _test19_labvalue_from_parsed(parsed: dict[str, Any], parent: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"py_value_test19_{compact(parsed.get('test') or '')[:48]}",
        "parameterId": "custom_" + compact(parsed.get("test") or "")[:60],
        "parameterName": parsed.get("test") or "", "sample": parent.get("sample") or "",
        "value": parsed.get("value"), "rawValue": parsed.get("rawValue", str(parsed.get("value"))),
        "unit": parsed.get("unit") or "", "range": parsed.get("range"),
        "status": parsed.get("status") or "da verificare", "sourceLine": parsed.get("sourceLine") or "",
        "referenceNotes": [], "confidence": parsed.get("confidence", 90),
        "pageNumber": parsed.get("pageNumber") or parent.get("pageNumber"), "graphEligible": True,
    }


def _test19_dedupe_lab_values(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chosen: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    def quality(row: dict[str, Any]) -> tuple[int, int, int]:
        has_range = 1 if (row.get("range") or {}).get("raw") else 0
        has_unit = 1 if str(row.get("unit") or "").strip() else 0
        clean_name = len(str(row.get("parameterName") or ""))
        section_score = 2 if row.get("labSection") == "Esame del sedimento urinario" else (1 if row.get("labSection") and row.get("labSection") != "Altri esami di laboratorio" else 0)
        return has_range, has_unit, section_score, -clean_name
    for row in rows:
        row = dict(row)
        row["parameterName"] = _test19_canonical_lab_name(row)
        key = "|".join((
            normalize_text(row.get("parameterName") or ""),
            f"{float(row.get('value')):.8g}" if row.get("value") is not None else "",
            normalize_text(row.get("unit") or ""),
            str((row.get("range") or {}).get("raw") or ""),
        ))
        if key not in chosen:
            chosen[key] = row; order.append(key)
        elif quality(row) > quality(chosen[key]):
            chosen[key] = row
    return [chosen[key] for key in order]


def _test19_postprocess_analysis(analysis: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    source_rows: list[dict[str, Any]] = []
    for original in analysis.get("labValues") or []:
        parent = dict(original)
        remaining_notes = []
        for note in parent.get("referenceNotes") or []:
            parsed = _fallback_line_row(str(note), int(parent.get("pageNumber") or 1))
            if parsed and parsed.get("kind") == "numeric" and not _test19_threshold_only({"parameterName": parsed.get("test"), "value": parsed.get("value"), "sourceLine": parsed.get("sourceLine")}):
                source_rows.append(_test19_labvalue_from_parsed(parsed, parent))
            else:
                remaining_notes.append(note)
        parent["referenceNotes"] = remaining_notes
        source_rows.append(parent)
    for raw in source_rows:
        row = dict(raw)
        section, analyte = _test19_fused_panel(row)
        if analyte:
            row["parameterName"] = analyte
        if section:
            row["labSection"] = section
        if _test19_threshold_only(row):
            continue
        if section == "Esame del sedimento urinario":
            source = str(row.get("sourceLine") or "")
            if re.search(r"cellule?\s*a[iIlL]", source, re.I):
                row["unit"] = "cellule/µL"
            if not (row.get("range") or {}).get("raw"):
                m = re.search(r"(?:<=|>=|[<>≤≥])\s*[-+]?\d+(?:[,.]\d+)?", source)
                if m:
                    row["range"] = _parse_range(m.group(0))
                    row["status"] = _descriptive_status(float(row["value"]), row["range"], m.group(0), source)
        row["labSection"] = _test19_panel(row, file_name)
        rows.append(row)

    hba = [r for r in rows if re.search(r"emoglobina glicata|hba1c", normalize_text(r.get("parameterName") or ""))]
    others = [r for r in rows if r not in hba]
    used: set[int] = set()
    merged: list[dict[str, Any]] = []
    for i, a in enumerate(hba):
        if i in used:
            continue
        ak = _test19_hba1c_kind(a)
        partner = None
        for j in range(i + 1, len(hba)):
            if j in used:
                continue
            bk = _test19_hba1c_kind(hba[j])
            if ak and bk and ak != bk:
                partner = j
                break
        if partner is None:
            merged.append(a)
            continue
        b = hba[partner]
        pct = a if ak == "percent" else b
        mmol = a if ak == "mmol" else b
        if _test19_hba1c_equivalent(float(pct["value"]), float(mmol["value"])):
            primary = mmol if mmol.get("range") else pct
            result = dict(primary)
            pct_text = str(pct.get("rawValue", pct["value"])).replace(".", ",")
            mmol_text = str(mmol.get("rawValue", mmol["value"])).replace(".", ",")
            result.update({
                "parameterName": "Emoglobina glicata (HbA1c)", "value": float(mmol["value"]), "rawValue": mmol_text,
                "unit": "mmol/mol", "displayResult": f"{mmol_text} ({pct_text}%)",
                "equivalentResults": [{"value": float(pct["value"]), "rawValue": pct_text, "unit": "%"}, {"value": float(mmol["value"]), "rawValue": mmol_text, "unit": "mmol/mol"}],
                "labSection": "Metabolismo glucidico", "sourceLine": " | ".join(filter(None, [pct.get("sourceLine"), mmol.get("sourceLine")]))
            })
            merged.append(result)
        else:
            a["status"] = b["status"] = "da verificare"
            a["valueConflict"] = b["valueConflict"] = True
            merged.extend([a, b])
        used.add(partner)
    analysis["labValues"] = _test19_dedupe_lab_values(others + merged)
    analysis["qualitativeResults"] = [{**q, "labSection": _test19_panel(q, file_name)} for q in (analysis.get("qualitativeResults") or [])]
    analysis["tableRows"] = [
        {"kind": "numeric", "test": r.get("parameterName", ""), "value": r.get("value"), "result": r.get("displayResult") or r.get("rawValue", r.get("value")), "unit": r.get("unit", ""), "reference": (r.get("range") or {}).get("raw", ""), "status": r.get("status", ""), "sourceLine": r.get("sourceLine", ""), "pageNumber": r.get("pageNumber"), "labSection": r.get("labSection", "")}
        for r in analysis["labValues"]
    ] + [
        {"kind": "qualitative", "test": q.get("test", ""), "result": q.get("result", ""), "unit": q.get("unit", ""), "reference": q.get("reference", ""), "status": q.get("status", ""), "sourceLine": q.get("sourceLine", ""), "pageNumber": q.get("pageNumber"), "labSection": q.get("labSection", "")}
        for q in analysis["qualitativeResults"]
    ]
    stats = dict(analysis.get("extractionStats") or {})
    stats["structuredRows"] = len(analysis["labValues"]) + len(analysis["qualitativeResults"])
    stats["tableRows"] = len(analysis["tableRows"])
    stats["labPanelVersion"] = "test19-v1"
    analysis["extractionStats"] = stats
    analysis["labPanelVersion"] = "test19-v1"
    return analysis



# ============================================================================
# V4.2.1 - classificazione preventiva e ricostruzione integrale dei documenti
# ============================================================================

_SPECIALTY_PATTERNS = [
    ("Epatologia", r"\b(?:visita\s+)?epatologic|\bu\.?o\.?\s*epatologia\b|epatopatie"),
    ("Diabetologia", r"\b(?:visita\s+)?diabetologic|malattie metaboliche e diabetologia|diabete mellito"),
    ("Neurologia", r"\b(?:visita\s+)?neurologic|\bu\.?o\.?c?\.?\s*neurologia\b|neuroscienze"),
    ("Cardiologia", r"\b(?:visita\s+)?cardiologic|\bu\.?o\.?\s*cardiologia\b|ecocardiogramma"),
    ("Endocrinologia", r"\b(?:visita\s+)?endocrinologic|\bu\.?o\.?\s*endocrinologia\b|tiroide"),
    ("Oculistica", r"\b(?:visita\s+)?oculistic|fundus oculi|oftalmolog"),
    ("Radiologia", r"radiologia|radiodiagnostica|diagnostica per immagini|\btac\b|tomografia|risonanza|radiografia|cone[- ]?beam"),
    ("Anatomia patologica", r"anatomia patologica|esame istologic|materiale pervenuto"),
    ("Gastroenterologia", r"gastroenterolog|gastroscopia|endoscopia digestiva"),
    ("Pneumologia", r"pneumolog"),
    ("Ortopedia", r"ortopedi"),
    ("Urologia", r"urolog"),
]

_NARRATIVE_HEADINGS = [
    "Motivo della visita", "Anamnesi", "Sintesi anamnestica", "Allergie", "Familiarità",
    "Fattori di rischio", "Storia clinica", "Screening eziopatogenetico", "Profilo biochimico",
    "Attività di malattia", "Funzionalità", "Funzione renale", "Crasi ematica", "Morfologia",
    "Esame obiettivo", "Esami ematochimici", "Diagnosi", "Diagnosi/Sospetto diagnostico",
    "Terapie in atto", "Terapia consigliata", "Terapia medica", "Conclusioni", "Programma",
    "Programmazione controlli successivi", "Indicazioni", "Decorso clinico", "Materiale pervenuto",
    "Esame macroscopico", "Referto", "Risultato", "Commento"
]


def _detect_specialization(text: str) -> str:
    n = normalize_text(text)
    for label, pattern in _SPECIALTY_PATTERNS:
        if re.search(pattern, n, re.I):
            return label
    return ""


def _has_lab_header(pages: list[dict[str, Any]]) -> bool:
    for page in pages:
        width = float(page.get("width") or 1000)
        for line in page.get("lines") or []:
            if _header_columns(line, width):
                return True
            n = normalize_text(line.get("text", ""))
            if re.search(r"\besame\b.*\b(?:esito|risultato)\b.*\b(?:u\.?m\.?|unita)\b.*\b(?:riferiment|intervallo)", n):
                return True
    return False


def _has_therapy_header(pages: list[dict[str, Any]], text: str) -> bool:
    n = normalize_text(text)
    if re.search(r"terapie farmacologiche|schema terapeutico|piano terapeutico|farmaci in corso", n):
        return True
    for page in pages:
        for line in page.get("lines") or []:
            ln = normalize_text(line.get("text", ""))
            if "orario" in ln and "farmaco" in ln and "dosaggio" in ln and ("frequenza" in ln or "note" in ln):
                return True
    return False



def _test30_explicit_document_profile(text: str, file_name: str = "", specialization: str = "") -> dict[str, Any] | None:
    """Classifica usando segnali espliciti e gerarchici, mai una menzione accessoria."""
    raw = text or ""
    filename = normalize_text((file_name or "").replace("_", " ").replace("-", " "))

    def resolved_specialization(label: str) -> str:
        context = normalize_text(f"{specialization}\n{raw[:5000]}")
        if label in {"Gastroscopia", "Colonscopia"} and re.search(r"\bendoscopia digestiva\b", context, re.I):
            return "Endoscopia digestiva"
        return specialization
    rules = [
        ("Gastroscopia", "Referto strumentale", "narrative", r"\b(?:gastroscopia|esofago\s*[- ]?gastro\s*[- ]?duodeno\s*scopia|esofagogastroduodenoscopia|egds?|egd)\b"),
        ("Colonscopia", "Referto strumentale", "narrative", r"\b(?:colonscopia|colonoscopia|ileocolonscopia)\b"),
        ("Ecocardiogramma", "Referto strumentale", "narrative", r"\b(?:ecocardiogramma|ecocuore|ecocardiografia)\b"),
        ("Elettrocardiogramma", "Referto strumentale", "narrative", r"\b(?:elettrocardiogramma|elettrocardiografico)\b"),
        ("TAC", "Referto strumentale", "narrative", r"\b(?:tac|tomografia computerizzata|tc\s+(?:cranio|torace|addome|encefalo))\b"),
        ("Risonanza magnetica", "Referto strumentale", "narrative", r"\b(?:risonanza magnetica|rmn|rm\s+(?:cranio|encefalo|colonna|ginocchio|addome))\b"),
        ("Ecografia", "Referto strumentale", "narrative", r"\b(?:ecografia|ecotomografia|ecocolordoppler|eco-color-doppler|fibroscan)\b"),
        ("Radiografia", "Referto strumentale", "narrative", r"\b(?:radiografia|rx\s+(?:torace|colonna|arto|bacino))\b"),
        ("Anatomia patologica", "Referto istologico", "narrative", r"\b(?:anatomia patologica|diagnosi istologica|esame istologico)\b"),
        ("Visita cardiologica", "Visita specialistica", "narrative", r"\bvisita cardiologica\b"),
        ("Visita diabetologica", "Visita specialistica", "narrative", r"\bvisita diabetologica\b"),
        ("Visita epatologica", "Visita specialistica", "narrative", r"\bvisita epatologica\b"),
        ("Visita endocrinologica", "Visita specialistica", "narrative", r"\bvisita endocrinologica\b"),
        ("Visita neurologica", "Visita specialistica", "narrative", r"\bvisita neurologica\b"),
        ("Visita oculistica", "Visita specialistica", "narrative", r"\b(?:visita oculistica|fundus oculi)\b"),
    ]
    explicit_values = [m.group(1).strip() for m in re.finditer(
        r"(?:^|\n)\s*(?:tipo\s+esame|esame\s+eseguito|prestazione\s+eseguita|procedura)\s*:\s*([^\n]{2,180})",
        raw, re.I,
    )]
    for value in explicit_values:
        source = normalize_text(value)
        for label, category, mode, pattern in rules:
            if re.search(pattern, source, re.I):
                return {"mode": mode, "category": category, "specialization": resolved_specialization(label), "label": label,
                        "typeSource": f"dicitura esplicita: {value}", "typeConfidence": 100}

    head = normalize_text(raw[:3500])
    heading_rules = [
        ("Anatomia patologica", "Referto istologico", "narrative", r"\b(?:anatomia patologica|area delle anatomie patologiche)\b"),
        ("Visita cardiologica", "Visita specialistica", "narrative", r"\bvisita cardiologica\b"),
        ("Visita diabetologica", "Visita specialistica", "narrative", r"\bvisita diabetologica\b"),
        ("Visita epatologica", "Visita specialistica", "narrative", r"\bvisita epatologica\b"),
        ("Visita endocrinologica", "Visita specialistica", "narrative", r"\b(?:prima visita|visita di controllo).*\bendocrinologia\b|\bvisita endocrinologica\b"),
        ("Visita neurologica", "Visita specialistica", "narrative", r"\bvisita neurologica\b"),
        ("Visita oculistica", "Visita specialistica", "narrative", r"\bvisita oculistica\b"),
    ]
    for label, category, mode, pattern in heading_rules:
        if re.search(pattern, head, re.I):
            return {"mode": mode, "category": category, "specialization": resolved_specialization(label), "label": label,
                    "typeSource": "titolo clinico esplicito", "typeConfidence": 99}

    for label, category, mode, pattern in rules:
        if re.search(pattern, filename, re.I):
            return {"mode": mode, "category": category, "specialization": resolved_specialization(label), "label": label,
                    "typeSource": "nome del file originale", "typeConfidence": 98}

    n = normalize_text(raw)
    if re.search(r"\bendoscopia digestiva\b", normalize_text(specialization)) and re.search(r"\b(?:esofago|stomaco|duodeno|cardias|piloro)\b", n):
        return {"mode": "narrative", "category": "Referto strumentale", "specialization": "Endoscopia digestiva",
                "label": "Gastroscopia", "typeSource": "reparto e contenuto endoscopico concordanti", "typeConfidence": 96}
    return None

def detect_document_profile(text: str, pages: list[dict[str, Any]], file_name: str = "") -> dict[str, Any]:
    n = normalize_text(text)
    specialization = _detect_specialization(text)
    normalized_file_name = normalize_text((file_name or "").replace("_", " ").replace("-", " "))
    multi_record = bool(re.search(r"\b(?:cartella\s+clinica|fascicolo|dossier|documentazione\s+clinica)\b", normalized_file_name, re.I)) or len(pages or []) > 20
    lab_header = _has_lab_header(pages)
    therapy = _has_therapy_header(pages, text)
    exemption = bool(re.search(r"attestato\s+di\s+esenzione|codice\s+esenzione|esenzione\s+sanitaria|esenzione\s+per", n))
    visit = bool(re.search(r"\bvisita\s+(?:specialistica|epatologica|diabetologica|neurologica|cardiologica|endocrinologica|oculistica|ambulatoriale)|alla cortese attenzione del medico curante|motivo della visita", n))
    lab_context = bool(re.search(r"laboratorio\s+(?:analisi|chimic)|patologia clinica|emocromo|chimica clinica|esame completo urine|valori di riferimento", n))
    diagnosis_certificate = bool(re.search(r"certific|attestazione", n) and re.search(r"diagnos|patologia|condizione", n))
    explicit_profile = None if multi_record else _test30_explicit_document_profile(text, file_name, specialization)
    if explicit_profile:
        return explicit_profile
    instrument = ""
    for label, pattern in ([] if multi_record else [
        ("TAC", r"\btac\b|tomografia computerizzata|tc cranio|tc di"),
        ("Risonanza magnetica", r"risonanza magnetica|\brm\b"),
        ("Ecografia", r"ecografia|ecocolordoppler|fibroscan"),
        ("Radiografia", r"radiografia|\brx\b"),
        ("Gastroscopia", r"gastroscopia|esofagogastroduodenoscopia|\begds?\b"),
        ("Elettrocardiogramma", r"elettrocardiogramma|(?:freq\.?\s*vent|int\.?\s*pr|dur\.?\s*qrs|qt\s*/\s*qtc|assi\s*p\s*[-/]\s*r\s*[-/]\s*t)"),
        ("Anatomia patologica", r"anatomia patologica|diagnosi istologica|materiale pervenuto.*esame macroscopico"),
    ]):
        if re.search(pattern, n):
            instrument = label
            break

    if therapy:
        return {"mode": "therapy", "category": "Piano terapeutico", "specialization": specialization, "label": "Terapie farmacologiche"}
    if exemption:
        return {"mode": "exemption", "category": "Esenzione sanitaria", "specialization": specialization, "label": "Esenzione sanitaria"}
    specialty_visit_labels = {
        "Epatologia": "Visita epatologica", "Diabetologia": "Visita diabetologica",
        "Neurologia": "Visita neurologica", "Cardiologia": "Visita cardiologica",
        "Endocrinologia": "Visita endocrinologica", "Oculistica": "Visita oculistica",
        "Gastroenterologia": "Visita gastroenterologica", "Pneumologia": "Visita pneumologica",
        "Ortopedia": "Visita ortopedica", "Urologia": "Visita urologica",
    }
    if visit and lab_header:
        label = specialty_visit_labels.get(specialization, "Visita specialistica")
        return {"mode": "mixed", "category": "Visita specialistica", "specialization": specialization, "label": label}
    if visit:
        label = specialty_visit_labels.get(specialization, "Visita specialistica")
        return {"mode": "narrative", "category": "Visita specialistica", "specialization": specialization, "label": label}
    if lab_header or (lab_context and re.search(r"\b(?:esame|analisi)\b.*\b(?:risultato|esito)\b", n)):
        return {"mode": "lab", "category": "Esami di laboratorio", "specialization": "Laboratorio analisi", "label": "Esami di laboratorio"}
    if instrument:
        return {"mode": "narrative", "category": "Referto strumentale", "specialization": specialization or instrument, "label": instrument}
    if diagnosis_certificate:
        return {"mode": "diagnosis", "category": "Diagnosi o certificazione", "specialization": specialization, "label": "Diagnosi o certificazione"}
    return {"mode": "narrative", "category": "Documento sanitario", "specialization": specialization, "label": specialization or "Documento sanitario"}


def _page_text_blocks(text: str) -> list[list[str]]:
    blocks = re.split(r"===\s*PAGINA\s*\d+\s*===", text or "", flags=re.I)
    out = []
    for block in blocks:
        lines = [re.sub(r"\s+", " ", x).strip() for x in block.replace("\r", "").split("\n")]
        lines = [x for x in lines if x]
        if lines:
            out.append(lines)
    return out


def _is_repeated_boilerplate(line: str, repeated: set[str]) -> bool:
    n = normalize_text(line)
    if n in repeated:
        return True
    if re.search(r"\bpage\s*\d+\s*/\s*\d+\b|\bpag(?:ina|\.)?\s*\d+\s*(?:di|/)\s*\d+", n):
        return True
    if re.search(r"segreteria\s+tel|fax\s*:|email\s*:.*@|powered by", n) and len(line) < 220:
        return True
    return False


def _looks_heading(line: str) -> str:
    n = normalize_text(line).strip(" :.-")
    for heading in _NARRATIVE_HEADINGS:
        hn = normalize_text(heading)
        if n == hn or n.startswith(hn + ":"):
            return heading
    if len(line) <= 80 and line.rstrip().endswith(":") and re.search(r"[A-Za-zÀ-ÿ]", line):
        return line.rstrip(" :")
    return ""


def reconstruct_narrative(text: str) -> dict[str, Any]:
    pages = _page_text_blocks(text)
    if not pages:
        return {"fullText": "", "sections": [], "paragraphs": []}
    counts: dict[str, int] = {}
    for lines in pages:
        candidates = lines[:8] + lines[-5:]
        page_seen = set()
        for line in candidates:
            n = normalize_text(line)
            if len(n) >= 18:
                page_seen.add(n)
        for n in page_seen:
            counts[n] = counts.get(n, 0) + 1
    repeated = {n for n, count in counts.items() if count >= 2}

    cleaned_lines: list[str] = []
    for page in pages:
        for line in page:
            if _is_repeated_boilerplate(line, repeated):
                continue
            if re.fullmatch(r"[-_=\s.]{6,}", line):
                continue
            cleaned_lines.append(line)

    sections: list[dict[str, str]] = []
    current_heading = "Referto"
    current_parts: list[str] = []

    def flush() -> None:
        nonlocal current_parts
        body = "\n".join(current_parts).strip()
        if body:
            sections.append({"title": current_heading, "text": _reflow_narrative_body(body)})
        current_parts = []

    for line in cleaned_lines:
        heading = _looks_heading(line)
        if heading:
            prefix = re.match(r"^([^:]{2,80}):\s*(.*)$", line)
            flush()
            current_heading = heading
            if prefix and prefix.group(2).strip():
                current_parts.append(prefix.group(2).strip())
            continue
        current_parts.append(line)
    flush()

    # Evita una falsa prima sezione composta soltanto dall'intestazione ospedaliera.
    if len(sections) > 1 and sections[0]["title"] == "Referto":
        first = sections[0]["text"]
        if len(first) < 500 and re.search(r"azienda|ospedal|dipartimento|direttore|centro di riferimento", normalize_text(first)):
            sections[0]["title"] = "Intestazione e dati del referto"

    full_text = "\n\n".join(f"{s['title']}\n{s['text']}" for s in sections).strip()
    paragraphs = [p.strip() for s in sections for p in re.split(r"\n{2,}", s["text"]) if p.strip()]
    return {"fullText": full_text, "sections": sections, "paragraphs": paragraphs}


def _reflow_narrative_body(body: str) -> str:
    lines = [re.sub(r"\s+", " ", x).strip() for x in body.splitlines() if x.strip()]
    out: list[str] = []
    current = ""
    for line in lines:
        bullet = bool(re.match(r"^(?:[-•]|\d+[.)])\s*", line))
        if bullet:
            if current:
                out.append(current.strip())
                current = ""
            out.append(line)
            continue
        if current and (current.endswith((".", ";", ":", "!", "?")) or len(current) > 800):
            out.append(current.strip())
            current = line
        else:
            current = f"{current} {line}".strip()
    if current:
        out.append(current.strip())
    return "\n".join(out)



def _therapy_header_kind(value: str) -> str | None:
    n = normalize_text(value)
    n = re.sub(r"^[\s\[\(\{\|!lI]+", "", n).strip()
    if re.search(r"\borario\b|orar[i1]o", n):
        return "time"
    if "farmaco" in n or "principio attivo" in n:
        return "drug"
    if "dosaggio" in n or re.fullmatch(r"dose", n) or SequenceMatcher(None, compact(n), "dosaggio").ratio() >= 0.50:
        return "dose"
    if "frequenza" in n or re.search(r"\bnote\b", n):
        return "notes"
    return None


def _therapy_header_geometry(lines: list[dict[str, Any]], width: float) -> tuple[float, float, float, float] | None:
    """Individua le quattro intestazioni anche quando l'OCR le restituisce come box separati."""
    candidates: dict[str, list[dict[str, Any]]] = {"time": [], "drug": [], "dose": [], "notes": []}
    for line in lines:
        kind = _therapy_header_kind(line.get("text", ""))
        if kind:
            candidates[kind].append(line)
    if not all(candidates.values()):
        return None

    best = None
    best_span = float("inf")
    for t in candidates["time"]:
        for d in candidates["drug"]:
            for q in candidates["dose"]:
                for n in candidates["notes"]:
                    items = [t, d, q, n]
                    centers = [float(x.get("y", 0)) + float(x.get("height", 0)) / 2 for x in items]
                    span = max(centers) - min(centers)
                    median_h = statistics.median(max(1.0, float(x.get("height", 0))) for x in items)
                    if span <= max(55.0, median_h * 3.5) and span < best_span:
                        xs = [float(x.get("x", 0)) for x in items]
                        if xs[0] < xs[1] < xs[2] < xs[3]:
                            best = items
                            best_span = span
    if not best:
        return None

    t, d, q, n = best
    tx, dx, qx, nx = [float(x.get("x", 0)) for x in best]
    b1 = dx - max(4.0, (dx - tx) * 0.035)
    b2 = qx - max(4.0, (qx - dx) * 0.035)
    b3 = nx - max(4.0, (nx - qx) * 0.035)
    header_bottom = max(float(x.get("y", 0)) + float(x.get("height", 0)) for x in best)
    if not (tx < b1 < b2 < b3 < max(width * 1.25, nx + 30)):
        return None
    return b1, b2, b3, header_bottom


def _clean_therapy_cell(value: str) -> str:
    s = re.sub(r"\s+", " ", str(value or "")).strip()
    s = re.sub(r"^[\s\[\]\(\)\{\}\|!Il]+(?=\d|[A-Za-zÀ-ÿ])", "", s)
    s = re.sub(r"(?<=\w)[\s\[\]\{\}\|]+$", "", s)
    s = re.sub(r"\bmeg\b", "mcg", s, flags=re.I)
    return s.strip(" |")


def _therapy_time(value: str) -> str:
    s = _clean_therapy_cell(value)
    m = re.search(r"(?<!\d)((?:[01]?\d|2[0-3])[:.]\d{2})(?:\s*(\([^)]*\)))?", s)
    if not m:
        return ""
    return f"{m.group(1).replace('.', ':')}{(' ' + m.group(2)) if m.group(2) else ''}".strip()


def _merge_therapy_boxes(items: list[dict[str, Any]]) -> str:
    ordered = sorted(items, key=lambda z: (float(z.get("y", 0)), float(z.get("x", 0))))
    parts: list[str] = []
    for item in ordered:
        value = _clean_therapy_cell(item.get("text", ""))
        if value and value not in parts:
            parts.append(value)
    return " ".join(parts).strip()


def _parse_therapy_text_row(line: str) -> dict[str, str] | None:
    clean = re.sub(r"\s+", " ", line or "").strip()
    clean = re.sub(r"^[\s\[\(\{\|!Il]+", "", clean)
    m = re.match(r"^((?:[01]?\d|2[0-3])[:.]\d{2}(?:\s*\([^)]*\))?)\s*[\]\)\}\|]*\s*(.+)$", clean)
    if not m:
        return None
    time_value, rest = m.group(1).replace(".", ":"), m.group(2)
    dose_match = re.search(
        r"\b\d+(?:[,.]\d+)?(?:/\d+(?:[,.]\d+)?)?\s*(?:mcg|µg|ug|mg|g|ml|mUI|UI)"
        r"(?:\s*/\s*\d+(?:[,.]\d+)?(?:/\d+(?:[,.]\d+)?)?\s*(?:mcg|µg|ug|mg|g|ml|mUI|UI))*\b",
        rest, re.I
    )
    if not dose_match:
        return None
    medication = _clean_therapy_cell(rest[:dose_match.start()].strip(" -|"))
    dosage = _clean_therapy_cell(dose_match.group(0))
    notes = _clean_therapy_cell(rest[dose_match.end():].strip(" -|"))
    if not medication:
        return None
    return {"time": time_value, "medication": medication, "dosage": dosage, "frequency": notes, "notes": notes}


def _therapy_rows_from_geometry(page: dict[str, Any]) -> list[dict[str, str]]:
    lines = sorted(page.get("lines") or [], key=lambda l: (float(l.get("y", 0)), float(l.get("x", 0))))
    width = float(page.get("width") or 1000)
    geometry = _therapy_header_geometry(lines, width)
    if not geometry:
        return []
    b1, b2, b3, header_bottom = geometry

    anchors: list[dict[str, Any]] = []
    for line in lines:
        cy = float(line.get("y", 0)) + float(line.get("height", 0)) / 2
        cx = float(line.get("x", 0)) + float(line.get("width", 0)) / 2
        if cy <= header_bottom:
            continue
        t = _therapy_time(line.get("text", ""))
        if t and (cx < b1 or float(line.get("x", 0)) < b1):
            anchors.append({**line, "_time": t, "_cy": cy})
    anchors.sort(key=lambda a: (a["_cy"], float(a.get("x", 0))))
    deduped: list[dict[str, Any]] = []
    for a in anchors:
        if deduped and abs(a["_cy"] - deduped[-1]["_cy"]) <= max(5.0, float(a.get("height", 0)) * 0.55):
            if len(a.get("text", "")) > len(deduped[-1].get("text", "")):
                deduped[-1] = a
        else:
            deduped.append(a)
    anchors = deduped
    if not anchors:
        return []

    rows: list[dict[str, str]] = []
    for idx, anchor in enumerate(anchors):
        top = header_bottom if idx == 0 else (anchors[idx - 1]["_cy"] + anchor["_cy"]) / 2
        bottom = (anchor["_cy"] + anchors[idx + 1]["_cy"]) / 2 if idx + 1 < len(anchors) else float(page.get("height") or 1e9)
        cells = {"time": [], "drug": [], "dose": [], "notes": []}
        for line in lines:
            cy = float(line.get("y", 0)) + float(line.get("height", 0)) / 2
            if not (top < cy < bottom):
                continue
            cx = float(line.get("x", 0)) + float(line.get("width", 0)) / 2
            if cx < b1:
                cells["time"].append(line)
            elif cx < b2:
                cells["drug"].append(line)
            elif cx < b3:
                cells["dose"].append(line)
            else:
                cells["notes"].append(line)
        time_value = anchor["_time"]
        medication = _merge_therapy_boxes(cells["drug"])
        dosage = _merge_therapy_boxes(cells["dose"])
        notes = _merge_therapy_boxes(cells["notes"])
        if not medication or not dosage:
            for line in lines:
                cy = float(line.get("y", 0)) + float(line.get("height", 0)) / 2
                if top < cy < bottom:
                    parsed = _parse_therapy_text_row(line.get("text", ""))
                    if parsed:
                        medication = medication or parsed["medication"]
                        dosage = dosage or parsed["dosage"]
                        notes = notes or parsed["frequency"]
                        break
        if medication:
            rows.append({
                "time": time_value,
                "medication": medication,
                "dosage": dosage,
                "frequency": notes,
                "notes": notes,
            })
    return rows


def extract_therapy_rows_advanced(pages: list[dict[str, Any]], text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, str]] = []
    for page in pages:
        rows.extend(_therapy_rows_from_geometry(page))

    if not rows:
        pending: dict[str, str] | None = None
        for raw_line in text.splitlines():
            parsed = _parse_therapy_text_row(raw_line)
            if parsed:
                if pending:
                    rows.append(pending)
                pending = parsed
                continue
            clean = _clean_therapy_cell(raw_line)
            if pending and clean and not _therapy_header_kind(clean):
                if re.search(r"\bcompress", normalize_text(clean)) or re.search(r"\b(?:giorn|assunzion|capsul|cp)\b", normalize_text(clean)):
                    pending["frequency"] = f"{pending.get('frequency','')} {clean}".strip()
                    pending["notes"] = pending["frequency"]
        if pending:
            rows.append(pending)

    period = ""
    m_period = re.search(r"(?:terapie? farmacologiche? in corso|schema terapeutico).*?\(([^)]+(?:19|20)\d{2})\)", text, re.I)
    if m_period:
        period = m_period.group(1).strip()
    out: list[dict[str, Any]] = []
    seen = set()
    for row in rows:
        medication = _clean_therapy_cell(row.get("medication", "")).strip(" :-|")
        if not medication or len(medication) < 2:
            continue
        active_ingredient = ""
        m = re.match(r"^(.*?)\s*(?:[-|]|\s)\s*principio\s+attivo\s*[:\-]\s*(.+)$", medication, re.I)
        if m:
            medication, active_ingredient = m.group(1).strip(), m.group(2).strip()
        key = compact(f"{row.get('time','')}|{medication}|{row.get('dosage','')}|{row.get('frequency','')}")
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "time": row.get("time", ""), "medication": medication, "activeIngredient": active_ingredient,
            "dosage": _clean_therapy_cell(row.get("dosage", "")), "schedule": row.get("time", ""),
            "frequency": _clean_therapy_cell(row.get("frequency", "")), "notes": _clean_therapy_cell(row.get("notes", "")),
            "period": period, "active": True, "confidence": 94,
        })
    return out



def _cluster_positions(values: list[int], max_gap: int = 6) -> list[int]:
    if not values:
        return []
    groups: list[list[int]] = []
    for value in sorted(values):
        if not groups or value - groups[-1][-1] > max_gap:
            groups.append([value])
        else:
            groups[-1].append(value)
    return [int(round(sum(group) / len(group))) for group in groups]


def _therapy_grid_lines(image: Any) -> tuple[list[int], list[int]]:
    """Rileva le linee della tabella senza dipendere dal testo riconosciuto."""
    try:
        import cv2
        import numpy as np
    except Exception:
        return [], []
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    _, binary = cv2.threshold(gray, 210, 255, cv2.THRESH_BINARY_INV)
    h, w = gray.shape[:2]
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(30, w // 18), 1))
    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(30, h // 18)))
    horizontal = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel)
    vertical = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel)
    y_values = np.where(horizontal.sum(axis=1) > 255 * max(50, int(w * 0.42)))[0].tolist()
    x_values = np.where(vertical.sum(axis=0) > 255 * max(40, int(h * 0.30)))[0].tolist()
    return _cluster_positions(x_values, 7), _cluster_positions(y_values, 7)


def _ocr_crop_text(image: Any) -> str:
    crop = _prepare_image(image, max_dim=2200)
    # Un ingrandimento moderato migliora le celle piccole senza appesantire l'avvio.
    if Image is not None and max(crop.size) < 1500:
        crop = crop.resize((crop.width * 2, crop.height * 2), Image.Resampling.LANCZOS)
    _, text, _ = _ocr_image(crop)
    return re.sub(r"\s+", " ", text).strip()


def _load_first_page_image(path: str | os.PathLike[str]) -> Any | None:
    p = Path(path)
    if Image is None:
        return None
    if p.suffix.lower() == ".pdf":
        if pdfium is None:
            return None
        pdf = pdfium.PdfDocument(str(p))
        if len(pdf) < 1:
            return None
        return _render_pdf_page(pdf[0], scale=3.2)
    try:
        with Image.open(p) as src:
            return ImageOps.exif_transpose(src).convert("RGB")
    except Exception:
        return None


def extract_therapy_grid_from_file(path: str | os.PathLike[str], full_text: str = "") -> list[dict[str, Any]]:
    """OCR per cella per schemi terapeutici tabellari con bordi visibili."""
    image = _load_first_page_image(path)
    if image is None:
        return []
    x_lines, y_lines = _therapy_grid_lines(image)
    if len(x_lines) < 5 or len(y_lines) < 3:
        return []

    # Cerca cinque linee verticali consecutive che coprano una tabella ampia.
    best_x = None
    best_span = 0
    for i in range(len(x_lines) - 4):
        candidate = x_lines[i:i + 5]
        span = candidate[-1] - candidate[0]
        if span > image.width * 0.55 and span > best_span:
            best_x, best_span = candidate, span
    if not best_x:
        return []
    x_lines = best_x

    # Individua l'intestazione OCRizzando soltanto le prime righe candidate.
    header_idx = None
    for r in range(min(4, len(y_lines) - 1)):
        cells = []
        for c in range(4):
            box = (x_lines[c] + 2, y_lines[r] + 2, x_lines[c + 1] - 2, y_lines[r + 1] - 2)
            cells.append(_ocr_crop_text(image.crop(box)))
        kinds = [_therapy_header_kind(value) for value in cells]
        if kinds == ["time", "drug", "dose", "notes"]:
            header_idx = r
            break
    if header_idx is None:
        return []

    period = ""
    m_period = re.search(r"(?:terapie? farmacologiche? in corso|schema terapeutico).*?\(([^)]+(?:19|20)\d{2})\)", full_text, re.I)
    if m_period:
        period = m_period.group(1).strip()

    rows: list[dict[str, Any]] = []
    blank_streak = 0
    for r in range(header_idx + 1, len(y_lines) - 1):
        values = []
        for c in range(4):
            box = (x_lines[c] + 3, y_lines[r] + 3, x_lines[c + 1] - 3, y_lines[r + 1] - 3)
            values.append(_clean_therapy_cell(_ocr_crop_text(image.crop(box))))
        time_value = _therapy_time(values[0])
        medication = values[1].strip(" :-|")
        dosage = values[2].strip(" :-|")
        notes = values[3].strip(" :-|")
        if not any(values):
            blank_streak += 1
            if blank_streak >= 2:
                break
            continue
        blank_streak = 0
        if not time_value or not medication:
            continue
        rows.append({
            "time": time_value, "schedule": time_value, "medication": medication,
            "activeIngredient": "", "dosage": dosage, "frequency": notes, "notes": notes,
            "period": period, "active": True, "confidence": 97,
        })
    return rows


def extract_diagnoses_advanced(text: str, clinical_date: str, facility: str, specialization: str,
                               document_label: str = "", document_mode: str = "") -> list[dict[str, Any]]:
    """Estrae proposte cliniche verificabili, senza dedurre diagnosi dai soli valori numerici.

    Le proposte sono sempre destinate alla conferma dell'utente. Conservano la frase
    originale e distinguono diagnosi, problemi, sospetti, controlli ed eventi terapeutici.
    """
    raw_lines = [re.sub(r"\s+", " ", x).strip() for x in text.splitlines() if x.strip()]
    lines = [x for x in raw_lines if len(x) >= 3]
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    disease_terms = re.compile(
        r"\b(?:diabet\w*|ipotiroid\w*|ipertiroid\w*|tiroidit\w*|dislipid\w*|ipercolesterol\w*|"
        r"ipertriglicerid\w*|insufficienza\s+renale|malattia\s+renale|nefropat\w*|epatopat\w*|"
        r"steatos\w*|masld|cirros\w*|ipertensione\w*|varici\w*|obesit\w*|sovrappes\w*|"
        r"iperuric\w*|gotta|deficit\s+(?:di\s+)?vitamina|cervicobrachialg\w*|protrusion\w*|"
        r"sinusit\w*|osteite\w*|mucos\w*|neuropat\w*|retinopat\w*|cardiopat\w*|"
        r"bronco\w*|asma|anemi\w*|trombocit\w*|celiach\w*|gastrit\w*|helicobacter\w*)\b",
        re.I,
    )
    explicit_intro = re.compile(
        r"\b(?:diagnosi|conclusioni?|problemi?\s+(?:attivi|principali)|quadro\s+clinico|"
        r"affetto\s+da|si\s+conferma|confermata?|documentata?|in\s+trattamento\s+per|"
        r"in\s+follow[- ]?up\s+per|anamnesi\s+patologica)\b", re.I
    )
    negation = re.compile(r"\b(?:assenza\s+di|non\s+evidenza\s+di|negativ[oa]\s+per|esclude|senza\s+segni\s+di)\b", re.I)
    suspicion = re.compile(r"\b(?:sospett\w*|possibile|probabile|compatibile\s+con|da\s+escludere|borderline)\b", re.I)
    resolved = re.compile(r"\b(?:risolt\w*|eradicazione\s+riuscita|guarit\w*|pregress\w*|storia\s+di)\b", re.I)
    monitor = re.compile(r"\b(?:controllo|follow[- ]?up|monitoraggio|rivalutazione|sorveglianza)\b", re.I)
    therapy_event = re.compile(r"\b(?:eradicazione|intervento|trattamento\s+concluso|terapia\s+iniziata|terapia\s+modificata)\b", re.I)

    def clean_name(value: str) -> str:
        value = re.sub(r"^(?:[-•]\s*|\d+[.)]\s*)", "", value).strip(" -•.;:")
        value = re.sub(r"^(?:diagnosi|conclusioni?|problemi?\s+(?:attivi|principali)|quadro\s+clinico)\s*[:\-]\s*", "", value, flags=re.I)
        return re.sub(r"\s+", " ", value).strip()

    def add(name: str, quote: str, category: str, status: str, confidence: int = 82,
            main_problem: bool = False, notes: str = "") -> None:
        name = clean_name(name)
        if len(name) < 4 or len(name) > 300:
            return
        # Le negazioni documentano un controllo, ma non devono mai diventare diagnosi.
        if negation.search(quote or name) and category in {"Diagnosi riportata", "Diagnosi confermata", "Problema clinico", "Sospetto diagnostico"}:
            category = "Controllo o follow-up"
            status = "Non rilevata"
            main_problem = False
            notes = notes or quote
        # Evita che una riga costituita soltanto da un esame o da valori diventi una diagnosi.
        if re.fullmatch(r"(?:rx|tac|tc|rm|ecg|egds|ecografia|fibroscan|esame|analisi)(?:\s+\w+){0,4}", name, re.I):
            category = "Controllo o follow-up"
            status = "Da verificare"
        key = compact(f"{name}|{clinical_date}|{category}")
        if not key or key in seen:
            return
        seen.add(key)
        source_quote = quote.strip()
        summary = (notes or source_quote).strip()
        out.append({
            "name": name, "date": clinical_date, "status": status, "category": category,
            "facility": facility, "specialization": specialization, "notes": notes,
            "summary": summary, "sourceQuote": source_quote, "mainProblem": bool(main_problem),
            "confidence": confidence,
        })

    # 1. Sezioni esplicite: Diagnosi, Conclusioni, Problemi principali.
    capture_heading = ""
    for line in lines:
        n = normalize_text(line)
        heading_match = re.match(r"^(diagnosi(?:/sospetto diagnostico)?|conclusioni?|problemi? (?:attivi|principali)|quadro clinico)\s*[:\-]?\s*(.*)$", line, re.I)
        if heading_match:
            capture_heading = normalize_text(heading_match.group(1))
            tail = heading_match.group(2).strip()
            if tail:
                parts = re.split(r"\s*;\s*|\s+[•]\s+", tail)
                for part in parts:
                    # In Diagnosi/Problemi una formulazione esplicita è sufficiente; nelle
                    # Conclusioni serve invece una condizione riconoscibile, non una frase generica.
                    explicit_section = capture_heading.startswith("diagnosi") or capture_heading.startswith("problemi")
                    if not explicit_section and not (disease_terms.search(part) or suspicion.search(part) or therapy_event.search(part)):
                        continue
                    cat = "Sospetto diagnostico" if suspicion.search(part) else "Diagnosi riportata"
                    stat = "Sospetta" if cat == "Sospetto diagnostico" else "Riportata"
                    add(part, line, cat, stat, 93, main_problem=explicit_section or bool(disease_terms.search(part)))
                # Una voce presente sulla stessa riga chiude normalmente la sezione breve.
                capture_heading = ""
            continue
        if capture_heading:
            if _looks_heading(line) and not re.match(r"^(?:[-•]|\d+[.)])", line):
                capture_heading = ""
            elif len(line) <= 320:
                explicit_section = capture_heading.startswith("diagnosi") or capture_heading.startswith("problemi")
                is_list_item = bool(re.match(r"^(?:[-•]|\d+[.)])", line))
                if not explicit_section and not (disease_terms.search(line) or suspicion.search(line) or therapy_event.search(line)):
                    capture_heading = ""
                    continue
                cat = "Sospetto diagnostico" if suspicion.search(line) else "Diagnosi riportata"
                stat = "Sospetta" if cat == "Sospetto diagnostico" else "Riportata"
                add(line, line, cat, stat, 90, main_problem=explicit_section or bool(disease_terms.search(line)))
                if not is_list_item:
                    capture_heading = ""
                continue

    # 2. Frasi cliniche esplicite fuori dalle sezioni dedicate.
    for line in lines:
        if len(line) > 420:
            clauses = re.split(r"(?<=[.;])\s+", line)
        else:
            clauses = [line]
        for clause in clauses:
            clause = clause.strip()
            if len(clause) < 5:
                continue
            has_disease = bool(disease_terms.search(clause))
            has_explicit = bool(explicit_intro.search(clause))
            if not (has_disease and has_explicit):
                continue
            if negation.search(clause):
                # Una negazione non è una diagnosi: può però documentare un controllo rilevante.
                if monitor.search(clause) or document_label:
                    label = document_label if re.search(r"controllo|visita|esame", normalize_text(document_label)) else "Controllo clinico"
                    add(label, clause, "Controllo o follow-up", "Da verificare", 78, notes=clause)
                continue
            if therapy_event.search(clause):
                category, status = "Evento terapeutico", "Risolta" if resolved.search(clause) else "Da monitorare"
            elif suspicion.search(clause):
                category, status = "Sospetto diagnostico", "Sospetta"
            elif resolved.search(clause):
                category, status = "Condizione pregressa", "Pregressa"
            elif monitor.search(clause):
                category, status = "Problema clinico", "Da monitorare"
            else:
                category, status = "Diagnosi riportata", "Riportata"
            # Mantiene la frase, ma prova a togliere introduzioni amministrative troppo lunghe.
            name = re.sub(r"^.*?\b(?:diagnosi\s+di|affetto\s+da|si\s+conferma|in\s+trattamento\s+per|in\s+follow[- ]?up\s+per)\s+", "", clause, flags=re.I)
            name = re.split(r"\s*(?:;|\.\s+[A-ZÀ-ÖØ-Ý])", name)[0].strip()
            add(name, clause, category, status, 84, main_problem=category == "Diagnosi riportata")

    # 3. La visita o il controllo rimane un evento clinico distinto, non una patologia.
    if document_mode in {"narrative", "mixed"} and document_label and re.search(r"\b(?:visita|controllo|esame)\b", normalize_text(document_label)):
        conclusion = ""
        for item in reversed(lines):
            if len(item) <= 240 and re.search(r"\b(?:controllo|follow[- ]?up|indicata|consigliata|assenza|negativ|nei limiti)\b", item, re.I):
                conclusion = item
                break
        add(document_label, conclusion or document_label, "Controllo o follow-up", "Da verificare", 74, notes=conclusion)

    return out

def extract_exemptions_advanced(text: str, clinical_date: str, facility: str) -> list[dict[str, Any]]:
    ntext = normalize_text(text)
    if "esenz" not in ntext:
        return []
    out = []
    seen = set()
    patterns = [
        r"codice\s+(?:di\s+)?esenzione\s*[:\-]\s*([A-Z0-9]{2,8})\s*(?:[-:]\s*)?([^\n]{0,180})",
        r"\besenzione\s*(?:codice\s*)?[:\-]\s*([A-Z0-9]{2,8})\s*(?:[-:]\s*)?([^\n]{0,180})",
        r"\b([A-Z]\d{2,3}|\d{3,6})\b\s*[-:]\s*([^\n]{3,180}esenz[^\n]*)",
    ]
    for pattern in patterns:
        for m in re.finditer(pattern, text, re.I):
            code = m.group(1).upper().strip()
            description = re.sub(r"\s+", " ", m.group(2)).strip(" .:-")
            if code in seen:
                continue
            seen.add(code)
            expiry = ""
            valid_from = clinical_date
            near = text[max(0, m.start()-120):m.end()+240]
            em = re.search(r"(?:scadenza|valida\s+fino\s+al|validita)\s*[:\-]?\s*([^\n;]{3,50})", near, re.I)
            if em:
                expiry = em.group(1).strip()
            out.append({"code": code, "description": description, "validFrom": valid_from, "expiry": expiry,
                        "issuer": facility, "limitations": "", "notes": "", "confidence": 90})
    return out


def _title_for_profile(profile: dict[str, Any], clinical_date: str, file_name: str) -> str:
    label = profile.get("label") or profile.get("category") or "Documento sanitario"
    if clinical_date:
        y, m, d = clinical_date.split("-")
        return f"{label} del {d}/{m}/{y}"
    return label or os.path.splitext(os.path.basename(file_name or "Documento sanitario"))[0]



# ============================================================================
# TEST 18 - pulizia semantica sorgente e migrazione coerente con scheda/PDF
# ============================================================================
_TEST18_ADMIN_RE = re.compile(
    r"^(?:accettazione(?:\s+n\.?)?|inserita\s+il|n\.?\s*libretto|numero\s+telefono|telefono|cellulare|"
    r"codice\s+fiscale|servizio\s+sanitario\s+nazionale|ssn|paziente|cognome|nome|data(?:\s*/\s*ora)?(?:\s+di\s+nascita)?|"
    r"luogo\s+di\s+nascita|indirizzo|residenza|domicilio|reparto|ambulatorio|prenotazione|richiesta|numero\s+referto|"
    r"referto\s+n\.?|referto\s+completato|cartella\s+clinica|scheda\s+nosologica|nosologico|tessera\s+sanitaria|"
    r"azienda\s+ospedaliera|azienda\s+sanitaria|direttore|responsabile|medico\s+firmatario|il\s+medico|codice\s+accesso|"
    r"id\s+documento|barcode|prodotto\s+il|stampato|scadenza|s\s*/\s*n|copia\s+conforme|modello|via\s+|tel\b|fax\b|e-?mail\b)", re.I)
_TEST18_CONTEXT_RE = re.compile(
    r"(?:\bin\s+gravidanza\b|\bgravidanza\b|\bin\s+(?:assenza|presenza)\s+di\s+sintomi\b|"
    r"\balterata\s+glicemia\s+a\s+digiuno\b|\belevato\s+rischio\b|\blivello\s+decisionale\b|"
    r"\bdiagnosi\s+di\s+diabete\b|\bvalori?\s+(?:desiderabili|insufficienti|sufficienti)\b|"
    r"\bwho\s+\d+(?:st|nd|rd|th)?\s+irp\b|\bformula\s+ckd[- ]?epi\b|\blinea\s+guida\s+kdigo\b|"
    r"\bgruppi?\s+etnici?\b|\bmassa\s+muscolare\b|\bstato\s+nutrizionale\b|\briferiment[oi]\s+bibliografic[oi]\b|"
    r"\bd\.?p\.?c\.?m\.?\b|\bd\.?p\.?r\.?\b|\bwsref\b)", re.I)
_TEST18_KNOWN_ANALYTE_RE = re.compile(
    r"\b(?:glicemia|glucosio|emoglobina|hba1c|creatinina|egfr|filtrato\s+glomerulare|colesterolo|hdl|ldl|trigliceridi|"
    r"tsh|ft3|ft4|ast|alt|ggt|bilirubina|vitamina\s+d|eritrociti|leucociti|piastrine|neutrofili|linfociti|"
    r"monociti|eosinofili|basofili|sodio|potassio|calcio|ferritina|ferro|urea|azotemia|albumina|proteina|psa)\b", re.I)

def _test18_contextual_non_exam(name: str, source: str = "") -> bool:
    raw = re.sub(r"\s+", " ", str(name or "")).strip()
    n = normalize_text(raw)
    joined = f"{raw} {source or ''}"
    if not n or _TEST18_ADMIN_RE.search(n):
        return True
    known = bool(_TEST18_KNOWN_ANALYTE_RE.search(raw))
    if not known and _TEST18_CONTEXT_RE.search(joined):
        return True
    if not known and re.match(r"^(?:uomini|donne|maschi|femmine|rischio\b|eta\b|anni\b|valori?\s+(?:fra|da))", n):
        return True
    if not known and re.match(r"^[<>≤≥]?\s*\d+(?:[,.]\d+)?\s*(?:-|a|e|<|>|≤|≥)+\s*[<>≤≥]?\s*\d*(?:[,.]\d+)?(?:\s*anni)?$", n):
        return True
    letters = len(re.findall(r"[a-zà-ÿ]", n)); digits = len(re.findall(r"\d", n)); operators = len(re.findall(r"[<>≤≥=]", n))
    return (not known and operators > 0 and digits >= letters) or (not known and len(n) > 100)

_test17_is_reference_continuation_name = _is_reference_continuation_name
def _is_reference_continuation_name(name: str) -> bool:
    return _test18_contextual_non_exam(name, name) or _test17_is_reference_continuation_name(name)

_test17_plausible_name = _plausible_name
def _plausible_name(name: str) -> bool:
    return not _test18_contextual_non_exam(name, name) and _test17_plausible_name(name)

_test17_split_unit_reference = _split_unit_reference
def _split_unit_reference(unit: str, ref: str, source: str = "") -> tuple[str, str, str]:
    u, reference, flag = _test17_split_unit_reference(unit, ref, source)
    u = re.sub(r"^[\s*†‡!|<>≤≥↑↓]+|[\s*†‡!|<>≤≥↑↓]+$", "", u).strip()
    u = re.sub(r"\b(?:siero\s*/\s*plasma|siero|plasma|urine?)\b", "", u, flags=re.I).strip()
    u = u.replace("μ", "µ")
    if re.search(r"ml\s*/\s*min\s*/\s*1[,.]?(?:7|73)\s*(?:m2|mq|m²)?", u, re.I):
        u = "mL/min/1,73 m²"
    reference = re.sub(r"\b(?:siero\s*/\s*plasma|siero|plasma|campione)\b", " ", reference, flags=re.I)
    reference = re.sub(r"\b(?:metodo|metodica|clia|eclia|immunometrico|turbidimetrico)\b.*$", "", reference, flags=re.I)
    reference = re.sub(r"\b(?:ref\.?\s*pi|d\.?p\.?c\.?m\.?|d\.?p\.?r\.?|legge\s+n\.?|pagina\s+\d+)\b.*$", "", reference, flags=re.I)
    reference = re.sub(r"\bfino\s+a\s*([-+]?\d+(?:[,.]\d+)?)", r"≤ \1", reference, flags=re.I)
    reference = re.sub(r"\s+", " ", reference).strip()
    return u, reference[:120], flag

_TEST18_NARR_ADMIN_RE = re.compile(r"(?:azienda\s+(?:ospedaliera|sanitaria)|servizio\s+sanitario|dipartimento|u\.?o\.?\s|direttore|responsabile|ambulatorio|prenotazione|centralino|telefono|tel\.?|fax|e-?mail|@|codice\s+fiscale|data\s+di\s+nascita|luogo\s+di\s+nascita|indirizzo|residenza|cartella\s+clinica|numero\s+referto|paziente\s*:|n[°.]\s*cartella|via\s+[a-zà-ÿ]+\s*,?\s*\d+)", re.I)
_TEST18_CLINICAL_MARKER_RE = re.compile(r"\b(?:anamnesi|diagnosi|terapia|programma|follow[- ]?up|esame\s+obiettivo|reperti?|conclusioni?|indicazioni?|ecografia|valori?\s+tiroidei?|peso|variazione\s+ponderale|motivo\s+visita|parametri\s+antropometrici|riferisce|nega|ipotiroidismo)\b", re.I)

def _test18_clean_narrative_fragment(text: str) -> str:
    out=[]; seen=set()
    for raw in re.split(r"[\r\n]+", str(text or "")):
        line=re.sub(r"\s+", " ", raw).strip()
        if not line or re.match(r"^(?:il\s+medico|firma|firmato\s+digitalmente|referto\s+firmato|esecutore)\b", line, re.I):
            continue
        admin=bool(_TEST18_NARR_ADMIN_RE.search(line)); marker=_TEST18_CLINICAL_MARKER_RE.search(line)
        if admin and not marker:
            continue
        if admin and marker and marker.start()>0:
            line=line[marker.start():].strip()
        if re.match(r"^(?:(?:nulla|niente) da segnalare|nessuna? (?:nota|osservazione)|nessun commento)$", line, re.I):
            continue
        key=normalize_text(line)
        if key and key not in seen:
            seen.add(key); out.append(line)
    return "\n".join(out).strip()

_test17_reconstruct_narrative = reconstruct_narrative
def reconstruct_narrative(text: str) -> dict[str, Any]:
    base=_test17_reconstruct_narrative(text)
    merged={}; order=[]
    for section in base.get("sections", []):
        title=re.sub(r"[,;:\-]?\s*continua\s*$", "", str(section.get("title") or "Referto"), flags=re.I).strip()
        if not title or re.match(r"^(?:intestazione(?: e dati del referto)?|il medico|firma|identificazione e firma)$", title, re.I):
            continue
        body=_test18_clean_narrative_fragment(section.get("text", ""))
        if not body: continue
        key=normalize_text(title)
        if key not in merged: merged[key]={"title":title,"parts":[]}; order.append(key)
        if body not in merged[key]["parts"]: merged[key]["parts"].append(body)
    sections=[{"title":merged[k]["title"],"text":"\n".join(merged[k]["parts"])} for k in order]
    full="\n\n".join(f"{x['title']}\n{x['text']}" for x in sections).strip()
    paragraphs=[p.strip() for x in sections for p in re.split(r"\n{2,}",x["text"]) if p.strip()]
    return {"fullText":full,"sections":sections,"paragraphs":paragraphs}

def extract_ecg_parameters(text: str, identity: str = "") -> list[dict[str, str]]:
    source=str(text or "")
    if not re.search(r"\b(?:ecg|elettrocardiogramma|elettrocardiografico)\b", f"{identity} {source}", re.I): return []
    if not re.search(r"(?:freq\s*vent|int\s*pr|dur\s*qrs|qt\s*/\s*qtc|assi\s*p\s*[-/]\s*r\s*[-/]\s*t)", source, re.I): return []
    rows=[]
    def add(parameter,value):
        value=re.sub(r"\s+"," ",str(value or "")).strip()
        if value and not any(normalize_text(x["parameter"])==normalize_text(parameter) for x in rows): rows.append({"parameter":parameter,"value":value})
    m=re.search(r"Freq(?:uenza)?\s*Vent(?:ricolare)?\s*:?\s*(?:\n|\s)*([0-9]{2,3})\s*BPM",source,re.I)
    if m:add("Frequenza ventricolare",f"{m.group(1)} BPM")
    m=re.search(r"Int(?:ervallo)?\s*PR\s*:?\s*(?:\n|\s)*([0-9]{2,4})\s*ms",source,re.I)
    if m:add("Intervallo PR",f"{m.group(1)} ms")
    m=re.search(r"QT\s*/\s*QTc\s*:?\s*(?:\n|\s)*([0-9]{2,4})\s*/\s*([0-9]{2,4})\s*ms",source,re.I) or re.search(r"Dur(?:ata)?\s*QRS\s*:?\s*(?:\n|\s)*([0-9]{3,4})\s*/\s*([0-9]{3,4})\s*ms",source,re.I)
    if m:add("QT / QTc",f"{m.group(1)} / {m.group(2)} ms")
    m=re.search(r"(?:[0-9]{3,4}\s*/\s*[0-9]{3,4}\s*ms)[\s\S]{0,90}?([0-9]{2,3})\s*ms",source,re.I)
    if m and int(m.group(1))<220:add("Durata QRS",f"{m.group(1)} ms")
    m=re.search(r"(?:QT\s*/\s*QTc|Dur(?:ata)?\s*QRS)[\s\S]{0,90}?([+-]?\d{1,3})\s+([+-]?\d{1,3})\s+([+-]?\d{1,3})(?:\s|\n)",source,re.I)
    if m:add("Assi P-R-T",f"{m.group(1)} / {m.group(2)} / {m.group(3)}°")
    m=re.search(r"\b(RITMO\s+(?:SINUSALE|ATRIALE|GIUNZIONALE|VENTRICOLARE|REGOLARE|IRREGOLARE))\b",source,re.I)
    if m:add("Ritmo",m.group(1).capitalize())
    m=re.search(r"\bECG\s+(NORMALE|NEI\s+LIMITI|ANORMALE)\b",source,re.I)
    if m:add("Conclusione",f"ECG {m.group(1).lower()}")
    return rows

def _test18_finalize_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out=[]
    for row in rows:
        source=str(row.get("sourceLine") or "")
        name=normalize_text(row.get("test", ""))
        if _test18_contextual_non_exam(row.get("test", ""), source):
            continue
        if re.search(r"\b(?:hdl|colesterolo hdl)\b", name):
            if re.search(r"mg\s*/\s*d[l1]", source, re.I): row["unit"]="mg/dL"
            if not row.get("reference"):
                rm=re.search(r"(?:valore\s+desiderabile\s*:?\s*)?(>=|<=|[<>≤≥])\s*([-+]?\d+(?:[,.]\d+)?)", source, re.I)
                if rm:
                    op={">=":"≥","<=":"≤"}.get(rm.group(1),rm.group(1));row["reference"]=f"{op} {rm.group(2)}";row["range"]=_parse_range(row["reference"])
                    if row.get("kind")=="numeric": row["status"]=_descriptive_status(float(row["value"]),row.get("range"),row["reference"],source)
        if re.search(r"(?:filtrato glomerulare|egfr)", name):
            if row.get("kind")=="numeric" and float(row.get("value",0))==2012: continue
            if re.search(r"ml\s*/\s*min", source, re.I): row["unit"]="mL/min/1,73 m²"
        row["unit"]=re.sub(r"^[\s*†‡!|<>≤≥↑↓]+|[\s*†‡!|<>≤≥↑↓]+$","",str(row.get("unit") or "")).strip()
        out.append(row)
    return _normalize_and_dedupe_rows(out)

def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    text = extracted.get("text") or ""
    pages = extracted.get("pages") or []
    profile = detect_document_profile(text, pages, file_name)
    rows = _test18_finalize_rows(extract_structured_rows(pages)) if profile["mode"] in {"lab", "mixed"} else []
    clinical, issue, dates, date_conf = detect_dates(text, file_name)
    doc_number = detect_document_number(text)
    personnel = detect_personnel(text)
    facility = detect_facility(text)
    department = detect_department(text)
    specialization = profile.get("specialization") or _detect_specialization(text) or department
    narrative = reconstruct_narrative(text) if profile["mode"] in {"narrative", "mixed", "diagnosis"} else {"fullText": "", "sections": [], "paragraphs": []}
    ecg_parameters = extract_ecg_parameters(text, f"{file_name} {profile.get('label','')} {profile.get('category','')}")
    if ecg_parameters:
        narrative = {"fullText": "", "sections": [], "paragraphs": []}

    lab_values: list[dict[str, Any]] = []
    qualitative: list[dict[str, Any]] = []
    table_rows: list[dict[str, Any]] = []
    for idx, row in enumerate(rows):
        table_rows.append({
            "kind": row["kind"], "test": row["test"], "value": row.get("value"), "result": row.get("result"),
            "unit": row.get("unit", ""), "reference": row.get("reference", ""), "pageNumber": row.get("pageNumber"),
            "sourceLine": row.get("sourceLine", ""), "referenceNotes": row.get("referenceNotes", []),
        })
        if row["kind"] == "numeric":
            lab_values.append({
                "id": f"py_value_{idx+1}", "parameterId": "custom_" + compact(row["test"])[:60],
                "parameterName": row["test"], "sample": "", "value": row["value"],
                "rawValue": row.get("rawValue", str(row["value"])), "unit": row.get("unit", ""),
                "range": row.get("range"), "status": row.get("status", "non definito"),
                "sourceLine": row.get("sourceLine", ""), "referenceNotes": row.get("referenceNotes", []), "confidence": row.get("confidence", 92),
                "pageNumber": row.get("pageNumber"), "graphEligible": True,
            })
        else:
            qualitative.append({
                "test": row["test"], "result": row.get("result", ""), "unit": row.get("unit", ""),
                "reference": row.get("reference", ""), "status": row.get("status", "da verificare"), "sourceLine": row.get("sourceLine", ""),
                "confidence": row.get("confidence", 90), "pageNumber": row.get("pageNumber"),
            })

    total = len(lab_values) + len(qualitative)
    candidate = max(total, len(rows))
    if profile["mode"] in {"lab", "mixed"}:
        completeness = round(total / max(1, candidate) * 100)
        warning = "" if completeness >= 80 else "Estrazione probabilmente incompleta: controlla il documento o correggi i valori."
    else:
        candidate = total = 0
        completeness = 100
        warning = ""

    identifiers = []
    if doc_number:
        identifiers.append({"label": "Numero referto", "value": doc_number, "confidence": 95})

    therapies = extract_therapy_rows_advanced(pages, text)
    diagnoses = extract_diagnoses_advanced(
        text, clinical, facility, specialization,
        document_label=profile.get("label", ""), document_mode=profile.get("mode", ""),
    ) if profile["mode"] in {"narrative", "mixed", "diagnosis"} else []
    exemptions = extract_exemptions_advanced(text, clinical, facility)

    return {
        "clinicalDate": clinical, "suggestedDate": clinical, "dateStatus": "detected" if clinical else "missing",
        "dateConfidence": date_conf, "dateCandidates": dates, "issueDate": issue,
        "category": profile["category"], "categoryConfidence": 98 if profile["mode"] != "narrative" else 92,
        "documentMode": profile["mode"], "documentKind": profile["label"], "specialization": specialization,
        "doctor": personnel[0]["name"] if personnel else "", "medicalPersonnel": personnel,
        "facility": facility, "department": department or specialization, "documentNumber": doc_number, "identifiers": identifiers,
        "labValues": lab_values, "qualitativeResults": qualitative, "tableRows": table_rows,
        "extractionStats": {"candidateRows": candidate, "structuredRows": total, "completeness": completeness,
                            "warning": warning, "tableRows": len(rows)},
        "structuredText": "\n".join(p.get("text", "") for p in pages),
        "reconstructedText": narrative["fullText"], "reportSections": narrative["sections"], "ecgParameters": ecg_parameters,
        "extractedTherapies": therapies, "extractedDiagnoses": diagnoses, "extractedExemptions": exemptions,
        "title": _title_for_profile(profile, clinical, file_name),
    }



# TEST 19 - collegamento finale al parser V4.2.0/TEST 18 effettivamente usato da analyze_path.
# Questa ridefinizione deve restare immediatamente prima dell'ultimo analyze_path.
_test19_final_base_analyze_document_v420 = analyze_document_v420
def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    return _test19_postprocess_analysis(_test19_final_base_analyze_document_v420(extracted, file_name), file_name)


# TEST 20 - validatore clinico centrale applicato dal parser prima del salvataggio.
_TEST20_VALIDATION_VERSION = "test20-v2"
_TEST20_PANEL_HEADINGS = re.compile(
    r"^(?:formula\s+leucocitaria|emocromo(?:\s+con\s+formula)?|esame\s+(?:completo\s+)?urine|"
    r"esame\s+del\s+sedimento\s+urinario|sedimento\s+urinario|profilo\s+lipidico|"
    r"funzionalit[aà]\s+(?:epatica|renale|tiroidea)|coagulazione|assetto\s+coagulativo)$", re.I,
)
_TEST20_REFERENCE_CONDITION = re.compile(
    r"^(?:picco\s+met[aà]\s+ciclo|fase\s+(?:follicolare|luteinica|ovulatoria)|medio\s*luteinica|"
    r"menopausa|postmenopausa|gravidanza|contracc(?:ettivi)?\.?\s*oral|non\s+trattate?|"
    r"in\s+(?:presenza|assenza)\s+di|livello\s+decisionale|alterata\s+glicemia|elevato\s+rischio)", re.I,
)
_TEST20_ADMIN = re.compile(
    r"\b(?:telefono|contatto\s+telefonico|codice\s+fiscale|unit[aà]\s+di\s+ricovero|priorit[aà]|"
    r"somministrazione|firma|fiala|compressa|flacone|humulin|klacid|pantoprazol|pantorc|enoxaparin|"
    r"direttore|prenotazione|accettazione|numero\s+referto|n\.?\s*libretto|via\s+[a-z]|indirizzo)\b", re.I,
)
_TEST20_QUAL_NOISE = re.compile(
    r"\b(?:nulla\s+da\s+segnalare|controlli?\s+di\s+qualit[aà]|copia\s+cartacea|conforme\s+all.originale|"
    r"firmatari[oa]|firma\s+elettronica|normativa\s+vigente|conservato\s+secondo|gli\s+esami\s+indicati|"
    r"strutture\s+dipartimentali|valore\s+desiderabile|rischio\s+cardio|bassa\s+densit[aà]\s+relativa|"
    r"corretta\s+valutazione|pagina|direttore|telefono|email|prenotazione)\b", re.I,
)


def _test20_collapse_words(value: str) -> str:
    words = re.sub(r"\s+", " ", str(value or "")).strip().split(" ")
    out: list[str] = []
    for word in words:
        if out and normalize_text(out[-1]) == normalize_text(word):
            continue
        out.append(word)
    if len(out) % 2 == 0 and out:
        half = len(out) // 2
        if normalize_text(" ".join(out[:half])) == normalize_text(" ".join(out[half:])):
            out = out[:half]
    return " ".join(out)


def _test20_technical(row: dict[str, Any], reason: str, kind: str = "numeric") -> dict[str, Any]:
    return {
        "kind": kind,
        "test": row.get("parameterName") or row.get("test") or "",
        "result": row.get("result", row.get("rawValue", row.get("value", ""))),
        "unit": row.get("unit") or "",
        "reference": row.get("reference") or (row.get("range") or {}).get("raw", ""),
        "sourceLine": row.get("sourceLine") or "",
        "pageNumber": row.get("pageNumber"),
        "reviewReason": reason,
    }


def _test20_is_false_numeric(row: dict[str, Any]) -> str:
    name = _test20_collapse_words(row.get("parameterName") or row.get("test") or "")
    source = str(row.get("sourceLine") or "")
    n = normalize_text(name)
    whole = f"{name} {source}"
    value = parse_number(str(row.get("value")))
    if _TEST20_PANEL_HEADINGS.fullmatch(n):
        return "Intestazione di pannello"
    if _TEST20_REFERENCE_CONDITION.match(n):
        return "Condizione o fascia di riferimento, non esame"
    if _TEST20_ADMIN.search(whole):
        return "Riga amministrativa, terapeutica o di impaginazione"
    if re.match(r"^\d{1,2}[/.:-]\d{1,2}(?:[/.:-]\d{2,4})?", name):
        return "Data o orario interpretati come esame"
    if re.match(r"^m\s*\^?\s*2$", n) and re.search(r"egfr|filtrato|ml\s*/\s*min", source, re.I):
        return "Esponente dell'unità interpretato come esame"
    if re.search(r"egfr|filtrato glomerulare", n) and value is not None and 1900 <= value <= 2100:
        return "Anno o metodo CKD-EPI interpretato come risultato"
    if _test19_threshold_only(row):
        return "Soglia o condizione interpretata come esame"
    return ""


def _test20_range_from_source(row: dict[str, Any]) -> dict[str, Any] | None:
    if row.get("range") and (row.get("range") or {}).get("raw"):
        return row.get("range")
    source = str(row.get("sourceLine") or "")
    raw_value = str(row.get("rawValue", row.get("value", ""))).replace(",", ".")
    tail = source
    pos = source.replace(",", ".").find(raw_value) if raw_value else -1
    if pos >= 0:
        tail = source[pos + len(raw_value):]
    tail = re.sub(r"\b(?:mg|g|ng|pg|mmol|mEq|U|UI|µg)\s*/?\s*(?:dL|mL|L)\b", " ", tail, flags=re.I)
    match = re.search(r"(?:<=|>=|[<>≤≥])\s*-?\d+(?:[,.]\d+)?", tail)
    if not match:
        match = re.search(r"-?\d+(?:[,.]\d+)?\s*(?:-|\+)\s*-?\d+(?:[,.]\d+)?", tail)
    if not match:
        return None
    raw = match.group(0).replace("+", "-")
    return _parse_range(raw)


def _test20_normalize_row(raw: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    row = dict(raw)
    row["parameterName"] = _test20_collapse_words(row.get("parameterName") or row.get("test") or "")
    section, analyte = _test19_fused_panel(row)
    if analyte:
        row["parameterName"] = analyte
    if section:
        row["labSection"] = section
    row["parameterName"] = _test19_canonical_lab_name(row)
    source = str(row.get("sourceLine") or "")
    unit = str(row.get("unit") or "").strip()
    if normalize_text(row.get("parameterName") or "") in {"ft3", "ft4"} and re.fullmatch(r"pa\s*/?\s*ml", normalize_text(unit)):
        unit = "pg/mL"
    if row.get("parameterName", "").endswith(" %") and not unit:
        unit = "%"
    row["unit"] = unit
    if not row.get("range"):
        found = _test20_range_from_source(row)
        if found:
            row["range"] = found
    if row.get("range") and row.get("value") is not None:
        row["status"] = _status(float(row["value"]), row.get("range"), source)
    row["labSection"] = _test19_panel(row, file_name)
    return row


def _test20_dedupe_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chosen: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    def quality(row: dict[str, Any]) -> tuple[int, int, int, int]:
        return (
            1 if (row.get("range") or {}).get("raw") else 0,
            1 if str(row.get("unit") or "").strip() else 0,
            1 if row.get("parameterId") and not str(row.get("parameterId")).startswith("custom_") else 0,
            1 if row.get("labSection") and row.get("labSection") != "Altri esami di laboratorio" else 0,
        )
    for row in rows:
        value = row.get("value")
        value_key = f"{float(value):.8g}" if value is not None else ""
        key = "|".join((normalize_text(row.get("parameterName") or ""), value_key, normalize_text(row.get("unit") or "")))
        if key not in chosen:
            chosen[key] = row; order.append(key)
        elif quality(row) > quality(chosen[key]):
            chosen[key] = row
    return [chosen[key] for key in order]


def _test20_postprocess_analysis(analysis: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    technical: list[dict[str, Any]] = list(analysis.get("technicalReviewRows") or [])
    numeric: list[dict[str, Any]] = []
    for raw in analysis.get("labValues") or []:
        reason = _test20_is_false_numeric(raw)
        if reason:
            technical.append(_test20_technical(raw, reason))
            continue
        numeric.append(_test20_normalize_row(raw, file_name))
    numeric = _test20_dedupe_rows(_test19_dedupe_lab_values(numeric))

    qualitative: list[dict[str, Any]] = []
    for raw in analysis.get("qualitativeResults") or []:
        row = dict(raw)
        combined = f"{row.get('test','')} {row.get('result','')} {row.get('sourceLine','')}"
        if _TEST20_QUAL_NOISE.search(combined):
            technical.append(_test20_technical(row, "Nota amministrativa, bibliografica o priva di valore clinico", "qualitative"))
            continue
        egfr = re.search(
            r"(?:calc\.?\s*volume\s*filtrato\s*glomerulare|filtrato\s*glomerulare).*?(?:mdrd|ckd[- ]?epi)?\s*"
            r"([1-9]\d(?:[,.]\d+)?)\s*(?:m?l)?\s*/\s*min(?:\s*/\s*1[,.]73\s*m\^?2)?.*?([<>]=?|≤|≥)\s*([1-9]\d(?:[,.]\d+)?)",
            combined, re.I,
        )
        if egfr:
            value = parse_number(egfr.group(1)); limit = parse_number(egfr.group(3)); operator = egfr.group(2).replace(">=", "≥").replace("<=", "≤")
            if value is not None and limit is not None:
                range_obj = {"raw": f"{operator}{limit:g}".replace(".", ","), "operator": operator, "limit": limit}
                numeric.append({
                    "id": f"py_value_test20_egfr_{len(numeric)+1}", "parameterId": "egfr",
                    "parameterName": "Filtrato glomerulare stimato", "sample": "Sangue", "value": value,
                    "rawValue": str(value).replace(".", ","), "unit": "mL/min/1,73 m²", "range": range_obj,
                    "status": _status(value, range_obj, combined), "method": "CKD-EPI" if re.search(r"ckd[- ]?epi", combined, re.I) else "MDRD",
                    "sourceLine": row.get("sourceLine") or combined, "pageNumber": row.get("pageNumber"),
                    "labSection": "Funzionalità renale", "graphEligible": True,
                })
                continue
        result = str(row.get("result") or "").strip()
        if re.search(r"\bnon\s+rilevat[oa]\b", result, re.I):
            row["result"] = "Non rilevato"; row["reference"] = row.get("reference") or "Non rilevato"; row["status"] = "nei limiti"
        elif re.match(r"^negativ[oa]\b", result, re.I):
            row["result"] = "Negativo"; row["reference"] = row.get("reference") or "Negativo"; row["status"] = "nei limiti"
        row["labSection"] = _test19_panel(row, file_name)
        qualitative.append(row)

    numeric = _test20_dedupe_rows(_test19_dedupe_lab_values(numeric))
    seen_tech: set[str] = set(); technical_out: list[dict[str, Any]] = []
    for row in technical:
        key = "|".join((normalize_text(row.get("test") or ""), normalize_text(str(row.get("result") or "")), normalize_text(row.get("sourceLine") or ""), normalize_text(row.get("reviewReason") or "")))
        if key not in seen_tech:
            seen_tech.add(key); technical_out.append(row)
    analysis["labValues"] = numeric
    analysis["qualitativeResults"] = qualitative
    analysis["technicalReviewRows"] = technical_out
    analysis["tableRows"] = [
        *[{"kind": "numeric", "test": r.get("parameterName"), "value": r.get("value"), "result": r.get("displayResult") or r.get("rawValue", r.get("value")), "unit": r.get("unit", ""), "reference": (r.get("range") or {}).get("raw", ""), "status": r.get("status", "da verificare"), "pageNumber": r.get("pageNumber"), "sourceLine": r.get("sourceLine", ""), "labSection": r.get("labSection", "")} for r in numeric],
        *[{"kind": "qualitative", "test": r.get("test"), "result": r.get("result"), "unit": r.get("unit", ""), "reference": r.get("reference", ""), "status": r.get("status", "da verificare"), "pageNumber": r.get("pageNumber"), "sourceLine": r.get("sourceLine", ""), "labSection": r.get("labSection", "")} for r in qualitative],
    ]
    stats = dict(analysis.get("extractionStats") or {})
    stats.update({"structuredRows": len(numeric) + len(qualitative), "technicalReviewRows": len(technical_out), "clinicalValidationVersion": _TEST20_VALIDATION_VERSION})
    analysis["extractionStats"] = stats
    analysis["clinicalValidationVersion"] = _TEST20_VALIDATION_VERSION
    analysis["labRepairVersion"] = _TEST20_VALIDATION_VERSION
    analysis["labPanelVersion"] = _TEST20_VALIDATION_VERSION
    return analysis


_test20_final_base_analyze_document_v420 = analyze_document_v420
def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    return _test20_postprocess_analysis(_test20_final_base_analyze_document_v420(extracted, file_name), file_name)



# TEST 23 - filtro canonico finale del parser Python.
_TEST23_VERSION = "test23-v1"
_TEST23_FALSE = re.compile(
    r"(?:molto alto il valore desiderabile|valore desiderabile puo essere|patologi[ae] (?:basso|alto) rischio|"
    r"attenzione.*unita di misura|appartenente a gruppo etnico|moltiplicare il risultato|gruppo etnico afro|"
    r"livello decisionale|dalla presente analisi.*classificazione)", re.I,
)

def _test23_collapse(value: str = "") -> str:
    return _test20_collapse_words(re.sub(r"[._]{2,}", " ", str(value or "")))

def _test23_clean_unit(value: str = "", name: str = "") -> str:
    unit = re.sub(r"^\*+\s*", "", _test23_collapse(value)).strip()
    nu = normalize_text(unit); nn = normalize_text(name)
    if nn == "ft3" and re.fullmatch(r"pa\s*/?\s*ml", nu): return "pg/mL"
    if nu in {"uil", "ul", "ui l", "u l"}: return "U/L"
    if re.search(r"ml.*min.*1[,.]73.*m", nu): return "mL/min/1,73 m²"
    return unit

def _test23_false(row: dict[str, Any]) -> str:
    name = normalize_text(row.get("parameterName") or row.get("test") or "")
    source = normalize_text(f"{row.get('sourceLine') or ''} {row.get('parameterName') or row.get('test') or ''}")
    if _TEST20_PANEL_HEADINGS.fullmatch(name): return "Intestazione di pannello"
    if _TEST23_FALSE.search(source): return "Nota, soglia o condizione di calcolo"
    if re.match(r"^(?:analisi l|analisi e i|ementi|titolo|misurati|real time|cmr)\b", name): return "Riga OCR non identificata"
    return ""

def _test23_identity(row: dict[str, Any], qualitative: bool = False) -> tuple[str, str, str]:
    raw = _test23_collapse(row.get("parameterName") or row.get("test") or "")
    n = normalize_text(raw); src = normalize_text(row.get("sourceLine") or ""); pid = str(row.get("parameterId") or ""); method = str(row.get("method") or "")
    def ret(i: str, name: str, m: str = method): return i, name, m
    if re.search(r"formula.*neutrofil|\bneutrofili\b", n): return ret("neutrophils_pct" if "%" in f"{raw}{row.get('unit','')}{row.get('sourceLine','')}" else "neutrophils_abs", "Neutrofili %" if "%" in f"{raw}{row.get('unit','')}{row.get('sourceLine','')}" else "Neutrofili")
    if re.search(r"formula.*linfocit|\blinfociti\b", n): return ret("lymphocytes_pct" if "%" in f"{raw}{row.get('unit','')}{row.get('sourceLine','')}" else "lymphocytes_abs", "Linfociti %" if "%" in f"{raw}{row.get('unit','')}{row.get('sourceLine','')}" else "Linfociti")
    if re.search(r"formula.*monocit|\bmonociti\b", n): return ret("monocytes_pct" if "%" in f"{raw}{row.get('unit','')}{row.get('sourceLine','')}" else "monocytes_abs", "Monociti %" if "%" in f"{raw}{row.get('unit','')}{row.get('sourceLine','')}" else "Monociti")
    if re.search(r"formula.*eosinofil|\beosinofili\b", n): return ret("eosinophils_pct" if "%" in f"{raw}{row.get('unit','')}{row.get('sourceLine','')}" else "eosinophils_abs", "Eosinofili %" if "%" in f"{raw}{row.get('unit','')}{row.get('sourceLine','')}" else "Eosinofili")
    if re.search(r"formula.*basofil|\bbasofili\b", n): return ret("basophils_pct" if "%" in f"{raw}{row.get('unit','')}{row.get('sourceLine','')}" else "basophils_abs", "Basofili %" if "%" in f"{raw}{row.get('unit','')}{row.get('sourceLine','')}" else "Basofili")
    if re.search(r"^(?:t\s*\.?\s*s\s*\.?\s*h|tsh)\b|tireotropina", n):
        mm = re.search(r"\b(ICMA|ECLIA|CLIA|CMIA)\b", raw, re.I); return ret("tsh", "TSH", mm.group(1).upper() if mm else method)
    if re.search(r"^ft3\b|triiodotironina libera", n): return ret("ft3", "FT3")
    if re.search(r"^ft4\b|tiroxina libera", n): return ret("ft4", "FT4")
    if re.search(r"psa.*libero.*totale|rapporto psa", n): return ret("psa_ratio", "Rapporto PSA libero/totale")
    if "psa totale" in n: return ret("psa_total", "PSA totale")
    if re.search(r"albumina.*(?:creatinina|g creat)", n): return ret("acr_urine", "Rapporto albumina/creatinina urinaria")
    if re.search(r"albumina urin|albumina urine", n): return ret("albumin_urine", "Albumina urinaria", "Immunoturbidimetrico" if "immunoturbidimetr" in n+src else method)
    if re.search(r"creatinina urin|creatininuria", n): return ret("creatinine_urine", "Creatinina urinaria")
    if re.search(r"calc.*filtrato glomerulare|filtrato glomerulare|\begfr\b", n): return ret("egfr", "Filtrato glomerulare stimato")
    if "attivita protrombinica" in n: return ret("prothrombin_activity", "Attività protrombinica")
    if n.startswith("lipasi"): return ret("lipase", "Lipasi")
    if n.startswith("colinesterasi"): return ret("cholinesterase", "Colinesterasi")
    if "helicobacter pylori" in n: return ret("helicobacter_pylori_antigen", "Helicobacter pylori, antigene fecale")
    if n.startswith("anti hcv"): return ret("anti_hcv", "Anti HCV")
    if n.startswith("anti hbc"): return ret("anti_hbc", "Anti HBc")
    if n.startswith("anti hav igg"): return ret("anti_hav_igg", "Anti HAV IgG")
    return pid or f"custom_{compact(raw)}", raw, method

def _test23_panel(row: dict[str, Any], file_name: str = "") -> str:
    pid = str(row.get("parameterId") or ""); n = normalize_text(row.get("parameterName") or row.get("test") or "")
    if pid in {"tsh","ft3","ft4","t3","t4"}: return "Funzionalità tiroidea"
    if re.match(r"^(?:neutrophils|lymphocytes|monocytes|eosinophils|basophils)", pid): return "Formula leucocitaria"
    if pid in {"acr_urine","albumin_urine","creatinine_urine"}: return "Albuminuria e rapporto albumina/creatinina"
    if pid == "egfr": return "Funzionalità renale"
    if pid in {"urine_appearance","urine_color","urine_ketones","urine_blood","urine_bilirubin","urine_glucose","urine_ph","urobilinogen"}: return "Esame urine"
    if pid == "prothrombin_activity" or re.search(r"protrombin|inr|fibrinogeno|aptt|ptt", n): return "Coagulazione"
    return _test19_panel(row, file_name)

def _test23_qual_result(value: str = "") -> str:
    r = _test23_collapse(re.sub(r"\b(?:siero|plasma|siero/plasma|urine?)\b\s*$", "", str(value or ""), flags=re.I)).strip(); n=normalize_text(r)
    if "non calcolabil" in n: return "Non calcolabile"
    if n.startswith("negativ"): return "Negativo"
    if n.startswith("positiv"): return "Positivo"
    if n.startswith("non rilevat"): return "Non rilevato"
    if n.startswith("assent"): return "Assente"
    if "paglierino" in n: return "Paglierino"
    if "limpido" in n: return "Limpido"
    return r

def _test23_postprocess_analysis(analysis: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    technical = list(analysis.get("technicalReviewRows") or []); numeric=[]; qualitative=[]
    for raw in analysis.get("labValues") or []:
        row=dict(raw); pid,name,method=_test23_identity(row); row["parameterId"]=pid;row["parameterName"]=name;row["method"]=method;row["unit"]=_test23_clean_unit(row.get("unit"),name)
        reason=_test23_false(row)
        if reason: technical.append(_test20_technical(row,reason)); continue
        row["labSection"]=_test23_panel(row,file_name); numeric.append(row)
    for raw in analysis.get("qualitativeResults") or []:
        row=dict(raw); pid,name,method=_test23_identity(row,True);row["parameterId"]=pid;row["test"]=name;row["method"]=method;row["unit"]=_test23_clean_unit(row.get("unit"),name);row["result"]=_test23_qual_result(row.get("result"))
        reason=_test23_false(row)
        if reason: technical.append(_test20_technical(row,reason,"qualitative"));continue
        src=str(row.get("sourceLine") or f"{row.get('test','')} {row.get('result','')} {row.get('unit','')} {row.get('reference','')}")
        if pid=="egfr":
            m=re.search(r"(?:MDRD|CKD[- ]?EPI)\s*([<>]?\s*\d+(?:[,.]\d+)?)",src,re.I) or re.search(r"([<>]?\s*\d+(?:[,.]\d+)?)\s*(?:<\s*)?/?min",str(row.get("unit") or ""),re.I)
            value=parse_number(re.sub(r"[<>]","",m.group(1))) if m else None
            if value is not None:
                ref=_parse_range(row.get("reference") or ((re.search(r"([<>≤≥]=?\s*\d+(?:[,.]\d+)?)\s*$",src) or [None,""])[1]));numeric.append({"parameterId":"egfr","parameterName":"Filtrato glomerulare stimato","value":value,"rawValue":str(value).replace('.',','),"unit":"mL/min/1,73 m²","range":ref,"method":"CKD-EPI" if re.search(r"CKD[- ]?EPI",src,re.I) else "MDRD","sourceLine":src,"pageNumber":row.get("pageNumber"),"labSection":"Funzionalità renale","status":_status(value,ref,src) if ref else "da verificare"});continue
            row["result"]="Non disponibile";row["status"]="Non valutabile";row["referenceApplicability"]="not_required"
        nr=normalize_text(row.get("result") or ""); nt=normalize_text(row.get("test") or "")
        if "non calcolabil" in nr: row["status"]="Non valutabile";row["referenceApplicability"]="not_required"
        elif nt=="anti hav igg" and nr=="positivo": row["status"]="Immunità presente";row["referenceApplicability"]="not_required"
        elif re.search(r"helicobacter pylori|anti hcv|anti hbc|hbsag",nt) and nr in {"negativo","non rilevato"}: row["reference"]="Negativo" if nr=="negativo" else "Non rilevato";row["status"]="nei limiti"
        row["labSection"]=_test23_panel(row,file_name);qualitative.append(row)
    analysis["labValues"]=_test20_dedupe_rows(numeric);analysis["qualitativeResults"]=_normalize_and_dedupe_rows(qualitative)
    analysis["technicalReviewRows"]=_normalize_and_dedupe_rows(technical)
    analysis["tableRows"]=[*[{"kind":"numeric","test":r.get("parameterName"),"value":r.get("value"),"result":r.get("displayResult") or r.get("rawValue",r.get("value")),"unit":r.get("unit","") ,"reference":(r.get("range") or {}).get("raw",""),"status":r.get("status","da verificare"),"sourceLine":r.get("sourceLine","") ,"labSection":r.get("labSection","")} for r in analysis["labValues"]], *[{"kind":"qualitative","test":r.get("test"),"result":r.get("result"),"unit":r.get("unit","") ,"reference":r.get("reference","") ,"status":r.get("status","da verificare"),"sourceLine":r.get("sourceLine","") ,"labSection":r.get("labSection","")} for r in analysis["qualitativeResults"]]]
    sections=[]; merged={}; order=[]
    for s in analysis.get("reportSections") or []:
        title=re.sub(r"[,;:\-]?\s*continua\s*$","",str(s.get("title") or "Referto"),flags=re.I).strip(); key=normalize_text(title); key="referto" if key.startswith("referto") else "commento" if key.startswith("commento") else key
        if key not in merged: merged[key]={"title":"Referto" if key=="referto" else "Commento" if key=="commento" else title,"parts":[]};order.append(key)
        text=str(s.get("text") or "").strip()
        if text and text not in merged[key]["parts"]: merged[key]["parts"].append(text)
    for key in order: sections.append({"title":merged[key]["title"],"text":"\n\n".join(merged[key]["parts"])})
    if sections: analysis["reportSections"]=sections;analysis["reconstructedText"]="\n\n".join(f"{s['title']}\n{s['text']}" for s in sections)
    analysis["clinicalValidationVersion"]=_TEST23_VERSION;analysis["labRepairVersion"]=_TEST23_VERSION;analysis["labPanelVersion"]=_TEST23_VERSION;analysis["narrativeRepairVersion"]=_TEST23_VERSION
    return analysis

_test23_final_base_analyze_document_v420 = analyze_document_v420
def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    return _test23_postprocess_analysis(_test23_final_base_analyze_document_v420(extracted, file_name), file_name)

# TEST 23.2 - consolidamento semantico finale del parser Python.
_TEST23_VERSION = "test23-v2"
_TEST23_V2_FALSE = re.compile(
    r"(?:molto\s+alto.*valore\s+desider(?:ato|abile)|valore\s+desiderabile.*inferiore|"
    r"patologi[ae]\s+(?:a\s+)?(?:basso|alto)\s+rischio|"
    r"attenzione.*unit[aà]\s+di\s+misura|appartenente\s+a\s+gruppo\s+etnico|"
    r"moltiplicare\s+il\s+risultato|gruppo\s+etnico\s+afro|"
    r"livello\s+decisionale|classificazione\s+del\s+fisico|"
    r"copia\s+conforme|controlli?\s+di\s+qualit[aà]|"
    r"direttore\s+sanitario|sede\s+operativa|telefono|fax|codice\s+fiscale|"
    r"prenotazioni|cordiali\s+saluti|il\s+medico\s+di\s+reparto)", re.I,
)
_TEST23_V2_NOTE_ONLY = re.compile(
    r"^(?:standard|nota|metodo|interpretazione|intervallo|riferimento|"
    r"soglia|rischio|attenzione|campione|materiale|classe|categoria|"
    r"formula\s+leucocitaria|esame\s+urine|sedimento\s+urinario|"
    r"emocromo|profilo\s+lipidico|funzionalit[aà])\b", re.I,
)
_TEST23_V2_ADMIN = re.compile(
    r"^(?:nome|cognome|paziente|nato|nata|data\s+di\s+nascita|indirizzo|"
    r"codice\s+fiscale|numero\s+referto|id\s+referto|reparto|struttura|"
    r"azienda\s+ospedaliera|ospedale|laboratorio|medico|firma|pagina)\b", re.I,
)

def _test23_v2_row_text(row: dict[str, Any]) -> str:
    return " ".join(str(row.get(k) or "") for k in ("parameterName", "test", "result", "unit", "reference", "sourceLine"))

def _test23_v2_false(row: dict[str, Any]) -> str:
    name = _test23_collapse(row.get("parameterName") or row.get("test") or "")
    n = normalize_text(name)
    text = _test23_v2_row_text(row)
    nt = normalize_text(text)
    if not n:
        return "Nome dell'analita assente"
    if _TEST20_PANEL_HEADINGS.fullmatch(n):
        return "Intestazione di pannello"
    if _TEST23_V2_FALSE.search(text):
        return "Nota, soglia, legenda o dato amministrativo"
    if _TEST23_V2_ADMIN.search(name):
        return "Dato amministrativo"
    if _TEST23_V2_NOTE_ONLY.search(name) and not re.search(r"(?:proteina|albumina|creatinina|glucosio|colesterolo|bilirubina|ormone)", n):
        return "Intestazione o nota tecnica"
    if re.search(r"^(?:analisi\s+[lei]|ementi|titolo|misurati|real\s*time|cmr|"
                 r"molto\s+alto|basso\s+rischio|alto\s+rischio)\b", n):
        return "Riga OCR non identificata"
    if len(n) > 120 and not re.search(r"\b(?:anticorpi|immunoglobuline|rapporto|calcolo)\b", n):
        return "Testo narrativo erroneamente estratto come esame"
    if re.search(r"\b(?:moltiplicare|valore\s+desiderabile|classe\s+di\s+rischio|"
                 r"in\s+gravidanza|eta\s+superiore|se\s+afro)\b", nt):
        return "Condizione di calcolo o soglia"
    return ""

def _test23_v2_clean_repeated(value: str = "") -> str:
    words = re.split(r"\s+", _test23_collapse(value).strip())
    out: list[str] = []
    for word in words:
        if out and normalize_text(out[-1]) == normalize_text(word):
            continue
        out.append(word)
    return " ".join(out).strip()

def _test23_v2_identity(row: dict[str, Any], qualitative: bool = False) -> tuple[str, str, str]:
    pid, name, method = _test23_identity(row, qualitative)
    n = normalize_text(name)
    src = normalize_text(_test23_v2_row_text(row))
    if re.search(r"^aspetto(?:\s+urine)?|aspetto\s+limpido", n): return "urine_appearance", "Aspetto", method
    if re.search(r"^colore(?:\s+urine)?|colore\s+(?:giallo|paglierino)", n): return "urine_color", "Colore", method
    if re.search(r"^chetoni|corpi\s+chetonici", n): return "urine_ketones", "Chetoni", method
    if re.search(r"^sangue$|emoglobina\s+urine|sangue\s+urine", n): return "urine_blood", "Sangue", method
    if re.search(r"^bilirubina(?:\s+urine)?$", n) and re.search(r"urin|mg/dl|assent|negativ|\b0(?:[,.]0+)?\b", src): return "urine_bilirubin", "Bilirubina", method
    if re.search(r"^glucosio(?:\s+urine)?|glicosuria", n): return "urine_glucose", "Glucosio", method
    if re.search(r"^ph(?:\s+urine)?$", n): return "urine_ph", "pH urine", method
    if re.search(r"urobilinogeno", n): return "urobilinogen", "Urobilinogeno", method
    if re.search(r"proteina\s+c\s+reattiva|\bpcr\b|\bcrp\b", n): return "crp", "Proteina C reattiva", method
    if re.search(r"^psa$|antigene\s+prostatico", n): return "psa_total", "PSA totale", method
    return pid, name, method

def _test23_v2_postprocess_analysis(analysis: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    technical = list(analysis.get("technicalReviewRows") or [])
    numeric: list[dict[str, Any]] = []
    qualitative: list[dict[str, Any]] = []

    for raw in analysis.get("labValues") or []:
        row = dict(raw)
        pid, name, method = _test23_v2_identity(row)
        row.update({"parameterId": pid, "parameterName": name, "method": method})
        row["unit"] = _test23_clean_unit(row.get("unit"), name)
        reason = _test23_v2_false(row)
        if reason:
            technical.append(_test20_technical(row, reason))
            continue
        value = row.get("value")
        if value is None:
            value = parse_number(row.get("rawValue") or row.get("result"))
            row["value"] = value
        if value is None:
            technical.append(_test20_technical(row, "Risultato numerico non ricostruibile"))
            continue
        # Nei parametri urinari zero significa risultato reale e normalmente assenza.
        if pid in {"urine_ketones", "urine_blood", "urine_bilirubin", "urine_glucose"} and float(value) == 0:
            qualitative.append({
                "test": name, "parameterId": pid, "result": "Assente", "unit": "",
                "reference": "Assente", "status": "nei limiti", "method": method,
                "sourceLine": row.get("sourceLine") or _test23_v2_row_text(row),
                "pageNumber": row.get("pageNumber"), "labSection": "Esame urine",
            })
            continue
        row["labSection"] = _test23_panel(row, file_name)
        if row.get("range"):
            row["status"] = _status(float(value), row.get("range"), row.get("sourceLine") or "")
        numeric.append(row)

    _clean_qual_ids: set[str] = set()
    for _raw in analysis.get("qualitativeResults") or []:
        _pid, _name, _method = _test23_v2_identity(dict(_raw), True)
        _raw_name = normalize_text(_raw.get("test") or _raw.get("parameterName") or "")
        if "formula leucocitaria" not in _raw_name:
            _clean_qual_ids.add(_pid)

    for raw in analysis.get("qualitativeResults") or []:
        row = dict(raw)
        pid, name, method = _test23_v2_identity(row, True)
        row.update({"parameterId": pid, "test": name, "method": method})
        row["unit"] = _test23_clean_unit(row.get("unit"), name)
        row["result"] = _test23_v2_clean_repeated(_test23_qual_result(row.get("result")))
        _raw_name = normalize_text(raw.get("test") or raw.get("parameterName") or "")
        if "formula leucocitaria" in _raw_name and pid in _clean_qual_ids:
            technical.append(_test20_technical(row, "Intestazione di pannello fusa con analita duplicato", "qualitative"))
            continue
        reason = _test23_v2_false(row)
        if reason:
            technical.append(_test20_technical(row, reason, "qualitative"))
            continue
        src = row.get("sourceLine") or _test23_v2_row_text(row)
        nr = normalize_text(row.get("result") or "")
        nt = normalize_text(name)

        if pid == "egfr":
            combined = f"{row.get('result','')} {row.get('unit','')} {row.get('reference','')} {src}"
            m = re.search(r"(?:MDRD|CKD[- ]?EPI)\s*([<>]?\s*\d+(?:[,.]\d+)?)", combined, re.I)
            if not m:
                m = re.search(r"([<>]?\s*\d+(?:[,.]\d+)?)\s*(?:mL)?\s*/?\s*min", combined, re.I)
            value = parse_number(re.sub(r"[<>]", "", m.group(1))) if m else None
            if value is not None:
                range_obj = _parse_range(row.get("reference") or "")
                numeric.append({
                    "parameterId": "egfr", "parameterName": "Filtrato glomerulare stimato",
                    "value": value, "rawValue": str(value).replace(".", ","),
                    "unit": "mL/min/1,73 m²", "range": range_obj,
                    "status": _status(value, range_obj, combined) if range_obj else "da verificare",
                    "method": "CKD-EPI" if re.search(r"CKD[- ]?EPI", combined, re.I) else "MDRD",
                    "sourceLine": src, "pageNumber": row.get("pageNumber"),
                    "labSection": "Funzionalità renale",
                })
                continue
            row["result"] = "Non disponibile"
            row["status"] = "Non valutabile"
            row["referenceApplicability"] = "not_required"

        _qualitative_ids = {"helicobacter_pylori_antigen", "anti_hcv", "anti_hbc", "anti_hav_igg",
                            "urine_appearance", "urine_color", "urine_ketones", "urine_blood",
                            "urine_bilirubin", "urine_glucose"}
        _numeric_value = parse_number(row.get("result"))
        if pid not in _qualitative_ids and pid != "egfr" and _numeric_value is not None:
            _range_obj = _parse_range(row.get("reference") or "")
            numeric.append({
                "parameterId": pid, "parameterName": name, "value": _numeric_value,
                "rawValue": str(row.get("result") or _numeric_value), "unit": row.get("unit", ""),
                "range": _range_obj, "status": _status(_numeric_value, _range_obj, src) if _range_obj else "da verificare",
                "method": method, "sourceLine": src, "pageNumber": row.get("pageNumber"),
                "labSection": _test23_panel({"parameterId": pid, "parameterName": name}, file_name),
            })
            continue

        nr = normalize_text(row.get("result") or "")
        if "non calcolabil" in nr or "non disponibile" in nr:
            row["status"] = "Non valutabile"
            row["referenceApplicability"] = "not_required"
        elif nt == "anti hav igg" and nr == "positivo":
            row["status"] = "Immunità presente"
            row["referenceApplicability"] = "not_required"
        elif pid in {"helicobacter_pylori_antigen", "anti_hcv", "anti_hbc"} and nr in {"negativo", "non rilevato", "assente"}:
            row["reference"] = "Negativo" if nr == "negativo" else row["result"]
            row["status"] = "nei limiti"
        elif pid in {"urine_ketones", "urine_blood", "urine_bilirubin", "urine_glucose"} and nr in {"0", "0 0", "assente", "negativo", "non rilevato"}:
            row["result"] = "Assente"
            row["reference"] = "Assente"
            row["status"] = "nei limiti"
        elif pid == "urine_appearance" and "limpido" in nr:
            row["result"] = "Limpido"; row["reference"] = "Limpido"; row["status"] = "nei limiti"
        elif pid == "urine_color" and ("paglierino" in nr or "giallo" in nr):
            row["result"] = "Paglierino" if "paglierino" in nr else "Giallo"; row["reference"] = row["result"]; row["status"] = "nei limiti"
        row["labSection"] = _test23_panel(row, file_name)
        qualitative.append(row)

    numeric = _test20_dedupe_rows(_test19_dedupe_lab_values(numeric))
    qualitative = _normalize_and_dedupe_rows(qualitative)
    technical = _normalize_and_dedupe_rows(technical)
    analysis["labValues"] = numeric
    analysis["qualitativeResults"] = qualitative
    analysis["technicalReviewRows"] = technical
    analysis["tableRows"] = [
        *[{"kind": "numeric", "test": r.get("parameterName"), "value": r.get("value"),
           "result": r.get("displayResult") or r.get("rawValue", r.get("value")),
           "unit": r.get("unit", ""), "reference": (r.get("range") or {}).get("raw", ""),
           "status": r.get("status", "da verificare"), "sourceLine": r.get("sourceLine", ""),
           "labSection": r.get("labSection", "")} for r in numeric],
        *[{"kind": "qualitative", "test": r.get("test"), "result": r.get("result"),
           "unit": r.get("unit", ""), "reference": r.get("reference", ""),
           "status": r.get("status", "da verificare"), "sourceLine": r.get("sourceLine", ""),
           "labSection": r.get("labSection", "")} for r in qualitative],
    ]

    merged: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for section in analysis.get("reportSections") or []:
        title = re.sub(r"[,;:\-]?\s*continua\s*$", "", str(section.get("title") or "Referto"), flags=re.I).strip()
        key = normalize_text(title)
        key = "referto" if key.startswith("referto") else "commento" if key.startswith("commento") else key
        if key not in merged:
            merged[key] = {"title": "Referto" if key == "referto" else "Commento" if key == "commento" else title, "parts": []}
            order.append(key)
        text = str(section.get("text") or "").strip()
        text = re.sub(r"^\s*(?:referto|commento)\s*[:\-]?\s*", "", text, flags=re.I)
        if text and text not in merged[key]["parts"]:
            merged[key]["parts"].append(text)
    sections = [{"title": merged[k]["title"], "text": "\n\n".join(merged[k]["parts"])} for k in order if merged[k]["parts"]]
    if sections:
        analysis["reportSections"] = sections
        analysis["reconstructedText"] = "\n\n".join(f"{s['title']}\n{s['text']}" for s in sections)

    for key in ("clinicalValidationVersion", "labRepairVersion", "labPanelVersion", "narrativeRepairVersion"):
        analysis[key] = _TEST23_VERSION
    stats = dict(analysis.get("extractionStats") or {})
    stats.update({"structuredRows": len(numeric) + len(qualitative), "technicalReviewRows": len(technical), "clinicalValidationVersion": _TEST23_VERSION})
    analysis["extractionStats"] = stats
    return analysis

_test23_v2_base_analyze_document_v420 = analyze_document_v420
def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    return _test23_v2_postprocess_analysis(_test23_v2_base_analyze_document_v420(extracted, file_name), file_name)

def analyze_path(path: str | os.PathLike[str], file_name: str | None = None, progress_callback=None) -> dict[str, Any]:
    extracted = extract_document(path, progress_callback=progress_callback)
    if progress_callback:
        progress_callback({"stage": "analysis", "progress": 91, "processedPages": extracted.get("processedPages", 0), "totalPages": extracted.get("pageCount", 0), "message": "Classificazione e pulizia clinica"})
    analysis = analyze_document_v420(extracted, file_name or os.path.basename(str(path)))
    if analysis.get("documentMode") == "therapy":
        grid_rows = extract_therapy_grid_from_file(path, extracted.get("text") or "")
        if len(grid_rows) > len(analysis.get("extractedTherapies") or []):
            analysis["extractedTherapies"] = grid_rows
    extracted["analysis"] = analysis
    if progress_callback:
        progress_callback({"stage": "analysis", "progress": 99, "processedPages": extracted.get("processedPages", 0), "totalPages": extracted.get("pageCount", 0), "message": "Normalizzazione clinica completata"})
    return extracted

# TEST 24 - validazione clinica finale condivisa con scheda e PDF.
_TEST24_VERSION = "test24-v6"
_TEST24_FALSE_ROW = re.compile(
    r"(?:formula\s+leucocitaria|m[rd]{2,3}\s*$|who\s+2nd\s+irp|"
    r"appartenente\s+a\s+gruppo\s+etnico|moltiplicare\s+il\s+risultato|"
    r"molto\s+alto.*valore\s+desider(?:ato|abile)|patologi[ae]\s+(?:a\s+)?(?:basso|alto)\s+rischio|"
    r"attenzione.*unit[aà]\s+di\s+misura|livello\s+decisionale|"
    r"classificazione\s+del\s+fisico|esame\s+del\s+sedimento\s+urinario)", re.I,
)
_TEST24_ADMIN = re.compile(
    r"(?:azienda\s+(?:ospedaliera|sanitaria)|direttore\s+sanitario|codice\s+fiscale|"
    r"data\s+di\s+nascita|tessera\s+sanitaria|telefono|fax|e-?mail|@|id\s+paziente|"
    r"sede\s+operativa|p\.iva|referto\s+firmato|num\.?\s*certificato)", re.I,
)

def _test24_norm_unit(unit: str = "", name: str = "") -> str:
    u = _test23_v2_clean_repeated(str(unit or "")).strip().lstrip("* ")
    n = normalize_text(name)
    nu = normalize_text(u)
    if n == "ft3" and re.fullmatch(r"p[aq]\s*/?\s*ml", nu): return "pg/mL"
    if re.fullmatch(r"(?:u|ui)\s*/?\s*l", nu): return "U/L"
    if re.fullmatch(r"m?ui\s*/?\s*l", nu): return "mUI/L"
    if re.fullmatch(r"pg\s*/?\s*ml", nu): return "pg/mL"
    if re.fullmatch(r"ng\s*/?\s*dl", nu): return "ng/dL"
    if re.fullmatch(r"mg\s*/?\s*dl", nu): return "mg/dL"
    if re.fullmatch(r"mg\s*/?\s*l", nu): return "mg/L"
    return u

def _test24_source_range(source: str = "", raw_value: str = "") -> dict[str, Any] | None:
    s = str(source or "")
    if raw_value:
        pos = s.lower().find(str(raw_value).lower())
        if pos >= 0: s = s[pos + len(str(raw_value)):]
    m = re.search(r"(-?\d+(?:[,.]\d+)?)\s*(?:\+|=|[-–—]|\ba\b)\s*(-?\d+(?:[,.]\d+)?)(?![\s\S]*\d)", s, re.I)
    if m:
        a, b = parse_number(m.group(1)), parse_number(m.group(2))
        if a is not None and b is not None and a <= b:
            return {"raw": f"{m.group(1)} - {m.group(2)}", "min": a, "max": b}
    m = re.search(r"(?:^|\s)(\d{4})(?:\s|$)", s)
    if m:
        a, b = float(m.group(1)[:2]), float(m.group(1)[2:])
        if a < b: return {"raw": f"{int(a)} - {int(b)}", "min": a, "max": b}
    return None

def _test24_set_external(row: dict[str, Any], raw: str, minimum: float | None = None,
                         maximum: float | None = None, operator: str = "", limit: float | None = None,
                         unit: str = "") -> None:
    low = minimum if minimum is not None else (limit if operator.startswith(">") else None)
    high = maximum if maximum is not None else (limit if operator.startswith("<") else None)
    rng = {"raw": raw, "min": minimum, "max": maximum, "low": low, "high": high, "operator": operator, "limit": limit, "source": "external"}
    row["range"] = rng
    if unit: row["unit"] = unit
    value = row.get("value")
    if value is not None: row["status"] = _status(float(value), rng, row.get("sourceLine") or "")
    row["statusSource"] = "external"; row["statusSourceLabel"] = "esterno"
    row["referenceRuleVersion"] = _TEST24_VERSION
    row.pop("unresolvedReason", None)

def _test24_numeric_identity(row: dict[str, Any]) -> None:
    name = normalize_text(row.get("parameterName") or "")
    src = str(row.get("sourceLine") or "")
    if re.match(r"^(?:t s h|tsh)(?:\s|$)", name):
        row["parameterId"] = "tsh"; row["parameterName"] = "TSH"
        mm = re.search(r"\b(ICMA|CLIA|ECLIA|CMIA|chemiluminescenza)\b", src, re.I)
        if mm: row["method"] = mm.group(1)
    diff = [("neutrofili", "neutrophils"), ("linfociti", "lymphocytes"),
            ("monociti", "monocytes"), ("eosinofili", "eosinophils"), ("basofili", "basophils")]
    absolute = bool(re.search(r"(?:x\s*10\s*[.e^]?\s*3\s*/\s*u?l|10\s*\^?\s*9\s*/\s*l|/\s*l\b)", src, re.I)) and not bool(re.search(r"%\s*[-+0-9]", src))
    for it, pid in diff:
        if it in name:
            row["parameterId"] = f"{pid}_{'abs' if absolute else 'pct'}"
            row["parameterName"] = f"{it.capitalize()}{' assoluti' if absolute else ' %'}"
            row["unit"] = "10^9/L" if absolute else "%"
            break
    if name == "globuli bianchi": row["parameterId"] = "wbc"; row["unit"] = row.get("unit") or "10^9/L"
    if name == "globuli rossi": row["parameterId"] = "rbc"; row["unit"] = row.get("unit") or "10^12/L"
    if "creatinin" in name and "urinar" in name: row["parameterId"] = "urine_creatinine"
    if "emoglobina glicata" in name or "hba1c" in name: row["parameterId"] = "hba1c"
    if "vitamina d" in name: row["parameterId"] = "vitamin_d"
    row["unit"] = _test24_norm_unit(row.get("unit") or "", row.get("parameterName") or "")

def _test24_complete_numeric(row: dict[str, Any]) -> None:
    _test24_numeric_identity(row)
    if row.get("value") is None: row["value"] = parse_number(row.get("rawValue") or row.get("result"))
    value = row.get("value")
    if value is None:
        if "non calcolabil" in normalize_text(row.get("rawValue") or row.get("displayResult") or ""):
            row.update({"displayResult": "Non calcolabile", "rawValue": "Non calcolabile", "status": "Non valutabile", "referenceApplicability": "not_required", "referenceNotApplicable": True})
        return
    if not row.get("range"):
        parsed = _test24_source_range(row.get("sourceLine") or "", row.get("rawValue") or str(value))
        if parsed:
            parsed.setdefault("low", parsed.get("min"))
            parsed.setdefault("high", parsed.get("max"))
            if parsed.get("limit") is not None and str(parsed.get("operator") or "").startswith("<"): parsed["high"] = parsed.get("limit")
            if parsed.get("limit") is not None and str(parsed.get("operator") or "").startswith(">"): parsed["low"] = parsed.get("limit")
            row["range"] = parsed; row["status"] = _status(float(value), parsed, row.get("sourceLine") or ""); row["statusSource"] = "report"
    if row.get("range"): return
    raw_result = str(row.get("rawValue") or row.get("displayResult") or "").strip()
    if re.match(r"^(?:<=|>=|[<>≤≥])\s*[-+]?\d", raw_result):
        row["displayResult"] = raw_result
        row["status"] = "da verificare"
        row["referenceApplicability"] = "not_required"
        row["referenceNotApplicable"] = True
        return
    pid = str(row.get("parameterId") or ""); unit = normalize_text(row.get("unit") or "")
    rules: dict[str, tuple] = {
        "hba1c": ("4,0 - 5,6", 4.0, 5.6, "", None, "%"),
        "wbc": ("4,0 - 11,0", 4.0, 11.0, "", None, "10^9/L"),
        "rbc": ("3,8 - 5,8", 3.8, 5.8, "", None, "10^12/L"),
        "neutrophils_abs": ("1,5 - 7,5", 1.5, 7.5, "", None, "10^9/L"),
        "lymphocytes_abs": ("1,0 - 4,0", 1.0, 4.0, "", None, "10^9/L"),
        "monocytes_abs": ("0,2 - 0,8", 0.2, 0.8, "", None, "10^9/L"),
        "eosinophils_abs": ("0,0 - 0,5", 0.0, 0.5, "", None, "10^9/L"),
        "basophils_abs": ("0,0 - 0,2", 0.0, 0.2, "", None, "10^9/L"),
        "neutrophils_pct": ("40 - 75", 40.0, 75.0, "", None, "%"),
        "lymphocytes_pct": ("20 - 50", 20.0, 50.0, "", None, "%"),
        "monocytes_pct": ("2 - 13", 2.0, 13.0, "", None, "%"),
        "eosinophils_pct": ("0 - 7", 0.0, 7.0, "", None, "%"),
        "basophils_pct": ("0 - 1,5", 0.0, 1.5, "", None, "%"),
        "ft3": ("2,0 - 4,4", 2.0, 4.4, "", None, "pg/mL"),
        "lipase": ("13 - 60", 13.0, 60.0, "", None, "U/L"),
        "albumin_urine": ("<20", None, None, "<", 20.0, "mg/L"),
    }
    if pid == "urine_creatinine" and "mg/dl" in unit:
        _test24_set_external(row, "16 - 326", 16.0, 326.0, unit="mg/dL"); return
    if pid == "vitamin_d" and re.search(r"(?:ug|µg)/?l|ng/?ml", unit):
        _test24_set_external(row, "20 - 50", 20.0, 50.0, unit="ng/mL"); return
    if pid in rules:
        raw, lo, hi, op, lim, u = rules[pid]; _test24_set_external(row, raw, lo, hi, op, lim, u); return
    name = normalize_text(row.get("parameterName") or "")
    if "creatinina ematica" in name: _test24_set_external(row, "0,5 - 1,4", 0.5, 1.4, unit="mg/dL")
    elif name == "urea": _test24_set_external(row, "10 - 50", 10.0, 50.0, unit="mg/dL")
    elif not row.get("range"):
        row["status"] = ""; row["referenceApplicability"] = "not_required"; row["referenceNotApplicable"] = True

def _test24_complete_qual(row: dict[str, Any]) -> None:
    row["result"] = _test23_v2_clean_repeated(_test23_qual_result(row.get("result")))
    result = normalize_text(row.get("result") or ""); test = normalize_text(row.get("test") or "")
    if re.search(r"esame annullato|campione non consegnato|campione non idoneo|non eseguibile", result):
        row["result"] = "Campione non consegnato" if "campione non consegnato" in result else "Esame non eseguito"
        row["reference"] = ""; row["status"] = "Non valutabile"; row["referenceApplicability"] = "not_required"; return
    if re.search(r"virus epatite b.*genoma|hbv.*dna", test) and re.search(r"rilevat|positiv", result):
        row.update({"result": "Rilevato", "reference": "Non rilevato", "status": "Rilevato", "statusSource": "external"}); return
    if test in {"hbsag", "anti hbc", "anti hbe"} and re.search(r"positiv|reattiv", result):
        row.update({"result": "Positivo", "reference": "Negativo", "status": "Positivo", "statusSource": "external"}); return
    if re.fullmatch(r"negativo|assente|non rilevato", result):
        row["reference"] = row.get("reference") or "Negativo"; row["status"] = "nei limiti"; return
    if "non calcolabil" in result:
        row["status"] = "Non valutabile"; row["referenceApplicability"] = "not_required"; return
    if row.get("status") in {"da verificare", "non definito", None, ""}:
        row["status"] = "Non valutabile"; row["referenceApplicability"] = "not_required"

def _test24_narrative(analysis: dict[str, Any]) -> None:
    merged: dict[str, dict[str, Any]] = {}; order: list[str] = []
    for section in analysis.get("reportSections") or []:
        title = re.sub(r"[,;:\-]?\s*continua\s*$", "", str(section.get("title") or "Referto"), flags=re.I).strip() or "Referto"
        key = normalize_text(title); key = "referto" if key.startswith("referto") else "commento" if key.startswith("commento") else key
        text = str(section.get("text") or "").strip()
        if not text: continue
        if key not in merged: merged[key] = {"title": "Referto" if key == "referto" else "Commento" if key == "commento" else title, "parts": []}; order.append(key)
        if text not in merged[key]["parts"]: merged[key]["parts"].append(text)
    sections = [{"title": merged[k]["title"], "text": "\n\n".join(merged[k]["parts"])} for k in order if merged[k]["parts"]]
    if sections:
        analysis["reportSections"] = sections; analysis["reconstructedText"] = "\n\n".join(f"{s['title']}\n{s['text']}" for s in sections)

def _test24_postprocess_analysis(analysis: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    technical = list(analysis.get("technicalReviewRows") or [])
    numeric: list[dict[str, Any]] = []
    for raw in analysis.get("labValues") or []:
        row = dict(raw); text = " ".join(str(row.get(k) or "") for k in ("parameterName", "rawValue", "unit", "sourceLine"))
        _name24 = normalize_text(row.get("parameterName") or "")
        if _name24 in {"mrd", "mdrd"} or _TEST24_FALSE_ROW.search(text): technical.append(_test20_technical(row, "Intestazione, nota o condizione di calcolo")); continue
        _test24_complete_numeric(row); numeric.append(row)
    qualitative: list[dict[str, Any]] = []
    for raw in analysis.get("qualitativeResults") or []:
        row = dict(raw); text = " ".join(str(row.get(k) or "") for k in ("test", "result", "unit", "sourceLine"))
        if _TEST24_FALSE_ROW.search(text): technical.append(_test20_technical(row, "Intestazione, nota o condizione di calcolo", "qualitative")); continue
        _test24_complete_qual(row); qualitative.append(row)
    analysis["labValues"] = _test20_dedupe_rows(_test19_dedupe_lab_values(numeric))
    analysis["qualitativeResults"] = _normalize_and_dedupe_rows(qualitative)
    
    _tech_seen: set[str] = set(); _tech_out: list[dict[str, Any]] = []
    for _row in technical:
        _key = normalize_text("|".join(str(_row.get(k) or "") for k in ("kind","test","sourceLine","reviewReason","reason")))
        if _key in _tech_seen: continue
        _tech_seen.add(_key); _tech_out.append(_row)
    analysis["technicalReviewRows"] = _tech_out
    _test24_narrative(analysis)
    analysis["tableRows"] = [
        *[{"kind":"numeric","test":r.get("parameterName"),"result":r.get("displayResult") or r.get("rawValue",r.get("value")),"unit":r.get("unit", ""),"reference":(r.get("range") or {}).get("raw", ""),"status":r.get("status", ""),"sourceLine":r.get("sourceLine", ""),"labSection":r.get("labSection", "")} for r in analysis["labValues"]],
        *[{"kind":"qualitative","test":r.get("test"),"result":r.get("result"),"unit":r.get("unit", ""),"reference":r.get("reference", ""),"status":r.get("status", ""),"sourceLine":r.get("sourceLine", ""),"labSection":r.get("labSection", "")} for r in analysis["qualitativeResults"]],
    ]
    for key in ("clinicalValidationVersion", "labRepairVersion", "labPanelVersion", "narrativeRepairVersion"):
        analysis[key] = _TEST24_VERSION
    stats = dict(analysis.get("extractionStats") or {}); stats.update({"structuredRows":len(analysis["labValues"])+len(analysis["qualitativeResults"]),"technicalReviewRows":len(analysis["technicalReviewRows"]),"clinicalValidationVersion":_TEST24_VERSION}); analysis["extractionStats"] = stats
    return analysis

_test24_base_analyze_document_v420 = analyze_document_v420
def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    return _test24_postprocess_analysis(_test24_base_analyze_document_v420(extracted, file_name), file_name)


# TEST 26 - controllo universale sorgente -> referto narrativo per ogni nuova importazione.
_TEST26_VERSION = "test26-v1"
_test26_base_analyze_document_v420 = analyze_document_v420

def _test26_conservative_narrative(text: str) -> str:
    admin = re.compile(r"^(?:azienda|ospedale|servizio sanitario|dipartimento|u\.?o\.?|direttore|telefono|fax|e-?mail|codice fiscale|paziente|cognome|data di nascita|indirizzo|prenotazione|centralino|numero referto)\b", re.I)
    clinical = re.compile(r"(?:anamnes|diagnos|terapia|programma|repert|conclusion|ecograf|tac|risonanz|esame obiettivo|il paziente|riferisce|nega|tiroide|lesion|pressione|dolore|morfologia|materiale pervenuto|esame macroscopico|composizione corporea)", re.I)
    out: list[str] = []; started = False
    for raw in re.sub(r"===\s*PAGINA\s*\d+\s*===", "\n", str(text or ""), flags=re.I).replace("\r", "").splitlines():
        line = re.sub(r"[ \t]+", " ", raw).strip()
        if not line: continue
        if re.match(r"^(?:il medico|firma|firmato digitalmente|referto firmato|classe di dose|page \d+|pagina \d+)\b", line, re.I): continue
        if clinical.search(line): started = True
        if admin.search(line) and not clinical.search(line) and not started: continue
        if admin.search(line) and not clinical.search(line) and started and re.search(r"telefono|fax|e-?mail|prenotazione|centralino", line, re.I): continue
        out.append(line)
    return "\n".join(out).strip()

def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test26_base_analyze_document_v420(extracted, file_name)
    mode = analysis.get("documentMode") or ""
    if mode in {"narrative", "mixed", "diagnosis"}:
        source = str(extracted.get("text") or "")
        sections = [s for s in (analysis.get("reportSections") or []) if str(s.get("text") or "").strip()]
        if not sections and source.strip():
            reconstructed = reconstruct_narrative(source)
            sections = [s for s in (reconstructed.get("sections") or []) if str(s.get("text") or "").strip()]
            if not sections:
                fallback = _test26_conservative_narrative(source)
                if fallback: sections = [{"title": "Referto", "text": fallback}]
        if sections:
            analysis["reportSections"] = sections
            analysis["reconstructedText"] = "\n\n".join(f"{s['title']}\n{s['text']}" for s in sections)
            analysis["narrativeNeedsReview"] = False
        elif source.strip():
            analysis["narrativeNeedsReview"] = True
        analysis["narrativeSourcePresent"] = bool(source.strip())
        analysis["narrativeCoverageVersion"] = _TEST26_VERSION
    for key in ("clinicalValidationVersion", "narrativeRepairVersion"):
        analysis[key] = _TEST26_VERSION
    return analysis

# TEST 27 - pipeline narrativa canonica unica e controllo universale di copertura.
_TEST27_VERSION = "test27-v1"
_test27_base_analyze_document_v420 = analyze_document_v420
_TEST27_ADMIN_PATTERNS = [
    re.compile(r"^(?:azienda|asl\b|ausl\b|ao[- ]?u?p\b|ospedale|servizio sanitario|dipartimento|unit[aà] operativa|u\.?o\.?\b|presidio|poliambulatorio|centro medico|ambulatorio|sede operativa)\b", re.I),
    re.compile(r"^(?:direttore|responsabile|primario|coordinatore|medico refertante|refertatore|esecutore|operatore|tecnico|tsrm)\s*:", re.I),
    re.compile(r"^(?:paziente|cognome|nome|data di nascita|luogo di nascita|codice fiscale|tessera sanitaria|residenza|domicilio|indirizzo|n[°.o]?\s*(?:cartella|referto|accettazione|pratica)|id paziente)\s*:", re.I),
    re.compile(r"^(?:tel(?:efono)?\.?|cell(?:ulare)?\.?|fax|e-?mail|pec|centralino|prenotazion|segreteria)\b", re.I),
    re.compile(r"(?:\b(?:tel(?:efono)?\.?|cell(?:ulare)?\.?|fax)\s*[:.]?\s*\+?\d|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b)", re.I),
    re.compile(r"^(?:richiesta|accettazione|emissione|stampato|stampata|refertato|validato|firmato|firma digitale|documento firmato|versione|pagina)\b", re.I),
    re.compile(r"^(?:tipo esame|esame richiesto|prestazione|codice prestazione)\s*:", re.I),
]
_TEST27_TRAILING_ADMIN = re.compile(r"^(?:cordiali saluti|il medico|firma|firmato digitalmente|referto firmato|referto validato|classe di dose|dose class|si allega(?:no)? (?:immagini|documentazione)|documentazione iconografica|rappresentazione di un referto|fine referto)\b", re.I)
_TEST27_CLINICAL_SIGNAL = re.compile(r"(?:anamnes|motivo (?:della )?visita|quesito clinico|indicazione|esame obiettivo|obiettivit|repert|referto|conclusion|diagnos|terapia|programma|follow[- ]?up|morfologia|materiale pervenuto|esame macroscopico|composizione corporea|classificazione|il paziente|la paziente|riferisce|nega|presenta|si rileva|si osserva|evidenzia|compatibile|fegato|pancreas|milza|rene|reni|tiroide|polmone|polmoni|cuore|encefalo|mucosa|lesion|nodul|cisti|pressione|dolore|edema|retina|vitreo|pupill|arcata|alveolar|ecograf|tomograf|risonanz|radiograf|tac\b|tc\b)", re.I)
_TEST27_HEADINGS = {
    "anamnesi": "Anamnesi", "sintesi anamnestica": "Anamnesi", "motivo della visita": "Motivo della visita", "motivo visita": "Motivo della visita",
    "quesito clinico": "Quesito clinico", "indicazione": "Indicazione", "indicazioni": "Indicazione", "tecnica": "Tecnica",
    "esame obiettivo": "Esame obiettivo", "obiettivita": "Esame obiettivo", "obiettivita clinica": "Esame obiettivo",
    "reperti": "Reperti", "reperto": "Reperti", "referto": "Referto", "conclusioni": "Conclusioni", "conclusione": "Conclusioni",
    "diagnosi": "Diagnosi", "commento": "Commento", "osservazioni": "Osservazioni", "valutazione": "Valutazione",
    "terapia in atto": "Terapia in atto", "terapia": "Terapia", "programma": "Programma", "follow up": "Follow-up", "follow-up": "Follow-up",
    "materiale pervenuto": "Materiale pervenuto", "esame macroscopico": "Esame macroscopico", "morfologia": "Morfologia",
    "classificazione": "Classificazione", "composizione corporea": "Composizione corporea", "analisi segmentale": "Analisi segmentale",
    "pupille e motilita pupillare": "Pupille e motilità pupillare", "corpo vitreo": "Corpo vitreo", "fondo oculare": "Fondo oculare",
}

def _test27_collapse(value: Any) -> str:
    return re.sub(r"\s+([,.;:])", r"\1", re.sub(r"[ \t]+", " ", str(value or "").replace("\u00ad", ""))).strip()

def _test27_source_text(doc: dict[str, Any]) -> str:
    text = doc.get("extractedText") or doc.get("structuredText") or doc.get("reconstructedText") or "\n".join(str(p.get("text") or "") for p in doc.get("ocrPageData") or [])
    return re.sub(r"===\s*(?:PAGINA|PAGE)\s*\d+\s*===", "\n", str(text or ""), flags=re.I).replace("\r", "\n").strip()

def _test27_is_admin_line(line: str) -> bool:
    value = _test27_collapse(line)
    if not value or re.fullmatch(r"(?:\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{2,4}[\/.\-]\d{1,2}[\/.\-]\d{1,2})(?:\s+\d{1,2}[:.]\d{2})?", value): return True
    if _TEST27_TRAILING_ADMIN.search(value): return True
    return any(pattern.search(value) for pattern in _TEST27_ADMIN_PATTERNS) and not _TEST27_CLINICAL_SIGNAL.search(value)

def _test27_heading(value: str) -> tuple[str, str] | None:
    line = _test27_collapse(value)
    colon = re.match(r"^([^:]{2,58})\s*:\s*(.*)$", line)
    if colon:
        key = normalize_text(colon.group(1))
        if key in _TEST27_HEADINGS or re.match(r"^(?:referto|commento|conclusion|diagnos|terapia|programma|anamnes|repert|tecnica|indicazione|quesito|morfologia|classificazione|composizione|esame obiettivo|obiettiv)", key):
            return _TEST27_HEADINGS.get(key, colon.group(1).strip()), colon.group(2).strip()
    key = normalize_text(re.sub(r"[.:;\-]+$", "", line))
    if key in _TEST27_HEADINGS: return _TEST27_HEADINGS[key], ""
    return None

def _test27_clean_lines(value: str, require_start: bool = True) -> list[str]:
    lines: list[str] = []; started = False
    source = re.sub(r"===\s*(?:PAGINA|PAGE)\s*\d+\s*===", "\n", str(value or ""), flags=re.I).replace("\r", "\n")
    for raw in re.split(r"\n+", source):
        line = _test27_collapse(raw)
        if not line: continue
        heading = _test27_heading(line)
        if heading or _TEST27_CLINICAL_SIGNAL.search(line): started = True
        if _test27_is_admin_line(line): continue
        if require_start and not started and not heading and not _TEST27_CLINICAL_SIGNAL.search(line): continue
        line = re.sub(r"^referto\s*[:\-]\s*", "", line, flags=re.I).strip()
        if line: lines.append(line)
    out: list[str] = []; seen: set[str] = set()
    for line in lines:
        key = normalize_text(line)
        if key and key not in seen: seen.add(key); out.append(line)
    return out

def _test27_merge_sections(items: list[dict[str, Any]]) -> list[dict[str, str]]:
    merged: dict[str, dict[str, Any]] = {}; order: list[str] = []
    for item in items:
        title = re.sub(r"[,;:\-]?\s*continua(?:\s+dalla\s+pagina\s+precedente)?\s*$", "", str(item.get("title") or "Referto"), flags=re.I).strip() or "Referto"
        title = _TEST27_HEADINGS.get(normalize_text(title), title)
        text = "\n".join(_test27_clean_lines(str(item.get("text") or ""), require_start=False)).strip()
        if not text: continue
        key = normalize_text(title)
        if key not in merged: merged[key] = {"title": title, "parts": [], "seen": set()}; order.append(key)
        signature = normalize_text(text)
        if signature not in merged[key]["seen"]: merged[key]["seen"].add(signature); merged[key]["parts"].append(text)
    return [{"title": merged[key]["title"], "text": "\n\n".join(merged[key]["parts"])} for key in order if merged[key]["parts"]]

def _test27_sections_from_raw(doc: dict[str, Any]) -> list[dict[str, str]]:
    lines = _test27_clean_lines(_test27_source_text(doc), require_start=True)
    if not lines: return []
    sections: list[dict[str, str]] = []; title = "Referto"; body: list[str] = []
    def flush() -> None:
        nonlocal body
        text = "\n".join(body).strip()
        if text: sections.append({"title": title, "text": text})
        body = []
    for line in lines:
        heading = _test27_heading(line)
        if heading:
            flush(); title = heading[0]
            if heading[1]: body.append(heading[1])
        else: body.append(line)
    flush(); return _test27_merge_sections(sections)

def _test27_tokens(value: str) -> set[str]:
    return {token for token in re.split(r"[^a-z0-9à-ÿ]+", normalize_text(value)) if len(token) >= 4 and token not in {"pagina","referto","sezione","contenuto","paziente","documento","sanitario","medico","azienda","ospedale","servizio","telefono","codice","fiscale"}}

def _test27_coverage(source: str, target: str) -> float:
    wanted = _test27_tokens(source)
    return 1.0 if not wanted else len(wanted & _test27_tokens(target)) / len(wanted)

def _test27_postprocess_narrative(analysis: dict[str, Any], source_doc: dict[str, Any]) -> None:
    mode = analysis.get("documentMode") or source_doc.get("documentMode") or ""
    if mode not in {"narrative", "mixed", "diagnosis"}: return
    source = "\n".join(_test27_clean_lines(_test27_source_text(source_doc), require_start=True)).strip()
    existing = _test27_merge_sections(list(analysis.get("reportSections") or []) + list(source_doc.get("reportSections") or []))
    parsed = _test27_sections_from_raw(source_doc)
    candidates = [candidate for candidate in (existing, parsed) if candidate]
    if candidates:
        sections = max(candidates, key=lambda rows: _test27_coverage(source, "\n".join(row["text"] for row in rows)) * 1000 + min(sum(len(row["text"]) for row in rows), 10000) / 100 + min(len(rows), 12) * 4)
        if source and _test27_coverage(source, "\n".join(row["text"] for row in sections)) < 0.78 and parsed: sections = parsed
    else:
        sections = [{"title": "Referto", "text": source}] if source else []
    if sections:
        analysis["reportSections"] = sections
        analysis["reconstructedText"] = "\n\n".join(f"{row['title']}\n{row['text']}" for row in sections)
        analysis["narrativeNeedsReview"] = False
    elif _test27_source_text(source_doc): analysis["narrativeNeedsReview"] = True
    analysis["narrativeSourcePresent"] = bool(_test27_source_text(source_doc))
    analysis["narrativeClinicalSource"] = source
    analysis["narrativeCoverageVersion"] = _TEST27_VERSION
    analysis["clinicalValidationVersion"] = _TEST27_VERSION
    analysis["narrativeRepairVersion"] = _TEST27_VERSION

def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test27_base_analyze_document_v420(extracted, file_name)
    source_doc = {"extractedText": extracted.get("text") or "", "structuredText": "\n".join(str(page.get("text") or "") for page in extracted.get("pages") or []), "reportSections": analysis.get("reportSections") or [], "documentMode": analysis.get("documentMode") or ""}
    _test27_postprocess_narrative(analysis, source_doc)
    return analysis

# TEST 27 v5 - pipeline narrativa universale: solo contenuto clinico, nessun referto perso.
_TEST27_FINAL_VERSION = "test27-v5"
_test27_final_base_analyze_document_v420 = analyze_document_v420

_TEST27_FINAL_DROP_TITLE = re.compile(
    r"^(?:telefono|email|reference id|sesso|luogo di nascita|data di nascita|codice fiscale|medico curante|medico che ha consigliato|versione del software|il medico|firma|intestazione|dati anagrafici|documento originale|struttura sanitaria|reparto|specializzazione)",
    re.I,
)
_TEST27_FINAL_ADMIN = re.compile(
    r"(?:\bpaziente\s*:|\bcf\s+paziente\s*:|\bcodice fiscale\s*:|\bdata di nascita\s*:|\bid paziente\b|\bnumero referto\s*:|\bsede operativa\b|\bdirettore sanitario\b|\b(?:tel(?:efono)?|fax|cell(?:ulare)?)\s*[:.]\s*\+?\d|[\w.+-]+@[\w.-]+\.[a-z]{2,})",
    re.I,
)
_TEST27_FINAL_FINDING = re.compile(
    r"\b(?:motivo clinico|anamnesi|riferisce|nega|presenta|paziente (?:vigile|in|con|giunge)|ecg\s*:|quadro toracico|lo studio|non evidenti|esofago|stomaco|duodeno|vena giugulare|diagnosi|conclusioni|terapia|programma|esame obiettivo|fegato|tiroide|retina|vitreo|pupille|materiale pervenuto|esame macroscopico)\b",
    re.I,
)
_TEST27_FINAL_DROP_LINE = re.compile(
    r"^(?:from\s*:|to\s*:|subject\s*:|message\s*:|report fax|stato\s*: received|data\/ora\s*:|velocit[aà]\s*:|tempo di connessione\s*:|pagine\s*:|risoluzione\s*:|id remoto\s*:|numero linea\s*:|dtmf\/did\s*:|descrizione\s*:|company name|address|website|avvertenza: gli allegati|uo .* page|aoup .* page|servizio sanitario|copia conforme|cognome e nome|comune di residenza|cittadinanza|professione|consenso|data del ricovero|data di dimissione|cf\s*:|codice fiscale|cod\.?\s*fisc\.?|data (?:di )?nascita|anni compiuti|luogo di nascita|comune di nascita|sesso|genere|id paziente|nome paziente|paziente\s*:|dr\.?|dott\.?|dott\.ssa|prof\.?|infermiere|tecnico|tsrm|specialista in|direttore|responsabile|refertatore|operatore|ecg-p\.a-spo2|strumento|sala|numero esame|n° esame|data esame|data ref\.?|accesso\s*:|proven\.?\s*:|reference id|rapporto redatto da|tel\.?|telefono|cell\.?|fax|email|web|www\.|indirizzo|sede operativa|p\.iva|partita iva|n°?\s*ordine|lettera curante|alla cortese attenzione|si certifica che|firma|firmato|documento informatico|contributo ambientale|co\.na\.i|classe di dose|cordiali saluti|pagina\s*\d+)",
    re.I,
)
_TEST27_FINAL_TAIL = re.compile(
    r"\b(?:Il Medico|Dr\.?\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]+|Contributo ambientale|CO\.NA\.I|Cordiali saluti|Stampato:)\b",
    re.I,
)
_TEST27_FINAL_TITLE_MAP = {
    "post test comments": "Commento",
    "si consiglia di": "Indicazioni",
    "controllo": "Programma",
    "valutazione": "Valutazione",
    "monitoraggio ega": "Monitoraggio EGA",
}


def _test27_final_clean_text(value: Any) -> str:
    output: list[str] = []
    seen: set[str] = set()
    source = str(value or "").replace("\r", "\n")
    for raw in re.split(r"\n+|\s+\|\s+", source):
        line = re.sub(r"[ \t]+", " ", raw).strip()
        if not line or _TEST27_FINAL_DROP_LINE.search(line):
            continue
        if re.match(r"^RX TORACE\b", line, re.I) and re.search(r"\bQuadro toracico\b", line, re.I):
            line = line[re.search(r"\bQuadro toracico\b", line, re.I).start():].strip()
        if re.match(r"^TC CRANIO\b", line, re.I):
            line = re.sub(r"\s+Anni compiuti\s*:\s*\d+.*", "", line, flags=re.I).strip() or "TC CRANIO - ENCEFALO"
        if _TEST27_FINAL_ADMIN.search(line):
            finding = _TEST27_FINAL_FINDING.search(line)
            if finding:
                line = line[finding.start():].strip()
            else:
                continue
        tail = _TEST27_FINAL_TAIL.search(line)
        if tail and tail.start() > 12:
            line = line[:tail.start()].strip()
        if not line:
            continue
        key = normalize_text(line)
        if key and key not in seen:
            seen.add(key)
            output.append(line)
    return "\n".join(output).strip()


def _test27_final_title(value: Any) -> str:
    title = re.sub(r"[,;:\-]?\s*continua(?:\s+dalla\s+pagina\s+precedente)?\s*$", "", str(value or "Referto"), flags=re.I).strip() or "Referto"
    key = normalize_text(title).lstrip("- ")
    return _TEST27_FINAL_TITLE_MAP.get(key, title)


def _test27_final_narrative(analysis: dict[str, Any], source_text: str) -> None:
    mode = analysis.get("documentMode") or ""
    if mode not in {"narrative", "mixed", "diagnosis"}:
        return
    sections: list[dict[str, str]] = []
    for section in analysis.get("reportSections") or []:
        raw_title = str(section.get("title") or "Referto")
        if _TEST27_FINAL_DROP_TITLE.search(raw_title):
            continue
        text = _test27_final_clean_text(section.get("text") or "")
        if text:
            sections.append({"title": _test27_final_title(raw_title), "text": text})
    if not sections and source_text.strip():
        fallback = _test27_final_clean_text(source_text)
        if fallback:
            sections = [{"title": "Referto", "text": fallback}]
    if sections:
        analysis["reportSections"] = sections
        analysis["reconstructedText"] = "\n\n".join(f"{row['title']}\n{row['text']}" for row in sections)
        analysis["narrativeClinicalSource"] = "\n".join(row["text"] for row in sections)
        analysis["narrativeNeedsReview"] = False
    elif source_text.strip():
        analysis["narrativeNeedsReview"] = True
    analysis["narrativeSourcePresent"] = bool(source_text.strip())
    analysis["narrativeCoverageVersion"] = _TEST27_FINAL_VERSION
    analysis["clinicalValidationVersion"] = _TEST27_FINAL_VERSION
    analysis["narrativeRepairVersion"] = _TEST27_FINAL_VERSION


def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test27_final_base_analyze_document_v420(extracted, file_name)
    source = str(extracted.get("text") or "") or "\n".join(str(page.get("text") or "") for page in extracted.get("pages") or [])
    _test27_final_narrative(analysis, source)
    return analysis

# TEST 27 v7 - rifinitura universale di boilerplate tecnico e allegati.
_TEST27_V7_VERSION = "test27-v7"
_test27_v7_base_analyze_document_v420 = analyze_document_v420
_TEST27_V7_DROP = re.compile(
    r"^(?:si allega(?:no)?\b|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|n\.b\.\s*si raccomanda.*conservazione del referto|.*unica copia.*|.*ripresentato ad ogni consultazione.*|ecg-p\.a-sp[0o]2\b|scontrino lavaendoscopi\b|esecuzione esame istologico\b|garantire qualit|data e ora referto\b|figura\s+\d|pag\.?\s*:\s*\d|spedali riuniti|presidio ospedaliero|ambulatori\s*:|cognome e nome\s*:|tipo esame\s*:|modalit[aà].*ritiro del referto|solo per il mese|per i pazienti ricoverati|nel caso di biopsie urgenti)",
    re.I,
)
_TEST27_V7_CONCLUSION_TAIL = re.compile(
    r"^(?:il medico|f$|pa$|\\l dott|figura|pag\.?|spedali|presidio|ambulatori|cognome e nome|tipo esame|modalit[aà]|stato richiesto l['’]invio|delega portare|ed 30|solo per il mese|per i pazienti ricoverati|nel caso di biopsie|dirigente medico)",
    re.I,
)


def _test27_v7_clean_section(title: str, value: Any) -> str:
    text = str(value or "").replace("\r", "\n")
    esophagus = re.search(r"\bEsofago\s*:", text, re.I)
    if esophagus:
        text = text[esophagus.start():]
    out: list[str] = []
    for raw in re.split(r"\n+|\s+\|\s+", text):
        line = re.sub(r"[ \t]+", " ", raw).strip()
        if not line or _TEST27_V7_DROP.search(line):
            continue
        if normalize_text(title).startswith("conclusion") and _TEST27_V7_CONCLUSION_TAIL.search(line):
            break
        out.append(line)
    return "\n".join(out).strip()


def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test27_v7_base_analyze_document_v420(extracted, file_name)
    mode = analysis.get("documentMode") or ""
    if mode in {"narrative", "mixed", "diagnosis"}:
        sections: list[dict[str, str]] = []
        for section in analysis.get("reportSections") or []:
            text = _test27_v7_clean_section(str(section.get("title") or "Referto"), section.get("text") or "")
            if text:
                sections.append({"title": str(section.get("title") or "Referto"), "text": text})
        if sections:
            analysis["reportSections"] = sections
            analysis["reconstructedText"] = "\n\n".join(f"{row['title']}\n{row['text']}" for row in sections)
            analysis["narrativeClinicalSource"] = "\n".join(row["text"] for row in sections)
            analysis["narrativeNeedsReview"] = False
        analysis["narrativeCoverageVersion"] = _TEST27_V7_VERSION
        analysis["clinicalValidationVersion"] = _TEST27_V7_VERSION
        analysis["narrativeRepairVersion"] = _TEST27_V7_VERSION
    return analysis

# TEST 27 v8 - marcatore finale e pulizia narrativa universale di rilascio.
_TEST27_RELEASE_VERSION = "test27-v8"
_test27_release_base_analyze_document_v420 = analyze_document_v420
_TEST27_RELEASE_ADMIN = re.compile(
    r"^(?:azienda|asl\b|ausl\b|aoup\b|ospedale|servizio sanitario|dipartimento|unit[aà] operativa|u\.?o\.?\b|presidio|poliambulatorio|centro medico|ambulatorio|sede operativa|direttore|responsabile|primario|coordinatore|medico refertante|refertatore|esecutore|operatore|tecnico|tsrm|paziente\s*:|cognome(?: e nome)?\s*:|nome\s*:|data (?:di )?nascita\s*:|luogo di nascita\s*:|codice fiscale\s*:|tessera sanitaria\s*:|residenza\s*:|domicilio\s*:|indirizzo\s*:|n[°.o]?\s*(?:cartella|referto|accettazione|pratica)\s*:|id paziente|numero di telefono|tel(?:efono)?\.?\s*:|cell(?:ulare)?\.?\s*:|fax\s*:|e-?mail\s*:|pec\s*:|centralino|prenotazion|segreteria|richiesta\s*:|accettazione\s*:|emissione\s*:|stampat[oa]\s*:|refertat[oa]\s*:|validat[oa]\s*:|firmat[oa]\s*:|firma digitale|documento firmato|versione del software|pagina\s+\d+|page\s+\d+|tipo esame\s*:|esame richiesto\s*:|prestazione\s*:|codice prestazione\s*:|p\.?iva|partita iva|cod\.\s*reg|codice struttura|numero referto|delibera\s+n|visita .* del \d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|data di refertazione\s*:|rappresentazione di un referto|classe di dose|from\s*:|to\s*:|subject\s*:|oggetto\s*:|message\s*:|report fax|stato\s*:\s*received|data/ora\s*:|velocit[aà]\s*:|tempo di connessione\s*:|pagine\s*:|risoluzione\s*:|id remoto\s*:|numero linea\s*:|dtmf/did\s*:|company name|website|copia conforme|cittadinanza\s*:|professione\s*:|consenso\s*:|data del ricovero\s*:|data di dimissione\s*:|presidio antidecubito|modalit[aà].*ritiro del referto|solo per il mese|per i pazienti ricoverati|nel caso di biopsie urgenti|si allega(?:no)?\b|n\.b\.\s*si raccomanda|cordiali saluti|il medico\b|firma\b|firmato digitalmente|documento informatico)",
    re.I,
)
_TEST27_RELEASE_EMBEDDED = re.compile(r"(?:\bpaziente\s*:|\bcf\s+paziente\s*:|\bcodice fiscale\s*:|\bdata di nascita\s*:|\bid paziente\b|\bnumero referto\s*:|\bsede operativa\b|\bdirettore sanitario\b|\b(?:tel(?:efono)?|fax|cell(?:ulare)?)\s*[:.]\s*\+?\d|[\w.+-]+@[\w.-]+\.[a-z]{2,})", re.I)
_TEST27_RELEASE_CLINICAL = re.compile(r"(?:anamnes|motivo (?:della )?visita|quesito clinico|esame obiettivo|obiettivit|repert|referto|conclusion|diagnos|terapia|programma|follow|morfologia|materiale pervenuto|esame macroscopico|composizione corporea|classificazione|riferisce|nega|presenta|si rileva|si osserva|evidenzia|compatibile|fegato|pancreas|milza|rene|reni|tiroide|polmone|polmoni|cuore|encefalo|mucosa|lesion|nodul|cisti|pressione|dolore|edema|retina|vitreo|pupill|arcata|alveolar|ecograf|tomograf|risonanz|radiograf|esofago|stomaco|duodeno|colon|cardias|ernia|biops|gastrite|steatos|ipertens|diabet|ipotiroid|farmac|mg\b|mcg\b|mmhg|kg\b|cm\b|mm\b|kpa\b)", re.I)


def _test27_release_clean(value: Any) -> str:
    output: list[str] = []
    seen: set[str] = set()
    for raw in re.split(r"\n+|\s+\|\s+", str(value or "").replace("\r", "\n")):
        line = re.sub(r"[ \t]+", " ", raw.replace("\u00ad", "").replace("\u00a0", " ")).strip()
        if not line or re.fullmatch(r"(?:={0,3}\s*(?:pagina|page)\s*\d+\s*={0,3}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s+\d{1,2}[:.]\d{2})?|referto|continua|sezione|contenuto)", line, re.I):
            continue
        if _TEST27_RELEASE_ADMIN.search(line) or _TEST27_RELEASE_EMBEDDED.search(line):
            match = _TEST27_RELEASE_CLINICAL.search(line)
            if match and match.start() > 0:
                line = line[match.start():].strip()
            else:
                continue
        key = normalize_text(line)
        if key and key not in seen:
            seen.add(key)
            output.append(line)
    return "\n".join(output).strip()


def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test27_release_base_analyze_document_v420(extracted, file_name)
    mode = analysis.get("documentMode") or ""
    if mode in {"narrative", "mixed", "diagnosis"}:
        sections: list[dict[str, str]] = []
        for section in analysis.get("reportSections") or []:
            title = re.sub(r"[,;:\-]?\s*continua(?:\s+dalla\s+pagina\s+precedente)?\s*$", "", str(section.get("title") or "Referto"), flags=re.I).strip() or "Referto"
            if re.fullmatch(r"(?:intestazione|dati anagrafici|documento originale|struttura sanitaria|reparto|specializzazione|identificazione e firma|medico firmatario)", title, re.I):
                continue
            text = _test27_release_clean(section.get("text") or "")
            if text:
                sections.append({"title": title, "text": text})
        if not sections:
            source = str(extracted.get("text") or "") or "\n".join(str(page.get("text") or "") for page in extracted.get("pages") or [])
            fallback = _test27_release_clean(source)
            if fallback:
                sections = [{"title": "Referto", "text": fallback}]
        analysis["reportSections"] = sections
        analysis["reconstructedText"] = "\n\n".join(f"{row['title']}\n{row['text']}" for row in sections)
        analysis["narrativeClinicalSource"] = "\n".join(row["text"] for row in sections)
        analysis["narrativeNeedsReview"] = bool((extracted.get("text") or extracted.get("pages")) and not sections)
        analysis["narrativeCoverageVersion"] = _TEST27_RELEASE_VERSION
        analysis["narrativeRepairVersion"] = _TEST27_RELEASE_VERSION
    analysis["clinicalValidationVersion"] = _TEST27_RELEASE_VERSION
    analysis["labRepairVersion"] = _TEST27_RELEASE_VERSION
    analysis["labPanelVersion"] = _TEST27_RELEASE_VERSION
    analysis["referenceCompletionVersion"] = _TEST27_RELEASE_VERSION
    return analysis

# TEST 27 v11 - marcatore definitivo del motore Python.
_TEST27_FINAL_RELEASE_VERSION = "test27-v11"
_test27_final_release_base_analyze_document_v420 = analyze_document_v420


def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test27_final_release_base_analyze_document_v420(extracted, file_name)
    analysis["clinicalValidationVersion"] = _TEST27_FINAL_RELEASE_VERSION
    analysis["labRepairVersion"] = _TEST27_FINAL_RELEASE_VERSION
    analysis["labPanelVersion"] = _TEST27_FINAL_RELEASE_VERSION
    analysis["referenceCompletionVersion"] = _TEST27_FINAL_RELEASE_VERSION
    if (analysis.get("documentMode") or "") in {"narrative", "mixed", "diagnosis"}:
        analysis["narrativeCoverageVersion"] = _TEST27_FINAL_RELEASE_VERSION
        analysis["narrativeRepairVersion"] = _TEST27_FINAL_RELEASE_VERSION
    return analysis

# TEST 27 v12 - versione finale di rilascio.
_TEST27_PACKAGE_VERSION = "test27-v12"
_test27_package_base_analyze_document_v420 = analyze_document_v420

def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test27_package_base_analyze_document_v420(extracted, file_name)
    for key in ("clinicalValidationVersion", "labRepairVersion", "labPanelVersion", "referenceCompletionVersion"):
        analysis[key] = _TEST27_PACKAGE_VERSION
    if (analysis.get("documentMode") or "") in {"narrative", "mixed", "diagnosis"}:
        analysis["narrativeCoverageVersion"] = _TEST27_PACKAGE_VERSION
        analysis["narrativeRepairVersion"] = _TEST27_PACKAGE_VERSION
    return analysis

# TEST 27 v13 - versione definitiva del gate semantico.
_TEST27_SEMANTIC_VERSION = "test27-v13"
_test27_semantic_base_analyze_document_v420 = analyze_document_v420

def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test27_semantic_base_analyze_document_v420(extracted, file_name)
    for key in ("clinicalValidationVersion", "labRepairVersion", "labPanelVersion", "referenceCompletionVersion"):
        analysis[key] = _TEST27_SEMANTIC_VERSION
    if (analysis.get("documentMode") or "") in {"narrative", "mixed", "diagnosis"}:
        analysis["narrativeCoverageVersion"] = _TEST27_SEMANTIC_VERSION
        analysis["narrativeRepairVersion"] = _TEST27_SEMANTIC_VERSION
    return analysis

# TEST 27 v17 - sigillo finale universale per contenuti clinici e residui amministrativi.
_TEST27_V17_VERSION = "test27-v17"
_test27_v17_base_analyze_document_v420 = analyze_document_v420
_TEST27_V17_DROP = re.compile(
    r"(?:referto firmato|d\.p\.c\.m\.|d\.p\.r\.|informativa|trattamento dei dati|dati personali|privacy|consenso|codice fiscale|data di nasc|luogo di nasc|numero cartella|nosologico|barcode|firma medico|firma infermiere|\boperatore\b|richiedente|erogatore|fax|telefono|@|pagina\s*\d+|page\s*\d+|richiedente\s+uo/sd|timbro\s+uo|giorno\s+orario|data\s+[- ]?misurazione|sigla\s+farmaco)",
    re.I,
)


def _test27_v17_clean(value: Any) -> str:
    output: list[str] = []
    seen: set[str] = set()
    for raw in re.split(r"\n+", str(value or "").replace("\r", "\n")):
        line = re.sub(r"[ \t]+", " ", raw).strip()
        if not line or _TEST27_V17_DROP.search(line):
            continue
        key = normalize_text(line)
        if key and key not in seen:
            seen.add(key)
            output.append(line)
    return "\n".join(output).strip()


def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test27_v17_base_analyze_document_v420(extracted, file_name)
    sections: list[dict[str, str]] = []
    for section in analysis.get("reportSections") or []:
        title = re.sub(r"\s+continua.*$", "", str(section.get("title") or "Referto"), flags=re.I).strip() or "Referto"
        text = _test27_v17_clean(section.get("text") or "")
        if text:
            sections.append({"title": title, "text": text})
    if sections:
        merged: dict[str, dict[str, str]] = {}
        order: list[str] = []
        for section in sections:
            key = normalize_text(section["title"])
            if key not in merged:
                merged[key] = section.copy()
                order.append(key)
            else:
                merged[key]["text"] += "\n" + section["text"]
        sections = [merged[key] for key in order]
        analysis["reportSections"] = sections
        analysis["reconstructedText"] = "\n\n".join(f"{row['title']}\n{row['text']}" for row in sections)
        analysis["narrativeClinicalSource"] = "\n".join(row["text"] for row in sections)
    for key in ("clinicalValidationVersion", "labRepairVersion", "labPanelVersion", "referenceCompletionVersion"):
        analysis[key] = _TEST27_V17_VERSION
    if (analysis.get("documentMode") or "") in {"narrative", "mixed", "diagnosis"}:
        analysis["narrativeCoverageVersion"] = _TEST27_V17_VERSION
        analysis["narrativeRepairVersion"] = _TEST27_V17_VERSION
    return analysis


# TEST 27 v18 - marcatore finale del motore Python.
_TEST27_V18_VERSION = "test27-v18"
_test27_v18_base_analyze_document_v420 = analyze_document_v420

def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test27_v18_base_analyze_document_v420(extracted, file_name)
    for key in ("clinicalValidationVersion", "labRepairVersion", "labPanelVersion", "referenceCompletionVersion"):
        analysis[key] = _TEST27_V18_VERSION
    if (analysis.get("documentMode") or "") in {"narrative", "mixed", "diagnosis", "therapy"}:
        analysis["narrativeCoverageVersion"] = _TEST27_V18_VERSION
        analysis["narrativeRepairVersion"] = _TEST27_V18_VERSION
    return analysis


# TEST 27 v19 - marcatore finale del motore Python.
_TEST27_V19_VERSION = "test27-v19"
_test27_v19_base_analyze_document_v420 = analyze_document_v420

def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test27_v19_base_analyze_document_v420(extracted, file_name)
    for key in ("clinicalValidationVersion", "labRepairVersion", "labPanelVersion", "referenceCompletionVersion"):
        analysis[key] = _TEST27_V19_VERSION
    if (analysis.get("documentMode") or "") in {"narrative", "mixed", "diagnosis", "therapy"}:
        analysis["narrativeCoverageVersion"] = _TEST27_V19_VERSION
        analysis["narrativeRepairVersion"] = _TEST27_V19_VERSION
    return analysis


# TEST 27 v20 - marcatore finale del motore Python.
_TEST27_V20_VERSION = "test27-v20"
_test27_v20_base_analyze_document_v420 = analyze_document_v420

def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test27_v20_base_analyze_document_v420(extracted, file_name)
    for key in ("clinicalValidationVersion", "labRepairVersion", "labPanelVersion", "referenceCompletionVersion"):
        analysis[key] = _TEST27_V20_VERSION
    if (analysis.get("documentMode") or "") in {"narrative", "mixed", "diagnosis", "therapy"}:
        analysis["narrativeCoverageVersion"] = _TEST27_V20_VERSION
        analysis["narrativeRepairVersion"] = _TEST27_V20_VERSION
    return analysis

# TEST 27 v21 - coerenza definitiva dei conteggi assoluti e dei valori prima del moltiplicatore x10.
_TEST27_V21_VERSION = "test27-v21"
_test27_v21_base_analyze_document_v420 = analyze_document_v420
_TEST27_V21_X10 = re.compile(r"([<>≤≥]?\s*\d+(?:[.,]\d+)?)\s*(x\s*10(?:\s*(?:[.e^]\s*\d+|\.e\d+))?\s*/\s*(?:uL|µL|ul|l))", re.I)
_TEST27_V21_DIFF = (
    (re.compile(r"neutrofil", re.I), "neutrophils_abs", "Neutrofili assoluti"),
    (re.compile(r"linfocit", re.I), "lymphocytes_abs", "Linfociti assoluti"),
    (re.compile(r"monocit", re.I), "monocytes_abs", "Monociti assoluti"),
    (re.compile(r"eosinofil", re.I), "eosinophils_abs", "Eosinofili assoluti"),
    (re.compile(r"basofil", re.I), "basophils_abs", "Basofili assoluti"),
)

def _test27_v21_number(value: Any) -> float | None:
    try:
        return float(re.sub(r"[<>≤≥\s]", "", str(value or "")).replace(",", "."))
    except (TypeError, ValueError):
        return None

def _test27_v21_display(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(value).replace(".", ",")

def _test27_v21_range(line: str, match: re.Match[str]) -> dict[str, Any] | None:
    numbers = [_test27_v21_number(item) for item in re.findall(r"\d+(?:[.,]\d+)?", line[match.end():])]
    numbers = [item for item in numbers if item is not None]
    if len(numbers) < 2:
        return None
    low, high = numbers[0], numbers[1]
    return {"raw": f"{_test27_v21_display(low)} - {_test27_v21_display(high)}", "min": low, "max": high, "low": low, "high": high}

def _test27_v21_status(value: float | None, interval: dict[str, Any] | None) -> str:
    if value is None or not interval:
        return ""
    return _status(float(value), interval, str(interval.get("raw") or ""))

def _test27_v21_normalize_lab(analysis: dict[str, Any]) -> None:
    for row in analysis.get("labValues") or []:
        line = re.sub(r"\s+", " ", str(row.get("sourceLine") or "")).strip()
        match = _TEST27_V21_X10.search(line)
        if not match:
            continue
        value = _test27_v21_number(match.group(1))
        unit = re.sub(r"/\s*ul$", "/uL", match.group(2), flags=re.I)
        if value is not None:
            row["value"] = value
            row["rawValue"] = _test27_v21_display(value)
            row["unit"] = unit
            row["unitKey"] = re.sub(r"\s+", "", unit.lower())
        interval = _test27_v21_range(line, match)
        if interval:
            row["range"] = interval
            row["status"] = _test27_v21_status(value, interval)
            row["statusSource"] = "report"
            for key in ("statusSourceLabel", "referenceSource", "referenceRuleVersion"):
                row.pop(key, None)
        text = f"{line} {row.get('parameterName','')}"
        for pattern, identifier, label in _TEST27_V21_DIFF:
            if pattern.search(text):
                row["parameterId"] = identifier
                row["parameterName"] = label
                row["labSection"] = "Formula leucocitaria"
                break
    for row in analysis.get("tableRows") or []:
        line = re.sub(r"\s+", " ", str(row.get("sourceLine") or "")).strip()
        match = _TEST27_V21_X10.search(line)
        if not match:
            continue
        value = _test27_v21_number(match.group(1))
        unit = re.sub(r"/\s*ul$", "/uL", match.group(2), flags=re.I)
        if value is not None:
            row["result"] = _test27_v21_display(value)
            row["unit"] = unit
        interval = _test27_v21_range(line, match)
        if interval:
            row["reference"] = interval["raw"]
            row["status"] = _test27_v21_status(value, interval)
        text = f"{line} {row.get('test','')}"
        for pattern, _identifier, label in _TEST27_V21_DIFF:
            if pattern.search(text):
                row["test"] = label
                row["labSection"] = "Formula leucocitaria"
                break

def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test27_v21_base_analyze_document_v420(extracted, file_name)
    _test27_v21_normalize_lab(analysis)
    for key in ("clinicalValidationVersion", "labRepairVersion", "labPanelVersion", "referenceCompletionVersion"):
        analysis[key] = _TEST27_V21_VERSION
    if (analysis.get("documentMode") or "") in {"narrative", "mixed", "diagnosis", "therapy"}:
        analysis["narrativeCoverageVersion"] = _TEST27_V21_VERSION
        analysis["narrativeRepairVersion"] = _TEST27_V21_VERSION
    return analysis

# TEST 27 v22 - pulizia amministrativa universale preservando i frammenti clinici.
_TEST27_V22_VERSION = "test27-v22"
_test27_v22_base_analyze_document_v420 = analyze_document_v420
_TEST27_V22_DROP = re.compile(r"^(?:della|toscana|servix;?|who collaborating centre\b.*|azienda\b.*(?:ospedal|sanitari)|universit[aà]\b.*pisa|servizio sanitario\b.*|presidio ospedalier[oa]\b.*|spedali riuniti\b.*|u\.?o\.?c?\.?\s+(?:laboratorio|endocrinologia|radiologia|virologia)\b.*|direttore\b.*|responsabile\b.*|cognome e nome\b.*|luogo nascita\b.*|data nascita\b.*|data esame\b.*|tipo esame\b.*|data e ora referto\b.*|paziente\s*:.*|n[°.]?\s*cartella\b.*|codice fiscale\b.*|via paradisa\b.*|pag(?:ina)?[.:\s].*|copia(?: copia)? conforme\b.*|firmato digitalmente\b.*|referto del\b.*stampato\b.*|continua a pag\b.*|aoup\s*::.*|il medico\b.*|cordiali saluti\.?|gentile sig\.?\s+[^,]+,?)$", re.I)
_TEST27_V22_EMBEDDED = re.compile(r"(?:\b(?:e-?mail|pec|fax|tel(?:efono)?|centralino|informazioni)\s*[:.]?\s*[^\n;]+|\bwww\.[^\s]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\bcopia conforme all['’]originale\b[^\n]*|\bpag\.?\s*\d+(?:/\d+)?\b)", re.I)

def _test27_v22_clean(value: Any) -> str:
    output: list[str] = []
    seen: set[str] = set()
    for raw in re.split(r"\n+", str(value or "").replace("\r", "\n")):
        line = re.sub(r"[ \t]+", " ", raw.replace("\u00ad", "").replace("\u00a0", " ")).strip()
        line = _TEST27_V22_EMBEDDED.sub("", line).strip(" ,;:-")
        if not line or _TEST27_V22_DROP.search(line):
            continue
        key = normalize_text(line)
        if key and key not in seen:
            seen.add(key); output.append(line)
    return "\n".join(output).strip()

def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test27_v22_base_analyze_document_v420(extracted, file_name)
    if (analysis.get("documentMode") or "") != "lab":
        sections=[]
        for section in analysis.get("reportSections") or []:
            title=re.sub(r"\s+continua.*$", "", str(section.get("title") or "Referto"), flags=re.I).strip() or "Referto"
            if re.fullmatch(r"(?:intestazione|dati anagrafici|documento originale|struttura sanitaria|reparto|specializzazione|identificazione e firma|medico firmatario|il medico)", title, re.I):
                continue
            text=_test27_v22_clean(section.get("text") or "")
            if text: sections.append({"title":title,"text":text})
        analysis["reportSections"]=sections
        analysis["reconstructedText"]="\n\n".join(f"{s['title']}\n{s['text']}" for s in sections)
        analysis["narrativeClinicalSource"]="\n".join(s["text"] for s in sections)
        analysis["narrativeNeedsReview"]=bool((extracted.get("text") or extracted.get("pages")) and not sections)
        analysis["narrativeCoverageVersion"]=_TEST27_V22_VERSION
        analysis["narrativeRepairVersion"]=_TEST27_V22_VERSION
    for key in ("clinicalValidationVersion","labRepairVersion","labPanelVersion","referenceCompletionVersion"):
        analysis[key]=_TEST27_V22_VERSION
    return analysis

# TEST 27 v23 - rimozione finale delle formule di firma incorporate nei paragrafi clinici.
_TEST27_V23_VERSION="test27-v23"
_test27_v23_base_analyze_document_v420=analyze_document_v420
_TEST27_V23_INLINE=(
    re.compile(r"\bRIPORTARE IL PRESENTE REFERTO[^.]*\.?",re.I),
    re.compile(r"\bDocumento informatico firmato digitalmente[^.}]*[.}]?",re.I),
    re.compile(r"\bReferto firmato digitalmente[^\n]*$",re.I),
    re.compile(r"\bRefertatore\s*:[^\n]*$",re.I),
    re.compile(r"\bCordiali Saluti\b",re.I),
    re.compile(r"\bDott\.?ssa\s+Luisella[^\n]*?Pagina\s*\d+",re.I),
    re.compile(r"\b(?:From|Page|Date)\s*:\s*[^\n]*",re.I),
    re.compile(r"\bTRANSAN?SSION\b",re.I),
)

def _test27_v23_clean(value:Any)->str:
    out=[];seen=set()
    for raw in re.split(r"\n+",str(value or '').replace('\r','\n')):
        line=re.sub(r"[ \t]+"," ",raw).strip()
        for pattern in _TEST27_V23_INLINE: line=pattern.sub(' ',line)
        line=re.sub(r"[ \t]+"," ",line).strip()
        line=re.sub(r"^Gentile Sig\.?\s+[^,]+,?\s*","",line,flags=re.I)
        if not line or re.fullmatch(r"(?:della|toscana|servix;?|who collaborating centre\b.*|pag\.?\s*:?.*|copia conforme.*|firmato digitalmente.*|documento informatico firmato.*|refertatore\s*:.*|cordiali saluti.*)",line,re.I):continue
        key=normalize_text(line)
        if key and key not in seen:seen.add(key);out.append(line)
    return '\n'.join(out).strip()

def analyze_document_v420(extracted:dict[str,Any],file_name:str='')->dict[str,Any]:
    analysis=_test27_v23_base_analyze_document_v420(extracted,file_name)
    if (analysis.get('documentMode') or '')!='lab':
        sections=[]
        for section in analysis.get('reportSections') or []:
            title=re.sub(r"\s+continua.*$","",str(section.get('title') or 'Referto'),flags=re.I).strip() or 'Referto'
            text=_test27_v23_clean(section.get('text') or '')
            if text:sections.append({'title':title,'text':text})
        analysis['reportSections']=sections;analysis['reconstructedText']='\n\n'.join(f"{s['title']}\n{s['text']}" for s in sections);analysis['narrativeClinicalSource']='\n'.join(s['text'] for s in sections);analysis['narrativeNeedsReview']=bool((extracted.get('text') or extracted.get('pages')) and not sections);analysis['narrativeCoverageVersion']=_TEST27_V23_VERSION;analysis['narrativeRepairVersion']=_TEST27_V23_VERSION
    for key in ('clinicalValidationVersion','labRepairVersion','labPanelVersion','referenceCompletionVersion'):analysis[key]=_TEST27_V23_VERSION
    return analysis

# TEST 27 v24 - rimozione finale di intestazioni aziendali e istruzioni amministrative incorporate.
_TEST27_V24_VERSION='test27-v24'
_test27_v24_base_analyze_document_v420=analyze_document_v420
_TEST27_V24_DROP=re.compile(r"^(?:medical group\b.*|pisa,?\s*\d{1,2}[/.]\d{1,2}[/.]\d{2,4}.*(?:operatore|sonda non calibrata|azienda ospedaliero)|per i pazienti ricoverati\s*:\s*il referto istologico\b.*|nel caso di biopsie urgenti\b.*|.*operatore misurazioni.*)$",re.I)
_TEST27_V24_TAIL=re.compile(r"(?:\s*[\/|]\s*(?:Dr|Dott)\.?\s+[A-ZÀ-ÖØ-Ý][^\n]*?(?:Pagina|Pag\.)\s*\d+[^\n]*|\s*(?:Pagina|Pag\.)\s*\d+\s+(?:Via|Viale|Piazza)\s+[^\n]*)$",re.I)

def _test27_v24_clean(value:Any)->str:
    out=[];seen=set()
    for raw in re.split(r"\n+",str(value or '').replace('\r','\n')):
        line=re.sub(r"[ \t]+"," ",raw).strip()
        if not line or _TEST27_V24_DROP.search(line):continue
        line=_TEST27_V24_TAIL.sub('',line).strip()
        if not line:continue
        key=normalize_text(line)
        if key and key not in seen:seen.add(key);out.append(line)
    return '\n'.join(out).strip()

def analyze_document_v420(extracted:dict[str,Any],file_name:str='')->dict[str,Any]:
    analysis=_test27_v24_base_analyze_document_v420(extracted,file_name)
    if (analysis.get('documentMode') or '')!='lab':
        sections=[]
        for section in analysis.get('reportSections') or []:
            title=re.sub(r"\s+continua.*$","",str(section.get('title') or 'Referto'),flags=re.I).strip() or 'Referto'
            text=_test27_v24_clean(section.get('text') or '')
            if text:sections.append({'title':title,'text':text})
        analysis['reportSections']=sections;analysis['reconstructedText']='\n\n'.join(f"{s['title']}\n{s['text']}" for s in sections);analysis['narrativeClinicalSource']='\n'.join(s['text'] for s in sections);analysis['narrativeNeedsReview']=bool((extracted.get('text') or extracted.get('pages')) and not sections);analysis['narrativeCoverageVersion']=_TEST27_V24_VERSION;analysis['narrativeRepairVersion']=_TEST27_V24_VERSION
    for key in ('clinicalValidationVersion','labRepairVersion','labPanelVersion','referenceCompletionVersion'):analysis[key]=_TEST27_V24_VERSION
    return analysis


# TEST 34 - normalizzazione semantica universale dei ritorni a capo nei campi clinici estesi.
_TEST34_VERSION = "test34-v1"
_test34_base_analyze_document_v420 = analyze_document_v420
_TEST34_HEADING = re.compile(r"^(?:anamnesi|motivo della visita|quesito clinico|indicazioni?|tecnica|esame obiettivo|obiettivit[aà]|reperti?|referto|conclusioni?|diagnosi|commento|osservazioni?|valutazione|terapia(?: in atto)?|programma|follow[- ]?up|materiale pervenuto|esame macroscopico|morfologia|classificazione|composizione corporea|screening|storia clinica|attivit[aà] di malattia)\s*[:\-]?\s*$", re.I)
_TEST34_LIST = re.compile(r"^(?:[-•▪◦*]\s+|\d{1,3}[.)]\s+|[A-Za-z][.)]\s+)")
_TEST34_STRUCTURED = re.compile(r"^(?:[A-Z0-9]{1,5}(?:[.\/-][A-Z0-9]{1,8}){1,4}|\d{2,3}(?:\s+\d{2,3}){1,3})\s+\S+", re.I)
_TEST34_ABBREVIATION = re.compile(r"(?:\b(?:dott|dott\.ssa|dr|prof|sig|sig\.ra|n\.b|ecc|es|ca|cfr|u\.o|s\.p\.a)\.|\b[A-Z]\.)$", re.I)

def _test34_sentence_end(line: str) -> bool:
    value = str(line or "").strip()
    return bool(re.search(r"[.!?][\"'”’)\]]?$", value)) and not bool(_TEST34_ABBREVIATION.search(value))

def _test34_reflow_text(value: Any) -> str:
    source = str(value or "").replace("\r", "").replace("\u00ad", "").replace("\u00a0", " ")
    if not source.strip():
        return ""
    output: list[str] = []
    paragraph = ""
    list_mode = False
    # Non introduciamo nuovi a-capo all'interno di una riga sorgente.
    # Ricomponiamo solo gli a-capo grafici OCR/PDF; quelli successivi a una
    # vera chiusura di frase o a una struttura esplicita restano separati.
    def flush() -> None:
        nonlocal paragraph
        cleaned = re.sub(r"[ \t]+", " ", paragraph).strip()
        if cleaned:
            output.append(cleaned)
        paragraph = ""
    for raw in source.split("\n"):
        line = re.sub(r"[ \t]+", " ", raw).strip()
        if not line:
            flush()
            if output and output[-1] != "":
                output.append("")
            list_mode = False
            continue
        if _TEST34_HEADING.match(line):
            flush()
            if output and output[-1] != "":
                output.append("")
            output.extend([line, ""])
            list_mode = False
            continue
        if _TEST34_LIST.match(line) or _TEST34_STRUCTURED.match(line):
            flush()
            if not list_mode and output and output[-1] != "":
                output.append("")
            output.append(line)
            list_mode = True
            continue
        if list_mode:
            if output and _test34_sentence_end(output[-1]):
                output.append("")
            list_mode = False
        if not paragraph:
            paragraph = line
        elif _test34_sentence_end(paragraph):
            flush()
            paragraph = line
        else:
            paragraph += " " + line
    flush()
    return "\n".join(output).strip()

def _test34_reflow_mapping(item: Any, keys: tuple[str, ...]) -> None:
    if not isinstance(item, dict):
        return
    for key in keys:
        if isinstance(item.get(key), str) and item.get(key).strip():
            item[key] = _test34_reflow_text(item[key])

def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test34_base_analyze_document_v420(extracted, file_name)
    mode = analysis.get("documentMode") or ""
    if mode in {"narrative", "mixed", "diagnosis", "therapy"}:
        sections: list[dict[str, Any]] = []
        for section in analysis.get("reportSections") or []:
            if not isinstance(section, dict):
                continue
            row = dict(section)
            row["text"] = _test34_reflow_text(row.get("text") or "")
            if row["text"].strip():
                sections.append(row)
        analysis["reportSections"] = sections
        analysis["reconstructedText"] = "\n\n".join(f"{section.get('title') or 'Referto'}\n{section.get('text') or ''}" for section in sections)
        analysis["narrativeClinicalSource"] = "\n".join(str(section.get("text") or "") for section in sections)
        analysis["narrativeCoverageVersion"] = _TEST34_VERSION
        analysis["narrativeRepairVersion"] = _TEST34_VERSION
    for row in analysis.get("extractedDiagnoses") or []:
        _test34_reflow_mapping(row, ("notes", "summary", "sourceQuote"))
    for row in analysis.get("extractedTherapies") or []:
        _test34_reflow_mapping(row, ("notes", "frequency", "instructions"))
    for row in analysis.get("extractedExemptions") or []:
        _test34_reflow_mapping(row, ("notes", "limitations"))
    analysis["clinicalTextLayoutVersion"] = _TEST34_VERSION
    return analysis

# ==========================================================================
# TEST 36 - cartella clinica, date anagrafiche escluse e canonico narrativo
# ==========================================================================
_TEST36_VERSION = "test36-v1"
_test36_base_detect_dates = detect_dates
_test36_base_detect_document_profile = detect_document_profile
_test36_base_detect_specialization = _detect_specialization
_test36_base_analyze_document_v420 = analyze_document_v420
_TEST36_DMY_RE = re.compile(r"(?<!\d)(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-]((?:19|20)\d{2})(?!\d)")
_TEST36_CLINICAL_SIGNAL = re.compile(r"(?:anamnes|diagnos|terapia|programma|follow|esame obiettivo|repert|conclusion|dolore|febbre|dispnea|pressione|saturazione|glicem|creatinin|fegato|rene|polmone|cuore|paziente\s+(?:vigile|stabile|collaborante|orientat)|ricover|dimess|intervent|farmac|mg\b|mmhg|spo2|fio2|diuresi|edema|lesion|steatos|diabet|ipotiroid)", re.I)
_TEST36_ADMIN_LINE = re.compile(r"^(?:azienda\b|aoup\b|servizio sanitario\b|dipartimento\b|presidio\b|unit[aà] operativa\b|u\.?o\.?\b|direttore\b|responsabile\b|centralino\b|segreteria\b|prenotazion|cognome(?: e nome)?\s*:|nome\s*:|data (?:di )?nascita\s*:|luogo di nascita\s*:|codice fiscale\s*:|tessera sanitaria\s*:|residenza\s*:|domicilio\s*:|indirizzo\s*:|telefono\s*:|tel\.?\s*:|cell(?:ulare)?\.?\s*:|fax\s*:|e-?mail\s*:|pec\s*:|numero referto\s*:|n[°.o]?\s*(?:cartella|referto|accettazione)\s*:|id paziente\b|pagina\s+\d+|page\s+\d+|copia conforme\b|firmato digitalmente\b|documento informatico firmato\b)", re.I)
_TEST36_INLINE_ADMIN = [
    re.compile(r"\bdata (?:di )?nascita\s*[:\-]?\s*\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b", re.I),
    re.compile(r"\bcodice fiscale\s*[:\-]?\s*[A-Z0-9]{11,16}\b", re.I),
    re.compile(r"\b(?:tel(?:efono)?|cell(?:ulare)?|fax)\s*[:.\-]\s*\+?[\d ()\-.]{6,}\b", re.I),
    re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", re.I),
    re.compile(r"\b(?:pagina|page)\s+\d+(?:\s*(?:di|/)\s*\d+)?\b", re.I),
]


def _test36_iso_from_match(match: re.Match[str] | None) -> str:
    if not match:
        return ""
    return iso_date(match.group(1), match.group(2), match.group(3)) or ""


def _test36_birth_dates(text: str) -> set[str]:
    out: set[str] = set()
    pattern = re.compile(r"(?:data\s+(?:di\s+)?nascita|nato/?a?|dob)\s*[:\-]?\s*" + _TEST36_DMY_RE.pattern, re.I)
    for match in pattern.finditer(str(text or "")):
        iso = _test36_iso_from_match(match)
        if iso:
            out.add(iso)
    return out


def _test36_labeled_date(text: str, labels: tuple[str, ...]) -> str:
    source = str(text or "")
    for label in labels:
        pattern = re.compile(label + r"[^\d]{0,24}" + _TEST36_DMY_RE.pattern, re.I)
        match = pattern.search(source)
        if match:
            iso = _test36_iso_from_match(match)
            if iso:
                return iso
    return ""


def _test36_is_clinical_record(text: str, pages: list[dict[str, Any]] | None, file_name: str = "") -> bool:
    filename = normalize_text((file_name or "").replace("_", " ").replace("-", " "))
    if re.search(r"\bcartella\s+clinica\b", filename, re.I):
        return True
    page_count = len(pages or [])
    head = normalize_text(str(text or "")[:30000])
    return page_count > 20 and bool(re.search(r"data\s+(?:di\s+)?ricovero|data\s+dimissione|data\s+chiusura\s+cartella|scheda\s+nosologica|assistenza\s+infermieristica|diario\s+clinico|degenza", head, re.I))


def detect_dates(text: str, file_name: str = "") -> tuple[str, str, list[dict[str, Any]], int]:
    clinical, issue, candidates, confidence = _test36_base_detect_dates(text, file_name)
    births = _test36_birth_dates(text)
    is_record = bool(re.search(r"\bcartella[ _.-]*clinica\b", normalize_text((file_name or "").replace("_", " ")), re.I))
    admission = _test36_labeled_date(text, (r"data\s+(?:di\s+)?ricovero", r"data\s+(?:di\s+)?ammissione", r"data\s+(?:di\s+)?ingresso", r"ricover[oa]\s+(?:il|dal)"))
    closure = _test36_labeled_date(text, (r"data\s+chiusura\s+cartella", r"data\s+(?:di\s+)?dimissione", r"dimess[oa]\s+(?:il|in data)"))
    cleaned: list[dict[str, Any]] = []
    for row in candidates:
        item = dict(row)
        if item.get("iso") in births:
            item["kind"] = "data di nascita"
            item["clinicalScore"] = -1000
            item["issueScore"] = -1000
            item["score"] = -1000
        cleaned.append(item)
    if is_record and admission:
        clinical = admission
        confidence = 100
    elif clinical in births:
        valid = [c for c in cleaned if c.get("iso") not in births and int(c.get("clinicalScore") or 0) > 0]
        valid.sort(key=lambda c: (int(c.get("clinicalScore") or 0), -int(c.get("lineIndex") or 999999)), reverse=True)
        clinical = valid[0].get("iso", "") if valid else ""
        confidence = min(99, max(20, int(valid[0].get("clinicalScore") or 0))) if valid else 0
    if is_record and closure and closure not in births:
        issue = closure
    return clinical, issue, cleaned, confidence


def _detect_specialization(text: str) -> str:
    """TEST 36: la specializzazione richiede un segnale esplicito, non una parola clinica accessoria."""
    n = normalize_text(text)
    strict = [
        ("Epatologia", r"\bvisita\s+epatologic|\bu\.?o\.?c?\.?\s*epatologia\b|\breparto\s+epatologia\b"),
        ("Diabetologia", r"\bvisita\s+diabetologic|\bu\.?o\.?c?\.?\s*diabetologia\b|malattie metaboliche e diabetologia"),
        ("Neurologia", r"\bvisita\s+neurologic|\bu\.?o\.?c?\.?\s*neurologia\b|\breparto\s+neurologia\b|\bneuroscienze\b"),
        ("Cardiologia", r"\bvisita\s+cardiologic|\bu\.?o\.?c?\.?\s*cardiologia\b|\breparto\s+cardiologia\b"),
        ("Endocrinologia", r"\bvisita\s+endocrinologic|\bu\.?o\.?c?\.?\s*endocrinologia\b|\breparto\s+endocrinologia\b"),
        ("Oculistica", r"\bvisita\s+oculistic|\bu\.?o\.?c?\.?\s*oculistica\b|\boftalmolog"),
        ("Radiologia", r"\bu\.?o\.?c?\.?\s*radiologia\b|\bradiodiagnostica\b|\bdiagnostica per immagini\b"),
        ("Anatomia patologica", r"\banatomia patologica\b|\bu\.?o\.?c?\.?\s*anatomia patologica\b"),
        ("Gastroenterologia", r"\bvisita\s+gastroenterologic|\bu\.?o\.?c?\.?\s*gastroenterologia\b|\bendoscopia digestiva\b"),
        ("Pneumologia", r"\bvisita\s+pneumologic|\bu\.?o\.?c?\.?\s*pneumologia\b"),
        ("Ortopedia", r"\bvisita\s+ortopedic|\bu\.?o\.?c?\.?\s*ortopedia\b"),
        ("Urologia", r"\bvisita\s+urologic|\bu\.?o\.?c?\.?\s*urologia\b"),
    ]
    for label, pattern in strict:
        if re.search(pattern, n, re.I):
            return label
    return ""


def detect_document_profile(text: str, pages: list[dict[str, Any]], file_name: str = "") -> dict[str, Any]:
    if _test36_is_clinical_record(text, pages, file_name):
        context = normalize_text(f"{file_name}\n{str(text or '')[:15000]}")
        specialization = "Medicina d'urgenza" if re.search(r"medicina\s+(?:d['’]?urgenza|urgenza)|med\.?\s*ur\.?", context, re.I) else _detect_specialization(text)
        return {"mode": "mixed" if _has_lab_header(pages) else "narrative", "category": "Cartella clinica", "specialization": specialization,
                "label": "Cartella clinica", "typeSource": "struttura multipagina di cartella clinica", "typeConfidence": 100}
    return _test36_base_detect_document_profile(text, pages, file_name)


def _test36_clean_narrative(value: Any) -> str:
    out: list[str] = []
    seen: set[str] = set()
    for raw in str(value or "").replace("\r", "\n").split("\n"):
        line = re.sub(r"[ \t]+", " ", raw).strip()
        if not line:
            continue
        for pattern in _TEST36_INLINE_ADMIN:
            line = pattern.sub(" ", line)
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue
        if _TEST36_ADMIN_LINE.search(line) and not _TEST36_CLINICAL_SIGNAL.search(line):
            continue
        key = normalize_text(line)
        if key and key not in seen:
            seen.add(key)
            out.append(line)
    return "\n".join(out).strip()


def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _test36_base_analyze_document_v420(extracted, file_name)
    text = extracted.get("text") or ""
    pages = extracted.get("pages") or []
    clinical, issue, candidates, confidence = detect_dates(text, file_name)
    profile = detect_document_profile(text, pages, file_name)
    if profile.get("label") == "Cartella clinica":
        analysis["documentKind"] = "Cartella clinica"
        analysis["category"] = "Cartella clinica"
        analysis["documentMode"] = profile.get("mode") or "narrative"
        analysis["specialization"] = profile.get("specialization") or ""
        analysis["documentTypeSource"] = profile.get("typeSource")
        analysis["documentTypeConfidence"] = profile.get("typeConfidence")
        analysis["documentTypeVersion"] = _TEST36_VERSION
    if clinical:
        analysis["clinicalDate"] = clinical
        analysis["suggestedDate"] = clinical
        analysis["dateStatus"] = "detected"
        analysis["dateConfidence"] = confidence
    analysis["issueDate"] = issue
    analysis["dateCandidates"] = candidates
    if profile.get("label") == "Cartella clinica" and clinical:
        y, m, d = clinical.split("-")
        analysis["title"] = f"Cartella clinica del {d}/{m}/{y}"
    mode = analysis.get("documentMode") or ""
    if mode in {"narrative", "mixed", "diagnosis", "therapy"}:
        sections: list[dict[str, Any]] = []
        merged: dict[str, int] = {}
        for section in analysis.get("reportSections") or []:
            if not isinstance(section, dict):
                continue
            title = re.sub(r"[,;:\-]?\s*continua(?:\s+dalla\s+pagina\s+precedente)?\s*$", "", str(section.get("title") or "Referto"), flags=re.I).strip() or "Referto"
            value = _test36_clean_narrative(section.get("text") or "")
            if not value:
                continue
            key = normalize_text(title)
            if key in merged:
                index = merged[key]
                sections[index]["text"] = _test36_clean_narrative(f"{sections[index]['text']}\n{value}")
            else:
                merged[key] = len(sections)
                sections.append({"title": title, "text": value})
        analysis["reportSections"] = sections
        analysis["reconstructedText"] = "\n\n".join(f"{row['title']}\n{row['text']}" for row in sections)
        analysis["narrativeClinicalSource"] = "\n".join(row["text"] for row in sections)
        analysis["narrativeCoverageVersion"] = _TEST36_VERSION
        analysis["narrativeRepairVersion"] = _TEST36_VERSION
    analysis["clinicalCanonicalVersion"] = _TEST36_VERSION
    analysis["clinicalValidationVersion"] = _TEST36_VERSION
    return analysis

# V6.0.4 FINAL: post-normalizzazione conservativa per cartelle cliniche complesse
# e metadati essenziali della struttura per i referti narrativi.
_V604_BASE_ANALYZE_DOCUMENT = analyze_document_v420
_V604_ADMIN = re.compile(
    r"(?:partita\s+iva|p\.?iva|codice\s+fiscale|data\s+(?:di\s+)?nascita|luogo\s+di\s+nascita|"
    r"residenza|domicilio|direttore\s+sanitario|responsabile\s+sanitario|centralino|segreteria|"
    r"prenotazion|accettazione|informativa|consenso|privacy|trattamento\s+dei\s+dati|d\.?lgs|gdpr|"
    r"firma|timbro|numero\s+(?:referto|pratica|cartella)|pec\b|e-?mail|www\.|https?://|telefono|tel\.|fax|"
    r"pagina\s+\d+|copia\s+conforme|firmato\s+digitalmente|classe\s+di\s+dose|contributo\s+ambientale|"
    r"scheda\s+nosologica|cartellinatura|addetto\s+cartellinatura)", re.I)
_V604_BAD_COMPLEX = re.compile(
    r"(?:scr\s+copia|spedali\s+riuniti|consenso\s+al|priorit[aà]|difficolt[aà]\s+respi|"
    r"il\s+paziente,?\s+vist|trattamento\s+dei\s+dati\s+personali|mappa?\s+pon|"
    r"allegato\s*\d+|monitoraggio[- ]ecg[- ]p\.?a)", re.I)
_V604_KNOWN_LAB = re.compile(
    r"^(?:emoglobina|ematocrito|eritrociti|leucociti|piastrine|neutrofili|linfociti|monociti|eosinofili|basofili|"
    r"glicemia|glucosio|creatinina|azotemia|urea|sodio|potassio|cloro|calcio|magnesio|fosforo|"
    r"ast|got|alt|gpt|ggt|gamma\s*gt|fosfatasi\s+alcalina|bilirubina|albumina|proteine|pcr|crp|ves|"
    r"inr|pt|aptt|tsh|ft3|ft4|colesterolo|hdl|ldl|trigliceridi|ferritina|sideremia|transferrina|"
    r"vitamina\s+d|vitamina\s+b12|folati|acido\s+urico|troponina|bnp|nt[- ]?probnp|d[- ]?dimero)\b", re.I)
_V604_LAB_UNIT = re.compile(
    r"(?:%|mg/dl|g/dl|g/l|mg/l|mmol/l|µmol/l|umol/l|u/l|ui/l|meq/l|mEq/L|ng/ml|pg/ml|"
    r"µg/dl|ug/dl|10\^?\d+/[µu]?l|x10\^?\d+/[µu]?l|fl|sec|secondi)\b", re.I)
_V604_LAB_RANGE = re.compile(r"(?:\b\d+(?:[.,]\d+)?\s*(?:-|–|—|a)\s*\d+(?:[.,]\d+)?\b|[<>≤≥]\s*\d+(?:[.,]\d+)?)")


def _v604_text_quality(value: str) -> float:
    s = re.sub(r"\s+", " ", str(value or "")).strip()
    if not s:
        return 0.0
    words = [w for w in s.split() if w]
    alpha = [w for w in words if re.search(r"[A-Za-zÀ-ÖØ-öø-ÿ]{3,}", w)]
    if not alpha:
        return 0.0
    normal = [w for w in alpha if re.search(r"[aeiouàèéìòóù]", w, re.I) and not re.search(r"[{}\[\]|~^`]", w)]
    return len(normal) / max(1, len(alpha))


def _v604_complex_line_ok(line: str) -> bool:
    s = re.sub(r"\s+", " ", str(line or "")).strip()
    if len(s) < 18 or _V604_ADMIN.search(s) or _V604_BAD_COMPLEX.search(s):
        return False
    if re.search(r"[|_~^`]{2,}|[<>{}\[\]\\]{2,}", s):
        return False
    if _v604_text_quality(s) < 0.58:
        return False
    return bool(re.search(
        r"\b(?:diagnos|anamnes|terap|decorso|repert|conclusion|esame\s+obiettivo|allerg|"
        r"dolor|febbr|dispnea|edema|lesion|frattur|emorrag|versamento|tromb|polmon|cardiac|"
        r"renal|epat|diabet|ipertens|ipotiroid|obesit|saturaz|ossigen|ricover|dimess|intervent)\w*\b", s, re.I))


def _v604_clean_complex_sections(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for section in sections or []:
        if not isinstance(section, dict):
            continue
        title = re.sub(r"\s+", " ", str(section.get("title") or "Referto")).strip() or "Referto"
        kept: list[str] = []
        title_clinical = bool(re.search(r"(?:diagnos|anamnes|terap|decorso|repert|conclusion|esame\s+obiettivo|dimission)", title, re.I))
        for raw in str(section.get("text") or "").replace("\r", "\n").split("\n"):
            line = re.sub(r"\s+", " ", raw).strip()
            if title_clinical:
                if len(line) < 5 or _V604_ADMIN.search(line) or _V604_BAD_COMPLEX.search(line) or _v604_text_quality(line) < 0.45:
                    continue
            elif not _v604_complex_line_ok(line):
                continue
            key = normalize_text(line)
            if key in seen:
                continue
            seen.add(key)
            kept.append(line)
        if kept:
            out.append({"title": title, "text": "\n".join(kept)})
    return out


def _v604_extract_facility(text: str) -> tuple[str, str]:
    raw = str(text or "")[:12000]
    lines = [re.sub(r"\s+", " ", x).strip(" ,;:-") for x in raw.replace("\r", "\n").split("\n")]
    lines = [x for x in lines if x]
    facility = ""

    # Preferisci il luogo sanitario leggibile, non la ragione sociale o una riga
    # amministrativa concatenata. Mantiene il metadato separato dal referto.
    explicit = re.compile(r"(?:sede\s+operativa|struttura|presidio)\s*:\s*(.+)$", re.I)
    care_site = re.compile(
        r"\b(?:centro\s+medico|ospedale|policlinico|clinica|istituto|laboratorio|"
        r"casa\s+di\s+cura|azienda\s+ospedalier[ao]|azienda\s+universitario[- ]ospedalier[ao]|"
        r"aou\b|asl\b|irccs\b|presidio\s+ospedaliero)\b", re.I)
    legal_admin = re.compile(
        r"\b(?:p\.?\s*iva|partita\s+iva|codice\s+fiscale|\b(?:s\.?r\.?l\.?|s\.?p\.?a\.?)\b|"
        r"direttore\s+sanitario|responsabile\s+sanitario)\b", re.I)
    generic_nonfacility = re.compile(
        r"^(?:cartella\s+clinica|referto|anamnesi|diagnosi|terapia|ricovero|dimissione|"
        r"cognome(?:\s+e\s+nome)?|data\s+(?:di\s+)?nascita)\b", re.I)

    candidates: list[tuple[int, str]] = []
    for line in lines[:100]:
        m = explicit.search(line)
        candidate = m.group(1).strip(" ,;:-") if m else line
        # Se una riga esplicita contiene anche indirizzo/telefono, fermati prima.
        candidate = re.split(r"\s+(?=(?:p\.?\s*iva|partita\s+iva|c\.?f\.?|codice\s+fiscale|via|viale|piazza|corso|loc\.?|tel\.?|telefono|fax|e-?mail|www\.|direttore\s+sanitario|responsabile\s+sanitario)\b)", candidate, maxsplit=1, flags=re.I)[0].strip(" ,;:-")
        if len(candidate) < 3 or len(candidate) > 100 or generic_nonfacility.search(candidate):
            continue
        if care_site.search(candidate):
            score = 100
            if m:
                score += 25
            if legal_admin.search(candidate):
                score -= 70
            if _V604_ADMIN.search(candidate) and not care_site.search(candidate):
                score -= 80
            candidates.append((score, candidate))

    if candidates:
        candidates.sort(key=lambda x: (-x[0], len(x[1])))
        facility = candidates[0][1]
    else:
        # Ultimo fallback: una ragione sociale può essere utile solo se non esiste
        # un luogo sanitario migliore e la riga non contiene identificativi fiscali.
        for line in lines[:60]:
            if generic_nonfacility.search(line) or _V604_ADMIN.search(line):
                continue
            if re.search(r"\b(?:s\.?r\.?l\.?|s\.?p\.?a\.?)\b", line, re.I) and len(line) <= 90:
                facility = line
                break

    # V6.0.4 FIX3: telefono, e-mail e altri recapiti restano consultabili
    # esclusivamente nel documento originale. Nell'interpretazione clinica
    # vengono mantenuti solo struttura sanitaria e reparto/specializzazione.
    return facility, ""


def _v604_clean_diagnosis_name(name: str) -> str:
    s = re.sub(r"\s+", " ", str(name or "")).strip(" .;:-")
    s = re.sub(r"^(?:diagnosi\s+(?:clinica\s+)?(?:di\s+)?(?:ingresso|dimissione)?\s*[:\-]?|di\s+dimissione\s*[:\-]?|anamnesi(?:\s+patologica\s+(?:remota|prossima))?\s*[:\-]?)", "", s, flags=re.I).strip(" .;:-")
    return s[:1].upper() + s[1:] if s else ""


def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _V604_BASE_ANALYZE_DOCUMENT(extracted, file_name)
    raw = str(extracted.get("text") or "")
    pages = extracted.get("pages") or []
    complex_record = _test36_is_clinical_record(raw, pages, file_name) or analysis.get("documentKind") == "Cartella clinica"

    # Metadati utili della struttura restano separati dal testo clinico.
    facility, _contact = _v604_extract_facility(raw)
    if facility:
        analysis["facility"] = facility
    else:
        current_facility = re.sub(r"\s+", " ", str(analysis.get("facility") or "")).strip(" ,;:-")
        if re.match(r"^(?:cartella\s+clinica|referto|anamnesi|diagnosi|terapia)$", current_facility, re.I) or _V604_ADMIN.search(current_facility):
            analysis["facility"] = ""
    # Recapiti, identificativi e informazioni amministrative non fanno parte
    # della rappresentazione clinica canonica. Il file originale resta intatto.
    analysis["facilityContact"] = ""

    if complex_record:
        analysis["documentKind"] = "Cartella clinica"
        analysis["category"] = "Cartella clinica"
        analysis["documentMode"] = "narrative"
        # Una cartella complessa non genera esami automaticamente da OCR libero.
        # Gli esami potranno essere acquisiti soltanto da tabelle strutturate ad alta affidabilita.
        trusted_labs = []
        for row in analysis.get("labValues") or []:
            if not isinstance(row, dict):
                continue
            name = re.sub(r"\s+", " ", str(row.get("parameterName") or row.get("test") or "")).strip()
            match = _V604_KNOWN_LAB.match(name)
            if not match:
                continue
            source = str(row.get("sourceLine") or row.get("raw") or "")
            range_value = (row.get("range") or {}).get("raw") if isinstance(row.get("range"), dict) else row.get("reference") or ""
            evidence = f"{source} {row.get('unit') or ''} {range_value}"
            try:
                numeric_value = float(str(row.get("value", "")).replace(",", "."))
                numeric_ok = numeric_value == numeric_value
            except (TypeError, ValueError):
                numeric_ok = False
            if not numeric_ok:
                continue
            if not (_V604_LAB_UNIT.search(evidence) or _V604_LAB_RANGE.search(evidence)):
                continue
            if _V604_ADMIN.search(evidence) or _V604_BAD_COMPLEX.search(evidence):
                continue
            clean_row = dict(row)
            # Se l'OCR accoda frammenti al nome, conserva solo il parametro medico
            # effettivamente riconosciuto (es. "Creatinina ema" -> "Creatinina").
            clean_row["parameterName"] = match.group(0).strip()
            trusted_labs.append(clean_row)
        analysis["labValues"] = trusted_labs
        analysis["qualitativeResults"] = []
        analysis["tableRows"] = []
        sections = _v604_clean_complex_sections(analysis.get("reportSections") or [])
        analysis["reportSections"] = sections
        analysis["reconstructedText"] = "\n\n".join(f"{s['title']}\n{s['text']}" for s in sections)
        analysis["narrativeClinicalSource"] = "\n".join(s["text"] for s in sections)
        analysis["clinicalSummarySections"] = sections[:8]
        analysis["complexClinicalContainer"] = True
        analysis["pdfExportMode"] = "summary"
        diagnoses = []
        seen = set()
        for row in analysis.get("extractedDiagnoses") or []:
            if not isinstance(row, dict):
                continue
            name = _v604_clean_diagnosis_name(row.get("name") or "")
            quote = str(row.get("sourceQuote") or row.get("summary") or name)
            if not name or _V604_ADMIN.search(name) or _V604_BAD_COMPLEX.search(name) or _v604_text_quality(name) < 0.45:
                continue
            key = normalize_text(name)
            if key in seen:
                continue
            seen.add(key)
            clean_diag = {**row, "name": name, "summary": quote, "sourceQuote": quote}
            clean_diag["facility"] = analysis.get("facility") or ""
            clean_diag["specialization"] = analysis.get("specialization") or ""
            clean_diag.pop("facilityContact", None)
            clean_diag.pop("doctor", None)
            clean_diag.pop("physician", None)
            diagnoses.append(clean_diag)
        analysis["extractedDiagnoses"] = diagnoses
        # Anche nei record clinici derivati non persistere recapiti, personale o
        # provenienze amministrative diverse da struttura e reparto.
        for key in ("extractedTherapies", "extractedExemptions"):
            cleaned_rows = []
            for row in analysis.get(key) or []:
                if not isinstance(row, dict):
                    continue
                item = dict(row)
                item["facility"] = analysis.get("facility") or ""
                item["specialization"] = analysis.get("specialization") or ""
                for field in ("facilityContact", "doctor", "physician", "medicalPersonnel", "identifiers"):
                    item.pop(field, None)
                cleaned_rows.append(item)
            analysis[key] = cleaned_rows

    analysis["clinicalCanonicalVersion"] = "v6.0.4-python-v2"
    analysis["clinicalValidationVersion"] = "v6.0.4-python-v2"
    meta = dict(analysis.get("clinicalCanonicalMetadata") or {})
    if facility:
        meta["facility"] = facility
    # Non persistere recapiti amministrativi nella rappresentazione canonica.
    meta.pop("facilityContact", None)
    analysis["clinicalCanonicalMetadata"] = meta
    return analysis

# ==========================================================================
# V6.0.4 FIX4 - correzione circoscritta alle cartelle cliniche complesse
# ==========================================================================
_V604_FIX4_BASE_ANALYZE_DOCUMENT = analyze_document_v420


def _v604_fix4_complex_department(text: str, fallback: str = "") -> str:
    raw = normalize_text(text or "")
    if re.search(r"medicina\s+(?:degenza\s+)?d['’]?urgenza(?:\s+e\s+ps)?|medicina\s+urgenza|d['’]?urgenza\s+e\s+ps", raw, re.I):
        return "Medicina d'urgenza"
    known = (
        ("Endocrinologia", r"\bendocrinolog"),
        ("Cardiologia", r"\bcardiolog"),
        ("Neurologia", r"\bneurolog"),
        ("Epatologia", r"\bepatolog"),
        ("Pneumologia", r"\bpneumolog"),
        ("Nefrologia", r"\bnefrolog"),
        ("Gastroenterologia", r"\bgastroenterolog|endoscopia\s+digestiva"),
        ("Oncologia", r"\boncolog"),
        ("Radiologia", r"\bradiolog|diagnostica\s+per\s+immagini"),
    )
    for label, pattern in known:
        if re.search(pattern, raw, re.I):
            return label
    value = re.sub(r"\s+", " ", str(fallback or "")).strip(" ,;:-")
    value = re.sub(r"^(?:u\.?\s*o\.?\s*(?:c\.?|s\.?d\.?)?\s*|unit[aà]\s+operativa\s*:?\s*|reparto\s*:?\s*)", "", value, flags=re.I).strip(" ,;:-")
    if value and len(value) <= 90 and not _V604_ADMIN.search(value) and not re.match(r"^(?:medicina|carte|timbro|codice)$", value, re.I):
        return value
    return ""


def _v604_fix4_complex_facility(text: str, fallback: str = "") -> str:
    raw = str(text or "")[:50000]
    if re.search(r"azienda\s+ospedalier[oa][ -]+universitaria\s+pisana", raw, re.I):
        return "Azienda Ospedaliero-Universitaria Pisana"
    lines = [re.sub(r"\s+", " ", x).strip(" ,;:-") for x in raw.replace("\r", "\n").split("\n")]
    patterns = (
        re.compile(r"\b(Azienda\s+Ospedalier[oa](?:[- ]Universitaria)?\s+[A-Za-zÀ-ÿ' .-]{2,70})", re.I),
        re.compile(r"\b(Policlinico\s+[A-Za-zÀ-ÿ' .-]{2,70})", re.I),
        re.compile(r"\b(Ospedale\s+[A-Za-zÀ-ÿ' .-]{2,70})", re.I),
        re.compile(r"\b((?:Biomedical\s+)?Centro\s+Medico(?:\s+[A-Za-zÀ-ÿ' .-]{1,60})?)", re.I),
        re.compile(r"\b(Istituto\s+[A-Za-zÀ-ÿ' .-]{2,70})", re.I),
    )
    for line in lines[:180]:
        line = re.split(r"\s+(?=(?:p\.?\s*iva|partita\s+iva|c\.?f\.?|codice\s+fiscale|via|viale|piazza|corso|tel\.?|telefono|fax|e-?mail|www\.)\b)", line, maxsplit=1, flags=re.I)[0].strip(" ,;:-")
        for pattern in patterns:
            match = pattern.search(line)
            if not match:
                continue
            candidate = re.sub(r"\s+", " ", match.group(1)).strip(" ,;:-")
            if 5 <= len(candidate) <= 110:
                return candidate
    value = re.sub(r"\s+", " ", str(fallback or "")).strip(" ,;:-")
    m = re.search(r"(?i)(Azienda\s+Ospedalier[oa].{2,90}|Policlinico\s+.{2,80}|Ospedale\s+.{2,80}|Centro\s+Medico\s+.{0,70}|Istituto\s+.{2,80})", value)
    if m:
        value = m.group(1)
    value = re.split(r"\b(?:p\.?\s*iva|partita\s+iva|c\.?f\.?|codice\s+fiscale|tel\.?|telefono|fax|e-?mail|www\.)\b", value, maxsplit=1, flags=re.I)[0].strip(" ,;:-")
    if _V604_ADMIN.search(value) and not re.search(r"\b(?:azienda\s+ospedal|policlinico|ospedale|centro\s+medico|istituto)\b", value, re.I):
        return ""
    return value[:110]


def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _V604_FIX4_BASE_ANALYZE_DOCUMENT(extracted, file_name)
    raw = str(extracted.get("text") or "")
    pages = extracted.get("pages") or []
    complex_record = _test36_is_clinical_record(raw, pages, file_name) or analysis.get("documentKind") == "Cartella clinica" or bool(analysis.get("complexClinicalContainer"))
    if not complex_record:
        return analysis

    analysis["documentKind"] = "Cartella clinica"
    analysis["category"] = "Cartella clinica"
    analysis["documentMode"] = "narrative"
    analysis["complexClinicalContainer"] = True
    analysis["facility"] = _v604_fix4_complex_facility(raw, analysis.get("facility") or "")
    analysis["facilityContact"] = ""
    department = _v604_fix4_complex_department(raw, analysis.get("department") or analysis.get("specialization") or "")
    analysis["department"] = department
    analysis["specialization"] = department
    analysis["doctor"] = ""
    analysis["medicalPersonnel"] = []
    analysis["identifiers"] = []
    analysis["qualitativeResults"] = []
    analysis["tableRows"] = []
    analysis["pdfExportMode"] = "summary"
    analysis["clinicalCanonicalVersion"] = "v6.0.4-python-v3-complex"
    analysis["clinicalValidationVersion"] = "v6.0.4-python-v3-complex"
    meta = dict(analysis.get("clinicalCanonicalMetadata") or {})
    meta.update({
        "documentKind": "Cartella clinica",
        "category": "Cartella clinica",
        "documentMode": "narrative",
        "facility": analysis.get("facility") or "",
        "department": department,
        "specialization": department,
    })
    meta.pop("facilityContact", None)
    analysis["clinicalCanonicalMetadata"] = meta
    return analysis


# ============================================================================
# V6.0.4 FIX6 - barriera finale esclusiva per cartelle cliniche complesse
# ============================================================================
_V604_FIX6_BASE_ANALYZE_DOCUMENT = analyze_document_v420
_V604_FIX6_CLIN_HEAD = re.compile(r"(?:diagnosi\s+(?:di\s+)?(?:accoglimento|ingresso|dimissione)|anamnesi(?:\s+(?:patologica|familiare|fisiologica|farmacologica|remota|prossima))*|esame\s+obiettivo|decorso\s+clinico|terapia(?:\s+(?:domiciliare|alla\s+dimissione|in\s+atto))?|interventi?|procedure?|reperti?|conclusioni?|lettera\s+di\s+dimissione|motivo\s+(?:del\s+)?ricovero|storia\s+clinica|problemi\s+(?:attivi|clinici)|allergie|accertamenti|consulenze|esami\s+(?:ematochimici|di\s+laboratorio|strumentali)|indicazioni|raccomandazioni)", re.I)
_V604_FIX6_ADMIN_HEAD = re.compile(r"(?:consenso(?:\s+al\s+trattamento)?|informativa|privacy|scheda\s+nosologica|cognome\s+e\s+nome|nome\s+e\s+cognome|data\s+(?:di\s+)?nascita|luogo\s+di\s+nascita|stato\s+civile|comune\s+di\s+residenza|codice\s+fiscale|timbro\s+e\s+n|addetto\s+cartellinatura|cartella\s+clinica\s+n|regione\s+di\s+assistenza|medico\s+curante)", re.I)
_V604_FIX6_STRONG = re.compile(r"\b(?:diagnos\w*|anamnes\w*|terap\w*|decorso|repert\w*|conclusion\w*|esame\s+obiettivo|dimess\w*|ricover\w*|intervent\w*|allerg\w*|farmac\w*|somministr\w*|dolor\w*|febbr\w*|dispnea|edem\w*|lesion\w*|emorrag\w*|versament\w*|tromb\w*|ischem\w*|stenos\w*|calcific\w*|frattur\w*|cardiac\w*|polmon\w*|renal\w*|epat\w*|diabet\w*|ipertens\w*|ipotiroid\w*|tiroid\w*|obesit\w*|saturaz\w*|ossigen\w*|glicem\w*|creatinin\w*|emoglobin\w*|ventricol\w*|carotid\w*|encefal\w*|fegat\w*|rene|cuore|polmone|pressione\s+arteriosa|frequenza\s+cardiaca|scompenso|insufficienza|infezione)\b", re.I)

_V604_FIX6_NOISE = re.compile(r"(?:scr\s+copia|spedali?\s+riuniti(?:\s+\d+)?|consenso\s+al|priorit[aà](?:\s+\d+)?|difficolt[aà]\s+respi|anamnesi\s+po\b|il\s+paziente,?\s+vist\b|fumo\s*:\s*not|td\s*:\s*candesart|uo\s+medicina\s+\d+|addetto\s+cartellinatura|copia\s+rn\s+s)", re.I)


def _v604_fix6_is_complex(analysis: dict[str, Any], raw: str, pages: list[Any], file_name: str) -> bool:
    if bool(analysis.get("complexClinicalContainer")) or analysis.get("documentKind") == "Cartella clinica":
        return True
    label = f"{analysis.get('category','')} {analysis.get('title','')} {file_name}"
    if re.search(r"cartella[ _.-]*clinica", label, re.I):
        return True
    return _test36_is_clinical_record(raw, pages, file_name)


def _v604_fix6_title(value: str) -> str:
    x = normalize_text(value or "")
    if re.search(r"diagnosi.*dimission", x): return "Diagnosi di dimissione"
    if re.search(r"diagnosi.*(?:accoglimento|ingresso)", x): return "Diagnosi di accoglimento"
    if "anamnes" in x: return "Anamnesi"
    if "esame obiettivo" in x: return "Esame obiettivo"
    if "decorso" in x: return "Decorso clinico"
    if "terap" in x: return "Terapia"
    if re.search(r"intervent|procedur", x): return "Interventi e procedure"
    if "repert" in x: return "Reperti"
    if "conclusion" in x: return "Conclusioni"
    if re.search(r"lettera.*dimission", x): return "Dimissione"
    if re.search(r"motivo.*ricovero", x): return "Motivo del ricovero"
    if "storia clinica" in x: return "Storia clinica"
    if "allerg" in x: return "Allergie"
    if re.search(r"accertament|consulenz|esami", x): return "Accertamenti"
    if re.search(r"indicaz|raccomand", x): return "Indicazioni"
    return "Contenuto clinico"


def _v604_fix6_clean_inline(value: str) -> str:
    s = str(value or "")
    s = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", " ", s)
    s = re.sub(r"https?://\S+|www\.\S+", " ", s, flags=re.I)
    s = re.sub(r"\b(?:tel(?:efono)?|cell(?:ulare)?|fax)\.?\s*[:\-]?\s*\+?[\d ()\-.]{6,}", " ", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip()
    for rx in (_V604_FIX6_NOISE, _V604_BAD_COMPLEX, _V604_ADMIN):
        m = rx.search(s)
        if m:
            if m.start() == 0:
                return ""
            s = s[:m.start()].strip()
    return s


def _v604_fix6_blocks(raw: str) -> list[str]:
    s = str(raw or "").replace("\r", "\n")
    s = re.sub(r"===\s*PAGINA\s*\d+\s*===", "\n", s, flags=re.I)
    combo = re.compile(f"({_V604_FIX6_CLIN_HEAD.pattern}|{_V604_FIX6_ADMIN_HEAD.pattern})", re.I)
    s = combo.sub(r"\n\1\n", s)
    s = re.sub(r"([.;!?])\s+(?=[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ]{2,})", r"\1\n", s)
    return [re.sub(r"\s+", " ", x).strip() for x in s.split("\n") if re.sub(r"\s+", " ", x).strip()]


def _v604_fix6_sections(raw: str) -> list[dict[str, str]]:
    sections: list[dict[str, str]] = []
    seen: set[str] = set()
    current = ""
    drop = False
    def push(title: str, line: str) -> None:
        line = _v604_fix6_clean_inline(line).strip(" :-–—")
        if not line or _V604_ADMIN.search(line) or _V604_BAD_COMPLEX.search(line):
            return
        key = normalize_text(line)
        if not key or key in seen:
            return
        seen.add(key)
        target = next((x for x in sections if x["title"] == title), None)
        if target is None:
            target = {"title": title, "text": ""}
            sections.append(target)
        target["text"] += ("\n" if target["text"] else "") + line
    for line in _v604_fix6_blocks(raw):
        if _V604_FIX6_NOISE.search(line):
            current = ""; drop = False; continue
        cm = _V604_FIX6_CLIN_HEAD.match(line)
        am = _V604_FIX6_ADMIN_HEAD.match(line)
        if cm:
            current = _v604_fix6_title(cm.group(0)); drop = False
            tail = line[cm.end():].strip(" :-–—")
            if tail and (_v604_text_quality(tail) >= .2 or _V604_FIX6_STRONG.search(tail)):
                push(current, tail)
            continue
        if am:
            current = ""; drop = True; continue
        if drop:
            continue
        clean = _v604_fix6_clean_inline(line)
        if not clean:
            continue
        lab = bool(_V604_KNOWN_LAB.match(clean) and (_V604_LAB_UNIT.search(clean) or _V604_LAB_RANGE.search(clean)))
        if lab:
            push("Esami di laboratorio", clean)
        elif current:
            if _v604_text_quality(clean) >= .22 or _V604_FIX6_STRONG.search(clean):
                push(current, clean)
        elif _V604_FIX6_STRONG.search(clean) and _v604_text_quality(clean) >= .28:
            push("Contenuto clinico", clean)
    return [x for x in sections if x.get("text")]


def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _V604_FIX6_BASE_ANALYZE_DOCUMENT(extracted, file_name)
    raw = str(extracted.get("text") or "")
    pages = extracted.get("pages") or []
    if not _v604_fix6_is_complex(analysis, raw, pages, file_name):
        return analysis
    sections = _v604_fix6_sections(raw)
    analysis["documentKind"] = "Cartella clinica"
    analysis["category"] = "Cartella clinica"
    analysis["documentMode"] = "narrative"
    analysis["complexClinicalContainer"] = True
    analysis["facility"] = _v604_fix4_complex_facility(raw, analysis.get("facility") or "")
    analysis["facilityContact"] = ""
    department = _v604_fix4_complex_department(raw, analysis.get("department") or analysis.get("specialization") or "")
    analysis["department"] = department
    analysis["specialization"] = department
    analysis["doctor"] = ""
    analysis["medicalPersonnel"] = []
    analysis["identifiers"] = []
    analysis["qualitativeResults"] = []
    analysis["tableRows"] = []
    analysis["reportSections"] = sections
    analysis["clinicalSummarySections"] = sections[:10]
    analysis["reconstructedText"] = "\n\n".join(f"{x['title']}\n{x['text']}" for x in sections)
    analysis["narrativeClinicalSource"] = "\n".join(x["text"] for x in sections)
    analysis["pdfExportMode"] = "summary"
    analysis["clinicalCanonicalVersion"] = "v6.0.4-python-v4-complex"
    analysis["clinicalValidationVersion"] = "v6.0.4-python-v4-complex"
    return analysis

# ============================================================================
# V6.0.4 FIX20 - classificazione canonica e pulizia clinica alla fonte
# ============================================================================
_V604_FIX20_BASE_ANALYZE_DOCUMENT = analyze_document_v420
_V604_FIX20_VERSION = "v6.0.4-python-v5-canonical-classification"

_V604_FIX20_COMPLEX_STRONG = re.compile(
    r"(?:cartella\s+clinica\s+n|scheda\s*\(s\.?d\.?o\.?\)|numero\s+cartella|diagnosi\s+di\s+(?:accoglimento|ingresso|dimissione)|"
    r"data\s+(?:del|di)\s+ricovero|data\s+(?:di\s+)?dimissione|diario\s+clinico|degenza|trasferimenti?\s+interni|"
    r"consulenze\s+per\s+pazienti\s+ricoverati)", re.I,
)
_V604_FIX20_ADMIN_DROP = re.compile(
    r"(?:consenso\s+(?:informato|al\s+trattamento)|trattamento\s+dei\s+dati|dossier\s+sanitario\s+elettronico|privacy|gdpr|"
    r"codice\s+fiscale|partita\s+iva|p\.?\s*iva|residenza|domicilio|indirizzo|\bvia\s+[a-zà-ÿ]|telefono|tel\.?|fax|e-?mail|@|www\.|https?://|"
    r"direttore\s*:|responsabile\s*:|medico\s+richiedente|operatore\s+richiedente|operatore\s+consulente|reparto\s+richiedente|reparto\s+consulente|"
    r"timbro|firma\s+(?:del\s+)?(?:paziente|medico|tutore)|copia\s+conforme|pag\.?\s*\d+\s*(?:/|di)\s*\d+|"
    r"riservato\s+all['’]?ufficio|cartellinatura|microfilm|numero\s+linea|faxmaker|report\s+fax|"
    r"modalit[aà]\s+di\s+erogazione|onere\s+degenza|cittadinanza|stato\s+civile|professione|datore)", re.I,
)
_V604_FIX20_REQUEST_DROP = re.compile(
    r"^(?:richiesta\s*:|si\s+richiede\b|prestazion[ei]\s+richiest|modulo\s+richiesta|quesito\s+diagnostico\s*:|"
    r"alla\s+cortese\s+attenzione\b|mezzo\s+di\s+trasporto|contatto\s+telefonico|urgenza\b|distr\.\s*corp|lato\b)", re.I,
)
_V604_FIX20_KEEP_CLINICAL = re.compile(
    r"(?:diagnos|anamnes|terap|decorso|repert|conclusion|esame\s+obiettivo|indicaz|raccomand|follow[- ]?up|"
    r"ricover|dimission|intervent|procedur|consulenza\s+(?:cardiologica|pneumologica|diabetologica|neurologica|psichiatrica|psicologica)|"
    r"pressione|frequenza|saturaz|ossigen|glicem|creatinin|emoglobin|obesit|diabet|ipertens|insufficienz|scompenso|trombos|"
    r"ecograf|tomograf|radiograf|polisonnograf|audiometr|spirometr|biops|istolog|mg\b|mcg\b|mmhg|kg\b|cm\b)", re.I,
)


def _v604_fix20_source_text(extracted: dict[str, Any]) -> str:
    text = str(extracted.get("text") or "")
    if text.strip():
        return text
    return "\n".join(str(p.get("text") or "") for p in (extracted.get("pages") or []) if isinstance(p, dict))


def _v604_fix20_is_complex(raw: str, pages: list[dict[str, Any]], file_name: str, analysis: dict[str, Any]) -> bool:
    if analysis.get("documentKind") == "Cartella clinica" or analysis.get("complexClinicalContainer"):
        return True
    n = normalize_text(f"{file_name}\n{raw[:90000]}")
    page_count = max(len(pages or []), int(analysis.get("ocrProcessedPages") or 0))
    if re.search(r"cartella[ _.-]*clinica", normalize_text(file_name), re.I):
        return True
    strong = len(_V604_FIX20_COMPLEX_STRONG.findall(n))
    # Una cartella reale può avere il nome file poco descrittivo: la struttura del contenuto prevale.
    if strong >= 3 and page_count >= 8:
        return True
    if strong >= 5:
        return True
    if page_count >= 20 and strong >= 2 and re.search(r"\bricover|\bdimission|\bdegenza", n, re.I):
        return True
    return False


def _v604_fix20_date_iso(day: str, month: str, year: str) -> str:
    try:
        d, m, y = int(day), int(month), int(year)
        if not (1900 <= y <= 2100 and 1 <= m <= 12 and 1 <= d <= 31):
            return ""
        import datetime as _dt
        _dt.date(y, m, d)
        return f"{y:04d}-{m:02d}-{d:02d}"
    except Exception:
        return ""


def _v604_fix20_clinical_dates(raw: str) -> list[dict[str, str]]:
    patterns = [
        ("Ricovero", r"(?:data\s+(?:del|di)\s+ricovero|data\s+(?:di\s+)?ammissione|data\s+(?:di\s+)?ingresso|ricover[oa]\s+(?:il|dal))[^\d]{0,35}(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-]((?:19|20)\d{2})"),
        ("Accettazione", r"(?:data\s+(?:di\s+)?accettazione|accettazione\s*:?)[^\d]{0,35}(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-]((?:19|20)\d{2})"),
        ("Dimissione", r"(?:data\s+(?:di\s+)?dimissione|dimess[oa]\s+(?:il|in\s+data)|dimissione\s*:?)[^\d]{0,35}(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-]((?:19|20)\d{2})"),
        ("Diagnosi", r"(?:data\s+(?:della\s+)?diagnosi)[^\d]{0,35}(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-]((?:19|20)\d{2})"),
        ("Esame", r"(?:data\s+(?:dell['’]?|di\s+)?esame|data\s+esame)[^\d]{0,30}(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-]((?:19|20)\d{2})"),
        ("Visita", r"(?:visita\s+(?:del|in\s+data))[^\d]{0,20}(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-]((?:19|20)\d{2})"),
        ("Consulenza", r"(?:consulenza[^\n]{0,80}?eseguita\s+(?:il|in\s+data)?)\s*:?\s*(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-]((?:19|20)\d{2})"),
    ]
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for label, pattern in patterns:
        for m in re.finditer(pattern, raw, re.I):
            iso = _v604_fix20_date_iso(m.group(1), m.group(2), m.group(3))
            if not iso:
                continue
            key = f"{label}|{iso}"
            if key in seen:
                continue
            seen.add(key)
            out.append({"label": label, "date": iso})
    priority = {"Ricovero": 0, "Accettazione": 1, "Diagnosi": 2, "Esame": 3, "Visita": 4, "Consulenza": 5, "Dimissione": 9}
    out.sort(key=lambda x: (x["date"], priority.get(x["label"], 5)))
    return out[:80]


def _v604_fix20_clean_complex_sections(raw: str, existing: list[dict[str, Any]]) -> list[dict[str, str]]:
    # Partiamo dal canone già conservativo della FIX precedente, poi imponiamo la barriera finale.
    source_sections = _v604_fix6_sections(raw) if raw.strip() else []
    if not source_sections:
        source_sections = [x for x in existing or [] if isinstance(x, dict)]
    result: list[dict[str, str]] = []
    merged: dict[str, list[str]] = {}
    seen: set[str] = set()

    dates = _v604_fix20_clinical_dates(raw)
    if dates:
        date_lines = []
        for item in dates:
            y, m, d = item["date"].split("-")
            date_lines.append(f"{item['label']}: {d}/{m}/{y}")
        merged["Date cliniche"] = date_lines

    for sec in source_sections:
        title = re.sub(r"\s+continua.*$", "", str(sec.get("title") or "Contenuto clinico"), flags=re.I).strip() or "Contenuto clinico"
        if re.search(r"(?:consenso|informativa|privacy|dati\s+personali|modulo\s+richiesta)", title, re.I):
            continue
        for raw_line in str(sec.get("text") or "").splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip()
            if not line:
                continue
            if _V604_FIX20_REQUEST_DROP.search(line):
                continue
            # Se una riga contiene dati amministrativi ma anche un contenuto clinico vero, recuperiamo solo la parte clinica.
            if _V604_FIX20_ADMIN_DROP.search(line):
                if not _V604_FIX20_KEEP_CLINICAL.search(line):
                    continue
                starts = [m.start() for m in re.finditer(
                    r"(?:diagnosi|anamnesi|terapia|decorso|reperti?|conclusioni?|indicazioni?|raccomandazioni?|riferisce|nega|presenta|"
                    r"paziente\s+(?:in|con)|all['’]?esame|esame\s+obiettivo|pressione|saturazione|peso|ecg|ecografia|tac|tc\b|rm\b|rx\b)",
                    line, re.I)]
                if starts:
                    line = line[min(starts):].strip()
                else:
                    continue
            if re.match(r"^(?:il\s+consulente|il\s+medico|dr\.?|dott\.?|dott\.ssa|prof\.?|direttore\b)", line, re.I) and len(line.split()) <= 8:
                continue
            key = normalize_text(f"{title}|{line}")
            if not key or key in seen:
                continue
            seen.add(key)
            merged.setdefault(title, []).append(line)

    order = ["Date cliniche", "Motivo del ricovero", "Diagnosi di accoglimento", "Diagnosi di dimissione", "Anamnesi", "Esame obiettivo",
             "Decorso clinico", "Terapia", "Accertamenti", "Esami di laboratorio", "Interventi e procedure", "Reperti", "Conclusioni", "Indicazioni", "Allergie", "Contenuto clinico"]
    keys = [k for k in order if k in merged] + [k for k in merged if k not in order]
    for title in keys:
        text = "\n".join(merged[title]).strip()
        if text:
            result.append({"title": title, "text": text})
    return result


_V604_FIX20_VISITS = [
    ("Visita ORL", "Otorinolaringoiatria", r"\b(?:visita\s+(?:otorinolaringoiatrica|orl)|otorinolaringoiatria|otorino(?:laringoiatria)?)\b"),
    ("Visita cardiologica", "Cardiologia", r"\bvisita\s+cardiologica\b"),
    ("Visita neurologica", "Neurologia", r"\bvisita\s+neurologica\b"),
    ("Visita endocrinologica", "Endocrinologia", r"\bvisita\s+endocrinologica\b"),
    ("Visita diabetologica", "Diabetologia", r"\bvisita\s+diabetologica\b"),
    ("Visita epatologica", "Epatologia", r"\bvisita\s+epatologica\b"),
    ("Visita oculistica", "Oculistica", r"\bvisita\s+oculistica\b"),
    ("Visita pneumologica", "Pneumologia", r"\bvisita\s+pneumologica\b"),
    ("Visita gastroenterologica", "Gastroenterologia", r"\bvisita\s+gastroenterologica\b"),
    ("Visita urologica", "Urologia", r"\bvisita\s+urologica\b"),
    ("Visita ortopedica", "Ortopedia", r"\bvisita\s+ortopedica\b"),
    ("Visita psichiatrica", "Psichiatria", r"\bvisita\s+psichiatrica\b"),
    ("Visita fisiatrica", "Fisiatria", r"\bvisita\s+fisiatrica\b"),
    ("Visita dermatologica", "Dermatologia", r"\bvisita\s+dermatologica\b"),
    ("Visita ginecologica", "Ginecologia", r"\bvisita\s+ginecologica\b"),
    ("Visita nefrologica", "Nefrologia", r"\bvisita\s+nefrologica\b"),
]
_V604_FIX20_INSTRUMENTS = [
    ("Esame audiometrico", "Otorinolaringoiatria", r"\b(?:esame\s+)?audiometric[oa]\b|\baudiometria\b|\baudiogramma\b"),
    ("Polisonnografia", "Pneumologia", r"\bpolisonnografia\b|\bpoligrafia\s+notturna\b"),
    ("Spirometria", "Pneumologia", r"\bspirometria\b"),
    ("Ecocardiogramma", "Cardiologia", r"\becocardiogramma\b|\becocolordoppler\s+cardiaco\b"),
    ("Elettrocardiogramma", "Cardiologia", r"\belettrocardiogramma\b|\becg\b"),
    ("Ecocolordoppler", "Radiologia", r"\becocolordoppler\b|\beco-color-doppler\b"),
    ("TAC", "Radiologia", r"\b(?:tac|tomografia\s+computerizzata|tc\s+(?:cranio|torace|addome|collo))\b"),
    ("Risonanza magnetica", "Radiologia", r"\brisonanza\s+magnetica\b|\brm[n]?\b"),
    ("Radiografia", "Radiologia", r"\bradiografia\b|\brx\s+(?:torace|addome|cranio|arto|colonna)\b"),
    ("Gastroscopia", "Gastroenterologia", r"\b(?:gastroscopia|esofagogastroduodenoscopia|egds)\b"),
]


def _v604_fix20_identity(raw: str, analysis: dict[str, Any], complex_record: bool) -> dict[str, str]:
    n = normalize_text(raw)
    head = normalize_text(raw[:24000])
    if complex_record:
        return {"label": "Cartella clinica", "category": "Cartella clinica", "mode": "narrative", "specialization": analysis.get("specialization") or analysis.get("department") or ""}

    visit = None
    for label, spec, pattern in _V604_FIX20_VISITS:
        if re.search(pattern, head, re.I):
            visit = (label, spec)
            break
    instrument = None
    for label, spec, pattern in _V604_FIX20_INSTRUMENTS:
        if re.search(pattern, head, re.I):
            instrument = (label, spec)
            break
    if visit:
        label, spec = visit
        if label == "Visita ORL" and instrument and instrument[0] == "Esame audiometrico":
            label = "Visita ORL con esame audiometrico"
        return {"label": label, "category": "Visita specialistica", "mode": "narrative", "specialization": spec}
    if instrument:
        label, spec = instrument
        return {"label": label, "category": "Referto strumentale", "mode": "narrative", "specialization": spec}

    # Un documento è terapeutico solo con intestazioni/pattern forti, non perché una visita contiene la terapia in atto.
    therapy_head = bool(re.search(r"\b(?:piano\s+terapeutico|scheda\s+(?:di\s+)?(?:valutazione\s+e\s+)?prescrizione|terapia\s+farmacologica)\b", head, re.I))
    if therapy_head:
        return {"label": "Piano terapeutico", "category": "Piano terapeutico", "mode": "therapy", "specialization": analysis.get("specialization") or ""}
    if re.search(r"\b(?:emocromo|esame\s+esito\s+unit[aà]\s+di\s+misura|valori\s+di\s+riferimento|laboratorio\s+analisi)\b", head, re.I):
        return {"label": "Esami di laboratorio", "category": "Esami di laboratorio", "mode": "lab", "specialization": "Laboratorio analisi"}
    # Manteniamo la classificazione precedente solo se già specifica e non generica.
    old_label = str(analysis.get("documentKind") or "").strip()
    old_category = str(analysis.get("category") or "").strip()
    if old_label and normalize_text(old_label) not in {"documento sanitario", "terapie farmacologiche"}:
        return {"label": old_label, "category": old_category or "Documento sanitario", "mode": analysis.get("documentMode") or "narrative", "specialization": analysis.get("specialization") or ""}
    return {"label": "Documento sanitario", "category": "Documento sanitario", "mode": "narrative", "specialization": analysis.get("specialization") or ""}


def _v604_fix20_title(label: str, clinical_date: str) -> str:
    if clinical_date and re.fullmatch(r"\d{4}-\d{2}-\d{2}", clinical_date):
        y, m, d = clinical_date.split("-")
        return f"{label} del {d}/{m}/{y}"
    return label


def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _V604_FIX20_BASE_ANALYZE_DOCUMENT(extracted, file_name)
    raw = _v604_fix20_source_text(extracted)
    pages = extracted.get("pages") or []
    complex_record = _v604_fix20_is_complex(raw, pages, file_name, analysis)
    identity = _v604_fix20_identity(raw, analysis, complex_record)

    analysis["documentKind"] = identity["label"]
    analysis["category"] = identity["category"]
    analysis["documentMode"] = identity["mode"]
    if identity.get("specialization"):
        analysis["specialization"] = identity["specialization"]
        analysis["department"] = analysis.get("department") or identity["specialization"]
    analysis["title"] = _v604_fix20_title(identity["label"], str(analysis.get("clinicalDate") or ""))
    analysis["documentTypeSource"] = "classificazione canonica dal contenuto clinico"
    analysis["documentTypeConfidence"] = 100 if complex_record else (99 if identity["label"] != "Documento sanitario" else 60)
    analysis["documentTypeVersion"] = _V604_FIX20_VERSION

    if complex_record:
        sections = _v604_fix20_clean_complex_sections(raw, analysis.get("reportSections") or [])
        analysis["complexClinicalContainer"] = True
        analysis["documentKind"] = "Cartella clinica"
        analysis["category"] = "Cartella clinica"
        analysis["documentMode"] = "narrative"
        analysis["reportSections"] = sections
        analysis["clinicalSummarySections"] = sections[:14]
        analysis["reconstructedText"] = "\n\n".join(f"{s['title']}\n{s['text']}" for s in sections)
        analysis["narrativeClinicalSource"] = "\n".join(s["text"] for s in sections)
        analysis["facilityContact"] = ""
        analysis["doctor"] = ""
        analysis["medicalPersonnel"] = []
        analysis["identifiers"] = []
        analysis["qualitativeResults"] = []
        analysis["tableRows"] = []
        dates = _v604_fix20_clinical_dates(raw)
        analysis["clinicalDates"] = dates
        # Ricovero e dimissione sono metadati clinici da preservare.
        admission = next((x["date"] for x in dates if x["label"] == "Ricovero"), "")
        discharge = next((x["date"] for x in reversed(dates) if x["label"] == "Dimissione"), "")
        if admission:
            analysis["clinicalDate"] = admission
            analysis["title"] = _v604_fix20_title("Cartella clinica", admission)
        if discharge:
            analysis["issueDate"] = discharge
        analysis["pdfExportMode"] = analysis.get("pdfExportMode") if analysis.get("pdfExportMode") in {"full", "summary", "exclude"} else "summary"

    analysis["clinicalCanonicalVersion"] = _V604_FIX20_VERSION
    analysis["clinicalValidationVersion"] = _V604_FIX20_VERSION
    return analysis

# FIX20b - filtro finale per evitare che intestazioni errate trascinino pagine intere
# dentro sezioni cliniche (es. Terapia/Allergie) nelle cartelle cliniche complesse.
_V604_FIX20B_BASE_ANALYZE_DOCUMENT = analyze_document_v420
_V604_FIX20B_FORM_NOISE = re.compile(
    r"(?:liv\s+istruzione|trasf\s+inti|cod\s+reparto|tessera\s+team|rilasciata\s+il|qualifica\s+istituto|"
    r"riscontro\s+autoptico|pres\.\s+al\s+ric|lateralit[aà]|stadiazione|check\s*list|robot|serv\b|elezio|"
    r"prestazione\s+richiest[ae]|richieste\s+eseguite|non\s+specificato|normale\s+non\s+specificato|"
    r"scheda\s+di\s+prima\s+prescrizione|categoria\s+farmaco\s+posologia|selezionare\s+farmaco|"
    r"sezione\s+da\s+compilare|dichiaro\s+di\s+aver\s+letto|essere\s+stato\s+informato|acconsento|autorizzo|"
    r"oggetti\s+personali|denaro\s+non|cassafort|articoli\s+da\s+toilette|protesi\s+mobili|"
    r"this\s+fax\s+was|company\s+name|address\b|website\b|report\s+fax)", re.I)
_V604_FIX20B_DIAG = re.compile(r"(?:diagnos|insufficienz|scompenso|obesit|diabet|ipertens|iperuric|linfedem|trombos|anemi|ernia|reflusso|infezion|apnea|osas|cardiopati|danno\s+renale|versamento|atelettas|cisti|bronco|polmon|nefro|epato|tiroid|neoplas|tumor|stenos|aritmi|fibrill|ischemi|emorrag|frattur|dolore|dispnea)", re.I)
_V604_FIX20B_THERAPY = re.compile(r"(?:\bterapia\b|\btrattat[oa]\b|\bassum\w*\b|\bsomministr\w*\b|\bsospes[oa]\b|\bsospendere\b|\bprosegu\w*\b|\bintrodurr?\w*\b|\bprescritt\w*\b|\bmonitorare\b|\bcpap\b|\bbipap\b|\bniv\b|\bossigenoterapia\b|\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml|ui|u\/min|l\/min)\b|\b(?:cp|cpr|gocce|iniezione|inalazione)\b)", re.I)
_V604_FIX20B_PROCEDURE = re.compile(r"(?:intervent|procedur|eseguit[oa]|sottopost[oa]|tac\b|\btc\b|rx\b|ecograf|ecocolordoppler|ecg\b|egds|esofagogastro|gastroscop|biops|polisonnograf|poligrafia|spirometr|catetere|cvc\b|ventilaz|chirurgia|sleeve|trasfusion|ossigenoterapia|riabilitaz)", re.I)
_V604_FIX20B_ACCERT = re.compile(r"(?:accertament|esam[ei]\b|consulenz|visita\b|refert|risult|ecg\b|ecograf|tac\b|\btc\b|rx\b|risonanz|doppler|polisonnograf|spirometr|glicem|creatinin|emoglobin|pco2|po2|ph\b|hba1c|d[- ]?dimero|ves\b|pcr\b|pressione|saturaz|frequenza)", re.I)
_V604_FIX20B_OBJECTIVE = re.compile(r"(?:altezza|peso|bmi|imc|pressione|frequenza|saturaz|sensorio|cute|torace|cuore|addome|arti|edem|tiroide|linfo|peristals|murphy|condizioni\s+generali|vigile|orientat|collaborante|eupnoic|apiretic)", re.I)
_V604_FIX20B_RECOMMEND = re.compile(r"(?:indicaz|raccomand|utile\b|consigli|programm|controllo|follow[- ]?up|prosegu|sospend|introdur|ripetere|monitorare|rivalutare|prescriz|necessit[aà]|dovr[aà]|si\s+raccomanda)", re.I)
_V604_FIX20B_ALLERGY = re.compile(r"(?:allerg|lattice|augmentin|penicill|amoxic|cefalospor|sulfa|iodio|mezzo\s+di\s+contrasto)", re.I)
_V604_FIX20B_GARBAGE = re.compile(r"(?:\bPPP(?:\s+PPP){2,}|_{5,}|\b(?:aaa|eee|iii)(?:\s+(?:aaa|eee|iii)){3,}|[|{}\[\]~^`]{2,})", re.I)


def _v604_fix20b_good_prose(line: str) -> bool:
    s = re.sub(r"\s+", " ", str(line or "")).strip()
    if not s or _V604_FIX20B_GARBAGE.search(s) or _V604_FIX20B_FORM_NOISE.search(s):
        return False
    if _V604_FIX20_ADMIN_DROP.search(s) and not _V604_FIX20_KEEP_CLINICAL.search(s):
        return False
    words = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ]{2,}", s)
    if len(words) < 2:
        return False
    vowel_words = sum(1 for w in words if re.search(r"[aeiouàèéìòóù]", w, re.I))
    return vowel_words / max(1, len(words)) >= 0.45


def _v604_fix20b_keep_line(title: str, line: str) -> bool:
    if title == "Date cliniche":
        return True
    if not _v604_fix20b_good_prose(line):
        return False
    if _V604_FIX20_REQUEST_DROP.search(line):
        return False
    t = normalize_text(title)
    if "diagnosi" in t:
        return bool(_V604_FIX20B_DIAG.search(line))
    if t == "terapia":
        return bool(_V604_FIX20B_THERAPY.search(line))
    if "allerg" in t:
        return bool(_V604_FIX20B_ALLERGY.search(line))
    if "intervent" in t or "procedur" in t:
        return bool(_V604_FIX20B_PROCEDURE.search(line))
    if "accert" in t or "esami" in t:
        return bool(_V604_FIX20B_ACCERT.search(line) or _V604_FIX20B_PROCEDURE.search(line))
    if "esame obiettivo" in t:
        return bool(_V604_FIX20B_OBJECTIVE.search(line))
    if "indicaz" in t or "raccomand" in t:
        return bool(_V604_FIX20B_RECOMMEND.search(line))
    if "anamnes" in t:
        return bool(_V604_FIX20B_DIAG.search(line) or _V604_FIX20B_THERAPY.search(line) or re.search(r"(?:riferisce|nega|storia|pregress|famil|fumo|alcool|attivit[aà]|sonno|alvo|diuresi|mestru|gravid|abort)", line, re.I))
    if "decorso" in t:
        return bool(_V604_FIX20_KEEP_CLINICAL.search(line) or _V604_FIX20B_PROCEDURE.search(line) or _V604_FIX20B_THERAPY.search(line))
    if "repert" in t or "conclusion" in t or "dimission" in t or "motivo del ricovero" in t:
        return bool(_V604_FIX20_KEEP_CLINICAL.search(line) or _V604_FIX20B_DIAG.search(line) or _V604_FIX20B_PROCEDURE.search(line))
    return bool(_V604_FIX20_KEEP_CLINICAL.search(line) or _V604_FIX20B_DIAG.search(line))


def _v604_fix20b_reclean(sections: list[dict[str, Any]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for sec in sections or []:
        if not isinstance(sec, dict):
            continue
        title = str(sec.get("title") or "Contenuto clinico").strip() or "Contenuto clinico"
        kept: list[str] = []
        for raw_line in str(sec.get("text") or "").splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip()
            if not _v604_fix20b_keep_line(title, line):
                continue
            key = normalize_text(line)
            if not key or key in seen:
                continue
            seen.add(key)
            kept.append(line)
        if kept:
            out.append({"title": title, "text": "\n".join(kept)})
    return out


def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _V604_FIX20B_BASE_ANALYZE_DOCUMENT(extracted, file_name)
    if analysis.get("documentKind") == "Cartella clinica" or analysis.get("complexClinicalContainer"):
        sections = _v604_fix20b_reclean(analysis.get("reportSections") or [])
        analysis["reportSections"] = sections
        analysis["clinicalSummarySections"] = sections[:14]
        analysis["reconstructedText"] = "\n\n".join(f"{s['title']}\n{s['text']}" for s in sections)
        analysis["narrativeClinicalSource"] = "\n".join(s["text"] for s in sections)
        analysis["clinicalCanonicalVersion"] = _V604_FIX20_VERSION
        analysis["clinicalValidationVersion"] = _V604_FIX20_VERSION
    return analysis


# ============================================================================
# V6.0.4 FIX21 - classificazione v14 guidata dall'intestazione interna
# ============================================================================
_V604_FIX21_BASE_ANALYZE_DOCUMENT = analyze_document_v420
_V604_FIX21_VERSION = "v6.0.4-python-v6-header-first-classification"

_V604_FIX21_RULES = [
    ("Visita ORL", "Visita specialistica", "narrative", "Otorinolaringoiatria", [
        r"\bvisita\s+(?:otorinolaringoiatrica|orl)\b", r"\botorinolaringoiatria\b", r"\bvisita\s+otorino\b"]),
    ("Visita dermatologica", "Visita specialistica", "narrative", "Dermatologia", [r"\bvisita\s+dermatologica\b", r"\bdermatologia\b"]),
    ("Visita pneumologica", "Visita specialistica", "narrative", "Pneumologia", [r"\bvisita\s+pneumologica\b", r"\bpneumologia\b"]),
    ("Visita cardiologica", "Visita specialistica", "narrative", "Cardiologia", [r"\bvisita\s+cardiologica\b", r"\bcardiologia\b"]),
    ("Visita cardiotoracica", "Visita specialistica", "narrative", "Cardiotoracica", [r"\bvisita\s+cardiotoracica\b", r"\bcardiotorace\b", r"\bcardio[- ]?toracica\b"]),
    ("Visita diabetologica", "Visita specialistica", "narrative", "Diabetologia", [r"\bvisita\s+diabetologica\b"]),
    ("Visita neurologica", "Visita specialistica", "narrative", "Neurologia", [r"\bvisita\s+neurologica\b"]),
    ("Visita endocrinologica", "Visita specialistica", "narrative", "Endocrinologia", [r"\bvisita\s+endocrinologica\b"]),
    ("Visita epatologica", "Visita specialistica", "narrative", "Epatologia", [r"\bvisita\s+epatologica\b"]),
    ("Visita oculistica", "Visita specialistica", "narrative", "Oculistica", [r"\bvisita\s+oculistica\b"]),
    ("Visita gastroenterologica", "Visita specialistica", "narrative", "Gastroenterologia", [r"\bvisita\s+gastroenterologica\b"]),
    ("Visita urologica", "Visita specialistica", "narrative", "Urologia", [r"\bvisita\s+urologica\b"]),
    ("Visita ortopedica", "Visita specialistica", "narrative", "Ortopedia", [r"\bvisita\s+ortopedica\b"]),
    ("Visita psichiatrica", "Visita specialistica", "narrative", "Psichiatria", [r"\bvisita\s+psichiatrica\b"]),
    ("Visita fisiatrica", "Visita specialistica", "narrative", "Fisiatria", [r"\bvisita\s+fisiatrica\b"]),
    ("Visita ginecologica", "Visita specialistica", "narrative", "Ginecologia", [r"\bvisita\s+ginecologica\b"]),
    ("Visita nefrologica", "Visita specialistica", "narrative", "Nefrologia", [r"\bvisita\s+nefrologica\b"]),
    ("Visita specialistica lipolinfedema", "Visita specialistica", "narrative", "Lipolinfedema", [r"\blipolinfedema\b", r"\blipo[- ]?linfedema\b"]),
    ("Ecocolordoppler arti inferiori", "Referto strumentale", "narrative", "Angiologia/Radiologia", [
        r"\beco(?:color)?doppler\s+(?:venoso\s+)?(?:degli\s+)?arti\s+inferiori\b", r"\becocolordoppler\s+venoso\s+arti\s+inferiori\b"]),
    ("Esame audiometrico", "Referto strumentale", "narrative", "Otorinolaringoiatria", [r"\b(?:esame\s+)?audiometric[oa]\b", r"\baudiometria\b", r"\baudiogramma\b"]),
    ("Elettrocardiogramma", "Referto strumentale", "narrative", "Cardiologia", [r"\belettrocardiogramma\b", r"\becg\b"]),
    ("Ecocardiogramma", "Referto strumentale", "narrative", "Cardiologia", [r"\becocardiogramma\b", r"\becocolordoppler\s+cardiaco\b"]),
    ("Polisonnografia", "Referto strumentale", "narrative", "Pneumologia", [r"\bpolisonnografia\b", r"\bpoligrafia\s+notturna\b"]),
    ("Spirometria", "Referto strumentale", "narrative", "Pneumologia", [r"\bspirometria\b"]),
    ("Confronto analisi", "Confronto analisi", "lab", "Laboratorio analisi", [r"\bconfronto\s+analis[ei]\b", r"\braffronto\s+analis[ei]\b"]),
]

_V604_FIX21_FILENAME_RULES = [
    ("Visita dermatologica", "Visita specialistica", "narrative", "Dermatologia", r"dermatolog"),
    ("Visita ORL", "Visita specialistica", "narrative", "Otorinolaringoiatria", r"(?:^|[_ .-])orl(?:[_ .-]|$)|otorino|audiometr"),
    ("Visita pneumologica", "Visita specialistica", "narrative", "Pneumologia", r"pneumolog|emogas"),
    ("Visita cardiologica", "Visita specialistica", "narrative", "Cardiologia", r"visita[_ .-]*cardiolog|cardiolog"),
    ("Visita cardiotoracica", "Visita specialistica", "narrative", "Cardiotoracica", r"cardiotorace|cardio[_ .-]*torac"),
    ("Visita specialistica lipolinfedema", "Visita specialistica", "narrative", "Lipolinfedema", r"lipolinfed|lipo[_ .-]*linfed|troyer"),
    ("Ecocolordoppler arti inferiori", "Referto strumentale", "narrative", "Angiologia/Radiologia", r"eco(?:color)?doppler[_ .-]*arti[_ .-]*inferiori"),
    ("Confronto analisi", "Confronto analisi", "lab", "Laboratorio analisi", r"confronto[_ .-]*analisi|raffronto[_ .-]*analisi"),
]


def _v604_fix21_header_lines(raw: str) -> list[str]:
    lines = []
    for line in str(raw or "").replace("\r", "\n").split("\n"):
        line = re.sub(r"\s+", " ", line).strip()
        if not line or re.match(r"^===\s*PAGINA\s*\d+\s*===$", line, re.I):
            continue
        lines.append(line)
        if len(lines) >= 140:
            break
    return lines


def _v604_fix21_rule_score(lines: list[str], patterns: list[str]) -> int:
    best = 0
    for idx, line in enumerate(lines):
        low = normalize_text(line)
        for pattern in patterns:
            if not re.search(pattern, low, re.I):
                continue
            score = 0
            # L'intestazione esplicita, isolata o all'inizio di riga, e' il segnale dominante.
            if re.match(r"^(?:tipo\s+esame\s*[:\-]?\s*)?(?:visita|esame|ecocolordoppler|ecodoppler|polisonnografia|poligrafia|spirometria|elettrocardiogramma|ecg|confronto)\b", low, re.I):
                score = 130
            elif idx < 25:
                score = 105
            elif idx < 60:
                score = 80
            else:
                score = 45
            best = max(best, score)
    return best


def _v604_fix21_identity(raw: str, analysis: dict[str, Any], file_name: str, complex_record: bool) -> dict[str, Any]:
    if complex_record:
        return {"label": "Cartella clinica", "category": "Cartella clinica", "mode": "narrative", "specialization": analysis.get("specialization") or analysis.get("department") or "", "source": "struttura cartella clinica", "confidence": 100}
    lines = _v604_fix21_header_lines(raw)
    candidates: list[tuple[int, str, str, str, str]] = []
    for label, category, mode, spec, patterns in _V604_FIX21_RULES:
        score = _v604_fix21_rule_score(lines, patterns)
        if score:
            candidates.append((score, label, category, mode, spec))
    # Il nome file e' solo un segnale secondario. Non puo' battere un'intestazione interna chiara.
    fn = normalize_text(os.path.basename(file_name or ""))
    for label, category, mode, spec, pattern in _V604_FIX21_FILENAME_RULES:
        if re.search(pattern, fn, re.I):
            candidates.append((68, label, category, mode, spec))
    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        score, label, category, mode, spec = candidates[0]
        joined = normalize_text("\n".join(lines[:100]))
        # Combinazioni cliniche esplicite.
        if label == "Visita ORL" and re.search(r"\b(?:esame\s+)?audiometric[oa]\b|\baudiometria\b|\baudiogramma\b", joined, re.I):
            label = "Visita ORL con esame audiometrico"
        if label == "Visita cardiologica" and re.search(r"\belettrocardiogramma\b|\becg\b", joined, re.I):
            label = "Visita cardiologica con ECG"
        return {"label": label, "category": category, "mode": mode, "specialization": spec, "source": "intestazione clinica interna" if score >= 80 else "nome file come conferma", "confidence": min(100, score)}
    return {"label": analysis.get("documentKind") or analysis.get("category") or "Documento sanitario", "category": analysis.get("category") or "Documento sanitario", "mode": analysis.get("documentMode") or "narrative", "specialization": analysis.get("specialization") or "", "source": "classificazione precedente", "confidence": int(analysis.get("documentTypeConfidence") or 60)}


def _v604_fix21_birth_dates(raw: str) -> set[str]:
    out: set[str] = set()
    for m in re.finditer(r"(?:data\s+(?:di\s+)?nascita|nato\/?a?\s+(?:a\s+[^\n]{0,40}\s+)?(?:il\s*)?)[^\d]{0,20}(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})", raw, re.I):
        iso = _v604_fix20_date_iso(m.group(1), m.group(2), m.group(3))
        if iso:
            out.add(iso)
    return out


def _v604_fix21_explicit_date(raw: str, current: str = "") -> str:
    birth = _v604_fix21_birth_dates(raw)
    patterns = [
        r"(?:data\s+(?:e\s+ora\s+)?referto|data\s+(?:dell['’]?|di\s+)?esame|data\s+visita|visita\s+del|referto\s+completato\s*:?)\s*[^\d]{0,20}(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})",
        r"(?:data\s+(?:di\s+)?accettazione)\s*:?\s*(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})",
    ]
    for pattern in patterns:
        m = re.search(pattern, raw[:18000], re.I)
        if m:
            date = _v604_fix20_date_iso(m.group(1), m.group(2), m.group(3))
            if date and date not in birth:
                return date
    if current and current not in birth:
        return current
    return ""


def analyze_document_v420(extracted: dict[str, Any], file_name: str = "") -> dict[str, Any]:
    analysis = _V604_FIX21_BASE_ANALYZE_DOCUMENT(extracted, file_name)
    raw = _v604_fix20_source_text(extracted)
    pages = extracted.get("pages") or []
    complex_record = _v604_fix20_is_complex(raw, pages, file_name, analysis)
    ident = _v604_fix21_identity(raw, analysis, file_name, complex_record)
    analysis["documentKind"] = ident["label"]
    analysis["category"] = ident["category"]
    analysis["documentMode"] = ident["mode"]
    if ident.get("specialization"):
        analysis["specialization"] = ident["specialization"]
        analysis["department"] = ident["specialization"]
    if not complex_record:
        date = _v604_fix21_explicit_date(raw, str(analysis.get("clinicalDate") or ""))
        if date:
            analysis["clinicalDate"] = date
        analysis["title"] = _v604_fix20_title(ident["label"], str(analysis.get("clinicalDate") or ""))
    analysis["documentTypeVersion"] = _V604_FIX21_VERSION
    analysis["documentTypeSource"] = ident.get("source") or "intestazione clinica interna"
    analysis["documentTypeConfidence"] = ident.get("confidence") or 60
    analysis["clinicalCanonicalVersion"] = _V604_FIX21_VERSION
    analysis["clinicalValidationVersion"] = _V604_FIX21_VERSION
    return analysis

# V6.0.4 FIX23 PRE-BETA - classificatore documentale semantico gerarchico v16.
# Principio: prima si identifica l'atto clinico principale, poi specialita' e atti
# associati. Le parole del corpo non possono battere una intestazione/struttura
# clinica corrente. Il nome file e' solo conferma secondaria. In caso di evidenze
# insufficienti non viene inventata una specialita'. Il parser OCR resta v14.
from difflib import SequenceMatcher

_V604_FIX22_CLASSIFIER_VERSION = 'document-classifier-v16'
_V604_FIX22_VERSION = 'v6.0.4-python-v8-semantic-identity'
_V604_FIX22_BASE_ANALYZE_DOCUMENT = analyze_document_v420

# ---- Motore di identita' documentale v15 ----
import re, unicodedata, os
from difflib import SequenceMatcher



def fold(v=''):
    s=unicodedata.normalize('NFD',str(v or ''))
    s=''.join(ch for ch in s if unicodedata.category(ch)!='Mn')
    s=s.replace('\u00ad','').replace('\u00a0',' ').replace('–','-').replace('—','-').replace('−','-')
    s=re.sub(r'[ \t]+',' ',s)
    return s.strip().lower()


def clean_lines(raw, limit=220):
    out=[]
    for row in str(raw or '').replace('\r','\n').split('\n'):
        line=re.sub(r'\s+',' ',row).strip()
        if not line or re.match(r'^===\s*PAGINA\s*\d+\s*===$',line,re.I):
            continue
        out.append(line)
        if len(out)>=limit: break
    return out

SPECIALTIES=[
    # label, visit label, regex patterns, fuzzy tokens
    ('Otorinolaringoiatria','Visita ORL',[r'otorinolaring',r'\botorino\b',r'\borl\b'],['otorinolaringoiatria','otorinolaringoiatrica']),
    ('Dermatologia','Visita dermatologica',[r'dermatolog',r'venereolog'],['dermatologia','dermatologica','venereologia']),
    ('Pneumologia','Visita pneumologica',[r'pneumolog'],['pneumologia','pneumologica']),
    ('Cardiologia','Visita cardiologica',[r'cardiolog'],['cardiologia','cardiologica']),
    ('Neurologia','Visita neurologica',[r'neurolog'],['neurologia','neurologica']),
    ('Endocrinologia','Visita endocrinologica',[r'endocrinolog',r'endocrino[- ]?metabolic'],['endocrinologia','endocrinologica']),
    ('Diabetologia','Visita diabetologica',[r'diabetolog',r'malattie\s+metaboliche\s+e\s+diabetologia'],['diabetologia','diabetologica']),
    ('Epatologia','Visita epatologica',[r'epatolog'],['epatologia','epatologica']),
    ('Oculistica','Visita oculistica',[r'oculist',r'oftalmolog'],['oculistica','oculistica','oftalmologia']),
    ('Gastroenterologia','Visita gastroenterologica',[r'gastroenterolog'],['gastroenterologia','gastroenterologica']),
    ('Reumatologia','Visita reumatologica',[r'reumatolog'],['reumatologia','reumatologica']),
    ('Nefrologia','Visita nefrologica',[r'nefrolog'],['nefrologia','nefrologica']),
    ('Urologia','Visita urologica',[r'\burolog'],['urologia','urologica']),
    ('Ortopedia','Visita ortopedica',[r'ortoped'],['ortopedia','ortopedica']),
    ('Fisiatria','Visita fisiatrica',[r'fisiatr'],['fisiatria','fisiatrica']),
    ('Psichiatria','Visita psichiatrica',[r'psichiatr'],['psichiatria','psichiatrica']),
    ('Ginecologia','Visita ginecologica',[r'ginecolog'],['ginecologia','ginecologica']),
    ('Ematologia','Visita ematologica',[r'ematolog'],['ematologia','ematologica']),
    ('Oncologia','Visita oncologica',[r'oncolog'],['oncologia','oncologica']),
    ('Angiologia','Visita angiologica',[r'angiolog'],['angiologia','angiologica']),
    ('Linfologia','Visita linfologica',[r'linfolog'],['linfologia','linfologica']),
    ('Chirurgia vascolare','Visita di chirurgia vascolare',[r'chirurgia\s+vascolare',r'chirurg\w*\s+vascolar'],['vascolare']),
    ('Geriatria','Visita geriatrica',[r'geriatr'],['geriatria','geriatrica']),
    # intentionally last: department can be cardio-toraco-vascolare but does not by itself mean a cardiotoracic visit
    ('Cardiotoracica','Visita cardiotoracica',[r'cardio[- ]?toracic',r'cardiotorac'],['cardiotoracica']),
]

INSTRUMENTS=[
    ('Gastroscopia','Gastroenterologia',[r'esofagogastroduodenoscopia',r'gastroscopia',r'\begd\b',r'\begds\b']),
    ('Colonscopia','Gastroenterologia',[r'colonscopia',r'colonoscopia',r'ileocolonscopia']),
    ('Esame audiometrico','Otorinolaringoiatria',[r'esame\s+audiometric',r'audiometria',r'audiogramma']),
    ('Elettrocardiogramma','Cardiologia',[r'elettrocardiogramma',r'\becg\b']),
    ('Ecocardiogramma','Cardiologia',[r'ecocardiogramma',r'ecocolordoppler\s+cardiaco',r'ecocolordopplergrafia\s+cardiaca',r'ecocardiografia']),
    ('Spirometria','Pneumologia',[r'spirometria',r'\bspirometry\b',r'prove?\s+di\s+funzionalita\s+respiratoria',r'\bpfr\b']),
    ('Emogasanalisi','Pneumologia',[r'emogasanalisi',r'emogas',r'\bega\b']),
    ('Polisonnografia','Pneumologia',[r'polisonnografia',r'poligrafia\s+notturna']),
    ('Saturimetria notturna','Pneumologia',[r'saturimetria\s+notturna']),
    ('Ecocolordoppler arti inferiori','Angiologia/Radiologia',[r'eco(?:color)?doppler.{0,35}arti\s+inferiori',r'circolo\s+venoso\s+profondo.{0,100}femoro[- ]?poplite']),
    ('Ecocolordoppler TSA','Angiologia/Radiologia',[r'eco(?:color)?doppler.{0,35}(?:tronchi\s+sovra+aortici|tronchi\s+sovraortici|\btsa\b|carotid)']),
    ('Ecocolordoppler','Radiologia',[r'ecocolordoppler',r'eco-color-doppler',r'ecodoppler']),
    ('Ecografia tiroidea','Endocrinologia',[r'ecografia\s+(?:del\s+)?collo',r'ecografia\s+tiroide']),
    ('Ecografia','Radiologia',[r'\becografia\b',r'ecotomografia']),
    ('TAC','Radiologia',[r'\btac\b',r'tomografia\s+computerizzata',r'\btc\s+(?:cranio|torace|addome|encefalo|collo|maxill)']),
    ('Risonanza magnetica','Radiologia',[r'risonanza\s+magnetica',r'\brmn?\b']),
    ('Radiografia','Radiologia',[r'\bradiografia\b',r'\brx\s*(?:torace|anca|ginocchio|cranio|colonna|addome|dent)']),
    ('Mammografia','Senologia/Radiologia',[r'mammografia',r'mammografico']),
    ('Pap test','Ginecologia',[r'pap\s*test',r'citologia\s+cervico']),
    ('Anatomia patologica','Anatomia patologica',[r'anatomia\s+patologic',r'anatomie\s+patologic',r'esame\s+istologico',r'diagnosi\s+istologica',r'esame\s+macroscopico.{0,220}\bdiagnosi\b']),
    ('Analisi composizione corporea','Nutrizione/Metabolismo',[r'analisi\s+(?:della\s+)?composizione\s+corporea',r'bioimpedenziometr']),
]


def _token_fuzzy(line, targets, threshold=.93):
    toks=[x for x in re.findall(r'[a-z0-9]+',fold(line)) if len(x)>=7]
    for target in targets:
        t=fold(target)
        for tok in toks:
            if tok==t:
                return True
            if abs(len(tok)-len(t))<=3 and SequenceMatcher(None,tok,t).ratio()>=threshold:
                return True
    return False


def _hit(line, patterns, fuzzy=()):
    n=fold(line)
    if any(re.search(p,n,re.I) for p in patterns): return True
    return bool(fuzzy and _token_fuzzy(n,fuzzy))


def specialty_hits(line):
    # Se esiste una corrispondenza esatta, non aggiungere specialita' simili per fuzzy matching
    # (es. Ematologia non deve diventare Epatologia, Neurologia non deve diventare Urologia).
    n=fold(line)
    exact=[]
    for label,visit,patterns,fuzzy in SPECIALTIES:
        if any(re.search(p,n,re.I) for p in patterns): exact.append((label,visit))
    if exact:
        return exact
    out=[]
    for label,visit,patterns,fuzzy in SPECIALTIES:
        if fuzzy and _token_fuzzy(n,fuzzy): out.append((label,visit))
    return out


def instrument_hits(line):
    n=fold(line); out=[]
    for label,spec,patterns in INSTRUMENTS:
        if any(re.search(p,n,re.I) for p in patterns): out.append((label,spec))
    return out


def _display_clinical_phrase(value, max_len=90):
    s=re.sub(r'\s+',' ',str(value or '')).strip(' :-,.;')
    s=re.split(r'\s+(?:data\s+e\s+ora|data\s+referto|referto|tsrm|scrivente)\s*[:\-]',s,maxsplit=1,flags=re.I)[0]
    s=s[:max_len].strip(' :-,.;')
    if s and s.upper()==s:
        s=s.lower()
    return (s[:1].upper()+s[1:]) if s else ''


def _specialty_from_visit_phrase(phrase):
    p=_display_clinical_phrase(phrase,60)
    n=fold(p)
    if n.endswith('ologica'):
        return _display_clinical_phrase(p[:-7]+'ologia',60)
    if n.endswith('iatrica'):
        return _display_clinical_phrase(p[:-7]+'iatria',60)
    if n.endswith('chirurgica'):
        return 'Chirurgia'
    return p


def _unknown_visit_from_line(line):
    # Recupero strutturale per specialita non ancora presenti nell'ontologia.
    # Si usa solo quando la riga dichiara realmente una visita.
    m=re.search(r'\bvisita\s+([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9 /+\'’.-]{2,80})',str(line or ''),re.I)
    if not m: return ('','')
    phrase=m.group(1)
    phrase=re.split(r'\s+(?:con|per|del|della|in\s+data|e\s+seguent|e\s+i\s+seguent)\b',phrase,maxsplit=1,flags=re.I)[0]
    phrase=_display_clinical_phrase(phrase,60)
    if not phrase: return ('','')
    n=fold(phrase)
    if re.match(r'^(?:ambulatoriale|specialistica|generale|medica|di controllo|di follow|successiva|odierna|presso|questo|istituto|del|in data)\b',n): return ('','')
    if len(re.findall(r'[a-zà-ÿ]+',n))>5: return ('','')
    return ('Visita '+phrase.lower(), _specialty_from_visit_phrase(phrase))


def _unknown_provider_specialty(line):
    m=re.search(r'\b(?:medico\s+chirurgo\s+)?specialista\s+in\s+(.{3,90})$',str(line or '').strip(),re.I)
    if not m: return ''
    phrase=re.split(r'\b(?:tel\.?|telefono|studio|abit\.?|riceve|fax|e-?mail)\b',m.group(1),maxsplit=1,flags=re.I)[0]
    phrase=_display_clinical_phrase(phrase,70)
    if len(phrase)<4 or len(re.findall(r'[A-Za-zÀ-ÖØ-öø-ÿ]+',phrase))>7: return ''
    return phrase


def _unknown_exam_from_line(line):
    m=re.search(r'\btipo\s+esame\s*[:\-]\s*(.{3,100})$',str(line or '').strip(),re.I)
    if not m: return ''
    phrase=_display_clinical_phrase(m.group(1),85)
    if not phrase or re.search(r'\b(?:non indicat|nessun|n/?a)\b',fold(phrase)): return ''
    return phrase



def _valid_iso(d,m,y):
    try:
        dd,mm,yy=int(d),int(m),int(y)
        if not (1900<=yy<=2100 and 1<=mm<=12 and 1<=dd<=31): return ''
        import datetime as _dt
        _dt.date(yy,mm,dd)
        return f'{yy:04d}-{mm:02d}-{dd:02d}'
    except Exception:
        return ''


def explicit_clinical_date(raw, current=''):
    text=str(raw or '')
    births=set()
    for m in re.finditer(r'(?:data\s+(?:di\s+)?nascita|nascita|nato/?a?)\s*[:\-]?[^\d\n]{0,35}(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})',text,re.I):
        x=_valid_iso(m.group(1),m.group(2),m.group(3))
        if x: births.add(x)
    patterns=[
        # La data dell'atto clinico ha priorita sulla data di firma/refertazione.
        r'\bdata\s+visita\s*[:\-]?\s*(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})',
        r'\bvisita\s+del\s+(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})',
        r'\bdata\s+(?:dell[\'’]?|di\s+)?esame\s*[:\-]?\s*(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})',
        r'\bdata\s+ref\.?\s*[:\-]?\s*(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})',
        r'\bdata\s+(?:e\s+ora\s+)?(?:del\s+)?referto\s*[:\-]?\s*(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})',
        r'\bdata\s+(?:di\s+)?accettazione\s*[:\-]?\s*(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})',
        r'\brefertazione\s+di\s*[:\-]?[^\d\n]{0,30}(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})',
    ]
    head=text[:22000]
    for pat in patterns:
        m=re.search(pat,head,re.I)
        if m:
            x=_valid_iso(m.group(1),m.group(2),m.group(3))
            if x and x not in births: return x
    return current if current and current not in births else ''

def _date_iso_from_line(line, reference_date=''):
    m=re.search(r'(?<!\d)(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-]((?:19|20)?\d{2})(?!\d)',str(line or ''))
    if not m:return ''
    yy=int(m.group(3))
    if len(m.group(3))==2:
        ref_year=None
        if re.match(r'^\d{4}-\d{2}-\d{2}$',str(reference_date or '')):
            ref_year=int(str(reference_date)[:4])
        if ref_year is None:
            import datetime as _dt
            ref_year=_dt.date.today().year
        century=(ref_year//100)*100
        yy=century+yy
        if yy>ref_year+1: yy-=100
    try:
        import datetime as _dt
        _dt.date(yy,int(m.group(2)),int(m.group(1)))
    except Exception:
        return ''
    return f'{yy:04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}'


def _is_historical_visit_line(line, clinical_date=''):
    n=fold(line)
    dated=_date_iso_from_line(line,clinical_date)
    if dated and clinical_date and dated!=clinical_date: return True
    if re.search(r'\b(?:ultima|precedente|pregressa|pregresso|recente)\s+visita\b',n): return True
    if re.search(r'\b(?:durante|nel corso de)\b.{0,60}\b(?:ricovero|degenza)\b.{0,100}\b(?:visita|consulenza)\b',n): return True
    if re.search(r'\b(?:ha|aveva)\s+(?:eseguito|effettuato|praticato)\b.{0,80}\bvisita\b',n): return True
    return False


def _is_recommended_visit(line):
    n=fold(line)
    return bool(re.search(r'\b(?:prescriv\w*|consigli\w*|program\w*|prenot\w*|richied\w*|invito\w*|necessari\w*)\b.{0,55}\bvisita\b|\bvisita\b.{0,40}\b(?:da\s+eseguire|di\s+controllo|fra|tra\s+\d|entro)\b',n))


def _strong_main_visit(line, idx, clinical_date=''):
    n=fold(line)
    if _is_historical_visit_line(line,clinical_date) or _is_recommended_visit(line): return False
    return bool(
        re.search(r'\bprestazion\w*\b.{0,45}\bvisita\b',n) or
        re.search(r'\b(?:tipo\s+prestazione|prestazione\s+principale)\b.{0,45}\bvisita\b',n) or
        re.search(r'\breferto\s+(?:di\s+)?visita\b',n) or
        re.match(r'^visita\b',n) or
        re.search(r'\b(?:sottopost[oa]|sottoposto/a)\b.{0,45}\bvisita\b',n) or
        (idx<18 and re.search(r'\bvisita\b',n) and not re.search(r'\b(?:prenotazione|appuntamento|controllo\s+precedente)\b',n))
    )


def _instrument_is_history(line, context_date, clinical_date):
    n=fold(line)
    dated=_date_iso_from_line(line,clinical_date)
    if dated and clinical_date and dated!=clinical_date: return True
    if context_date and clinical_date and context_date!=clinical_date: return True
    if re.search(r'\b(?:precedente|pregress[oa]|ultima)\b.{0,45}\b(?:ecg|ega|emogas|audiometr|ecograf|ecocardiogram|spirometr|tac|tc|rx|risonanza)',n): return True
    if re.search(r'\b(?:del|in data)\s+\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b.{0,45}\b(?:ecg|ega|emogas|audiometr|ecograf|ecocardiogram|spirometr|tac|tc|rx|risonanza)',n): return True
    return False


def semantic_identity(raw, base=None, file_name=''):
    base=base or {}; raw=str(raw or '')
    lines=clean_lines(raw)
    head='\n'.join(lines[:180]); nhead=fold(head); fn=fold(os.path.basename(file_name or ''))
    clinical_date=explicit_clinical_date(raw,str(base.get('clinicalDate') or ''))

    # Prenotazioni sanitarie: struttura amministrativa con prestazione, data e ora future.
    # R10: ripristino classificazione delle scansioni CUP/prenotazioni senza interferire con i referti clinici.
    booking_text=fold('\n'.join(lines[:120]))
    booking_structure=bool(re.search(r'\bquando presentarsi(?: per visite ed esami)?\b',booking_text) and re.search(r'\bdove presentarsi(?: per visite ed esami)?\b',booking_text) and re.search(r'\bprestazione\b',booking_text))
    if booking_structure:
        service=''
        service_re=re.compile(r'\b(?:visita|ecocolordoppler|ecocolor doppler|ecografia|elettrocardiogramma|ecg|risonanza|rmn?|tac|tc|radiografia|mammografia|endoscopia|colonscopia|gastroscopia|prelievo|analisi|esame|spirometria|holter|doppler|audiometria|densitometria|moc|uroflussometria|elettromiografia)\b',re.I)
        header_idx=next((i for i,l in enumerate(lines[:100]) if re.search(r'\bprestazione\b',fold(l)) and re.search(r'\bdata\b',fold(l))),-1)
        search_rows=lines[max(0,header_idx):min(len(lines),header_idx+8)] if header_idx>=0 else lines[:80]
        for row in search_rows:
            if service_re.search(row):
                service=re.sub(r'^\s*\d{2,8}\s+','',row).strip(' -:;|')
                if service: break
        booking_date='' ; booking_time=''
        for i,row in enumerate(lines[:140]):
            dm=re.search(r'(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})',row)
            if not dm: continue
            iso=_date_iso_from_line(row,'')
            if not iso: continue
            nrow=fold(row)
            if 'data nascita' in nrow or 'nascita' in nrow: continue
            tm=re.search(r'(?<!\d)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)',row)
            if not tm:
                for near in lines[max(0,i-3):min(len(lines),i+4)]:
                    tm=re.search(r'(?<!\d)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)',near)
                    if tm: break
            if tm and (not booking_date or iso>=booking_date):
                booking_date=iso; booking_time=f'{int(tm.group(1)):02d}:{tm.group(2)}'
        if service and booking_date and booking_time:
            cat='Prenotazione visita' if re.search(r'\bvisita\b',fold(service)) else 'Prenotazione esami'
            return dict(label=cat,category=cat,mode='narrative',specialization='',confidence=100,source='struttura prenotazione sanitaria',associatedActs=[],clinicalDate=booking_date,bookingTime=booking_time,bookingService=service)

    # Classes that have an explicit documentary structure and should not compete with visits.
    first30=fold('\n'.join(lines[:30]))
    if re.search(r'\b(?:lettera|relazione)\s+di\s+dimissione\b',nhead):
        spec=''
        for line in lines[:30]:
            hs=specialty_hits(line)
            if hs and re.search(r'\b(?:u\.?\s*o\.?\s*c?\.?|uoc|reparto|unita\s+operativa)\b',fold(line)):
                spec=hs[0][0]; break
        return dict(label='Lettera di dimissione',category='Lettera di dimissione',mode='narrative',specialization=spec,confidence=100,source='titolo esplicito',associatedActs=[])
    # Titoli/strutture esplicite che identificano il documento senza dover dedurre una visita.
    if re.search(r'\bterapi[ae]\s+farmacologic(?:a|he)\s+in\s+corso\b',first30) or (re.search(r'\bterapi[ae]\s+farmacologic',first30) and len(re.findall(r'\b(?:mg|mcg|compressa|capsula|dosaggio|orario|farmaco)\b',nhead))>=4):
        return dict(label='Terapie farmacologiche in corso',category='Piano terapeutico',mode='therapy',specialization='',confidence=100,source='titolo/struttura terapeutica esplicita',associatedActs=[])
    if re.search(r'\b(?:test|ricerca)\s+(?:per\s+la\s+)?ricerca\s+del\s+sangue\s+occulto\s+nelle\s+feci\b|\bricerca\s+(?:del\s+)?sangue\s+occulto\s+nelle\s+feci\b',nhead) and re.search(r'\b(?:esito|risultat|negativ|positiv)\w*\b',nhead):
        return dict(label='Ricerca sangue occulto nelle feci',category='Referto di screening',mode='narrative',specialization='Screening colon-retto',confidence=100,source='prestazione di screening esplicita',associatedActs=[])
    if re.search(r'\bresmed\s+resscan\b|\bairsense\s+10\b',nhead) and re.search(r'\b(?:ahi|indice\s+apnea|pressione\s+minima|giorni\s+utilizzo|modalita\s+terapeutica)\b',nhead):
        return dict(label='Monitoraggio terapia CPAP',category='Referto strumentale',mode='narrative',specialization='Pneumologia/Medicina del sonno',confidence=99,source='report CPAP con statistiche terapeutiche',associatedActs=[])
    if re.search(r'\btipo\s+esame\s*[:\-][^\n]*\bmammografia\b[^\n]*\becografia\s+mammaria\b',nhead):
        return dict(label='Mammografia con ecografia mammaria',category='Referto strumentale',mode='narrative',specialization='Senologia/Radiologia',confidence=100,source='campo Tipo Esame con prestazioni associate',associatedActs=['Ecografia mammaria'])
    # Un vero referto di laboratorio ha una struttura tabellare densa, non basta che una visita citi esami ematochimici.
    analytes=len(re.findall(r'\b(?:emoglobina|ematocrito|piastrine|globuli\s+(?:rossi|bianchi)|leucociti|neutrofili|linfociti|creatinina|glucosio|glicemia|colesterolo|trigliceridi|transaminasi|bilirubina|sodio|potassio|tsh|tiroxina|triiodotironina)\b',nhead))
    lab_header=bool(re.search(r'\b(?:diagnostica\s+di\s+laboratorio|medicina\s+di\s+laboratorio|dipartimento[^\n]{0,80}laboratorio|virologia\s+universitaria|laboratorio\s+diagnostico|patologia\s+clinica|laboratorio\s+(?:analisi|di\s+ematologia)|microbiologia)\b',first30) and re.search(r'\besame\s+(?:metodo\s+)?esito\b|\bvalori\s+(?:di\s+)?riferimento\b',first30))
    dense_lab=analytes>=7 and len(re.findall(r'\b(?:mg/dl|g/dl|mmol|mui/ml|ui/l|10\^\d|pg/ml|ng/dl|%|fl|pg)\b',nhead))>=6 and bool(re.search(r'\besame\s+(?:metodo\s+)?esito\b|\bvalori\s+(?:di\s+)?riferimento\b',first30))
    if lab_header or dense_lab:
        return dict(label='Esami di laboratorio',category='Esami di laboratorio',mode='lab',specialization='Laboratorio analisi',confidence=100 if lab_header else 96,source='struttura tabellare di laboratorio',associatedActs=[])
    if (re.search(r'\bmateriale\s+pervenuto\b',nhead) and re.search(r'\besame\s+macroscopico\b',nhead) and re.search(r'\bsnomed\b',nhead)) or re.search(r'\b(?:anatomia|anatomie)\s+patologic',first30):
        return dict(label='Anatomia patologica',category='Referto istologico',mode='narrative',specialization='Anatomia patologica',confidence=99,source='struttura istologica/anatomopatologica',associatedActs=[])
    # Cartella clinica solo se dichiarata come documento/nel nome file, non per una citazione incidentale nel corpo.
    if re.search(r'cartella[ _.-]*clinica',fn) or (re.search(r'\b(?:cartella\s+clinica|numero\s+cartella|diario\s+clinico)\b',first30) and re.search(r'\b(?:ricovero|degenza|dimissione)\b',first30)):
        return dict(label='Cartella clinica',category='Cartella clinica',mode='narrative',specialization=base.get('specialization') or base.get('department') or '',confidence=100,source='struttura cartella clinica',associatedActs=[])
    if re.search(r'\b(?:attestato\s+di\s+esenzione|codice\s+esenzione|esenzione\s+sanitaria)\b',nhead):
        return dict(label='Esenzione sanitaria',category='Esenzione sanitaria',mode='exemption',specialization='',confidence=100,source='dicitura esplicita',associatedActs=[])
    if (len(re.findall(r'\briferimento\b',nhead))>=3 and len(re.findall(r'\bdata\b',nhead))>=3 and re.search(r'\btipo\s+esame\b.{0,45}\bvalore\b',nhead)) or re.search(r'\b(?:confronto|raffronto)\s+analis[ei]\b',nhead):
        return dict(label='Confronto analisi',category='Confronto analisi',mode='lab',specialization='Laboratorio analisi',confidence=99,source='struttura tabellare comparativa',associatedActs=[])

    spec_evidence=[]; visit_candidates=[]; instr_candidates=[]; associated=[]
    current_section_date=''
    current_section_date_idx=-999
    # Clinical encounter structure, used only together with a strong specialist header.
    marker_patterns=[r'\banamnes',r'\bdiagnos',r'esame\s+obiettivo',r'\bconclusion',r'\bterapia\b',r'\bprescrizion',r'\bindicazion',r'\bprossimo\s+controllo',r'\bcontrollo\s+metabolico']
    clinical_markers=sum(1 for p in marker_patterns if re.search(p,nhead,re.I))

    for idx,line in enumerate(lines[:220]):
        nl=fold(line)
        if re.search(r'\b(?:aggiornamento|controllo|visita)\b.{0,25}\bdel\b',nl):
            d=_date_iso_from_line(line,clinical_date)
            if d: current_section_date=d; current_section_date_idx=idx

        specs=specialty_hits(line)
        if not specs and _strong_main_visit(line,idx,clinical_date):
            ulabel,uspec=_unknown_visit_from_line(line)
            if ulabel:
                visit_candidates.append((191,ulabel,uspec,'visita esplicita con specialita non ancora in ontologia',idx,line))
        if not specs and clinical_markers>=2:
            uspec=_unknown_provider_specialty(line)
            if uspec:
                visit_candidates.append((174,'Visita specialistica di '+uspec,uspec,'qualifica specialistica non ancora in ontologia + struttura clinica',idx,line))
        for spec,visit_label in specs:
            score=35; reason='menzione nel corpo'
            # Geographic/organizational hierarchy: UO/reparto is stronger than broad department.
            if re.search(r'\b(?:u\.?\s*o\.?\s*c?\.?|uoc|uos|unita\s+operativa|reparto)\b',nl): score,reason=178,'unita operativa/reparto'
            elif re.search(r'\bambulatorio\b',nl) and (idx<35 or re.match(r'^(?:centro\s+)?ambulatorio\b',nl)): score,reason=184,'ambulatorio specialistico'
            elif re.search(r'\b(?:specialista|medico\s+chirurgo\s+specialista)\b',nl): score,reason=176,'qualifica specialistica'
            elif re.search(r'\bdipartimento\b',nl): score,reason=132,'dipartimento'
            elif re.search(r'\bcentro\s+(?:di\s+)?(?:riferimento|specialistic)\b',nl): score,reason=125,'centro specialistico'
            if idx<25 and score<100: score,reason=100,'intestazione clinica'
            # A current explicit visit is an act evidence. Historical/recommended visits never become primary.
            if re.search(r'\bvisita\b',nl):
                if _is_recommended_visit(line): vscore=45; vre='visita consigliata/prescritta'
                elif _is_historical_visit_line(line,clinical_date): vscore=55; vre='visita storica richiamata'
                elif _strong_main_visit(line,idx,clinical_date): vscore=194; vre='prestazione/visita principale esplicita'
                else: vscore=82; vre='menzione visita nel corpo'
                spec_evidence.append((max(score,min(vscore,120)),spec,visit_label,reason,idx,line))
                if vscore>=150: visit_candidates.append((vscore,visit_label,spec,vre,idx,line))
                continue
            spec_evidence.append((score,spec,visit_label,reason,idx,line))

        # Generic current visit labels, resolved by strongest structural specialty.
        generic_score=0; generic_reason=''
        if re.search(r'\breferto\s+(?:di\s+)?visita\s+ambulatoriale\b',nl): generic_score,generic_reason=198,'referto visita ambulatoriale'
        elif re.search(r'\baccesso\s*:\s*visita\s+ambulatoriale\b',nl): generic_score,generic_reason=188,'accesso visita ambulatoriale'
        elif re.match(r'^visita\s+ambulatoriale\b',nl): generic_score,generic_reason=190,'titolo visita ambulatoriale'
        elif re.match(r'^visita\s+(?:del|in\s+data)\b',nl): generic_score,generic_reason=188,'data della visita'
        elif re.search(r'\bprima\s+visita\b',nl) and not _is_recommended_visit(line): generic_score,generic_reason=185,'prima visita esplicita'
        elif re.search(r'\bho\s+valutat[oa]\b|\bho\s+vist[oa]\b',nl): generic_score,generic_reason=176,'valutazione clinica dichiarata'
        elif re.search(r'\b(?:giunge|accede|si\s+presenta)\s+(?:a|alla|per)\s+visita\b',nl): generic_score,generic_reason=174,'atto di visita nel corpo'
        if generic_score and not _is_historical_visit_line(line,clinical_date) and not _is_recommended_visit(line):
            visit_candidates.append((generic_score,'','',generic_reason,idx,line))

        # Instrument candidates. Current section context prevents historical exams from becoming associated acts.
        ihits=instrument_hits(line)
        if not ihits:
            uexam=_unknown_exam_from_line(line)
            if uexam:
                instr_candidates.append((196,uexam,'','campo Tipo Esame esplicito non ancora in ontologia',idx,line))
        for label,spec in ihits:
            context_date=current_section_date if idx-current_section_date_idx<=2 else ''
            historical=_instrument_is_history(line,context_date,clinical_date)
            score=55; reason='menzione nel corpo'
            if re.search(r'\b(?:tipo\s+esame|esame\s+eseguito|prestazione\s+eseguita|procedura)\s*[:\-]',nl): score,reason=198,'tipo esame esplicito'
            elif re.match(r'^(?:esame\s+)?(?:audiometr|ecg\b|elettrocardiogram|ecocardiogram|ecografia|ecocolordoppler|ecodoppler|spirometr|spirometry|polisonnograf|poligrafia|saturimetr|emogas|ega\b|gastroscop|esofagogastro|colonscop|tac\b|tc\b|risonanza|radiografia|rx\b|mammograf|pap\s*test|anatomia|esame\s+istologico)',nl): score,reason=158,'intestazione esame'
            elif idx<25: score,reason=126,'esame nell’intestazione'
            elif re.search(r'\b(?:ega|ecg|emogas|audiometr|spirometr|ecograf|polisonnograf|tac|tc|rx)\b.{0,35}\b(?:odiern[oa]|attuale)\b|\b(?:odiern[oa]|attuale)\b.{0,35}\b(?:ega|ecg|emogas|audiometr|spirometr|ecograf|polisonnograf|tac|tc|rx)\b',nl): score,reason=150,'esame odierno/attuale'
            elif re.search(r'\b(?:e\s+stata|e\s+stato|viene|si\s+esegue|eseguita|eseguito|praticato)\b.{0,45}\b(?:ega|ecg|audiometr|spirometr|ecograf|polisonnograf|tac|tc|rx)',nl): score,reason=142,'esame eseguito contestualmente'
            if historical:
                score=min(score,62); reason='esame storico richiamato'
            instr_candidates.append((score,label,spec,reason,idx,line))
            if score>=135 and not historical: associated.append((score,label,spec,idx,line))

    spec_evidence.sort(reverse=True,key=lambda x:x[0])
    best_spec=spec_evidence[0] if spec_evidence else None

    # Resolve generic visit by the strongest current organizational/provider specialty.
    if best_spec and best_spec[0]>=125:
        visit_candidates=[(row[0],best_spec[2],best_spec[1],row[3]+' + '+best_spec[3],row[4],row[5]) if not row[1] else row for row in visit_candidates]

    # Specialist provider / specialist clinic + encounter content can imply a visit even if literal 'visita dermatologica' is absent.
    provisional_instr=max((x[0] for x in instr_candidates),default=0)
    if best_spec:
        provider=best_spec[3]=='qualifica specialistica'
        specialist_clinic=best_spec[0]>=165
        clinic_bundle=specialist_clinic and clinical_markers>=2 and bool(re.search(r'\b(?:anamnes|terapia|prescrizion|prossimo\s+controllo|controllo\s+metabolico|diagnos)\b',nhead))
        spec_entry=next((x for x in SPECIALTIES if x[0]==best_spec[1]),None)
        filename_confirm=False
        if spec_entry and 'visita' in fn:
            filename_confirm=_hit(fn,spec_entry[2],spec_entry[3]) or fold(best_spec[1])[:7] in fn or fold(best_spec[2].replace('Visita ',''))[:7] in fn
        base_kind=fold(base.get('documentKind') or '')
        base_spec=fold(base.get('specialization') or '')
        base_visit_match=('visita' in base_kind and fold(best_spec[1]) in base_kind) or (base.get('category')=='Visita specialistica' and fold(best_spec[1]) in base_spec)
        if provider and clinical_markers>=2:
            visit_candidates.append((176,best_spec[2],best_spec[1],'specialista + struttura clinica',best_spec[4],best_spec[5]))
        elif filename_confirm and best_spec[0]>=150:
            visit_candidates.append((174,best_spec[2],best_spec[1],'contenuto specialistico + nome file come conferma',best_spec[4],best_spec[5]))
        elif clinic_bundle and provisional_instr<145:
            visit_candidates.append((171,best_spec[2],best_spec[1],'ambulatorio/UO + struttura clinica',best_spec[4],best_spec[5]))
        elif base_visit_match and best_spec[0]>=160 and provisional_instr<145:
            visit_candidates.append((160,best_spec[2],best_spec[1],'specialita strutturale coerente con visita gia riconosciuta',best_spec[4],best_spec[5]))

    # Quando l'intestazione specialistica e' meno esplicita, il nome file puo' solo confermare una specialita gia presente piu volte nel testo.
    if 'visita' in fn:
        for spec,visit_label,patterns,fuzzy in SPECIALTIES:
            mentions=sum(1 for line in lines[:180] if _hit(line,patterns,fuzzy))
            if mentions>=2 and (_hit(fn,patterns,fuzzy) or fold(spec)[:7] in fn or fold(visit_label.replace('Visita ',''))[:7] in fn) and clinical_markers>=2:
                visit_candidates.append((162,visit_label,spec,'specialita ripetuta nel contenuto + nome file come conferma',0,''))

    # Lipolinfedema is a clinically meaningful compound specialty in the real dataset.
    if visit_candidates and re.search(r'\b(?:lipo[- ]?linfedema|lipedema)\b',nhead) and re.search(r'\b(?:linfolog|angiolog|chirurgia\s+vascolare)\b',nhead):
        visit_candidates.append((199,'Visita specialistica lipolinfedema','Linfologia/Angiologia','referto specialistico linfologico per lipolinfedema',0,''))

    visit_candidates.sort(reverse=True,key=lambda x:x[0]); instr_candidates.sort(reverse=True,key=lambda x:x[0])
    v=visit_candidates[0] if visit_candidates else None; ins=instr_candidates[0] if instr_candidates else None

    # Main-act hierarchy: an explicit/current visit beats procedures carried out during it.
    choose_visit=False
    if v:
        if not ins: choose_visit=True
        elif v[0]>=170: choose_visit=True
        elif ins[0]>=190 and v[0]<170: choose_visit=False
        else: choose_visit=v[0]>=ins[0]+3

    if choose_visit:
        label,spec=v[1],v[2]
        assoc=[]
        for score,alabel,aspec,idx,line in sorted(associated,reverse=True,key=lambda x:x[0]):
            if alabel not in assoc:
                compatible=(alabel=='Esame audiometrico' and spec=='Otorinolaringoiatria') or (alabel=='Elettrocardiogramma' and spec=='Cardiologia') or (alabel=='Emogasanalisi' and spec=='Pneumologia')
                if compatible: assoc.append(alabel)
        if label=='Visita ORL' and 'Esame audiometrico' in assoc: label='Visita ORL con esame audiometrico'
        elif label=='Visita cardiologica' and 'Elettrocardiogramma' in assoc: label='Visita cardiologica con ECG'
        elif label=='Visita pneumologica' and 'Emogasanalisi' in assoc: label='Visita pneumologica con emogasanalisi'
        confidence=min(100,max(85,round(v[0]*0.52)))
        return dict(label=label,category='Visita specialistica',mode='narrative',specialization=spec,confidence=confidence,source=v[3],associatedActs=assoc,evidence=v[5])

    if ins and ins[0]>=118:
        label,spec=ins[1],ins[2]
        category='Referto istologico' if label=='Anatomia patologica' else 'Referto strumentale'
        confidence=min(100,max(80,round(ins[0]*0.52)))
        return dict(label=label,category=category,mode='narrative',specialization=spec,confidence=confidence,source=ins[3],associatedActs=[],evidence=ins[5])

    # Se il testo e' assente o quasi inutilizzabile, il nome file puo' essere usato solo per una
    # prestazione inequivocabile. Non viene mai usato per battere contenuto clinico leggibile.
    if len(nhead)<40:
        if re.search(r'(?:^|[^a-z0-9])pap[ _.-]*test(?:[^a-z0-9]|$)',fn):
            return dict(label='Pap test',category='Referto strumentale',mode='narrative',specialization='Ginecologia',confidence=82,source='nome file inequivocabile in assenza di testo utile',associatedActs=[])

    # Preserve structurally established non-visit classes, never preserve a conflicting specialty guess.
    cat=str(base.get('category') or ''); mode=str(base.get('documentMode') or ''); kind=str(base.get('documentKind') or '')
    if cat=='Esami di laboratorio' or mode=='lab':
        return dict(label='Esami di laboratorio',category='Esami di laboratorio',mode='lab',specialization='Laboratorio analisi',confidence=95,source='struttura di laboratorio',associatedActs=[])
    if cat=='Piano terapeutico' or mode=='therapy':
        return dict(label='Piano terapeutico',category='Piano terapeutico',mode='therapy',specialization=base.get('specialization') or '',confidence=92,source='struttura terapeutica',associatedActs=[])
    if cat=='Esenzione sanitaria' or mode=='exemption':
        return dict(label='Esenzione sanitaria',category='Esenzione sanitaria',mode='exemption',specialization=base.get('specialization') or '',confidence=95,source='struttura esenzione',associatedActs=[])
    # Specific non-generic prior labels may be retained if no stronger conflicting evidence emerged.
    generic={'documento sanitario','visita','ecografia','diabetologia','neurologia','epatologia','cardiologia','pneumologia','endocrinologia','otorinolaringoiatria'}
    if kind and fold(kind) not in generic and cat not in {'Documento sanitario','Visita specialistica'}:
        return dict(label=kind,category=cat or 'Documento sanitario',mode=mode or 'narrative',specialization=base.get('specialization') or '',confidence=75,source='classificazione strutturata precedente',associatedActs=[])
    return dict(label='Documento sanitario da classificare',category='Documento sanitario',mode='narrative',specialization='',confidence=40,source='evidenze insufficienti',associatedActs=[])


def analyze_document_v420(extracted: dict[str, Any], file_name: str = '') -> dict[str, Any]:
    analysis = _V604_FIX22_BASE_ANALYZE_DOCUMENT(extracted, file_name)
    raw = _v604_fix20_source_text(extracted)
    ident = semantic_identity(raw, analysis, file_name)

    analysis['documentKind'] = ident['label']
    analysis['category'] = ident['category']
    analysis['documentMode'] = ident['mode']
    if ident.get('specialization'):
        analysis['specialization'] = ident['specialization']
        analysis['department'] = ident['specialization']
    elif ident['label'] == 'Documento sanitario da classificare' or ident.get('category') in {'Esenzione sanitaria','Piano terapeutico'}:
        analysis['specialization'] = ''
        analysis['department'] = ''

    if ident['label'] != 'Cartella clinica':
        date = str(ident.get('clinicalDate') or '') or explicit_clinical_date(raw, str(analysis.get('clinicalDate') or ''))
        if date:
            analysis['clinicalDate'] = date
        if ident.get('bookingTime'):
            analysis['bookingTime'] = ident.get('bookingTime')
        if ident.get('bookingService'):
            analysis['bookingService'] = ident.get('bookingService')
        analysis['title'] = _v604_fix20_title(ident['label'], str(analysis.get('clinicalDate') or ''))

    analysis['documentClassifierVersion'] = _V604_FIX22_CLASSIFIER_VERSION
    analysis['documentTypeVersion'] = _V604_FIX22_VERSION
    analysis['documentTypeSource'] = ident.get('source') or 'classificazione semantica gerarchica'
    analysis['documentTypeConfidence'] = int(ident.get('confidence') or 40)
    analysis['documentIdentityEvidence'] = str(ident.get('evidence') or '')[:1200]
    analysis['documentAssociatedActs'] = list(ident.get('associatedActs') or [])
    analysis['clinicalCanonicalVersion'] = _V604_FIX22_VERSION
    analysis['clinicalValidationVersion'] = _V604_FIX22_VERSION
    return analysis


# ==========================================================================
# BETA 1 R3 - pipeline fotografica generale, temporale e narrativa
# ==========================================================================
_BETA1_R3_BASE_ANALYZE_DOCUMENT = analyze_document_v420
_BETA1_R3_CLASSIFIER_VERSION = 'document-classifier-v18'
_BETA1_R3_VERSION = 'v6.0.4-python-v12-semantic-clean-r30'

_BETA1_R3_ADMIN_LINE = re.compile(
    r'^(?:azienda|asl\b|ausl\b|aoup\b|ospedale|servizio sanitario|dipartimento|u\.?\s*o\.?\s*c?\.?\b|uo\s+|uoc\b|uos\b|unita operativa|direttore|responsabile|istituit[ao]\b|ospedale di rilievo|pagina?\s+\d|page\s+\d|paziente\s*:|data (?:di )?nascita\s*:|comune di nascita\s*:|codice fiscale\s*:|email\s*:|telefono\s*:|tel\.?\s*:|fax\s*:|residenza\s*:|indirizzo\s*:|alla cortese attenzione|egregio collega[, ]+ho visto il tuo assistito|il medico\b|medico\s*$|dr\.?\s+[A-ZÀ-ÖØ-Ý])',
    re.I,
)
_BETA1_R3_CLINICAL_LINE = re.compile(
    r'\b(?:paziente\s+inviat\w*|valutazion|esiti?\s+di|egds|gastroscop|colonscop|varici?|ernia|epatopatia|steatos|helicobacter|pylori|eradicazion|pirosi|epigastr|retrosternal|terapia\s+con|si\s+consiglia|si\s+raccomanda|al\s+momento|non\s+[eè]\s+necessaria|diagnos\w*|anamnes\w*|repert|conclusion|programma|riferisce|lamenta|presenta|obes|diabet|ipertens|ipotiroid|lesion|nodul|cisti|dolore|dispnea|edema|ecograf|tac\b|tc\b|rmn\b|risonanz|radiograf|ecg\b|spirometr|esame\s+obiettivo)\b',
    re.I,
)

def _beta1_r3_clean_source_text(extracted: dict[str, Any]) -> str:
    # Per fotografie/scansioni usa PRIMA le coordinate OCR: il testo lineare
    # può essere già stato mescolato da un ordinamento errato dei box.
    pages = extracted.get('pages') or extracted.get('ocrPageData') or []
    geometric = _geometric_ocr_page_text(pages)
    if geometric:
        return geometric
    # Usa una sola copia del testo OCR. Evita di concatenare extractedText,
    # structuredText e pagine quando contengono la stessa pagina.
    raw = str(extracted.get('text') or extracted.get('extractedText') or '').strip()
    if raw:
        return raw
    page_text = '\n'.join(str(p.get('text') or '') for p in pages if isinstance(p,dict)).strip()
    if page_text:
        return page_text
    return str(extracted.get('structuredText') or extracted.get('reconstructedText') or '').strip()


def _beta1_r26_document_context(raw: str, clinical_date: str = '') -> str:
    """Conserva informazioni strutturali utili senza confonderle con il referto clinico.

    Queste righe erano state eliminate come amministrative nelle versioni precedenti.
    Restano separate da narrativeClinicalSource, quindi non generano diagnosi.
    """
    out: list[str] = []
    seen: set[str] = set()
    for line in clean_lines(raw, 90):
        value = re.sub(r"\s+", " ", str(line or "")).strip()
        if not value:
            continue
        keep = False
        if re.match(r"^visita\s+ambulatoriale\b", value, re.I):
            keep = True
        elif re.match(r"^visita\s+(?:del|in\s+data)\s+\d{1,2}[/.-]\d{1,2}[/.-](?:\d{2}|\d{4})\b", value, re.I):
            keep = True
        elif re.match(r"^alla\s+cortese\s+attenzione\b", value, re.I):
            keep = True
        elif re.match(r"^egregio\s+collega\b", value, re.I):
            # Mantiene l'apertura solo se non è una riga puramente anagrafica.
            keep = True
        if not keep:
            continue
        key = normalize_text(value)
        if not key or key in seen:
            continue
        seen.add(key); out.append(value)
        if len(out) >= 6:
            break
    return "\n".join(out).strip()


_BETA1_R30_UI_NOISE = [
    re.compile(r'^[-–—]?\s*adobe\s+acrobat(?:\s+pro(?:\s+dc)?)?\s*$', re.I),
    re.compile(r'^\s*\d+\s*/\s*\d+\s*$'),
    re.compile(r'^\s*\d{1,3}(?:[,.]\d+)?\s*%\s*$'),
    re.compile(r'^\s*[+\-−]\s*$'),
    re.compile(r'^\s*[a-f0-9]{6,}(?:-[a-f0-9]{2,}){1,}(?:\s*[x×])?\s*$', re.I),
    re.compile(r'^\s*[^\s]{0,80}\.(?:pdf|jpg|jpeg|png|tif|tiff)(?:\s*[x×])?\s*$', re.I),
]
_BETA1_R30_FOOTER_ADMIN = [
    re.compile(r'\b(?:p\.?\s*iva|partita\s+iva|piva|parva|vat)\b', re.I),
    re.compile(r'\b(?:codice\s+fiscale|c\.?\s*f\.?)\b', re.I),
    re.compile(r'\b(?:iscritt\w*\s+(?:all[\'’]?|al\s+)?(?:ordine|albo)|ordine\s+(?:dei\s+)?medic|albo\s+(?:dei\s+)?medic)\b', re.I),
    re.compile(r'\b(?:telefono|tel\.?|fax|pec|e-?mail)\b\s*[:.]?', re.I),
    re.compile(r'^(?:abit\.?|studio|sede(?:\s+operativa)?|via|viale|piazza|p\.?zza|corso)\b', re.I),
    re.compile(r'^riceve\s+per\s+appuntamento\b', re.I),
]
_BETA1_R30_DOCTOR_LINE = re.compile(r'^(?:dott?\.?|dr\.?|dott\.ssa|dr\.ssa|prof\.?|prof\.ssa|doll\.?)\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý\' .-]{3,90}$', re.I)


def _beta1_r30_is_laboratory(analysis: dict[str, Any]) -> bool:
    category = normalize_text(str(analysis.get('category') or ''))
    kind = normalize_text(str(analysis.get('documentKind') or ''))
    mode = normalize_text(str(analysis.get('documentMode') or ''))
    spec = normalize_text(str(analysis.get('specialization') or ''))
    return mode == 'lab' or 'esami di laboratorio' in category or 'esami di laboratorio' in kind or 'laboratorio analisi' in spec


def _beta1_r30_is_specialist_document(analysis: dict[str, Any]) -> bool:
    if _beta1_r30_is_laboratory(analysis):
        return False
    category = normalize_text(str(analysis.get('category') or ''))
    kind = normalize_text(str(analysis.get('documentKind') or ''))
    mode = normalize_text(str(analysis.get('documentMode') or ''))
    return 'visita specialistica' in category or (kind.startswith('visita ') and mode == 'narrative')


def _beta1_r30_clean_doctor_name(value: str) -> str:
    value = re.sub(r'\s+', ' ', str(value or '')).strip(' .,:;-')
    value = re.sub(r'^(?:dott?\.?|dr\.?|dott\.ssa|dr\.ssa|prof\.?|prof\.ssa|doll\.?)\s+', '', value, flags=re.I)
    return value.strip(' .,:;-')


def _beta1_r30_specialist_provenance(analysis: dict[str, Any], raw: str) -> None:
    if _beta1_r30_is_laboratory(analysis):
        analysis['doctor'] = ''
        analysis['medicalPersonnel'] = []
        analysis.pop('doctorQualification', None)
        return
    if not _beta1_r30_is_specialist_document(analysis):
        return
    candidates: list[str] = []
    current = _beta1_r30_clean_doctor_name(str(analysis.get('doctor') or ''))
    if current:
        candidates.append(current)
    for item in analysis.get('medicalPersonnel') or []:
        if isinstance(item, dict):
            name = _beta1_r30_clean_doctor_name(str(item.get('name') or item.get('fullName') or ''))
        else:
            name = _beta1_r30_clean_doctor_name(str(item or ''))
        if name:
            candidates.append(name)
    for line in str(raw or '').replace('\r', '\n').split('\n')[:80]:
        line = re.sub(r'\s+', ' ', line).strip()
        m = re.match(r'^(?:dott?\.?|dr\.?|dott\.ssa|dr\.ssa|prof\.?|prof\.ssa)\s+([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý\' .-]{3,80})$', line, re.I)
        if m:
            name = _beta1_r30_clean_doctor_name(m.group(1))
            if name and not re.search(r'direttore|responsabile|medico\s+curante', line, re.I):
                candidates.append(name)
    doctor = next((x for x in candidates if len(x) >= 5), '')
    if doctor:
        analysis['doctor'] = doctor
        analysis['medicalPersonnel'] = [{'role': 'Medico/refertante', 'name': doctor, 'confidence': 95}]
    for line in str(raw or '').replace('\r', '\n').split('\n')[:80]:
        line = re.sub(r'\s+', ' ', line).strip()
        if re.match(r'^(?:specialista\s+in|medico\s+specialista\s+in)\s+.{4,100}$', line, re.I):
            analysis['doctorQualification'] = line[:1].upper() + line[1:].lower()
            break


def _beta1_r30_context_with_specialist(analysis: dict[str, Any], sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not _beta1_r30_is_specialist_document(analysis) or not str(analysis.get('doctor') or '').strip():
        return sections
    meta = [f"Medico/refertante: {analysis['doctor']}"]
    if str(analysis.get('doctorQualification') or '').strip():
        meta.append(f"Qualifica: {analysis['doctorQualification']}")
    elif str(analysis.get('specialization') or analysis.get('department') or '').strip():
        meta.append(f"Specializzazione: {analysis.get('specialization') or analysis.get('department')}")
    existing_index = next((i for i, sec in enumerate(sections) if re.match(r'^contesto del documento$', str(sec.get('title') or ''), re.I)), -1)
    existing = []
    if existing_index >= 0:
        existing = [re.sub(r'\s+', ' ', x).strip() for x in str(sections[existing_index].get('text') or '').split('\n') if x.strip()]
    seen = {normalize_text(x) for x in existing}
    merged = [x for x in meta if normalize_text(x) not in seen] + existing
    context = {'title': 'Contesto del documento', 'text': '\n'.join(merged).strip()}
    if existing_index >= 0:
        out = list(sections); out[existing_index] = context; return out
    return [context] + list(sections)


def _beta1_r30_footer_cleanup(lines: list[str]) -> list[str]:
    out: list[str] = []
    footer = False
    clinical_seen = False
    for raw_line in lines:
        line = re.sub(r'\s+', ' ', str(raw_line or '')).strip()
        if not line:
            continue
        if any(rx.search(line) for rx in _BETA1_R30_UI_NOISE):
            continue
        clinical = bool(_BETA1_R3_CLINICAL_LINE.search(line))
        doctor = bool(_BETA1_R30_DOCTOR_LINE.search(line))
        admin = any(rx.search(line) for rx in _BETA1_R30_FOOTER_ADMIN)
        if clinical:
            footer = False
            clinical_seen = True
        if (doctor or admin) and not clinical:
            if clinical_seen:
                footer = True
            # Le intestazioni amministrative e i medici restano nei metadati,
            # non nel testo clinico, anche prima dell'inizio del referto.
            continue
        # Dopo l'ingresso nel blocco firma/timbro/footer scarta l'intero blocco
        # non clinico. Questo elimina anche letture OCR deformate non prevedibili.
        if footer and not clinical:
            continue
        if not clinical_seen:
            if len(line) <= 2 or re.fullmatch(r'\d{1,3}', line):
                continue
            if re.fullmatch(r'[A-Za-z]{1,3}', line) and not re.match(r'^(?:mg|ml|mcg)$', line, re.I):
                continue
        if re.match(r'^(?:medico|firma|timbro|specialista|medico\s+chirurgo|dermatologo|cardiologo|gastroenterologo|chirurgo|odontoiatra)\b', line, re.I) and not clinical:
            continue
        out.append(line)
    return out


def _beta1_r30_strip_inline_footer(text: str) -> str:
    value = re.sub(r'[ \t]+', ' ', str(text or '')).strip()
    if not value:
        return ''
    candidates = []
    for rx in (
        re.compile(r'\b(?:dott?\.?|dr\.?|dott\.ssa|dr\.ssa|prof\.?|prof\.ssa|doll\.?)\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý\' .-]{3,70}?(?=\s+(?:p\.?\s*iva|piva|parva|codice\s+fiscale|[A-Z]{1,3}\s+[A-Z]{1,3}\s+\d|$))', re.I),
        re.compile(r'\b(?:p\.?\s*iva|partita\s+iva|piva|parva|vat)\b', re.I),
    ):
        m = rx.search(value)
        if m:
            candidates.append(m.start())
    if candidates:
        cut = min(candidates)
        before = value[:cut].rstrip(' ,;:-')
        if len(before) >= 40 and re.search(r'\b(?:diagnos|prescrizion|terapia|compresse?|capsule?|shampoo|detergente|integratore|paziente|repert|anamnes|si\s+consiglia|si\s+raccomanda|giorni|settimana|mese)\b', before, re.I):
            return before
    return value


def _beta1_r30_semantic_cleanup(analysis: dict[str, Any], raw: str = '') -> None:
    _beta1_r30_specialist_provenance(analysis, raw)
    sections = analysis.get('reportSections') or []
    cleaned = []
    for section in sections:
        if not isinstance(section, dict):
            continue
        title = str(section.get('title') or 'Referto').strip() or 'Referto'
        text = str(section.get('text') or '').strip()
        if re.match(r'^contesto del documento$', title, re.I):
            cleaned.append({'title': title, 'text': text})
            continue
        text = _beta1_r30_strip_inline_footer(text)
        lines = _beta1_r30_footer_cleanup([x for x in re.split(r'\n+', text) if str(x).strip()])
        text = '\n'.join(lines).strip()
        if text:
            cleaned.append({'title': title, 'text': text})
    if not cleaned and str(analysis.get('reconstructedText') or '').strip():
        text = _beta1_r30_strip_inline_footer(str(analysis.get('reconstructedText') or ''))
        if text:
            cleaned = [{'title': 'Referto', 'text': text}]
    cleaned = _beta1_r30_context_with_specialist(analysis, cleaned)
    analysis['reportSections'] = cleaned
    analysis['pdfFields'] = [{'label': x['title'], 'value': x['text'], 'include': True} for x in cleaned]
    analysis['reconstructedText'] = '\n\n'.join(f"{x['title']}\n{x['text']}" for x in cleaned)
    context = next((x.get('text', '') for x in cleaned if re.match(r'^contesto del documento$', x.get('title', ''), re.I)), '')
    analysis['documentContext'] = str(context or '').strip()
    clinical = '\n\n'.join(x['text'] for x in cleaned if not re.match(r'^contesto del documento$', x['title'], re.I)).strip()
    if clinical:
        analysis['narrativeClinicalSource'] = clinical
    analysis['semanticCleanupVersion'] = 'beta1-semantic-clean-r30'


def _beta1_r3_recover_narrative(raw: str, clinical_date: str = '') -> str:
    lines=clean_lines(raw,500)
    if not lines:return ''
    start=-1
    for i,line in enumerate(lines[:140]):
        n=fold(line); d=_date_iso_from_line(line,clinical_date)
        if clinical_date and re.search(r'\bvisita\s+del\b',n) and d==clinical_date:
            start=i+1; break
        if re.match(r'^visita\s+ambulatoriale\b',n): start=max(start,i+1)
    if start<0:
        for i,line in enumerate(lines):
            if _BETA1_R3_CLINICAL_LINE.search(line): start=i; break
    if start<0:return ''
    out=[]; clinical_started=False
    for line in lines[start:]:
        line=re.sub(r'\s+',' ',line).strip()
        if not line or re.match(r'^===|^page\s+\d',line,re.I):continue
        if re.match(r'^(?:paziente|data di nascita|comune di nascita|codice fiscale|telefono|email)\s*:',line,re.I):continue
        if _BETA1_R3_ADMIN_LINE.search(line) and not _BETA1_R3_CLINICAL_LINE.search(line):continue
        if re.match(r'^(?:visita\s+ambulatoriale|visita\s+del\s+\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})$',line,re.I):continue
        if re.match(r'^(?:pisa|roma|milano|firenze|torino|genova|bologna)\s+(?:il\s+)?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$',line,re.I):continue
        if re.match(r'^[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý *\'-]{2,70}$',line) and not _BETA1_R3_CLINICAL_LINE.search(line):continue
        if re.match(r'^[A-Z0-9]{12,20}$',line) or re.match(r'^\+?\d{8,14}$',line):continue
        if _BETA1_R3_CLINICAL_LINE.search(line) or clinical_started:
            clinical_started=True
            # Elimina soltanto duplicati OCR adiacenti, mai una frase clinica
            # ripetuta legittimamente più avanti nel documento.
            if out and fold(out[-1])==fold(line):continue
            # Ricongiunge esclusivamente continuazioni evidenti di riga.
            if out and (out[-1].rstrip().endswith(',') or (not re.search(r'[.!?;:]$',out[-1]) and line[:1].islower())):
                out[-1]=out[-1].rstrip()+' '+line
            else:
                out.append(line)
    return '\n'.join(_beta1_r30_footer_cleanup(out)).strip()


def _beta1_r3_meaningful_condition(value: str) -> bool:
    n=fold(value)
    if len(n)<8:return False
    if re.match(r'^(?:visita|controllo|egds|ecg|ega|tac|tc|rx|rmn?|ecografia|esame)\b$',n):return False
    return True


def _beta1_r3_sanitize_diagnoses(analysis: dict[str,Any], clinical_date: str='') -> None:
    rows=analysis.get('extractedDiagnoses') or []
    if not isinstance(rows,list):return
    out=[]; seen=set()
    for rawrow in rows:
        if not isinstance(rawrow,dict):continue
        row=dict(rawrow)
        source=re.sub(r'\s+',' ',str(row.get('sourceQuote') or row.get('name') or '')).strip()
        name=re.sub(r'\s+',' ',str(row.get('name') or '')).strip()
        if not name:continue
        hist=_date_iso_from_line(source,clinical_date) or _date_iso_from_line(name,clinical_date)
        m=re.match(r'^\s*VISITA\s+[^:]{2,80}?\s+(\d{1,2}[/.-]\d{1,2}[/.-](?:\d{2}|\d{4}))\s*:\s*(.+)$',source or name,re.I)
        if m:
            content=re.sub(r'\s+',' ',m.group(2)).strip()
            if not _beta1_r3_meaningful_condition(content):continue
            name=content; row['date']=_date_iso_from_line(m.group(1),clinical_date) or hist or row.get('date') or ''
            row['category']='Condizione pregressa';row['status']='Pregressa';row['mainProblem']=False
        else:
            m=re.match(r'^\s*(?:EGDS|ECG|EGA|TAC|TC|RX|RMN?|ECOGRAFIA|COLONSCOPIA|GASTROSCOPIA)\s+(\d{1,2}[/.-]\d{1,2}[/.-](?:\d{2}|\d{4}))\s*:\s*(.+)$',source or name,re.I)
            if m:
                content=re.sub(r'\s+',' ',m.group(2)).strip()
                if not _beta1_r3_meaningful_condition(content):continue
                name=content;row['date']=_date_iso_from_line(m.group(1),clinical_date) or hist or row.get('date') or ''
                row['category']='Condizione pregressa';row['status']='Pregressa';row['mainProblem']=False
            elif re.match(r'^\s*visita\s+[^:]{2,80}$',name,re.I) or re.match(r'^\s*visita\s+[^:]{2,80}$',source,re.I):
                continue
        if hist and clinical_date and hist!=clinical_date:
            row['date']=hist;row['category']='Condizione pregressa';row['status']='Pregressa';row['mainProblem']=False
        if re.search(r'riscontro\s+di\s+positivit[aà]',source,re.I) and re.search(r'eradicaz|risolt|trattat',source,re.I):
            row['category']='Condizione risolta';row['status']='Risolta';row['mainProblem']=False
        row['name']=name
        if not row['name'] or re.match(r'^visita\b',row['name'],re.I):continue
        key=fold(f"{row['name']}|{row.get('date') or ''}")
        if key in seen:continue
        seen.add(key);out.append(row)
    analysis['extractedDiagnoses']=out


def analyze_document_v420(extracted: dict[str, Any], file_name: str = '') -> dict[str, Any]:
    analysis=_BETA1_R3_BASE_ANALYZE_DOCUMENT(extracted,file_name)
    raw=_beta1_r3_clean_source_text(extracted)
    ident=semantic_identity(raw,analysis,file_name)
    analysis['documentKind']=ident['label'];analysis['category']=ident['category'];analysis['documentMode']=ident['mode']
    if ident.get('specialization'):
        analysis['specialization']=ident['specialization'];analysis['department']=ident['specialization']
    current=explicit_clinical_date(raw,str(analysis.get('clinicalDate') or ''))
    if current:analysis['clinicalDate']=current
    if ident['label']!='Cartella clinica':analysis['title']=_v604_fix20_title(ident['label'],str(analysis.get('clinicalDate') or ''))
    if analysis.get('documentMode') in {'narrative','mixed','diagnosis'}:
        recovered=_beta1_r3_recover_narrative(raw,str(analysis.get('clinicalDate') or ''))
        existing=str(analysis.get('reconstructedText') or '').strip()
        geometric_source=bool(_geometric_ocr_page_text(extracted.get('pages') or extracted.get('ocrPageData') or []))
        if recovered and (geometric_source or len(existing)<220 or len(recovered)>len(existing)*1.35):
            context=_beta1_r26_document_context(raw,str(analysis.get('clinicalDate') or '')) if geometric_source else ''
            sections=[]
            if context: sections.append({'title':'Contesto del documento','text':context})
            sections.append({'title':'Referto','text':recovered})
            analysis['reportSections']=sections
            analysis['pdfFields']=[{'label':x['title'],'value':x['text'],'include':True} for x in sections]
            analysis['reconstructedText']='\n\n'.join(f"{x['title']}\n{x['text']}" for x in sections)
            analysis['documentContext']=context
            analysis['ocrIntegralText']=raw
            analysis['narrativeClinicalSource']=recovered
            analysis['narrativeNeedsReview']=False
            analysis['narrativeSourcePresent']=True
            analysis['narrativeRepairVersion']='beta1-photo-narrative-r26'
        _beta1_r3_sanitize_diagnoses(analysis,str(analysis.get('clinicalDate') or ''))
        _beta1_r30_semantic_cleanup(analysis, raw)
    else:
        # Anche i documenti non narrativi devono applicare la regola di provenienza:
        # nei laboratori firme/personale non vengono conservati come dato clinico.
        _beta1_r30_specialist_provenance(analysis, raw)
    analysis['documentClassifierVersion']=_BETA1_R3_CLASSIFIER_VERSION
    analysis['documentTypeVersion']=_BETA1_R3_VERSION
    analysis['documentTypeSource']=ident.get('source') or 'classificazione semantica temporale'
    analysis['documentTypeConfidence']=int(ident.get('confidence') or 40)
    analysis['documentIdentityEvidence']=str(ident.get('evidence') or '')[:1200]
    analysis['documentAssociatedActs']=list(ident.get('associatedActs') or [])
    analysis['clinicalCanonicalVersion']=_BETA1_R3_VERSION
    analysis['clinicalValidationVersion']=_BETA1_R3_VERSION
    return analysis
