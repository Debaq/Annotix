"""Pruebas del analizador, sobre un registro sintético.

El generador de abajo reproduce el formato del escritor de Rust (JSON canónico
con el campo `hash` añadido al final del texto), así que también sirve de
segunda implementación independiente del contrato descrito en
`docs/study-mode.md`.
"""

import json
import tempfile
import unittest
from pathlib import Path

import analyze


def canonical(value):
    """JSON compacto con las claves de cada objeto ordenadas."""
    if isinstance(value, dict):
        body = ",".join(
            f"{json.dumps(k, ensure_ascii=False)}:{canonical(v)}"
            for k, v in sorted(value.items())
        )
        return "{" + body + "}"
    if isinstance(value, list):
        return "[" + ",".join(canonical(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False)


class LogBuilder:
    """Escribe un `.jsonl` con la misma cadena de hash que el escritor real."""

    def __init__(self, session_id="p01", condition="A"):
        self.session_id = session_id
        self.condition = condition
        self.seq = 0
        self.prev_hash = ""
        self.lines = []

    def add(self, event, t_mono_ms, payload=None):
        obj = {
            "session_id": self.session_id,
            "condition": self.condition,
            "seq": self.seq,
            "t_mono_ms": t_mono_ms,
            "t_wall": "2026-01-01T00:00:00.000Z",
            "event": event,
            "app_version": "2.10.1+abc1234",
            "prev_hash": self.prev_hash,
            "payload": payload or {},
        }
        base = canonical(obj)
        digest = analyze.sha256(base)
        line = base[:-1] + analyze.HASH_KEY + digest + '"}'
        self.lines.append(line)
        self.prev_hash = analyze.sha256(line)
        self.seq += 1
        return self

    def write(self, path: Path) -> Path:
        path.write_text("\n".join(self.lines) + "\n", encoding="utf-8")
        return path


def full_session(builder: LogBuilder) -> LogBuilder:
    b = builder
    b.add("session.start", 0, {"os": "linux", "screen_w": 1920, "screen_h": 1080})
    b.add("project.create", 1_000, {"project_kind": "bbox", "modality": "image_bbox"})
    b.add("step.enter", 1_100, {"step_id": "annotate", "modality": "image_bbox"})
    b.add("tool.select", 1_200, {"tool_id": "bbox", "modality": "image_bbox"})
    b.add("annot.first", 1_300, {})
    for i, dur in enumerate((1_000, 3_000, 5_000)):
        b.add(
            "annot.commit",
            2_000 + i * 100,
            {
                "tool_id": "bbox",
                "modality": "image_bbox",
                "origin": "manual",
                "duration_ms": dur,
                "n_edits": i,
            },
        )
    b.add(
        "annot.commit",
        2_400,
        {
            "tool_id": "assist",
            "modality": "image_bbox",
            "origin": "assisted_accepted",
            "duration_ms": 500,
            "n_edits": 0,
        },
    )
    b.add(
        "annot.commit",
        2_500,
        {
            "tool_id": "assist",
            "modality": "image_bbox",
            "origin": "assisted_edited",
            "duration_ms": 900,
            "n_edits": 2,
        },
    )
    b.add(
        "annot.delete",
        2_600,
        {"tool_id": "assist", "modality": "image_bbox", "origin": "assisted_rejected"},
    )
    b.add("idle.start", 3_000, {})
    b.add("idle.end", 3_100, {"duration_ms": 400_000})
    b.add("help.open", 3_200, {"topic_id": "shortcuts"})
    b.add("config.change", 3_300, {
        "scope": "training", "key": "epochs", "from_type": "number", "to_type": "number",
        "is_default_before": True, "is_default_after": False, "from": 100, "to": 50,
    })
    b.add("config.change", 3_400, {
        "scope": "training", "key": "workers", "from_type": "number", "to_type": "number",
        "is_default_before": False, "is_default_after": True,
    })
    b.add("step.enter", 4_000, {"step_id": "train", "modality": "image_bbox"})
    b.add("train.start", 4_100, {
        "backend": "yolo", "mode": "local", "n_train": 8, "n_val": 2, "epochs_planned": 3,
    })
    for i, dur in enumerate((1_000, 2_000, 3_000)):
        b.add("train.epoch", 4_200 + i, {
            "epoch": i + 1, "duration_ms": dur, "mem_peak_mb": 1_000 + i,
        })
    b.add("train.end", 5_000, {
        "ok": True, "duration_ms": 6_000, "epochs_done": 3, "error_class": "none",
    })
    b.add("infer.run", 5_500, {
        "backend": "onnx", "model_hash": "ab" * 32, "n_items": 10,
        "latency_ms_p50": 30, "latency_ms_p95": 60,
    })
    b.add("video.consolidate", 5_600, {
        "n_tracks": 2, "n_frames_total": 100, "n_frames_keyed": 10,
        "n_frames_reviewed": 30, "n_frames_interpolated_unreviewed": 60,
    })
    b.add("net.request", 5_700, {
        "host": "api.github.com", "purpose": "update_check",
        "bytes_out": 0, "bytes_in": 1234, "ok": True,
    })
    b.add("step.enter", 6_000, {"step_id": "export", "modality": "image_bbox"})
    b.add("export.start", 6_100, {"format": "onnx"})
    b.add("export.end", 7_000, {"ok": True, "format": "onnx", "contract_valid": True})
    b.add("session.end", 8_000, {"reason": "user"})
    return b


class TestHashChain(unittest.TestCase):
    def test_cadena_valida(self):
        with tempfile.TemporaryDirectory() as d:
            path = full_session(LogBuilder()).write(Path(d) / "s.jsonl")
            events, valid = analyze.read_session(path)
            self.assertTrue(valid)
            self.assertEqual(events[0]["event"], "session.start")

    def test_edicion_rompe_la_cadena(self):
        with tempfile.TemporaryDirectory() as d:
            path = full_session(LogBuilder()).write(Path(d) / "s.jsonl")
            text = path.read_text(encoding="utf-8").replace('"n_edits":2', '"n_edits":9', 1)
            path.write_text(text, encoding="utf-8")
            _, valid = analyze.read_session(path)
            self.assertFalse(valid)

    def test_linea_borrada_rompe_la_cadena(self):
        with tempfile.TemporaryDirectory() as d:
            path = full_session(LogBuilder()).write(Path(d) / "s.jsonl")
            lines = path.read_text(encoding="utf-8").splitlines()
            del lines[5]
            path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            _, valid = analyze.read_session(path)
            self.assertFalse(valid)

    def test_cola_truncada_no_invalida_lo_anterior(self):
        with tempfile.TemporaryDirectory() as d:
            path = full_session(LogBuilder()).write(Path(d) / "s.jsonl")
            text = path.read_text(encoding="utf-8") + '{"session_id":"p0'
            path.write_text(text, encoding="utf-8")
            events, valid = analyze.read_session(path)
            self.assertTrue(valid)
            self.assertEqual(events[-1]["event"], "session.end")


class TestMetrics(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        path = full_session(LogBuilder()).write(Path(self._dir.name) / "p01_x.jsonl")
        self.row = analyze.session_metrics(path)

    def tearDown(self):
        self._dir.cleanup()

    def test_identidad_y_verificacion(self):
        self.assertEqual(self.row["session_id"], "p01")
        self.assertEqual(self.row["condition"], "A")
        self.assertTrue(self.row["hash_chain_valid"])

    def test_ciclo_completo(self):
        self.assertTrue(self.row["completed_cycle"])
        self.assertEqual(self.row["t_first_model_ms"], 6_000)

    def test_bloqueos(self):
        # Una inactividad de 400 s (≥ 300 s) más una apertura de ayuda.
        self.assertEqual(self.row["n_blocks"], 2)
        self.assertEqual(json.loads(self.row["blocks_by_step"]), {"annotate": 2})
        self.assertEqual(self.row["steps_sequence"], "annotate|train|export")

    def test_configuracion(self):
        self.assertEqual(self.row["n_config_changes"], 2)
        self.assertEqual(self.row["n_config_changes_nondefault"], 1)

    def test_anotacion(self):
        medians = json.loads(self.row["annot_median_ms"])
        self.assertEqual(medians["bbox/manual"], 3_000)
        self.assertEqual(medians["assist/assisted_accepted"], 500)
        # 1 aceptada + 1 editada + 1 rechazada
        self.assertAlmostEqual(self.row["assist_correction_rate"], 1 / 3)
        self.assertAlmostEqual(self.row["assist_rejection_rate"], 1 / 3)

    def test_video(self):
        self.assertAlmostEqual(self.row["video_keyed_ratio"], 0.10)
        self.assertAlmostEqual(self.row["video_unreviewed_ratio"], 0.60)

    def test_entrenamiento_e_inferencia(self):
        self.assertEqual(self.row["train_total_ms"], 6_000)
        self.assertEqual(self.row["train_epoch_median_ms"], 2_000)
        self.assertEqual(self.row["train_mem_peak_mb"], 1_002)
        self.assertEqual(self.row["infer_latency_p50_ms"], 30)
        self.assertEqual(self.row["infer_latency_p95_ms"], 60)

    def test_red_sin_trafico_sin_clasificar(self):
        self.assertEqual(self.row["net_unclassified"], 0)
        self.assertEqual(
            json.loads(self.row["net_hosts"]),
            {"api.github.com": ["update_check"]},
        )


if __name__ == "__main__":
    unittest.main()
