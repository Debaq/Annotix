# Ingesta de imagen médica: DICOM y NIfTI

Entrega de la etapa 9a del plan biomédico. Desbloquea CT, MRI y rayos X, que hasta
ahora sólo entraban si alguien los había exportado antes a PNG — y al exportarlos
perdía el rango dinámico, el espaciado de píxel y los parámetros de adquisición,
que son justo lo que permite decir para qué equipos vale un modelo.

---

## Lo primero: qué se quita al importar

Un DICOM trae el nombre del paciente, su fecha de nacimiento, su identificador del
hospital, la institución, el médico que lo pidió y el número de acceso. Nada de
eso hace falta para entrenar, y todo eso sale del hospital en cuanto alguien copia
la carpeta del proyecto.

Al importar se eliminan los identificadores directos, se descartan **todas** las
etiquetas privadas del fabricante, y el `PatientID` se convierte en un seudónimo.
Al terminar aparece un informe con tres listas: **qué se quitó**, **qué se
conservó** y **qué esto no cubre**. Ese diálogo no se puede silenciar.

### El seudónimo del sujeto

`SUJ-` más doce caracteres de un SHA-256 de `(id del proyecto, PatientID)`.

- El mismo paciente da **el mismo** seudónimo dentro del proyecto: hace falta para
  que el reparto agrupe sus muestras y no lo parta entre particiones.
- Y **otro distinto** en otro proyecto, porque el id del proyecto entra en la
  cuenta: dos corpus compartidos por separado no se pueden cruzar por el
  seudónimo.
- Es un hash con sal, **no se puede deshacer**. Quien necesite volver al
  identificador real tiene que guardarse su propia tabla, y esa es una decisión
  del estudio, no de la app.

### Qué NO cubre

Va en el informe de cada importación, no sólo aquí:

- **No se inspeccionan los píxeles.** Si la imagen lleva el nombre quemado —
  frecuente en ecografía y en capturas de pantalla—, sigue ahí.
- **Los UID se eliminan en vez de reescribirse** con un mapa consistente: dos
  archivos de la misma serie dejan de saber que lo son.
- **Las etiquetas privadas se descartan en bloque.** Es lo seguro y lo tosco:
  puede llevarse metadatos de adquisición útiles.
- **No es una implementación certificada del perfil PS3.15.** Antes de confiarle un
  corpus clínico, hay que verificar el resultado con una herramienta externa.

### El original no se guarda

Es una decisión, no un descuido: el DICOM lleva dentro los identificadores que se
acaban de quitar, y conservarlo junto al corpus deidentificado los devolvería al
disco. Lo que se guarda es la imagen renderizada, los metadatos limpios y una
copia de 16 bits ya deidentificada.

---

## Ventaneo

Un CT guarda unidades Hounsfield entre −1024 y 3071; una pantalla muestra 256
grises. Aplastar todo el rango a 8 bits deja una imagen gris uniforme: el pulmón y
el hueso caben en el mismo gris. El **ventaneo** elige qué tramo se reparte los
256 grises.

- Si el archivo trae `WindowCenter`/`WindowWidth`, **manda esa**: es la que el
  equipo consideró adecuada para esa adquisición.
- Si no, se calcula de la propia imagen recortando el 1 % de cada extremo. Sin ese
  recorte, un marcador metálico se lleva todo el rango y el resto queda plano.

Se puede volver a ventanear después, con presets (pulmón, mediastino, hueso,
cerebro, hígado, angio) o a mano. Funciona porque junto a la imagen se guarda una
**copia de 16 bits**: un PNG de 16 bits no admite negativos, así que se guarda
desplazado y se anotan la pendiente y el intercepto para volver a las unidades
físicas.

**Cambiar la ventana cambia la imagen que se anota**, no sólo cómo se ve. Una
marca puesta con ventana de pulmón puede no tener sentido con ventana de hueso, y
por eso se avisa en la propia UI en vez de ofrecerlo como un deslizador de brillo.

### Un error que estuvo a punto de colarse

`dicom-rs` ya aplica el LUT de modalidad al convertir a vector: los valores llegan
en unidades Hounsfield. Aplicarlo otra vez desplazaba cada CT 1024 HU —el pulmón
salía en el rango del hueso y la ventana de pulmón mostraba negro—. Hay un test
que lo fija (`el_rescalado_del_archivo_se_aplica_una_sola_vez`).

---

## NIfTI: cortes, no volúmenes

La unidad de anotación de Annotix es la imagen 2D. Un NIfTI es un volumen, así que
se **extraen cortes** por el eje que se elija (axial, coronal o sagital) y cada
uno entra como una imagen más, con su índice y su eje anotados.

Es una simplificación con consecuencias: anotar corte a corte no es lo mismo que
anotar un volumen, y una máscara hecha así no tiene continuidad garantizada entre
cortes. Para entrenar modelos 2D corte a corte —que es la mayoría— es exactamente
lo que hace falta. Lo demás es la etapa 9c, la más cara del roadmap.

**Los cortes sin señal no entran.** Los del principio y el final de un volumen
suelen ser aire: entrarían como imágenes negras que el entrenamiento cuenta como
fondo puro y que nadie va a anotar. Se dice cuántos se descartaron.

La ventana se calcula **sobre el volumen entero**, no corte a corte: si cada corte
tuviera la suya, el mismo tejido saldría con grises distintos según el corte y las
anotaciones dejarían de ser comparables.

---

## Qué queda fuera

- **Series DICOM multi-frame**: se lee el primer fotograma. Importar una serie
  entera como secuencia es trabajo aparte.
- **Deidentificación de píxeles quemados**: haría falta OCR sobre la imagen.
- **Reescritura consistente de UID**: hoy se eliminan.
- **Volumetría 3D** (etapa 9c): el eje Z en el esquema, la propagación entre
  cortes y las métricas volumétricas.
- **Los metadatos médicos no viajan por P2P**: el par recibe el PNG renderizado,
  no la copia de 16 bits, así que no podría volver a ventanear.

## Qué validar con datos reales

Lo que los tests no pueden cubrir, porque usan DICOM sintéticos:

- Series de **al menos dos fabricantes distintos**: que se lean sin pérdida.
- Que el ventaneo reproduzca lo que muestra un visor clínico de referencia sobre
  el mismo archivo.
- Que la deidentificación no deje ningún identificador — **verificado con una
  herramienta externa**, no con la propia.
