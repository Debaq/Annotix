# Keyboard Shortcuts

All keyboard shortcuts in Annotix are **fully customizable** from Settings, with per-context conflict detection.

## Customization

### How to Customize

1. Go to **Settings** (gear icon).
2. Find the **Keyboard Shortcuts** section.
3. Click the shortcut badge you want to change.
4. Press the new key combination.
5. If there's a conflict, you'll see a warning and can accept or retry.

### Conflict Detection

Shortcuts are scoped by **context** (image, video, timeseries, or global). A conflict only occurs if two shortcuts share the same key in the same context or if one is global.

### Storage

Custom shortcuts are saved to `localStorage` under key `annotix-keyboard-shortcuts`. Only modified shortcuts are stored — defaults are not persisted.

### Reset

You can reset individual shortcuts or all shortcuts to their defaults from the Settings page.

---

## Default Shortcuts

### General (Global)

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Del` / `Backspace` | Delete selection |
| `Esc` | Deselect / Cancel |

### Navigation

| Shortcut | Action | Context |
|----------|--------|---------|
| `Left Arrow` | Previous image / Previous frame | Global / Video |
| `Right Arrow` | Next image / Next frame | Global / Video |
| `Ctrl++` | Zoom in | Global |
| `Ctrl+-` | Zoom out | Global |
| `Ctrl+0` | Zoom to fit | Global |

### Image Annotation Tools

| Shortcut | Tool |
|----------|------|
| `B` | Bounding Box |
| `O` | Oriented Bounding Box (OBB) |
| `M` | Mask (brush) |
| `P` | Polygon |
| `K` | Keypoints |
| `L` | Landmarks |
| `V` | Select |
| `H` | Pan |

### Mask Tool

| Shortcut | Action |
|----------|--------|
| `E` | Toggle eraser mode |
| `[` | Decrease brush size by 5 |
| `]` | Increase brush size by 5 |
| `Ctrl + Scroll Up` | Increase brush size |
| `Ctrl + Scroll Down` | Decrease brush size |

### Drawing

| Shortcut | Action |
|----------|--------|
| `Enter` | Confirm / Finalize drawing |
| `Esc` | Cancel current drawing |
| `A` | Rotate image left |
| `D` | Rotate image right |

### Quick Class Selection

| Keys | Classes |
|------|---------|
| `1` through `9` | Classes 1 to 9 |
| `0` | Class 10 |
| `Q` through `P` | Classes 11 to 20 |

These are **not customizable** — they're hardcoded for fast access.

### Video

| Shortcut | Action |
|----------|--------|
| `T` | Create new track |
| `Left Arrow` | Previous frame |
| `Right Arrow` | Next frame |

### Time Series

| Shortcut | Tool |
|----------|------|
| `V` | Select |
| `P` | Point annotation |
| `R` | Range annotation |
| `E` | Event annotation |
| `A` | Anomaly annotation |

---

## Shortcut Categories

Shortcuts are organized into categories for the Settings UI:

| Category | Scope |
|----------|-------|
| **General** | Save, undo, redo, delete |
| **Navigation** | Image/frame navigation, zoom |
| **Tools** | Tool selection (BBox, Polygon, etc.) |
| **Editing** | Drawing confirm/cancel, rotation |

---

## Technical Details

### ShortcutsManager

A singleton class (`src/features/core/utils/ShortcutsManager.ts`) handles:

- Loading defaults and user overrides from localStorage.
- Registering and dispatching keyboard events.
- Conflict detection across contexts.
- Serialization/deserialization.

### Context System

Each shortcut can optionally have a `context`:

| Context | When Active |
|---------|-------------|
| `undefined` (global) | Always |
| `image` | When on the image annotation canvas |
| `video` | When on the video annotation view |
| `timeseries` | When on the time series view |

Global shortcuts are always active. Context-specific shortcuts only fire when that view is active.

### Compound Shortcuts

Some shortcuts support multiple bindings separated by `/`:

- `Del / Backspace` — both keys trigger the same action.
- The conflict detector checks all bindings.

### Keyboard Capture UI

When editing a shortcut:

- Click the shortcut badge — enters capture mode (pulses visually).
- Press any key or key combination — captured.
- `Escape` cancels the capture.
- Global shortcuts are temporarily disabled during capture to prevent interference.
