/**
 * ImagePreprocessor - Handles image preprocessing for ML training
 * Provides letterboxing (padding) to convert images to square format
 * while preserving aspect ratio and adjusting annotations accordingly.
 */

class ImagePreprocessor {
  constructor() {
    // Standard YOLO image sizes
    this.standardSizes = [416, 640, 800, 1024, 1280];
  }

  /**
   * Check if image needs preprocessing (is not square)
   */
  needsPreprocessing(width, height) {
    return width !== height;
  }

  /**
   * Calculate padding needed to make image square
   * @returns {Object} { paddingTop, paddingBottom, paddingLeft, paddingRight, targetSize }
   */
  calculatePadding(originalWidth, originalHeight, targetSize = null) {
    const maxDim = Math.max(originalWidth, originalHeight);

    // If no target size specified, use the max dimension
    const finalSize = targetSize || maxDim;

    // Calculate total padding needed
    const totalPaddingX = finalSize - originalWidth;
    const totalPaddingY = finalSize - originalHeight;

    // Distribute padding symmetrically
    return {
      paddingLeft: Math.floor(totalPaddingX / 2),
      paddingRight: Math.ceil(totalPaddingX / 2),
      paddingTop: Math.floor(totalPaddingY / 2),
      paddingBottom: Math.ceil(totalPaddingY / 2),
      targetSize: finalSize,
      originalWidth,
      originalHeight
    };
  }

  /**
   * Apply letterboxing to an image
   * @param {HTMLImageElement} img - Source image
   * @param {number} targetSize - Desired square size
   * @param {string} paddingColor - Color for padding (default: black)
   * @param {string} strategy - 'padding' (only pad) or 'resize' (resize then pad)
   * @returns {Promise<{blob: Blob, canvas: HTMLCanvasElement, padding: Object}>}
   */
  async applyLetterboxing(img, targetSize = null, paddingColor = '#000000', strategy = 'resize') {
    return new Promise((resolve, reject) => {
      try {
        const finalSize = targetSize || Math.max(img.width, img.height);

        let drawWidth, drawHeight, offsetX, offsetY;

        if (strategy === 'resize') {
          // Resize to fit within target size, maintaining aspect ratio
          const scale = Math.min(finalSize / img.width, finalSize / img.height);
          drawWidth = Math.round(img.width * scale);
          drawHeight = Math.round(img.height * scale);
          offsetX = Math.floor((finalSize - drawWidth) / 2);
          offsetY = Math.floor((finalSize - drawHeight) / 2);
        } else {
          // Only padding, keep original size
          drawWidth = img.width;
          drawHeight = img.height;
          offsetX = Math.floor((finalSize - drawWidth) / 2);
          offsetY = Math.floor((finalSize - drawHeight) / 2);
        }

        // Create canvas with target size
        const canvas = document.createElement('canvas');
        canvas.width = finalSize;
        canvas.height = finalSize;

        const ctx = canvas.getContext('2d');

        // Fill with padding color
        ctx.fillStyle = paddingColor;
        ctx.fillRect(0, 0, finalSize, finalSize);

        // Draw image (resized or original) centered
        ctx.drawImage(
          img,
          offsetX,
          offsetY,
          drawWidth,
          drawHeight
        );

        // Calculate padding info
        const padding = {
          paddingLeft: offsetX,
          paddingRight: finalSize - offsetX - drawWidth,
          paddingTop: offsetY,
          paddingBottom: finalSize - offsetY - drawHeight,
          targetSize: finalSize,
          originalWidth: img.width,
          originalHeight: img.height,
          drawWidth,
          drawHeight,
          strategy
        };

        // Convert to blob
        canvas.toBlob((blob) => {
          if (blob) {
            resolve({ blob, canvas, padding });
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        }, 'image/png');

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Adjust annotation coordinates for padded image
   * @param {Array} annotations - Original annotations
   * @param {Object} padding - Padding information
   * @returns {Array} Adjusted annotations
   */
  adjustAnnotations(annotations, padding) {
    if (!annotations || annotations.length === 0) {
      return [];
    }

    return annotations.map(annotation => {
      const adjusted = { ...annotation };

      if (annotation.type === 'bbox') {
        // Adjust bounding box coordinates
        adjusted.data = {
          x: annotation.data.x + padding.paddingLeft,
          y: annotation.data.y + padding.paddingTop,
          width: annotation.data.width,
          height: annotation.data.height
        };
      } else if (annotation.type === 'mask') {
        // For masks, we need to create a new padded mask
        // This will be handled separately as it requires canvas operations
        adjusted.needsMaskAdjustment = true;
        adjusted.padding = padding;
      }

      return adjusted;
    });
  }

  /**
   * Adjust a mask annotation by adding padding
   * @param {string} maskDataUrl - Base64 PNG mask data
   * @param {Object} padding - Padding information
   * @returns {Promise<string>} New padded mask as Base64 PNG
   */
  async adjustMask(maskDataUrl, padding) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = padding.targetSize;
        canvas.height = padding.targetSize;

        const ctx = canvas.getContext('2d');

        // Canvas starts transparent (empty mask)
        // Draw original mask at offset position
        ctx.drawImage(
          img,
          padding.paddingLeft,
          padding.paddingTop,
          padding.originalWidth,
          padding.originalHeight
        );

        // Convert to data URL
        resolve(canvas.toDataURL('image/png'));
      };

      img.onerror = () => reject(new Error('Failed to load mask image'));
      img.src = maskDataUrl;
    });
  }

  /**
   * Get recommended target size based on image dimensions
   */
  getRecommendedSize(width, height) {
    const maxDim = Math.max(width, height);

    // Find the smallest standard size that fits the image
    for (const size of this.standardSizes) {
      if (size >= maxDim) {
        return size;
      }
    }

    // If image is larger than all standard sizes, round up to nearest 32
    return Math.ceil(maxDim / 32) * 32;
  }

  /**
   * Batch process multiple images
   */
  async processImages(images, targetSize, onProgress = null) {
    const results = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];

      if (this.needsPreprocessing(img.width, img.height)) {
        const result = await this.applyLetterboxing(img, targetSize);
        results.push({
          original: img,
          processed: result,
          wasProcessed: true
        });
      } else {
        results.push({
          original: img,
          processed: null,
          wasProcessed: false
        });
      }

      if (onProgress) {
        onProgress(i + 1, images.length);
      }
    }

    return results;
  }

  /**
   * Create a preview showing before/after
   */
  createPreviewCanvas(originalImg, processedCanvas, padding) {
    const previewCanvas = document.createElement('canvas');
    const gap = 20;
    const maxWidth = 400;

    // Calculate scale to fit preview
    const scale = Math.min(maxWidth / padding.targetSize, 1);
    const scaledSize = padding.targetSize * scale;
    const originalScaledW = padding.originalWidth * scale;
    const originalScaledH = padding.originalHeight * scale;

    previewCanvas.width = scaledSize * 2 + gap;
    previewCanvas.height = scaledSize;

    const ctx = previewCanvas.getContext('2d');

    // Fill background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

    // Draw original (centered in left half)
    const origX = (scaledSize - originalScaledW) / 2;
    const origY = (scaledSize - originalScaledH) / 2;
    ctx.drawImage(originalImg, origX, origY, originalScaledW, originalScaledH);

    // Draw processed (right half)
    ctx.drawImage(processedCanvas, scaledSize + gap, 0, scaledSize, scaledSize);

    // Add labels
    ctx.fillStyle = '#333';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Original', scaledSize / 2, scaledSize + 20);
    ctx.fillText('Processed', scaledSize + gap + scaledSize / 2, scaledSize + 20);

    return previewCanvas;
  }

  // ==========================================
  // DATA AUGMENTATION METHODS
  // ==========================================

  /**
   * Apply data augmentation transformations to an image
   * For bbox projects: transforms annotations with the image
   * For mask projects: only transforms the image (annotations not preserved)
   *
   * @param {Blob} imageBlob - Original image blob
   * @param {Object} config - Transformation configuration
   *   {
   *     flipHorizontal: boolean,
   *     flipVertical: boolean,
   *     rotation: number (0, 90, 180, 270, or any angle),
   *     brightness: number (-100 to 100),
   *     contrast: number (-100 to 100),
   *     saturation: number (-100 to 100)
   *   }
   * @param {Array} annotations - Original annotations (only for bbox projects)
   * @param {string} projectType - 'bbox' or 'mask'
   * @returns {Promise<{blob: Blob, annotations: Array, width: number, height: number}>}
   */
  async applyAugmentation(imageBlob, config, annotations = [], projectType = 'bbox') {
    // Load image from blob
    const img = await this.loadImageFromBlob(imageBlob);

    let width = img.width;
    let height = img.height;

    // Calculate final dimensions after rotation
    if (config.rotation && config.rotation !== 0) {
      if (config.rotation % 90 === 0) {
        // Fixed angle rotation (90, 180, 270)
        if (config.rotation === 90 || config.rotation === 270) {
          [width, height] = [height, width];
        }
      } else {
        // Free rotation - calculate expanded dimensions
        const dimensions = this.calculateRotatedDimensions(width, height, config.rotation);
        width = dimensions.width;
        height = dimensions.height;
      }
    }

    // Create canvas for transformation
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Apply geometric transformations
    ctx.save();
    ctx.translate(width / 2, height / 2);

    // Apply flip transformations
    let scaleX = 1;
    let scaleY = 1;
    if (config.flipHorizontal) scaleX = -1;
    if (config.flipVertical) scaleY = -1;
    if (scaleX !== 1 || scaleY !== 1) {
      ctx.scale(scaleX, scaleY);
    }

    // Apply rotation
    if (config.rotation && config.rotation !== 0) {
      ctx.rotate((config.rotation * Math.PI) / 180);
    }

    // Draw image centered
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    // Apply color adjustments
    if (config.brightness !== 0 || config.contrast !== 0 || config.saturation !== 0) {
      this.applyColorAdjustments(ctx, canvas.width, canvas.height, config);
    }

    // Convert canvas to blob
    const blob = await this.canvasToBlob(canvas);

    // Transform annotations ONLY for bbox projects
    let transformedAnnotations = [];
    if (projectType === 'bbox' && annotations.length > 0) {
      transformedAnnotations = this.transformBboxAnnotations(
        annotations,
        img.width,
        img.height,
        width,
        height,
        config
      );
    }

    return {
      blob,
      annotations: transformedAnnotations,
      width,
      height
    };
  }

  /**
   * Load image from blob
   */
  loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Failed to load image'));
      };
      img.src = URL.createObjectURL(blob);
    });
  }

  /**
   * Calculate dimensions after free rotation
   */
  calculateRotatedDimensions(width, height, angle) {
    const rad = Math.abs((angle * Math.PI) / 180);
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));

    return {
      width: Math.round(width * cos + height * sin),
      height: Math.round(width * sin + height * cos)
    };
  }

  /**
   * Apply color adjustments to canvas
   */
  applyColorAdjustments(ctx, width, height, config) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Normalize values
    const brightnessFactor = config.brightness / 100;
    const contrastFactor = (config.contrast + 100) / 100;
    const saturationFactor = (config.saturation + 100) / 100;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Apply brightness
      if (config.brightness !== 0) {
        r += 255 * brightnessFactor;
        g += 255 * brightnessFactor;
        b += 255 * brightnessFactor;
      }

      // Apply contrast
      if (config.contrast !== 0) {
        r = ((r / 255 - 0.5) * contrastFactor + 0.5) * 255;
        g = ((g / 255 - 0.5) * contrastFactor + 0.5) * 255;
        b = ((b / 255 - 0.5) * contrastFactor + 0.5) * 255;
      }

      // Apply saturation
      if (config.saturation !== 0) {
        const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
        r = gray + (r - gray) * saturationFactor;
        g = gray + (g - gray) * saturationFactor;
        b = gray + (b - gray) * saturationFactor;
      }

      // Clamp values
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Transform bbox annotations according to applied transformations
   */
  transformBboxAnnotations(annotations, origWidth, origHeight, newWidth, newHeight, config) {
    return annotations
      .filter(ann => ann.type === 'bbox') // Only process bbox annotations
      .map(ann => {
        let { x, y, width, height } = ann.data;
        let centerX = x + width / 2;
        let centerY = y + height / 2;

        // Apply flip horizontal
        if (config.flipHorizontal) {
          centerX = origWidth - centerX;
        }

        // Apply flip vertical
        if (config.flipVertical) {
          centerY = origHeight - centerY;
        }

        // Apply rotation
        if (config.rotation && config.rotation !== 0) {
          const rotated = this.rotatePoint(
            centerX,
            centerY,
            origWidth / 2,
            origHeight / 2,
            config.rotation
          );
          centerX = rotated.x;
          centerY = rotated.y;

          // Swap width/height for 90° and 270° rotations
          if (config.rotation === 90 || config.rotation === 270) {
            [width, height] = [height, width];
          }
        }

        // Adjust for expanded dimensions (in case of free rotation)
        if (config.rotation && config.rotation !== 0 && config.rotation % 90 !== 0) {
          const offsetX = (newWidth - origWidth) / 2;
          const offsetY = (newHeight - origHeight) / 2;
          centerX += offsetX;
          centerY += offsetY;
        }

        // Ensure bbox is within bounds
        const finalX = Math.max(0, centerX - width / 2);
        const finalY = Math.max(0, centerY - height / 2);
        const finalWidth = Math.min(width, newWidth - finalX);
        const finalHeight = Math.min(height, newHeight - finalY);

        return {
          type: 'bbox',
          class: ann.class,
          data: {
            x: finalX,
            y: finalY,
            width: finalWidth,
            height: finalHeight
          }
        };
      });
  }

  /**
   * Rotate a point around a center
   */
  rotatePoint(x, y, cx, cy, angle) {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const dx = x - cx;
    const dy = y - cy;

    return {
      x: cx + (dx * cos - dy * sin),
      y: cy + (dx * sin + dy * cos)
    };
  }

  /**
   * Convert canvas to blob
   */
  canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        },
        'image/png'
      );
    });
  }

  /**
   * Generate a filename suffix based on applied transformations
   */
  static generateAugmentationSuffix(config) {
    const parts = [];

    if (config.flipHorizontal) parts.push('fh');
    if (config.flipVertical) parts.push('fv');
    if (config.rotation && config.rotation !== 0) {
      parts.push(`r${config.rotation}`);
    }
    if (config.brightness !== 0) {
      parts.push(`b${config.brightness > 0 ? 'p' : 'm'}${Math.abs(config.brightness)}`);
    }
    if (config.contrast !== 0) {
      parts.push(`c${config.contrast > 0 ? 'p' : 'm'}${Math.abs(config.contrast)}`);
    }
    if (config.saturation !== 0) {
      parts.push(`s${config.saturation > 0 ? 'p' : 'm'}${Math.abs(config.saturation)}`);
    }

    return parts.length > 0 ? '_' + parts.join('_') : '_aug';
  }
}

// Export as global
window.ImagePreprocessor = ImagePreprocessor;
