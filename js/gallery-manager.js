/**
 * GALLERY MANAGER - FIXED VERSION
 * Manages image gallery display and navigation
 * 
 * FIXES:
 * - Proper async/await handling
 * - Better error handling in loadImages()
 * - Fixed render() to handle blob URLs correctly
 * - Added proper cleanup of old blob URLs
 */

class GalleryManager {
    constructor(container, db, app, ui) {
        this.container = container;
        this.db = db;
        this.app = app; // Reference to main app for accessing both managers
        this.ui = ui;
        this.images = [];
        this.currentFilter = 'all'; // 'all', 'annotated', 'unannotated'
        this.blobUrls = new Map(); // Track blob URLs for cleanup
    }

    async loadImages(projectId) {
        try {
            // IMPORTANT: Clean up old blob URLs BEFORE loading new images
            this.cleanupBlobUrls();

            // CRITICAL: Clear old images array to prevent showing images from previous project
            this.images = [];

            // Load images for the specific project
            this.images = await this.db.getProjectImages(projectId);

            // Verify all images belong to this project (safety check)
            const wrongProjectImages = this.images.filter(img => img.projectId !== projectId);
            if (wrongProjectImages.length > 0) {
                console.error('WARNING: Found images from wrong project!', wrongProjectImages);
                this.images = this.images.filter(img => img.projectId === projectId);
            }

            this.render();
        } catch (error) {
            console.error('Error loading images:', error);
            this.ui.showToast(window.i18n.t('notifications.error.loadImages'), 'error');
        }
    }

    setFilter(filter) {
        this.currentFilter = filter;
        this.render();
    }

    getFilteredImages() {
        switch (this.currentFilter) {
            case 'annotated':
                return this.images.filter(img => img.annotations && img.annotations.length > 0);
            case 'unannotated':
                return this.images.filter(img => !img.annotations || img.annotations.length === 0);
            default:
                return this.images;
        }
    }

    cleanupBlobUrls() {
        // Revoke old blob URLs to prevent memory leaks
        this.blobUrls.forEach(url => URL.revokeObjectURL(url));
        this.blobUrls.clear();
    }

    render() {
        const filtered = this.getFilteredImages();

        if (filtered.length === 0) {
            this.container.innerHTML = `<div class="empty-gallery">${window.i18n.t('gallery.empty')}</div>`;
            return;
        }

        this.container.innerHTML = '';

        filtered.forEach(imageData => {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            
            // Add status classes
            if (!imageData.annotations || imageData.annotations.length === 0) {
                item.classList.add('no-annotations');
            }
            // Check active image based on current mode
            let currentImageId = null;
            if (this.app.annotationMode === 'classification') {
                currentImageId = this.app.classificationManager.imageId;
            } else if (this.app.canvasManager) {
                currentImageId = this.app.canvasManager.imageId;
            }

            if (currentImageId && imageData.id === currentImageId) {
                item.classList.add('active');
            }

            // Use displayName or originalFileName for showing to user, fallback to name (code)
            const displayName = imageData.displayName || imageData.originalFileName || imageData.name;

            // Detect if this is a time series (CSV)
            const isTimeSeries = imageData.mimeType === 'text/csv' || imageData.timeSeriesMetadata;
            let imageContent;

            if (isTimeSeries) {
                // For time series, show a placeholder icon
                imageContent = `
                    <div class="gallery-timeseries-placeholder">
                        <i class="fas fa-chart-line"></i>
                    </div>
                `;
            } else {
                // For regular images, create blob URL and store it
                const url = URL.createObjectURL(imageData.image);
                this.blobUrls.set(imageData.id, url);
                imageContent = `<img src="${url}" alt="${displayName}" title="${displayName}">`;
            }

            // Use the app's countAnnotations method for correct counting
            // (handles time series grouping correctly)
            const annotationCount = this.app.countAnnotations
                ? this.app.countAnnotations(imageData.annotations)
                : (imageData.annotations ? imageData.annotations.length : 0);

            // For classification projects, show class badges instead of count
            let overlayContent = '';
            if (this.app.annotationMode === 'classification' && annotationCount > 0) {
                // Get class names for badges
                const classNames = imageData.annotations.map(classId => {
                    const cls = this.app.classificationManager.classes.find(c => c.id === classId);
                    return cls ? { name: cls.name, color: cls.color } : null;
                }).filter(c => c !== null);

                if (classNames.length > 0) {
                    overlayContent = `
                        <div class="gallery-class-badges">
                            ${classNames.map(cls => `
                                <span class="gallery-class-badge" style="background: ${cls.color}">
                                    ${cls.name}
                                </span>
                            `).join('')}
                        </div>
                    `;
                }
            } else {
                // For detection/segmentation projects, show annotation count
                overlayContent = `<span>${annotationCount} labels</span>`;
            }

            // Check if augmentation button should be shown (only for image-based projects)
            const showAugmentButton = this.app.isImageBasedProject && this.app.isImageBasedProject();
            const augmentButtonHTML = showAugmentButton ? `
                <button class="gallery-item-augment" data-id="${imageData.id}" data-i18n-title="augmentation.augmentImage" title="Data Augmentation">
                    <i class="fas fa-wand-magic-sparkles"></i>
                </button>
            ` : '';

            item.innerHTML = `
                ${imageContent}
                <div class="gallery-item-overlay">
                    ${overlayContent}
                </div>
                <div class="gallery-item-actions">
                    ${augmentButtonHTML}
                    <button class="gallery-item-delete" data-id="${imageData.id}" data-i18n-title="actions.delete" title="Delete">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;

            // Event handlers
            item.onclick = (e) => {
                if (e.target.closest('.gallery-item-delete')) {
                    e.stopPropagation();
                    this.deleteImage(imageData.id);
                } else if (e.target.closest('.gallery-item-augment')) {
                    e.stopPropagation();
                    this.augmentImage(imageData.id);
                } else {
                    this.loadImage(imageData.id);
                }
            };

            this.container.appendChild(item);
        });
    }

    async loadImage(imageId) {
        try {
            // IMPORTANT: Save current image before loading a new one
            // This prevents losing unsaved changes when navigating between images
            if (this.app.annotationMode === 'classification') {
                if (this.app.classificationManager.hasUnsavedChanges &&
                    this.app.classificationManager.imageId) {
                    await this.app.saveCurrentImage(true); // true = silent save
                }
            } else {
                if (this.app.canvasManager.hasUnsavedChanges &&
                    this.app.canvasManager.imageId) {
                    await this.app.saveCurrentImage(true); // true = silent save
                }
            }

            const imageData = await this.db.getImage(imageId);

            if (!imageData) {
                console.error('Image not found:', imageId);
                this.ui.showToast(window.i18n.t('notifications.error.loadImage'), 'error');
                return;
            }

            // Create File from Blob
            const blob = imageData.image;
            const file = new File([blob], imageData.name, { type: blob.type });

            // Check if it's time series data
            const isTimeSeries = imageData.mimeType === 'text/csv' || imageData.timeSeriesMetadata;

            if (isTimeSeries) {
                // Time Series mode
                if (this.app.canvasManager && this.app.canvasManager.loadData) {
                    await this.app.canvasManager.loadData(imageData);
                    this.app.canvasManager.imageId = imageId;
                    this.app.canvasManager.imageName = imageData.name;

                    // Note: annotations are loaded inside loadData()
                    if (this.app.canvasManager.clearUnsavedChanges) {
                        this.app.canvasManager.clearUnsavedChanges();
                    }
                } else {
                    console.error('Canvas manager does not support time series data');
                    this.ui.showToast('Canvas no soporta series temporales', 'error');
                }
            } else if (this.app.annotationMode === 'classification') {
                // Classification mode
                await this.app.classificationManager.loadImage(file);
                this.app.classificationManager.imageId = imageId;
                this.app.classificationManager.imageName = imageData.name;

                // Load labels (stored in annotations array as class IDs)
                const labels = imageData.annotations || [];
                this.app.classificationManager.setLabels(labels);
                this.app.classificationManager.clearUnsavedChanges();
            } else {
                // Canvas mode (detection, segmentation, etc.)
                await this.app.canvasManager.loadImage(file);
                this.app.canvasManager.imageId = imageId;
                this.app.canvasManager.imageName = imageData.name;
                this.app.canvasManager.annotations = imageData.annotations || [];

                this.app.canvasManager.clearUnsavedChanges();
                this.app.canvasManager.redraw();
                this.app.canvasManager.updateAnnotationsBar();
            }

            // Update gallery display
            this.render();

            // Update stats and class counts after loading image
            this.app.updateStats();
            this.app.updateClassUI();
        } catch (error) {
            console.error('Error loading image:', error);
            this.ui.showToast(window.i18n.t('notifications.error.loadImage'), 'error');
        }
    }

    async deleteImage(imageId) {
        const confirmMsg = window.i18n.t('gallery.deleteConfirm');
        if (!confirm(confirmMsg)) return;

        try {
            await this.db.deleteImage(imageId);

            // Remove from local array
            this.images = this.images.filter(img => img.id !== imageId);

            // Cleanup blob URL
            const url = this.blobUrls.get(imageId);
            if (url) {
                URL.revokeObjectURL(url);
                this.blobUrls.delete(imageId);
            }

            this.render();

            // Clear canvas if this was the current image
            if (this.app.annotationMode === 'classification') {
                if (this.app.classificationManager && this.app.classificationManager.imageId === imageId) {
                    this.app.classificationManager.clear();
                }
            } else if (this.app.canvasManager && this.app.canvasManager.imageId === imageId) {
                this.app.canvasManager.clearCanvas();
            }

            // Update stats and class counts after deletion
            this.app.updateStats();
            this.app.updateClassUI();
            await this.app.updateStorageIndicator();

            // Emit event for UI updates
            if (window.eventBus) {
                window.eventBus.emit('imageDeleted', { imageId });
            }

            this.ui.showToast(window.i18n.t('notifications.imageDeleted'), 'success');
        } catch (error) {
            console.error('Error deleting image:', error);
            this.ui.showToast(window.i18n.t('notifications.error.deleteImage'), 'error');
        }
    }

    async augmentImage(imageId) {
        try {
            // Get image data
            const imageData = await this.db.getImage(imageId);

            if (!imageData) {
                console.error('Image not found:', imageId);
                this.ui.showToast(window.i18n.t('notifications.error.loadImage'), 'error');
                return;
            }

            // Get app instance and call augmentation modal
            // The app instance is available globally
            if (window.app && window.app.showAugmentationModal) {
                window.app.showAugmentationModal(imageData);
            } else {
                console.error('App instance not available');
                this.ui.showToast('Error: Application not initialized', 'error');
            }
        } catch (error) {
            console.error('Error loading image for augmentation:', error);
            this.ui.showToast(window.i18n.t('notifications.error.loadImage'), 'error');
        }
    }

    getCurrentImageIndex() {
        // Get current image ID based on annotation mode
        const currentImageId = this.app.annotationMode === 'classification'
            ? this.app.classificationManager.imageId
            : this.app.canvasManager.imageId;

        return this.images.findIndex(img => img.id === currentImageId);
    }

    async navigateNext() {
        const currentIndex = this.getCurrentImageIndex();
        if (currentIndex < this.images.length - 1) {
            await this.loadImage(this.images[currentIndex + 1].id);
        }
    }

    async navigatePrevious() {
        const currentIndex = this.getCurrentImageIndex();
        if (currentIndex > 0) {
            await this.loadImage(this.images[currentIndex - 1].id);
        }
    }

    canNavigateNext() {
        const currentIndex = this.getCurrentImageIndex();
        return currentIndex >= 0 && currentIndex < this.images.length - 1;
    }

    canNavigatePrevious() {
        const currentIndex = this.getCurrentImageIndex();
        return currentIndex > 0;
    }

    async updateThumbnail(imageId) {
        // Update only the thumbnail for a specific image without reloading entire gallery
        try {
            // Find the image in our current images array
            const imageIndex = this.images.findIndex(img => img.id === imageId);
            if (imageIndex === -1) {
                return;
            }

            // Reload just this image's data from DB
            const updatedImageData = await this.db.getImage(imageId);
            if (!updatedImageData) {
                return;
            }

            // Update our local array
            this.images[imageIndex] = updatedImageData;

            // Find the gallery item DOM element
            const galleryItem = document.querySelector(`.gallery-item[data-image-id="${imageId}"]`);
            if (!galleryItem) {
                return;
            }

            // Update the annotation count badge
            const annotationCount = updatedImageData.annotations?.length || 0;
            const badge = galleryItem.querySelector('.annotation-badge');
            if (badge) {
                badge.textContent = annotationCount;
                badge.style.display = annotationCount > 0 ? 'flex' : 'none';
            }

            // Update annotated/unannotated status
            if (annotationCount > 0) {
                galleryItem.classList.add('annotated');
                galleryItem.classList.remove('unannotated');
            } else {
                galleryItem.classList.remove('annotated');
                galleryItem.classList.add('unannotated');
            }
        } catch (error) {
            console.error('Error updating thumbnail:', error);
        }
    }
}