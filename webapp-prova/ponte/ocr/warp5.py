"""warpPerspective di OpenCV 5.0 (INTER_CUBIC, BORDER_REPLICATE, immagini 8 bit),
riscritto in numpy per avere nel browser lo stesso risultato dell'exe.

Segue il percorso vettoriale AVX2 di modules/imgproc/src/warp_kernels.simd.hpp
(bicubicVec, v_float32 con FMA) e il calcolo delle coordinate di imgwarp.cpp (genericWarp).
"""
import numpy as np

F32 = np.float32


def _fma(a, b, c):
    # fma in float32 con un solo arrotondamento (come _mm256_fmadd_ps)
    a = np.asarray(a, np.float32).astype(np.float64)
    b = np.asarray(b, np.float32).astype(np.float64)
    c = np.asarray(c, np.float32).astype(np.float64)
    p = a * b                       # esatto: 24+24 bit
    s = p + c
    bb = s - p
    e = (p - (s - bb)) + (c - bb)   # TwoSum: s + e == p + c esattamente
    r = s.astype(np.float32)
    d = s - r.astype(np.float64)
    # caso di parita' esatta tra due float32: decide il resto e
    up = np.nextafter(r, np.float32(np.inf)); dn = np.nextafter(r, np.float32(-np.inf))
    half_up = (up.astype(np.float64) - r.astype(np.float64)) / 2
    half_dn = (r.astype(np.float64) - dn.astype(np.float64)) / 2
    tie = ((d > 0) & (d == half_up)) | ((d < 0) & (-d == half_dn))
    # con d==0 l'arrotondamento di s e' gia' giusto; con parita' scegliamo in base a e
    if np.any(tie):
        # s e' esattamente a meta' tra due float32: vince il lato indicato dal resto e
        alt = np.where(d > 0, up, dn)
        r = np.where(tie & (e != 0) & (np.sign(e) == np.sign(d)), alt, r)
    return r


def _invert3(m):
    m = [[float(m[i][j]) for j in range(3)] for i in range(3)]
    d = (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
         m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
         m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))
    if d == 0.:
        return [[0.] * 3 for _ in range(3)]
    d = 1. / d
    t = [(m[1][1] * m[2][2] - m[1][2] * m[2][1]) * d, (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * d,
         (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * d, (m[1][2] * m[2][0] - m[1][0] * m[2][2]) * d,
         (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * d, (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * d,
         (m[1][0] * m[2][1] - m[1][1] * m[2][0]) * d, (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * d,
         (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * d]
    return [t[0:3], t[3:6], t[6:9]]


def _pesi(alpha, A, usa_fma=True):
    one = F32(1)
    a2 = (alpha * alpha).astype(F32)
    b = (one - alpha).astype(F32)
    b2 = (b * b).astype(F32)
    w0 = (F32(A) * (alpha * b2).astype(F32)).astype(F32)
    w3 = (F32(A) * (a2 * b).astype(F32)).astype(F32)
    ap2 = F32(A + 2.0); ap3 = F32(-(A + 3.0))
    if usa_fma:
        w1 = _fma(a2, _fma(ap2, alpha, ap3), one)
    else:
        w1 = ((a2 * ((ap2 * alpha).astype(F32) + ap3).astype(F32)).astype(F32) + one).astype(F32)
    w2 = (((one - w0).astype(F32) - w1).astype(F32) - w3).astype(F32)
    return w0, w1, w2, w3


def warp_perspective_cubic_replicate(src, M, dsize, usa_fma=True):
    src = np.ascontiguousarray(src)
    if src.dtype != np.uint8:
        raise TypeError("solo immagini a 8 bit")
    if src.ndim == 2:
        src = src[:, :, None]; mono = True
    else:
        mono = False
    h, w, cn = src.shape
    dw, dh = int(dsize[0]), int(dsize[1])
    Mi = _invert3(np.asarray(M, dtype=np.float64))
    Mf = np.array(Mi, dtype=np.float64).astype(np.float32)
    # coordinate di partenza, come genericWarp (riga in float, colonna in double)
    ys = np.arange(dh, dtype=np.float32)[:, None]
    M_x = (ys * Mf[0, 1]).astype(F32) + Mf[0, 2]
    M_y = (ys * Mf[1, 1]).astype(F32) + Mf[1, 2]
    M_z = (ys * Mf[2, 1]).astype(F32) + Mf[2, 2]
    M_x = M_x.astype(F32); M_y = M_y.astype(F32); M_z = M_z.astype(F32)
    xf = np.arange(dw, dtype=np.float64)[None, :]
    invz = 1. / (M_z.astype(np.float64) + float(Mf[2, 0]) * xf)
    X = ((M_x.astype(np.float64) + float(Mf[0, 0]) * xf) * invz).astype(F32)
    Y = ((M_y.astype(np.float64) + float(Mf[1, 0]) * xf) * invz).astype(F32)
    bw, bh = max(w, 16), max(h, 16)
    vx = np.minimum(np.maximum(X, F32(-bw)), F32(bw * 2))
    vy = np.minimum(np.maximum(Y, F32(-bh)), F32(bh * 2))
    ix = np.floor(vx).astype(np.int64); iy = np.floor(vy).astype(np.int64)
    alpha = (vx - ix.astype(F32)).astype(F32); beta = (vy - iy.astype(F32)).astype(F32)
    ix -= 1; iy -= 1
    A = -0.75
    wx = _pesi(alpha, A, usa_fma); wy = _pesi(beta, A, usa_fma)
    xs = [np.clip(ix + k, 0, w - 1) for k in range(4)]
    acc = np.zeros((dh, dw, cn), dtype=F32)
    for r in range(4):
        yr = np.clip(iy + r, 0, h - 1)
        v = [src[yr, xs[k]].astype(F32) for k in range(4)]  # (dh,dw,cn)
        wxs = [x[..., None] for x in wx]
        if usa_fma:
            s = (v[0] * wxs[0]).astype(F32)
            s = _fma(v[1], wxs[1], s); s = _fma(v[2], wxs[2], s); s = _fma(v[3], wxs[3], s)
            acc = _fma(s, wy[r][..., None], acc)
        else:
            s = (v[0] * wxs[0]).astype(F32)
            for k in (1, 2, 3):
                s = ((v[k] * wxs[k]).astype(F32) + s).astype(F32)
            acc = ((s * wy[r][..., None]).astype(F32) + acc).astype(F32)
    out = np.clip(np.rint(acc), 0, 255).astype(np.uint8)  # rint: pari piu' vicino come cvtps2dq
    return out[:, :, 0] if mono else out
