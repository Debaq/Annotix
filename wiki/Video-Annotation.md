# Video Annotation

Annotix provides a full frame-based video annotation system built on native FFmpeg integration. Instead of annotating video directly, frames are extracted at a configurable FPS and annotated as images with tracking support.

## Overview

The video annotation workflow is:

1. **Upload** a video to a project.
2. **Extract frames** at a chosen FPS.
3. **Create tracks** for objects you want to follow across frames.
4. **Set keyframes** with bounding boxes at specific frames.
5. **Interpolation** fills in positions between keyframes automatically.
6. **Bake** materializes the interpolated positions into real per-frame annotations.

---

## Frame Extraction

### How It Works

Frame extraction uses FFmpeg (via the `ffmpeg-the-third` Rust crate) to decode the video and save individual frames as JPEG images.

| Setting | Description |
|---------|-------------|
| **FPS** | User-configurable extraction rate (e.g. 1, 5, 10, 30 fps) |
| **Format** | JPEG at quality 90 |
| **Batch Size** | 50 frames per disk flush |
| **Algorithm** | PTS-based selection (selects frames at precise intervals, not every frame) |

### PTS-Based Selection

Rather than extracting every frame and discarding extras, Annotix calculates the PTS (Presentation Timestamp) interval:

```
pts_interval = pts_per_second / fps_extraction
```

Only frames at or near each PTS interval boundary are saved. This is more efficient than extracting all frames.

### Auto-Resume

If a frame extraction is interrupted (app crash, user closes app), Annotix automatically detects partially extracted videos on restart:

1. Counts existing extracted frames in the video directory.
2. Compares against expected frame count.
3. Resumes extraction from where it left off.
4. Emits progress events during resume.

### Status Tracking

| Status | Meaning |
|--------|---------|
| `pending` | Video uploaded, no frames extracted |
| `extracting` | Extraction in progress |
| `ready` | All frames extracted, ready for annotation |

---

## Tracks

A **track** represents a single object to follow across the video. Each track has:

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `class_id` | Class of the tracked object |
| `label` | Optional display name |
| `enabled` | Whether the track is active |
| `keyframes` | Array of keyframe positions |

### Operations

| Operation | Description |
|-----------|-------------|
| **Create Track** | Shortcut `T`. Creates a new track with the active class. |
| **Update Track** | Change class, label, or enabled state. |
| **Delete Track** | Remove track and all its keyframes. |

---

## Keyframes

A **keyframe** defines the position of a tracked object at a specific frame. Between keyframes, positions are interpolated automatically.

| Field | Description |
|-------|-------------|
| `frame_index` | The frame number (0-based) |
| `x`, `y`, `width`, `height` | Bounding box in pixel coordinates |
| `is_keyframe` | Always `true` for user-set keyframes |
| `enabled` | Whether this keyframe participates in interpolation |

### Operations

| Operation | Description |
|-----------|-------------|
| **Set Keyframe** | Draw a bounding box on the current frame for a track. If a keyframe already exists at this frame, it's updated (upsert). |
| **Delete Keyframe** | Remove a keyframe at a specific frame index. |
| **Toggle Enabled** | Enable/disable a keyframe without deleting it. Disabled keyframes are skipped during interpolation. |

Keyframes are sorted by `frame_index` within each track.

---

## Interpolation

Annotix uses **linear interpolation** to compute bounding box positions between keyframes. This runs on-the-fly as you scrub the timeline.

### Algorithm (5 cases)

Given a frame index and a track's keyframes:

1. **Exact match** — The frame is a keyframe. Return it directly.
2. **Before first keyframe** — Hold/extend the first keyframe's position.
3. **After last keyframe** — Hold/extend the last keyframe's position.
4. **Between two keyframes** — Linear interpolation:
   ```
   t = (frameIndex - prevFrame) / (nextFrame - prevFrame)
   x = prev.x + (next.x - prev.x) * t
   y = prev.y + (next.y - prev.y) * t
   width = prev.width + (next.width - prev.width) * t
   height = prev.height + (next.height - prev.height) * t
   ```
5. **Enabled logic** — A frame is only enabled if **both** the previous and next keyframes are enabled.

### Output

The interpolation produces an `InterpolatedBBox` for each frame, containing:

| Field | Description |
|-------|-------------|
| `trackId` | Which track this belongs to |
| `classId` | Track's class |
| `x, y, width, height` | Interpolated bounding box |
| `isKeyframe` | Whether this is a real keyframe or interpolated |
| `enabled` | Whether this position is active |

---

## Bake

The **bake** operation converts the sparse keyframe representation into dense per-frame annotations stored in the project's image entries.

### How It Works

1. For each extracted frame, iterate over all tracks.
2. Compute the interpolated bounding box using the algorithm above.
3. Create an `AnnotationEntry` with `source: "user"` for each active interpolated position.
4. Replace the frame's existing annotations with the baked results.
5. Write everything atomically to `project.json`.

### When to Bake

- Bake when you're satisfied with the track positions and want to export the annotations.
- Baked annotations appear in the gallery like normal image annotations.
- You can continue editing tracks after baking and re-bake to update.

---

## Timeline & Controls

### Interactive Timeline

The video view includes an interactive timeline for frame navigation:

- **Scrubber** — Drag to jump to any frame.
- **Frame-by-frame** — Use `Left Arrow` and `Right Arrow` keys.
- **Keyframe indicators** — Visual markers on the timeline showing where keyframes exist.

### Video View Components

| Component | Purpose |
|-----------|---------|
| `VideoTimeline` | Timeline scrubber with keyframe markers |
| `VideoView` | Frame display and navigation |
| `VideoAnnotationCanvas` | Interactive canvas for drawing bounding boxes on frames |

### Workflow

1. Navigate to a frame using the timeline or arrow keys.
2. The frame loads and all interpolated bounding boxes are rendered.
3. Draw or adjust bounding boxes directly on the frame.
4. Changes are saved as keyframes for the active track.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `T` | Create new track |
| `Left Arrow` | Previous frame |
| `Right Arrow` | Next frame |

---

## P2P Considerations

Video files, tracks, keyframes, and frame images are **not synced** via P2P. Only the work assignment (which peer is responsible for which video) and pending approvals are synced. Each peer extracts frames locally after receiving the video assignment.
