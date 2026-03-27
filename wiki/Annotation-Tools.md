# Annotation Tools

Annotix provides 7 annotation tools plus pan and zoom, built on a high-performance [Konva](https://konvajs.org/) 2D canvas. Each tool has a dedicated handler class in `src/features/canvas/handlers/` that implements the same interface: `onMouseDown`, `onMouseMove`, `onMouseUp`.

## Tool Availability by Project Type

Not all tools are available in every project type. The canvas adapts based on the project:

| Project Type | Available Tools |
|--------------|-----------------|
| `bbox` | Pan, BBox |
| `obb` | Pan, OBB |
| `polygon` | Pan, Polygon |
| `mask` | Pan, Mask |
| `instance-segmentation` | Pan, Mask, Polygon |
| `keypoints` | Pan, Keypoints |
| `landmarks` | Pan, Landmarks |
| `classification` | Pan only (no drawing) |
| `multi-label-classification` | Pan only (no drawing) |

---

## BBox Tool

**Shortcut:** `B` | **Data type:** `bbox` | **Interaction:** Click and drag

The bounding box tool draws axis-aligned rectangular boxes for object detection tasks.

### How to Use
1. Press `B` or select the BBox tool from the toolbar.
2. Click and drag on the image to draw a rectangle.
3. Release the mouse to finalize the annotation.

### Data Structure
```json
{
  "x": 100,       // top-left X (pixels)
  "y": 50,        // top-left Y (pixels)
  "width": 200,   // width (pixels)
  "height": 150   // height (pixels)
}
```

### Details
- Supports dragging in any direction (normalizes automatically).
- **Minimum size:** 5x5 pixels (smaller boxes are discarded to prevent accidental clicks).
- Shows a live preview rectangle while drawing.
- After creation, BBoxes can be moved (drag) and resized (grab edges/corners) via the Select tool.

---

## OBB Tool (Oriented Bounding Box)

**Shortcut:** `O` | **Data type:** `obb` | **Interaction:** Click and drag + rotate

The OBB tool draws rotatable bounding boxes for oriented object detection (e.g. aerial imagery, text detection).

### How to Use
1. Press `O` or select the OBB tool.
2. Click and drag to create an initial rectangle.
3. After creation, select the OBB and use the rotation handle on the Konva Transformer to rotate it.

### Data Structure
```json
{
  "x": 200,         // center X (pixels)
  "y": 150,         // center Y (pixels)
  "width": 180,     // width (pixels)
  "height": 90,     // height (pixels)
  "rotation": 35.5  // degrees (0-360)
}
```

### Details
- Unlike BBox, OBB stores **center coordinates** instead of top-left.
- Rotation is normalized to the 0-360 range.
- Same 5x5 pixel minimum size threshold.
- Supports full 360-degree rotation via the Transformer widget.

---

## Polygon Tool

**Shortcut:** `P` | **Data type:** `polygon` | **Interaction:** Click to add vertices

The polygon tool creates closed polygon shapes for semantic segmentation.

### How to Use
1. Press `P` or select the Polygon tool.
2. Click to place each vertex. Lines connect them automatically.
3. Press **Enter** to close and finalize the polygon.
4. Press **Escape** to cancel.

### Data Structure
```json
{
  "points": [
    { "x": 100, "y": 50 },
    { "x": 250, "y": 50 },
    { "x": 250, "y": 200 },
    { "x": 100, "y": 200 }
  ]
}
```

### Details
- Requires a **minimum of 3 vertices** to be saved.
- Auto-closes the shape (connects last point to first) on Enter.
- Once placed, vertices cannot be individually moved. Cancel and redraw if needed.
- After creation, the entire polygon can be dragged as a group.

---

## Mask Tool

**Shortcut:** `M` | **Data type:** `mask` | **Interaction:** Click and drag (paint)

The mask tool provides freehand brush painting for pixel-level segmentation.

### How to Use
1. Press `M` or select the Mask tool.
2. Click and drag to paint on the image.
3. Toggle **eraser mode** with `E` to remove painted areas.
4. Adjust brush size with `[` (decrease) and `]` (increase), or `Ctrl + Mouse Wheel`.
5. The mask auto-saves 1 second after the last brush stroke.

### Data Structure
```json
{
  "base64png": "iVBORw0KGgo..."  // base64-encoded PNG of the mask
}
```

### Details
- **Brush size:** 5 to 100 pixels (default 15).
- **Eraser mode** uses `destination-out` composite operation to erase pixels.
- Paint mode uses `source-over` to add pixels.
- Brush style: round cap, round join for smooth strokes.
- Uses an **offscreen HTMLCanvasElement** for drawing, then converts to `ImageBitmap` for efficient rendering on the Konva canvas.
- Rendered at 60% opacity.
- **One mask per class per image.** Painting with the same class replaces the previous mask.
- Can load and continue editing an existing mask.
- **Ctrl + Mouse Wheel** adjusts brush size (scroll up = bigger, scroll down = smaller). Normal zoom is disabled while Ctrl is held in mask projects.

---

## Keypoints Tool

**Shortcut:** `K` | **Data type:** `keypoints` | **Interaction:** Click to place, drag to adjust

The keypoints tool places named points with skeleton connections for pose estimation tasks.

### How to Use
1. Press `K` or select the Keypoints tool.
2. Each click places the next keypoint in the skeleton sequence.
3. Click near an existing keypoint (within 20px) to drag and reposition it.
4. Press **Enter** to finalize, **Escape** to cancel.

### Data Structure
```json
{
  "points": [
    { "x": 320, "y": 150, "visible": true, "name": "nose" },
    { "x": 300, "y": 130, "visible": true, "name": "left_eye" },
    { "x": 340, "y": 130, "visible": true, "name": "right_eye" }
  ],
  "skeletonType": "coco-17",
  "instanceId": 1
}
```

### Skeleton Presets

Annotix ships with 5 built-in skeleton presets, each defining keypoint names and connections:

| Preset | Points | Description |
|--------|--------|-------------|
| **COCO-17** | 17 | Human pose: nose, eyes, ears, shoulders, elbows, wrists, hips, knees, ankles |
| **MediaPipe Pose** | 33 | Extended human pose model |
| **MediaPipe Hand** | 21 | Hand joint detection with finger segments |
| **Face Basic** | 10 | Eyes, nose, mouth corners, ears, forehead, chin |
| **Animal Quadruped** | 12 | Nose, eyes, ears, neck, back, tail, legs |

### Details
- **Sequential placement:** keypoints are placed in the order defined by the preset.
- **Selection radius:** 20 pixels to grab and reposition an existing point.
- **Connections** between keypoints are drawn automatically based on the preset's connection map.
- Supports multiple instances (e.g. multiple people in the same image) via `instanceId`.

---

## Landmarks Tool

**Shortcut:** `L` | **Data type:** `landmarks` | **Interaction:** Click to place

The landmarks tool places free-form named reference points without skeleton constraints.

### How to Use
1. Press `L` or select the Landmarks tool.
2. Click to place each point. Points are auto-named "Point 1", "Point 2", etc.
3. Press **Enter** to finalize, **Escape** to cancel.

### Data Structure
```json
{
  "points": [
    { "x": 150, "y": 200, "name": "Point 1" },
    { "x": 300, "y": 180, "name": "Point 2" }
  ]
}
```

### Differences from Keypoints
- **No skeleton constraints** — points are completely free-form.
- **No connections** drawn between points.
- **Auto-naming** ("Point N") instead of preset-defined names.
- Best for custom landmarks, facial features, or any set of reference points.

---

## Select Tool

**Shortcut:** `V` | **Interaction:** Click to select, drag to move

### How to Use
1. Press `V` or select the Select tool.
2. Click on an annotation to select it.
3. Drag a selected annotation to move it.
4. Use Konva Transformer handles to resize (BBox, OBB) or rotate (OBB).
5. Press **Delete** to remove selected annotations.
6. Use **Arrow keys** to nudge selected annotations by 1 pixel.

### Multi-Selection
- **Shift + Click** to add/remove annotations from the selection.
- Selected annotations are highlighted.

### Class Reassignment
- Select one or more annotations, then change the active class. The selected annotations update their class automatically.

### AI Annotation Handling
- When you edit an AI-generated annotation (move, resize), it converts to a user annotation with `source: 'user'` and clears the `confidence` field.

---

## Pan Tool

**Shortcut:** `H` | **Interaction:** Click and drag

Drag the image canvas to navigate. The entire stage becomes draggable.

---

## Zoom & Navigation

### Mouse Wheel Zoom
- Scroll to zoom in/out.
- **Zoom factor:** 1.05x per scroll step.
- **Range:** 0.1x to 20x.
- Zooms centered on the mouse cursor position.

### Floating Controls
- **+** button: Zoom in (1.2x).
- **-** button: Zoom out (1.2x).
- **Reset** button: Fit image to window.

### Crosshair
- Active for **BBox** and **OBB** tools only.
- Shows precise canvas coordinates as the cursor moves.
- Hidden when the cursor leaves the image bounds.

### Mask Brush Preview
- When the Mask tool is active, the cursor shows a circle preview matching the current brush size.

---

## Class Selection

### Quick Selection
- **Keys `1` through `0`:** Select classes 1 to 10.
- **Keys `Q` through `P`:** Select classes 11 to 20.

### Workflow
1. Select a class from the sidebar or use a quick-select key.
2. All new annotations are tagged with the active class ID and rendered in the class color.
3. **Drawing is disabled** if no class is selected.

---

## Undo / Redo

| Action | Shortcut |
|--------|----------|
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` |

- **100-step history** per image.
- History is **cleared when switching images** (prevents cross-image undo bleeding).
- Any new action after an undo clears the redo stack (linear history model).
- State is captured before every add, delete, move, and resize operation.

---

## Image Adjustments

The canvas provides real-time image adjustments for better visibility while annotating. These do not modify the original image.

| Adjustment | Type |
|------------|------|
| **Brightness** | CSS filter |
| **Contrast** | CSS filter |
| **Temperature** | CSS filter |
| **CLAHE** | Pixel-level processing (150ms debounce) |
| **Sharpness** | Kernel-based sharpening |

Adjustments are **per-image** and restored when you return to an image.

---

## Annotation Rendering

Each annotation type has a dedicated renderer component in `src/features/canvas/components/renderers/`:

| Type | Renderer | Visual |
|------|----------|--------|
| BBox | `<Rect>` | Filled rectangle (20% opacity) + stroke |
| OBB | `<Group rotation={...}>` + `<Rect>` | Rotated rectangle |
| Polygon | `<Line closed>` | Filled polygon + stroke |
| Keypoints | `<Circle>` + `<Line>` | Points with skeleton connections |
| Landmarks | `<Circle>` | Points with white outline |
| Mask | `<KonvaImage>` | Base64 PNG at 60% opacity |

### AI Annotation Styling
- **Dashed border** with `dash={[5, 3]}` pattern.
- **Confidence badge** showing "AI XX%" above the annotation.
- **Gray color** (`#999999`) if the class is disabled.

---

## Tool Comparison

| Feature | BBox | OBB | Polygon | Keypoints | Landmarks | Mask |
|---------|------|-----|---------|-----------|-----------|------|
| **Input** | Drag | Drag | Click | Click/Drag | Click | Paint |
| **Live Preview** | Yes | Yes | No | Yes | No | Yes |
| **Rotatable** | No | Yes | No | No | No | No |
| **Movable** | Yes | Yes | Yes | Yes | Yes | Yes |
| **Min Size** | 5x5 px | 5x5 px | 3 points | 1 point | 1 point | 1 pixel |
| **Keyboard Finish** | Auto | Auto | Enter | Enter | Enter | Auto (1s) |
| **Data Format** | Rect | Rotated Rect | Point Array | Skeleton | Point Array | Base64 PNG |
