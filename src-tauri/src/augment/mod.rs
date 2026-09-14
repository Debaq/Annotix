//! Augmentación fuera de línea: se materializa al preparar el dataset, no dentro
//! del bucle de entrenamiento.
//!
//! ## Por qué fuera de línea
//!
//! Hoy cada backend augmenta con su librería —o no augmenta—, y eso tiene una
//! consecuencia que no es de comodidad: los presets biomédicos de la etapa 11
//! **sólo se cumplen en YOLO y RT-DETR**. `bio_unet_seg` declara `fliplr: 0`
//! porque la lateralidad es diagnóstica, y el generador de `smp` lleva un
//! `HorizontalFlip(p=0.5)` fijo en el script: la app avisa de la lateralidad y
//! hace lo contrario de lo que dice.
//!
//! Materializar la augmentación al preparar el dataset arregla eso en los
//! diecisiete backends a la vez, sin reescribir diecisiete generadores. Y trae
//! dos cosas que la augmentación en línea no puede dar: es **determinista** —el
//! contrato de modelo puede declarar exactamente qué se aplicó— y es
//! **auditable**, porque las imágenes generadas se pueden abrir y mirar.
//!
//! Lo que se pierde es la variación por época; se compensa con el factor de
//! multiplicación y se dice en la UI.
//!
//! Plan completo en `docs/plan-augmentacion.md`.

// El subsistema se construye por piezas (`docs/plan-augmentacion.md` §Orden de
// trabajo) y hasta que `plan` lo enganche en `training/dataset.rs` nada de esto
// tiene todavía quien lo llame fuera de sus tests. El permiso se retira en ese
// paso, no antes: sin él, el aviso útil —una función que quedó huérfana— se
// pierde entre veinte que sólo dicen "aún no toca".
#![allow(dead_code)]

pub mod geometry;
