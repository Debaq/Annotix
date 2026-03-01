use super::{BackendInfo, BackendModelInfo, DatasetFormat};

/// Maps project type to training task
fn project_type_to_task(project_type: &str) -> &str {
    match project_type {
        "bbox" | "object-detection" => "detect",
        "instance-segmentation" | "polygon" => "segment",
        "classification" => "classify",
        "keypoints" => "pose",
        "obb" => "obb",
        _ => "detect",
    }
}

/// Returns available backends filtered by project type
pub fn get_available_backends(project_type: &str) -> Vec<BackendInfo> {
    let task = project_type_to_task(project_type);
    let mut backends = Vec::new();

    // YOLO — all tasks
    backends.push(build_yolo_backend(task));

    // RT-DETR — detect only
    if task == "detect" {
        backends.push(build_rtdetr_backend());
    }

    // RF-DETR — detect + segment (preview)
    if task == "detect" || task == "segment" {
        backends.push(build_rfdetr_backend(task));
    }

    // MMDetection — detect only
    if task == "detect" {
        backends.push(build_mmdet_backend());
    }

    backends
}

fn build_yolo_backend(task: &str) -> BackendInfo {
    let all_models = vec![
        BackendModelInfo {
            id: "yolo26".into(),
            name: "YOLO26".into(),
            family: "yolo".into(),
            description: "Latest YOLO architecture with improved accuracy".into(),
            params_count: None,
            tasks: vec!["detect".into(), "segment".into(), "classify".into(), "pose".into(), "obb".into()],
            sizes: Some(vec!["n".into(), "s".into(), "m".into(), "l".into(), "x".into()]),
            recommended: true,
        },
        BackendModelInfo {
            id: "yolo12".into(),
            name: "YOLO12".into(),
            family: "yolo".into(),
            description: "Attention-based YOLO architecture".into(),
            params_count: None,
            tasks: vec!["detect".into(), "segment".into(), "classify".into()],
            sizes: Some(vec!["n".into(), "s".into(), "m".into(), "l".into(), "x".into()]),
            recommended: false,
        },
        BackendModelInfo {
            id: "yolo11".into(),
            name: "YOLO11".into(),
            family: "yolo".into(),
            description: "Robust and battle-tested YOLO model".into(),
            params_count: None,
            tasks: vec!["detect".into(), "segment".into(), "classify".into(), "pose".into(), "obb".into()],
            sizes: Some(vec!["n".into(), "s".into(), "m".into(), "l".into(), "x".into()]),
            recommended: false,
        },
        BackendModelInfo {
            id: "yolov10".into(),
            name: "YOLOv10".into(),
            family: "yolo".into(),
            description: "NMS-free YOLO for real-time detection".into(),
            params_count: None,
            tasks: vec!["detect".into()],
            sizes: Some(vec!["n".into(), "s".into(), "m".into(), "l".into(), "x".into()]),
            recommended: false,
        },
        BackendModelInfo {
            id: "yolov9".into(),
            name: "YOLOv9".into(),
            family: "yolo".into(),
            description: "Programmable gradient information architecture".into(),
            params_count: None,
            tasks: vec!["detect".into(), "segment".into()],
            sizes: Some(vec!["t".into(), "s".into(), "m".into(), "c".into(), "e".into()]),
            recommended: false,
        },
        BackendModelInfo {
            id: "yolov8".into(),
            name: "YOLOv8".into(),
            family: "yolo".into(),
            description: "Widely adopted YOLO version".into(),
            params_count: None,
            tasks: vec!["detect".into(), "segment".into(), "classify".into(), "pose".into(), "obb".into()],
            sizes: Some(vec!["n".into(), "s".into(), "m".into(), "l".into(), "x".into()]),
            recommended: false,
        },
        BackendModelInfo {
            id: "yolov5".into(),
            name: "YOLOv5u".into(),
            family: "yolo".into(),
            description: "Classic YOLO with anchor-free head".into(),
            params_count: None,
            tasks: vec!["detect".into(), "segment".into(), "classify".into()],
            sizes: Some(vec!["n".into(), "s".into(), "m".into(), "l".into(), "x".into()]),
            recommended: false,
        },
    ];

    let models: Vec<BackendModelInfo> = all_models
        .into_iter()
        .filter(|m| m.tasks.contains(&task.to_string()))
        .collect();

    BackendInfo {
        id: "yolo".into(),
        name: "YOLO".into(),
        description: "Ultralytics YOLO family — fast, accurate, versatile".into(),
        supported_tasks: vec!["detect".into(), "segment".into(), "classify".into(), "pose".into(), "obb".into()],
        models,
        dataset_format: DatasetFormat::YoloTxt,
        pip_packages: vec!["ultralytics".into()],
    }
}

fn build_rtdetr_backend() -> BackendInfo {
    let models = vec![
        BackendModelInfo {
            id: "rtdetr-l".into(),
            name: "RT-DETR-L".into(),
            family: "rtdetr".into(),
            description: "Real-Time DETR Large — ResNet-50 backbone".into(),
            params_count: Some("32M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "rtdetr-x".into(),
            name: "RT-DETR-X".into(),
            family: "rtdetr".into(),
            description: "Real-Time DETR Extra Large — ResNet-101 backbone".into(),
            params_count: Some("67M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "rtdetrv2-s".into(),
            name: "RT-DETRv2-S".into(),
            family: "rtdetrv2".into(),
            description: "RT-DETRv2 Small — improved decoder".into(),
            params_count: Some("20M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "rtdetrv2-m".into(),
            name: "RT-DETRv2-M".into(),
            family: "rtdetrv2".into(),
            description: "RT-DETRv2 Medium".into(),
            params_count: Some("36M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "rtdetrv2-l".into(),
            name: "RT-DETRv2-L".into(),
            family: "rtdetrv2".into(),
            description: "RT-DETRv2 Large".into(),
            params_count: Some("42M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "rtdetrv2-x".into(),
            name: "RT-DETRv2-X".into(),
            family: "rtdetrv2".into(),
            description: "RT-DETRv2 Extra Large".into(),
            params_count: Some("76M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "rt_detr".into(),
        name: "RT-DETR".into(),
        description: "Real-Time Detection Transformer — end-to-end, no NMS needed".into(),
        supported_tasks: vec!["detect".into()],
        models,
        dataset_format: DatasetFormat::YoloTxt,
        pip_packages: vec!["ultralytics".into()],
    }
}

fn build_rfdetr_backend(task: &str) -> BackendInfo {
    let mut models = vec![
        BackendModelInfo {
            id: "RFDETRNano".into(),
            name: "RF-DETR Nano".into(),
            family: "rfdetr".into(),
            description: "Ultra-lightweight — ideal for edge devices".into(),
            params_count: Some("2.4M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "RFDETRSmall".into(),
            name: "RF-DETR Small".into(),
            family: "rfdetr".into(),
            description: "Compact model with strong accuracy".into(),
            params_count: Some("8.3M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "RFDETRMedium".into(),
            name: "RF-DETR Medium".into(),
            family: "rfdetr".into(),
            description: "Balanced speed and accuracy".into(),
            params_count: Some("22M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "RFDETRBase".into(),
            name: "RF-DETR Base".into(),
            family: "rfdetr".into(),
            description: "Standard model — best accuracy/speed trade-off".into(),
            params_count: Some("29M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "RFDETRLarge".into(),
            name: "RF-DETR Large".into(),
            family: "rfdetr".into(),
            description: "Maximum accuracy for detection tasks".into(),
            params_count: Some("128M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
    ];

    if task == "segment" {
        models.push(BackendModelInfo {
            id: "RFDETRBaseSeg".into(),
            name: "RF-DETR Base Seg (preview)".into(),
            family: "rfdetr".into(),
            description: "Instance segmentation — preview release".into(),
            params_count: Some("31M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        });
    }

    let models: Vec<BackendModelInfo> = models
        .into_iter()
        .filter(|m| m.tasks.contains(&task.to_string()))
        .collect();

    BackendInfo {
        id: "rf_detr".into(),
        name: "RF-DETR".into(),
        description: "Roboflow Detection Transformer — SOTA on COCO with few-shot".into(),
        supported_tasks: vec!["detect".into(), "segment".into()],
        models,
        dataset_format: DatasetFormat::CocoJson,
        pip_packages: vec!["rfdetr".into()],
    }
}

fn build_mmdet_backend() -> BackendInfo {
    let models = vec![
        // Two-stage
        BackendModelInfo {
            id: "faster-rcnn_r50_fpn".into(),
            name: "Faster R-CNN".into(),
            family: "two-stage".into(),
            description: "Classic two-stage detector with ResNet-50 + FPN".into(),
            params_count: Some("41M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "cascade-rcnn_r50_fpn".into(),
            name: "Cascade R-CNN".into(),
            family: "two-stage".into(),
            description: "Multi-stage R-CNN with cascaded refinement".into(),
            params_count: Some("69M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
        // One-stage
        BackendModelInfo {
            id: "retinanet_r50_fpn".into(),
            name: "RetinaNet".into(),
            family: "one-stage".into(),
            description: "One-stage detector with focal loss".into(),
            params_count: Some("37M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "fcos_r50_fpn".into(),
            name: "FCOS".into(),
            family: "one-stage".into(),
            description: "Anchor-free fully convolutional detector".into(),
            params_count: Some("32M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "rtmdet_l".into(),
            name: "RTMDet-L".into(),
            family: "one-stage".into(),
            description: "Real-time modern detector — high throughput".into(),
            params_count: Some("52M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: true,
        },
        // Transformer
        BackendModelInfo {
            id: "detr_r50".into(),
            name: "DETR".into(),
            family: "transformer".into(),
            description: "End-to-end detection transformer".into(),
            params_count: Some("41M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "deformable-detr_r50".into(),
            name: "Deformable DETR".into(),
            family: "transformer".into(),
            description: "DETR with deformable attention — faster convergence".into(),
            params_count: Some("40M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "dino-4scale_r50".into(),
            name: "DINO".into(),
            family: "transformer".into(),
            description: "DETR with improved denoising — SOTA transformer detector".into(),
            params_count: Some("47M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "co_detr_r50".into(),
            name: "Co-DETR".into(),
            family: "transformer".into(),
            description: "Collaborative DETR with auxiliary heads".into(),
            params_count: Some("56M".into()),
            tasks: vec!["detect".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "mmdetection".into(),
        name: "MMDetection".into(),
        description: "OpenMMLab detection toolbox — wide model variety".into(),
        supported_tasks: vec!["detect".into()],
        models,
        dataset_format: DatasetFormat::CocoJson,
        pip_packages: vec!["openmim".into(), "mmengine".into(), "mmcv".into(), "mmdet".into()],
    }
}
