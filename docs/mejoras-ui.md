# Mejoras UI pendientes

Ideas de mejora para la interfaz de Annotix, priorizadas por impacto.

## 1. Skeleton Screens

Reemplazar los spinners de carga por esqueletos animados que reflejen la estructura del contenido que se va a mostrar.

**Áreas clave:**
- Galería de imágenes: grid de rectángulos pulsantes
- Lista de proyectos: tarjetas placeholder
- Canvas de anotación: silueta del layout 3-columnas

**Beneficio:** Percepción de carga más rápida y menos "saltos" visuales.

## 2. Status Bar

Barra inferior persistente que muestre información contextual en tiempo real.

**Contenido sugerido:**
- Cantidad de imágenes / anotaciones del proyecto actual
- Estado de guardado (guardado / guardando... / sin guardar)
- Atajos de teclado del contexto actual
- Indicador de uso de almacenamiento

**Referencia:** Similar a la status bar de VS Code.

## 3. Tutorial / Onboarding

Flujo guiado para usuarios nuevos que explique las funcionalidades principales.

**Opciones de implementación:**
- Tour interactivo con tooltips resaltando elementos (e.g. Shepherd.js, React Joyride)
- Overlay con pasos numerados al crear el primer proyecto
- Tips contextuales que aparecen una sola vez por feature

**Pasos sugeridos del tour:**
1. Crear un proyecto
2. Subir imágenes
3. Definir clases
4. Crear una anotación
5. Exportar el dataset

## 4. Ilustraciones en Empty States

Reemplazar los iconos genéricos cuando no hay contenido por ilustraciones o gráficos SVG que guíen al usuario.

**Casos:**
- Sin proyectos: ilustración invitando a crear el primero
- Proyecto sin imágenes: ilustración de drag & drop
- Imagen sin anotaciones: ilustración de herramientas de dibujo
- Sin clases definidas: ilustración invitando a configurar clases

**Estilo:** Ilustraciones flat/line-art usando los colores `--annotix-primary` y `--annotix-secondary` para mantener consistencia.
