/**
 * PROJECT MANAGER
 * Manages project creation, loading, export, and import
 */

class ProjectManager {
    constructor(db, ui) {
        this.db = db;
        this.ui = ui;
        this.currentProject = null;
    }

    async createProject(name, type, classes, preprocessingConfig = { enabled: false }) {
        const project = {
            name,
            type, // 'bbox' or 'mask'
            classes,
            preprocessingConfig, // Image preprocessing configuration
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        try {
            const id = await this.db.saveProject(project);
            project.id = id;

            const msg = window.i18n.t('project.created', { name });
            this.ui.showToast(msg, 'success');

            return project;
        } catch (error) {
            console.error('Error creating project:', error);
            this.ui.showToast(window.i18n.t('notifications.error.createProject'), 'error');
            throw error;
        }
    }

    async loadProject(id) {
        try {
            const project = await this.db.getProject(id);
            if (project) {
                this.currentProject = project;

                const msg = window.i18n.t('project.loaded', { name: project.name });
                this.ui.showToast(msg, 'success');

                return project;
            }
        } catch (error) {
            console.error('Error loading project:', error);
            this.ui.showToast(window.i18n.t('notifications.error.loadProject'), 'error');
            throw error;
        }
    }

    async updateProject(updates) {
        if (!this.currentProject) return;

        try {
            this.currentProject = {
                ...this.currentProject,
                ...updates,
                updatedAt: Date.now()
            };
            await this.db.saveProject(this.currentProject);
        } catch (error) {
            console.error('Error updating project:', error);
            this.ui.showToast(window.i18n.t('notifications.error.updateProject'), 'error');
            throw error;
        }
    }

    async deleteProject(id) {
        try {
            await this.db.deleteProjectImages(id);
            await this.db.deleteProject(id);
            this.ui.showToast(window.i18n.t('project.deleted'), 'success');
        } catch (error) {
            console.error('Error deleting project:', error);
            this.ui.showToast(window.i18n.t('notifications.error.deleteProject'), 'error');
            throw error;
        }
    }

    async duplicateProject(id) {
        try {
            const sourceProject = await this.db.getProject(id);
            if (!sourceProject) {
                throw new Error('Project not found');
            }

            // Create new project with copied data
            const newProject = {
                name: `${sourceProject.name} (copia)`,
                type: sourceProject.type,
                classes: [...sourceProject.classes],
                preprocessingConfig: { ...sourceProject.preprocessingConfig },
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            const newProjectId = await this.db.saveProject(newProject);
            newProject.id = newProjectId;

            // Copy all images and annotations
            const sourceImages = await this.db.getProjectImages(id);

            for (const sourceImage of sourceImages) {
                const newImage = {
                    projectId: newProjectId,
                    name: sourceImage.name,
                    originalFileName: sourceImage.originalFileName,
                    displayName: sourceImage.displayName,
                    mimeType: sourceImage.mimeType,
                    image: sourceImage.image,
                    annotations: [...(sourceImage.annotations || [])],
                    classification: sourceImage.classification,
                    width: sourceImage.width,
                    height: sourceImage.height,
                    timestamp: Date.now()
                };

                await this.db.saveImage(newImage);
            }

            this.ui.showToast(window.i18n.t('project.duplicated', { name: newProject.name }), 'success');
            return newProject;
        } catch (error) {
            console.error('Error duplicating project:', error);
            this.ui.showToast(window.i18n.t('notifications.error.duplicateProject'), 'error');
            throw error;
        }
    }

    async renameProject(id, newName) {
        try {
            const project = await this.db.getProject(id);
            if (!project) {
                throw new Error('Project not found');
            }

            project.name = newName;
            project.updatedAt = Date.now();
            await this.db.saveProject(project);

            if (this.currentProject && this.currentProject.id === id) {
                this.currentProject.name = newName;
            }

            this.ui.showToast(window.i18n.t('project.renamed'), 'success');
            return project;
        } catch (error) {
            console.error('Error renaming project:', error);
            this.ui.showToast(window.i18n.t('notifications.error.renameProject'), 'error');
            throw error;
        }
    }

    async getProjectInfo(id) {
        try {
            const project = await this.db.getProject(id);
            if (!project) return null;

            const images = await this.db.getProjectImages(id);
            const annotatedImages = images.filter(img => img.annotations && img.annotations.length > 0);

            let totalAnnotations = 0;
            images.forEach(img => {
                if (img.annotations) {
                    totalAnnotations += img.annotations.length;
                }
            });

            return {
                ...project,
                imageCount: images.length,
                annotatedImageCount: annotatedImages.length,
                totalAnnotations: totalAnnotations,
                createdDate: new Date(project.createdAt).toLocaleDateString(),
                updatedDate: new Date(project.updatedAt).toLocaleDateString()
            };
        } catch (error) {
            console.error('Error getting project info:', error);
            return null;
        }
    }

    async exportProject() {
        if (!this.currentProject) {
            this.ui.showToast(window.i18n.t('project.selectFirst'), 'warning');
            return;
        }

        try {
            const images = await this.db.getProjectImages(this.currentProject.id);

            const exportData = {
                project: this.currentProject,
                images: images.map(img => ({
                    ...img,
                    image: null // We'll handle blob separately
                })),
                version: '1.0'
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            this.downloadFile(blob, `${this.currentProject.name}.tix`);

            this.ui.showToast(window.i18n.t('project.exported'), 'success');
        } catch (error) {
            console.error('Error exporting project:', error);
            this.ui.showToast(window.i18n.t('notifications.error.exportProject'), 'error');
            throw error;
        }
    }

    async exportConfig() {
        if (!this.currentProject) {
            this.ui.showToast(window.i18n.t('project.selectFirst'), 'warning');
            return;
        }

        try {
            const config = {
                name: this.currentProject.name,
                type: this.currentProject.type,
                classes: this.currentProject.classes,
                version: '1.0'
            };

            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            this.downloadFile(blob, `${this.currentProject.name}.tixconfig`);

            this.ui.showToast(window.i18n.t('project.configExported'), 'success');
        } catch (error) {
            console.error('Error exporting config:', error);
            this.ui.showToast(window.i18n.t('notifications.error.exportConfig'), 'error');
        }
    }

    async importConfig(file) {
        try {
            const text = await file.text();
            const config = JSON.parse(text);
            return config;
        } catch (error) {
            console.error('Error importing config:', error);
            this.ui.showToast(window.i18n.t('notifications.error.importConfig'), 'error');
            throw error;
        }
    }

    async importProject(file) {
        try {
            const text = await file.text();
            const importData = JSON.parse(text);

            // Validate project data
            if (!importData.project || !importData.images) {
                throw new Error('Invalid project file format');
            }

            // Check if project name already exists
            const existingProjects = await this.db.getAllProjects();
            let projectName = importData.project.name;
            let counter = 1;

            while (existingProjects.some(p => p.name === projectName)) {
                projectName = `${importData.project.name} (${counter})`;
                counter++;
            }

            // Create new project
            const newProject = {
                name: projectName,
                type: importData.project.type,
                classes: importData.project.classes,
                preprocessingConfig: importData.project.preprocessingConfig || { enabled: false },
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            const projectId = await this.db.saveProject(newProject);
            newProject.id = projectId;

            // Import images if any
            if (importData.images && importData.images.length > 0) {
                for (const imageData of importData.images) {
                    // Note: Imported project files don't include actual image blobs
                    // Only annotations metadata is preserved
                    const newImage = {
                        projectId: projectId,
                        name: imageData.name,
                        originalFileName: imageData.originalFileName,
                        displayName: imageData.displayName,
                        mimeType: imageData.mimeType,
                        annotations: imageData.annotations || [],
                        classification: imageData.classification,
                        width: imageData.width,
                        height: imageData.height,
                        timestamp: Date.now()
                    };

                    // Skip images without actual image data
                    if (!imageData.image) {
                        console.warn(`Skipping image ${imageData.name} - no image data`);
                        continue;
                    }

                    await this.db.saveImage(newImage);
                }
            }

            this.ui.showToast(window.i18n.t('project.imported', { name: projectName }), 'success');
            return newProject;
        } catch (error) {
            console.error('Error importing project:', error);
            this.ui.showToast(window.i18n.t('notifications.error.importProject'), 'error');
            throw error;
        }
    }

    downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}