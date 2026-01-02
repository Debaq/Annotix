/**
 * TIME SERIES CANVAS MANAGER
 * Handles visualization and annotation of time series data
 */

class TimeSeriesCanvasManager {
    constructor(canvas, projectType, classes, ui) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.projectType = projectType;
        this.classes = classes;
        this.ui = ui;

        // Project-specific configuration
        this.projectConfig = this.getProjectTypeConfig();

        // Time series data
        this.currentData = null;
        this.timeSeriesMetadata = null;
        this.parsedData = [];

        // Chart.js instance
        this.chart = null;
        this.chartContainer = null;

        // Annotations
        this.annotations = [];
        this.activeAnnotation = null;
        this.selectedAnnotation = null;  // For annotation bar selection
        this.isDrawing = false;
        this.hasUnsavedChanges = false;

        // Current tool - set default based on project type
        this.currentTool = this.projectConfig.tools[0] || 'select';
        this.currentClass = 0;

        // Compatibility properties (set before data loads)
        this.imageName = null;
        this.imageId = null;
        this.image = null;

        // View state
        this.showLabels = true;
        this.showGrid = true;
        this.showXAxisLabels = false;  // Hidden by default
        this.scaleY = 1.0;
        this.scaleX = 1.0;

        // Viewport state (for X-axis panning with scale)
        this.viewportStartIndex = 0;
        this.viewportEndIndex = null;  // null = show all data

        // Interaction state
        this.startX = null;
        this.tempRangeStart = null;

        // Preview state
        this.previewX = null;
        this.previewY = null;

        // Edit state
        this.editingHandle = null;  // Which handle is being dragged ('start', 'end', 'delete')
        this.isDraggingHandle = false;
        this.selectedPointGroup = null;  // Group of points at same X position

        // Timeline
        this.timelineCanvas = null;
        this.timelineCtx = null;
        this.timelineViewport = null;
        this.isDraggingTimeline = false;
        this.timelineDragStartX = null;
        this.timelineDragStartViewport = null;

        this.setupCanvas();
    }

    setupCanvas() {
        // Hide the default canvas and create Chart.js container
        this.canvas.style.display = 'none';

        // Create container for Chart.js
        this.chartContainer = document.createElement('div');
        this.chartContainer.id = 'timeseriesChartContainer';
        this.chartContainer.style.width = '100%';
        this.chartContainer.style.height = '100%';
        this.chartContainer.style.position = 'relative';

        // Create canvas for Chart.js
        this.chartCanvas = document.createElement('canvas');
        this.chartCanvas.id = 'timeseriesChart';
        this.chartContainer.appendChild(this.chartCanvas);

        // Create overlay canvas for previews
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.id = 'timeseriesOverlay';
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCanvas.style.top = '0';
        this.overlayCanvas.style.left = '0';
        this.overlayCanvas.style.pointerEvents = 'none';
        this.overlayCanvas.style.width = '100%';
        this.overlayCanvas.style.height = '100%';
        this.chartContainer.appendChild(this.overlayCanvas);
        this.overlayCtx = this.overlayCanvas.getContext('2d');

        // Insert after original canvas
        this.canvas.parentNode.insertBefore(this.chartContainer, this.canvas.nextSibling);

        // Setup timeline
        this.setupTimeline();

        // Setup mouse/touch events
        this.setupEventListeners();
    }

    setupTimeline() {
        // Get timeline elements
        const timelineContainer = document.getElementById('timelineContainer');
        this.timelineCanvas = document.getElementById('timelineCanvas');
        this.timelineViewport = document.getElementById('timelineViewport');

        if (!this.timelineCanvas || !this.timelineViewport) {
            console.warn('Timeline elements not found');
            return;
        }

        this.timelineCtx = this.timelineCanvas.getContext('2d');

        // Show timeline container
        if (timelineContainer) {
            timelineContainer.style.display = 'block';
        }
    }

    setupEventListeners() {
        // Main chart events
        this.chartCanvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.chartCanvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.chartCanvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.chartCanvas.addEventListener('mouseleave', (e) => this.onMouseLeave(e));

        // Timeline viewport drag events
        if (this.timelineViewport) {
            this.timelineViewport.addEventListener('mousedown', (e) => this.onTimelineMouseDown(e));
            document.addEventListener('mousemove', (e) => this.onTimelineMouseMove(e));
            document.addEventListener('mouseup', (e) => this.onTimelineMouseUp(e));
        }
    }

    /**
     * Get project-specific configuration
     * Defines tools, modes, and behavior for each time series project type
     */
    getProjectTypeConfig() {
        const configs = {
            'timeSeriesClassification': {
                mode: 'global',
                tools: [],
                requiresCanvas: false,
                allowPoint: false,
                allowRange: false,
                description: 'Clasificar serie temporal completa',
                models: 'InceptionTime, ROCKET, ResNet'
            },
            'timeSeriesForecasting': {
                mode: 'canvas',
                tools: ['range', 'select', 'pan', 'zoom'],
                requiresCanvas: true,
                allowPoint: false,
                allowRange: true,
                rangeType: 'forecast',
                description: 'Marcar ventana histórica y horizonte de predicción',
                models: 'LSTM, Transformer, N-BEATS, Prophet'
            },
            'anomalyDetection': {
                mode: 'canvas',
                tools: ['point', 'select', 'pan', 'zoom'],
                requiresCanvas: true,
                allowPoint: true,
                allowRange: false,
                description: 'Marcar puntos anómalos en la serie',
                models: 'AutoEncoder, Isolation Forest, LSTM-AE'
            },
            'timeSeriesSegmentation': {
                mode: 'canvas',
                tools: ['range', 'select', 'pan', 'zoom'],
                requiresCanvas: true,
                allowPoint: false,
                allowRange: true,
                rangeType: 'segment',
                description: 'Segmentar serie en regiones con clases',
                models: 'ClaSP, FLUSS, Seasonal-Trend Decomposition'
            },
            'patternRecognition': {
                mode: 'canvas',
                tools: ['range', 'select', 'pan', 'zoom'],
                requiresCanvas: true,
                allowPoint: false,
                allowRange: true,
                rangeType: 'pattern',
                description: 'Marcar patrones/motifs repetitivos',
                models: 'Matrix Profile, STOMP, SAX'
            },
            'eventDetection': {
                mode: 'canvas',
                tools: ['point', 'select', 'pan', 'zoom'],
                requiresCanvas: true,
                allowPoint: true,
                allowRange: false,
                description: 'Marcar eventos discretos en el tiempo',
                models: 'Change Point Detection, Event Detection CNN'
            },
            'timeSeriesRegression': {
                mode: 'canvas',
                tools: ['point', 'select', 'pan', 'zoom'],
                requiresCanvas: true,
                allowPoint: true,
                allowRange: false,
                pointType: 'regression',
                description: 'Marcar puntos con valores target numéricos',
                models: 'XGBoost, Random Forest, Neural Networks'
            },
            'clustering': {
                mode: 'global',
                tools: [],
                requiresCanvas: false,
                allowPoint: false,
                allowRange: false,
                description: 'Asignar cluster a serie completa',
                models: 'K-Shape, DTW-KMeans, K-Means'
            },
            'imputation': {
                mode: 'canvas',
                tools: ['range', 'select', 'pan', 'zoom'],
                requiresCanvas: true,
                allowPoint: false,
                allowRange: true,
                rangeType: 'gap',
                description: 'Marcar secciones de datos faltantes a imputar',
                models: 'MICE, KNN, Interpolation, BRITS'
            }
        };

        return configs[this.projectType] || configs['anomalyDetection']; // default fallback
    }

    /**
     * Load time series data from database entry
     */
    async loadData(dataEntry) {
        try {
            this.currentData = dataEntry;
            this.timeSeriesMetadata = dataEntry.timeSeriesMetadata;

            // Parse CSV blob
            const csvText = await this.blobToText(dataEntry.image);
            const parser = new CSVParser();
            const parsed = await parser.parse(csvText, {
                delimiter: this.timeSeriesMetadata.delimiter,
                hasHeaders: this.timeSeriesMetadata.hasHeaders
            });

            this.parsedData = parsed.data;

            // Load existing annotations
            this.annotations = dataEntry.annotations || [];

            // Set compatibility properties for UI
            this.imageName = dataEntry.name;
            this.imageId = dataEntry.id;
            this.originalImageBlob = dataEntry.image;  // Store original CSV blob for saving

            // Calculate number of numeric variables (excluding time column)
            const headers = this.timeSeriesMetadata.headers;
            const timeColumn = this.timeSeriesMetadata.timeColumn;
            let numVariables = 0;
            if (headers) {
                for (const header of headers) {
                    if (header === timeColumn) continue;
                    const firstValue = parsed.data[0]?.[header];
                    if (typeof firstValue === 'number' || !isNaN(firstValue)) {
                        numVariables++;
                    }
                }
            }

            // Create pseudo-image object for compatibility with UI code
            // Dimensions: time points × variables
            this.image = {
                width: parsed.data.length,  // Number of time points
                height: numVariables || 1  // Number of numeric variables/series
            };

            // Render chart
            this.renderChart();

            // Update annotations bar
            this.updateAnnotationsBar();

            // Update tool availability (hide/show appropriate controls)
            this.updateToolAvailability();

            // Clear unsaved changes flag after loading
            this.hasUnsavedChanges = false;

        } catch (error) {
            console.error('Error loading time series data:', error);
            this.ui.showToast('Error al cargar datos de serie temporal', 'error');
        }
    }

    /**
     * Convert blob to text
     */
    blobToText(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(blob);
        });
    }

    /**
     * Render Chart.js visualization
     */
    renderChart() {
        if (!this.parsedData || this.parsedData.length === 0) {
            console.warn('No data to render');
            return;
        }

        // Prepare data for Chart.js
        const { labels, datasets } = this.prepareChartData();

        // Destroy previous chart if exists
        if (this.chart) {
            this.chart.destroy();
        }

        // Create new chart
        this.chart = new Chart(this.chartCanvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,  // Disable animations
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        enabled: true
                    },
                    // Custom plugin for annotations
                    annotation: {
                        animations: {
                            numbers: { duration: 0 }
                        },
                        annotations: this.getChartAnnotations()
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: this.timeSeriesMetadata.timeColumn || 'Índice'
                        },
                        ticks: {
                            display: this.showXAxisLabels
                        },
                        grid: {
                            display: this.showGrid
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Valor'
                        },
                        grid: {
                            display: this.showGrid
                        },
                        min: undefined,
                        max: undefined
                    }
                }
            }
        });

        // Render annotations overlay
        this.renderAnnotations();

        // Render timeline
        this.renderTimeline();
    }

    /**
     * Prepare data for Chart.js
     */
    prepareChartData() {
        const headers = this.timeSeriesMetadata.headers;
        const timeColumn = this.timeSeriesMetadata.timeColumn;

        // Extract labels (x-axis)
        let labels;
        if (timeColumn) {
            labels = this.parsedData.map(row => row[timeColumn]);
        } else {
            labels = this.parsedData.map((_, index) => index);
        }

        // Extract datasets (one per numeric column, excluding time column)
        const datasets = [];
        const colors = [
            '#667eea', '#10b981', '#f59e0b', '#ef4444', '#06b6d4',
            '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1', '#84cc16'
        ];

        let colorIndex = 0;
        for (const header of headers) {
            if (header === timeColumn) continue;

            // Check if column is numeric
            const firstValue = this.parsedData[0][header];
            if (typeof firstValue !== 'number' && isNaN(firstValue)) continue;

            const data = this.parsedData.map(row => {
                const val = row[header];
                return typeof val === 'number' ? val : parseFloat(val);
            });

            datasets.push({
                label: header,
                data: data,
                borderColor: colors[colorIndex % colors.length],
                backgroundColor: colors[colorIndex % colors.length] + '33',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0 // Straight lines
            });

            colorIndex++;
        }

        return { labels, datasets };
    }

    /**
     * Get annotations formatted for Chart.js
     */
    getChartAnnotations() {
        const chartAnnotations = {};

        this.annotations.forEach((ann, index) => {
            if (ann.type === 'point') {
                chartAnnotations[`point_${index}`] = {
                    type: 'point',
                    xValue: ann.data.x,
                    yValue: ann.data.y,
                    backgroundColor: this.getClassColor(ann.class),
                    radius: 6
                };
            } else if (ann.type === 'range') {
                // Check if this is the selected annotation
                const isSelected = this.selectedAnnotation === ann;
                const color = this.getClassColor(ann.class);

                chartAnnotations[`range_${index}`] = {
                    type: 'box',
                    xMin: ann.data.start,
                    xMax: ann.data.end,
                    backgroundColor: color + (isSelected ? '55' : '33'),  // More opaque if selected
                    borderColor: color,
                    borderWidth: isSelected ? 3 : 2,  // Thicker border if selected
                    borderDash: isSelected ? [] : undefined  // Solid line if selected
                };
            }
        });

        return chartAnnotations;
    }

    /**
     * Render annotations overlay (for temporary drawing)
     */
    renderAnnotations() {
        // Annotations are now rendered by Chart.js plugin
        // This method can be used for temporary UI elements during drawing
    }

    /**
     * Update only annotations without recreating chart
     */
    updateAnnotations() {
        if (!this.chart) return;

        // Update annotation plugin options
        this.chart.options.plugins.annotation.annotations = this.getChartAnnotations();

        // Update chart without animation
        this.chart.update('none');
    }

    /**
     * Mouse down handler
     */
    onMouseDown(e) {
        const rect = this.chartCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.currentTool === 'point') {
            this.addPointAnnotation(x, y);
        } else if (this.currentTool === 'range') {
            this.startX = x;
            this.tempRangeStart = this.getXValue(x);
            this.isDrawing = true;
        } else if (this.currentTool === 'select') {
            // Check if clicking on a handle first
            const handle = this.getHandleAtPosition(x, y);
            if (handle) {
                if (handle.type === 'delete') {
                    // Delete the annotation(s)
                    if (this.selectedAnnotation.type === 'point' && this.selectedPointGroup && this.selectedPointGroup.length > 0) {
                        // Delete all points in the group
                        this.selectedPointGroup.forEach(point => {
                            const annIndex = this.annotations.indexOf(point);
                            if (annIndex > -1) {
                                this.annotations.splice(annIndex, 1);
                            }
                        });
                        this.selectedPointGroup = null;
                    } else {
                        // Delete single annotation
                        const annIndex = this.annotations.indexOf(this.selectedAnnotation);
                        if (annIndex > -1) {
                            this.annotations.splice(annIndex, 1);
                        }
                    }
                    this.selectedAnnotation = null;
                    this.updateAnnotations();
                    this.updateAnnotationsBar();
                    this.onAnnotationsChanged();
                } else {
                    // Start dragging handle
                    this.editingHandle = handle.type;
                    this.isDraggingHandle = true;
                }
            } else {
                // Try to select an annotation
                this.selectAnnotationAt(x, y);
            }
        }
    }

    /**
     * Mouse move handler
     */
    onMouseMove(e) {
        const rect = this.chartCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Update preview position
        this.previewX = x;
        this.previewY = y;

        // Handle dragging in select mode
        if (this.currentTool === 'select' && this.isDraggingHandle && this.selectedAnnotation) {
            this.dragHandle(x);
            return;
        }

        // Draw preview based on tool and state
        if (this.currentTool === 'point' && !this.isDrawing) {
            this.drawPointPreview(x, y);
        } else if (this.currentTool === 'range') {
            if (this.isDrawing) {
                this.drawRangePreview(this.startX, x);
            } else {
                this.drawVerticalLinePreview(x);
            }
        } else if (this.currentTool === 'select') {
            // Draw selection handles if an annotation is selected
            this.drawSelectionHandles();
        } else {
            this.clearPreview();
        }
    }

    /**
     * Mouse up handler
     */
    onMouseUp(e) {
        // Handle end of dragging
        if (this.isDraggingHandle) {
            this.isDraggingHandle = false;
            this.editingHandle = null;
            this.onAnnotationsChanged();
            return;
        }

        if (!this.isDrawing) return;

        const rect = this.chartCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;

        if (this.currentTool === 'range') {
            this.addRangeAnnotation(x);
        }

        this.isDrawing = false;
        this.startX = null;
        this.tempRangeStart = null;
        this.clearPreview();
    }

    /**
     * Mouse leave handler
     */
    onMouseLeave(e) {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.startX = null;
            this.tempRangeStart = null;
        }
        this.clearPreview();
    }

    /**
     * Add point annotation
     */
    addPointAnnotation(canvasX, canvasY) {
        // Validate that point annotations are allowed for this project type
        if (!this.projectConfig.allowPoint) {
            this.ui.showToast('Este tipo de proyecto no permite anotaciones de puntos', 'warning');
            return;
        }

        const xValue = this.getXValue(canvasX);
        if (xValue === null) return;

        const dataIndex = this.getClosestDataIndex(xValue);

        // Create a point for each dataset (variable/line)
        if (this.chart && this.chart.data.datasets) {
            this.chart.data.datasets.forEach((dataset, i) => {
                const value = dataset.data[dataIndex];
                if (value === null || value === undefined) return;

                const annotation = {
                    type: 'point',
                    class: this.currentClass,
                    data: {
                        x: xValue,
                        y: value,
                        index: dataIndex,
                        datasetIndex: i,  // Store which dataset this point belongs to
                        datasetLabel: dataset.label  // Store dataset label for reference
                    }
                };

                // For regression type, could add UI to input target value
                if (this.projectConfig.pointType === 'regression') {
                    annotation.data.targetValue = value; // Store Y value as target
                }

                this.annotations.push(annotation);
            });

            this.updateAnnotations();
            this.onAnnotationsChanged();
        }
    }

    /**
     * Add range annotation
     */
    addRangeAnnotation(endX) {
        // Validate that range annotations are allowed for this project type
        if (!this.projectConfig.allowRange) {
            this.ui.showToast('Este tipo de proyecto no permite anotaciones de rango', 'warning');
            return;
        }

        const endValue = this.getXValue(endX);

        if (this.tempRangeStart === null || endValue === null) return;

        const start = Math.min(this.tempRangeStart, endValue);
        const end = Math.max(this.tempRangeStart, endValue);

        const annotation = {
            type: 'range',
            class: this.currentClass,
            data: {
                start: start,
                end: end,
                startIndex: this.getClosestDataIndex(start),
                endIndex: this.getClosestDataIndex(end),
                rangeType: this.projectConfig.rangeType || 'generic'
            }
        };

        this.annotations.push(annotation);
        this.updateAnnotations();
        this.updateAnnotationsBar();
        this.onAnnotationsChanged();
    }

    /**
     * Get X value from canvas coordinates
     */
    getXValue(canvasX) {
        if (!this.chart) return null;

        const xScale = this.chart.scales.x;
        return xScale.getValueForPixel(canvasX);
    }

    /**
     * Get Y value from canvas coordinates
     */
    getYValue(canvasY) {
        if (!this.chart) return null;

        const yScale = this.chart.scales.y;
        return yScale.getValueForPixel(canvasY);
    }

    /**
     * Get closest data index for a given x value
     */
    getClosestDataIndex(xValue) {
        const labels = this.chart.data.labels;
        let closestIndex = 0;
        let minDiff = Math.abs(labels[0] - xValue);

        for (let i = 1; i < labels.length; i++) {
            const diff = Math.abs(labels[i] - xValue);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i;
            }
        }

        return closestIndex;
    }

    /**
     * Update temporary range visualization
     */
    updateTempRange(currentX) {
        // This could draw a temporary overlay on the chart
        // For now, Chart.js handles this internally
    }

    /**
     * Select annotation at coordinates
     */
    selectAnnotationAt(x, y) {
        if (!this.chart) return;

        const xValue = this.getXValue(x);
        const yValue = this.getYValue(y);
        if (xValue === null || yValue === null) return;

        const xScale = this.chart.scales.x;
        const yScale = this.chart.scales.y;

        // First try to find point annotations (smaller click target)
        const pointAnnotations = this.annotations.filter(ann => ann.type === 'point');
        const clickRadius = 15; // Pixels

        for (const ann of pointAnnotations) {
            const pointPixelX = xScale.getPixelForValue(ann.data.x);
            const pointPixelY = yScale.getPixelForValue(ann.data.y);

            const distance = Math.sqrt(Math.pow(x - pointPixelX, 2) + Math.pow(y - pointPixelY, 2));

            if (distance <= clickRadius) {
                this.selectedAnnotation = ann;

                // Find all points at the same X position (for multi-variable series)
                this.selectedPointGroup = pointAnnotations.filter(p =>
                    p.data.index === ann.data.index ||
                    Math.abs(p.data.x - ann.data.x) < 0.0001
                );

                this.updateAnnotations();
                this.updateAnnotationsBar();
                return;
            }
        }

        // Then try range annotations
        const rangeAnnotations = this.annotations.filter(ann => ann.type === 'range');

        for (const ann of rangeAnnotations) {
            if (xValue >= ann.data.start && xValue <= ann.data.end) {
                this.selectedAnnotation = ann;
                this.selectedPointGroup = null;  // Clear point group for ranges
                this.updateAnnotations();
                this.updateAnnotationsBar();
                return;
            }
        }

        // If no annotation found, deselect
        if (this.selectedAnnotation) {
            this.selectedAnnotation = null;
            this.selectedPointGroup = null;
            this.updateAnnotations();
            this.updateAnnotationsBar();
        }
    }

    /**
     * Get handle at position (for editing)
     */
    getHandleAtPosition(x, y) {
        if (!this.selectedAnnotation || !this.chart) {
            return null;
        }

        const xScale = this.chart.scales.x;
        const yScale = this.chart.scales.y;
        const chartArea = this.chart.chartArea;
        const handleSize = 15;

        if (this.selectedAnnotation.type === 'point') {
            // Point annotation handles
            const pointPixelX = xScale.getPixelForValue(this.selectedAnnotation.data.x);
            const pointPixelY = yScale.getPixelForValue(this.selectedAnnotation.data.y);

            // Delete button (above point)
            const deleteY = pointPixelY - 25;
            if (Math.abs(x - pointPixelX) < handleSize && Math.abs(y - deleteY) < handleSize) {
                return { type: 'delete' };
            }

            // Left arrow handle
            const leftX = pointPixelX - 25;
            if (Math.abs(x - leftX) < handleSize && Math.abs(y - pointPixelY) < handleSize) {
                return { type: 'move' };
            }

            // Right arrow handle
            const rightX = pointPixelX + 25;
            if (Math.abs(x - rightX) < handleSize && Math.abs(y - pointPixelY) < handleSize) {
                return { type: 'move' };
            }

        } else if (this.selectedAnnotation.type === 'range') {
            // Range annotation handles
            const startPixel = xScale.getPixelForValue(this.selectedAnnotation.data.start);
            const endPixel = xScale.getPixelForValue(this.selectedAnnotation.data.end);

            // Check delete button (top center)
            const centerX = (startPixel + endPixel) / 2;
            const deleteY = chartArea.top + 20;
            if (Math.abs(x - centerX) < handleSize && Math.abs(y - deleteY) < handleSize) {
                return { type: 'delete' };
            }

            // Check start handle
            if (Math.abs(x - startPixel) < handleSize && y >= chartArea.top && y <= chartArea.bottom) {
                return { type: 'start' };
            }

            // Check end handle
            if (Math.abs(x - endPixel) < handleSize && y >= chartArea.top && y <= chartArea.bottom) {
                return { type: 'end' };
            }
        }

        return null;
    }

    /**
     * Drag handle to resize/move annotation
     */
    dragHandle(x) {
        if (!this.selectedAnnotation || !this.editingHandle || !this.chart) return;

        const xValue = this.getXValue(x);
        if (xValue === null) return;

        const chartArea = this.chart.chartArea;
        const xScale = this.chart.scales.x;

        // Clamp x to chart area
        const clampedX = Math.max(chartArea.left, Math.min(chartArea.right, x));
        const clampedValue = xScale.getValueForPixel(clampedX);

        if (this.selectedAnnotation.type === 'point' && this.editingHandle === 'move') {
            // Move point(s) - if we have a group, move all points together
            const dataIndex = this.getClosestDataIndex(clampedValue);

            if (this.selectedPointGroup && this.selectedPointGroup.length > 0) {
                // Move all points in the group
                this.selectedPointGroup.forEach(point => {
                    if (this.chart.data.datasets[point.data.datasetIndex]) {
                        const dataset = this.chart.data.datasets[point.data.datasetIndex];
                        const newYValue = dataset.data[dataIndex];

                        if (newYValue !== null && newYValue !== undefined) {
                            point.data.x = clampedValue;
                            point.data.y = newYValue;
                            point.data.index = dataIndex;
                        }
                    }
                });
            } else {
                // Move single point (fallback)
                if (this.chart.data.datasets[this.selectedAnnotation.data.datasetIndex]) {
                    const dataset = this.chart.data.datasets[this.selectedAnnotation.data.datasetIndex];
                    const newYValue = dataset.data[dataIndex];

                    if (newYValue !== null && newYValue !== undefined) {
                        this.selectedAnnotation.data.x = clampedValue;
                        this.selectedAnnotation.data.y = newYValue;
                        this.selectedAnnotation.data.index = dataIndex;
                    }
                }
            }

        } else if (this.selectedAnnotation.type === 'range') {
            // Resize range
            if (this.editingHandle === 'start') {
                // Don't allow start to go past end
                if (clampedValue < this.selectedAnnotation.data.end) {
                    this.selectedAnnotation.data.start = clampedValue;
                    this.selectedAnnotation.data.startIndex = this.getClosestDataIndex(clampedValue);
                }
            } else if (this.editingHandle === 'end') {
                // Don't allow end to go before start
                if (clampedValue > this.selectedAnnotation.data.start) {
                    this.selectedAnnotation.data.end = clampedValue;
                    this.selectedAnnotation.data.endIndex = this.getClosestDataIndex(clampedValue);
                }
            }
        }

        // Update display
        this.updateAnnotations();
        this.updateAnnotationsBar();
        this.drawSelectionHandles();
    }

    /**
     * Draw selection handles for editing
     */
    drawSelectionHandles() {
        if (!this.selectedAnnotation || !this.chart) {
            this.clearPreview();
            return;
        }

        this.updateOverlaySize();
        this.clearPreview();

        const xScale = this.chart.scales.x;
        const yScale = this.chart.scales.y;
        const chartArea = this.chart.chartArea;
        const color = this.getClassColor(this.selectedAnnotation.class);

        if (this.selectedAnnotation.type === 'point') {
            // Draw handles for point annotation(s)
            // If we have a group, draw handles for all points in the group
            const pointsToDraw = this.selectedPointGroup && this.selectedPointGroup.length > 0
                ? this.selectedPointGroup
                : [this.selectedAnnotation];

            pointsToDraw.forEach(point => {
                const pointPixelX = xScale.getPixelForValue(point.data.x);
                const pointPixelY = yScale.getPixelForValue(point.data.y);
                const pointColor = this.getClassColor(point.class);

                // Draw left arrow
                this.drawArrow(pointPixelX - 25, pointPixelY, 'left', pointColor);

                // Draw right arrow
                this.drawArrow(pointPixelX + 25, pointPixelY, 'right', pointColor);
            });

            // Draw delete button only once (above the selected point)
            const pointPixelX = xScale.getPixelForValue(this.selectedAnnotation.data.x);
            const pointPixelY = yScale.getPixelForValue(this.selectedAnnotation.data.y);
            const deleteY = pointPixelY - 25;
            const deleteSize = 14;

            // Background circle
            this.overlayCtx.fillStyle = '#e74c3c';
            this.overlayCtx.strokeStyle = '#ffffff';
            this.overlayCtx.lineWidth = 2;
            this.overlayCtx.beginPath();
            this.overlayCtx.arc(pointPixelX, deleteY, deleteSize, 0, Math.PI * 2);
            this.overlayCtx.fill();
            this.overlayCtx.stroke();

            // X mark
            this.overlayCtx.strokeStyle = '#ffffff';
            this.overlayCtx.lineWidth = 2.5;
            this.overlayCtx.lineCap = 'round';
            const offset = 5;
            this.overlayCtx.beginPath();
            this.overlayCtx.moveTo(pointPixelX - offset, deleteY - offset);
            this.overlayCtx.lineTo(pointPixelX + offset, deleteY + offset);
            this.overlayCtx.moveTo(pointPixelX + offset, deleteY - offset);
            this.overlayCtx.lineTo(pointPixelX - offset, deleteY + offset);
            this.overlayCtx.stroke();

        } else if (this.selectedAnnotation.type === 'range') {
            // Draw handles for range annotation
            const startPixel = xScale.getPixelForValue(this.selectedAnnotation.data.start);
            const endPixel = xScale.getPixelForValue(this.selectedAnnotation.data.end);

            const handleSize = 10;

            // Draw start handle
            this.overlayCtx.fillStyle = color;
            this.overlayCtx.strokeStyle = '#ffffff';
            this.overlayCtx.lineWidth = 2;
            this.overlayCtx.beginPath();
            this.overlayCtx.arc(startPixel, (chartArea.top + chartArea.bottom) / 2, handleSize, 0, Math.PI * 2);
            this.overlayCtx.fill();
            this.overlayCtx.stroke();

            // Draw end handle
            this.overlayCtx.beginPath();
            this.overlayCtx.arc(endPixel, (chartArea.top + chartArea.bottom) / 2, handleSize, 0, Math.PI * 2);
            this.overlayCtx.fill();
            this.overlayCtx.stroke();

            // Draw delete button (X) at top center
            const centerX = (startPixel + endPixel) / 2;
            const deleteY = chartArea.top + 20;
            const deleteSize = 16;

            // Background circle
            this.overlayCtx.fillStyle = '#e74c3c';
            this.overlayCtx.beginPath();
            this.overlayCtx.arc(centerX, deleteY, deleteSize, 0, Math.PI * 2);
            this.overlayCtx.fill();
            this.overlayCtx.stroke();

            // X mark
            this.overlayCtx.strokeStyle = '#ffffff';
            this.overlayCtx.lineWidth = 3;
            this.overlayCtx.lineCap = 'round';
            const offset = 6;
            this.overlayCtx.beginPath();
            this.overlayCtx.moveTo(centerX - offset, deleteY - offset);
            this.overlayCtx.lineTo(centerX + offset, deleteY + offset);
            this.overlayCtx.moveTo(centerX + offset, deleteY - offset);
            this.overlayCtx.lineTo(centerX - offset, deleteY + offset);
            this.overlayCtx.stroke();
        }
    }

    /**
     * Draw arrow handle
     */
    drawArrow(x, y, direction, color) {
        const arrowSize = 12;

        // Background circle
        this.overlayCtx.fillStyle = color;
        this.overlayCtx.strokeStyle = '#ffffff';
        this.overlayCtx.lineWidth = 2;
        this.overlayCtx.beginPath();
        this.overlayCtx.arc(x, y, arrowSize, 0, Math.PI * 2);
        this.overlayCtx.fill();
        this.overlayCtx.stroke();

        // Arrow
        this.overlayCtx.strokeStyle = '#ffffff';
        this.overlayCtx.lineWidth = 2.5;
        this.overlayCtx.lineCap = 'round';
        this.overlayCtx.lineJoin = 'round';

        const arrowLen = 6;
        if (direction === 'left') {
            // Left arrow: <
            this.overlayCtx.beginPath();
            this.overlayCtx.moveTo(x + 3, y - arrowLen);
            this.overlayCtx.lineTo(x - 3, y);
            this.overlayCtx.lineTo(x + 3, y + arrowLen);
            this.overlayCtx.stroke();
        } else if (direction === 'right') {
            // Right arrow: >
            this.overlayCtx.beginPath();
            this.overlayCtx.moveTo(x - 3, y - arrowLen);
            this.overlayCtx.lineTo(x + 3, y);
            this.overlayCtx.lineTo(x - 3, y + arrowLen);
            this.overlayCtx.stroke();
        }
    }

    /**
     * Update overlay canvas size to match chart canvas
     */
    updateOverlaySize() {
        if (!this.chartCanvas || !this.overlayCanvas) return;

        const rect = this.chartCanvas.getBoundingClientRect();
        this.overlayCanvas.width = rect.width;
        this.overlayCanvas.height = rect.height;
    }

    /**
     * Clear preview overlay
     */
    clearPreview() {
        if (!this.overlayCtx || !this.overlayCanvas) return;
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }

    /**
     * Draw point preview (follows mouse on curves)
     */
    drawPointPreview(x, y) {
        if (!this.chart || !this.overlayCtx) return;

        this.updateOverlaySize();
        this.clearPreview();

        const xValue = this.getXValue(x);
        if (xValue === null) return;

        // Get chart area bounds
        const chartArea = this.chart.chartArea;
        if (x < chartArea.left || x > chartArea.right) return;

        const classColor = this.getClassColor(this.currentClass);

        // Draw vertical line at cursor position
        this.overlayCtx.strokeStyle = classColor + '40';
        this.overlayCtx.lineWidth = 1;
        this.overlayCtx.setLineDash([5, 5]);
        this.overlayCtx.beginPath();
        this.overlayCtx.moveTo(x, chartArea.top);
        this.overlayCtx.lineTo(x, chartArea.bottom);
        this.overlayCtx.stroke();
        this.overlayCtx.setLineDash([]);

        // Draw points on each dataset at this x position
        const dataIndex = this.getClosestDataIndex(xValue);
        this.chart.data.datasets.forEach((dataset, i) => {
            const value = dataset.data[dataIndex];
            if (value === null || value === undefined) return;

            const yScale = this.chart.scales.y;
            const yPixel = yScale.getPixelForValue(value);

            // Draw preview point
            this.overlayCtx.fillStyle = classColor + '60';
            this.overlayCtx.strokeStyle = classColor;
            this.overlayCtx.lineWidth = 2;
            this.overlayCtx.beginPath();
            this.overlayCtx.arc(x, yPixel, 5, 0, Math.PI * 2);
            this.overlayCtx.fill();
            this.overlayCtx.stroke();
        });
    }

    /**
     * Draw vertical line preview
     */
    drawVerticalLinePreview(x) {
        if (!this.chart || !this.overlayCtx) return;

        this.updateOverlaySize();
        this.clearPreview();

        const chartArea = this.chart.chartArea;
        if (x < chartArea.left || x > chartArea.right) return;

        const classColor = this.getClassColor(this.currentClass);

        // Draw vertical line
        this.overlayCtx.strokeStyle = classColor + '60';
        this.overlayCtx.lineWidth = 2;
        this.overlayCtx.setLineDash([5, 5]);
        this.overlayCtx.beginPath();
        this.overlayCtx.moveTo(x, chartArea.top);
        this.overlayCtx.lineTo(x, chartArea.bottom);
        this.overlayCtx.stroke();
        this.overlayCtx.setLineDash([]);
    }

    /**
     * Draw range preview (area between start and current position)
     */
    drawRangePreview(startX, endX) {
        if (!this.chart || !this.overlayCtx) return;

        this.updateOverlaySize();
        this.clearPreview();

        const chartArea = this.chart.chartArea;

        // Clamp to chart area
        startX = Math.max(chartArea.left, Math.min(chartArea.right, startX));
        endX = Math.max(chartArea.left, Math.min(chartArea.right, endX));

        const classColor = this.getClassColor(this.currentClass);

        // Draw filled area
        this.overlayCtx.fillStyle = classColor + '20';
        this.overlayCtx.fillRect(
            Math.min(startX, endX),
            chartArea.top,
            Math.abs(endX - startX),
            chartArea.bottom - chartArea.top
        );

        // Draw border lines
        this.overlayCtx.strokeStyle = classColor + '80';
        this.overlayCtx.lineWidth = 2;
        this.overlayCtx.setLineDash([5, 5]);

        // Start line
        this.overlayCtx.beginPath();
        this.overlayCtx.moveTo(startX, chartArea.top);
        this.overlayCtx.lineTo(startX, chartArea.bottom);
        this.overlayCtx.stroke();

        // End line
        this.overlayCtx.beginPath();
        this.overlayCtx.moveTo(endX, chartArea.top);
        this.overlayCtx.lineTo(endX, chartArea.bottom);
        this.overlayCtx.stroke();

        this.overlayCtx.setLineDash([]);
    }

    /**
     * Delete selected annotation
     */
    deleteSelectedAnnotation() {
        if (this.activeAnnotation !== null) {
            this.annotations.splice(this.activeAnnotation, 1);
            this.activeAnnotation = null;
            this.updateAnnotations();
            this.onAnnotationsChanged();
        }
    }

    /**
     * Get class color
     */
    getClassColor(classId) {
        const cls = this.classes.find(c => c.id === classId);
        return cls ? cls.color : '#667eea';
    }

    /**
     * Set active tool
     */
    setTool(tool) {
        this.currentTool = tool;
        this.isDrawing = false;
        this.startX = null;
        this.tempRangeStart = null;
        this.isDraggingHandle = false;
        this.editingHandle = null;

        // Clear selection when switching away from select tool
        if (tool !== 'select' && this.selectedAnnotation) {
            this.selectedAnnotation = null;
            this.selectedPointGroup = null;
            this.updateAnnotations();
            this.updateAnnotationsBar();
        }

        this.clearPreview();
    }

    /**
     * Set selected class
     */
    setSelectedClass(classId) {
        this.currentClass = classId;
    }

    /**
     * Get annotations for saving
     */
    getAnnotations() {
        return this.annotations;
    }

    /**
     * Callback when annotations change
     */
    onAnnotationsChanged() {
        // Mark as having unsaved changes
        this.hasUnsavedChanges = true;

        // Override this method to handle annotation changes
        // (e.g., trigger auto-save)

        // Emit event for UI updates
        if (window.eventBus) {
            window.eventBus.emit('annotationModified', {
                imageId: this.imageId,
                annotations: this.annotations
            });
        }
    }

    /**
     * Check if tool is valid for this canvas type
     */
    isToolValid(tool) {
        return this.projectConfig.tools.includes(tool);
    }

    /**
     * Clear all annotations
     */
    clearAnnotations() {
        this.annotations = [];
        this.activeAnnotation = null;
        this.selectedAnnotation = null;
        this.selectedPointGroup = null;
        this.updateAnnotations();
        this.updateAnnotationsBar();
        this.onAnnotationsChanged();
    }

    /**
     * Clear unsaved changes flag
     */
    clearUnsavedChanges() {
        this.hasUnsavedChanges = false;
    }

    /**
     * Mark as having unsaved changes
     */
    markAsChanged() {
        this.hasUnsavedChanges = true;
    }

    /**
     * Update annotations bar with segment previews
     */
    updateAnnotationsBar() {
        const annotationsList = document.getElementById('annotationsList');
        if (!annotationsList) return;

        // Clear previous annotations
        annotationsList.innerHTML = '';

        // Filter only range annotations (segments)
        const rangeAnnotations = this.annotations.filter(ann => ann.type === 'range');

        if (rangeAnnotations.length === 0) {
            annotationsList.innerHTML = '<div class="empty-annotations">No hay segmentos marcados</div>';
            return;
        }

        // Create card for each range annotation
        rangeAnnotations.forEach((ann, index) => {
            const cls = this.classes.find(c => c.id === ann.class);
            const color = cls ? cls.color : '#667eea';
            const className = cls ? cls.name : 'Unknown';

            const card = document.createElement('div');
            card.className = 'annotation-item';
            if (this.selectedAnnotation === ann) {
                card.classList.add('selected');
            }

            const rangeLabel = ann.data.rangeType || 'segment';
            const startLabel = typeof ann.data.start === 'number' ? ann.data.start.toFixed(2) : ann.data.start;
            const endLabel = typeof ann.data.end === 'number' ? ann.data.end.toFixed(2) : ann.data.end;

            card.innerHTML = `
                <div class="annotation-thumbnail">
                    <canvas width="100" height="75"></canvas>
                    <div class="annotation-overlay">
                        <div class="annotation-class-label" style="background: ${color}">
                            ${className}
                        </div>
                        <div class="annotation-type-badge">${rangeLabel}</div>
                        <button class="annotation-delete-btn" data-action="delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <div class="annotation-range-label">${startLabel} - ${endLabel}</div>
                </div>
            `;

            // Render segment preview
            const thumbnailCanvas = card.querySelector('canvas');
            this.renderSegmentThumbnail(thumbnailCanvas, ann, color);

            // Click to select
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.annotation-delete-btn')) {
                    this.selectedAnnotation = ann;
                    this.updateAnnotations();
                    this.updateAnnotationsBar();
                }
            });

            // Delete button
            const deleteBtn = card.querySelector('.annotation-delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const annIndex = this.annotations.indexOf(ann);
                    if (annIndex > -1) {
                        this.annotations.splice(annIndex, 1);
                        if (this.selectedAnnotation === ann) {
                            this.selectedAnnotation = null;
                        }
                        this.updateAnnotations();
                        this.updateAnnotationsBar();
                        this.onAnnotationsChanged();
                    }
                });
            }

            annotationsList.appendChild(card);
        });
    }

    /**
     * Render segment thumbnail preview
     */
    renderSegmentThumbnail(canvas, annotation, color) {
        if (!this.chart || !canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Draw background (lighter color)
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, width, height);

        // Get data within the range
        const startIndex = annotation.data.startIndex;
        const endIndex = annotation.data.endIndex;

        if (!this.parsedData || startIndex >= this.parsedData.length) return;

        // Extract data for this segment from all datasets
        const segmentData = [];
        this.chart.data.datasets.forEach((dataset, i) => {
            const values = [];
            for (let idx = startIndex; idx <= endIndex && idx < dataset.data.length; idx++) {
                values.push(dataset.data[idx]);
            }
            if (values.length > 0) {
                segmentData.push({
                    values: values,
                    color: dataset.borderColor
                });
            }
        });

        if (segmentData.length === 0) return;

        // Find min/max for scaling
        let minY = Infinity;
        let maxY = -Infinity;
        segmentData.forEach(series => {
            series.values.forEach(val => {
                if (typeof val === 'number') {
                    minY = Math.min(minY, val);
                    maxY = Math.max(maxY, val);
                }
            });
        });

        const padding = 8;
        const chartHeight = height - padding * 2;
        const chartWidth = width - padding * 2;
        const range = maxY - minY || 1;

        // Draw each dataset with thicker lines
        segmentData.forEach(series => {
            ctx.strokeStyle = series.color || color;
            ctx.lineWidth = 2.5;  // Thicker lines for better visibility
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();

            const stepX = chartWidth / (series.values.length - 1 || 1);

            series.values.forEach((val, idx) => {
                if (typeof val !== 'number') return;

                const x = padding + idx * stepX;
                const y = padding + chartHeight - ((val - minY) / range) * chartHeight;

                if (idx === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });

            ctx.stroke();
        });

        // Draw border
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, width, height);
    }

    /**
     * Update tool availability based on project type
     * Hides/shows tools in the UI
     */
    updateToolAvailability() {
        // Hide image annotation tools (bbox, mask, obb, keypoints)
        const bboxBtn = document.querySelector('[data-tool="bbox"]');
        const obbBtn = document.querySelector('[data-tool="obb"]');
        const maskBtn = document.querySelector('[data-tool="mask"]');
        const keypointsBtn = document.querySelector('[data-tool="keypoints"]');
        const eraseBtn = document.getElementById('btnEraseMode');
        const maskControls = document.getElementById('maskControls');
        const rotationControls = document.getElementById('rotationControls');

        if (bboxBtn) bboxBtn.style.display = 'none';
        if (obbBtn) obbBtn.style.display = 'none';
        if (maskBtn) maskBtn.style.display = 'none';
        if (keypointsBtn) keypointsBtn.style.display = 'none';
        if (eraseBtn) eraseBtn.style.display = 'none';
        if (maskControls) maskControls.style.display = 'none';
        if (rotationControls) rotationControls.style.display = 'none';

        // Show/hide time series tools based on project config
        const pointBtn = document.querySelector('[data-tool="point"]');
        const rangeBtn = document.querySelector('[data-tool="range"]');

        if (pointBtn) {
            pointBtn.style.display = this.projectConfig.allowPoint ? 'flex' : 'none';
        }
        if (rangeBtn) {
            rangeBtn.style.display = this.projectConfig.allowRange ? 'flex' : 'none';
        }

        // Show scale controls, hide zoom and view controls for time series
        const scaleControls = document.getElementById('scaleControls');
        const zoomControls = document.getElementById('zoomControls');
        const viewControls = document.getElementById('viewControls');

        if (scaleControls) scaleControls.style.display = 'flex';
        if (zoomControls) zoomControls.style.display = 'none';
        if (viewControls) viewControls.style.display = 'none';
    }

    /**
     * Redraw chart (compatibility with image canvas)
     */
    redraw() {
        if (this.chart) {
            this.chart.update();
        }
    }

    /**
     * Toggle grid visibility
     */
    toggleGrid() {
        this.showGrid = !this.showGrid;
        if (this.chart) {
            this.chart.options.scales.x.grid.display = this.showGrid;
            this.chart.options.scales.y.grid.display = this.showGrid;
            this.chart.update();
        }
    }

    /**
     * Toggle annotation labels visibility
     */
    toggleLabels() {
        this.showLabels = !this.showLabels;
        // For now, just a placeholder - could hide annotation labels in future
        this.redraw();
    }

    /**
     * Toggle X-axis labels visibility
     */
    toggleXAxisLabels() {
        this.showXAxisLabels = !this.showXAxisLabels;
        if (this.chart) {
            this.chart.options.scales.x.ticks.display = this.showXAxisLabels;
            this.chart.update();
        }
    }

    /**
     * Increase X scale (zoom in on time axis)
     */
    scaleXIn() {
        this.scaleX *= 1.3;
        this.applyScale();
        this.renderTimeline();
    }

    /**
     * Decrease X scale (zoom out on time axis)
     */
    scaleXOut() {
        this.scaleX = Math.max(1.0, this.scaleX / 1.3);
        this.applyScale();
        this.renderTimeline();
    }

    /**
     * Increase Y scale (zoom in on value axis)
     */
    scaleYIn() {
        this.scaleY *= 1.2;
        this.applyScale();
    }

    /**
     * Decrease Y scale (zoom out on value axis)
     */
    scaleYOut() {
        this.scaleY /= 1.2;
        this.applyScale();
    }

    /**
     * Reset both scales to default
     */
    resetScale() {
        this.scaleY = 1.0;
        this.scaleX = 1.0;
        this.viewportStartIndex = 0;
        this.viewportEndIndex = null;
        this.applyScale();
        this.renderTimeline();
    }

    /**
     * Apply current scales and viewport to chart
     */
    applyScale() {
        if (!this.chart || !this.parsedData || this.parsedData.length === 0) return;

        const totalPoints = this.parsedData.length;

        // Calculate viewport range based on X scale
        const viewportWidth = Math.ceil(totalPoints / this.scaleX);

        // Ensure viewport stays within bounds
        if (this.viewportEndIndex === null || this.scaleX === 1.0) {
            this.viewportStartIndex = 0;
            this.viewportEndIndex = totalPoints - 1;
        } else {
            // Clamp viewport
            this.viewportStartIndex = Math.max(0, this.viewportStartIndex);
            this.viewportEndIndex = Math.min(totalPoints - 1, this.viewportStartIndex + viewportWidth);

            // Adjust if we're at the end
            if (this.viewportEndIndex >= totalPoints - 1) {
                this.viewportEndIndex = totalPoints - 1;
                this.viewportStartIndex = Math.max(0, this.viewportEndIndex - viewportWidth);
            }
        }

        // Update chart data to show only viewport range
        const originalLabels = this.prepareChartData().labels;
        const originalDatasets = this.prepareChartData().datasets;

        this.chart.data.labels = originalLabels.slice(this.viewportStartIndex, this.viewportEndIndex + 1);
        this.chart.data.datasets = originalDatasets.map(dataset => ({
            ...dataset,
            data: dataset.data.slice(this.viewportStartIndex, this.viewportEndIndex + 1)
        }));

        // Apply Y scale
        let minY = Infinity;
        let maxY = -Infinity;

        this.chart.data.datasets.forEach(dataset => {
            dataset.data.forEach(value => {
                if (typeof value === 'number') {
                    minY = Math.min(minY, value);
                    maxY = Math.max(maxY, value);
                }
            });
        });

        const centerY = (minY + maxY) / 2;
        const rangeY = (maxY - minY) / this.scaleY;

        this.chart.options.scales.y.min = centerY - rangeY / 2;
        this.chart.options.scales.y.max = centerY + rangeY / 2;

        this.chart.update('none');
        this.updateTimelineViewport();
    }

    /**
     * Legacy zoom methods (for compatibility)
     */
    zoomIn() {
        this.scaleYIn();
    }

    zoomOut() {
        this.scaleYOut();
    }

    resetZoom() {
        this.resetScale();
    }

    setZoom(level) {
        this.scaleY = level;
        this.applyScale();
    }

    /**
     * Render timeline minimap
     */
    renderTimeline() {
        if (!this.timelineCanvas || !this.timelineCtx || !this.parsedData || this.parsedData.length === 0) {
            return;
        }

        const canvas = this.timelineCanvas;
        const ctx = this.timelineCtx;

        // Set canvas size
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        const width = canvas.width;
        const height = canvas.height;
        const padding = 4;

        // Clear
        ctx.clearRect(0, 0, width, height);

        // Draw background
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, width, height);

        // Get full data range for minimap
        const fullData = this.prepareChartData();
        if (!fullData || !fullData.datasets || fullData.datasets.length === 0) return;

        // Find min/max for scaling
        let minY = Infinity;
        let maxY = -Infinity;
        fullData.datasets.forEach(dataset => {
            dataset.data.forEach(val => {
                if (typeof val === 'number') {
                    minY = Math.min(minY, val);
                    maxY = Math.max(maxY, val);
                }
            });
        });

        const range = maxY - minY || 1;
        const chartHeight = height - padding * 2;
        const chartWidth = width - padding * 2;
        const totalPoints = fullData.labels.length;
        const stepX = chartWidth / (totalPoints - 1 || 1);

        // Draw each dataset
        fullData.datasets.forEach((dataset, dsIndex) => {
            ctx.strokeStyle = dataset.borderColor || '#667eea';
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();

            let started = false;
            dataset.data.forEach((val, idx) => {
                if (typeof val !== 'number') return;

                const x = padding + idx * stepX;
                const y = padding + chartHeight - ((val - minY) / range) * chartHeight;

                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            });

            ctx.stroke();
        });

        // Update viewport indicator
        this.updateTimelineViewport();
    }

    /**
     * Update timeline viewport indicator position
     */
    updateTimelineViewport() {
        if (!this.timelineViewport || !this.parsedData || this.parsedData.length === 0) {
            return;
        }

        const totalPoints = this.parsedData.length;
        const startPercent = (this.viewportStartIndex / totalPoints) * 100;
        const endPercent = ((this.viewportEndIndex + 1) / totalPoints) * 100;
        const widthPercent = endPercent - startPercent;

        this.timelineViewport.style.left = `${startPercent}%`;
        this.timelineViewport.style.width = `${widthPercent}%`;
    }

    /**
     * Timeline mouse down - start dragging viewport
     */
    onTimelineMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();

        this.isDraggingTimeline = true;
        this.timelineDragStartX = e.clientX;
        this.timelineDragStartViewport = this.viewportStartIndex;
    }

    /**
     * Timeline mouse move - drag viewport
     */
    onTimelineMouseMove(e) {
        if (!this.isDraggingTimeline || !this.timelineCanvas) return;

        const rect = this.timelineCanvas.getBoundingClientRect();
        const deltaX = e.clientX - this.timelineDragStartX;
        const deltaPercent = deltaX / rect.width;

        const totalPoints = this.parsedData.length;
        const deltaPoints = Math.round(deltaPercent * totalPoints);

        const viewportWidth = this.viewportEndIndex - this.viewportStartIndex;
        let newStart = this.timelineDragStartViewport + deltaPoints;

        // Clamp to bounds
        newStart = Math.max(0, Math.min(totalPoints - viewportWidth - 1, newStart));

        this.viewportStartIndex = newStart;
        this.viewportEndIndex = newStart + viewportWidth;

        // Update chart with new viewport
        this.applyScale();
    }

    /**
     * Timeline mouse up - stop dragging
     */
    onTimelineMouseUp(e) {
        if (this.isDraggingTimeline) {
            this.isDraggingTimeline = false;
            this.timelineDragStartX = null;
            this.timelineDragStartViewport = null;
        }
    }

    /**
     * Destroy canvas and cleanup
     */
    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }

        if (this.chartContainer && this.chartContainer.parentNode) {
            this.chartContainer.parentNode.removeChild(this.chartContainer);
        }

        // Clean up overlay
        this.overlayCanvas = null;
        this.overlayCtx = null;

        // Hide timeline
        const timelineContainer = document.getElementById('timelineContainer');
        if (timelineContainer) {
            timelineContainer.style.display = 'none';
        }

        // Clean up timeline references
        this.timelineCanvas = null;
        this.timelineCtx = null;
        this.timelineViewport = null;

        // Show original canvas again
        if (this.canvas) {
            this.canvas.style.display = 'block';
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimeSeriesCanvasManager;
}
