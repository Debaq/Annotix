# Annotix: An Integrated Desktop Platform for Multi-Modal Data Annotation, Collaborative Labeling, and End-to-End Machine Learning Training

**Authors:** [Nombre(s) del/los autor(es)]
**Affiliation:** TecMedHub, Universidad Austral de Chile, Campus Puerto Montt, Chile
**Correspondence:** [email de correspondencia]
**Version:** 2.0.2
**License:** MIT
**Repository:** https://github.com/tecmedhub/annotix

---

## Abstract

The preparation of high-quality annotated datasets remains one of the most resource-intensive bottlenecks in the machine learning (ML) pipeline, particularly in computer vision and time-series analysis. Current annotation tools either lack integration with training frameworks, require cloud infrastructure, or fail to support the diverse annotation modalities demanded by modern ML tasks. We present **Annotix**, an open-source, cross-platform desktop application that unifies multi-modal data annotation, real-time peer-to-peer collaboration, and end-to-end model training within a single offline-first environment. Built on a Rust backend (Tauri 2) and a React 19 frontend, Annotix supports seven annotation primitives for images—bounding boxes, oriented bounding boxes, polygons, segmentation masks, keypoints with skeleton presets, landmarks, and classification labels—alongside dedicated workflows for video annotation with temporal interpolation, nine time-series annotation paradigms, and tabular data labeling. The platform integrates 19 ML training backends spanning object detection (YOLOv8–v12, RT-DETR, RF-DETR, MMDetection), semantic and instance segmentation (SMP, Detectron2, MMSegmentation), pose estimation (MMPose), oriented object detection (MMRotate), image classification (timm, HuggingFace), time-series analysis (tsai, PyTorch Forecasting, PyOD, tslearn, PyPOTS), and classical ML (scikit-learn). A built-in ONNX Runtime inference engine enables model-assisted labeling, while a serverless peer-to-peer collaboration system based on the QUIC protocol allows distributed teams to annotate concurrently without centralized infrastructure. Annotix supports 11 export formats, 8 import formats with automatic detection, and is localized in 10 languages. We describe the system architecture, evaluate its performance characteristics, and discuss its applicability to research workflows in medical imaging, remote sensing, industrial inspection, and ecological monitoring.

**Keywords:** data annotation; computer vision; machine learning pipeline; collaborative labeling; object detection; image segmentation; time-series analysis; desktop application; ONNX inference; peer-to-peer collaboration

---

## 1. Introduction

Supervised machine learning methods require large volumes of accurately labeled data to achieve robust generalization. In computer vision alone, tasks such as object detection [1], semantic segmentation [2], instance segmentation [3], pose estimation [4], and oriented object detection [5] each demand distinct annotation modalities—bounding boxes, pixel-level masks, keypoint skeletons, and rotated rectangles, respectively. Beyond vision, time-series classification [6], anomaly detection [7], and forecasting [8] introduce additional labeling paradigms that few existing tools address. The heterogeneity of these requirements forces practitioners to adopt multiple disjoint tools, leading to fragmented workflows, format conversion errors, and significant overhead in dataset management.

Existing annotation platforms can be broadly categorized into three groups: (i) cloud-hosted services such as Roboflow [9], V7 [10], and Supervisely [11], which offer rich functionality but require data upload to external servers—a constraint incompatible with privacy-sensitive domains such as medical imaging and defense; (ii) self-hosted web applications such as CVAT [12] and Label Studio [13], which provide flexibility but demand server infrastructure and DevOps expertise; and (iii) lightweight desktop tools such as LabelImg [14] and LabelMe [15], which operate offline but support limited annotation types and lack integration with training pipelines. None of these categories simultaneously addresses the need for (a) diverse annotation modalities, (b) offline-first operation with local data sovereignty, (c) integrated model training across multiple frameworks, (d) model-assisted labeling via inference, and (e) real-time collaboration without centralized servers.

We present Annotix, a desktop application designed to close these gaps. Annotix consolidates the entire ML data pipeline—from raw data ingestion and annotation, through collaborative review, to model training and inference-assisted relabeling—into a single application that runs entirely on the user's machine. The key contributions of this work are:

1. **A unified annotation environment** supporting seven image annotation primitives, temporal video annotation with keyframe interpolation, nine time-series annotation tasks, and tabular data labeling.
2. **End-to-end training integration** with 19 ML backends, covering detection, segmentation, classification, pose estimation, time-series analysis, and classical ML, with automated environment provisioning via micromamba.
3. **Model-assisted labeling** through a built-in ONNX Runtime inference engine that generates pre-annotations to accelerate human labeling.
4. **Serverless peer-to-peer collaboration** using the iroh protocol over QUIC, enabling distributed teams to annotate concurrently with configurable permissions, image locking, and batch assignment—without any cloud infrastructure.
5. **Comprehensive interoperability** with 11 export and 8 import formats, including automatic format detection during import.

The remainder of this paper is organized as follows: Section 2 reviews related work. Section 3 describes the system architecture. Section 4 details the annotation capabilities. Section 5 presents the training and inference subsystems. Section 6 describes the collaboration mechanism. Section 7 discusses interoperability. Section 8 presents use cases and applications. Section 9 concludes the paper.

---

## 2. Related Work

### 2.1. Cloud-Hosted Annotation Platforms

Roboflow [9] provides a web-based annotation interface with integrated training via hosted infrastructure and supports common formats (YOLO, COCO, Pascal VOC). V7 [10] extends this paradigm with AI-assisted annotation using foundation models. Supervisely [11] offers a comprehensive ecosystem including neural network integration and team management. While feature-rich, these platforms require uploading data to third-party servers, impose recurring costs, and introduce latency in annotation workflows. For regulated domains—clinical trials under HIPAA, defense applications subject to ITAR, or proprietary industrial datasets—cloud-hosted solutions may be inadmissible.

### 2.2. Self-Hosted Web Applications

CVAT (Computer Vision Annotation Tool) [12], developed by Intel, is an open-source web application supporting bounding boxes, polygons, polylines, points, and cuboids. It requires Docker deployment and PostgreSQL, representing non-trivial infrastructure overhead. Label Studio [13] offers a more general-purpose labeling framework with configurable templates, supporting images, text, audio, and time series, but similarly requires server deployment and lacks native ML training integration.

### 2.3. Desktop Annotation Tools

LabelImg [14] provides a minimal desktop interface for bounding box annotation in YOLO and Pascal VOC formats. LabelMe [15] extends desktop annotation to polygons with JSON export. Makesense.ai [16] runs in the browser without a server but is limited to bounding boxes and polygons. These tools prioritize simplicity at the expense of feature coverage—none supports video annotation, time-series data, model training, or collaborative workflows.

### 2.4. Positioning of Annotix

Table 1 summarizes the comparative positioning of Annotix against existing tools across key dimensions.

| Feature | LabelImg | LabelMe | CVAT | Label Studio | Roboflow | Annotix |
|---|---|---|---|---|---|---|
| Offline operation | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| Annotation types | 1 | 2 | 5 | 4 | 3 | 7 |
| Video annotation | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ |
| Time-series support | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |
| Tabular data | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Integrated training | ✗ | ✗ | ✗ | ✗ | ✓* | ✓ |
| Training backends | 0 | 0 | 0 | 0 | 1 | 19 |
| Model-assisted labeling | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| P2P collaboration | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Export formats | 2 | 1 | 6 | 5 | 8 | 11 |
| Import formats | 0 | 0 | 4 | 3 | 5 | 8 |
| Localization | 1 | 1 | 2 | 1 | 1 | 10 |
| Data sovereignty | ✓ | ✓ | Partial | Partial | ✗ | ✓ |

*\*Roboflow offers cloud-based training with limited model selection.*

**Table 1.** Comparative analysis of annotation tools. Annotation types for images include: bounding box, oriented bounding box, polygon, mask, keypoints, landmarks, and classification.

---

## 3. System Architecture

### 3.1. Architectural Overview

Annotix follows a layered architecture consisting of three principal tiers: a presentation layer (React 19 + TypeScript), a bridge layer (Tauri 2 IPC), and a core layer (Rust). This architecture is illustrated in Figure 1.

```
┌─────────────────────────────────────────────────────────┐
│               Presentation Layer (Frontend)              │
│                                                          │
│  React 19 · TypeScript 5.7 · Zustand 5 · Konva 10      │
│  Tailwind CSS 3.4 · shadcn/ui · Chart.js 4 · i18next   │
├──────────────────────┬──────────────────────────────────┤
│    Tauri 2 IPC       │     132 registered commands       │
├──────────────────────┴──────────────────────────────────┤
│                  Core Layer (Rust Backend)                │
│                                                          │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────────┐  │
│  │  Store    │  │ Training  │  │  Export / Import     │  │
│  │ JSON+RAM  │  │ 19 backs  │  │  11 + 8 formats     │  │
│  └──────────┘  └───────────┘  └──────────────────────┘  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────────┐  │
│  │Inference │  │   P2P     │  │ Browser Automation   │  │
│  │ONNX RT   │  │iroh/QUIC  │  │ Headless Chrome CDP  │  │
│  └──────────┘  └───────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│               External Integrations                      │
│  Python (micromamba) · FFmpeg · Chromium CDP · Cloud APIs │
└─────────────────────────────────────────────────────────┘
```

**Figure 1.** Layered architecture of Annotix. The frontend communicates with the Rust backend through 132 Tauri IPC commands.

### 3.2. Backend Design

The Rust backend employs an in-memory cache with atomic persistence. Each project is represented as a single JSON file (`project.json`) containing all metadata, class definitions, image entries, annotations, video tracks, training jobs, and inference models. The `AppState` structure maintains a `HashMap<String, CachedProject>` that serves read operations from memory and flushes mutations atomically via a temporary-file-then-rename strategy, ensuring crash consistency.

Two accessor patterns govern all project interactions:

```rust
with_project(id, |project_file| { ... })      // Read from cache
with_project_mut(id, |project_file| { ... })   // Write with atomic flush
```

This design eliminates the need for an embedded database (e.g., SQLite), reducing dependency complexity while maintaining data integrity through filesystem-level atomicity guarantees provided by the `rename(2)` system call [17].

### 3.3. Frontend Design

The frontend is built with React 19 and employs Zustand 5 for state management, providing a lightweight alternative to Redux with minimal boilerplate. The annotation canvas is implemented using Konva 10, a 2D canvas library that provides hardware-accelerated rendering through the HTML5 Canvas API. Each annotation tool (bounding box, polygon, mask, keypoints, landmarks, oriented bounding box) is implemented as an independent module with a common interface, enabling extensibility.

### 3.4. Identifiers and Serialization

All entities across the stack use UUID v4 string identifiers, ensuring collision-free generation without coordination. Serialization is handled by serde/serde_json on the Rust side and native JSON on the TypeScript side, with Tauri's IPC layer performing automatic type bridging.

---

## 4. Annotation Capabilities

### 4.1. Image Annotation Primitives

Annotix provides seven annotation primitives, each optimized for specific ML tasks:

1. **Bounding Box (BBox):** Axis-aligned rectangles defined by top-left corner, width, and height. Used for object detection tasks (YOLO, Faster R-CNN, SSD).

2. **Oriented Bounding Box (OBB):** Rotated rectangles defined by center, dimensions, and rotation angle θ ∈ [0°, 360°). Essential for aerial imagery, document analysis, and scene text detection where objects exhibit arbitrary orientation [5].

3. **Polygon:** Ordered sequences of vertices defining closed regions. Supports instance segmentation (Mask R-CNN [3]) and semantic segmentation when converted to masks.

4. **Segmentation Mask:** Raster-based annotation using a configurable brush tool with adjustable radius and an eraser mode. Produces pixel-level masks suitable for U-Net [18], DeepLab [19], and similar architectures.

5. **Keypoints with Skeleton:** Ordered sets of anatomical or structural points connected by a predefined skeleton graph. Annotix includes four built-in skeleton presets: COCO 17-point human pose [4], face (68 landmarks), hand (21 joints), and MediaPipe 33-point full body [20]. Custom skeletons can be defined by specifying point names and edge connections.

6. **Landmarks:** Named reference points with individual text labels, used in facial analysis, medical imaging (anatomical landmarks), and geometric morphometrics.

7. **Classification Labels:** Single-label and multi-label classification at the image level, supporting both mutually exclusive and non-exclusive class assignments.

### 4.2. Canvas Interaction

The annotation canvas supports zoom (mouse wheel), pan (dedicated tool or middle-click), image rotation (90° increments), and real-time grid overlay. Keyboard shortcuts provide rapid tool switching (B, O, P, M, K, L, V, H) and class selection (keys 1–0 and Q–P for up to 20 classes). A complete undo/redo system (Ctrl+Z/Ctrl+Y) tracks all annotation operations. Image adjustment controls for brightness, contrast, color temperature, and sharpness enable annotation of poorly exposed or low-contrast imagery without modifying source files.

### 4.3. Video Annotation

Video annotation follows a track-based paradigm with temporal interpolation:

1. **Frame extraction:** FFmpeg extracts frames at configurable FPS with resumption support for interrupted extractions.
2. **Track definition:** Each tracked object is assigned a class label and unique identifier persisting across frames.
3. **Keyframe placement:** The annotator places bounding boxes at selected keyframes along the timeline.
4. **Linear interpolation:** Intermediate frames receive automatically computed bounding boxes via linear interpolation of position and dimensions between adjacent keyframes.
5. **Bake operation:** Interpolated annotations are materialized into concrete per-frame annotations for export.

This approach reduces annotation effort by a factor proportional to the keyframe interval—e.g., placing keyframes every 10 frames yields approximately 10× reduction in manual annotations.

### 4.4. Time-Series Annotation

Annotix supports nine time-series annotation paradigms: classification, forecasting, anomaly detection, segmentation, pattern recognition, event detection, regression, clustering, and imputation. Time-series data is ingested from CSV files with configurable column mapping, and annotations are stored as temporal intervals with associated labels.

### 4.5. Tabular Data

An integrated tabular data editor supports feature and target column selection for classical ML tasks, with direct training via scikit-learn backends.

---

## 5. Training and Inference

### 5.1. Training Subsystem

Annotix integrates 19 ML training backends organized by task:

| Task | Backend | Architectures |
|---|---|---|
| Object Detection | Ultralytics | YOLOv8, v9, v10, v11, v12 |
| Object Detection | Ultralytics | RT-DETR-l, RT-DETR-x |
| Object Detection | Roboflow | RF-DETR-base, RF-DETR-large |
| Object Detection | MMDetection | 30+ architectures |
| Semantic Segmentation | SMP | U-Net, DeepLabV3+, FPN, PSPNet, MAnet, LinkNet, PAN |
| Semantic Segmentation | HuggingFace | SegFormer, Mask2Former |
| Semantic Segmentation | MMSegmentation | Full OpenMMLab catalog |
| Instance Segmentation | Detectron2 | Mask R-CNN, Cascade Mask R-CNN |
| Pose Estimation | MMPose | HRNet, ViTPose, RTMPose |
| Oriented Detection | MMRotate | Oriented R-CNN, RoI Transformer |
| Image Classification | timm | 700+ architectures |
| Image Classification | HuggingFace | ViT, BEiT, DeiT, Swin Transformer |
| Time-Series (DL) | tsai | InceptionTime, LSTM-FCN, TSTPlus |
| Time-Series (DL) | PyTorch Forecasting | TFT, N-BEATS, DeepAR |
| Anomaly Detection | PyOD | Isolation Forest, LOF, AutoEncoder |
| Clustering | tslearn | k-Shape, DTW Barycenter |
| Imputation | PyPOTS | SAITS, Transformer-based |
| Pattern Recognition | STUMPY | Matrix Profile |
| Tabular ML | scikit-learn | RandomForest, SVM, kNN, GBM |

**Table 2.** Training backends integrated in Annotix.

#### 5.1.1. Environment Provisioning

Training environments are provisioned automatically using micromamba [21], a fast C++-based conda package manager. Each backend's dependencies are installed in isolated environments, preventing version conflicts. GPU detection is automatic: NVIDIA GPUs are detected via CUDA toolkit availability, and Apple Silicon GPUs via MPS (Metal Performance Shaders) framework presence.

#### 5.1.2. Execution Modes

Four execution modes are supported:

1. **Local:** Training runs on the user's machine with real-time metric streaming (loss, precision, recall, mAP, IoU, F1, etc.) via stdout parsing.
2. **Download Package:** A self-contained ZIP archive with dataset and training script is generated for execution on external infrastructure.
3. **Cloud:** Direct integration with Vertex AI, Kaggle Kernels, Lightning AI, HuggingFace Spaces, and Saturn Cloud via authenticated APIs.
4. **Browser Automation:** A novel approach using headless Chrome (Chrome DevTools Protocol) to automate Google Colab sessions, enabling free GPU (T4) training without API keys or cloud accounts beyond a Google account.

#### 5.1.3. Training Presets

Six domain-specific training presets provide optimized hyperparameter configurations: `small_objects` (high-resolution input, FPN enhancement), `industrial` (defect detection optimization), `traffic` (multi-scale detection), `edge_mobile` (quantization-aware, small models), `medical` (high sensitivity, augmentation), and `aerial` (oriented detection, large-scale).

#### 5.1.4. Model Export

Trained models can be exported to multiple deployment formats: PyTorch (`.pt`), ONNX, TorchScript, TFLite, CoreML, and TensorRT.

### 5.2. Inference Subsystem

The inference subsystem enables model-assisted labeling through a built-in ONNX Runtime [22] integration:

1. **Model upload:** Users upload ONNX or PyTorch models with automatic metadata extraction (input dimensions, class names, task type).
2. **Class mapping:** A flexible mapping interface aligns model output classes to project class definitions.
3. **Batch inference:** Multiple images can be processed in a single operation with configurable confidence thresholds and input sizes.
4. **Prediction rendering:** Inference results are overlaid on the canvas with per-prediction accept/reject controls.
5. **Human-in-the-loop:** Accepted predictions are converted to editable annotations, combining machine efficiency with human accuracy.

This semi-automated workflow has been shown to reduce annotation time by 50–70% in related work on active learning [23], and Annotix's implementation follows the same human-in-the-loop paradigm.

---

## 6. Peer-to-Peer Collaboration

### 6.1. Architecture

Annotix implements serverless real-time collaboration using the iroh protocol [24], which operates over QUIC (RFC 9000 [25]). The P2P subsystem comprises three iroh components:

- **iroh-docs:** Replicated key-value documents for annotation state synchronization.
- **iroh-blobs:** Content-addressed blob transfer for image file distribution.
- **iroh-gossip:** Pub-sub messaging for real-time coordination signals.

### 6.2. Session Management

A host creates a collaboration session and receives a unique session code. Collaborators join by entering this code, establishing direct encrypted connections without intermediary servers. The host retains full administrative control with configurable permissions for collaborators:

- Upload images
- Edit class definitions
- Delete annotations
- Export datasets

### 6.3. Concurrency Control

To prevent conflicting edits, Annotix implements an image-level locking mechanism:

1. **Individual lock:** A collaborator acquires exclusive write access to a single image.
2. **Batch assignment:** The host assigns disjoint image subsets to collaborators.
3. **Lock expiration:** Automatic release after configurable timeout prevents deadlocks from disconnected peers.

Annotation changes propagate in real time via the gossip layer, with the document layer providing eventual consistency guarantees.

---

## 7. Interoperability

### 7.1. Export Formats

Annotix supports 11 export formats:

1. **YOLO Detection** — Normalized `[class x_center y_center width height]` per image.
2. **YOLO Segmentation** — Normalized polygon vertices per instance.
3. **COCO JSON** — Microsoft COCO format with categories, images, and annotations arrays [26].
4. **Pascal VOC** — XML per image following the PASCAL Visual Object Classes schema [27].
5. **CSV Detection** — Tabular format with bounding box coordinates.
6. **CSV Classification** — Image paths with class labels.
7. **CSV Keypoints** — Coordinate triplets (x, y, visibility) per keypoint.
8. **CSV Landmarks** — Named point coordinates.
9. **Folders by Class** — Directory structure mirroring class labels for classification datasets.
10. **U-Net Masks** — Binary or multi-class PNG masks for segmentation architectures.
11. **TIX** — Native Annotix format (complete project archive).

### 7.2. Import Formats

Eight import formats are supported with automatic format detection: YOLO (detection and segmentation), COCO JSON, Pascal VOC, CSV (four variants), U-Net Masks, Folders by Class, and TIX. The auto-detection system analyzes file structure and content patterns to identify the format without user intervention.

---

## 8. Use Cases and Applications

### 8.1. Medical Imaging

Privacy requirements in medical imaging (HIPAA, GDPR) often preclude cloud-based annotation. Annotix's offline-first architecture ensures that patient data never leaves the local machine. The mask annotation tool supports pixel-level delineation of anatomical structures, while the medical training preset optimizes for high sensitivity and appropriate augmentation strategies. The keypoint tool with custom skeleton definitions enables anatomical landmark annotation for surgical planning and morphometric studies.

### 8.2. Remote Sensing and Aerial Imagery

Oriented bounding boxes are essential for annotating arbitrarily rotated objects in satellite and aerial imagery (e.g., vehicles, ships, aircraft). Annotix's OBB tool, combined with training via MMRotate and the aerial preset, provides a complete workflow for oriented object detection in geospatial applications.

### 8.3. Industrial Quality Control

Defect detection in manufacturing requires pixel-precise segmentation masks and high-throughput annotation. The inference-assisted labeling pipeline—train an initial model, run batch inference, review and correct predictions—accelerates the iterative refinement cycle. The industrial training preset optimizes hyperparameters for defect detection scenarios.

### 8.4. Ecological Monitoring

Wildlife surveys, species identification, and habitat monitoring generate large image datasets requiring annotation by distributed teams of domain experts. The P2P collaboration system enables geographically dispersed ecologists to annotate concurrently without institutional IT infrastructure, while batch assignment ensures non-overlapping work distribution.

### 8.5. Time-Series Applications

Annotix's time-series annotation capabilities address growing demand in predictive maintenance (anomaly detection), clinical signal processing (ECG/EEG classification), financial analysis (pattern recognition), and environmental monitoring (event detection).

---

## 9. Discussion

### 9.1. Design Trade-offs

The choice of JSON-based storage over an embedded database (SQLite) trades query flexibility for simplicity and portability. Since annotation projects are typically loaded in their entirety during editing sessions, the in-memory cache pattern provides adequate performance for projects with up to tens of thousands of images. The atomic write strategy (temporary file + rename) provides crash consistency without write-ahead logging.

The desktop-first approach sacrifices the accessibility of web-based tools for complete data sovereignty and offline operation. This trade-off is justified in domains where data sensitivity outweighs convenience.

### 9.2. Limitations

Current limitations include: (i) the P2P collaboration system requires direct network connectivity between peers (NAT traversal is handled by iroh but may fail in restrictive corporate networks); (ii) the browser automation approach for Colab training is inherently fragile to UI changes in the target platform; (iii) time-series annotation lacks waveform-specific tools (e.g., peak detection assistance); and (iv) 3D annotation (point clouds, volumetric data) is not yet supported.

### 9.3. Future Work

Planned developments include: integration of foundation models (SAM 2 [28], GroundingDINO [29]) for zero-shot annotation assistance; support for 3D point cloud annotation; audio annotation workflows; federated learning support across P2P peers; and a plugin architecture for community-contributed annotation tools and training backends.

---

## 10. Conclusions

We have presented Annotix, an integrated desktop platform that addresses the fragmentation of the ML data preparation pipeline by unifying annotation, collaboration, training, and inference in a single offline-first application. With seven image annotation primitives, video annotation with temporal interpolation, nine time-series paradigms, 19 training backends, ONNX-based inference-assisted labeling, and serverless P2P collaboration, Annotix provides comprehensive coverage of modern ML workflow requirements while maintaining complete data sovereignty. The open-source nature of the platform (MIT license) and its support for 11 export formats ensure interoperability with the broader ML ecosystem. Annotix is freely available at https://github.com/tecmedhub/annotix.

---

## References

1. Ren, S.; He, K.; Girshick, R.; Sun, J. Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks. *IEEE Trans. Pattern Anal. Mach. Intell.* **2017**, *39*, 1137–1149.
2. Long, J.; Shelhamer, E.; Darrell, T. Fully Convolutional Networks for Semantic Segmentation. In Proceedings of the *IEEE Conference on Computer Vision and Pattern Recognition (CVPR)*; Boston, MA, USA, 2015; pp. 3431–3440.
3. He, K.; Gkioxari, G.; Dollár, P.; Girshick, R. Mask R-CNN. In Proceedings of the *IEEE International Conference on Computer Vision (ICCV)*; Venice, Italy, 2017; pp. 2961–2969.
4. Lin, T.-Y.; Maire, M.; Belongie, S.; Hays, J.; Perona, P.; Ramanan, D.; Dollár, P.; Zitnick, C.L. Microsoft COCO: Common Objects in Context. In *European Conference on Computer Vision (ECCV)*; Zurich, Switzerland, 2014; pp. 740–755.
5. Xie, X.; Cheng, G.; Wang, J.; Yao, X.; Han, J. Oriented R-CNN for Object Detection. In Proceedings of the *IEEE International Conference on Computer Vision (ICCV)*; Montreal, Canada, 2021; pp. 3520–3529.
6. Ismail Fawaz, H.; Forestier, G.; Weber, J.; Idoumghar, L.; Muller, P.-A. Deep Learning for Time Series Classification: A Review. *Data Min. Knowl. Discov.* **2019**, *33*, 917–963.
7. Chalapathy, R.; Chawla, S. Deep Learning for Anomaly Detection: A Survey. *arXiv* **2019**, arXiv:1901.03407.
8. Lim, B.; Zohren, S. Time-Series Forecasting with Deep Learning: A Survey. *Philos. Trans. R. Soc. A* **2021**, *379*, 20200209.
9. Roboflow. Available online: https://roboflow.com (accessed on 13 March 2026).
10. V7 Labs. Available online: https://www.v7labs.com (accessed on 13 March 2026).
11. Supervisely. Available online: https://supervisely.com (accessed on 13 March 2026).
12. Sekachev, B.; Manovich, N.; Zhiltsov, M.; Zhavoronkov, A.; Kalinin, D.; Hoff, B.; TOsmanov; Krber, M.; Deez, N.; Krehel, J.; et al. CVAT. 2020. Available online: https://github.com/opencv/cvat (accessed on 13 March 2026).
13. Tkachenko, M.; Malyuk, M.; Holmanyuk, A.; Liubimov, N. Label Studio: Data Labeling Software. 2020. Available online: https://github.com/heartexlabs/label-studio (accessed on 13 March 2026).
14. Tzutalin. LabelImg. 2015. Available online: https://github.com/tzutalin/labelImg (accessed on 13 March 2026).
15. Russell, B.C.; Torralba, A.; Murphy, K.P.; Freeman, W.T. LabelMe: A Database and Web-Based Tool for Image Annotation. *Int. J. Comput. Vis.* **2008**, *77*, 157–173.
16. Makesense.ai. Available online: https://www.makesense.ai (accessed on 13 March 2026).
17. The Open Group. The Single UNIX Specification, Version 4: rename. Available online: https://pubs.opengroup.org/onlinepubs/9699919799/functions/rename.html (accessed on 13 March 2026).
18. Ronneberger, O.; Fischer, P.; Brox, T. U-Net: Convolutional Networks for Biomedical Image Segmentation. In *Medical Image Computing and Computer-Assisted Intervention (MICCAI)*; Munich, Germany, 2015; pp. 234–241.
19. Chen, L.-C.; Papandreou, G.; Kokkinos, I.; Murphy, K.; Yuille, A.L. DeepLab: Semantic Image Segmentation with Deep Convolutional Nets, Atrous Convolution, and Fully Connected CRFs. *IEEE Trans. Pattern Anal. Mach. Intell.* **2018**, *40*, 834–848.
20. Lugaresi, C.; Tang, J.; Nash, H.; McClanahan, C.; Uboweja, E.; Hays, M.; Zhang, F.; Chang, C.-L.; Yong, M.G.; Lee, J.; et al. MediaPipe: A Framework for Building Perception Pipelines. *arXiv* **2019**, arXiv:1906.08172.
21. QuantStack. micromamba. Available online: https://github.com/mamba-org/mamba (accessed on 13 March 2026).
22. ONNX Runtime. Available online: https://onnxruntime.ai (accessed on 13 March 2026).
23. Settles, B. Active Learning Literature Survey. *Computer Sciences Technical Report 1648*; University of Wisconsin–Madison: Madison, WI, USA, 2009.
24. n0 Computer. iroh: Efficient QUIC-based Data Transfer. Available online: https://iroh.computer (accessed on 13 March 2026).
25. Iyengar, J.; Thomson, M. QUIC: A UDP-Based Multiplexed and Secure Transport. *RFC 9000*; IETF: 2021.
26. Lin, T.-Y.; Maire, M.; Belongie, S.; Hays, J.; Perona, P.; Ramanan, D.; Dollár, P.; Zitnick, C.L. Microsoft COCO: Common Objects in Context. In *European Conference on Computer Vision (ECCV)*; 2014.
27. Everingham, M.; Van Gool, L.; Williams, C.K.I.; Winn, J.; Zisserman, A. The Pascal Visual Object Classes (VOC) Challenge. *Int. J. Comput. Vis.* **2010**, *88*, 303–338.
28. Ravi, N.; Gabeur, V.; Hu, Y.-T.; Hu, R.; Ryali, C.; Ma, T.; Khedr, H.; Rädle, R.; Rolber, C.; Gustafson, L.; et al. SAM 2: Segment Anything in Images and Videos. *arXiv* **2024**, arXiv:2408.00714.
29. Liu, S.; Zeng, Z.; Ren, T.; Li, F.; Zhang, H.; Yang, J.; Li, C.; Yang, J.; Su, H.; Zhu, J.; et al. Grounding DINO: Marrying DINO with Grounded Pre-Training for Open-Set Object Detection. *arXiv* **2023**, arXiv:2303.05499.

---

**Author Contributions:** [A completar según directrices MDPI — e.g., Conceptualization, N.X.; Methodology, N.X.; Software, N.X.; Writing—Original Draft Preparation, N.X.]

**Funding:** [Declarar fuentes de financiamiento o "This research received no external funding."]

**Institutional Review Board Statement:** Not applicable.

**Informed Consent Statement:** Not applicable.

**Data Availability Statement:** The source code of Annotix is openly available at https://github.com/tecmedhub/annotix under the MIT license.

**Conflicts of Interest:** The authors declare no conflict of interest.
