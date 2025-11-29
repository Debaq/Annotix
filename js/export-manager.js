/**
 * EXPORT MANAGER
 * Centralized manager for all dataset export formats
 * Supports: YOLO, COCO, Pascal VOC, Masks PNG, CSV, JSON, Folders
 */

class ExportManager {
    constructor(db, ui) {
        this.db = db;
        this.ui = ui;
    }

    /**
     * Main export router - selects appropriate export method based on format and project type
     */
    async exportDataset(format, project, images) {
        if (!project || !images || images.length === 0) {
            this.ui.showToast(window.i18n.t('notifications.error.noImages'), 'error');
            return;
        }

        try {
            this.ui.showToast(window.i18n.t('export.preparing'), 'info');

            switch (format) {
                case 'yolo':
                    if (project.type === 'bbox' || project.type === 'detection') {
                        await this.exportYOLODetection(project, images);
                    } else if (project.type === 'landmarks') {
                        await this.exportYOLOLandmarks(project, images);
                    } else {
                        this.ui.showToast('YOLO Detection solo para proyectos bbox/landmarks', 'error');
                    }
                    break;

                case 'yoloSeg':
                    if (project.type === 'mask' || project.type === 'segmentation') {
                        await this.exportYOLOSegmentation(project, images);
                    } else if (project.type === 'polygon') {
                        await this.exportYOLOPolygon(project, images);
                    } else {
                        this.ui.showToast('YOLO Segmentation solo para proyectos mask/polygon', 'error');
                    }
                    break;

                case 'yoloPose':
                    if (project.type === 'keypoints') {
                        await this.exportYOLOPose(project, images);
                    } else {
                        this.ui.showToast('YOLO Pose solo para proyectos keypoints', 'error');
                    }
                    break;

                case 'coco':
                    if (project.type === 'bbox' || project.type === 'detection') {
                        await this.exportCOCODetection(project, images);
                    } else if (project.type === 'mask' || project.type === 'segmentation') {
                        await this.exportCOCOSegmentation(project, images);
                    } else if (project.type === 'polygon') {
                        await this.exportCOCOPolygon(project, images);
                    } else if (project.type === 'keypoints') {
                        await this.exportCOCOKeypoints(project, images);
                    }
                    break;

                case 'masksPng':
                    if (project.type === 'mask' || project.type === 'segmentation') {
                        await this.exportMasksPNG(project, images);
                    } else {
                        this.ui.showToast('Máscaras PNG solo para proyectos mask', 'error');
                    }
                    break;

                case 'voc':
                    if (project.type === 'bbox' || project.type === 'detection') {
                        await this.exportPascalVOC(project, images);
                    } else {
                        this.ui.showToast('Pascal VOC solo para proyectos bbox', 'error');
                    }
                    break;

                case 'csv':
                    if (project.type === 'classification') {
                        await this.exportClassificationCSV(project, images);
                    } else if (project.type === 'landmarks') {
                        await this.exportLandmarksCSV(project, images);
                    } else {
                        await this.exportGenericCSV(project, images);
                    }
                    break;

                case 'folders':
                    if (project.type === 'classification') {
                        await this.exportFoldersByClass(project, images);
                    } else {
                        this.ui.showToast('Carpetas por clase solo para clasificación', 'error');
                    }
                    break;

                case 'json':
                    await this.exportJSON(project, images);
                    break;

                default:
                    this.ui.showToast('Formato no soportado: ' + format, 'error');
            }
        } catch (error) {
            console.error('Error exporting dataset:', error);
            this.ui.showToast(window.i18n.t('notifications.error.export'), 'error');
        }
    }

    /**
     * YOLO DETECTION FORMAT
     * Format: <class_id> <x_center> <y_center> <width> <height> (normalized 0-1)
     */
    async exportYOLODetection(project, images) {
        console.log(`=== YOLO Detection Export ===`);
        console.log(`Project: ${project.name}`);
        console.log(`Total images: ${images.length}`);

        // Count images with annotations
        const imagesWithAnnotations = images.filter(img => img.annotations && img.annotations.length > 0);
        console.log(`Images with annotations: ${imagesWithAnnotations.length}`);

        const zip = new JSZip();

        // Create data.yaml
        const yamlContent = this.generateYOLODataYaml(project, 'detection');
        zip.file('data.yaml', yamlContent);

        // Create classes.txt
        const classesContent = project.classes.map(c => c.name).join('\n');
        zip.file('classes.txt', classesContent);

        // Process each image
        for (const img of images) {
            // Add image with proper extension
            const imageBlob = img.image;
            const imageFilename = this.getImageFilename(img);
            zip.file(`images/${imageFilename}`, imageBlob);

            // Generate label file (even if empty - YOLO format requires .txt for each image)
            const labelContent = this.generateYOLODetectionLabels(img);
            const labelFilename = imageFilename.replace(/\.[^.]+$/, '.txt');
            zip.file(`labels/${labelFilename}`, labelContent || ''); // Always create .txt, even if empty
        }

        // Generate and download ZIP
        const blob = await zip.generateAsync({ type: 'blob' });
        this.downloadFile(blob, `${project.name}_yolo_detection.zip`);

        // Show summary
        if (imagesWithAnnotations.length === 0) {
            this.ui.showToast(`⚠️ Exportado: ${images.length} imágenes, pero ninguna tiene anotaciones. Asegúrate de guardar (Ctrl+S) después de anotar cada imagen.`, 'warning');
        } else if (imagesWithAnnotations.length < images.length) {
            this.ui.showToast(`✓ Exportado: ${images.length} imágenes (${imagesWithAnnotations.length} con anotaciones, ${images.length - imagesWithAnnotations.length} sin anotaciones)`, 'success');
        } else {
            this.ui.showToast(`✓ Exportado: ${images.length} imágenes con anotaciones`, 'success');
        }
    }

    generateYOLODetectionLabels(image) {
        let content = '';

        // Check if annotations exist
        if (!image.annotations || !Array.isArray(image.annotations)) {
            console.warn(`Image "${image.name}" has no annotations array`);
            return content;
        }

        let bboxCount = 0;
        image.annotations.forEach(ann => {
            if (ann.type === 'bbox') {
                const { x, y, width, height } = ann.data;
                const x_center = (x + width / 2) / image.width;
                const y_center = (y + height / 2) / image.height;
                const w = width / image.width;
                const h = height / image.height;

                content += `${ann.class} ${x_center.toFixed(6)} ${y_center.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}\n`;
                bboxCount++;
            }
        });

        const filename = this.getImageFilename(image);
        console.log(`Image "${filename}": ${bboxCount} bounding boxes exported`);
        return content;
    }

    /**
     * YOLO SEGMENTATION FORMAT
     * Format: <class_id> <x1> <y1> <x2> <y2> <x3> <y3> ... (normalized polygon points)
     */
    async exportYOLOSegmentation(project, images) {
        const zip = new JSZip();

        // Create data.yaml
        const yamlContent = this.generateYOLODataYaml(project, 'segmentation');
        zip.file('data.yaml', yamlContent);

        // Create classes.txt
        const classesContent = project.classes.map(c => c.name).join('\n');
        zip.file('classes.txt', classesContent);

        // Process each image
        for (const img of images) {
            // Add image with proper extension
            const imageBlob = img.image;
            const imageFilename = this.getImageFilename(img);
            zip.file(`images/${imageFilename}`, imageBlob);

            // Generate label file with polygons (even if empty)
            const labelContent = await this.generateYOLOSegmentationLabels(img);
            const labelFilename = imageFilename.replace(/\.[^.]+$/, '.txt');
            zip.file(`labels/${labelFilename}`, labelContent || '');
        }

        // Generate and download ZIP
        const blob = await zip.generateAsync({ type: 'blob' });
        this.downloadFile(blob, `${project.name}_yolo_segmentation.zip`);
        this.ui.showToast(window.i18n.t('export.success'), 'success');
    }

    async generateYOLOSegmentationLabels(image) {
        let content = '';

        for (const ann of image.annotations) {
            if (ann.type === 'mask') {
                // Convert mask (Base64 PNG) to polygon
                const polygon = await this.maskToPolygon(ann.data, image.width, image.height);

                if (polygon && polygon.length > 0) {
                    // Normalize coordinates
                    const normalizedPoints = polygon.map((coord, idx) => {
                        if (idx % 2 === 0) {
                            return (coord / image.width).toFixed(6);
                        } else {
                            return (coord / image.height).toFixed(6);
                        }
                    }).join(' ');

                    content += `${ann.class} ${normalizedPoints}\n`;
                }
            }
        }

        return content;
    }

    /**
     * Convert mask image (Base64) to polygon points using contour tracing
     */
    async maskToPolygon(base64Data, imageWidth, imageHeight) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = imageWidth;
                canvas.height = imageHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                const imageData = ctx.getImageData(0, 0, imageWidth, imageHeight);
                const polygon = this.traceContour(imageData);

                resolve(polygon);
            };
            img.onerror = reject;
            img.src = base64Data;
        });
    }

    /**
     * Simple contour tracing algorithm to extract polygon from binary mask
     * Uses Moore-Neighbor tracing
     */
    traceContour(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        // Find first non-transparent pixel (starting point)
        let startX = -1, startY = -1;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                if (data[idx + 3] > 128) { // Alpha > 128
                    startX = x;
                    startY = y;
                    break;
                }
            }
            if (startX !== -1) break;
        }

        if (startX === -1) return []; // No mask found

        // Moore-Neighbor directions (8-connectivity)
        const dirs = [
            [0, -1], [1, -1], [1, 0], [1, 1],
            [0, 1], [-1, 1], [-1, 0], [-1, -1]
        ];

        const contour = [];
        let x = startX, y = startY;
        let dir = 0;
        const visited = new Set();

        do {
            contour.push(x, y);
            visited.add(`${x},${y}`);

            // Search for next boundary pixel
            let found = false;
            for (let i = 0; i < 8; i++) {
                const checkDir = (dir + i) % 8;
                const nx = x + dirs[checkDir][0];
                const ny = y + dirs[checkDir][1];

                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const idx = (ny * width + nx) * 4;
                    if (data[idx + 3] > 128) {
                        x = nx;
                        y = ny;
                        dir = (checkDir + 6) % 8; // Turn left
                        found = true;
                        break;
                    }
                }
            }

            if (!found) break;

            // Safety limit
            if (contour.length > 10000) break;

        } while (x !== startX || y !== startY);

        // Simplify polygon using Douglas-Peucker algorithm
        return this.simplifyPolygon(contour, 2.0);
    }

    /**
     * Douglas-Peucker algorithm for polygon simplification
     */
    simplifyPolygon(points, tolerance) {
        if (points.length <= 4) return points;

        const sqTolerance = tolerance * tolerance;

        const simplified = this.douglasPeucker(points, 0, points.length / 2 - 1, sqTolerance);

        // Convert back to flat array
        const result = [];
        simplified.forEach(pt => {
            result.push(pt.x, pt.y);
        });

        return result;
    }

    douglasPeucker(points, first, last, sqTolerance) {
        let maxSqDist = sqTolerance;
        let index = -1;

        const p1 = { x: points[first * 2], y: points[first * 2 + 1] };
        const p2 = { x: points[last * 2], y: points[last * 2 + 1] };

        for (let i = first + 1; i < last; i++) {
            const p = { x: points[i * 2], y: points[i * 2 + 1] };
            const sqDist = this.getSqSegDist(p, p1, p2);

            if (sqDist > maxSqDist) {
                maxSqDist = sqDist;
                index = i;
            }
        }

        let result = [];

        if (index > -1) {
            const left = this.douglasPeucker(points, first, index, sqTolerance);
            const right = this.douglasPeucker(points, index, last, sqTolerance);

            result = left.slice(0, -1).concat(right);
        } else {
            result = [p1, p2];
        }

        return result;
    }

    getSqSegDist(p, p1, p2) {
        let x = p1.x;
        let y = p1.y;
        let dx = p2.x - x;
        let dy = p2.y - y;

        if (dx !== 0 || dy !== 0) {
            const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);

            if (t > 1) {
                x = p2.x;
                y = p2.y;
            } else if (t > 0) {
                x += dx * t;
                y += dy * t;
            }
        }

        dx = p.x - x;
        dy = p.y - y;

        return dx * dx + dy * dy;
    }

    generateYOLODataYaml(project, type) {
        const classNames = project.classes.map(c => c.name);

        return `# YOLO ${type} dataset configuration
# Generated by Annotix

path: .
train: images
val: images

# Classes
nc: ${classNames.length}
names: [${classNames.map(n => `'${n}'`).join(', ')}]
`;
    }

    /**
     * COCO JSON FORMAT - DETECTION
     */
    async exportCOCODetection(project, images) {
        const cocoData = {
            info: {
                description: `${project.name} - COCO Detection Dataset`,
                version: '1.0',
                year: new Date().getFullYear(),
                contributor: 'Annotix',
                date_created: new Date().toISOString()
            },
            licenses: [],
            images: [],
            annotations: [],
            categories: project.classes.map(cls => ({
                id: cls.id,
                name: cls.name,
                supercategory: 'object'
            }))
        };

        let annotationId = 1;

        // Process images
        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            const imageFilename = this.getImageFilename(img);

            const imageInfo = {
                id: i + 1,
                file_name: imageFilename,
                width: img.width,
                height: img.height,
                date_captured: new Date(img.timestamp).toISOString()
            };
            cocoData.images.push(imageInfo);

            // Process annotations
            if (img.annotations) {
                img.annotations.forEach(ann => {
                    if (ann.type === 'bbox') {
                        const { x, y, width, height } = ann.data;

                        cocoData.annotations.push({
                            id: annotationId++,
                            image_id: i + 1,
                            category_id: ann.class,
                            bbox: [x, y, width, height],
                            area: width * height,
                            iscrowd: 0
                        });
                    }
                });
            }
        }

        // Create ZIP with images + JSON
        const zip = new JSZip();

        // Add COCO JSON
        zip.file('annotations.json', JSON.stringify(cocoData, null, 2));

        // Add images
        for (const img of images) {
            if (img.image) {
                const imageFilename = this.getImageFilename(img);
                zip.file(`images/${imageFilename}`, img.image);
            }
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        this.downloadFile(blob, `${project.name}_coco_detection.zip`);
        this.ui.showToast(window.i18n.t('export.success'), 'success');
    }

    /**
     * COCO JSON FORMAT - SEGMENTATION
     */
    async exportCOCOSegmentation(project, images) {
        const cocoData = {
            info: {
                description: `${project.name} - COCO Segmentation Dataset`,
                version: '1.0',
                year: new Date().getFullYear(),
                contributor: 'Annotix',
                date_created: new Date().toISOString()
            },
            licenses: [],
            images: [],
            annotations: [],
            categories: project.classes.map(cls => ({
                id: cls.id,
                name: cls.name,
                supercategory: 'object'
            }))
        };

        let annotationId = 1;

        // Process images
        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            const imageFilename = this.getImageFilename(img);

            const imageInfo = {
                id: i + 1,
                file_name: imageFilename,
                width: img.width,
                height: img.height,
                date_captured: new Date(img.timestamp).toISOString()
            };
            cocoData.images.push(imageInfo);

            // Process annotations
            if (img.annotations) {
                for (const ann of img.annotations) {
                    if (ann.type === 'mask') {
                        // Convert mask to polygon
                        const polygon = await this.maskToPolygon(ann.data, img.width, img.height);

                        if (polygon && polygon.length > 0) {
                            // Calculate bounding box from polygon
                            const bbox = this.polygonToBbox(polygon);

                            cocoData.annotations.push({
                                id: annotationId++,
                                image_id: i + 1,
                                category_id: ann.class,
                                segmentation: [polygon],
                                area: bbox.width * bbox.height,
                                bbox: [bbox.x, bbox.y, bbox.width, bbox.height],
                                iscrowd: 0
                            });
                        }
                    }
                }
            }
        }

        // Create ZIP with images + JSON
        const zip = new JSZip();

        // Add COCO JSON
        zip.file('annotations.json', JSON.stringify(cocoData, null, 2));

        // Add images
        for (const img of images) {
            if (img.image) {
                const imageFilename = this.getImageFilename(img);
                zip.file(`images/${imageFilename}`, img.image);
            }
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        this.downloadFile(blob, `${project.name}_coco_segmentation.zip`);
        this.ui.showToast(window.i18n.t('export.success'), 'success');
    }

    polygonToBbox(polygon) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (let i = 0; i < polygon.length; i += 2) {
            const x = polygon[i];
            const y = polygon[i + 1];
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /**
     * PASCAL VOC XML FORMAT
     */
    async exportPascalVOC(project, images) {
        const zip = new JSZip();

        for (const img of images) {
            // Add image with proper extension
            const imageFilename = this.getImageFilename(img);
            zip.file(`JPEGImages/${imageFilename}`, img.image);

            // Generate XML annotation (even if empty)
            const xmlContent = this.generateVOCXML(img, project, imageFilename);
            const xmlFilename = imageFilename.replace(/\.[^.]+$/, '.xml');
            zip.file(`Annotations/${xmlFilename}`, xmlContent);
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        this.downloadFile(blob, `${project.name}_pascal_voc.zip`);
        this.ui.showToast(window.i18n.t('export.success'), 'success');
    }

    generateVOCXML(image, project, imageFilename) {
        const filename = imageFilename || this.getImageFilename(image);
        let xml = `<annotation>
    <folder>VOC</folder>
    <filename>${filename}</filename>
    <path>${filename}</path>
    <source>
        <database>Annotix</database>
    </source>
    <size>
        <width>${image.width}</width>
        <height>${image.height}</height>
        <depth>3</depth>
    </size>
    <segmented>0</segmented>
`;

        image.annotations.forEach(ann => {
            if (ann.type === 'bbox') {
                const cls = project.classes.find(c => c.id === ann.class);
                const className = cls?.name || `class_${ann.class}`;
                const { x, y, width, height } = ann.data;

                xml += `    <object>
        <name>${className}</name>
        <pose>Unspecified</pose>
        <truncated>0</truncated>
        <difficult>0</difficult>
        <bndbox>
            <xmin>${Math.round(x)}</xmin>
            <ymin>${Math.round(y)}</ymin>
            <xmax>${Math.round(x + width)}</xmax>
            <ymax>${Math.round(y + height)}</ymax>
        </bndbox>
    </object>
`;
            }
        });

        xml += `</annotation>`;
        return xml;
    }

    /**
     * MASKS PNG FORMAT (U-Net style)
     */
    async exportMasksPNG(project, images) {
        const zip = new JSZip();

        for (const img of images) {
            // Add original image with proper extension
            const imageFilename = this.getImageFilename(img);
            zip.file(`images/${imageFilename}`, img.image);

            // Generate combined mask image (even if empty)
            const maskBlob = await this.generateCombinedMask(img, project);
            if (maskBlob) {
                const maskFilename = imageFilename.replace(/\.[^.]+$/, '.png');
                zip.file(`masks/${maskFilename}`, maskBlob);
            }
        }

        // Add classes mapping
        const classesMapping = project.classes.map((cls, idx) =>
            `${cls.id}: ${cls.name} (color: ${cls.color})`
        ).join('\n');
        zip.file('classes.txt', classesMapping);

        const blob = await zip.generateAsync({ type: 'blob' });
        this.downloadFile(blob, `${project.name}_masks_png.zip`);
        this.ui.showToast(window.i18n.t('export.success'), 'success');
    }

    async generateCombinedMask(image, project) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');

            // Fill with background (class 0)
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw each mask with its class color/index
            const drawPromises = image.annotations.map((ann, idx) => {
                return new Promise((res) => {
                    if (ann.type === 'mask') {
                        const maskImg = new Image();
                        maskImg.onload = () => {
                            // Use class ID as grayscale value
                            const classValue = ann.class;
                            const grayValue = Math.min(255, classValue * 10); // Scale for visibility

                            // Draw mask with class color
                            ctx.globalCompositeOperation = 'source-over';
                            const tempCanvas = document.createElement('canvas');
                            tempCanvas.width = image.width;
                            tempCanvas.height = image.height;
                            const tempCtx = tempCanvas.getContext('2d');
                            tempCtx.drawImage(maskImg, 0, 0);

                            // Recolor mask to class index
                            const imageData = tempCtx.getImageData(0, 0, image.width, image.height);
                            for (let i = 0; i < imageData.data.length; i += 4) {
                                if (imageData.data[i + 3] > 128) {
                                    imageData.data[i] = grayValue;
                                    imageData.data[i + 1] = grayValue;
                                    imageData.data[i + 2] = grayValue;
                                    imageData.data[i + 3] = 255;
                                }
                            }
                            tempCtx.putImageData(imageData, 0, 0);
                            ctx.drawImage(tempCanvas, 0, 0);

                            res();
                        };
                        maskImg.onerror = res;
                        maskImg.src = ann.data;
                    } else {
                        res();
                    }
                });
            });

            Promise.all(drawPromises).then(() => {
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/png');
            });
        });
    }

    /**
     * CLASSIFICATION - FOLDERS BY CLASS
     */
    async exportFoldersByClass(project, images) {
        const zip = new JSZip();

        for (const img of images) {
            // Get classification annotation
            const classification = img.classification;
            if (!classification) continue;

            const cls = project.classes.find(c => c.id === classification.classId);
            const folderName = cls?.name || `class_${classification.classId}`;

            // Add image to class folder
            zip.file(`${folderName}/${img.name}`, img.image);
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        this.downloadFile(blob, `${project.name}_folders.zip`);
        this.ui.showToast(window.i18n.t('export.success'), 'success');
    }

    /**
     * CLASSIFICATION - CSV
     */
    async exportClassificationCSV(project, images) {
        let csvContent = 'filename,class_id,class_name\n';

        images.forEach(img => {
            const classification = img.classification;
            if (classification) {
                const cls = project.classes.find(c => c.id === classification.classId);
                const className = cls?.name || `class_${classification.classId}`;
                csvContent += `${img.name},${classification.classId},${className}\n`;
            }
        });

        const blob = new Blob([csvContent], { type: 'text/csv' });
        this.downloadFile(blob, `${project.name}_classifications.csv`);
        this.ui.showToast(window.i18n.t('export.success'), 'success');
    }

    /**
     * GENERIC CSV (for bbox/mask)
     */
    async exportGenericCSV(project, images) {
        let csvContent = 'filename,annotation_type,class_id,class_name,data\n';

        images.forEach(img => {
            if (img.annotations) {
                img.annotations.forEach(ann => {
                    const cls = project.classes.find(c => c.id === ann.class);
                    const className = cls?.name || `class_${ann.class}`;

                    let dataStr = '';
                    if (ann.type === 'bbox') {
                        const { x, y, width, height } = ann.data;
                        dataStr = `"x:${x},y:${y},w:${width},h:${height}"`;
                    } else if (ann.type === 'mask') {
                        dataStr = '"[mask_data]"';
                    }

                    csvContent += `${img.name},${ann.type},${ann.class},${className},${dataStr}\n`;
                });
            }
        });

        const blob = new Blob([csvContent], { type: 'text/csv' });
        this.downloadFile(blob, `${project.name}_annotations.csv`);
        this.ui.showToast(window.i18n.t('export.success'), 'success');
    }

    /**
     * JSON FORMAT
     */
    async exportJSON(project, images) {
        const jsonData = {
            project: {
                name: project.name,
                type: project.type,
                classes: project.classes
            },
            images: images.map(img => ({
                filename: img.name,
                width: img.width,
                height: img.height,
                annotations: img.annotations || [],
                classification: img.classification || null
            }))
        };

        const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
        this.downloadFile(blob, `${project.name}_annotations.json`);
        this.ui.showToast(window.i18n.t('export.success'), 'success');
    }

    /**
     * HELPER: Get image filename with proper extension
     */
    getImageFilename(image) {
        // If name already has extension (new format with clean codes), use it
        if (image.name && image.name.match(/\.[^.]+$/)) {
            return image.name; // Already has extension: img_0001.jpg
        }

        // If originalFileName is stored (old format), use it
        if (image.originalFileName) {
            return image.originalFileName;
        }

        // Otherwise, reconstruct from name + mimeType
        let extension = '.jpg'; // default

        if (image.mimeType) {
            const mimeToExt = {
                'image/jpeg': '.jpg',
                'image/jpg': '.jpg',
                'image/png': '.png',
                'image/gif': '.gif',
                'image/bmp': '.bmp',
                'image/webp': '.webp'
            };
            extension = mimeToExt[image.mimeType] || '.jpg';
        } else if (image.image && image.image.type) {
            // Try to get from blob type
            const mimeToExt = {
                'image/jpeg': '.jpg',
                'image/jpg': '.jpg',
                'image/png': '.png',
                'image/gif': '.gif',
                'image/bmp': '.bmp',
                'image/webp': '.webp'
            };
            extension = mimeToExt[image.image.type] || '.jpg';
        }

        return image.name + extension;
    }

    /**
     * HELPER: Download file
     */
    downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // =============================================
    // POLYGON EXPORT (YOLO Segmentation Format)
    // =============================================

    async exportYOLOPolygon(project, images) {
        console.log(`=== YOLO Polygon Export ===`);
        const zip = new JSZip();

        // Create data.yaml
        const yamlContent = this.generateYOLODataYaml(project, 'segmentation');
        zip.file('data.yaml', yamlContent);

        // Create classes.txt
        const classesContent = project.classes.map(c => c.name).join('\n');
        zip.file('classes.txt', classesContent);

        // Process each image
        for (const img of images) {
            const imageFilename = this.getImageFilename(img);
            zip.file(`images/${imageFilename}`, img.image);

            // Generate label file with polygons
            const labelContent = this.generateYOLOPolygonLabels(img);
            const labelFilename = imageFilename.replace(/\.[^.]+$/, '.txt');
            zip.file(`labels/${labelFilename}`, labelContent || '');
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        this.downloadFile(blob, `${project.name}_yolo_polygon.zip`);

        const imagesWithAnnotations = images.filter(img => img.annotations && img.annotations.length > 0);
        this.ui.showToast(`✓ Exported: ${images.length} images (${imagesWithAnnotations.length} with polygons)`, 'success');
    }

    generateYOLOPolygonLabels(image) {
        let content = '';

        if (!image.annotations || !Array.isArray(image.annotations)) {
            return content;
        }

        const width = image.width;
        const height = image.height;

        if (!width || !height) {
            console.warn(`Image "${image.name}" missing dimensions`);
            return content;
        }

        for (const annotation of image.annotations) {
            if (annotation.type !== 'polygon' || !annotation.data.closed) continue;

            const classId = annotation.class;
            const points = annotation.data.points;

            if (!points || points.length < 3) continue;

            // YOLO format: <class_id> <x1> <y1> <x2> <y2> ... <xn> <yn> (normalized)
            const normalizedPoints = points.map(([x, y]) => {
                const normX = (x / width).toFixed(6);
                const normY = (y / height).toFixed(6);
                return `${normX} ${normY}`;
            }).join(' ');

            content += `${classId} ${normalizedPoints}\n`;
        }

        return content;
    }

    async exportCOCOPolygon(project, images) {
        console.log(`=== COCO Polygon Export ===`);

        const cocoData = {
            info: {
                description: `${project.name} - Polygon Annotations`,
                version: "1.0",
                year: new Date().getFullYear(),
                contributor: "Annotix",
                date_created: new Date().toISOString().split('T')[0]
            },
            licenses: [{ id: 1, name: "Unknown", url: "" }],
            images: [],
            annotations: [],
            categories: project.classes.map((cls, idx) => ({
                id: cls.id,
                name: cls.name,
                supercategory: "object"
            }))
        };

        let annotationId = 1;

        for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
            const img = images[imgIdx];

            cocoData.images.push({
                id: imgIdx + 1,
                file_name: this.getImageFilename(img),
                width: img.width,
                height: img.height,
                license: 1,
                date_captured: ""
            });

            if (img.annotations) {
                for (const ann of img.annotations) {
                    if (ann.type !== 'polygon' || !ann.data.closed) continue;

                    const points = ann.data.points;
                    if (!points || points.length < 3) continue;

                    // Flatten points array: [x1, y1, x2, y2, ...]
                    const segmentation = [points.flat()];

                    // Calculate bounding box
                    const xs = points.map(p => p[0]);
                    const ys = points.map(p => p[1]);
                    const minX = Math.min(...xs);
                    const minY = Math.min(...ys);
                    const maxX = Math.max(...xs);
                    const maxY = Math.max(...ys);

                    // Calculate area (simple polygon area)
                    let area = 0;
                    for (let i = 0; i < points.length; i++) {
                        const j = (i + 1) % points.length;
                        area += points[i][0] * points[j][1];
                        area -= points[j][0] * points[i][1];
                    }
                    area = Math.abs(area) / 2;

                    cocoData.annotations.push({
                        id: annotationId++,
                        image_id: imgIdx + 1,
                        category_id: ann.class,
                        segmentation: segmentation,
                        area: area,
                        bbox: [minX, minY, maxX - minX, maxY - minY],
                        iscrowd: 0
                    });
                }
            }
        }

        const jsonContent = JSON.stringify(cocoData, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        this.downloadFile(blob, `${project.name}_coco_polygon.json`);

        this.ui.showToast(`✓ COCO JSON exported with ${cocoData.annotations.length} polygons`, 'success');
    }

    // =============================================
    // LANDMARKS EXPORT
    // =============================================

    async exportYOLOLandmarks(project, images) {
        console.log(`=== YOLO Landmarks Export ===`);
        const zip = new JSZip();

        // Create data.yaml
        const yamlContent = this.generateYOLODataYaml(project, 'detection');
        zip.file('data.yaml', yamlContent);

        // Create classes.txt
        const classesContent = project.classes.map(c => c.name).join('\n');
        zip.file('classes.txt', classesContent);

        // Process each image
        for (const img of images) {
            const imageFilename = this.getImageFilename(img);
            zip.file(`images/${imageFilename}`, img.image);

            // Generate label file (landmarks as tiny bboxes)
            const labelContent = this.generateYOLOLandmarksLabels(img);
            const labelFilename = imageFilename.replace(/\.[^.]+$/, '.txt');
            zip.file(`labels/${labelFilename}`, labelContent || '');
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        this.downloadFile(blob, `${project.name}_yolo_landmarks.zip`);

        const imagesWithAnnotations = images.filter(img => img.annotations && img.annotations.length > 0);
        this.ui.showToast(`✓ Exported: ${images.length} images (${imagesWithAnnotations.length} with landmarks)`, 'success');
    }

    generateYOLOLandmarksLabels(image) {
        let content = '';

        if (!image.annotations || !Array.isArray(image.annotations)) {
            return content;
        }

        const width = image.width;
        const height = image.height;

        if (!width || !height) {
            console.warn(`Image "${image.name}" missing dimensions`);
            return content;
        }

        // Landmarks exported as tiny 1px bboxes
        for (const annotation of image.annotations) {
            if (annotation.type !== 'landmark') continue;

            const classId = annotation.class;
            const x = annotation.data.x;
            const y = annotation.data.y;

            // Normalize coordinates
            const normX = (x / width).toFixed(6);
            const normY = (y / height).toFixed(6);
            // Use tiny bbox (1px)
            const normW = (1 / width).toFixed(6);
            const normH = (1 / height).toFixed(6);

            content += `${classId} ${normX} ${normY} ${normW} ${normH}\n`;
        }

        return content;
    }

    async exportLandmarksCSV(project, images) {
        console.log(`=== Landmarks CSV Export ===`);

        let csvContent = 'image,landmark_id,class_id,class_name,x,y,name\n';

        for (const img of images) {
            if (!img.annotations) continue;

            for (const ann of img.annotations) {
                if (ann.type !== 'landmark') continue;

                const cls = project.classes.find(c => c.id === ann.class);
                const className = cls ? cls.name : 'unknown';
                const landmarkName = ann.data.name || '';
                const x = ann.data.x;
                const y = ann.data.y;

                csvContent += `${img.name},${ann.data.id},${ann.class},${className},${x},${y},"${landmarkName}"\n`;
            }
        }

        const blob = new Blob([csvContent], { type: 'text/csv' });
        this.downloadFile(blob, `${project.name}_landmarks.csv`);

        const totalLandmarks = images.reduce((sum, img) =>
            sum + (img.annotations?.filter(a => a.type === 'landmark').length || 0), 0);

        this.ui.showToast(`✓ CSV exported with ${totalLandmarks} landmarks`, 'success');
    }

    // =============================================
    // KEYPOINTS EXPORT (YOLO Pose Format)
    // =============================================

    async exportYOLOPose(project, images) {
        console.log(`=== YOLO Pose Export ===`);
        const zip = new JSZip();

        // Create data.yaml with keypoint configuration
        const yamlContent = this.generateYOLOPoseDataYaml(project);
        zip.file('data.yaml', yamlContent);

        // Create classes.txt
        const classesContent = project.classes.map(c => c.name).join('\n');
        zip.file('classes.txt', classesContent);

        // Process each image
        for (const img of images) {
            const imageFilename = this.getImageFilename(img);
            zip.file(`images/${imageFilename}`, img.image);

            // Generate label file with keypoints
            const labelContent = this.generateYOLOPoseLabels(img, project);
            const labelFilename = imageFilename.replace(/\.[^.]+$/, '.txt');
            zip.file(`labels/${labelFilename}`, labelContent || '');
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        this.downloadFile(blob, `${project.name}_yolo_pose.zip`);

        const imagesWithAnnotations = images.filter(img => img.annotations && img.annotations.length > 0);
        this.ui.showToast(`✓ Exported: ${images.length} images (${imagesWithAnnotations.length} with keypoints)`, 'success');
    }

    generateYOLOPoseDataYaml(project) {
        // Get keypoint configuration from first class (assuming all use same skeleton type)
        const firstClassWithSkeleton = project.classes.find(c => c.skeleton);

        let yaml = `# YOLO Pose Dataset Configuration\n`;
        yaml += `path: ./\n`;
        yaml += `train: images\n`;
        yaml += `val: images\n`;
        yaml += `test: images\n\n`;
        yaml += `names:\n`;
        project.classes.forEach((cls, idx) => {
            yaml += `  ${cls.id}: ${cls.name}\n`;
        });

        if (firstClassWithSkeleton && firstClassWithSkeleton.skeleton) {
            const skeleton = firstClassWithSkeleton.skeleton;
            yaml += `\n# Keypoint configuration\n`;
            yaml += `kpt_shape: [${skeleton.keypoints.length}, 3]  # number of keypoints, number of dimensions (x, y, visibility)\n`;
            yaml += `\n# Keypoint names\n`;
            yaml += `keypoint_names:\n`;
            skeleton.keypoints.forEach((kp, idx) => {
                yaml += `  ${idx}: ${kp}\n`;
            });

            yaml += `\n# Skeleton connections (pairs of keypoint indices)\n`;
            yaml += `flip_idx:\n`;
            yaml += `skeleton:\n`;
            skeleton.connections.forEach(([idx1, idx2]) => {
                yaml += `  - [${idx1}, ${idx2}]\n`;
            });
        }

        return yaml;
    }

    generateYOLOPoseLabels(image, project) {
        let content = '';

        if (!image.annotations || !Array.isArray(image.annotations)) {
            return content;
        }

        const width = image.width;
        const height = image.height;

        if (!width || !height) {
            console.warn(`Image "${image.name}" missing dimensions`);
            return content;
        }

        for (const annotation of image.annotations) {
            if (annotation.type !== 'keypoints') continue;

            const classId = annotation.class;
            const keypoints = annotation.data.keypoints;

            if (!keypoints || keypoints.length === 0) continue;

            // Calculate bounding box from keypoints
            const visibleKps = keypoints.filter(kp => kp && kp.x !== null && kp.visibility > 0);
            if (visibleKps.length === 0) continue;

            const xs = visibleKps.map(kp => kp.x);
            const ys = visibleKps.map(kp => kp.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const maxX = Math.max(...xs);
            const maxY = Math.max(...ys);

            // Normalize bbox
            const bboxCenterX = ((minX + maxX) / 2 / width).toFixed(6);
            const bboxCenterY = ((minY + maxY) / 2 / height).toFixed(6);
            const bboxWidth = ((maxX - minX) / width).toFixed(6);
            const bboxHeight = ((maxY - minY) / height).toFixed(6);

            // Format keypoints: x1 y1 v1 x2 y2 v2 ... (normalized)
            const kpString = keypoints.map(kp => {
                if (!kp || kp.x === null) {
                    return '0 0 0'; // Not labeled
                }
                const normX = (kp.x / width).toFixed(6);
                const normY = (kp.y / height).toFixed(6);
                const visibility = kp.visibility || 0;
                return `${normX} ${normY} ${visibility}`;
            }).join(' ');

            content += `${classId} ${bboxCenterX} ${bboxCenterY} ${bboxWidth} ${bboxHeight} ${kpString}\n`;
        }

        return content;
    }

    async exportCOCOKeypoints(project, images) {
        console.log(`=== COCO Keypoints Export ===`);

        // Get skeleton from first class
        const firstClassWithSkeleton = project.classes.find(c => c.skeleton);
        const skeleton = firstClassWithSkeleton ? firstClassWithSkeleton.skeleton : null;

        const cocoData = {
            info: {
                description: `${project.name} - Keypoints Annotations`,
                version: "1.0",
                year: new Date().getFullYear(),
                contributor: "Annotix",
                date_created: new Date().toISOString().split('T')[0]
            },
            licenses: [{ id: 1, name: "Unknown", url: "" }],
            images: [],
            annotations: [],
            categories: project.classes.map((cls) => {
                const category = {
                    id: cls.id,
                    name: cls.name,
                    supercategory: "object"
                };

                if (cls.skeleton) {
                    category.keypoints = cls.skeleton.keypoints;
                    category.skeleton = cls.skeleton.connections;
                }

                return category;
            })
        };

        let annotationId = 1;

        for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
            const img = images[imgIdx];

            cocoData.images.push({
                id: imgIdx + 1,
                file_name: this.getImageFilename(img),
                width: img.width,
                height: img.height,
                license: 1,
                date_captured: ""
            });

            if (img.annotations) {
                for (const ann of img.annotations) {
                    if (ann.type !== 'keypoints') continue;

                    const keypoints = ann.data.keypoints;
                    if (!keypoints || keypoints.length === 0) continue;

                    // Calculate bbox
                    const visibleKps = keypoints.filter(kp => kp && kp.x !== null && kp.visibility > 0);
                    if (visibleKps.length === 0) continue;

                    const xs = visibleKps.map(kp => kp.x);
                    const ys = visibleKps.map(kp => kp.y);
                    const minX = Math.min(...xs);
                    const minY = Math.min(...ys);
                    const maxX = Math.max(...xs);
                    const maxY = Math.max(...ys);

                    // COCO keypoints format: [x1, y1, v1, x2, y2, v2, ...]
                    const cocoKeypoints = [];
                    let numKeypoints = 0;
                    keypoints.forEach(kp => {
                        if (!kp || kp.x === null) {
                            cocoKeypoints.push(0, 0, 0);
                        } else {
                            cocoKeypoints.push(kp.x, kp.y, kp.visibility || 2);
                            if (kp.visibility > 0) numKeypoints++;
                        }
                    });

                    cocoData.annotations.push({
                        id: annotationId++,
                        image_id: imgIdx + 1,
                        category_id: ann.class,
                        keypoints: cocoKeypoints,
                        num_keypoints: numKeypoints,
                        bbox: [minX, minY, maxX - minX, maxY - minY],
                        area: (maxX - minX) * (maxY - minY),
                        iscrowd: 0
                    });
                }
            }
        }

        const jsonContent = JSON.stringify(cocoData, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        this.downloadFile(blob, `${project.name}_coco_keypoints.json`);

        this.ui.showToast(`✓ COCO JSON exported with ${cocoData.annotations.length} keypoint instances`, 'success');
    }
}
