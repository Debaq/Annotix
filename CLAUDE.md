# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Annotix is a client-side web application for annotating images for machine learning training. It supports both bounding box and segmentation (mask) annotations with export to multiple formats (YOLO, COCO, U-Net masks, Pascal VOC, CSV) and a complete internationalization system supporting 10 languages.

**Key characteristics:**
- 100% client-side (no backend server)
- All data stored in IndexedDB
- Modular JavaScript architecture with manager classes
- Multi-language support via JSON translation files (10 languages)
- Multi-format export: YOLO Detection, YOLO Segmentation, COCO JSON, U-Net PNG Masks, Pascal VOC XML, CSV

Developed by FabLab TecMedHub, Universidad Austral de Chile - Sede Puerto Montt.

## Running the Application

This is a static web application that requires no build process:

```bash
# Simply open the HTML file in a modern browser
xdg-open index.html  # Linux
open index.html      # macOS
start index.html     # Windows

# Or use a local server
python -m http.server 8000
# Then navigate to http://localhost:8000
```

**Browser requirements:**
- Chrome/Edge 90+, Firefox 88+, Safari 14+, Opera 76+
- Must support: IndexedDB, Canvas API, Fetch API, File API, ES6+

## Architecture

### Core Manager Classes

The application follows a manager-based architecture where each manager handles a specific domain:

1. **Annotix** (`js/app.js`) - Main application controller (class: YOLOAnnotator)
   - Orchestrates all managers
   - Handles keyboard shortcuts (1-9 for classes, B/M/V/H for tools, Ctrl+S save, Ctrl+Z undo, arrows for navigation)
   - Manages application lifecycle and event coordination

2. **DatabaseManager** (`js/database-manager.js`) - IndexedDB operations
   - Two object stores: `projects` and `images`
   - Projects store configuration (name, type, classes)
   - Images store blobs with annotations and metadata
   - All operations are promisified

3. **ProjectManager** (`js/project-manager.js`) - Project lifecycle
   - Create/load/update/delete projects
   - Export complete projects (.tix)
   - Export/import configurations (.tixconfig) for team collaboration
   - Manages project metadata and class definitions

4. **CanvasManager** (`js/canvas-manager.js`) - Annotation canvas
   - Handles image rendering with devicePixelRatio for sharp display
   - Manages zoom (0.1-5x) and pan transformations
   - Maintains annotations array
   - Draws bounding boxes and masks
   - Integrates with ToolManager for drawing operations
   - Project type validation (bbox vs mask)

5. **ToolManager** (`js/tool-manager.js`) - Drawing tools
   - Four tools: bbox, mask, select, pan
   - Mask tool: separate canvas overlay with brush size control and erase mode
   - Tool-specific state management (brush size, erase mode)
   - Smooth mask drawing using line interpolation

6. **GalleryManager** (`js/gallery-manager.js`) - Image gallery
   - Grid display with thumbnails
   - Filters: all / annotated / unannotated
   - Image navigation (previous/next)
   - Loads images from IndexedDB for current project

7. **UIManager** (`js/ui-manager.js`) - UI components
   - Toast notifications system
   - Modal dialogs with customizable buttons
   - Consistent UI feedback across the app

8. **I18N** (`js/i18n.js`) - Internationalization
   - Loads translations from `locales/{lang}.json`
   - Updates DOM via `data-i18n`, `data-i18n-title`, `data-i18n-html` attributes
   - Saves language preference to localStorage
   - 10 supported languages: en, es, fr, zh, ja, de, pt, it, ru, ko

### Data Flow

```
User Action → YOLOAnnotator (app.js)
    ↓
Coordinates managers (ProjectManager, CanvasManager, etc.)
    ↓
DatabaseManager ↔ IndexedDB
    ↓
UI Updates (UIManager, DOM)
```

### Annotation Storage Format

**In IndexedDB (images store):**
```javascript
{
  id: Number,
  projectId: Number,
  name: String,
  image: Blob,
  annotations: [
    {
      type: 'bbox',
      class: Number,
      data: { x, y, width, height }  // pixels
    },
    {
      type: 'mask',
      class: Number,
      data: String  // Base64 PNG of mask canvas
    }
  ],
  width: Number,
  height: Number,
  timestamp: Number
}
```

**YOLO Export Format (.txt files):**
```
<class_id> <x_center> <y_center> <width> <height>
```
All coordinates normalized 0-1 relative to image dimensions.

## File Structure

```
annotix/
├── index.html              # Main HTML with inline scripts for UI state
├── js/
│   ├── app.js             # Main application controller
│   ├── database-manager.js # IndexedDB wrapper
│   ├── project-manager.js  # Project CRUD operations
│   ├── canvas-manager.js   # Canvas rendering and transforms
│   ├── tool-manager.js     # Drawing tools (bbox, mask, select, pan)
│   ├── gallery-manager.js  # Image gallery and navigation
│   ├── ui-manager.js       # Toast/modal UI components
│   └── i18n.js            # Internationalization system
├── css/
│   ├── variables.css      # CSS custom properties
│   ├── base.css          # Base styles and typography
│   ├── layout.css        # Layout structure (header, sidebar, main)
│   ├── components.css    # Reusable components (buttons, cards)
│   ├── canvas.css        # Canvas-specific styles
│   ├── modals.css        # Modal dialog styles
│   ├── gallery.css       # Gallery grid styles
│   ├── responsive.css    # Media queries
│   └── utilities.css     # Utility classes
├── locales/              # Translation JSON files
│   ├── en.json
│   ├── es.json (default)
│   └── ... (8 more languages)
└── back/                 # Archived/backup files
```

## Common Development Tasks

### Adding a New Language

1. Copy `locales/es.json` as template
2. Rename to `locales/{code}.json` (e.g., `ar.json`)
3. Translate all strings maintaining JSON structure
4. Add to `i18n.js` availableLanguages array:
```javascript
{ code: 'ar', name: 'العربية', flag: '🇸🇦' }
```

### Adding a New Class to a Project

Classes are managed dynamically. The flow is:
```javascript
// In app.js addClass()
canvasManager.classes.push({ id: newId, name, color })
projectManager.updateProject({ classes: canvasManager.classes })
```

Classes must have sequential IDs starting from 0 for proper YOLO export.

### Modifying Canvas Rendering

The CanvasManager uses devicePixelRatio scaling:
- Canvas memory size = display size × devicePixelRatio
- Context is scaled by DPR for sharp rendering
- All drawing coordinates must account for zoom/pan transforms
- Use `screenToCanvas()` helper to convert mouse coordinates

### Working with Masks

Mask annotations use a separate canvas:
- ToolManager maintains a temporary mask canvas during drawing
- On save, mask canvas is converted to Base64 PNG and stored in annotation.data
- Rendering: Base64 → Image → Draw with opacity overlay
- Erase mode uses `destination-out` composite operation

### Exporting Dataset

Export creates a ZIP with:
```
dataset.zip
├── images/          # Original images
├── labels/          # .txt files (one per image, YOLO format)
└── classes.txt      # Newline-separated class names
```

## Important Technical Details

### Canvas Coordinate System

Two coordinate systems are in use:
- **Screen coordinates**: Mouse events in CSS pixels
- **Canvas coordinates**: Image pixels accounting for zoom/pan

Transform: `canvasX = (screenX - panX) / zoom`

### IndexedDB Limitations

- Chrome/Edge: ~500MB-1GB per origin
- Safari: ~1GB limit
- Projects with many high-resolution images may hit limits
- Recommend periodic export and cleanup of old projects

### Project Types

Two mutually exclusive types:
- `bbox`: Only bounding box annotations allowed
- `mask`: Only segmentation mask annotations allowed

The UI dynamically shows/hides tool buttons based on project type. Validation in `CanvasManager.isToolValid()`.

### Keyboard Shortcuts

Handled in `app.js setupKeyboardShortcuts()`:
- Ignored when focus is in input/textarea elements
- Number keys (1-9) select classes by index
- Tool shortcuts work globally: B (bbox), M (mask), V (select), H (pan)

### Modal System

UIManager provides a flexible modal system:
```javascript
ui.showModal(title, contentHTML, [
  {
    text: 'Cancel',
    type: 'secondary',
    action: 'cancel',
    handler: (modal, close) => close()
  },
  {
    text: 'Save',
    type: 'primary',
    icon: 'fas fa-save',
    action: 'save',
    handler: async (modal, close) => { /* logic */ }
  }
])
```

Handlers receive modal DOM element and close function.

## External Dependencies

Loaded via CDN (see index.html):
- **Font Awesome 6.4.0**: Icons throughout UI
- **JSZip 3.10.1**: Dataset ZIP creation
- **intro.js 7.2.0**: Interactive tour system

All dependencies are loaded synchronously before custom scripts.

## Translation System Usage

In HTML:
```html
<!-- Text content -->
<span data-i18n="app.title">YOLO Annotator</span>

<!-- Placeholder -->
<input data-i18n="classes.placeholder" placeholder="Class name">

<!-- Title/tooltip -->
<button data-i18n-title="canvas.zoomIn" title="Zoom In">

<!-- HTML content (allows tags) -->
<div data-i18n-html="tour.welcome"></div>
```

In JavaScript:
```javascript
// Get translation
const text = window.i18n.t('app.title')

// With parameters
const msg = window.i18n.t('project.created', { name: 'My Project' })

// Update entire DOM
window.i18n.updateDOM()
```

## Notes for Future Development

- The app is stateless between sessions (relies entirely on IndexedDB)
- No undo/redo history beyond single undo (consider implementing proper history stack)
- Mask export to YOLO format is not yet implemented (only bounding boxes export properly)
- Consider implementing auto-save functionality
- Large images may cause performance issues; consider implementing tiling or downsampling
- Project deletion also deletes all associated images (no confirmation cascade warning)

## Workflow Instructions for Claude Code

**IMPORTANT: Follow these guidelines strictly when working on this project:**

1. **NO extensive summaries**: When completing tasks, provide only bullet points of what was changed. Do NOT write lengthy final summaries or explanations.

2. **NO documentation files**: Do NOT create or update:
   - README.md or similar documentation files
   - Markdown files with change logs or summaries
   - Information/documentation artifacts

3. **NO README updates**: Never update the README.md file unless explicitly requested by the user.

4. **NO server management**: Do NOT:
   - Launch local development servers (python -m http.server, etc.)
   - Check if the application is running
   - Verify the application with Node.js or any runtime
   - The user handles all server and runtime operations themselves

5. **Focus on code**: Your job is to modify code files, not to document or test the application end-to-end. Make the requested changes and report only the essential modifications in bullet-point format.
