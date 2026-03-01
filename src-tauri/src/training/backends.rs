use super::{BackendInfo, BackendModelInfo, DatasetFormat};

/// Maps project type to training task
fn project_type_to_task(project_type: &str) -> &str {
    match project_type {
        "bbox" | "object-detection" => "detect",
        "instance-segmentation" | "polygon" | "mask" | "semantic-segmentation" => "segment",
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

    // Semantic segmentation backends — segment only
    if task == "segment" {
        backends.push(build_smp_backend());
        backends.push(build_hf_seg_backend());
        backends.push(build_mmseg_backend());
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
