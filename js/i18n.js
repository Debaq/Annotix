/**
 * I18N SYSTEM - Internationalization Manager
 * Handles loading and switching between multiple languages
 */

class I18N {
    constructor() {
        this.currentLanguage = 'es'; // Default language
        this.translations = null;
        this.availableLanguages = [
            { code: 'en', name: 'English', flag: '🇬🇧' },
            { code: 'es', name: 'Español', flag: '🇪🇸' },
            { code: 'fr', name: 'Français', flag: '🇫🇷' },
            { code: 'zh', name: '中文', flag: '🇨🇳' },
            { code: 'ja', name: '日本語', flag: '🇯🇵' },
            { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
            { code: 'pt', name: 'Português', flag: '🇵🇹' },
            { code: 'it', name: 'Italiano', flag: '🇮🇹' },
            { code: 'ru', name: 'Русский', flag: '🇷🇺' },
            { code: 'ko', name: '한국어', flag: '🇰🇷' }
        ];

        // Load saved language preference
        const savedLang = localStorage.getItem('annotix_language');
        if (savedLang) {
            this.currentLanguage = savedLang;
        }

        this.isInitialized = false;
    }

    async loadLanguage(langCode) {
        try {
            const response = await fetch(`locales/${langCode}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load language: ${langCode}`);
            }
            this.translations = await response.json();
            this.currentLanguage = langCode;

            // Save preference
            localStorage.setItem('annotix_language', langCode);

            return true;
        } catch (error) {
            console.error('Error loading language:', error);

            // Fallback to Spanish if loading fails
            if (langCode !== 'es') {
                console.log('Falling back to Spanish');
                return await this.loadLanguage('es');
            }

            return false;
        }
    }

    // Get translation by key path (e.g., "app.title")
    t(keyPath, params = {}) {
        if (!this.translations) {
            return keyPath;
        }

        const keys = keyPath.split('.');
        let value = this.translations;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                console.warn(`Translation key not found: ${keyPath}`);
                return keyPath;
            }
        }

        // Replace parameters in translation string
        if (typeof value === 'string' && Object.keys(params).length > 0) {
            return value.replace(/\{(\w+)\}/g, (match, key) => {
                return params[key] !== undefined ? params[key] : match;
            });
        }

        return value;
    }

    // Update all text elements in the DOM with translations
    updateDOM() {
        if (!this.translations) return;

        // Update elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.t(key);

            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                if (element.placeholder !== undefined) {
                    element.placeholder = translation;
                }
            } else {
                element.textContent = translation;
            }
        });

        // Update elements with data-i18n-title attribute (for tooltips)
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const translation = this.t(key);
            // Don't set title attribute to avoid native tooltip conflict with Tippy
            element.setAttribute('aria-label', translation);
        });

        // Update elements with data-i18n-html attribute (allows HTML)
        document.querySelectorAll('[data-i18n-html]').forEach(element => {
            const key = element.getAttribute('data-i18n-html');
            element.innerHTML = this.t(key);
        });
    }

    // Create language selector dropdown
    createLanguageSelector() {
        const container = document.createElement('div');
        container.className = 'language-selector-container';
        container.style.cssText = 'position: relative; display: inline-block;';

        const currentLang = this.availableLanguages.find(l => l.code === this.currentLanguage);

        const button = document.createElement('button');
        button.className = 'btn-header language-selector-btn';
        button.innerHTML = `<span class="flag" style="font-size: 1.4em;">${currentLang.flag}</span>`;
        button.style.cssText = 'min-width: auto; padding: 8px 12px;';
        button.title = currentLang.name;

        const dropdown = document.createElement('div');
        dropdown.className = 'language-dropdown';
        dropdown.style.cssText = `
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
            padding: 16px;
            display: none;
            z-index: 10000;
            border: 2px solid rgba(255, 255, 255, 0.3);
        `;

        // Create grid container
        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
        `;

        this.availableLanguages.forEach(lang => {
            const item = document.createElement('button');
            item.className = 'language-flag-btn';
            item.style.cssText = `
                padding: 12px;
                cursor: pointer;
                font-size: 2em;
                background: ${lang.code === this.currentLanguage ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.2)'};
                border: 2px solid ${lang.code === this.currentLanguage ? 'white' : 'transparent'};
                border-radius: 8px;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                aspect-ratio: 1;
                box-shadow: ${lang.code === this.currentLanguage ? '0 4px 12px rgba(0, 0, 0, 0.2)' : 'none'};
            `;

            item.title = lang.name;
            item.innerHTML = lang.flag;

            item.onmouseover = () => {
                if (lang.code !== this.currentLanguage) {
                    item.style.background = 'rgba(255, 255, 255, 0.4)';
                    item.style.transform = 'scale(1.1)';
                }
            };

            item.onmouseout = () => {
                if (lang.code !== this.currentLanguage) {
                    item.style.background = 'rgba(255, 255, 255, 0.2)';
                    item.style.transform = 'scale(1)';
                }
            };

            item.onclick = async (e) => {
                e.stopPropagation();
                dropdown.style.display = 'none';
                if (lang.code !== this.currentLanguage) {
                    await this.changeLanguage(lang.code);
                }
            };

            grid.appendChild(item);
        });

        dropdown.appendChild(grid);

        button.onclick = (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        };

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        container.appendChild(button);
        container.appendChild(dropdown);

        return container;
    }

    async changeLanguage(langCode) {
        const success = await this.loadLanguage(langCode);
        if (success) {
            this.updateDOM();

            // Update language selector button (only flag)
            const currentLang = this.availableLanguages.find(l => l.code === langCode);
            const selectorBtn = document.querySelector('.language-selector-btn');
            if (selectorBtn && currentLang) {
                selectorBtn.innerHTML = `<span class="flag" style="font-size: 1.4em;">${currentLang.flag}</span>`;
                selectorBtn.title = currentLang.name;
            }

            // Refresh highlights in dropdown grid
            document.querySelectorAll('.language-flag-btn').forEach((item, index) => {
                const lang = this.availableLanguages[index];
                if (lang && lang.code === langCode) {
                    item.style.background = 'rgba(255, 255, 255, 0.9)';
                    item.style.border = '2px solid white';
                    item.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                } else {
                    item.style.background = 'rgba(255, 255, 255, 0.2)';
                    item.style.border = '2px solid transparent';
                    item.style.boxShadow = 'none';
                }
            });

            // Trigger custom event for language change
            window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: langCode } }));

            // Show toast notification if app is loaded
            if (window.app && window.app.ui) {
                window.app.ui.showToast(this.t('notifications.appStarted'), 'success', 2000);
            }
        }
    }

    async init() {
        await this.loadLanguage(this.currentLanguage);
        this.updateDOM();
        this.isInitialized = true;
    }
}

// Create global instance
window.i18n = new I18N();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.i18n.init();
    });
} else {
    window.i18n.init();
}
