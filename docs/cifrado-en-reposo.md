# Cifrado en reposo (etapa 12)

> Estado: **hecho**, con los huecos declarados al final.
> Commits `dfb3534` … `844e4dd`.

## Qué promete, y qué no

Lo que da: **los archivos del proyecto en disco no se leen sin la frase de
paso**. Ni el `project.json`, ni las imágenes, ni las miniaturas, ni las series,
ni el registro de auditoría.

Lo que no da, dicho en la propia pantalla y no sólo aquí:

- **No es cumplimiento normativo.** HIPAA y el RGPD piden además control de
  acceso, contratos de encargo de tratamiento, retención y notificación de
  brechas. Una aplicación de escritorio no puede garantizar eso por su cuenta.
- **No protege el proyecto abierto.** Con el proyecto abierto la clave está en
  memoria, que es la única forma de que el lienzo pinte algo.
- **No esconde los tamaños.** Cuántos archivos hay y cuánto ocupa cada uno se ve
  igual. Los nombres son UUID y no dicen nada; el tamaño sí es un canal lateral
  y se declara en vez de fingir que no está.

## Las dos claves

| | Qué es | Para qué |
|---|---|---|
| **Clave de proyecto** | 32 bytes aleatorios | Cifra los datos |
| **Clave de envoltura** | Argon2id (64 MiB × 3) sobre la frase | Guarda la anterior en una ranura del `vault.json` |

La indirección es lo que hace posibles las dos cosas que se pidieron:

1. **Cambiar la frase no toca el corpus**: se reescribe la envoltura.
2. **Varias personas sobre el mismo dataset**, cada una con su frase, como las
   ranuras de LUKS. La clave se exporta como secreto compartido y quien recibe
   el dataset monta la suya encima; los datos siguen cifrados en las dos
   máquinas con la misma clave.

El `vault.json` vive en claro en el directorio del proyecto: sales, parámetros
del derivador y la clave envuelta. Nada de eso es secreto. Los parámetros entran
como datos asociados de la envoltura, así que bajarle la memoria a Argon2id a
mano invalida la ranura en vez de abaratar el ataque.

## El formato de archivo

```text
ANXENC01 | sal (16 B) | bloque₀ | bloque₁ | … | bloqueₙ
```

- Bloques de 1 MiB autenticados por separado (XChaCha20-Poly1305): un video de
  dos gigas no cabe dos veces en memoria.
- El **último bloque lleva marca de final**. Sin ella, truncar el archivo sería
  indetectable —cada bloque seguiría validando— y el proyecto se abriría con
  medio video sin decir nada.
- **Una clave por archivo**, derivada con HKDF de la clave de proyecto usando la
  **ruta relativa** como `info` y la sal de la cabecera. Dos archivos iguales no
  dan el mismo cifrado, y un archivo movido de sitio deja de descifrar — que es
  lo que impide cambiar la imagen de un sujeto por la de otro.

**La consecuencia que hay que tener presente**: en cualquier escritura atómica
hay que cifrar contra la **ruta final**, no contra el `.tmp`. Para eso está
`store::io::cifrar_para_ruta`, y tiene su test.

## Cómo se decide si un archivo está cifrado

Por **su propia marca de cabecera**, no por una bandera guardada aparte. Tres
cosas salen de ahí:

1. Si el `project.json` está cifrado, la bandera que diría que hay que
   descifrarlo estaría dentro de él.
2. Un proyecto a medio convertir se lee igual de bien.
3. La conversión es **reanudable**: un corte de luz deja unos archivos cifrados
   y otros no, y volver a lanzarla termina lo que falte.

El `vault.json` se escribe **antes** de tocar el primer archivo. Al revés, un
corte dejaría archivos cifrados sin la clave envuelta: un proyecto perdido.

## El registro de auditoría

Se cifra **línea a línea**. Cifrarlo entero obligaría a leerlo, descifrarlo y
reescribirlo en cada evento, y a perder la propiedad que lo hace valer como
registro: que nadie reescribe lo ya escrito. La cadena de hashes se sigue
calculando sobre el texto en claro, así que el verificador no cambia de
criterio.

Una línea cifrada que no abre es indistinguible de una escritura que el proceso
no terminó: se declara como **cola truncada** en vez de descartarla callando. Es
lo que impide que borrar el final del registro pase inadvertido.

## Dónde entra y sale el ámbito cifrado

| Camino | Qué pasa |
|---|---|
| Lienzo, galería, pincel, SAM, ventaneo | Descifran al leer; la interfaz pide los bytes a Rust porque el webview lee el disco por su cuenta y sólo sacaría ruido |
| Servidor web (`/serve`) | Descifra al servir |
| **Dataset preparado (`training/`)** | **En claro, a propósito**: lo lee Python, que no sabe descifrar |
| Exportar (ZIP, carpetas, `.tix`, audio, series) | En claro: eso es exportar |
| P2P | Lo que llega del par entra cifrado si el proyecto local lo está |

Las dos primeras filas de abajo son salidas reales del ámbito cifrado y están
dichas en la pantalla donde se activa, no sólo aquí.

## Recordar la clave

Opcional y explícito. Por defecto la frase se pide en cada arranque; marcando
«recordar» la clave va al llavero del sistema y el proyecto se abre solo — más
cómodo y **protege menos**: quien tenga la sesión del usuario abierta entra sin
frase.

Se guarda la **clave**, no la frase: cambiar la frase dejaría el recuerdo
apuntando a nada, y una frase suele repetirse en varios sitios. Un Linux sin
servicio de secretos no impide abrir el proyecto: se avisa y se sigue pidiendo
la frase.

## Punto de no retorno

Una frase perdida es un proyecto perdido. No hay recuperación y no puede
haberla: una puerta trasera valdría igual para quien copie el disco. La única
copia de seguridad posible es **exportar la clave compartida** y guardarla, y
por eso esa función existe. Sacarla queda anotado en la auditoría
(`project_key.exported`).

## Lo que queda fuera

- **Los datasets preparados y los modelos** (`training/`) siguen en claro dentro
  del directorio del proyecto. Falta ofrecer borrarlos al cerrar el proyecto, o
  moverlos fuera.
- **El cegado por capas de la etapa 6.** Cifrar cada capa de lectura con una
  clave que sólo tenga quien adjudica sigue pendiente: hoy el cegado es de la
  aplicación.
- **La tabla de seudónimos aparte** (punto 3 de la etapa 12 en el roadmap): el
  `subjectId` sigue viajando con el proyecto.
- **Auditoría de accesos**, no sólo de cambios.
- **Rotar la clave de proyecto.** Se puede cambiar la frase y añadir o quitar
  ranuras, pero no volver a cifrar todo con una clave nueva — que es lo que hace
  falta cuando una clave compartida se filtra.
- **Probado en Linux.** El llavero en macOS y Windows usa los almacenes nativos
  del crate `keyring` y no se ha podido ejecutar aquí.

## Qué mirar al abrirlo en la app

- Ajustes del proyecto → «Cifrado en reposo»: activar con una frase, ver el
  avance, y comprobar con un visor del sistema que `images/*.png` ya no abre.
- Cerrar el proyecto: en la lista tiene que salir con su candado y **sin
  nombre**, salvo que se haya puesto etiqueta pública.
- Abrirlo con la frase y comprobar que la galería enseña las miniaturas y el
  lienzo pinta la imagen.
- Marcar «recordar» y reiniciar la app: el proyecto tiene que abrirse solo.
- «Mostrar la clave», y con ella importar el proyecto en otro equipo poniendo
  otra frase: las dos frases tienen que abrirlo.
- Entrenar con el proyecto cifrado: el dataset preparado sale legible en
  `training/job_*/` y el entrenamiento corre igual.
- Estado del corpus → «Registro de auditoría»: la cadena tiene que verificar
  con el proyecto abierto, y fallar con él cerrado.
- Quitar el cifrado y comprobar que el `project.json` vuelve a empezar por `{`.
