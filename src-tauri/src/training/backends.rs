use super::{BackendInfo, BackendModelInfo, DatasetFormat};

/// Maps project type to training task
fn project_type_to_task(project_type: &str) -> &str {
    match project_type {
        "bbox" | "object-detection" => "detect",
        "mask" | "semantic-segmentation" => "segment",
        "instance-segmentation" | "polygon" => "instance_segment",
        "classification" => "classify",
        "multi-label-classification" => "multi_classify",
        "keypoints" => "pose",
        "landmarks" => "landmarks",
        "obb" => "obb",
        "timeseries-classification" => "ts_classify",
        "timeseries-forecasting" => "ts_forecast",
        "anomaly-detection" => "ts_anomaly",
        "timeseries-segmentation" => "ts_segment",
        "pattern-recognition" => "ts_pattern",
        "event-detection" => "ts_event",
        "timeseries-regression" => "ts_regress",
        "clustering" => "ts_cluster",
        "imputation" => "ts_impute",
        _ => "detect",
    }
}

/// Returns available backends filtered by project type
pub fn get_available_backends(project_type: &str) -> Vec<BackendInfo> {
    let task = project_type_to_task(project_type);
    let mut backends = Vec::new();

    match task {
        "detect" => {
            backends.push(build_yolo_backend(task));
            backends.push(build_rtdetr_backend());
            backends.push(build_rfdetr_backend(task));
            backends.push(build_mmdet_backend());
        }
        "segment" => {
            backends.push(build_yolo_backend(task));
            backends.push(build_rfdetr_backend(task));
            backends.push(build_smp_backend());
            backends.push(build_hf_seg_backend());
            backends.push(build_mmseg_backend());
        }
        "instance_segment" => {
            backends.push(build_yolo_backend("segment"));
            backends.push(build_detectron2_backend());
            backends.push(build_mmdet_instance_backend());
        }
        "classify" => {
            backends.push(build_yolo_backend(task));
            backends.push(build_timm_backend(task));
            backends.push(build_hf_classification_backend(task));
        }
        "multi_classify" => {
            backends.push(build_timm_backend(task));
            backends.push(build_hf_classification_backend(task));
        }
        "pose" => {
            backends.push(build_yolo_backend(task));
            backends.push(build_mmpose_backend());
        }
        "landmarks" => {
            backends.push(build_mmpose_backend());
        }
        "obb" => {
            backends.push(build_yolo_backend(task));
            backends.push(build_mmrotate_backend());
        }
        "ts_classify" | "ts_forecast" | "ts_regress" | "ts_segment" | "ts_event" => {
            backends.push(build_tsai_backend(task));
            if task == "ts_forecast" {
                backends.push(build_pytorch_forecasting_backend());
            }
        }
        "ts_anomaly" => {
            backends.push(build_tsai_backend(task));
            backends.push(build_pyod_backend());
        }
        "ts_cluster" => {
            backends.push(build_tslearn_backend());
        }
        "ts_impute" => {
            backends.push(build_pypots_backend());
        }
        "ts_pattern" => {
            backends.push(build_stumpy_backend());
        }
        _ => {
            backends.push(build_yolo_backend("detect"));
        }
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

// ─── Semantic Segmentation Backends ──────────────────────────────────────────

fn build_smp_backend() -> BackendInfo {
    let models = vec![
        BackendModelInfo {
            id: "Unet-resnet34".into(),
            name: "U-Net (ResNet-34)".into(),
            family: "unet".into(),
            description: "Classic encoder-decoder with skip connections".into(),
            params_count: Some("24M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "UnetPlusPlus-resnet50".into(),
            name: "U-Net++ (ResNet-50)".into(),
            family: "unet".into(),
            description: "Nested U-Net with dense skip connections".into(),
            params_count: Some("32M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "MAnet-resnet34".into(),
            name: "MA-Net (ResNet-34)".into(),
            family: "manet".into(),
            description: "Multi-scale Attention Net — multiple object sizes".into(),
            params_count: Some("22M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "Linknet-resnet34".into(),
            name: "LinkNet (ResNet-34)".into(),
            family: "linknet".into(),
            description: "Lightweight encoder-decoder with residual connections — real-time".into(),
            params_count: Some("11M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "FPN-resnet34".into(),
            name: "FPN (ResNet-34)".into(),
            family: "fpn".into(),
            description: "Feature Pyramid Network for multi-scale segmentation".into(),
            params_count: Some("22M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "PSPNet-resnet50".into(),
            name: "PSPNet (ResNet-50)".into(),
            family: "pspnet".into(),
            description: "Pyramid Scene Parsing — complex scenes".into(),
            params_count: Some("47M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "PAN-resnet34".into(),
            name: "PAN (ResNet-34)".into(),
            family: "pan".into(),
            description: "Pyramid Attention Network — speed/accuracy balance".into(),
            params_count: Some("24M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "DeepLabV3-resnet50".into(),
            name: "DeepLabV3 (ResNet-50)".into(),
            family: "deeplab".into(),
            description: "Atrous convolutions + ASPP — SOTA CNN".into(),
            params_count: Some("40M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "DeepLabV3Plus-resnet50".into(),
            name: "DeepLabV3+ (ResNet-50)".into(),
            family: "deeplab".into(),
            description: "DeepLabV3 with improved decoder module".into(),
            params_count: Some("40M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "Segformer-mit_b2".into(),
            name: "SegFormer (MiT-B2)".into(),
            family: "segformer".into(),
            description: "Transformer encoder + MLP decoder — SOTA transformer".into(),
            params_count: Some("25M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "DPT-resnet50".into(),
            name: "DPT (ResNet-50)".into(),
            family: "dpt".into(),
            description: "Dense Prediction Transformer — dense segmentation".into(),
            params_count: Some("40M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "UPerNet-resnet50".into(),
            name: "UPerNet (ResNet-50)".into(),
            family: "upernet".into(),
            description: "Unified Perceptual Parsing Network — complex scenes".into(),
            params_count: Some("66M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "smp".into(),
        name: "SMP".into(),
        description: "Segmentation Models PyTorch — multiple architectures with pretrained encoders".into(),
        supported_tasks: vec!["segment".into()],
        models,
        dataset_format: DatasetFormat::MaskPng,
        pip_packages: vec!["segmentation-models-pytorch".into(), "torch".into(), "torchvision".into(), "albumentations".into()],
    }
}

fn build_hf_seg_backend() -> BackendInfo {
    let models = vec![
        // ── SegFormer family (B0–B5) ──
        BackendModelInfo {
            id: "nvidia/mit-b0".into(),
            name: "SegFormer-B0".into(),
            family: "segformer".into(),
            description: "Lightweight SegFormer — fast, ideal for edge".into(),
            params_count: Some("3.7M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "nvidia/mit-b1".into(),
            name: "SegFormer-B1".into(),
            family: "segformer".into(),
            description: "SegFormer — good balance of speed and accuracy".into(),
            params_count: Some("14M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "nvidia/mit-b2".into(),
            name: "SegFormer-B2".into(),
            family: "segformer".into(),
            description: "Mid-size SegFormer — recommended balance".into(),
            params_count: Some("25M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "nvidia/mit-b3".into(),
            name: "SegFormer-B3".into(),
            family: "segformer".into(),
            description: "SegFormer — high accuracy variant".into(),
            params_count: Some("47M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "nvidia/mit-b4".into(),
            name: "SegFormer-B4".into(),
            family: "segformer".into(),
            description: "SegFormer — high accuracy, slower inference".into(),
            params_count: Some("64M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "nvidia/mit-b5".into(),
            name: "SegFormer-B5".into(),
            family: "segformer".into(),
            description: "Largest SegFormer — maximum accuracy".into(),
            params_count: Some("82M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        // ── Mask-based models ──
        BackendModelInfo {
            id: "facebook/mask2former-swin-large-cityscapes-semantic".into(),
            name: "Mask2Former (Swin-L)".into(),
            family: "mask2former".into(),
            description: "SOTA universal segmentation — panoptic capable".into(),
            params_count: Some("200M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "facebook/maskformer-swin-base-ade".into(),
            name: "MaskFormer (Swin-B)".into(),
            family: "maskformer".into(),
            description: "Per-pixel classification via mask prediction".into(),
            params_count: Some("102M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        // ── Dense prediction ──
        BackendModelInfo {
            id: "Intel/dpt-large".into(),
            name: "DPT (ViT-Large)".into(),
            family: "dpt".into(),
            description: "Dense Prediction Transformer with ViT backbone".into(),
            params_count: Some("343M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "microsoft/beit-large-finetuned-ade-640-640".into(),
            name: "BEiT (Large)".into(),
            family: "beit".into(),
            description: "BERT-style pretrained ViT — high accuracy".into(),
            params_count: Some("305M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "openmmlab/upernet-swin-large".into(),
            name: "UPerNet (Swin-L)".into(),
            family: "upernet".into(),
            description: "Unified Perceptual Parsing — flexible backbone".into(),
            params_count: Some("234M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "apple/deeplabv3-mobilevit-small".into(),
            name: "MobileViT DeepLabV3".into(),
            family: "mobilevit".into(),
            description: "Mobile-optimized vision transformer for edge deployment".into(),
            params_count: Some("6.4M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "hf_segmentation".into(),
        name: "HuggingFace Seg".into(),
        description: "HuggingFace Transformers — pretrained SegFormer, Mask2Former, DPT and more".into(),
        supported_tasks: vec!["segment".into()],
        models,
        dataset_format: DatasetFormat::MaskPng,
        pip_packages: vec!["transformers".into(), "datasets".into(), "evaluate".into(), "torch".into(), "torchvision".into()],
    }
}

fn build_mmseg_backend() -> BackendInfo {
    let models = vec![
        // ── CNN clásicos ──
        BackendModelInfo {
            id: "fcn_r50-d8".into(),
            name: "FCN (R50)".into(),
            family: "fcn".into(),
            description: "Fully Convolutional Network — baseline model".into(),
            params_count: Some("49M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "pspnet_r50-d8".into(),
            name: "PSPNet (R50)".into(),
            family: "pspnet".into(),
            description: "Pyramid Scene Parsing Network with ResNet-50".into(),
            params_count: Some("49M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "deeplabv3_r50-d8".into(),
            name: "DeepLabV3 (R50)".into(),
            family: "deeplab".into(),
            description: "Atrous spatial pyramid pooling — no decoder".into(),
            params_count: Some("58M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "deeplabv3plus_r50-d8".into(),
            name: "DeepLabV3+ (R50)".into(),
            family: "deeplab".into(),
            description: "Atrous spatial pyramid pooling with decoder".into(),
            params_count: Some("44M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "unet_s5-d16".into(),
            name: "UNet (S5-D16)".into(),
            family: "unet".into(),
            description: "Encoder-decoder with skip connections — medical/general".into(),
            params_count: Some("29M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "upernet_r50".into(),
            name: "UPerNet (R50)".into(),
            family: "upernet".into(),
            description: "Unified Perceptual Parsing with FPN".into(),
            params_count: Some("66M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "ocrnet_hr48".into(),
            name: "OCRNet (HR48)".into(),
            family: "ocrnet".into(),
            description: "Object-Contextual Representations with HRNet".into(),
            params_count: Some("70M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "pointrend_r50".into(),
            name: "PointRend (R50)".into(),
            family: "pointrend".into(),
            description: "Point-based refinement for sharp boundaries".into(),
            params_count: Some("38M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        // ── Ligeros / tiempo real ──
        BackendModelInfo {
            id: "bisenetv1".into(),
            name: "BiSeNetV1".into(),
            family: "bisenet".into(),
            description: "Bilateral segmentation — two-branch real-time".into(),
            params_count: Some("13M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "bisenetv2".into(),
            name: "BiSeNetV2".into(),
            family: "bisenet".into(),
            description: "Bilateral segmentation v2 — faster inference".into(),
            params_count: Some("3.4M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "stdc1".into(),
            name: "STDC1".into(),
            family: "stdc".into(),
            description: "Short-Term Dense Concatenate — very fast".into(),
            params_count: Some("8M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "stdc2".into(),
            name: "STDC2".into(),
            family: "stdc".into(),
            description: "Short-Term Dense Concatenate — larger variant".into(),
            params_count: Some("12M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "fast_scnn".into(),
            name: "Fast-SCNN".into(),
            family: "fast_scnn".into(),
            description: "Ultra lightweight — fast semantic segmentation".into(),
            params_count: Some("1.1M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "cgnet".into(),
            name: "CGNet".into(),
            family: "cgnet".into(),
            description: "Context Guided Network — lightweight".into(),
            params_count: Some("0.5M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "erfnet".into(),
            name: "ERFNet".into(),
            family: "erfnet".into(),
            description: "Efficient Residual Factorized — fast and accurate".into(),
            params_count: Some("2.1M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "pidnet-s".into(),
            name: "PIDNet-S".into(),
            family: "pidnet".into(),
            description: "PID controller inspired — good speed/accuracy balance".into(),
            params_count: Some("7.6M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "pidnet-m".into(),
            name: "PIDNet-M".into(),
            family: "pidnet".into(),
            description: "PIDNet medium — higher accuracy".into(),
            params_count: Some("28M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "pidnet-l".into(),
            name: "PIDNet-L".into(),
            family: "pidnet".into(),
            description: "PIDNet large — best accuracy in family".into(),
            params_count: Some("37M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "icnet".into(),
            name: "ICNet".into(),
            family: "icnet".into(),
            description: "Image Cascade Network — multi-resolution fast".into(),
            params_count: Some("7M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "ddrnet".into(),
            name: "DDRNet".into(),
            family: "ddrnet".into(),
            description: "Dual-resolution — fast with high accuracy".into(),
            params_count: Some("20M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        // ── Transformer (SOTA) ──
        BackendModelInfo {
            id: "segformer_mit-b0".into(),
            name: "SegFormer (MiT-B0)".into(),
            family: "segformer".into(),
            description: "Efficient transformer — lightweight variant".into(),
            params_count: Some("3.8M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "segformer_mit-b2".into(),
            name: "SegFormer (MiT-B2)".into(),
            family: "segformer".into(),
            description: "Efficient transformer — balanced speed/accuracy".into(),
            params_count: Some("25M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "segformer_mit-b5".into(),
            name: "SegFormer (MiT-B5)".into(),
            family: "segformer".into(),
            description: "Efficient transformer — highest accuracy variant".into(),
            params_count: Some("84M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "segmenter_vit-b".into(),
            name: "Segmenter (ViT-B)".into(),
            family: "segmenter".into(),
            description: "Pure ViT segmenter — mask transformer decoder".into(),
            params_count: Some("86M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "setr_vit-l".into(),
            name: "SETR (ViT-L)".into(),
            family: "setr".into(),
            description: "Serialized Transformer — treats segmentation as sequence".into(),
            params_count: Some("308M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "dpt_vit-b16".into(),
            name: "DPT (ViT-B16)".into(),
            family: "dpt".into(),
            description: "Dense Prediction Transformer — multi-scale features".into(),
            params_count: Some("86M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "mask2former_swin-l".into(),
            name: "Mask2Former (Swin-L)".into(),
            family: "mask2former".into(),
            description: "SOTA universal segmentation — highest accuracy".into(),
            params_count: Some("216M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "maskformer_swin-b".into(),
            name: "MaskFormer (Swin-B)".into(),
            family: "maskformer".into(),
            description: "Per-pixel classification via mask prediction".into(),
            params_count: Some("102M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "knet_swin-l".into(),
            name: "K-Net (Swin-L)".into(),
            family: "knet".into(),
            description: "Kernel-based segmentation — dynamic kernels".into(),
            params_count: Some("200M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "san_vit-l".into(),
            name: "SAN (ViT-L)".into(),
            family: "san".into(),
            description: "Side Adapter Network — adapts CLIP for segmentation".into(),
            params_count: Some("300M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "segnext_large".into(),
            name: "SegNeXt (Large)".into(),
            family: "segnext".into(),
            description: "Efficient convolutional attention — good accuracy/speed".into(),
            params_count: Some("49M".into()),
            tasks: vec!["segment".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "mmsegmentation".into(),
        name: "MMSegmentation".into(),
        description: "OpenMMLab semantic segmentation toolbox — wide model variety".into(),
        supported_tasks: vec!["segment".into()],
        models,
        dataset_format: DatasetFormat::MaskPng,
        pip_packages: vec!["openmim".into(), "mmengine".into(), "mmcv".into(), "mmsegmentation".into()],
    }
}

// ─── Detectron2 (Instance Segmentation / Polygon) ───────────────────────────

fn build_detectron2_backend() -> BackendInfo {
    let models = vec![
        BackendModelInfo {
            id: "mask_rcnn_R_50_FPN_3x".into(),
            name: "Mask R-CNN R50".into(),
            family: "mask-rcnn".into(),
            description: "Standard Mask R-CNN with ResNet-50 FPN".into(),
            params_count: Some("44M".into()),
            tasks: vec!["instance_segment".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "mask_rcnn_R_101_FPN_3x".into(),
            name: "Mask R-CNN R101".into(),
            family: "mask-rcnn".into(),
            description: "Mask R-CNN with deeper ResNet-101 backbone".into(),
            params_count: Some("63M".into()),
            tasks: vec!["instance_segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "cascade_mask_rcnn_R_50_FPN_3x".into(),
            name: "Cascade Mask R-CNN".into(),
            family: "cascade".into(),
            description: "Multi-stage cascaded Mask R-CNN".into(),
            params_count: Some("77M".into()),
            tasks: vec!["instance_segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "mask2former_swin_L_IN21k".into(),
            name: "Mask2Former Swin-L".into(),
            family: "mask2former".into(),
            description: "SOTA universal instance segmentation".into(),
            params_count: Some("216M".into()),
            tasks: vec!["instance_segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "pointrend_R_50_FPN_3x".into(),
            name: "PointRend R50".into(),
            family: "pointrend".into(),
            description: "Point-based refinement for sharp mask boundaries".into(),
            params_count: Some("45M".into()),
            tasks: vec!["instance_segment".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "detectron2".into(),
        name: "Detectron2".into(),
        description: "Facebook AI instance segmentation — Mask R-CNN, Mask2Former, PointRend".into(),
        supported_tasks: vec!["instance_segment".into()],
        models,
        dataset_format: DatasetFormat::CocoInstanceJson,
        pip_packages: vec!["detectron2".into()],
    }
}

// ─── MMDetection Instance Seg ────────────────────────────────────────────────

fn build_mmdet_instance_backend() -> BackendInfo {
    let models = vec![
        BackendModelInfo {
            id: "mask-rcnn_r50_fpn_ins".into(),
            name: "Mask R-CNN (R50)".into(),
            family: "mask-rcnn".into(),
            description: "Classic instance segmentation with ResNet-50".into(),
            params_count: Some("44M".into()),
            tasks: vec!["instance_segment".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "cascade-mask-rcnn_r50_fpn_ins".into(),
            name: "Cascade Mask R-CNN".into(),
            family: "cascade".into(),
            description: "Multi-stage cascaded instance segmentation".into(),
            params_count: Some("77M".into()),
            tasks: vec!["instance_segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "solov2_r50_fpn".into(),
            name: "SOLOv2 (R50)".into(),
            family: "solo".into(),
            description: "Segmenting objects by locations — direct mask prediction".into(),
            params_count: Some("46M".into()),
            tasks: vec!["instance_segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "mask2former_swin-l_ins".into(),
            name: "Mask2Former (Swin-L)".into(),
            family: "mask2former".into(),
            description: "SOTA universal instance segmentation via MMDet".into(),
            params_count: Some("216M".into()),
            tasks: vec!["instance_segment".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "htc_r50_fpn".into(),
            name: "HTC (R50)".into(),
            family: "htc".into(),
            description: "Hybrid Task Cascade — progressive refinement".into(),
            params_count: Some("76M".into()),
            tasks: vec!["instance_segment".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "mmdetection".into(),
        name: "MMDetection".into(),
        description: "OpenMMLab instance segmentation — Mask R-CNN, SOLOv2, Mask2Former, HTC".into(),
        supported_tasks: vec!["instance_segment".into()],
        models,
        dataset_format: DatasetFormat::CocoInstanceJson,
        pip_packages: vec!["openmim".into(), "mmengine".into(), "mmcv".into(), "mmdet".into()],
    }
}

// ─── MMPose (Keypoints + Landmarks) ──────────────────────────────────────────

fn build_mmpose_backend() -> BackendInfo {
    let models = vec![
        BackendModelInfo {
            id: "rtmpose-t".into(),
            name: "RTMPose-T".into(),
            family: "rtmpose".into(),
            description: "Real-time pose — tiny variant, fastest".into(),
            params_count: Some("3.3M".into()),
            tasks: vec!["pose".into(), "landmarks".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "rtmpose-s".into(),
            name: "RTMPose-S".into(),
            family: "rtmpose".into(),
            description: "Real-time pose — small, good balance".into(),
            params_count: Some("5.5M".into()),
            tasks: vec!["pose".into(), "landmarks".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "rtmpose-m".into(),
            name: "RTMPose-M".into(),
            family: "rtmpose".into(),
            description: "Real-time pose — medium, higher accuracy".into(),
            params_count: Some("13M".into()),
            tasks: vec!["pose".into(), "landmarks".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "rtmpose-l".into(),
            name: "RTMPose-L".into(),
            family: "rtmpose".into(),
            description: "Real-time pose — large, best RTMPose accuracy".into(),
            params_count: Some("28M".into()),
            tasks: vec!["pose".into(), "landmarks".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "hrnet-w32".into(),
            name: "HRNet-W32".into(),
            family: "hrnet".into(),
            description: "High-Resolution Network — multi-scale features".into(),
            params_count: Some("29M".into()),
            tasks: vec!["pose".into(), "landmarks".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "hrnet-w48".into(),
            name: "HRNet-W48".into(),
            family: "hrnet".into(),
            description: "HRNet wider variant — higher accuracy".into(),
            params_count: Some("64M".into()),
            tasks: vec!["pose".into(), "landmarks".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "vitpose-b".into(),
            name: "ViTPose-B".into(),
            family: "vitpose".into(),
            description: "Vision Transformer for pose — base variant".into(),
            params_count: Some("86M".into()),
            tasks: vec!["pose".into(), "landmarks".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "vitpose-l".into(),
            name: "ViTPose-L".into(),
            family: "vitpose".into(),
            description: "ViTPose large — maximum accuracy".into(),
            params_count: Some("307M".into()),
            tasks: vec!["pose".into(), "landmarks".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "simplebaseline-r50".into(),
            name: "SimpleBaseline R50".into(),
            family: "simplebaseline".into(),
            description: "Simple deconv baseline with ResNet-50".into(),
            params_count: Some("34M".into()),
            tasks: vec!["pose".into(), "landmarks".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "litehrnet-30".into(),
            name: "LiteHRNet-30".into(),
            family: "litehrnet".into(),
            description: "Lightweight HRNet — mobile-friendly".into(),
            params_count: Some("1.8M".into()),
            tasks: vec!["pose".into(), "landmarks".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "mmpose".into(),
        name: "MMPose".into(),
        description: "OpenMMLab pose estimation — RTMPose, HRNet, ViTPose and more".into(),
        supported_tasks: vec!["pose".into(), "landmarks".into()],
        models,
        dataset_format: DatasetFormat::CocoKeypointsJson,
        pip_packages: vec!["openmim".into(), "mmengine".into(), "mmcv".into(), "mmpose".into(), "mmdet".into()],
    }
}

// ─── MMRotate (OBB) ──────────────────────────────────────────────────────────

fn build_mmrotate_backend() -> BackendInfo {
    let models = vec![
        BackendModelInfo {
            id: "oriented-rcnn_r50_fpn".into(),
            name: "Oriented R-CNN".into(),
            family: "oriented-rcnn".into(),
            description: "Two-stage oriented detector with midpoint offset".into(),
            params_count: Some("41M".into()),
            tasks: vec!["obb".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "rotated-faster-rcnn_r50_fpn".into(),
            name: "Rotated Faster R-CNN".into(),
            family: "rotated-rcnn".into(),
            description: "Faster R-CNN adapted for rotated boxes".into(),
            params_count: Some("41M".into()),
            tasks: vec!["obb".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "rotated-retinanet_r50_fpn".into(),
            name: "Rotated RetinaNet".into(),
            family: "rotated-retinanet".into(),
            description: "One-stage rotated detector with focal loss".into(),
            params_count: Some("37M".into()),
            tasks: vec!["obb".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "roi-transformer_r50_fpn".into(),
            name: "RoI Transformer".into(),
            family: "roi-transformer".into(),
            description: "Learns spatial transformation for rotated RoIs".into(),
            params_count: Some("55M".into()),
            tasks: vec!["obb".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "gliding-vertex_r50_fpn".into(),
            name: "Gliding Vertex".into(),
            family: "gliding-vertex".into(),
            description: "Gliding vertex on horizontal bounding boxes".into(),
            params_count: Some("41M".into()),
            tasks: vec!["obb".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "mmrotate".into(),
        name: "MMRotate".into(),
        description: "OpenMMLab rotated object detection — Oriented R-CNN, RoI Transformer".into(),
        supported_tasks: vec!["obb".into()],
        models,
        dataset_format: DatasetFormat::DotaTxt,
        pip_packages: vec!["openmim".into(), "mmengine".into(), "mmcv".into(), "mmrotate".into()],
    }
}

// ─── timm (Classification / Multi-label) ─────────────────────────────────────

fn build_timm_backend(task: &str) -> BackendInfo {
    let tasks = if task == "multi_classify" {
        vec!["multi_classify".into()]
    } else {
        vec!["classify".into(), "multi_classify".into()]
    };

    let models = vec![
        BackendModelInfo {
            id: "mobilenetv3_large_100".into(),
            name: "MobileNetV3-Large".into(),
            family: "mobilenet".into(),
            description: "Mobile-optimized — fast inference".into(),
            params_count: Some("5.5M".into()),
            tasks: tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "efficientnet_b0".into(),
            name: "EfficientNet-B0".into(),
            family: "efficientnet".into(),
            description: "Efficient scaling — lightweight".into(),
            params_count: Some("5.3M".into()),
            tasks: tasks.clone(),
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "efficientnet_b3".into(),
            name: "EfficientNet-B3".into(),
            family: "efficientnet".into(),
            description: "Efficient scaling — balanced accuracy".into(),
            params_count: Some("12M".into()),
            tasks: tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "resnet50".into(),
            name: "ResNet-50".into(),
            family: "resnet".into(),
            description: "Classic residual network — widely used baseline".into(),
            params_count: Some("25M".into()),
            tasks: tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "convnext_tiny".into(),
            name: "ConvNeXt-Tiny".into(),
            family: "convnext".into(),
            description: "Modern pure-CNN — competitive with ViT".into(),
            params_count: Some("28M".into()),
            tasks: tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "vit_base_patch16_224".into(),
            name: "ViT-Base".into(),
            family: "vit".into(),
            description: "Vision Transformer base — strong general accuracy".into(),
            params_count: Some("86M".into()),
            tasks: tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "swin_base_patch4_window7_224".into(),
            name: "Swin-Base".into(),
            family: "swin".into(),
            description: "Shifted Window Transformer — hierarchical features".into(),
            params_count: Some("88M".into()),
            tasks: tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "eva02_large_patch14_448".into(),
            name: "EVA-02-Large".into(),
            family: "eva".into(),
            description: "SOTA vision foundation model — highest accuracy".into(),
            params_count: Some("305M".into()),
            tasks: tasks.clone(),
            sizes: None,
            recommended: false,
        },
    ];

    let filtered: Vec<BackendModelInfo> = models
        .into_iter()
        .filter(|m| m.tasks.contains(&task.to_string()))
        .collect();

    let ds_fmt = if task == "multi_classify" {
        DatasetFormat::MultiLabelCsv
    } else {
        DatasetFormat::ImageFolder
    };

    BackendInfo {
        id: "timm".into(),
        name: "timm".into(),
        description: "PyTorch Image Models — MobileNet, EfficientNet, ViT, Swin, EVA".into(),
        supported_tasks: vec!["classify".into(), "multi_classify".into()],
        models: filtered,
        dataset_format: ds_fmt,
        pip_packages: vec!["timm".into(), "torch".into(), "torchvision".into()],
    }
}

// ─── HuggingFace Classification ──────────────────────────────────────────────

fn build_hf_classification_backend(task: &str) -> BackendInfo {
    let tasks = if task == "multi_classify" {
        vec!["multi_classify".into()]
    } else {
        vec!["classify".into(), "multi_classify".into()]
    };

    let models = vec![
        BackendModelInfo {
            id: "google/vit-base-patch16-224".into(),
            name: "ViT-Base".into(),
            family: "vit".into(),
            description: "Vision Transformer — strong ImageNet baseline".into(),
            params_count: Some("86M".into()),
            tasks: tasks.clone(),
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "google/vit-large-patch16-224".into(),
            name: "ViT-Large".into(),
            family: "vit".into(),
            description: "Vision Transformer large — higher accuracy".into(),
            params_count: Some("307M".into()),
            tasks: tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "facebook/convnext-base-224".into(),
            name: "ConvNeXt-Base".into(),
            family: "convnext".into(),
            description: "Modern CNN competitive with transformers".into(),
            params_count: Some("89M".into()),
            tasks: tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "microsoft/swin-base-patch4-window7-224".into(),
            name: "Swin-Base".into(),
            family: "swin".into(),
            description: "Shifted Window Transformer for classification".into(),
            params_count: Some("88M".into()),
            tasks: tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "facebook/deit-base-distilled-patch16-224".into(),
            name: "DeiT-Base".into(),
            family: "deit".into(),
            description: "Data-efficient Image Transformer with distillation".into(),
            params_count: Some("87M".into()),
            tasks: tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "microsoft/beit-base-patch16-224".into(),
            name: "BEiT-Base".into(),
            family: "beit".into(),
            description: "BERT pre-trained Image Transformer".into(),
            params_count: Some("86M".into()),
            tasks: tasks.clone(),
            sizes: None,
            recommended: false,
        },
    ];

    let filtered: Vec<BackendModelInfo> = models
        .into_iter()
        .filter(|m| m.tasks.contains(&task.to_string()))
        .collect();

    let ds_fmt = if task == "multi_classify" {
        DatasetFormat::MultiLabelCsv
    } else {
        DatasetFormat::ImageFolder
    };

    BackendInfo {
        id: "hf_classification".into(),
        name: "HuggingFace Cls".into(),
        description: "HuggingFace Transformers — ViT, ConvNeXt, Swin, DeiT, BEiT for classification".into(),
        supported_tasks: vec!["classify".into(), "multi_classify".into()],
        models: filtered,
        dataset_format: ds_fmt,
        pip_packages: vec!["transformers".into(), "datasets".into(), "evaluate".into(), "torch".into(), "torchvision".into()],
    }
}

// ─── Time Series Backends ────────────────────────────────────────────────────

fn build_tsai_backend(task: &str) -> BackendInfo {
    let all_tasks = vec![
        "ts_classify".to_string(), "ts_forecast".to_string(), "ts_regress".to_string(),
        "ts_anomaly".to_string(), "ts_segment".to_string(), "ts_event".to_string(),
    ];

    let models = vec![
        BackendModelInfo {
            id: "InceptionTimePlus".into(),
            name: "InceptionTime+".into(),
            family: "inception".into(),
            description: "Inception-based — robust for time series classification".into(),
            params_count: Some("0.5M".into()),
            tasks: all_tasks.clone(),
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "PatchTST".into(),
            name: "PatchTST".into(),
            family: "transformer".into(),
            description: "Patch-based Transformer — strong for forecasting".into(),
            params_count: Some("2M".into()),
            tasks: all_tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "TSTPlus".into(),
            name: "TST+".into(),
            family: "transformer".into(),
            description: "Time Series Transformer — general purpose".into(),
            params_count: Some("1.5M".into()),
            tasks: all_tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "TSiTPlus".into(),
            name: "TSiT+".into(),
            family: "transformer".into(),
            description: "Time Series image Transformer — image-like encoding".into(),
            params_count: Some("3M".into()),
            tasks: all_tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "ROCKET".into(),
            name: "ROCKET".into(),
            family: "rocket".into(),
            description: "Random convolutional kernels — very fast training".into(),
            params_count: None,
            tasks: vec!["ts_classify".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "MiniRocket".into(),
            name: "MiniRocket".into(),
            family: "rocket".into(),
            description: "Deterministic ROCKET variant — faster, near-identical accuracy".into(),
            params_count: None,
            tasks: vec!["ts_classify".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "XceptionTimePlus".into(),
            name: "XceptionTime+".into(),
            family: "xception".into(),
            description: "Xception for time series — depthwise separable convolutions".into(),
            params_count: Some("0.4M".into()),
            tasks: all_tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "ResNetPlus".into(),
            name: "ResNet+".into(),
            family: "resnet".into(),
            description: "ResNet adapted for time series".into(),
            params_count: Some("0.5M".into()),
            tasks: all_tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "LSTMPlus".into(),
            name: "LSTM+".into(),
            family: "rnn".into(),
            description: "LSTM-based — good for sequential patterns".into(),
            params_count: Some("0.3M".into()),
            tasks: all_tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "GRUPlus".into(),
            name: "GRU+".into(),
            family: "rnn".into(),
            description: "GRU-based — lighter than LSTM".into(),
            params_count: Some("0.2M".into()),
            tasks: all_tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "TCN".into(),
            name: "TCN".into(),
            family: "tcn".into(),
            description: "Temporal Convolutional Network — causal convolutions".into(),
            params_count: Some("0.3M".into()),
            tasks: all_tasks.clone(),
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "OmniScaleCNN".into(),
            name: "OmniScaleCNN".into(),
            family: "cnn".into(),
            description: "Multi-scale CNN for time series".into(),
            params_count: Some("0.4M".into()),
            tasks: all_tasks.clone(),
            sizes: None,
            recommended: false,
        },
    ];

    let filtered: Vec<BackendModelInfo> = models
        .into_iter()
        .filter(|m| m.tasks.contains(&task.to_string()))
        .collect();

    BackendInfo {
        id: "tsai".into(),
        name: "tsai".into(),
        description: "Time series AI library — InceptionTime, PatchTST, ROCKET, LSTM and more".into(),
        supported_tasks: vec![
            "ts_classify".into(), "ts_forecast".into(), "ts_regress".into(),
            "ts_anomaly".into(), "ts_segment".into(), "ts_event".into(),
        ],
        models: filtered,
        dataset_format: DatasetFormat::TimeSeriesCsv,
        pip_packages: vec!["tsai".into()],
    }
}

fn build_pytorch_forecasting_backend() -> BackendInfo {
    let models = vec![
        BackendModelInfo {
            id: "tft".into(),
            name: "TFT".into(),
            family: "tft".into(),
            description: "Temporal Fusion Transformer — interpretable multi-horizon forecasting".into(),
            params_count: Some("5M".into()),
            tasks: vec!["ts_forecast".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "nbeats".into(),
            name: "N-BEATS".into(),
            family: "nbeats".into(),
            description: "Neural Basis Expansion — pure DL forecasting".into(),
            params_count: Some("4M".into()),
            tasks: vec!["ts_forecast".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "nhits".into(),
            name: "N-HiTS".into(),
            family: "nhits".into(),
            description: "Neural Hierarchical Interpolation — multi-rate sampling".into(),
            params_count: Some("3M".into()),
            tasks: vec!["ts_forecast".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "deepar".into(),
            name: "DeepAR".into(),
            family: "deepar".into(),
            description: "Probabilistic forecasting with autoregressive RNN".into(),
            params_count: Some("2M".into()),
            tasks: vec!["ts_forecast".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "pytorch_forecasting".into(),
        name: "PyTorch Forecasting".into(),
        description: "Time series forecasting — TFT, N-BEATS, N-HiTS, DeepAR".into(),
        supported_tasks: vec!["ts_forecast".into()],
        models,
        dataset_format: DatasetFormat::TimeSeriesCsv,
        pip_packages: vec!["pytorch-forecasting".into(), "pytorch-lightning".into(), "torch".into()],
    }
}

fn build_pyod_backend() -> BackendInfo {
    let models = vec![
        BackendModelInfo {
            id: "pyod-autoencoder".into(),
            name: "AutoEncoder".into(),
            family: "autoencoder".into(),
            description: "Neural network autoencoder for anomaly detection".into(),
            params_count: None,
            tasks: vec!["ts_anomaly".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "pyod-vae".into(),
            name: "VAE".into(),
            family: "autoencoder".into(),
            description: "Variational AutoEncoder — probabilistic anomaly detection".into(),
            params_count: None,
            tasks: vec!["ts_anomaly".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "pyod-ecod".into(),
            name: "ECOD".into(),
            family: "statistical".into(),
            description: "Empirical Cumulative Distribution — unsupervised, fast".into(),
            params_count: None,
            tasks: vec!["ts_anomaly".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "pyod-iforest".into(),
            name: "Isolation Forest".into(),
            family: "ensemble".into(),
            description: "Tree-based isolation — efficient for high-dim data".into(),
            params_count: None,
            tasks: vec!["ts_anomaly".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "pyod-lof".into(),
            name: "LOF".into(),
            family: "proximity".into(),
            description: "Local Outlier Factor — density-based anomaly detection".into(),
            params_count: None,
            tasks: vec!["ts_anomaly".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "pyod".into(),
        name: "PyOD".into(),
        description: "Python Outlier Detection — AutoEncoder, VAE, ECOD, Isolation Forest, LOF".into(),
        supported_tasks: vec!["ts_anomaly".into()],
        models,
        dataset_format: DatasetFormat::TimeSeriesCsv,
        pip_packages: vec!["pyod".into(), "torch".into()],
    }
}

fn build_tslearn_backend() -> BackendInfo {
    let models = vec![
        BackendModelInfo {
            id: "tslearn-kmeans-dtw".into(),
            name: "K-Means DTW".into(),
            family: "kmeans".into(),
            description: "K-Means with Dynamic Time Warping distance".into(),
            params_count: None,
            tasks: vec!["ts_cluster".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "tslearn-kmeans-euclidean".into(),
            name: "K-Means Euclidean".into(),
            family: "kmeans".into(),
            description: "K-Means with standard Euclidean distance".into(),
            params_count: None,
            tasks: vec!["ts_cluster".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "tslearn-kmeans-softdtw".into(),
            name: "K-Means Soft-DTW".into(),
            family: "kmeans".into(),
            description: "K-Means with differentiable Soft-DTW".into(),
            params_count: None,
            tasks: vec!["ts_cluster".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "tslearn-kshape".into(),
            name: "K-Shape".into(),
            family: "kshape".into(),
            description: "Shape-based time series clustering".into(),
            params_count: None,
            tasks: vec!["ts_cluster".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "tslearn".into(),
        name: "tslearn".into(),
        description: "Time series clustering — K-Means (DTW/Euclidean/Soft-DTW), K-Shape".into(),
        supported_tasks: vec!["ts_cluster".into()],
        models,
        dataset_format: DatasetFormat::TimeSeriesCsv,
        pip_packages: vec!["tslearn".into(), "scikit-learn".into()],
    }
}

fn build_pypots_backend() -> BackendInfo {
    let models = vec![
        BackendModelInfo {
            id: "pypots-saits".into(),
            name: "SAITS".into(),
            family: "transformer".into(),
            description: "Self-Attention-based Imputation — joint optimization".into(),
            params_count: Some("1M".into()),
            tasks: vec!["ts_impute".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "pypots-brits".into(),
            name: "BRITS".into(),
            family: "rnn".into(),
            description: "Bidirectional Recurrent Imputation — captures temporal deps".into(),
            params_count: Some("0.5M".into()),
            tasks: vec!["ts_impute".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "pypots-usgan".into(),
            name: "US-GAN".into(),
            family: "gan".into(),
            description: "GAN-based imputation with unsupervised training".into(),
            params_count: Some("1.5M".into()),
            tasks: vec!["ts_impute".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "pypots".into(),
        name: "PyPOTS".into(),
        description: "Partially-Observed Time Series — SAITS, BRITS, US-GAN for imputation".into(),
        supported_tasks: vec!["ts_impute".into()],
        models,
        dataset_format: DatasetFormat::TimeSeriesCsv,
        pip_packages: vec!["pypots".into(), "torch".into()],
    }
}

fn build_stumpy_backend() -> BackendInfo {
    let models = vec![
        BackendModelInfo {
            id: "stumpy-mp".into(),
            name: "Matrix Profile".into(),
            family: "matrix-profile".into(),
            description: "Matrix Profile for motif/discord discovery".into(),
            params_count: None,
            tasks: vec!["ts_pattern".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "stumpy-mpdist".into(),
            name: "MPdist".into(),
            family: "matrix-profile".into(),
            description: "Matrix Profile distance for similarity search".into(),
            params_count: None,
            tasks: vec!["ts_pattern".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "stumpy".into(),
        name: "STUMPY".into(),
        description: "Matrix Profile — motif discovery, discord detection, pattern recognition".into(),
        supported_tasks: vec!["ts_pattern".into()],
        models,
        dataset_format: DatasetFormat::TimeSeriesCsv,
        pip_packages: vec!["stumpy".into(), "numpy".into()],
    }
}
