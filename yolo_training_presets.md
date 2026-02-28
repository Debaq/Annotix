# 🎛️ YOLO Training Presets — Guía de Configuración por Escenario

> Cada preset define TODOS los hiperparámetros relevantes con su valor recomendado
> y la justificación de por qué se elige ese valor para ese escenario específico.

---

## PRESET 1: Pocas Clases + Objetos Pequeños + Video Rápido

**Caso típico**: Detección en video en tiempo real (>100fps), ROI recortado,
1-5 clases, objetos ocupan una porción pequeña del frame, deploy client-side.

**Ejemplo real**: Tu caso — 4 clases, ROI ~267×200 de un video a 220fps,
deploy en Tauri+Rust con ONNX.

### Modelo y Dataset
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| model | yolo26n.pt | Nano es suficiente para 4 clases. Más grande no aporta y satura en client-side. Si nano no alcanza la precisión, subir a yolo26s.pt. |
| imgsz | 320 | Tu ROI es ~267×200. Con 320 cubres de sobra sin desperdiciar cómputo. 640 sería 4x más lento sin ganancia real. Si los objetos son muy pequeños dentro del ROI (ocupan <10% del área), considerar 416. |
| rect | True | Tu ROI no es cuadrado (4:3 aprox). Rect usa padding mínimo respetando el aspect ratio, más eficiente. |
| cache | ram | Con imgsz=320 y pocas imágenes, el dataset cabe fácil en RAM. Acelera entrenamiento enormemente al evitar lectura de disco repetida. |
| batch | -1 | Auto-máximo en GPU. Con imgsz=320 caben muchas imágenes por batch, lo que estabiliza los gradientes y mejora convergencia. |

### Entrenamiento
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| epochs | 250 | Con pocas clases cada epoch es rápido. 250 asegura convergencia completa. Early stopping te protege de sobreentrenamiento. |
| patience | 40 | Con 4 clases el modelo converge relativamente rápido. Si en 40 epochs no mejora, probablemente ya encontró su óptimo. No perder tiempo. |
| multi_scale | 0.15 | Ligera variación de tamaño entre batches (272-368px). Da robustez sin ser excesivo para un ROI que varía poco. |
| max_det | 20 | Con 4 clases y un ROI pequeño jamás habrá 300 objetos. 20 es generoso y alivia el postprocesado. Ajustar al número real máximo de objetos simultáneos + margen. |

### Optimizador
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| optimizer | auto | YOLO26 selecciona MuSGD automáticamente, su optimizador nativo que combina SGD con Muon. No hay razón para cambiarlo. |
| lr0 | 0.015 | Ligeramente más agresivo que el default 0.01. Con pocas clases y modelo nano, el paisaje de loss es más simple y tolera un LR más alto. Si hay inestabilidad en las primeras epochs, bajar a 0.01. |
| lrf | 0.001 | LR final muy bajo (lr_final = 0.015 × 0.001 = 0.000015). Las últimas epochs hacen ajustes ultra-finos. Con pocas clases esto ayuda a ganar las últimas décimas de mAP. |
| cos_lr | True | El scheduler coseno baja el LR suavemente: lento al principio, rápido al medio, suave al final. Mejor que lineal para convergencia fina con pocas clases. |
| warmup_epochs | 5.0 | Con LR más alto (0.015) conviene un warmup más largo para estabilizar. Los 5 primeros epochs suben gradualmente el LR desde casi cero. |
| momentum | 0.937 | Default, bien calibrado. No tocar. |
| weight_decay | 0.0005 | Default, correcto para modelo nano. No necesita ajuste. |

### Pesos del Loss
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| box | 10.0 | Subido desde 7.5. Con objetos pequeños la localización precisa es crítica — un error de pocos píxeles es proporcionalmente grande. Fuerza al modelo a ser más preciso con las coordenadas. |
| cls | 1.5 | Subido desde 0.5. Con solo 4 clases necesitas que el modelo las distinga bien. El default 0.5 está calibrado para COCO (80 clases) donde la clasificación es inherentemente más difícil y se balancea diferente. |
| dfl | 0.0 | YOLO26 eliminó Distribution Focal Loss. Este parámetro no debería tener efecto pero ponerlo a 0 explícitamente evita cualquier interferencia. |

### Augmentaciones
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| mosaic | 0.5 | Reducido desde 1.0. Mosaic combina 4 imágenes y reduce cada una a 1/4 del tamaño. Con objetos ya pequeños, esto puede hacerlos microscópicos y perjudicar el aprendizaje. 0.5 = se aplica al 50% de las imágenes. |
| close_mosaic | 25 | Subido desde 10. Desactiva mosaic las últimas 25 epochs. Da más tiempo al modelo para estabilizarse viendo imágenes reales (no mosaicos artificiales). Crucial para detección precisa. |
| mixup | 0.05 | Ligero mixup para regularización. Tus imágenes probablemente son visualmente consistentes (mismo tipo de escena), así que mucho mixup confunde más que ayuda. |
| scale | 0.2 | Reducido desde 0.5. Los objetos tienen tamaño bastante consistente (cámara y distancia fija). Mucha variación de escala introduce tamaños que nunca verá en producción. |
| translate | 0.15 | Ligeramente subido desde 0.1. El ROI puede tener pequeñas variaciones de posición, un poco más de traslación hace al modelo robusto a esto. |
| fliplr | 0.0 | Desactivado. Ajustar según tu dominio: si los objetos son simétricos o la dirección no importa, subir a 0.5. Si la lateralidad importa (ej: texto, dirección de movimiento), dejar en 0.0. |
| flipud | 0.0 | Desactivado. A menos que los objetos puedan aparecer invertidos, no tiene sentido voltear verticalmente. |
| hsv_h | 0.01 | Mínima variación de tono. Si tu escena tiene iluminación consistente, no necesitas mucha variación de color. Si varía (exterior, día/noche), subir a 0.015. |
| hsv_s | 0.3 | Reducido desde 0.7. Variación de saturación moderada. Suficiente para robustez sin distorsionar los colores que pueden ser clave para distinguir clases. |
| hsv_v | 0.2 | Reducido desde 0.4. Variación de brillo baja. Si la iluminación es controlada no necesitas más. Si varía, subir a 0.4. |
| erasing | 0.2 | Reducido desde 0.4. Random erasing simula oclusión, pero con objetos pequeños un borrado al 40% puede eliminar el objeto entero. 20% es más seguro. |
| degrees | 0.0 | Sin rotación. Los objetos en cámara fija mantienen orientación consistente. Activar solo si los objetos pueden rotar. |
| shear | 0.0 | Sin cizallamiento. No aporta para cámara fija con perspectiva consistente. |
| perspective | 0.0 | Sin transformación de perspectiva. La cámara es fija, la perspectiva no cambia. |

### Transfer Learning
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| pretrained | True | Siempre usar pesos preentrenados de COCO. El backbone ya sabe extraer features visuales generales. Entrenar desde cero requeriría muchísimas más imágenes. |
| freeze | (condicional) | Si tienes <1000 imágenes: freeze=8 (congela backbone). El backbone de COCO ya es bueno extrayendo features y con pocos datos puede "olvidarlos" si se entrena todo. Si tienes >5000 imágenes: no congelar (freeze=None), dejar que todo el modelo se adapte. |

### Exportación ONNX optimizada
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| format | onnx | Multiplataforma, compatible con ort en Rust. |
| imgsz | 320 | Debe coincidir con entrenamiento. |
| simplify | True | onnxslim limpia el grafo, más rápido en inferencia. |
| opset | 17 | Opset reciente, buena compatibilidad con ort 2.x. |
| dynamic | False | Tamaño fijo = el runtime puede optimizar mejor. Tu input siempre es el mismo tamaño. |
| batch | 1 | Client-side, un frame a la vez. |
| half | False | Exportar en FP32 y cuantizar a INT8 después da mejor resultado que FP16 directo. |

---

## PRESET 2: Inspección Industrial / Cámara Fija

**Caso típico**: Control de calidad en línea de producción, detección de defectos,
cámara fija con iluminación controlada, alta precisión requerida, velocidad moderada.

**Ejemplo real**: Detección de grietas, manchas, piezas faltantes en cinta transportadora.

### Modelo y Dataset
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| model | yolo26s.pt o yolo26m.pt | Inspección requiere alta precisión. Small o Medium dan mejor mAP que Nano. Si la velocidad es crítica, usar Small. |
| imgsz | 640 | Los defectos suelen ser pequeños relativo a la pieza. 640 da buena resolución para detectarlos. Si los defectos son muy sutiles, considerar 960 o incluso 1280. |
| rect | False | Las piezas suelen fotografiarse centradas y con aspect ratio consistente. Cuadrado está bien. |
| cache | ram | Datasets industriales suelen ser moderados (1000-10000 imágenes). Cachear en RAM. |
| batch | -1 | Auto-máximo. Con imgsz=640 el batch será menor pero aún beneficioso. |

### Entrenamiento
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| epochs | 300 | Inspección necesita máxima precisión. Más epochs permiten convergencia completa. El early stopping protege. |
| patience | 50 | Más paciencia que el default. En inspección a veces el modelo mejora lentamente en las últimas epochs al aprender defectos sutiles. |
| multi_scale | 0.0 | Desactivado. La distancia cámara-pieza es fija, el tamaño de los objetos no varía. Multi-scale introduciría variaciones irreales. |
| max_det | 50 | Los defectos en una pieza suelen ser limitados. 50 es generoso para la mayoría de casos industriales. |

### Optimizador
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| optimizer | auto | MuSGD nativo de YOLO26. |
| lr0 | 0.01 | Default conservador. En inspección la estabilidad de entrenamiento importa más que la velocidad de convergencia. |
| lrf | 0.001 | LR final muy bajo para pulir precisión al máximo en las últimas epochs. |
| cos_lr | True | Scheduler coseno para convergencia suave. |
| warmup_epochs | 3.0 | Default suficiente con lr0 conservador. |

### Pesos del Loss
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| box | 10.0 | Alta precisión de localización necesaria. Saber exactamente dónde está el defecto importa para el proceso de corrección. |
| cls | 2.0 | Si hay varios tipos de defectos (grieta, mancha, deformación), clasificarlos correctamente es clave para la acción correctiva. |
| dfl | 0.0 | YOLO26 no usa DFL. |

### Augmentaciones
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| mosaic | 0.3 | Muy reducido. Las piezas industriales se ven una a una, mosaic de 4 piezas no es realista. Un poco ayuda a regularización. |
| close_mosaic | 30 | Desactivar mosaic temprano para máxima estabilidad final. |
| mixup | 0.0 | Desactivado. Mezclar imágenes de piezas buenas con defectuosas confundiría al modelo sobre qué es un defecto. |
| scale | 0.1 | Mínima variación. La cámara está fija y la distancia no cambia. Solo para cubrir ligeras variaciones de tamaño de las piezas. |
| translate | 0.05 | Mínima traslación. Las piezas suelen estar bien posicionadas en la cinta. |
| fliplr | 0.0 | Desactivado generalmente. Los defectos en posiciones específicas (ej: esquina izquierda) perderían significado al voltear. Activar (0.5) solo si la pieza es totalmente simétrica. |
| flipud | 0.0 | Desactivado. Las piezas tienen orientación fija en la cinta. |
| hsv_h | 0.005 | Mínimo. Iluminación industrial es controlada y consistente. |
| hsv_s | 0.15 | Baja. Los colores de las piezas son consistentes. |
| hsv_v | 0.1 | Baja. Iluminación controlada = brillo estable. Subir ligeramente (0.2) si hay variación de material (mate vs brillo). |
| erasing | 0.1 | Muy bajo. Los defectos ya son pequeños, borrar parte de la imagen podría borrar el defecto y enseñar al modelo a ignorarlo. |
| degrees | 0.0 | Sin rotación. Las piezas tienen orientación fija. Activar (±5°) solo si hay ligera variación de colocación. |
| shear | 0.0 | Sin cizallamiento. |
| perspective | 0.0 | Sin perspectiva. Cámara fija cenital. |

### Transfer Learning
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| pretrained | True | Siempre. Los features de bajo nivel (bordes, texturas) de COCO son útiles para detectar defectos. |
| freeze | 10 | Congelar más capas que en otros casos. Los datasets industriales suelen ser pequeños y específicos. El backbone de COCO ya extrae bien bordes y texturas que son la base de la detección de defectos. Solo fine-tunear el head. |

---

## PRESET 3: Vehículos / Tráfico / Muchos Objetos

**Caso típico**: Conteo de vehículos, monitoreo de tráfico, detección de peatones,
cámaras de vigilancia urbana, muchos objetos simultáneos, variación de escala.

**Ejemplo real**: Cámara en intersección detectando coches, camiones, motos, peatones, bicicletas.

### Modelo y Dataset
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| model | yolo26s.pt o yolo26m.pt | Escenas de tráfico son complejas con muchos objetos solapados. Small para balance velocidad/precisión. Medium si la precisión es prioridad. |
| imgsz | 640 | Estándar para tráfico. Los vehículos lejanos necesitan resolución suficiente. Si la cámara está alta y los objetos son muy pequeños, considerar 960. |
| rect | False | Las cámaras de tráfico suelen ser 16:9 pero el modelo trabaja mejor con cuadrado para escenas densas. |
| cache | ram o disk | Datasets de tráfico pueden ser grandes (>50k imágenes). Si cabe en RAM, usar ram. Si no, disk o False. |
| batch | 16 o -1 | Con imgsz=640 el batch auto puede ser limitado según la GPU. 16 es un buen punto de partida. |

### Entrenamiento
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| epochs | 200 | Datasets de tráfico suelen ser grandes y variados. 200 epochs es suficiente para la mayoría. |
| patience | 60 | Paciencia moderada. Datasets grandes pueden tener mejoras lentas pero constantes. |
| multi_scale | 0.3 | Activo y significativo. Los vehículos varían mucho de tamaño (cerca=grande, lejos=pequeño). Multi-scale enseña al modelo a manejar esta variación. |
| max_det | 500 | Escenas de tráfico pueden tener muchos objetos. En una intersección concurrida fácilmente hay 50-100 objetos visibles. 500 da margen amplio. |

### Optimizador
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| optimizer | auto | MuSGD. |
| lr0 | 0.01 | Default. Datasets grandes y variados se benefician de un LR estándar que no sea ni muy agresivo ni muy conservador. |
| lrf | 0.01 | Default. LR final moderado. Con muchas clases y variabilidad, no necesitas un fine-tuning extremo. |
| cos_lr | True | Siempre beneficioso. |
| warmup_epochs | 3.0 | Default suficiente. |

### Pesos del Loss
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| box | 7.5 | Default. En tráfico importa tanto la localización como la clasificación de forma balanceada. |
| cls | 0.5 | Default. Con 5-10 clases de vehículos el balance estándar funciona bien. Las clases de tráfico son visualmente distintas (coche vs camión vs moto). |
| dfl | 0.0 | YOLO26. |

### Augmentaciones
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| mosaic | 1.0 | Máximo. Tráfico tiene muchos objetos y mosaic ayuda al modelo a ver densidades variadas. 4 imágenes combinadas simulan intersecciones muy concurridas. |
| close_mosaic | 15 | Moderado. Suficiente estabilización final. |
| mixup | 0.15 | Moderado. Ayuda a regularizar en datasets grandes y variados. |
| scale | 0.5 | Default alto. Los vehículos varían mucho de tamaño por perspectiva. El modelo necesita manejar coches lejanos pequeños y cercanos grandes. |
| translate | 0.2 | Los objetos aparecen en cualquier parte del frame. |
| fliplr | 0.5 | Activo. El tráfico es simétrico horizontalmente (un coche yendo a la izquierda es igual de válido que a la derecha). |
| flipud | 0.0 | Desactivado. Los coches no aparecen boca abajo. |
| hsv_h | 0.015 | Default. Variedad de colores de vehículos. |
| hsv_s | 0.7 | Default alto. Condiciones de luz variables (sol, sombra, lluvia) afectan la saturación. |
| hsv_v | 0.4 | Default. Variación de brillo por día/noche, sombras de edificios, túneles. |
| erasing | 0.4 | Default. Oclusión es muy común en tráfico (un coche detrás de otro). Erasing entrena al modelo a detectar objetos parcialmente visibles. |
| degrees | 0.0 | Sin rotación. Los vehículos mantienen orientación consistente (horizontal). |
| shear | 0.0 | Sin cizallamiento. |
| perspective | 0.0001 | Mínima perspectiva. Puede simular ligeras diferencias de ángulo de cámara entre instalaciones. |

### Transfer Learning
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| pretrained | True | COCO ya incluye coches, camiones, personas, etc. El transfer learning es extremadamente efectivo aquí. |
| freeze | None | Datasets de tráfico suelen ser grandes. No congelar nada, dejar que todo el modelo se adapte a tu distribución específica. |

---

## PRESET 4: Edge / Mobile (Máxima Velocidad)

**Caso típico**: Deploy en Raspberry Pi, Jetson Nano, teléfonos móviles, microcontroladores,
donde cada milisegundo cuenta y la memoria es limitada.

**Ejemplo real**: App de cámara en teléfono, sistema embebido en drone, dispositivo IoT.

### Modelo y Dataset
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| model | yolo26n.pt | Nano obligatorio. Cada parámetro extra cuesta ms en edge. Si nano no es suficiente, optimizar el dataset antes de subir a Small. |
| imgsz | 256 | El mínimo práctico. Reduce cómputo 6.25x vs 640. Aceptable para objetos que ocupan >5% del frame. Si los objetos son muy pequeños, subir a 320 máximo. |
| rect | True | Minimizar padding = menos cómputo innecesario. Cada píxel cuenta en edge. |
| cache | ram | Si el entrenamiento se hace en servidor, cachear todo en RAM para velocidad. |
| batch | -1 | Máximo durante entrenamiento. El deploy será batch=1 pero entrenar con batch grande da mejor modelo. |

### Entrenamiento
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| epochs | 300 | Con modelo nano e imgsz=256, cada epoch es muy rápido. Más epochs exprimen el máximo rendimiento de un modelo tan pequeño. |
| patience | 50 | Modelos nano son rápidos de entrenar, dar tiempo suficiente para convergencia. |
| multi_scale | 0.2 | Ligero. Robustez a ligeras variaciones de resolución de cámara sin exceso. |
| max_det | 10 | En edge normalmente buscas pocos objetos. Menos detecciones = postprocesado más rápido. Ajustar al caso real. |

### Optimizador
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| optimizer | auto | MuSGD. |
| lr0 | 0.02 | Más agresivo. Modelos nano con inputs pequeños tienen un paisaje de loss más simple. LR alto converge más rápido. |
| lrf | 0.001 | Bajo para fine-tuning final preciso. Cada décima de mAP importa cuando el modelo es tan pequeño. |
| cos_lr | True | Siempre. |
| warmup_epochs | 5.0 | Más largo con LR agresivo para estabilizar. |

### Pesos del Loss
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| box | 8.0 | Ligeramente subido. Con imgsz=256 la resolución es baja, ser más preciso en localización compensa. |
| cls | 1.0 | Ligeramente subido. Con pocas clases típicas de edge, reforzar clasificación. |
| dfl | 0.0 | YOLO26. |

### Augmentaciones
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| mosaic | 0.4 | Reducido. Con imgsz=256, mosaic reduce cada imagen a 128×128 que puede ser demasiado pequeño para aprender features útiles. |
| close_mosaic | 30 | Alto. Muchas epochs sin mosaic para estabilizar al máximo un modelo pequeño. |
| mixup | 0.0 | Desactivado. Modelos nano tienen poca capacidad, mixup puede confundir más que ayudar. |
| scale | 0.3 | Moderado. Algo de variación de escala es importante para robustez pero sin exceso. |
| translate | 0.1 | Default. |
| fliplr | 0.5 | Depende del dominio. Default si no hay restricción. |
| flipud | 0.0 | Default desactivado. |
| hsv_h | 0.015 | Default. |
| hsv_s | 0.5 | Moderado. |
| hsv_v | 0.3 | Moderado. |
| erasing | 0.15 | Bajo. Con imgsz=256 los objetos son pequeños en la imagen, erasing agresivo los elimina. |

### Exportación
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| format | onnx (o tflite, ncnn según target) | ONNX para hardware genérico. TFLite para Android. NCNN para ARM Linux. CoreML para iOS. |
| imgsz | 256 | Coincidir con entrenamiento. |
| dynamic | False | Estático siempre en edge. El runtime optimiza mejor con tamaño fijo. |
| simplify | True | Grafo limpio = menos operaciones = más rápido. |
| half | True | FP16 reduce el modelo a la mitad y la mayoría de GPUs móviles lo soportan bien. |
| int8 | True | Si el target es CPU puro (Raspberry Pi). INT8 da el máximo rendimiento en CPU. Requiere datos de calibración representativos. |

---

## PRESET 5: Médico / Alta Precisión

**Caso típico**: Detección de lesiones, tumores, células anómalas, instrumentos quirúrgicos.
Falsos negativos son inaceptables. Velocidad secundaria. Datasets pequeños y costosos de anotar.

**Ejemplo real**: Detección de nódulos en radiografías, segmentación de lesiones en dermoscopía.

### Modelo y Dataset
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| model | yolo26m.pt o yolo26l.pt | Precisión es prioridad. Medium o Large. Large solo si el dataset es suficientemente grande (>10k imágenes) para alimentar un modelo grande sin sobreajuste. |
| imgsz | 640 o 960 | Las imágenes médicas suelen tener alto detalle. 640 mínimo. 960 si las lesiones son sutiles o pequeñas. 1280 para microscopía. El cómputo extra vale la pena si salva diagnósticos. |
| rect | False | Cuadrado para consistencia. Las imágenes médicas suelen preprocesarse a proporciones estándar. |
| cache | ram | Datasets médicos suelen ser pequeños-medianos. Cachear todo. |
| batch | 8 o 16 | Con imgsz alto y modelo grande, el batch será limitado por VRAM. 8 es seguro con la mayoría de GPUs. |

### Entrenamiento
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| epochs | 500 | Máxima convergencia. Datasets pequeños y complejos necesitan muchas pasadas. Combinado con patience alto, el modelo tiene tiempo de aprender patrones sutiles. |
| patience | 80 | Alta paciencia. En imágenes médicas el modelo puede tener "mesetas" de aprendizaje largas seguidas de mejoras al aprender un nuevo tipo de lesión. No cortar prematuramente. |
| multi_scale | 0.0 | Desactivado. Las lesiones se ven a una escala consistente según el tipo de imagen (radiografía, dermoscopía). |
| max_det | 100 | Depende del caso. Pocas lesiones por imagen típicamente, pero algunas patologías pueden tener múltiples focos. |

### Optimizador
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| optimizer | auto | MuSGD. |
| lr0 | 0.005 | Conservador. Datasets pequeños + modelos grandes = riesgo de divergencia con LR alto. Ir lento y seguro. |
| lrf | 0.0005 | Muy bajo. Las últimas epochs hacen ajustes extremadamente finos que pueden ser la diferencia entre detectar o no una lesión sutil. |
| cos_lr | True | Esencial. La convergencia suave es crítica con datasets pequeños donde cada ejemplo cuenta. |
| warmup_epochs | 5.0 | Warmup largo con LR conservador. Evitar perturbaciones tempranas de los pesos preentrenados. |
| weight_decay | 0.001 | Subido desde 0.0005. Más regularización para prevenir sobreajuste en datasets pequeños. |

### Pesos del Loss
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| box | 10.0 | Alta precisión de localización. En medicina saber exactamente dónde está la lesión es crucial para el diagnóstico y tratamiento. |
| cls | 2.0 | Clasificación precisa (benigno vs maligno, tipo de lesión) puede ser cuestión de vida. Peso alto. |
| dfl | 0.0 | YOLO26. |

### Augmentaciones
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| mosaic | 0.3 | Bajo. Las imágenes médicas tienen contexto importante (anatomía circundante). Mosaic destruye ese contexto al mezclar 4 imágenes de diferentes pacientes/regiones. |
| close_mosaic | 40 | Muy alto. Máxima estabilización final. Las últimas 40 epochs ven solo imágenes reales. |
| mixup | 0.1 | Ligero. Algo de regularización ayuda con datasets pequeños, pero no demasiado para no confundir patologías. |
| scale | 0.3 | Moderado. Algo de variación para simular diferentes magnificaciones o distancias. |
| translate | 0.15 | Moderado. Las lesiones pueden aparecer en cualquier parte de la imagen. |
| fliplr | 0.5 | Activo generalmente. La anatomía suele ser simétrica (ej: pulmón izquierdo = pulmón derecho volteado). Desactivar si la lateralidad es diagnósticamente relevante. |
| flipud | 0.5 | Activo para imágenes que no tienen orientación inherente (dermoscopía, microscopía). Desactivar para radiografías donde arriba/abajo importa. |
| hsv_h | 0.01 | Mínimo. Los colores en imágenes médicas pueden tener significado diagnóstico. No distorsionar demasiado. |
| hsv_s | 0.3 | Moderado. Variación entre equipos/configuraciones de cámara. |
| hsv_v | 0.3 | Moderado. Variación de iluminación entre tomas. |
| erasing | 0.3 | Moderado. Simula oclusión parcial (pelo sobre lesión, artefactos). Útil pero no excesivo para no borrar la lesión misma. |
| degrees | 15.0 | Rotación moderada. Las lesiones pueden verse desde diferentes ángulos. 15° es suficiente para la mayoría de casos. |
| shear | 0.0 | Sin cizallamiento. Distorsiona la morfología que puede ser diagnósticamente relevante. |
| perspective | 0.0 | Sin perspectiva. Mismo razonamiento que shear. |

### Transfer Learning
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| pretrained | True | Crítico con datasets pequeños. Los features de bajo nivel (bordes, texturas, gradientes) transferidos de COCO son extremadamente útiles para detectar lesiones. |
| freeze | 12-15 | Congelar la mayoría del backbone. Los datasets médicos son pequeños y el dominio visual es muy diferente a COCO. Congelar el backbone preserva los features generales y solo fine-tunea el head y las últimas capas para adaptarse al dominio médico. Si el dataset es grande (>20k), reducir freeze a 8 o incluso no congelar. |

---

## PRESET 6: Aéreo / Satélite

**Caso típico**: Detección de objetos en imágenes de drones o satélite.
Objetos pequeños desde gran altura, pueden aparecer en cualquier orientación,
imágenes de alta resolución. Clases como vehículos, edificios, personas, barcos.

**Ejemplo real**: Conteo de coches en estacionamiento desde drone,
detección de barcos en puerto desde satélite, monitoreo agrícola.

### Modelo y Dataset
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| model | yolo26m.pt o yolo26l.pt | Objetos pequeños desde gran altura necesitan capacidad de extracción de features. Medium mínimo, Large preferible. |
| imgsz | 960 o 1280 | Las imágenes aéreas son de alta resolución y los objetos son diminutos. 640 pierde demasiado detalle. 1280 es ideal pero demanda mucha VRAM. Alternativa: tile la imagen grande en parches de 640 con overlap. |
| rect | False | Imágenes aéreas suelen ser cuadradas o se recortan a cuadrado. |
| cache | disk | Datasets aéreos con imgsz=1280 son enormes en RAM. Cachear en disco es el compromiso. |
| batch | 4-8 | Con imgsz=1280 y modelo Large, 4-8 es lo que cabe en la mayoría de GPUs. |

### Entrenamiento
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| epochs | 200 | Datasets aéreos suelen ser grandes (DOTA, VisDrone). 200 epochs es suficiente. |
| patience | 50 | Moderado. |
| multi_scale | 0.5 | Alto. Los drones vuelan a diferentes alturas, lo que cambia dramáticamente el tamaño aparente de los objetos. El modelo necesita manejar vehículos de 5px y de 50px. |
| max_det | 1000 | Imágenes aéreas pueden tener cientos de objetos (estacionamiento lleno, zona urbana). 1000 es necesario para no perder detecciones. |

### Optimizador
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| optimizer | auto | MuSGD. |
| lr0 | 0.01 | Default. Datasets grandes y variados. |
| lrf | 0.01 | Default. |
| cos_lr | True | Siempre. |
| warmup_epochs | 3.0 | Default. |

### Pesos del Loss
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| box | 12.0 | Muy alto. La localización precisa de objetos diminutos es el mayor desafío. Un error de 2 píxeles en un objeto de 10px es un 20% de error. |
| cls | 0.5 | Default. Las clases aéreas suelen ser visualmente distintas (coche vs edificio vs persona). |
| dfl | 0.0 | YOLO26. |

### Augmentaciones
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| mosaic | 1.0 | Máximo. Beneficia enormemente a detección aérea. Combina 4 parches con diferentes densidades de objetos, enseñando al modelo a manejar escenas variadas. |
| close_mosaic | 15 | Moderado. |
| mixup | 0.1 | Ligero. Algo de regularización. |
| scale | 0.5 | Alto. La altura de vuelo varía, el tamaño aparente de los objetos cambia mucho. |
| translate | 0.2 | Los objetos aparecen en cualquier parte del frame. |
| fliplr | 0.5 | Activo. Visto desde arriba un coche a la izquierda es igual que a la derecha. |
| flipud | 0.5 | Activo. Desde arriba no hay "arriba" ni "abajo". Un barco apuntando al norte es igual que al sur visto desde satélite. |
| hsv_h | 0.015 | Default. Variedad de colores de objetos. |
| hsv_s | 0.7 | Default alto. Condiciones atmosféricas (neblina, nubes) afectan saturación. |
| hsv_v | 0.4 | Default. Variación de iluminación por hora del día, sombras de nubes. |
| erasing | 0.4 | Default. Objetos parcialmente ocultos por árboles, sombras, otros objetos es muy común en aéreo. |
| degrees | 180.0 | Rotación completa. Desde arriba los objetos pueden tener cualquier orientación. Un coche puede apuntar a cualquier dirección. Esencial para aéreo. |
| shear | 5.0 | Ligero. Simula ligeras diferencias de ángulo de cámara y distorsión de lente. |
| perspective | 0.0005 | Ligero. Los drones pueden tener ligera inclinación que cambia la perspectiva. |

### Transfer Learning
| Parámetro | Valor | Justificación |
|-----------|-------|---------------|
| pretrained | True | Los features de bajo nivel de COCO transfieren bien a aéreo. Los bordes, texturas y formas básicas son universales. |
| freeze | None | Datasets aéreos suelen ser grandes. No congelar nada, el dominio visual es suficientemente diferente de COCO para beneficiarse de re-entrenar todo. |

---

## NOTAS GENERALES

### Prioridad de ajuste (de mayor a menor impacto)
1. **imgsz** — El parámetro con mayor impacto en velocidad Y precisión
2. **model** (n/s/m/l/x) — Define la capacidad del modelo
3. **Pesos del loss** (box, cls) — Ajusta QUÉ prioriza el modelo
4. **Augmentaciones clave** (mosaic, scale, flip) — Ajusta la variedad del entrenamiento
5. **Learning rate** (lr0, lrf, cos_lr) — Ajusta CÓMO aprende
6. **epochs/patience** — Ajusta CUÁNTO aprende
7. **Augmentaciones secundarias** (hsv, erasing, perspective) — Refinamiento fino

### Reglas generales
- Siempre usar pretrained=True salvo datasets enormes (>100k imágenes)
- Siempre usar cos_lr=True, no tiene desventajas prácticas
- Siempre usar amp=True salvo errores de NaN
- close_mosaic debe ser >0, la estabilización final es importante
- max_det debe reflejar tu caso real, no dejarlo en 300 por defecto
- Con YOLO26 poner dfl=0.0 siempre
- El parámetro freeze depende directamente del tamaño del dataset
