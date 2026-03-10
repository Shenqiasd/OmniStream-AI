const fs = require('fs');
const path = require('path');

class AIServicesLoader {
  constructor() {
    this.configPath = path.join(__dirname, 'ai-services.json');
    this.config = null;
    this.watcher = null;
    this.load();
  }

  load() {
    const raw = fs.readFileSync(this.configPath, 'utf8');
    const parsed = JSON.parse(raw);
    this.config = this.resolveEnvVars(parsed);
  }

  resolveEnvVars(obj) {
    if (typeof obj === 'string') {
      return obj.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] || '');
    }
    if (Array.isArray(obj)) return obj.map(item => this.resolveEnvVars(item));
    if (obj && typeof obj === 'object') {
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, this.resolveEnvVars(v)])
      );
    }
    return obj;
  }

  enableHotReload() {
    if (this.watcher) return;
    this.watcher = fs.watch(this.configPath, () => {
      try {
        this.load();
      } catch (err) {
        console.error('Failed to reload ai-services.json:', err);
      }
    });
  }

  getServices() {
    return this.config?.services || {};
  }

  getService(name) {
    return this.config?.services?.[name];
  }

  close() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

module.exports = new AIServicesLoader();
