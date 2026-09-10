# Estado del proyecto — v2.9.10

Revisión realizada el 2026-09-10 sobre `main` (último commit de código: `1edf723`, 2026-06-23).

## Magnitud real

| Métrica | Valor | Nota |
|---|---|---|
| Líneas TypeScript / TSX | 45 882 | `find src -name '*.ts*' \| xargs wc -l` |
| Líneas Rust | 40 858 | `find src-tauri/src -name '*.rs' \| xargs wc -l` |
| Comandos Tauri registrados | 194 | el README decía 137 |
| Módulos de comandos | 24 | `src-tauri/src/commands/` |
| Espacios de nombres i18n | 47 × 10 idiomas | `public/locales/en/` |
| Pruebas unitarias Rust | 68 | `src-tauri/src/tests.rs` |
| Confirmaciones desde v2.4.4 | 63 | 20 versiones etiquetadas |

`tsc --noEmit` pasa limpio. No se pudo ejecutar `cargo check` en el entorno de revisión
(sin acceso a red para descargar las dependencias).

## Novedades desde v2.4.4 que faltaban en el README

- **SAM assist** — codificador/decodificador ONNX local, generación automática de máscaras (AMG),
  refinamiento por clics, modelos a nivel de aplicación. Pendiente solo la auto-descarga desde
  HuggingFace (PR8 del roadmap).
- **Audio** — dejó de estar «en progreso»: rutas propias, forma de onda, clasificación, ASR,
  eventos sonoros y grabación TTS con análisis de cobertura fonética. Exportación sí,
  importación no. Sin backends de entrenamiento.
- **Serve LAN** — publicado con autenticación por token bearer desde v2.9.3; ya no es
  «en desarrollo».
- **Inferencia** — proveedores de ejecución opcionales (TensorRT, CUDA, DirectML, CoreML),
  preprocesamiento SIMD, canalización paralela, arrastrar y soltar archivos de modelo.
- **Entrenamiento** — monitor con sugerencias, observaciones libres, informe PDF, reanudación,
  persistencia por proyecto.
- Importación de PDF a imágenes con pdfium nativo, WebP por proyecto, fusión de múltiples `.tix`,
  inspector de anotaciones con filtros de depuración/observación, paneles flotantes, registro en
  release con panel de diagnóstico, aviso de actualización con changelog dinámico.

## Datos erróneos corregidos en el README

| Dato | Decía | Es |
|---|---|---|
| Descarga Linux | AppImage | tarball `annotix-v<ver>-linux-x86_64.tar.gz` con `run.sh` + `libpdfium.so` |
| Descarga Windows | nombres v2.4.4 | NSIS + MSI con nombre versionado, FFmpeg incluido |
| Navegación entre muestras | `Left` / `Right` | `PageUp` / `PageDown` |
| Atajo SAM | tecla `S` | no existe; se activa desde la barra del lienzo |
| Formatos de exportación | 11 | 17 (se sumaron 2 de vista previa rasterizada y 4 de audio) |
| Gestor de paquetes | npm | pnpm (la CI migró) |
| Comandos Tauri | 137 | 194 |

También faltaban en la tabla de atajos: `V` (seleccionar), el bloque de audio (`F2` reproducir,
`F3`/`F4` repetir y rebobinar, flechas para desplazar, `Enter` cortar, `Tab` guardar y siguiente)
y el de grabación TTS (`Space` grabar, `Enter` aceptar, `R` repetir, `S` saltar).

## Estado por subsistema

Estable: anotación de imagen, SAM, video, audio, series temporales, tabular, inferencia ONNX,
exportación, importación, entrenamiento local y en la nube, automatización de navegador,
servidor de red local, colaboración P2P, inspector y filtros, atajos, i18n.

Incompleto: importación de audio (solo exportación), backends de entrenamiento para audio
(no implementados), auto-descarga de modelos SAM, módulos por proveedor del chat LLM.

Sin verificar: compilación en macOS (no hay CI para esa plataforma).
