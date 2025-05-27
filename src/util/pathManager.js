const { app } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Path manager to handle file paths consistently across development and production
 */
class PathManager {
    constructor() {
        this.isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        this.userDataPath = app.getPath('userData');
        this.appPath = app.getAppPath();
        this.initialize();
    }

    /**
     * Initialize required directories
     */
    initialize() {
        try {
            // Ensure user data directories exist
            const requiredDirs = [
                this.getDataDir(),
                this.getContextDir(),
                this.getChatDir(),
                this.getTokenUsageDir(),
                this.getMediaDir()
            ];

            requiredDirs.forEach(dir => {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                    console.log(`[PathManager] Created directory: ${dir}`);
                }
            });

            // Copy default config files if they don't exist in user data
            this.ensureUserConfig();
        } catch (error) {
            console.error('[PathManager] Error during initialization:', error);
            throw error;
        }
    }

    /**
     * Get the main data directory
     * In development: ./data
     * In production: userData/data
     */
    getDataDir() {
        if (this.isDev) {
            return path.join(process.cwd(), 'data');
        } else {
            return path.join(this.userDataPath, 'data');
        }
    }

    /**
     * Get the context files directory
     */
    getContextDir() {
        return path.join(this.getDataDir(), 'context');
    }

    /**
     * Get the chats directory
     */
    getChatDir() {
        return path.join(this.getDataDir(), 'chats');
    }

    /**
     * Get the token usage directory
     */
    getTokenUsageDir() {
        return path.join(this.getDataDir(), 'token_usage');
    }

    /**
     * Get the prompts directory
     */
    getPromptsDir() {
        if (this.isDev) {
            return path.join(process.cwd(), 'src', 'prompt');
        } else {
            return path.join(this.userDataPath, 'prompts');
        }
    }

    /**
     * Get the config file path
     */
    getConfigPath() {
        if (this.isDev) {
            return path.join(process.cwd(), 'config.json');
        } else {
            return path.join(this.userDataPath, 'config.json');
        }
    }

    /**
     * Get the .env file path
     */
    getEnvPath() {
        if (this.isDev) {
            return path.join(process.cwd(), '.env');
        } else {
            return path.join(this.userDataPath, '.env');
        }
    }

    /**
     * Get timers file path
     */
    getTimersPath() {
        return path.join(this.getDataDir(), 'timers.json');
    }

    /**
     * Get alarms file path
     */
    getAlarmsPath() {
        return path.join(this.getDataDir(), 'alarms.json');
    }

    /**
     * Get events file path
     */
    getEventsPath() {
        return path.join(this.getDataDir(), 'events.json');
    }

    /**
     * Get finished events file path
     */
    getFinishedEventsPath() {
        return path.join(this.getDataDir(), 'finishedEvents.json');
    }

    /**
     * Get notes file path
     */
    getNotesPath() {
        return path.join(this.getDataDir(), 'notes.txt');
    }

    /**
     * Get archived notes file path
     */
    getArchivedNotesPath() {
        return path.join(this.getDataDir(), 'archivedNotes.json');
    }

    /**
     * Get monthly credits file path
     */
    getMonthlyCreditsPath() {
        return path.join(this.getDataDir(), 'monthlyCredits.json');
    }

    /**
     * Get the media directory (for icons and other media files)
     * In development: ./src/renderer/media
     * In production: userData/media
     */
    getMediaDir() {
        if (this.isDev) {
            return path.join(process.cwd(), 'src', 'renderer', 'media');
        } else {
            return path.join(this.userDataPath, 'media');
        }
    }

    /**
     * Ensure user config files exist (copy from app resources if needed)
     */
    ensureUserConfig() {
        try {
            const userConfigPath = this.getConfigPath();
            
            // If config doesn't exist in user data, copy from app resources
            if (!fs.existsSync(userConfigPath)) {
                let sourceConfigPath;
                
                if (this.isDev) {
                    sourceConfigPath = path.join(process.cwd(), 'config.json');
                } else {
                    // In production, config should be bundled with the app
                    sourceConfigPath = path.join(this.appPath, 'config.json');
                }

                if (fs.existsSync(sourceConfigPath)) {
                    fs.copyFileSync(sourceConfigPath, userConfigPath);
                    console.log(`[PathManager] Copied config from ${sourceConfigPath} to ${userConfigPath}`);
                } else {
                    console.warn(`[PathManager] Source config not found at ${sourceConfigPath}`);
                }
            }

            // Copy prompts directory if needed
            const userPromptsDir = this.getPromptsDir();
            if (!fs.existsSync(userPromptsDir)) {
                let sourcePromptsDir;
                
                if (this.isDev) {
                    sourcePromptsDir = path.join(process.cwd(), 'src', 'prompt');
                } else {
                    sourcePromptsDir = path.join(this.appPath, 'src', 'prompt');
                }

                if (fs.existsSync(sourcePromptsDir)) {
                    this.copyDirectory(sourcePromptsDir, userPromptsDir);
                    console.log(`[PathManager] Copied prompts from ${sourcePromptsDir} to ${userPromptsDir}`);
                }
            }
        } catch (error) {
            console.error('[PathManager] Error ensuring user config:', error);
        }
    }

    /**
     * Copy directory recursively
     */
    copyDirectory(src, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                this.copyDirectory(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    /**
     * Get resource path (for bundled assets in production)
     */
    getResourcePath(relativePath) {
        if (this.isDev) {
            return path.join(process.cwd(), relativePath);
        } else {
            return path.join(this.appPath, relativePath);
        }
    }

    /**
     * Check if running in development mode
     */
    isDevelopment() {
        return this.isDev;
    }

    /**
     * Check if running in production mode
     */
    isProduction() {
        return !this.isDev;
    }
}

// Create singleton instance
const pathManager = new PathManager();

module.exports = pathManager; 