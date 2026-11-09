"""onnxruntime per la webapp del Dossier.

Ricalca, per le sole funzioni usate da RapidOCR, l'interfaccia di onnxruntime
dell'exe. Il calcolo dei modelli lo fa onnxruntime-web (WebAssembly) tramite
le funzioni JavaScript ortCrea / ortEsegui del ponte; nel browser sono asincrone
e vengono attese con JSPI (pyodide.ffi.run_sync).
"""
import enum

import numpy as np

__version__ = "web"


class GraphOptimizationLevel(enum.IntEnum):
    ORT_DISABLE_ALL = 0
    ORT_ENABLE_BASIC = 1
    ORT_ENABLE_EXTENDED = 2
    ORT_ENABLE_ALL = 99


class ExecutionMode(enum.IntEnum):
    ORT_SEQUENTIAL = 0
    ORT_PARALLEL = 1


class SessionOptions:
    def __init__(self):
        self.log_severity_level = 2
        self.enable_cpu_mem_arena = True
        self.graph_optimization_level = GraphOptimizationLevel.ORT_ENABLE_ALL
        self.intra_op_num_threads = 0
        self.inter_op_num_threads = 0
        self.execution_mode = ExecutionMode.ORT_SEQUENTIAL


def get_available_providers():
    return ["CPUExecutionProvider"]


def get_device():
    return "CPU"


def _attendi(valore):
    # nel browser le funzioni del ponte restituiscono una Promise
    if hasattr(valore, "then"):
        from pyodide.ffi import run_sync
        return run_sync(valore)
    return valore


def _ponte():
    import js
    return js


class _Nodo:
    def __init__(self, name):
        self.name = name

    def __repr__(self):
        return f"NodeArg(name={self.name!r})"


class _Meta:
    def __init__(self, mappa):
        self.custom_metadata_map = mappa


def _varint(b, i):
    v = s = 0
    while True:
        c = b[i]; i += 1
        v |= (c & 0x7F) << s; s += 7
        if c < 0x80:
            return v, i


def _campi(b):
    i, n = 0, len(b)
    while i < n:
        k, i = _varint(b, i)
        f, t = k >> 3, k & 7
        if t == 0:
            v, i = _varint(b, i)
        elif t == 1:
            v = b[i:i + 8]; i += 8
        elif t == 2:
            ln, i = _varint(b, i); v = b[i:i + ln]; i += ln
        elif t == 5:
            v = b[i:i + 4]; i += 4
        else:
            raise ValueError("protobuf non valido")
        yield f, v


def _metadati(modello):
    # ModelProto.metadata_props (campo 14): StringStringEntryProto key=1, value=2
    mappa = {}
    for f, v in _campi(memoryview(modello)):
        if f == 14:
            k = val = ""
            for f2, v2 in _campi(v):
                if f2 == 1:
                    k = bytes(v2).decode("utf-8")
                elif f2 == 2:
                    val = bytes(v2).decode("utf-8")
            mappa[k] = val
    return mappa


class InferenceSession:
    def __init__(self, path_or_bytes, sess_options=None, providers=None, **kwargs):
        if isinstance(path_or_bytes, (bytes, bytearray)):
            dati = bytes(path_or_bytes)
        else:
            with open(path_or_bytes, "rb") as fh:
                dati = fh.read()
            if not dati:
                # nella webapp i modelli si scaricano solo al primo uso
                dati = bytes(_attendi(_ponte().ortModello(str(path_or_bytes))).to_py())
                with open(path_or_bytes, "wb") as fh:
                    fh.write(dati)
        self._meta = _metadati(dati)
        from pyodide.ffi import to_js
        info = _attendi(_ponte().ortCrea(to_js(memoryview(dati))))
        self._id = int(info.id)
        self._inputs = [str(x) for x in info.inputNames]
        self._outputs = [str(x) for x in info.outputNames]

    def get_inputs(self):
        return [_Nodo(n) for n in self._inputs]

    def get_outputs(self):
        return [_Nodo(n) for n in self._outputs]

    def get_providers(self):
        return ["CPUExecutionProvider"]

    def get_modelmeta(self):
        return _Meta(dict(self._meta))

    def run(self, output_names, input_feed, run_options=None):
        from pyodide.ffi import to_js
        nomi, forme, dati = [], [], []
        for nome, arr in input_feed.items():
            a = np.ascontiguousarray(arr)
            if a.dtype != np.float32:
                raise TypeError(f"tipo di ingresso non gestito: {a.dtype}")
            nomi.append(nome)
            forme.append(list(a.shape))
            dati.append(to_js(memoryview(a.tobytes())))
        uscite = list(output_names) if output_names else list(self._outputs)
        ris = _attendi(_ponte().ortEsegui(self._id, to_js(nomi), to_js(forme), to_js(dati), to_js(uscite)))
        out = []
        for r in ris:
            forma = tuple(int(x) for x in r.dims)
            # una sola copia: le uscite del riconoscimento possono superare i 100 MB
            dati = r.data.to_bytes() if hasattr(r.data, "to_bytes") else bytes(r.data)
            out.append(np.frombuffer(dati, dtype=np.float32).reshape(forma))
        return out
