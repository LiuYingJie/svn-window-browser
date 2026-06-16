const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULT_DEBUG_CONFIG = {
  showUpdateTestButton: false
};

function readDebugConfig() {
  try {
    const configPath = path.join(app.getAppPath(), 'DebugConfig.json');
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      ...DEFAULT_DEBUG_CONFIG,
      showUpdateTestButton: parsed.showUpdateTestButton === true
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Could not read debug config:', error);
    }
    return { ...DEFAULT_DEBUG_CONFIG };
  }
}

module.exports = { readDebugConfig };
