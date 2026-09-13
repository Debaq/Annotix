# Análisis del modo estudio

Lee los registros `.jsonl` que deja el modo estudio de Annotix y produce un CSV
con una fila por sesión. El esquema de eventos está en `docs/study-mode.md`.

```bash
pip install -r tools/study_analysis/requirements.txt
python3 tools/study_analysis/analyze.py ~/.local/share/annotix/study_logs/*.jsonl -o metrics.csv
```

Pruebas (no necesitan pandas: generan un `.jsonl` sintético y comprueban las
métricas y la cadena de hash):

```bash
python3 -m unittest discover -s tools/study_analysis
```

## Columnas

| columna | significado |
|---|---|
| `completed_cycle` | hubo un `export.end` con `ok` y `contract_valid` |
| `t_first_model_ms` | del `project.create` al primer `export.end` exitoso |
| `n_blocks` | inactividades de ≥ 5 min más aperturas de ayuda |
| `blocks_by_step` | esos bloqueos desglosados por `step_id` activo |
| `steps_sequence` | pasos únicos en orden de primera entrada |
| `n_config_changes`, `n_config_changes_nondefault` | cambios de configuración |
| `annot_median_ms` | mediana por `tool_id`/`origin` |
| `assist_correction_rate`, `assist_rejection_rate` | uso del asistente |
| `video_keyed_ratio`, `video_unreviewed_ratio` | del último `video.consolidate` |
| `train_total_ms`, `train_epoch_median_ms`, `train_mem_peak_mb` | entrenamiento |
| `infer_latency_p50_ms`, `infer_latency_p95_ms` | inferencia |
| `net_hosts`, `net_unclassified` | auditoría de red; `net_unclassified` debe ser 0 |
| `hash_chain_valid` | la cadena de hash del archivo cierra |
