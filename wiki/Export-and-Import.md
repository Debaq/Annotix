# Export and Import

Annotix supports 11 export formats and 8 import formats. All operations produce or consume ZIP files with real-time progress tracking.

---

## Export Formats

### 1. YOLO Detection

**Format string:** `yolo-detection`

**Output structure:**
```
dataset.zip
├── images/
│   ├── image1.jpg
│   └── ...
├── labels/
│   ├── image1.txt
│   └── ...
├── classes.txt
└── data.yaml
```

**Label format (one line per annotation):**
```
class_id x_center y_center width height
```

**Coordinate system:** Normalized (0.0 to 1.0), center-based.

**Conversion:**
```
x_center = (bbox.x + bbox.width / 2) / image_width
y_center = (bbox.y + bbox.height / 2) / image_height
width    = bbox.width / image_width
height   = bbox.height / image_height
```

**data.yaml:**
```yaml
path: .
train: images
val: images
nc: 3
names:
  0: person
  1: car
  2: dog
```

For keypoints projects, `data.yaml` also includes `kpt_shape`, `keypoint_names`, and `skeleton` connections.

---

### 2. YOLO Segmentation

**Format string:** `yolo-segmentation`

Same structure as YOLO Detection, but polygon coordinates instead of bounding boxes:

```
class_id x1 y1 x2 y2 x3 y3 ...
```

All coordinates normalized (0.0 to 1.0).

---

### 3. COCO JSON

**Format string:** `coco`

**Output structure:**
```
dataset.zip
├── images/
│   └── ...
└── annotations.json
```

**annotations.json:**
```json
{
  "info": {
    "description": "ProjectName - COCO format dataset",
    "version": "1.0",
    "year": 2026,
    "contributor": "Annotix - TecMedHub FabLab",
    "date_created": "2026-03-27T12:00:00Z"
  },
  "licenses": [],
  "images": [
    { "id": 1, "width": 640, "height": 480, "file_name": "image1.jpg" }
  ],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 1,
      "bbox": [10.5, 20.3, 150.2, 200.5],
      "area": 30101.1,
      "iscrowd": 0,
      "segmentation": [[x1, y1, x2, y2, ...]],
      "keypoints": [x, y, v, x, y, v, ...],
      "num_keypoints": 15
    }
  ],
  "categories": [
    { "id": 1, "name": "person", "supercategory": "none" }
  ]
}
```

**Coordinate system:** Absolute pixel coordinates (not normalized).

**Bbox format:** `[x_min, y_min, width, height]`

**Special handling:**
- OBB annotations are converted to axis-aligned bounding boxes via `obb_to_aabbox()`.
- Polygon area calculated with Shoelace formula.
- Keypoints use COCO visibility flags: 0=invisible, 2=visible.
- Categories are 1-indexed.

---

### 4. Pascal VOC

**Format string:** `pascal-voc`

**Output structure:**
```
dataset.zip
├── JPEGImages/
│   └── ...
└── Annotations/
    ├── image1.xml
    └── ...
```

**XML format:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<annotation>
  <folder>ProjectName</folder>
  <filename>image1.jpg</filename>
  <source>
    <database>Annotix</database>
    <annotation>Annotix Dataset</annotation>
  </source>
  <size>
    <width>640</width>
    <height>480</height>
    <depth>3</depth>
  </size>
  <segmented>0</segmented>
  <object>
    <name>person</name>
    <pose>Unspecified</pose>
    <truncated>0</truncated>
    <difficult>0</difficult>
    <bndbox>
      <xmin>10</xmin>
      <ymin>20</ymin>
      <xmax>160</xmax>
      <ymax>220</ymax>
    </bndbox>
  </object>
</annotation>
```

**Coordinate system:** Absolute pixels, corner-based `[xmin, ymin, xmax, ymax]`, rounded to integers.

---

### 5. CSV Detection

**Format string:** `csv-detection`

**Output:**
```
dataset.zip
├── images/
│   └── ...
├── annotations.csv
└── classes.csv
```

**annotations.csv:**
```csv
filename,width,height,class,xmin,ymin,xmax,ymax
image1.jpg,640,480,person,10,20,160,220
image1.jpg,640,480,car,200,100,350,300
```

---

### 6. CSV Classification

**Format string:** `csv-classification`

```csv
filename,class
image1.jpg,cat;dog
image2.jpg,person
```

Multi-label classes separated by `;`, deduplicated.

---

### 7. CSV Keypoints

**Format string:** `csv-keypoints`

```csv
filename,width,height,class,instance_id,nose_x,nose_y,nose_visible,...
image1.jpg,640,480,person,1,320,150,1,...
```

Visibility: `1` (visible) or `0` (not visible). Blank coordinates for invisible keypoints.

---

### 8. CSV Landmarks

**Format string:** `csv-landmarks`

```csv
filename,width,height,class,point1_x,point1_y,point2_x,point2_y,...
image1.jpg,640,480,face,320,150,300,130,...
```

Landmark names auto-detected from annotations and sorted alphabetically. Empty cells for missing landmarks.

---

### 9. Folders by Class

**Format string:** `folders-by-class`

```
dataset.zip
├── person/
│   ├── image1.jpg
│   └── ...
├── car/
│   └── ...
├── unlabeled/
│   └── ...
└── README.txt
```

- Images with multiple classes get a class-name suffix: `image_person.jpg`.
- Folder names sanitized (special characters replaced with underscores).
- `README.txt` includes statistics and class distribution percentages.

---

### 10. U-Net Masks

**Format string:** `unet-masks`

```
dataset.zip
├── images/
│   └── ...
├── masks/
│   ├── image1.png
│   └── ...
└── classes.txt
```

**Mask format:** 8-bit grayscale PNG where pixel values represent class IDs.

- Background: pixel value `0`
- Classes: scaled grayscale `1-255` using formula: `class_value = round(class_id * 255 / num_classes)`

**Input support:** Polygon annotations are rasterized with a scanline algorithm. Mask annotations (base64 PNG) are decoded and composited.

**classes.txt:**
```
0: background
127: person
191: car
```

---

### 11. TIX (Native Annotix)

**Format string:** `tix`

```
dataset.zip
├── images/
│   └── ...
└── annotations.json
```

The native format preserves everything: full annotation data, class definitions with colors, metadata, timestamps, source attribution, and confidence scores. Fully reversible on re-import with no data loss.

```json
{
  "version": "1.0",
  "project": {
    "name": "ProjectName",
    "type": "bbox",
    "classes": [{"id": 0, "name": "person", "color": "#FF6B6B"}]
  },
  "images": [
    {
      "name": "image1.jpg",
      "annotations": [
        {
          "type": "bbox",
          "class": 0,
          "data": {"x": 10, "y": 20, "width": 150, "height": 200},
          "metadata": {"source": "manual", "confidence": null}
        }
      ],
      "width": 640,
      "height": 480
    }
  ]
}
```

---

## Import

### Auto-Detection

When you import a ZIP file, Annotix inspects its contents and determines the format automatically. The detector examines file structure, not file names.

**Detection order and criteria:**

| Priority | Format | Detection Criteria | Confidence |
|----------|--------|-------------------|------------|
| 1 | YOLO | `classes.txt` + `data.yaml` present | 0.95 |
| 2 | U-Net Masks | `masks/` + `images/` folders | 0.90 |
| 3 | TIX | `annotations.json` with `images` array | 0.95 |
| 4 | COCO | `annotations.json` with `annotations`, `categories`, `images` keys | 0.95 |
| 5 | Pascal VOC | `Annotations/` folder with `.xml` files | 0.90 |
| 6 | CSV | `annotations.csv` header analysis | 0.85-0.90 |
| 7 | Folders by Class | 2+ folders with image files at root | 0.85 |

**CSV sub-detection:**
- Header contains `xmin`/`xmax` -> detection
- Header contains `_visible` -> keypoints
- Header contains `landmark` -> landmarks
- Header contains `class`/`label` -> classification

**YOLO sub-detection:**
- Label file has >5 columns -> segmentation (polygon)
- Otherwise -> detection (bbox)

**COCO sub-detection:**
- Annotations contain `segmentation` field -> instance-segmentation
- Annotations contain `keypoints` field -> keypoints

### Import Formats (8)

| Format | Project Type |
|--------|-------------|
| YOLO Detection | `bbox` |
| YOLO Segmentation | `polygon` |
| COCO JSON | `bbox`, `polygon`, `keypoints`, `instance-segmentation` |
| Pascal VOC | `bbox` |
| CSV Detection | `bbox` |
| CSV Classification | `classification` |
| CSV Keypoints | `keypoints` |
| U-Net Masks | `mask` |
| Folders by Class | `classification` |
| TIX | Any (preserves original type) |

### Coordinate Denormalization

**YOLO import:**
```
Input:  class_id x_center y_center width height  (normalized 0-1)
Output: x = (x_center - width/2) * image_width
        y = (y_center - height/2) * image_height
        width = width * image_width
        height = height * image_height
```

**COCO import:** No conversion needed (already pixel coordinates).

**Pascal VOC import:** Direct mapping from `[xmin, ymin, xmax, ymax]`.

### Import Pipeline

1. **5%** — Format detection.
2. **15-25%** — ZIP opening and validation.
3. **25-50%** — Data parsing (annotations, classes).
4. **50-95%** — Image upload and annotation creation.
5. **95-100%** — Finalization.

Progress emitted via `import:progress` Tauri event (0-100 float).

### Validation

- **Corrupted ZIP** -> error before processing.
- **Missing required files** -> format detection fails.
- **Invalid image data** -> skipped with warning.
- **Mismatched dimensions** -> auto-detected from actual image.
- **Classes** auto-created with generated colors if not defined in the import.

---

## Progress Tracking

Both export and import emit real-time progress events:

```
export:progress  -> float (0.0 - 100.0)
import:progress  -> float (0.0 - 100.0)
```

The frontend subscribes to these events and displays a progress bar with percentage.
