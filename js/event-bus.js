/**
 * EVENT BUS - Centralized event system
 * Handles application-wide events to keep UI synchronized
 *
 * Events emitted:
 * - annotationCreated: When a new annotation is added → updates stats, gallery
 * - annotationDeleted: When an annotation is removed → updates stats, gallery
 * - annotationModified: When an annotation is edited → updates stats, gallery
 * - imageDeleted: When an image is deleted → updates stats
 * - classAdded: When a new class is created → updates stats
 * - classModified: When a class name/color is edited → updates stats, gallery
 * - classDeleted: When a class is removed → updates stats, gallery
 *
 * UI components auto-updated:
 * - Statistics panel (image count, annotation count, class distribution)
 * - Gallery thumbnails (annotation counts, class badges)
 * - Annotations bar (list of annotations for current image)
 */

class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} eventName - Name of the event
     * @param {Function} callback - Function to call when event is emitted
     * @returns {Function} Unsubscribe function
     */
    on(eventName, callback) {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }

        const callbacks = this.listeners.get(eventName);
        callbacks.push(callback);

        // Return unsubscribe function
        return () => {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }

    /**
     * Emit an event to all subscribers
     * @param {string} eventName - Name of the event
     * @param {*} data - Data to pass to subscribers
     */
    emit(eventName, data) {
        const callbacks = this.listeners.get(eventName);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for "${eventName}":`, error);
                }
            });
        }
    }

    /**
     * Remove all listeners for an event
     * @param {string} eventName - Name of the event
     */
    off(eventName) {
        this.listeners.delete(eventName);
    }

    /**
     * Remove all listeners
     */
    clear() {
        this.listeners.clear();
    }
}

// Create global event bus instance
window.eventBus = new EventBus();
