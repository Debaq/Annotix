use super::{BackendInfo, BackendModelInfo, DatasetFormat, TrainingBackend};

/// Maps project type to training task
pub(crate) fn project_type_to_task(project_type: &str) -> &str {
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
        "tabular" => "tabular",
        _ => "detect",
    }
}

/// Id público de un backend, el mismo que viaja al frontend y a los comandos.
pub fn backend_id(backend: &TrainingBackend) -> &'static str {
    match backend {
        TrainingBackend::Yolo => "yolo",
        TrainingBackend::RtDetr => "rt_detr",
        TrainingBackend::RfDetr => "rf_detr",
        TrainingBackend::HfDetection => "hf_detection",
        TrainingBackend::Smp => "smp",
        TrainingBackend::HfSegmentation => "hf_segmentation",
        TrainingBackend::HfInstance => "hf_instance",
        TrainingBackend::HfPose => "hf_pose",
        TrainingBackend::Timm => "timm",
        TrainingBackend::HfClassification => "hf_classification",
        TrainingBackend::Tsai => "tsai",
        TrainingBackend::PytorchForecasting => "pytorch_forecasting",
        TrainingBackend::Pyod => "pyod",
        TrainingBackend::Tslearn => "tslearn",
        TrainingBackend::Pypots => "pypots",
        TrainingBackend::Stumpy => "stumpy",
        TrainingBackend::Sklearn => "sklearn",
    }
}

/// Mínimo por id, para que el catálogo lo publique sin conocer el enum.
fn min_image_size_por_id(id: &str) -> u32 {
    match id {
        // RT-DETR hace una selección top-k sobre los tokens del feature map y por
        // debajo de ~320 px se queda sin índices. RF-DETR exige múltiplos de 32.
        "rt_detr" | "rf_detr" => 320,
        _ => 32,
    }
}

/// Si el backend sabe continuar el ajuste desde un modelo ya entrenado aquí.
///
/// No es lo mismo que reanudar un entrenamiento cortado: es partir de los pesos
/// de un trabajo anterior con el optimizador reiniciado, para especializar el
/// modelo en datos nuevos.
///
/// Los estimadores clásicos quedan fuera a propósito: un k-means de tslearn se
/// reajusta desde cero y stumpy no entrena nada, así que ofrecer "continuar
/// ajuste" y por debajo reentrenar de cero sería mentirle al usuario.
pub(super) fn supports_fine_tune_por_id(id: &str) -> bool {
    matches!(
        id,
        // ultralytics acepta la ruta de un .pt como modelo de partida.
        "yolo" | "rt_detr"
            // Estos guardan con `save_pretrained()` y `from_pretrained()` acepta
            // ese directorio igual que un id del Hub.
            | "hf_detection"
            | "hf_instance"
            | "hf_segmentation"
            | "hf_classification"
            // Estos guardan un `state_dict` y se continúan con `load_state_dict`.
            // `hf_pose` está aquí y no arriba porque, pese al prefijo, no es un
            // modelo de HuggingFace: es un backbone de timm con una cabeza de
            // heatmaps propia.
            | "smp"
            | "timm"
            | "hf_pose"
            | "tsai"
            | "pytorch_forecasting" // `rf_detr` queda fuera a propósito: su constructor acepta pesos de
                                    // partida según la librería, pero no se verificó contra la versión que
                                    // el proyecto fija, y rfdetr aborta con un ValidationError de pydantic
                                    // ante un argumento que no conoce. Entra cuando se compruebe con un
                                    // entrenamiento real.
    )
}

/// Resolución mínima con la que un backend puede entrenar.
///
/// No es una preferencia estética: RT-DETR hace una selección top-k sobre los tokens
/// del feature map y por debajo de ~320 px se queda sin índices, abortando con
/// `RuntimeError: selected index k out of range`, que al usuario no le dice nada.
/// RF-DETR además exige múltiplos de 32 (lo ajusta su propio script).
pub fn min_image_size(backend: &TrainingBackend) -> u32 {
    min_image_size_por_id(backend_id(backend))
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
            backends.push(build_hf_detection_backend());
        }
        "segment" => {
            backends.push(build_yolo_backend(task));
            backends.push(build_rfdetr_backend(task));
            backends.push(build_smp_backend());
            backends.push(build_hf_seg_backend());
        }
        "instance_segment" => {
            backends.push(build_yolo_backend("segment"));
            backends.push(build_hf_instance_backend());
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
            backends.push(build_hf_pose_backend(task));
        }
        "landmarks" => {
            backends.push(build_hf_pose_backend(task));
        }
        "obb" => {
            // Sólo ultralytics: MMRotate llevaba sin mantención desde 2022 y exigía
            // mmcv<2.1 con numpy 1.x, incompatible con el entorno de Annotix.
            backends.push(build_yolo_backend(task));
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
        "tabular" => {
            backends.push(build_sklearn_backend());
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
            tasks: vec![
                "detect".into(),
                "segment".into(),
                "classify".into(),
                "pose".into(),
                "obb".into(),
            ],
            sizes: Some(vec![
                "n".into(),
                "s".into(),
                "m".into(),
                "l".into(),
                "x".into(),
            ]),
            recommended: true,
        },
        BackendModelInfo {
            id: "yolo12".into(),
            name: "YOLO12".into(),
            family: "yolo".into(),
            description: "Attention-based YOLO architecture".into(),
            params_count: None,
            tasks: vec!["detect".into(), "segment".into(), "classify".into()],
            sizes: Some(vec![
                "n".into(),
                "s".into(),
                "m".into(),
                "l".into(),
                "x".into(),
            ]),
            recommended: false,
        },
        BackendModelInfo {
            id: "yolo11".into(),
            name: "YOLO11".into(),
            family: "yolo".into(),
            description: "Robust and battle-tested YOLO model".into(),
            params_count: None,
            tasks: vec![
                "detect".into(),
                "segment".into(),
                "classify".into(),
                "pose".into(),
                "obb".into(),
            ],
            sizes: Some(vec![
                "n".into(),
                "s".into(),
                "m".into(),
                "l".into(),
                "x".into(),
            ]),
            recommended: false,
        },
        BackendModelInfo {
            id: "yolov10".into(),
            name: "YOLOv10".into(),
            family: "yolo".into(),
            description: "NMS-free YOLO for real-time detection".into(),
            params_count: None,
            tasks: vec!["detect".into()],
            sizes: Some(vec![
                "n".into(),
                "s".into(),
                "m".into(),
                "l".into(),
                "x".into(),
            ]),
            recommended: false,
        },
        BackendModelInfo {
            id: "yolov9".into(),
            name: "YOLOv9".into(),
            family: "yolo".into(),
            description: "Programmable gradient information architecture".into(),
            params_count: None,
            tasks: vec!["detect".into(), "segment".into()],
            sizes: Some(vec![
                "t".into(),
                "s".into(),
                "m".into(),
                "c".into(),
                "e".into(),
            ]),
            recommended: false,
        },
        BackendModelInfo {
            id: "yolov8".into(),
            name: "YOLOv8".into(),
            family: "yolo".into(),
            description: "Widely adopted YOLO version".into(),
            params_count: None,
            tasks: vec![
                "detect".into(),
                "segment".into(),
                "classify".into(),
                "pose".into(),
                "obb".into(),
            ],
            sizes: Some(vec![
                "n".into(),
                "s".into(),
                "m".into(),
                "l".into(),
                "x".into(),
            ]),
            recommended: false,
        },
        BackendModelInfo {
            id: "yolov5".into(),
            name: "YOLOv5u".into(),
            family: "yolo".into(),
            description: "Classic YOLO with anchor-free head".into(),
            params_count: None,
            tasks: vec!["detect".into(), "segment".into(), "classify".into()],
            sizes: Some(vec![
                "n".into(),
                "s".into(),
                "m".into(),
                "l".into(),
                "x".into(),
            ]),
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
        supported_tasks: vec![
            "detect".into(),
            "segment".into(),
            "classify".into(),
            "pose".into(),
            "obb".into(),
        ],
        models,
        dataset_format: DatasetFormat::YoloTxt,
        pip_packages: vec!["ultralytics".into()],
        min_image_size: min_image_size_por_id("yolo"),
        supports_fine_tune: supports_fine_tune_por_id("yolo"),
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
        min_image_size: min_image_size_por_id("rt_detr"),
        supports_fine_tune: supports_fine_tune_por_id("rt_detr"),
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
        // Los nombres de las clases de segmentación son RFDETRSeg*; `RFDETRBaseSeg`
        // no existe en la librería y el script fallaba con ImportError al importarlo.
        for (id, name, params, recommended) in [
            ("RFDETRSegNano", "RF-DETR Seg Nano", "4M", false),
            ("RFDETRSegSmall", "RF-DETR Seg Small", "10M", false),
            ("RFDETRSegMedium", "RF-DETR Seg Medium", "24M", true),
            ("RFDETRSegLarge", "RF-DETR Seg Large", "130M", false),
        ] {
            models.push(BackendModelInfo {
                id: id.into(),
                name: name.into(),
                family: "rfdetr".into(),
                description: "Segmentación por instancias con RF-DETR".into(),
                params_count: Some(params.into()),
                tasks: vec!["segment".into()],
                sizes: None,
                recommended,
            });
        }
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
        // El extra [train] trae pytorch-lightning y compañía: sin él `train()`
        // aborta pidiéndolo, ya con los pesos descargados. El pin de transformers
        // es real: rfdetr 1.10 usa la API de la 5.x.
        pip_packages: vec!["rfdetr[train]".into(), "transformers>=5".into()],
        min_image_size: min_image_size_por_id("rf_detr"),
        supports_fine_tune: supports_fine_tune_por_id("rf_detr"),
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
        description:
            "Segmentation Models PyTorch — multiple architectures with pretrained encoders".into(),
        supported_tasks: vec!["segment".into()],
        models,
        dataset_format: DatasetFormat::MaskPng,
        pip_packages: vec![
            "segmentation-models-pytorch".into(),
            "torch".into(),
            "torchvision".into(),
            "albumentations".into(),
        ],
        min_image_size: min_image_size_por_id("smp"),
        supports_fine_tune: supports_fine_tune_por_id("smp"),
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
        description: "HuggingFace Transformers — pretrained SegFormer, Mask2Former, DPT and more"
            .into(),
        supported_tasks: vec!["segment".into()],
        models,
        dataset_format: DatasetFormat::MaskPng,
        pip_packages: vec![
            "transformers".into(),
            "datasets".into(),
            "evaluate".into(),
            "torch".into(),
            "torchvision".into(),
        ],
        min_image_size: min_image_size_por_id("hf_segmentation"),
        supports_fine_tune: supports_fine_tune_por_id("hf_segmentation"),
    }
}

// ─── Detectron2 (Instance Segmentation / Polygon) ───────────────────────────

// ─── MMDetection Instance Seg ────────────────────────────────────────────────

// ─── MMPose (Keypoints + Landmarks) ──────────────────────────────────────────

// ─── MMRotate (OBB) ──────────────────────────────────────────────────────────

// ─── timm (Classification / Multi-label) ─────────────────────────────────────

// ─── HuggingFace: detección, instancias y pose ───────────────────────────────

fn modelo(
    id: &str,
    name: &str,
    family: &str,
    description: &str,
    params: &str,
    task: &str,
    recommended: bool,
) -> BackendModelInfo {
    BackendModelInfo {
        id: id.into(),
        name: name.into(),
        family: family.into(),
        description: description.into(),
        params_count: Some(params.into()),
        tasks: vec![task.into()],
        sizes: None,
        recommended,
    }
}

fn build_hf_detection_backend() -> BackendInfo {
    BackendInfo {
        id: "hf_detection".into(),
        name: "HuggingFace Detection".into(),
        description: "DETR y variantes desde el Hub — reemplaza MMDetection".into(),
        supported_tasks: vec!["detect".into()],
        models: vec![
            modelo(
                "facebook/detr-resnet-50",
                "DETR (R50)",
                "detr",
                "Transformer de detección de referencia",
                "41M",
                "detect",
                true,
            ),
            modelo(
                "facebook/detr-resnet-101",
                "DETR (R101)",
                "detr",
                "Más capacidad, más lento",
                "60M",
                "detect",
                false,
            ),
            modelo(
                "SenseTime/deformable-detr",
                "Deformable DETR",
                "deformable-detr",
                "Atención deformable: converge antes que DETR",
                "40M",
                "detect",
                false,
            ),
            modelo(
                "microsoft/conditional-detr-resnet-50",
                "Conditional DETR (R50)",
                "conditional-detr",
                "Consultas condicionales, entrenamiento más rápido",
                "43M",
                "detect",
                false,
            ),
        ],
        dataset_format: DatasetFormat::CocoJson,
        pip_packages: vec![
            "transformers".into(),
            "accelerate".into(),
            "torchmetrics".into(),
            "pycocotools".into(),
        ],
        min_image_size: min_image_size_por_id("hf_detection"),
        supports_fine_tune: supports_fine_tune_por_id("hf_detection"),
    }
}

fn build_hf_instance_backend() -> BackendInfo {
    BackendInfo {
        id: "hf_instance".into(),
        name: "HuggingFace Instance Segmentation".into(),
        description: "Mask2Former y MaskFormer — reemplazan Detectron2".into(),
        supported_tasks: vec!["instance_segment".into()],
        models: vec![
            modelo(
                "facebook/mask2former-swin-tiny-coco-instance",
                "Mask2Former (Swin-T)",
                "mask2former",
                "Segmentación por instancias, variante ligera",
                "47M",
                "instance_segment",
                true,
            ),
            modelo(
                "facebook/mask2former-swin-small-coco-instance",
                "Mask2Former (Swin-S)",
                "mask2former",
                "Equilibrio entre precisión y coste",
                "69M",
                "instance_segment",
                false,
            ),
            modelo(
                "facebook/mask2former-swin-base-coco-instance",
                "Mask2Former (Swin-B)",
                "mask2former",
                "Mayor precisión, requiere más memoria",
                "107M",
                "instance_segment",
                false,
            ),
            modelo(
                "facebook/maskformer-swin-tiny-coco",
                "MaskFormer (Swin-T)",
                "maskformer",
                "Predecesor de Mask2Former, más simple",
                "42M",
                "instance_segment",
                false,
            ),
        ],
        dataset_format: DatasetFormat::CocoInstanceJson,
        pip_packages: vec![
            "transformers".into(),
            "accelerate".into(),
            "torchmetrics".into(),
            "pycocotools".into(),
        ],
        min_image_size: min_image_size_por_id("hf_instance"),
        supports_fine_tune: supports_fine_tune_por_id("hf_instance"),
    }
}

fn build_hf_pose_backend(task: &str) -> BackendInfo {
    let etiqueta = if task == "landmarks" {
        "landmarks"
    } else {
        "pose"
    };
    BackendInfo {
        id: "hf_pose".into(),
        name: "Pose (heatmaps sobre timm)".into(),
        description: "Backbone preentrenado con cabeza de heatmaps — reemplaza MMPose".into(),
        supported_tasks: vec!["pose".into(), "landmarks".into()],
        models: vec![
            modelo(
                "resnet50",
                "ResNet-50",
                "resnet",
                "Backbone estándar, buen punto de partida",
                "25M",
                etiqueta,
                true,
            ),
            modelo(
                "resnet18",
                "ResNet-18",
                "resnet",
                "Ligero: entrena rápido en CPU",
                "12M",
                etiqueta,
                false,
            ),
            modelo(
                "convnext_tiny",
                "ConvNeXt-T",
                "convnext",
                "Más preciso a igual coste que ResNet",
                "28M",
                etiqueta,
                false,
            ),
            modelo(
                "hrnet_w32",
                "HRNet-W32",
                "hrnet",
                "Alta resolución: la arquitectura clásica de pose",
                "29M",
                etiqueta,
                false,
            ),
        ],
        dataset_format: DatasetFormat::CocoKeypointsJson,
        pip_packages: vec!["timm".into(), "torch".into(), "torchvision".into()],
        min_image_size: min_image_size_por_id("hf_pose"),
        supports_fine_tune: supports_fine_tune_por_id("hf_pose"),
    }
}

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
        min_image_size: min_image_size_por_id("timm"),
        supports_fine_tune: supports_fine_tune_por_id("timm"),
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
        description:
            "HuggingFace Transformers — ViT, ConvNeXt, Swin, DeiT, BEiT for classification".into(),
        supported_tasks: vec!["classify".into(), "multi_classify".into()],
        models: filtered,
        dataset_format: ds_fmt,
        pip_packages: vec![
            "transformers".into(),
            "datasets".into(),
            "evaluate".into(),
            "torch".into(),
            "torchvision".into(),
        ],
        min_image_size: min_image_size_por_id("hf_classification"),
        supports_fine_tune: supports_fine_tune_por_id("hf_classification"),
    }
}

// ─── Time Series Backends ────────────────────────────────────────────────────

fn build_tsai_backend(task: &str) -> BackendInfo {
    let all_tasks = vec![
        "ts_classify".to_string(),
        "ts_forecast".to_string(),
        "ts_regress".to_string(),
        "ts_anomaly".to_string(),
        "ts_segment".to_string(),
        "ts_event".to_string(),
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
        description: "Time series AI library — InceptionTime, PatchTST, ROCKET, LSTM and more"
            .into(),
        supported_tasks: vec![
            "ts_classify".into(),
            "ts_forecast".into(),
            "ts_regress".into(),
            "ts_anomaly".into(),
            "ts_segment".into(),
            "ts_event".into(),
        ],
        models: filtered,
        dataset_format: DatasetFormat::TimeSeriesCsv,
        pip_packages: vec!["tsai".into()],
        min_image_size: min_image_size_por_id("tsai"),
        supports_fine_tune: supports_fine_tune_por_id("tsai"),
    }
}

fn build_pytorch_forecasting_backend() -> BackendInfo {
    let models = vec![
        BackendModelInfo {
            id: "tft".into(),
            name: "TFT".into(),
            family: "tft".into(),
            description: "Temporal Fusion Transformer — interpretable multi-horizon forecasting"
                .into(),
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
        pip_packages: vec![
            "pytorch-forecasting".into(),
            "pytorch-lightning".into(),
            "torch".into(),
        ],
        min_image_size: min_image_size_por_id("pytorch_forecasting"),
        supports_fine_tune: supports_fine_tune_por_id("pytorch_forecasting"),
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
        description: "Python Outlier Detection — AutoEncoder, VAE, ECOD, Isolation Forest, LOF"
            .into(),
        supported_tasks: vec!["ts_anomaly".into()],
        models,
        dataset_format: DatasetFormat::TimeSeriesCsv,
        pip_packages: vec!["pyod".into(), "torch".into()],
        min_image_size: min_image_size_por_id("pyod"),
        supports_fine_tune: supports_fine_tune_por_id("pyod"),
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
        min_image_size: min_image_size_por_id("tslearn"),
        supports_fine_tune: supports_fine_tune_por_id("tslearn"),
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
        min_image_size: min_image_size_por_id("pypots"),
        supports_fine_tune: supports_fine_tune_por_id("pypots"),
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
        description: "Matrix Profile — motif discovery, discord detection, pattern recognition"
            .into(),
        supported_tasks: vec!["ts_pattern".into()],
        models,
        dataset_format: DatasetFormat::TimeSeriesCsv,
        pip_packages: vec!["stumpy".into(), "numpy".into()],
        min_image_size: min_image_size_por_id("stumpy"),
        supports_fine_tune: supports_fine_tune_por_id("stumpy"),
    }
}

fn build_sklearn_backend() -> BackendInfo {
    let models = vec![
        // Classification models
        BackendModelInfo {
            id: "random_forest_classifier".into(),
            name: "Random Forest Classifier".into(),
            family: "ensemble".into(),
            description: "Robust ensemble of decision trees — great default for classification"
                .into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: true,
        },
        BackendModelInfo {
            id: "xgboost_classifier".into(),
            name: "XGBoost Classifier".into(),
            family: "boosting".into(),
            description: "Gradient boosting — state of the art for tabular data".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "lightgbm_classifier".into(),
            name: "LightGBM Classifier".into(),
            family: "boosting".into(),
            description: "Fast gradient boosting — efficient on large datasets".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "logistic_regression".into(),
            name: "Logistic Regression".into(),
            family: "linear".into(),
            description: "Simple linear model — fast, interpretable baseline".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "svm_classifier".into(),
            name: "SVM Classifier".into(),
            family: "svm".into(),
            description: "Support Vector Machine — good for small/medium datasets".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "knn_classifier".into(),
            name: "KNN Classifier".into(),
            family: "neighbors".into(),
            description: "K-Nearest Neighbors — instance-based, no training phase".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "gradient_boosting_classifier".into(),
            name: "Gradient Boosting Classifier".into(),
            family: "ensemble".into(),
            description: "Scikit-learn native gradient boosting".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "extra_trees_classifier".into(),
            name: "Extra Trees Classifier".into(),
            family: "ensemble".into(),
            description: "Extremely randomized trees — faster than Random Forest".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "mlp_classifier".into(),
            name: "MLP Classifier".into(),
            family: "neural".into(),
            description: "Multi-layer perceptron neural network".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        // Regression models
        BackendModelInfo {
            id: "random_forest_regressor".into(),
            name: "Random Forest Regressor".into(),
            family: "ensemble".into(),
            description: "Robust ensemble of decision trees for regression".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "xgboost_regressor".into(),
            name: "XGBoost Regressor".into(),
            family: "boosting".into(),
            description: "Gradient boosting for regression tasks".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "lightgbm_regressor".into(),
            name: "LightGBM Regressor".into(),
            family: "boosting".into(),
            description: "Fast gradient boosting for regression".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "linear_regression".into(),
            name: "Linear Regression".into(),
            family: "linear".into(),
            description: "Simple linear regression — fast baseline".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "ridge_regression".into(),
            name: "Ridge Regression".into(),
            family: "linear".into(),
            description: "L2-regularized linear regression".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "lasso_regression".into(),
            name: "Lasso Regression".into(),
            family: "linear".into(),
            description: "L1-regularized linear regression — feature selection".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "svr".into(),
            name: "SVR (Support Vector Regressor)".into(),
            family: "svm".into(),
            description: "Support Vector Regression for non-linear data".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "knn_regressor".into(),
            name: "KNN Regressor".into(),
            family: "neighbors".into(),
            description: "K-Nearest Neighbors regression".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "gradient_boosting_regressor".into(),
            name: "Gradient Boosting Regressor".into(),
            family: "ensemble".into(),
            description: "Scikit-learn native gradient boosting for regression".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "extra_trees_regressor".into(),
            name: "Extra Trees Regressor".into(),
            family: "ensemble".into(),
            description: "Extremely randomized trees for regression".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
        BackendModelInfo {
            id: "mlp_regressor".into(),
            name: "MLP Regressor".into(),
            family: "neural".into(),
            description: "Multi-layer perceptron neural network for regression".into(),
            params_count: None,
            tasks: vec!["tabular".into()],
            sizes: None,
            recommended: false,
        },
    ];

    BackendInfo {
        id: "sklearn".into(),
        name: "Scikit-learn + XGBoost + LightGBM".into(),
        description: "Classical ML — auto preprocessing, cross-validation, ONNX export".into(),
        supported_tasks: vec!["tabular".into()],
        models,
        dataset_format: DatasetFormat::TabularCsv,
        pip_packages: vec![
            "scikit-learn".into(),
            "xgboost".into(),
            "lightgbm".into(),
            "pandas".into(),
            "skl2onnx".into(),
            "onnxmltools".into(),
        ],
        min_image_size: min_image_size_por_id("sklearn"),
        supports_fine_tune: supports_fine_tune_por_id("sklearn"),
    }
}
