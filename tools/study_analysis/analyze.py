#!/usr/bin/env python3
"""Métricas del modo estudio de Annotix a partir de los registros `.jsonl`.

Lee uno o más archivos de sesión y produce un CSV con una fila por sesión.
El esquema de los eventos está en `docs/study-mode.md`.

Uso:
    python3 tools/study_analysis/analyze.py sesion.jsonl [...] -o metrics.csv
    python3 tools/study_analysis/analyze.py ~/.local/share/annotix/study_logs/*.jsonl
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

# Sufijo textual con el que el escritor cierra cada línea. Ver docs/study-mode.md.
HASH_KEY = ',"hash":"'

#: Un bloqueo es una inactividad de cinco minutos o más.
BLOCK_MS = 300_000


# ─── Lectura y verificación ─────────────────────────────────────────────────


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def split_line(line: str) -> tuple[str, str] | None:
    """Separa una línea en (texto sin el campo hash, hash declarado)."""
    idx = line.rfind(HASH_KEY)
    if idx < 0:
        return None
    base = line[:idx] + "}"
    rest = line[idx + len(HASH_KEY):]
    if not rest.endswith('"}'):
        return None
    return base, rest[:-2]


def read_session(path: Path) -> tuple[list[dict[str, Any]], bool]:
    """Devuelve (eventos, cadena_de_hash_valida)."""
    events: list[dict[str, Any]] = []
    valid = True
    prev_hash = ""
    expected_seq = 0
    last_mono = 0

    raw = path.read_text(encoding="utf-8")
    lines = raw.splitlines()
    ends_clean = raw.endswith("\n")

    for i, line in enumerate(lines):
        parts = split_line(line)
        if parts is None:
            # Cola truncada por un cierre abrupto: no invalida lo anterior.
            if i == len(lines) - 1 and not ends_clean:
                break
            valid = False
            continue
        base, declared = parts
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            if i == len(lines) - 1 and not ends_clean:
                break
            valid = False
            continue

        if sha256(base) != declared:
            valid = False
        if event.get("prev_hash", "") != prev_hash:
            valid = False
        if event.get("seq") != expected_seq:
            valid = False
        expected_seq = (event.get("seq") or 0) + 1
        mono = event.get("t_mono_ms", 0)
        if mono < last_mono:
            valid = False
        last_mono = mono

        prev_hash = sha256(line)
        events.append(event)

    return events, valid


# ─── Métricas ───────────────────────────────────────────────────────────────


def payload(event: dict[str, Any]) -> dict[str, Any]:
    return event.get("payload") or {}


def of_type(events: Iterable[dict[str, Any]], name: str) -> list[dict[str, Any]]:
    return [e for e in events if e.get("event") == name]


def median_or_none(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


def percentile(values: list[float], p: float) -> float | None:
    """Percentil por rango más cercano, el mismo criterio que el backend."""
    if not values:
        return None
    ordered = sorted(values)
    rank = math.ceil(p * len(ordered))
    return ordered[max(rank, 1) - 1]


def active_step_at(steps: list[tuple[int, str]], t_mono: int) -> str:
    """Paso activo en un instante, según los `step.enter` previos."""
    current = "none"
    for t, step_id in steps:
        if t > t_mono:
            break
        current = step_id
    return current


def session_metrics(path: Path) -> dict[str, Any]:
    events, hash_chain_valid = read_session(path)
    if not events:
        return {"file": path.name, "hash_chain_valid": hash_chain_valid, "n_events": 0}

    first = events[0]
    row: dict[str, Any] = {
        "file": path.name,
        "session_id": first.get("session_id", ""),
        "condition": first.get("condition", ""),
        "app_version": first.get("app_version", ""),
        "n_events": len(events),
        "hash_chain_valid": hash_chain_valid,
        "t_mono_ms_last": events[-1].get("t_mono_ms", 0),
    }

    # ─── Ciclo completo y tiempo al primer modelo ───────────────────────────
    exports_ok = [
        e
        for e in of_type(events, "export.end")
        if payload(e).get("ok") and payload(e).get("contract_valid")
    ]
    row["completed_cycle"] = bool(exports_ok)

    creates = of_type(events, "project.create")
    if exports_ok and creates:
        row["t_first_model_ms"] = exports_ok[0]["t_mono_ms"] - creates[0]["t_mono_ms"]
    else:
        row["t_first_model_ms"] = None

    # ─── Bloqueos ──────────────────────────────────────────────────────────
    steps = [(e["t_mono_ms"], payload(e).get("step_id", "none")) for e in of_type(events, "step.enter")]
    idle_blocks = [e for e in of_type(events, "idle.end") if payload(e).get("duration_ms", 0) >= BLOCK_MS]
    helps = of_type(events, "help.open")
    row["n_blocks"] = len(idle_blocks) + len(helps)

    by_step: dict[str, int] = defaultdict(int)
    for e in idle_blocks + helps:
        by_step[active_step_at(steps, e["t_mono_ms"])] += 1
    row["blocks_by_step"] = json.dumps(dict(by_step), sort_keys=True)

    seen: list[str] = []
    for _, step_id in steps:
        if step_id not in seen:
            seen.append(step_id)
    row["steps_sequence"] = "|".join(seen)

    # ─── Configuración ─────────────────────────────────────────────────────
    changes = of_type(events, "config.change")
    row["n_config_changes"] = len(changes)
    row["n_config_changes_nondefault"] = sum(
        1 for e in changes if payload(e).get("is_default_after") is False
    )

    # ─── Anotación ─────────────────────────────────────────────────────────
    commits = of_type(events, "annot.commit")
    durations: dict[tuple[str, str], list[float]] = defaultdict(list)
    for e in commits:
        p = payload(e)
        durations[(p.get("tool_id", "?"), p.get("origin", "?"))].append(p.get("duration_ms", 0))
    row["annot_median_ms"] = json.dumps(
        {f"{tool}/{origin}": median_or_none(v) for (tool, origin), v in sorted(durations.items())},
        sort_keys=True,
    )

    origins = [payload(e).get("origin") for e in commits]
    origins += [
        payload(e).get("origin")
        for e in of_type(events, "annot.delete")
        if payload(e).get("origin") == "assisted_rejected"
    ]
    assisted = [o for o in origins if o in {"assisted_accepted", "assisted_edited", "assisted_rejected"}]
    total_assisted = len(assisted)
    row["assist_correction_rate"] = (
        assisted.count("assisted_edited") / total_assisted if total_assisted else None
    )
    row["assist_rejection_rate"] = (
        assisted.count("assisted_rejected") / total_assisted if total_assisted else None
    )

    # ─── Video ─────────────────────────────────────────────────────────────
    consolidations = of_type(events, "video.consolidate")
    if consolidations:
        p = payload(consolidations[-1])
        total = p.get("n_frames_total", 0) or 0
        row["video_keyed_ratio"] = p.get("n_frames_keyed", 0) / total if total else None
        row["video_unreviewed_ratio"] = (
            p.get("n_frames_interpolated_unreviewed", 0) / total if total else None
        )
    else:
        row["video_keyed_ratio"] = None
        row["video_unreviewed_ratio"] = None

    # ─── Entrenamiento ─────────────────────────────────────────────────────
    epochs = of_type(events, "train.epoch")
    ends = of_type(events, "train.end")
    row["train_total_ms"] = sum(payload(e).get("duration_ms", 0) for e in ends) or None
    row["train_epoch_median_ms"] = median_or_none(
        [payload(e).get("duration_ms", 0) for e in epochs]
    )
    row["train_mem_peak_mb"] = max(
        (payload(e).get("mem_peak_mb", 0) for e in epochs), default=None
    )

    # ─── Inferencia ────────────────────────────────────────────────────────
    runs = of_type(events, "infer.run")
    row["infer_latency_p50_ms"] = median_or_none(
        [payload(e).get("latency_ms_p50", 0) for e in runs]
    )
    row["infer_latency_p95_ms"] = percentile(
        [payload(e).get("latency_ms_p95", 0) for e in runs], 0.95
    )

    # ─── Red ───────────────────────────────────────────────────────────────
    hosts: dict[str, set[str]] = defaultdict(set)
    unclassified = 0
    for e in of_type(events, "net.request"):
        p = payload(e)
        purpose = p.get("purpose", "other")
        hosts[p.get("host", "unknown")].add(purpose)
        if purpose == "other":
            unclassified += 1
    row["net_hosts"] = json.dumps(
        {h: sorted(v) for h, v in sorted(hosts.items())}, sort_keys=True
    )
    row["net_unclassified"] = unclassified

    return row


# ─── CLI ────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path, help="archivos .jsonl de sesión")
    parser.add_argument("-o", "--output", type=Path, default=Path("study_metrics.csv"))
    args = parser.parse_args(argv)

    # pandas se importa aquí y no arriba para que las pruebas de las métricas
    # corran sin depender de él.
    import pandas as pd

    rows = [session_metrics(f) for f in args.files]
    frame = pd.DataFrame(rows)
    frame.to_csv(args.output, index=False)

    bad = frame[~frame["hash_chain_valid"]]
    if not bad.empty:
        print(
            f"AVISO: {len(bad)} archivo(s) con la cadena de hash rota:",
            ", ".join(bad["file"]),
            file=sys.stderr,
        )
    unclassified = frame.get("net_unclassified")
    if unclassified is not None and unclassified.fillna(0).sum() > 0:
        print("AVISO: hay tráfico de red sin clasificar (purpose=other)", file=sys.stderr)

    print(f"{len(rows)} sesión(es) → {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
