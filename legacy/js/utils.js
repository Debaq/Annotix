/**
 * UTILITY FUNCTIONS
 * Pure utility functions without dependencies on application state
 */

class Utils {
    /**
     * Generates a random hex color
     * @returns {string} Random color in format #RRGGBB
     */
    static randomColor() {
        return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    }

    /**
     * Gets FontAwesome icon class for a project type
     * @param {string} type - Project type (classification, detection, segmentation, etc.)
     * @returns {string} FontAwesome icon class
     */
    static getProjectTypeIcon(type) {
        const icons = {
            'classification': 'fa-tag',
            'multiLabel': 'fa-tags',
            'detection': 'fa-vector-square',
            'segmentation': 'fa-fill-drip',
            'instanceSeg': 'fa-object-group',
            'keypoints': 'fa-braille',
            'obb': 'fa-rotate'
        };
        return icons[type] || 'fa-folder';
    }

    /**
     * Converts a File object to a Blob
     * @param {File} file - File to convert
     * @returns {Promise<Blob>} Promise that resolves with Blob
     */
    static fileToBlob(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve(new Blob([e.target.result], { type: file.type }));
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Loads an image file and returns an Image object
     * @param {File} file - Image file to load
     * @returns {Promise<Image>} Promise that resolves with loaded Image
     */
    static loadImageFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
}
