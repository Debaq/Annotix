# Auditoría — reproducibilidad

Revisión del 2026-09-10. Condiciones necesarias para repetir un experimento y sostener
afirmaciones estadísticas sobre sus resultados.

---

## B1. El barajado no produce permutaciones uniformes

**Dónde.** `dataset.rs:61-66`, repetido literalmente en `dataset.rs:376` y `dataset.rs:520`:

```rust
let seed = project.id.bytes().fold(42usize, |acc, b| acc.wrapping_mul(31).wrapping_add(b as usize));
for i in (1..indices.len()).rev() {
    let j = (seed.wrapping_mul(i).wrapping_add(7)) % (i + 1);
    indices.swap(i, j);
}
```

`j` es una función aritmética de `i` sin estado que avance, de modo que no es un Fisher-Yates
válido: falta la fuente de aleatoriedad que el algoritmo requiere en cada paso.

**Medición.** Replicando la aritmética exacta (incluido el desbordamiento a 64 bits) sobre 4 000
proyectos con identificadores distintos y n = 100, la posición final de un elemento dado se
distribuye con χ² = 2002 (99 grados de libertad, valor crítico al 5 % ≈ 124). Las posiciones bajas
y pares están sobrerrepresentadas: la posición 0 recibe el 5,9 % de los casos frente al 1 %
esperado.

**Efecto práctico medido.** Sobre un conjunto ordenado por clase (200 imágenes, las primeras 100
de clase A), la fracción de clase A en la partición de validación resultó 0,481 con desviación
0,069, frente a 0,503 y 0,072 de un barajado real. La tasa de particiones gravemente
desbalanceadas fue 0,2 % frente a 0,4 %. El sesgo se concentra en las primeras posiciones y la
validación se toma de la cola, así que **el balance de clases no queda comprometido**.

**Conclusión.** Es un defecto de calidad del generador, visible para quien lea el código, no una
invalidación de los resultados por desbalance.

**Corrección.** Usar un PRNG con estado sembrado explícitamente, por ejemplo `StdRng::seed_from_u64`
de la crate `rand` ya presente en las dependencias, con `SliceRandom::shuffle`.

---

## B2. La semilla no es configurable

La semilla se deriva del `project.id` y no se expone en ninguna parte de la configuración de
entrenamiento. Tampoco se pasa `seed` al script de entrenamiento: `grep seed` sobre
`training/scripts.rs` no devuelve resultados, de modo que ultralytics usa su valor por defecto.

**Qué impide.** Repetir un experimento con distintas semillas, validación cruzada en k pliegues, y
reportar media y desviación sobre varias corridas. Sin repeticiones no hay intervalos de confianza
que acompañen a las métricas.

**Corrección.** Exponer la semilla en la configuración del trabajo, usarla tanto para la partición
como para el script de entrenamiento, y registrarla en el trabajo.

---

## B3. La partición no es estable ante el crecimiento del conjunto

El barajado depende del total de elementos, así que cambia cuando se añaden o quitan imágenes.

**Medición.** Con la misma semilla y `val_split = 0,2`:

| Cambio | Validación antes | Después | Se mantienen |
|---|---|---|---|
| n = 100 → 101 | 20 imágenes | 21 | 20 (100 %) |
| n = 100 → 110 | 20 imágenes | 22 | 13 (65 %) |
| n = 500 → 501 | 100 imágenes | 101 | 100 (100 %) |

Añadir una imagen conserva la partición; añadir diez mueve el 35 % de la validación a
entrenamiento.

**Qué implica.** El flujo habitual —anotar más y reentrenar— rompe la comparabilidad entre
corridas del mismo proyecto: parte de lo que hoy es entrenamiento ayer fue validación.

**Corrección.** Persistir el manifiesto de la partición en el trabajo y reutilizarlo cuando se
quiera comparar, asignando las imágenes nuevas solo a entrenamiento salvo repartición explícita.

---

## B4. Las dependencias de Python no están fijadas

`python_env.rs:388` ejecuta `pip install <paquete>` sin especificador de versión; para los
paquetes de OpenMMLab usa `mim install` de la misma forma. No hay `requirements.txt` con versiones
exactas ni archivo de bloqueo.

**Qué implica.** La misma corrida repetida meses después usa otra versión de ultralytics y de
torch. Es el punto que revisa cualquier evaluación de reproducibilidad.

**Corrección.** Fijar las versiones por backend y registrar en el trabajo las que se resolvieron
efectivamente.

---

## B5. El trabajo no registra las condiciones de ejecución

`TrainingJobEntry` (`project_file.rs:314-345`) guarda `config`, `metrics`, `metrics_history`,
`logs`, rutas de resultado y modelo, y los campos de nube. No registra:

- versiones de ultralytics, torch, CUDA y demás paquetes;
- semilla utilizada;
- hardware (GPU, controlador);
- manifiesto de la partición: qué imágenes concretas fueron a entrenamiento, validación y prueba;
- huella del conjunto de datos que permita detectar que cambió entre corridas.

**Qué implica.** Una métrica registrada no se puede rastrear hasta los datos y el entorno que la
produjeron.

**Corrección.** Ampliar la entrada con esos campos y escribirlos al iniciar el trabajo.
