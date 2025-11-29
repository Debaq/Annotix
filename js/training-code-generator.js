/**
 * TRAINING CODE GENERATOR
 * Generates training scripts for various ML frameworks (YOLO, Detectron2, PyTorch, etc.)
 *
 * CONTROL APPLICABILITY BY MODALITY:
 *
 * Universal (all modalities):
 * - Framework (auto-populated based on project type)
 * - Device (CPU, CUDA, MPS)
 * - Epochs
 * - Batch Size
 * - Optimizer (Adam, AdamW, SGD, RMSprop)
 * - Learning Rate
 * - Patience (Early Stop)
 * - Validation Split
 * - Save plots
 * - Export metrics CSV
 *
 * Images only (.modality-images):
 * - Model size (n, s, m, l, x)
 * - Image size (416, 640, 1280)
 * - Data Augmentation (Mosaic, Mixup, HSV, Flips, Rotate, Scale)
 * - Confusion Matrix
 * - Precision-Recall Curves
 * - Visualize Predictions
 * - Model Export (ONNX, TorchScript, TFLite, OpenVINO, CoreML, TensorRT)
 *
 * Time Series only (.modality-timeSeries):
 * - Sequence Length
 * - Forecast Horizon
 * - Hidden Size
 *
 * Audio/Video/3D/Text:
 * - Currently using same universal controls
 * - Specific controls can be added as needed
 */

class TrainingCodeGenerator {
    constructor(projectManager, canvasManager, ui) {
        this.projectManager = projectManager;
        this.canvasManager = canvasManager;
        this.ui = ui;
    }

    // Helper method to get translations
    t(key) {
        return window.i18n ? window.i18n.t(key) : key;
    }

    // Get project modality from project type
    getProjectModality(projectType) {
        // Map project types to modalities
        const typeToModality = {
            // Images
            'bbox': 'images',  // Original YOLO Annotator bbox type
            'mask': 'images',  // Original YOLO Annotator mask type
            'classification': 'images',
            'multiLabel': 'images',
            'detection': 'images',
            'segmentation': 'images',
            'instanceSeg': 'images',
            'semanticSeg': 'images',
            'panopticSeg': 'images',
            'keypoints': 'images',
            'polygon': 'images',
            'landmarks': 'images',
            'obb': 'images',
            'ocr': 'images',
            'depthEstimation': 'images',
            // Time Series
            'timeSeriesClassification': 'timeSeries',
            'timeSeriesForecasting': 'timeSeries',
            'anomalyDetection': 'timeSeries',
            'timeSeriesSegmentation': 'timeSeries',
            'patternRecognition': 'timeSeries',
            'eventDetection': 'timeSeries',
            'timeSeriesRegression': 'timeSeries',
            'clustering': 'timeSeries',
            'imputation': 'timeSeries',
            // Audio
            'audioClassification': 'audio',
            'speechRecognition': 'audio',
            'soundEventDetection': 'audio',
            'speakerIdentification': 'audio',
            'audioTagging': 'audio',
            'musicGenreClassification': 'audio',
            'emotionRecognition': 'audio',
            'voiceActivityDetection': 'audio',
            'keywordSpotting': 'audio',
            'environmentalSound': 'audio',
            // Video
            'actionRecognition': 'video',
            'objectTracking': 'video',
            'temporalActionLocalization': 'video',
            'videoClassification': 'video',
            'videoSegmentation': 'video',
            'activityDetection': 'video',
            'poseTracking': 'video',
            'videoAnomalyDetection': 'video',
            'spatiotemporalAction': 'video',
            // 3D
            'object3DDetection': 'threeD',
            'semantic3DSegmentation': 'threeD',
            'instance3DSegmentation': 'threeD',
            'pointCloudClassification': 'threeD',
            'meshSegmentation': 'threeD',
            'pose3DEstimation': 'threeD',
            'keypoint3DDetection': 'threeD',
            'surfaceReconstruction': 'threeD',
            'slamAnnotation': 'threeD',
            // Text
            'textClassification': 'text',
            'namedEntityRecognition': 'text',
            'sentimentAnalysis': 'text',
            'intentClassification': 'text',
            'relationExtraction': 'text',
            'posTagging': 'text',
            'dependencyParsing': 'text',
            'questionAnswering': 'text',
            'keyphraseExtraction': 'text',
            'entityLinking': 'text',
            'toxicityClassification': 'text',
            'languageIdentification': 'text'
        };

        return typeToModality[projectType] || 'images';
    }

    // Populate select options with translated strings
    populateSelectOptions() {
        // Model sizes
        const modelSelect = document.getElementById('codeModel');
        if (modelSelect) {
            const currentValue = modelSelect.value || 'm';
            modelSelect.innerHTML = `
                <option value="n">${this.t('export.code.modelSizes.nano')}</option>
                <option value="s">${this.t('export.code.modelSizes.small')}</option>
                <option value="m">${this.t('export.code.modelSizes.medium')}</option>
                <option value="l">${this.t('export.code.modelSizes.large')}</option>
                <option value="x">${this.t('export.code.modelSizes.xlarge')}</option>
            `;
            modelSelect.value = currentValue;
        }

        // Devices
        const deviceSelect = document.getElementById('codeDevice');
        if (deviceSelect) {
            const currentValue = deviceSelect.value || 'cuda:0';
            deviceSelect.innerHTML = `
                <option value="cpu">${this.t('export.code.devices.cpu')}</option>
                <option value="cuda:0">${this.t('export.code.devices.gpu')}</option>
                <option value="mps">${this.t('export.code.devices.mps')}</option>
            `;
            deviceSelect.value = currentValue;
        }

        // Optimizers
        const optimizerSelect = document.getElementById('codeOptimizer');
        if (optimizerSelect) {
            const currentValue = optimizerSelect.value || 'Adam';
            optimizerSelect.innerHTML = `
                <option value="Adam">${this.t('export.code.optimizers.adam')}</option>
                <option value="AdamW">${this.t('export.code.optimizers.adamw')}</option>
                <option value="SGD">${this.t('export.code.optimizers.sgd')}</option>
                <option value="RMSprop">${this.t('export.code.optimizers.rmsprop')}</option>
            `;
            optimizerSelect.value = currentValue;
        }
    }

    updateConfigUI() {
        const projectType = this.projectManager.currentProject?.type || 'detection';
        const modality = this.getProjectModality(projectType);

        // Show/hide controls based on modality
        // Each control can have one or more modality classes (e.g., .modality-images, .modality-timeSeries)
        const imageControls = document.querySelectorAll('.modality-images');
        const timeSeriesControls = document.querySelectorAll('.modality-timeSeries');
        const audioControls = document.querySelectorAll('.modality-audio');
        const videoControls = document.querySelectorAll('.modality-video');
        const threeDControls = document.querySelectorAll('.modality-threeD');
        const textControls = document.querySelectorAll('.modality-text');

        // Hide all modality-specific controls first
        imageControls.forEach(el => el.style.display = 'none');
        timeSeriesControls.forEach(el => el.style.display = 'none');
        audioControls.forEach(el => el.style.display = 'none');
        videoControls.forEach(el => el.style.display = 'none');
        threeDControls.forEach(el => el.style.display = 'none');
        textControls.forEach(el => el.style.display = 'none');

        // Show only controls relevant to current modality
        if (modality === 'images') {
            imageControls.forEach(el => el.style.display = '');
        } else if (modality === 'timeSeries') {
            timeSeriesControls.forEach(el => el.style.display = '');
        } else if (modality === 'audio') {
            audioControls.forEach(el => el.style.display = '');
        } else if (modality === 'video') {
            videoControls.forEach(el => el.style.display = '');
        } else if (modality === 'threeD') {
            threeDControls.forEach(el => el.style.display = '');
        } else if (modality === 'text') {
            textControls.forEach(el => el.style.display = '');
        }

        // Populate select options with translations
        this.populateSelectOptions();

        // Update frameworks after UI is updated
        this.populateFrameworks();
    }

    populateFrameworks() {
        const projectType = this.projectManager.currentProject?.type || 'detection';
        const modality = this.getProjectModality(projectType);
        const frameworkSelect = document.getElementById('codeFramework');
        if (!frameworkSelect) return;

        let frameworks = [];

        // Define frameworks based on modality and project type
        if (modality === 'images') {
            if (projectType === 'detection' || projectType === 'bbox') {
                frameworks = [
                    { value: 'yolov8', label: 'YOLOv8 (Ultralytics)' },
                    { value: 'yolov5', label: 'YOLOv5' },
                    { value: 'yolov11', label: 'YOLOv11' },
                    { value: 'yolo-nas', label: 'YOLO-NAS' },
                    { value: 'detectron2', label: 'Detectron2 (Faster R-CNN)' }
                ];
            } else if (projectType === 'segmentation' || projectType === 'instanceSeg' || projectType === 'polygon' || projectType === 'semanticSeg' || projectType === 'mask') {
                frameworks = [
                    { value: 'yolov8-seg', label: 'YOLOv8 Segmentation' },
                    { value: 'yolov11-seg', label: 'YOLOv11 Segmentation' },
                    { value: 'detectron2-mask', label: 'Detectron2 (Mask R-CNN)' },
                    { value: 'smp', label: 'segmentation_models.pytorch' }
                ];
            } else if (projectType === 'classification' || projectType === 'multiLabel') {
                frameworks = [
                    { value: 'yolov8-cls', label: 'YOLOv8 Classification' },
                    { value: 'yolov11-cls', label: 'YOLOv11 Classification' },
                    { value: 'timm', label: 'PyTorch timm (ResNet, EfficientNet, ViT)' },
                    { value: 'torchvision', label: 'TorchVision Models' }
                ];
            } else if (projectType === 'keypoints' || projectType === 'landmarks') {
                frameworks = [
                    { value: 'yolov8-pose', label: 'YOLOv8 Pose' },
                    { value: 'yolov11-pose', label: 'YOLOv11 Pose' },
                    { value: 'mmpose', label: 'MMPose' }
                ];
            } else if (projectType === 'obb') {
                frameworks = [
                    { value: 'yolov8-obb', label: 'YOLOv8 OBB' },
                    { value: 'yolov11-obb', label: 'YOLOv11 OBB' },
                    { value: 'detectron2-rotated', label: 'Detectron2 (Rotated)' }
                ];
            } else {
                // Default to detection
                frameworks = [
                    { value: 'yolov8', label: 'YOLOv8 (Ultralytics)' },
                    { value: 'yolov5', label: 'YOLOv5' },
                    { value: 'yolov11', label: 'YOLOv11' }
                ];
            }
        } else if (modality === 'timeSeries') {
            // Time Series frameworks
            if (projectType === 'timeSeriesClassification' || projectType === 'clustering') {
                frameworks = [
                    { value: 'ts-pytorch', label: 'PyTorch (LSTM/GRU/Transformer)' },
                    { value: 'ts-tensorflow', label: 'TensorFlow/Keras' },
                    { value: 'sktime', label: 'sktime (sklearn-based)' },
                    { value: 'tsai', label: 'tsai (fastai for time series)' }
                ];
            } else if (projectType === 'timeSeriesForecasting') {
                frameworks = [
                    { value: 'ts-pytorch-forecast', label: 'PyTorch (LSTM/Transformer)' },
                    { value: 'ts-tensorflow-forecast', label: 'TensorFlow/Keras' },
                    { value: 'prophet', label: 'Prophet (Facebook)' },
                    { value: 'neuralforecast', label: 'NeuralForecast (Nixtla)' },
                    { value: 'gluonts', label: 'GluonTS (Amazon)' }
                ];
            } else if (projectType === 'anomalyDetection') {
                frameworks = [
                    { value: 'ts-pytorch-anomaly', label: 'PyTorch (AutoEncoder)' },
                    { value: 'ts-tensorflow-anomaly', label: 'TensorFlow/Keras' },
                    { value: 'pyod', label: 'PyOD (sklearn-based)' },
                    { value: 'luminaire', label: 'Luminaire (Zillow)' }
                ];
            } else {
                // Default time series frameworks
                frameworks = [
                    { value: 'ts-pytorch', label: 'PyTorch (LSTM/GRU/Transformer)' },
                    { value: 'ts-tensorflow', label: 'TensorFlow/Keras' },
                    { value: 'sktime', label: 'sktime' }
                ];
            }
        } else {
            // Default to detection for other modalities
            frameworks = [
                { value: 'yolov8', label: 'YOLOv8 (Ultralytics)' },
                { value: 'yolov5', label: 'YOLOv5' },
                { value: 'yolov11', label: 'YOLOv11' }
            ];
        }

        // Populate select
        frameworkSelect.innerHTML = frameworks.map(fw =>
            `<option value="${fw.value}">${fw.label}</option>`
        ).join('');
    }

    generateTrainingCode() {
        // Read basic parameters
        const framework = document.getElementById('codeFramework')?.value || 'yolov8';
        const model = document.getElementById('codeModel')?.value || 'm';
        const device = document.getElementById('codeDevice')?.value || 'cuda:0';
        const epochs = document.getElementById('codeEpochs')?.value || '100';
        const batch = document.getElementById('codeBatch')?.value || '16';
        const imgsz = document.getElementById('codeImgsz')?.value || '640';

        // Read advanced parameters
        const optimizer = document.getElementById('codeOptimizer')?.value || 'Adam';
        const lr = document.getElementById('codeLr')?.value || '0.001';
        const patience = document.getElementById('codePatience')?.value || '50';
        const valSplit = document.getElementById('codeValSplit')?.value || '20';

        // Read augmentation options
        const augMosaic = document.getElementById('augMosaic')?.checked || false;
        const augMixup = document.getElementById('augMixup')?.checked || false;
        const augHsv = document.getElementById('augHsv')?.checked || false;
        const augFlip = document.getElementById('augFlip')?.checked || false;
        const augRotate = document.getElementById('augRotate')?.checked || false;
        const augScale = document.getElementById('augScale')?.checked || false;

        // Read metrics/plots options
        const savePlots = document.getElementById('savePlots')?.checked || false;
        const saveConfMatrix = document.getElementById('saveConfMatrix')?.checked || false;
        const savePrCurves = document.getElementById('savePrCurves')?.checked || false;
        const savePredictions = document.getElementById('savePredictions')?.checked || false;
        const saveMetricsCsv = document.getElementById('saveMetricsCsv')?.checked || false;

        // Read export options
        const exportOnnx = document.getElementById('exportOnnx')?.checked || false;
        const exportTorchscript = document.getElementById('exportTorchscript')?.checked || false;
        const exportTflite = document.getElementById('exportTflite')?.checked || false;
        const exportOpenvino = document.getElementById('exportOpenvino')?.checked || false;
        const exportCoreml = document.getElementById('exportCoreml')?.checked || false;
        const exportTensorrt = document.getElementById('exportTensorrt')?.checked || false;

        const projectType = this.projectManager.currentProject?.type || 'detection';
        const projectName = this.projectManager.currentProject?.name || 'mi_proyecto';
        const numClasses = this.canvasManager?.classes?.length || this.projectManager.currentProject?.classes?.length || 2;
        const modality = this.getProjectModality(projectType);

        let code = '';

        // Read modality-specific parameters
        const seqLength = document.getElementById('codeSeqLength')?.value || '50';
        const forecastHorizon = document.getElementById('codeForecastHorizon')?.value || '10';
        const hiddenSize = document.getElementById('codeHiddenSize')?.value || '128';

        // Route to appropriate code generator based on modality and framework
        if (modality === 'timeSeries') {
            code = this._generateTimeSeriesCode(framework, projectName, projectType, device, numClasses, batch, epochs, lr, optimizer, saveMetricsCsv, savePlots, seqLength, forecastHorizon, hiddenSize);
        } else if (modality === 'images') {
            // Existing image-based frameworks
            code = this._generateImageCode(framework, projectName, projectType, model, device, epochs, batch, imgsz, optimizer, lr, patience, valSplit, augMosaic, augMixup, augHsv, augFlip, augRotate, augScale, savePlots, saveConfMatrix, savePrCurves, savePredictions, saveMetricsCsv, exportOnnx, exportTorchscript, exportTflite, exportOpenvino, exportCoreml, exportTensorrt, numClasses);
        } else {
            code = `# ${this.t('export.code.template.important')}: ${modality} ${this.t('export.code.template.important').toLowerCase()}\n# Coming soon...`;
        }

        const codePreview = document.getElementById('codePreview');
        if (codePreview) {
            codePreview.textContent = code;
        }
    }

    _generateImageCode(framework, projectName, projectType, model, device, epochs, batch, imgsz, optimizer, lr, patience, valSplit, augMosaic, augMixup, augHsv, augFlip, augRotate, augScale, savePlots, saveConfMatrix, savePrCurves, savePredictions, saveMetricsCsv, exportOnnx, exportTorchscript, exportTflite, exportOpenvino, exportCoreml, exportTensorrt, numClasses) {
        let code = '';
        const t = (key) => this.t(key);

        if (framework === 'yolov8' || framework === 'yolov11' ||
            framework === 'yolov8-seg' || framework === 'yolov11-seg' ||
            framework === 'yolov8-cls' || framework === 'yolov11-cls' ||
            framework === 'yolov8-pose' || framework === 'yolov11-pose' ||
            framework === 'yolov8-obb' || framework === 'yolov11-obb') {

            const task = this.getYOLOTask(projectType);
            const isV11 = framework.includes('yolov11');
            const modelName = isV11 ? `yolo11${model}${task}.pt` : `yolov8${model}${task}.pt`;

            code = `"""
${projectName} - Training Script
${t('export.code.template.generatedBy')}
Framework: ${isV11 ? 'YOLOv11' : 'YOLOv8'} (Ultralytics)
${t('export.code.template.projectType')}: ${this.getProjectTypeLabel(projectType)}

${t('export.code.template.important')}: ${t('export.code.template.installDeps')}
"""

# ============================================
# 1. ${t('export.code.template.installation')}
# ============================================
# ${t('export.code.template.executeCmds')}:
# pip install ultralytics
# pip install torch torchvision${savePlots || saveConfMatrix ? '\n# pip install matplotlib seaborn  # ' + t('export.code.template.forVisualization') : ''}${saveMetricsCsv ? '\n# pip install pandas  # ' + t('export.code.template.forExportMetrics') : ''}
# pip install opencv-python pillow numpy

from ultralytics import YOLO
import torch${savePlots || saveConfMatrix || saveMetricsCsv ? '\nimport matplotlib.pyplot as plt' : ''}${saveMetricsCsv ? '\nimport pandas as pd' : ''}
from pathlib import Path

print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
${device.includes('cuda') ? `print(f"CUDA device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A'}")` : ''}

# ============================================
# 2. ${t('export.code.template.configuration')}
# ============================================

# ${t('export.code.template.modelAndDevice')}
MODEL_NAME = '${modelName}'
DEVICE = '${device}'

# ${t('export.code.template.basicHyperparams')}
EPOCHS = ${epochs}
BATCH_SIZE = ${batch}
IMG_SIZE = ${imgsz}
LEARNING_RATE = ${lr}
PATIENCE = ${patience}  # Early stopping

# ${t('export.code.template.dataAugmentation')}
MOSAIC = ${augMosaic ? '1.0' : '0.0'}  # Combina 4 imágenes en una
MIXUP = ${augMixup ? '0.1' : '0.0'}   # Mezcla transparencias
HSV_H = ${augHsv ? '0.015' : '0.0'}   # Color jitter: Hue
HSV_S = ${augHsv ? '0.7' : '0.0'}     # Color jitter: Saturation
HSV_V = ${augHsv ? '0.4' : '0.0'}     # Color jitter: Value
FLIPLR = ${augFlip ? '0.5' : '0.0'}   # Flip horizontal
FLIPUD = ${augFlip ? '0.1' : '0.0'}   # Flip vertical
DEGREES = ${augRotate ? '10.0' : '0.0'}  # Rotación (grados)
SCALE = ${augScale ? '0.5' : '0.0'}   # Escala aleatoria

# ============================================
# 3. ${t('export.code.template.loadPretrainedModel')}
# ============================================

model = YOLO(MODEL_NAME)
print(f"✅ ${t('export.code.template.modelLoaded')}: {MODEL_NAME}")
print(f"📦 ${t('export.code.template.parameters')}: {sum(p.numel() for p in model.model.parameters()):,}")

# ============================================
# 4. ${t('export.code.template.trainModel')}
# ============================================

results = model.train(
    # ${t('export.code.template.dataset')}
    data='data.yaml',           # Archivo YAML con rutas del dataset

    # ${t('export.code.template.basics')}
    epochs=EPOCHS,
    batch=BATCH_SIZE,
    imgsz=IMG_SIZE,
    device=DEVICE,

    # ${t('export.code.template.optimization')}
    optimizer='${optimizer}',    # Adam, AdamW, SGD, RMSprop
    lr0=LEARNING_RATE,          # ${t('export.code.template.initialLearningRate')}
    lrf=0.01,                   # ${t('export.code.template.finalLearningRate')}
    momentum=0.937,             # ${t('export.code.template.momentumSGD')}
    weight_decay=0.0005,        # ${t('export.code.template.weightDecay')}

    # ${t('export.code.template.dataAugmentation')}
    mosaic=MOSAIC,
    mixup=MIXUP,
    hsv_h=HSV_H,
    hsv_s=HSV_S,
    hsv_v=HSV_V,
    degrees=DEGREES,
    translate=0.1,
    scale=SCALE,
    fliplr=FLIPLR,
    flipud=FLIPUD,

    # ${t('export.code.template.callbacks')}
    patience=PATIENCE,          # ${t('export.code.template.earlyStoppingPatience')}
    save=True,                  # ${t('export.code.template.saveCheckpoints')}
    save_period=${Math.ceil(parseInt(epochs) / 10)},               # ${t('export.code.template.savePeriod')}

    # ${t('export.code.template.visualization')}
    plots=${savePlots},                 # ${t('export.code.template.generatePlots')}${saveConfMatrix ? '\n    conf=0.001,                 # ' + t('export.code.template.minConfidence') : ''}

    # ${t('export.code.template.performance')}
    cache=False,                # ${t('export.code.template.cacheImages')}
    workers=8,                  # ${t('export.code.template.numWorkers')}
    project='runs/${projectType}',   # ${t('export.code.template.resultsFolder')}
    name='${projectName}',      # ${t('export.code.template.experimentName')}
    exist_ok=True,              # ${t('export.code.template.overwriteExperiments')}

    # ${t('export.code.template.validation')}
    val=True,                   # ${t('export.code.template.validateDuringTraining')}
    split_val=${parseFloat(valSplit) / 100.0},            # ${t('export.code.template.valPercentage')}
    verbose=True                # ${t('export.code.template.verboseMode')}
)

print("\\n" + "="*50)
print("✅ ${t('export.code.template.trainingCompleted').toUpperCase()}")
print("="*50)

# ============================================
# 5. ${t('export.code.template.evaluateModel').toUpperCase()}
# ============================================

# ${t('export.code.template.validateBestModel')}
best_model_path = results.save_dir / 'weights' / 'best.pt'
model_best = YOLO(best_model_path)

print("\\n🔍 ${t('export.code.template.evaluatingModel')}...")
metrics = model_best.val()

# ${t('export.code.template.printMetrics')}
print("\\n📊 ${t('export.code.template.finalMetrics').toUpperCase()}:")
print("-" * 40)
${projectType === 'detection' || projectType === 'obb' || projectType === 'bbox' ? `print(f"mAP50:     {metrics.box.map50:.4f}")
print(f"mAP50-95:  {metrics.box.map:.4f}")
print(f"Precision: {metrics.box.mp:.4f}")
print(f"Recall:    {metrics.box.mr:.4f}")` :
projectType === 'segmentation' || projectType === 'instanceSeg' || projectType === 'mask' ? `print(f"mAP50 (box):  {metrics.box.map50:.4f}")
print(f"mAP50 (mask): {metrics.seg.map50:.4f}")
print(f"mAP50-95 (box):  {metrics.box.map:.4f}")
print(f"mAP50-95 (mask): {metrics.seg.map:.4f}")` :
projectType === 'classification' || projectType === 'multiLabel' ? `print(f"Top-1 Accuracy: {metrics.top1:.4f}")
print(f"Top-5 Accuracy: {metrics.top5:.4f}")` :
projectType === 'keypoints' ? `print(f"mAP50 (box):  {metrics.box.map50:.4f}")
print(f"mAP50 (pose): {metrics.pose.map50:.4f}")` :
`print(f"mAP50: {metrics.box.map50:.4f}")`}
print("-" * 40)

${saveMetricsCsv ? `# ============================================
# 6. ${t('export.code.template.exportMetrics').toUpperCase()}
# ============================================

metrics_dict = {
    'epochs': results.epoch,
    'train_loss': results.results_dict.get('train/loss', []),
    'val_loss': results.results_dict.get('val/loss', []),
}

metrics_df = pd.DataFrame(metrics_dict)
metrics_path = results.save_dir / 'metrics.csv'
metrics_df.to_csv(metrics_path, index=False)
print(f"\\n💾 ${t('export.code.template.metricsSaved')}: {metrics_path}")

` : ''}${savePredictions ? `# ============================================
# 7. ${t('export.code.template.visualizePredictions').toUpperCase()}
# ============================================

# ${t('export.code.template.predictValidation')}
val_results = model_best.predict(
    source='path/to/val/images',  # ${t('export.code.template.changeToValFolder')}
    save=True,                     # ${t('export.code.template.saveImagesWithPredictions')}
    conf=0.25,                     # ${t('export.code.template.minConfidence')}
    save_txt=False,                # ${t('export.code.template.dontSaveLabels')}
    save_crop=False,               # ${t('export.code.template.dontCropDetections')}
    project=results.save_dir,
    name='predictions'
)
print(f"\\n🎨 ${t('export.code.template.predictionsSaved')}: {results.save_dir / 'predictions'}")

` : ''}${exportOnnx || exportTorchscript || exportTflite || exportOpenvino || exportCoreml || exportTensorrt ? `# ============================================
# 8. ${t('export.code.template.exportProduction').toUpperCase()}
# ============================================

print("\\n📦 ${t('export.code.template.exportingProduction')}...")
${exportOnnx ? "\nmodel_best.export(format='onnx')  # ONNX - Universal\nprint('✅ ${t('export.code.template.onnxExported')}')" : ''}${exportTorchscript ? "\nmodel_best.export(format='torchscript')  # TorchScript - PyTorch nativo\nprint('✅ ${t('export.code.template.torchscriptExported')}')" : ''}${exportTflite ? "\nmodel_best.export(format='tflite')  # TensorFlow Lite - Móviles\nprint('✅ ${t('export.code.template.tfliteExported')}')" : ''}${exportOpenvino ? "\nmodel_best.export(format='openvino')  # OpenVINO - Intel CPUs\nprint('✅ ${t('export.code.template.openvinoExported')}')" : ''}${exportCoreml ? "\nmodel_best.export(format='coreml')  # CoreML - iOS/macOS\nprint('✅ ${t('export.code.template.coremlExported')}')" : ''}${exportTensorrt ? "\nmodel_best.export(format='engine')  # TensorRT - NVIDIA GPUs\nprint('✅ ${t('export.code.template.tensorrtExported')}')" : ''}

` : ''}print("\\n🎉 ${t('export.code.template.allDone')}!")
print(f"📁 ${t('export.code.template.resultsIn')}: {results.save_dir}")
print(f"🏆 ${t('export.code.template.bestModel')}: {best_model_path}")
`;
        } else if (framework === 'yolov5') {
            code = this._generateYOLOv5Code(projectName, projectType, epochs, batch, imgsz, device, model, optimizer, patience, augMosaic, augMixup, augHsv, augFlip, augRotate, augScale, saveConfMatrix);
        } else if (framework === 'yolo-nas') {
            code = this._generateYOLONASCode(projectName, batch, epochs, numClasses);
        } else if (framework === 'detectron2' || framework === 'detectron2-mask' || framework === 'detectron2-rotated') {
            code = this._generateDetectron2Code(framework, projectName, projectType, batch, lr, epochs, imgsz, numClasses, augFlip, savePlots);
        } else if (framework === 'timm' || framework === 'torchvision') {
            code = this._generateClassificationCode(framework, projectName, projectType, device, numClasses, batch, epochs, lr, imgsz, model, optimizer, augFlip, augRotate, augScale, augHsv, saveMetricsCsv, savePlots);
        } else if (framework === 'smp') {
            code = this._generateSMPCode(projectName, projectType, device, numClasses, batch, epochs, lr, imgsz, model, optimizer, augFlip, augRotate, augScale, augHsv, saveMetricsCsv);
        }

        const codePreview = document.getElementById('codePreview');
        if (codePreview) {
            codePreview.textContent = code;
        }
    }

    _generateYOLOv5Code(projectName, projectType, epochs, batch, imgsz, device, model, optimizer, patience, augMosaic, augMixup, augHsv, augFlip, augRotate, augScale, saveConfMatrix) {
        const t = (key) => this.t(key);
        return `"""
${projectName} - ${t('export.code.template.trainingScript')} (YOLOv5)
${t('export.code.template.generatedBy')}
Framework: YOLOv5
${t('export.code.template.projectType')}: ${this.getProjectTypeLabel(projectType)}

${t('export.code.template.importantCLI')}
"""

# ============================================
# 1. ${t('export.code.template.installation').toUpperCase()}
# ============================================
# ${t('export.code.template.cloneYOLOv5')}:
# !git clone https://github.com/ultralytics/yolov5
# %cd yolov5
# !pip install -r requirements.txt

# ============================================
# 2. ${t('export.code.template.trainCLI').toUpperCase()}
# ============================================

!python train.py \\
    --img ${imgsz} \\
    --batch ${batch} \\
    --epochs ${epochs} \\
    --data ../data.yaml \\
    --weights yolov5${model}.pt \\
    --device ${device === 'cuda:0' ? '0' : 'cpu'} \\
    --optimizer ${optimizer} \\
    --patience ${patience} \\
    --project ../runs/${projectType} \\
    --name ${projectName} \\${augMosaic ? '\n    --mosaic 1.0 \\' : ''}${augMixup ? '\n    --mixup 0.1 \\' : ''}${augHsv ? '\n    --hsv_h 0.015 --hsv_s 0.7 --hsv_v 0.4 \\' : ''}${augFlip ? '\n    --fliplr 0.5 --flipud 0.1 \\' : ''}${augRotate ? '\n    --degrees 10.0 \\' : ''}${augScale ? '\n    --scale 0.5 \\' : ''}
    --cache \\
    --save-period ${Math.ceil(parseInt(epochs) / 10)}

# ============================================
# 3. ${t('export.code.template.validate').toUpperCase()}
# ============================================

!python val.py \\
    --weights runs/train/${projectName}/weights/best.pt \\
    --data ../data.yaml \\
    --img ${imgsz} \\
    --task val${saveConfMatrix ? ' \\\n    --save-json --save-conf' : ''}

print("✅ ${t('export.code.template.yolov5Completed')}!")
print("📁 ${t('export.code.template.resultsIn')}: runs/train/${projectName}")
`;
    }

    _generateYOLONASCode(projectName, batch, epochs, numClasses) {
        const t = (key) => this.t(key);
        return `"""
${projectName} - ${t('export.code.template.trainingScript')} (YOLO-NAS)
${t('export.code.template.generatedBy')}
"""

from super_gradients.training import Trainer
from super_gradients.training import dataloaders
from super_gradients.training import models
from super_gradients.training.losses import PPYoloELoss
from super_gradients.training.metrics import DetectionMetrics_050

# 1. ${t('export.code.template.prepareTrainer')}
trainer = Trainer(experiment_name='${projectName}', ckpt_root_dir='checkpoints')

# 2. ${t('export.code.template.configureDataset')}
train_data = dataloaders.coco_detection_yolo_format_train(
    dataset_params={
        'data_dir': 'dataset/',
        'images_dir': 'images/train',
        'labels_dir': 'labels/train',
        'classes': ${numClasses}
    },
    dataloader_params={
        'batch_size': ${batch},
        'num_workers': 2
    }
)

val_data = dataloaders.coco_detection_yolo_format_val(
    dataset_params={
        'data_dir': 'dataset/',
        'images_dir': 'images/val',
        'labels_dir': 'labels/val',
        'classes': ${numClasses}
    },
    dataloader_params={
        'batch_size': ${batch},
        'num_workers': 2
    }
)

# 3. ${t('export.code.template.loadModel')}
model = models.get('yolo_nas_m', num_classes=${numClasses}, pretrained_weights="coco")

# 4. ${t('export.code.template.trainModel')}
trainer.train(
    model=model,
    training_params={
        'max_epochs': ${epochs},
        'lr_mode': 'cosine',
        'initial_lr': 5e-4,
        'optimizer': 'Adam',
        'loss': PPYoloELoss(),
        'valid_metrics_list': [DetectionMetrics_050(num_cls=${numClasses})],
        'metric_to_watch': 'mAP@0.50',
        'save_checkpoints': True
    },
    train_loader=train_data,
    valid_loader=val_data
)

print("✅ ${t('export.code.template.yolonasCompleted')}!")
`;
    }

    _generateDetectron2Code(framework, projectName, projectType, batch, lr, epochs, imgsz, numClasses, augFlip, savePlots) {
        const t = (key) => this.t(key);
        const isSegmentation = framework === 'detectron2-mask';
        const isRotated = framework === 'detectron2-rotated';
        const modelType = isSegmentation ? 'mask_rcnn' : isRotated ? 'FCOS' : 'faster_rcnn';

        return `"""
${projectName} - ${t('export.code.template.trainingScript')} (Detectron2)
${t('export.code.template.generatedBy')}
Framework: Detectron2 (${isSegmentation ? 'Mask R-CNN' : isRotated ? 'Rotated Detection' : 'Faster R-CNN'})
${t('export.code.template.projectType')}: ${this.getProjectTypeLabel(projectType)}

${t('export.code.template.importantDetectron2')}
"""

# ============================================
# 1. ${t('export.code.template.installation').toUpperCase()}
# ============================================
# pip install torch torchvision
# pip install 'git+https://github.com/facebookresearch/detectron2.git'
# pip install opencv-python pycocotools matplotlib

import os
import torch
from detectron2.engine import DefaultTrainer
from detectron2.config import get_cfg
from detectron2 import model_zoo
from detectron2.data import DatasetCatalog, MetadataCatalog
from detectron2.data.datasets import register_coco_instances
from detectron2.evaluation import COCOEvaluator
${savePlots ? 'import matplotlib.pyplot as plt' : ''}

print(f"PyTorch version: {torch.__version__}")
print(f"Detectron2 version: {torch.ops.detectron2._get_torch_version()}")

# ============================================
# 2. ${t('export.code.template.registerDataset').toUpperCase()}
# ============================================

# ${t('export.code.template.registerCOCO')}
register_coco_instances(
    "${projectName}_train",
    {},
    "./annotations/instances_train.json",
    "./images/train"
)

register_coco_instances(
    "${projectName}_val",
    {},
    "./annotations/instances_val.json",
    "./images/val"
)

# ============================================
# 3. ${t('export.code.template.modelConfiguration').toUpperCase()}
# ============================================

cfg = get_cfg()
cfg.merge_from_file(model_zoo.get_config_file(
    "COCO-${isSegmentation ? 'InstanceSegmentation' : isRotated ? 'Detection' : 'Detection'}/${modelType}_R_50_FPN_3x.yaml"
))

# Datasets
cfg.DATASETS.TRAIN = ("${projectName}_train",)
cfg.DATASETS.TEST = ("${projectName}_val",)
cfg.DATALOADER.NUM_WORKERS = 4

# ${t('export.code.template.pretrainedModel')}
cfg.MODEL.WEIGHTS = model_zoo.get_checkpoint_url(
    "COCO-${isSegmentation ? 'InstanceSegmentation' : 'Detection'}/${modelType}_R_50_FPN_3x.yaml"
)

# ${t('export.code.template.hyperparameters')}
cfg.SOLVER.IMS_PER_BATCH = ${batch}
cfg.SOLVER.BASE_LR = ${lr}
cfg.SOLVER.MAX_ITER = ${Math.ceil(parseInt(epochs) * 1000)}  # ${t('export.code.template.approxEpochs')}
cfg.SOLVER.STEPS = []  # Learning rate schedule
cfg.SOLVER.CHECKPOINT_PERIOD = ${Math.ceil(parseInt(epochs) * 100)}

# ${t('export.code.template.numClasses')}
cfg.MODEL.ROI_HEADS.NUM_CLASSES = ${numClasses}
${isSegmentation ? `cfg.MODEL.MASK_ON = True` : ''}

# ${t('export.code.template.dataAugmentation')}
cfg.INPUT.MIN_SIZE_TRAIN = (${Math.floor(parseInt(imgsz) * 0.8)}, ${imgsz})
cfg.INPUT.MAX_SIZE_TRAIN = ${Math.ceil(parseInt(imgsz) * 1.2)}
cfg.INPUT.MIN_SIZE_TEST = ${imgsz}
cfg.INPUT.MAX_SIZE_TEST = ${imgsz}${augFlip ? '\ncfg.INPUT.RANDOM_FLIP = "horizontal"' : ''}

# Output
cfg.OUTPUT_DIR = "./output/${projectName}"
os.makedirs(cfg.OUTPUT_DIR, exist_ok=True)

# ============================================
# 4. ${t('export.code.template.trainModel').toUpperCase()}
# ============================================

trainer = DefaultTrainer(cfg)
trainer.resume_or_load(resume=False)
trainer.train()

print("\\n✅ ${t('export.code.template.trainingCompleted')}!")
print(f"📁 ${t('export.code.template.resultsIn')}: {cfg.OUTPUT_DIR}")

# ============================================
# 5. ${t('export.code.template.evaluateModel').toUpperCase()}
# ============================================

from detectron2.evaluation import inference_on_dataset
from detectron2.data import build_detection_test_loader

evaluator = COCOEvaluator("${projectName}_val", cfg, False, output_dir=cfg.OUTPUT_DIR)
val_loader = build_detection_test_loader(cfg, "${projectName}_val")
results = inference_on_dataset(trainer.model, val_loader, evaluator)

print("\\n📊 ${t('export.code.template.finalMetrics').toUpperCase()}:")
print(results)
`;
    }

    _generateClassificationCode(framework, projectName, projectType, device, numClasses, batch, epochs, lr, imgsz, model, optimizer, augFlip, augRotate, augScale, augHsv, saveMetricsCsv, savePlots) {
        const t = (key) => this.t(key);
        const useTorchvision = framework === 'torchvision';

        return `"""
${projectName} - ${t('export.code.template.trainingScript')}
${t('export.code.template.generatedBy')}
Framework: ${useTorchvision ? 'TorchVision' : 'PyTorch timm'}
${t('export.code.template.projectType')}: ${this.getProjectTypeLabel(projectType)}

${t('export.code.template.importantClassification')}
"""

# ============================================
# 1. ${t('export.code.template.installation').toUpperCase()}
# ============================================
# pip install torch torchvision${!useTorchvision ? '\n# pip install timm  # PyTorch Image Models' : ''}
# pip install pillow numpy${saveMetricsCsv ? ' pandas' : ''}${savePlots ? ' matplotlib seaborn' : ''}

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision import transforms, datasets${useTorchvision ? ', models' : ''}${!useTorchvision ? '\nimport timm' : ''}
from pathlib import Path${saveMetricsCsv ? '\nimport pandas as pd' : ''}${savePlots ? '\nimport matplotlib.pyplot as plt' : ''}

print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")

# ============================================
# 2. ${t('export.code.template.configuration').toUpperCase()}
# ============================================

DEVICE = torch.device('${device.replace('cuda:0', 'cuda')}')
NUM_CLASSES = ${numClasses}
BATCH_SIZE = ${batch}
EPOCHS = ${epochs}
LEARNING_RATE = ${lr}
IMG_SIZE = ${imgsz}

# ============================================
# 3. ${t('export.code.template.dataAugmentation').toUpperCase()}
# ============================================

# ${t('export.code.template.trainTransforms')}
train_transform = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),${augFlip ? '\n    transforms.RandomHorizontalFlip(0.5),' : ''}${augRotate ? '\n    transforms.RandomRotation(10),' : ''}${augScale ? '\n    transforms.RandomResizedCrop(IMG_SIZE, scale=(0.8, 1.0)),' : ''}${augHsv ? '\n    transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.1),' : ''}
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                       std=[0.229, 0.224, 0.225])
])

# ${t('export.code.template.valTransforms')}
val_transform = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                       std=[0.229, 0.224, 0.225])
])

# ${t('export.code.template.loadDataset')}
train_dataset = datasets.ImageFolder('path/to/train', transform=train_transform)
val_dataset = datasets.ImageFolder('path/to/val', transform=val_transform)

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE,
                         shuffle=True, num_workers=4, pin_memory=True)
val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE,
                       shuffle=False, num_workers=4, pin_memory=True)

print(f"📦 ${t('export.code.template.trainSamples')}: {len(train_dataset)}")
print(f"📦 ${t('export.code.template.valSamples')}: {len(val_dataset)}")
print(f"📦 ${t('export.code.template.classes')}: {train_dataset.classes}")

# ============================================
# 4. ${t('export.code.template.model').toUpperCase()}
# ============================================

${useTorchvision ? `# ${t('export.code.template.torchvisionModels')}
model = models.resnet50(pretrained=True)  # ${t('export.code.template.options')}: resnet18, resnet50, efficientnet_b0
model.fc = nn.Linear(model.fc.in_features, NUM_CLASSES)` : `# ${t('export.code.template.timmModels')}
model = timm.create_model('efficientnet_b${model === 'n' ? '0' : model === 's' ? '1' : model === 'm' ? '2' : model === 'l' ? '3' : '4'}',
                         pretrained=True,
                         num_classes=NUM_CLASSES)`}

model = model.to(DEVICE)
print(f"✅ ${t('export.code.template.modelLoaded')}")
print(f"📦 ${t('export.code.template.parameters')}: {sum(p.numel() for p in model.parameters()):,}")

# ============================================
# 5. ${t('export.code.template.lossOptimizer').toUpperCase()}
# ============================================

criterion = nn.CrossEntropyLoss()
optimizer = optim.${optimizer}(model.parameters(), lr=LEARNING_RATE)
scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)

# ============================================
# 6. ${t('export.code.template.training').toUpperCase()}
# ============================================

best_acc = 0.0
history = {'train_loss': [], 'val_loss': [], 'train_acc': [], 'val_acc': []}

for epoch in range(EPOCHS):
    # ${t('export.code.template.training')}
    model.train()
    train_loss = 0.0
    train_correct = 0
    train_total = 0

    for inputs, labels in train_loader:
        inputs, labels = inputs.to(DEVICE), labels.to(DEVICE)

        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        train_loss += loss.item()
        _, predicted = outputs.max(1)
        train_total += labels.size(0)
        train_correct += predicted.eq(labels).sum().item()

    # ${t('export.code.template.validation')}
    model.eval()
    val_loss = 0.0
    val_correct = 0
    val_total = 0

    with torch.no_grad():
        for inputs, labels in val_loader:
            inputs, labels = inputs.to(DEVICE), labels.to(DEVICE)
            outputs = model(inputs)
            loss = criterion(outputs, labels)

            val_loss += loss.item()
            _, predicted = outputs.max(1)
            val_total += labels.size(0)
            val_correct += predicted.eq(labels).sum().item()

    # ${t('export.code.template.metrics')}
    train_acc = 100. * train_correct / train_total
    val_acc = 100. * val_correct / val_total

    history['train_loss'].append(train_loss / len(train_loader))
    history['val_loss'].append(val_loss / len(val_loader))
    history['train_acc'].append(train_acc)
    history['val_acc'].append(val_acc)

    print(f"Epoch [{epoch+1}/{EPOCHS}] - "
          f"Train Loss: {train_loss/len(train_loader):.4f}, "
          f"Train Acc: {train_acc:.2f}%, "
          f"Val Loss: {val_loss/len(val_loader):.4f}, "
          f"Val Acc: {val_acc:.2f}%")

    # ${t('export.code.template.saveBestModel')}
    if val_acc > best_acc:
        best_acc = val_acc
        torch.save(model.state_dict(), 'best_model.pth')
        print(f"💾 ${t('export.code.template.bestModelSaved')} (accuracy: {best_acc:.2f}%)")

    scheduler.step()

print("\\n✅ ${t('export.code.template.trainingCompleted')}!")
print(f"🏆 ${t('export.code.template.bestAccuracy')}: {best_acc:.2f}%")

${saveMetricsCsv ? `# ${t('export.code.template.saveMetrics')}
metrics_df = pd.DataFrame(history)
metrics_df.to_csv('training_metrics.csv', index=False)
print("💾 ${t('export.code.template.metricsSaved')}: training_metrics.csv")` : ''}

${savePlots ? `# ${t('export.code.template.plotResults')}
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))

ax1.plot(history['train_loss'], label='Train')
ax1.plot(history['val_loss'], label='Val')
ax1.set_title('Loss')
ax1.legend()

ax2.plot(history['train_acc'], label='Train')
ax2.plot(history['val_acc'], label='Val')
ax2.set_title('Accuracy')
ax2.legend()

plt.savefig('training_curves.png')
print("📊 ${t('export.code.template.plotsSaved')}: training_curves.png")` : ''}
`;
    }

    _generateSMPCode(projectName, projectType, device, numClasses, batch, epochs, lr, imgsz, model, optimizer, augFlip, augRotate, augScale, augHsv, saveMetricsCsv) {
        const t = (key) => this.t(key);
        return `"""
${projectName} - ${t('export.code.template.trainingScript')}
${t('export.code.template.generatedBy')}
Framework: segmentation_models.pytorch
${t('export.code.template.projectType')}: ${this.getProjectTypeLabel(projectType)}

${t('export.code.template.importantSegmentation')}
"""

# ============================================
# 1. ${t('export.code.template.installation').toUpperCase()}
# ============================================
# pip install segmentation-models-pytorch
# pip install torch torchvision
# pip install albumentations opencv-python${saveMetricsCsv ? ' pandas' : ''}

import torch
import segmentation_models_pytorch as smp
from torch.utils.data import Dataset, DataLoader
import albumentations as A
from albumentations.pytorch import ToTensorV2
import cv2
import numpy as np
from pathlib import Path${saveMetricsCsv ? '\nimport pandas as pd' : ''}

print(f"PyTorch version: {torch.__version__}")
print(f"SMP version: {smp.__version__}")

# ============================================
# 2. ${t('export.code.template.configuration').toUpperCase()}
# ============================================

DEVICE = torch.device('${device.replace('cuda:0', 'cuda')}')
NUM_CLASSES = ${numClasses}
BATCH_SIZE = ${batch}
EPOCHS = ${epochs}
LEARNING_RATE = ${lr}
IMG_SIZE = ${imgsz}

# ============================================
# 3. ${t('export.code.template.customDataset').toUpperCase()}
# ============================================

class SegmentationDataset(Dataset):
    def __init__(self, images_dir, masks_dir, transform=None):
        self.images_dir = Path(images_dir)
        self.masks_dir = Path(masks_dir)
        self.transform = transform
        self.images = sorted(list(self.images_dir.glob('*.png')) + list(self.images_dir.glob('*.jpg')))

    def __len__(self):
        return len(self.images)

    def __getitem__(self, idx):
        img_path = self.images[idx]
        mask_path = self.masks_dir / f"{img_path.stem}.png"

        image = cv2.imread(str(img_path))
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)

        if self.transform:
            transformed = self.transform(image=image, mask=mask)
            image = transformed['image']
            mask = transformed['mask']

        return image, mask.long()

# ${t('export.code.template.dataAugmentation')}
train_transform = A.Compose([
    A.Resize(IMG_SIZE, IMG_SIZE),${augFlip ? '\n    A.HorizontalFlip(p=0.5),' : ''}${augRotate ? '\n    A.Rotate(limit=10, p=0.5),' : ''}${augScale ? '\n    A.RandomScale(scale_limit=0.2, p=0.5),' : ''}${augHsv ? '\n    A.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.1, p=0.5),' : ''}
    A.Normalize(),
    ToTensorV2(),
])

val_transform = A.Compose([
    A.Resize(IMG_SIZE, IMG_SIZE),
    A.Normalize(),
    ToTensorV2(),
])

train_dataset = SegmentationDataset('path/to/train/images', 'path/to/train/masks', train_transform)
val_dataset = SegmentationDataset('path/to/val/images', 'path/to/val/masks', val_transform)

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=4)
val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=4)

# ============================================
# 4. ${t('export.code.template.model').toUpperCase()}
# ============================================

# ${t('export.code.template.availableArchitectures')}: Unet, UnetPlusPlus, MAnet, Linknet, FPN, PSPNet, DeepLabV3, DeepLabV3Plus
model = smp.Unet(
    encoder_name="resnet${model === 'n' ? '18' : model === 's' ? '34' : model === 'm' ? '50' : model === 'l' ? '101' : '152'}",
    encoder_weights="imagenet",
    in_channels=3,
    classes=NUM_CLASSES,
)

model = model.to(DEVICE)
print(f"✅ ${t('export.code.template.unetLoaded')}")

# ============================================
# 5. ${t('export.code.template.lossOptimizer').toUpperCase()}
# ============================================

loss_fn = smp.losses.DiceLoss(mode='multiclass')
optimizer = torch.optim.${optimizer}(model.parameters(), lr=LEARNING_RATE)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)

metrics = [
    smp.utils.metrics.IoU(threshold=0.5),
    smp.utils.metrics.Fscore(threshold=0.5),
]

# ============================================
# 6. ${t('export.code.template.training').toUpperCase()}
# ============================================

best_iou = 0.0
history = {'train_loss': [], 'val_loss': [], 'val_iou': []}

for epoch in range(EPOCHS):
    # ${t('export.code.template.training')}
    model.train()
    train_loss = 0.0

    for images, masks in train_loader:
        images, masks = images.to(DEVICE), masks.to(DEVICE)

        optimizer.zero_grad()
        outputs = model(images)
        loss = loss_fn(outputs, masks)
        loss.backward()
        optimizer.step()

        train_loss += loss.item()

    # ${t('export.code.template.validation')}
    model.eval()
    val_loss = 0.0
    val_ious = []

    with torch.no_grad():
        for images, masks in val_loader:
            images, masks = images.to(DEVICE), masks.to(DEVICE)
            outputs = model(images)
            loss = loss_fn(outputs, masks)
            val_loss += loss.item()

            # ${t('export.code.template.calculateIoU')}
            tp, fp, fn, tn = smp.metrics.get_stats(outputs.argmax(1), masks, mode='multiclass', num_classes=NUM_CLASSES)
            iou = smp.metrics.iou_score(tp, fp, fn, tn, reduction="micro")
            val_ious.append(iou.item())

    avg_val_iou = np.mean(val_ious)

    history['train_loss'].append(train_loss / len(train_loader))
    history['val_loss'].append(val_loss / len(val_loader))
    history['val_iou'].append(avg_val_iou)

    print(f"Epoch [{epoch+1}/{EPOCHS}] - "
          f"Train Loss: {train_loss/len(train_loader):.4f}, "
          f"Val Loss: {val_loss/len(val_loader):.4f}, "
          f"Val IoU: {avg_val_iou:.4f}")

    if avg_val_iou > best_iou:
        best_iou = avg_val_iou
        torch.save(model.state_dict(), 'best_unet.pth')
        print(f"💾 ${t('export.code.template.bestModelSaved')} (IoU: {best_iou:.4f})")

    scheduler.step()

print("\\n✅ ${t('export.code.template.trainingCompleted')}!")
print(f"🏆 ${t('export.code.template.bestIoU')}: {best_iou:.4f}")
`;
    }

    getYOLOTask(projectType) {
        if (projectType === 'classification' || projectType === 'multiLabel') return '-cls';
        if (projectType === 'segmentation' || projectType === 'instanceSeg' || projectType === 'mask') return '-seg';
        if (projectType === 'keypoints') return '-pose';
        if (projectType === 'obb') return '-obb';
        return '';  // detection (includes 'bbox')
    }

    getProjectTypeLabel(projectType) {
        const labels = {
            'bbox': 'Object Detection (Bounding Boxes)',
            'mask': 'Instance Segmentation (Masks)',
            'classification': this.t('projectTypes.classification'),
            'multiLabel': this.t('projectTypes.multiLabel'),
            'detection': this.t('projectTypes.detection'),
            'segmentation': this.t('projectTypes.segmentation'),
            'instanceSeg': this.t('projectTypes.instanceSeg'),
            'keypoints': this.t('projectTypes.keypoints'),
            'obb': this.t('projectTypes.obb')
        };
        return labels[projectType] || projectType;
    }

    async copyCode() {
        const code = document.getElementById('codePreview')?.textContent;
        if (code) {
            try {
                await navigator.clipboard.writeText(code);
                this.ui.showToast(this.t('export.code.codeCopied'), 'success');
            } catch (err) {
                this.ui.showToast(this.t('export.code.copyError'), 'error');
            }
        }
    }

    downloadCode(format) {
        const code = document.getElementById('codePreview')?.textContent;
        const projectName = this.projectManager.currentProject?.name || 'training';

        if (format === 'py') {
            const blob = new Blob([code], { type: 'text/x-python' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${projectName}_train.py`;
            a.click();
            URL.revokeObjectURL(url);
            this.ui.showToast(this.t('export.code.pyDownloaded'), 'success');
        } else if (format === 'ipynb') {
            // Create Jupyter notebook format
            const notebook = {
                cells: [
                    {
                        cell_type: 'markdown',
                        metadata: {},
                        source: [`# ${projectName} - ${this.t('export.code.trainingNotebook')}\n\n${this.t('export.code.template.generatedBy')}`]
                    },
                    {
                        cell_type: 'code',
                        execution_count: null,
                        metadata: {},
                        outputs: [],
                        source: code.split('\n')
                    }
                ],
                metadata: {
                    kernelspec: {
                        display_name: 'Python 3',
                        language: 'python',
                        name: 'python3'
                    },
                    language_info: {
                        name: 'python',
                        version: '3.8.0'
                    }
                },
                nbformat: 4,
                nbformat_minor: 4
            };

            const blob = new Blob([JSON.stringify(notebook, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${projectName}_train.ipynb`;
            a.click();
            URL.revokeObjectURL(url);
            this.ui.showToast(this.t('export.code.ipynbDownloaded'), 'success');
        }
    }

    _generateTimeSeriesCode(framework, projectName, projectType, device, numClasses, batch, epochs, lr, optimizer, saveMetricsCsv, savePlots, seqLength, forecastHorizon, hiddenSize) {
        const t = (key) => this.t(key);
        const projectTypeLabel = this.getProjectTypeLabel(projectType);

        if (framework === 'ts-pytorch' || framework === 'ts-pytorch-forecast' || framework === 'ts-pytorch-anomaly') {
            const isForecasting = framework === 'ts-pytorch-forecast';
            const isAnomaly = framework === 'ts-pytorch-anomaly';
            const isClassification = !isForecasting && !isAnomaly;

            return `"""
${projectName} - ${t('export.code.template.trainModel')}
${t('export.code.template.generatedBy')}
Framework: PyTorch (LSTM/GRU/Transformer)
${t('export.code.template.projectType')}: ${projectTypeLabel}

${t('export.code.template.important')}: ${t('export.code.template.installDeps')}
"""

# ============================================
# 1. ${t('export.code.template.installation')}
# ============================================
# ${t('export.code.template.executeCmds')}:
# pip install torch numpy pandas scikit-learn${saveMetricsCsv ? '\n# pip install pandas  # ' + t('export.code.template.forExportMetrics') : ''}${savePlots ? '\n# pip install matplotlib seaborn  # ' + t('export.code.template.forVisualization') : ''}

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split${savePlots ? '\nimport matplotlib.pyplot as plt\nimport seaborn as sns' : ''}

print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")

# ============================================
# 2. ${t('export.code.template.configuration')}
# ============================================

DEVICE = torch.device('${device.replace('cuda:0', 'cuda')}' if torch.cuda.is_available() else 'cpu')
NUM_CLASSES = ${numClasses}
BATCH_SIZE = ${batch}
EPOCHS = ${epochs}
LEARNING_RATE = ${lr}
HIDDEN_SIZE = ${hiddenSize}
SEQUENCE_LENGTH = ${seqLength}
${isForecasting ? `FORECAST_HORIZON = ${forecastHorizon}  # Pasos a predecir` : ''}

print(f"Device: {DEVICE}")

# ============================================
# 3. ${t('export.code.template.dataLoading')}
# ============================================

# Cargar tus datos de series temporales
# Formato esperado: CSV con columnas [timestamp, feature1, feature2, ..., target]
df = pd.read_csv('path/to/your/timeseries.csv')

# ${t('export.code.template.prepareData')}
${isClassification ? `# Para clasificación: última columna debe ser la clase (0 a ${numClasses-1})
features = df.iloc[:, :-1].values
labels = df.iloc[:, -1].values` : isForecasting ? `# Para pronóstico: todas las columnas son features, predeciremos la primera
features = df.values` : `# Para detección de anomalías: todas las columnas son features
features = df.values`}

# Escalar datos
scaler = StandardScaler()
features_scaled = scaler.fit_transform(features)

# Crear secuencias
def create_sequences(data, seq_length${isForecasting ? ', forecast_horizon' : ''}):
    xs, ys = [], []
    for i in range(len(data) - seq_length${isForecasting ? ' - forecast_horizon + 1' : ''}):
        x = data[i:(i + seq_length)]
        ${isForecasting ? `y = data[(i + seq_length):(i + seq_length + forecast_horizon), 0]  # Predecir primera columna` : isClassification ? `y = labels[i + seq_length - 1]` : `y = data[i + seq_length]`}
        xs.append(x)
        ys.append(y)
    return np.array(xs), np.array(ys)

${isForecasting ? `X, y = create_sequences(features_scaled, SEQUENCE_LENGTH, FORECAST_HORIZON)` : `X, y = create_sequences(features_scaled, SEQUENCE_LENGTH)`}

# Train/Test split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=${!isForecasting})

print(f"${t('export.code.template.trainSamples')}: {len(X_train)}")
print(f"${t('export.code.template.testSamples')}: {len(X_test)}")
print(f"${t('export.code.template.sequenceLength')}: {SEQUENCE_LENGTH}")
print(f"${t('export.code.template.numFeatures')}: {X_train.shape[2]}")

# ============================================
# 4. DATASET Y DATALOADER
# ============================================

class TimeSeriesDataset(Dataset):
    def __init__(self, X, y):
        self.X = torch.FloatTensor(X)
        self.y = torch.${isClassification ? 'LongTensor' : 'FloatTensor'}(y)

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]

train_dataset = TimeSeriesDataset(X_train, y_train)
test_dataset = TimeSeriesDataset(X_test, y_test)

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False)

# ============================================
# 5. ${t('export.code.template.modelArchitecture')}
# ============================================

class ${isClassification ? 'TimeSeriesClassifier' : isForecasting ? 'TimeSeriesForecaster' : 'TimeSeriesAnomalyDetector'}(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers=2${isClassification ? ', num_classes=' + numClasses : isForecasting ? ', forecast_horizon=' + 'FORECAST_HORIZON' : ''}):
        super().__init__()

        # LSTM layers
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers,
                           batch_first=True, dropout=0.2 if num_layers > 1 else 0)

        # Fully connected layers
        ${isClassification ? `self.fc = nn.Linear(hidden_size, num_classes)` : isForecasting ? `self.fc = nn.Linear(hidden_size, forecast_horizon)` : `self.fc = nn.Linear(hidden_size, input_size)  # Reconstrucción`}

    def forward(self, x):
        # x shape: (batch, seq_length, features)
        lstm_out, (hidden, cell) = self.lstm(x)

        # Usar último estado oculto
        ${isClassification || isForecasting ? `out = self.fc(lstm_out[:, -1, :])` : `out = self.fc(lstm_out[:, -1, :])  # Reconstruir última secuencia`}
        return out

model = ${isClassification ? 'TimeSeriesClassifier' : isForecasting ? 'TimeSeriesForecaster' : 'TimeSeriesAnomalyDetector'}(
    input_size=X_train.shape[2],
    hidden_size=HIDDEN_SIZE${isClassification ? '' : isForecasting ? ',\n    forecast_horizon=FORECAST_HORIZON' : ''}
).to(DEVICE)

print(f"✅ ${t('export.code.template.modelLoaded')}")
print(f"📦 ${t('export.code.template.parameters')}: {sum(p.numel() for p in model.parameters()):,}")

# ============================================
# 6. ${t('export.code.template.lossAndOptimizer')}
# ============================================

criterion = nn.${isClassification ? 'CrossEntropyLoss' : 'MSELoss'}()
optimizer = optim.${optimizer}(model.parameters(), lr=LEARNING_RATE)
scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', patience=10, factor=0.5)

# ============================================
# 7. ${t('export.code.template.trainTest')}
# ============================================

history = {'train_loss': [], 'test_loss': []${isClassification ? ", 'train_acc': [], 'test_acc': []" : ''}}
best_loss = float('inf')

for epoch in range(EPOCHS):
    # ${t('export.code.template.trainEpoch')}
    model.train()
    train_loss = 0.0
    ${isClassification ? `train_correct = 0
    train_total = 0` : ''}

    for batch_X, batch_y in train_loader:
        batch_X, batch_y = batch_X.to(DEVICE), batch_y.to(DEVICE)

        optimizer.zero_grad()
        outputs = model(batch_X)
        loss = criterion(outputs, batch_y)
        loss.backward()
        optimizer.step()

        train_loss += loss.item()
        ${isClassification ? `
        _, predicted = outputs.max(1)
        train_total += batch_y.size(0)
        train_correct += predicted.eq(batch_y).sum().item()` : ''}

    # ${t('export.code.template.testEpoch')}
    model.eval()
    test_loss = 0.0
    ${isClassification ? `test_correct = 0
    test_total = 0` : ''}

    with torch.no_grad():
        for batch_X, batch_y in test_loader:
            batch_X, batch_y = batch_X.to(DEVICE), batch_y.to(DEVICE)
            outputs = model(batch_X)
            loss = criterion(outputs, batch_y)
            test_loss += loss.item()
            ${isClassification ? `
            _, predicted = outputs.max(1)
            test_total += batch_y.size(0)
            test_correct += predicted.eq(batch_y).sum().item()` : ''}

    # Métricas
    avg_train_loss = train_loss / len(train_loader)
    avg_test_loss = test_loss / len(test_loader)
    ${isClassification ? `train_acc = 100. * train_correct / train_total
    test_acc = 100. * test_correct / test_total` : ''}

    history['train_loss'].append(avg_train_loss)
    history['test_loss'].append(avg_test_loss)
    ${isClassification ? `history['train_acc'].append(train_acc)
    history['test_acc'].append(test_acc)` : ''}

    print(f"Epoch [{epoch+1}/{EPOCHS}] - "
          f"${t('export.code.template.trainLoss')}: {avg_train_loss:.4f}, "
          f"${t('export.code.template.testLoss')}: {avg_test_loss:.4f}"
          ${isClassification ? `f", ${t('export.code.template.trainAcc')}: {train_acc:.2f}%, "
          f"${t('export.code.template.testAcc')}: {test_acc:.2f}%"` : ''})

    # Guardar mejor modelo
    if avg_test_loss < best_loss:
        best_loss = avg_test_loss
        torch.save(model.state_dict(), 'best_model.pth')
        print(f"💾 ${t('export.code.template.saveBestModel')}: {best_loss:.4f})")

    scheduler.step(avg_test_loss)

print(f"\\n✅ ${t('export.code.template.trainingCompleted')}")
${saveMetricsCsv ? `
# ${t('export.code.template.saveMetrics')}
metrics_df = pd.DataFrame(history)
metrics_df.to_csv('training_metrics.csv', index=False)
print(f"💾 ${t('export.code.template.metricsSaved')}: training_metrics.csv")` : ''}
${savePlots ? `
# ${t('export.code.template.plotResults')}
plt.figure(figsize=(12, 4))

plt.subplot(1, ${isClassification ? '2' : '1'}, 1)
plt.plot(history['train_loss'], label='Train')
plt.plot(history['test_loss'], label='Test')
plt.title('Loss')
plt.xlabel('Epoch')
plt.ylabel('Loss')
plt.legend()
${isClassification ? `
plt.subplot(1, 2, 2)
plt.plot(history['train_acc'], label='Train')
plt.plot(history['test_acc'], label='Test')
plt.title('Accuracy')
plt.xlabel('Epoch')
plt.ylabel('Accuracy (%)')
plt.legend()` : ''}

plt.tight_layout()
plt.savefig('training_curves.png')
print("📊 Gráficos guardados en: training_curves.png")` : ''}
${isForecasting ? `
# ============================================
# 8. ${t('export.code.template.forecasting')}
# ============================================

model.load_state_dict(torch.load('best_model.pth'))
model.eval()

# ${t('export.code.template.makePredictions')}
with torch.no_grad():
    sample_X = torch.FloatTensor(X_test[:5]).to(DEVICE)
    predictions = model(sample_X).cpu().numpy()

    # Desescalar predicciones
    predictions_descaled = scaler.inverse_transform(
        np.concatenate([predictions, np.zeros((predictions.shape[0], features.shape[1] - predictions.shape[1]))], axis=1)
    )[:, :predictions.shape[1]]

    print(f"\\n${t('export.code.template.predictionsMade')}:")
    print(predictions_descaled)` : ''}

print("\\n🎉 ${t('export.code.template.allDone')}")
`;
        } else if (framework === 'ts-tensorflow' || framework === 'ts-tensorflow-forecast' || framework === 'ts-tensorflow-anomaly') {
            // Similar structure for TensorFlow/Keras
            return `# TensorFlow/Keras ${t('export.code.template.important')}\n# Coming soon...`;
        } else if (framework === 'sktime') {
            return `# sktime ${t('export.code.template.important')}\n# Coming soon...`;
        } else if (framework === 'prophet') {
            return `# Prophet ${t('export.code.template.important')}\n# Coming soon...`;
        } else {
            return `# ${framework} ${t('export.code.template.important')}\n# Coming soon...`;
        }
    }
}
