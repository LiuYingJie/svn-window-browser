const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class JsonStore {
  constructor(filePath, passwordCodec = {}) {
    this.filePath = filePath;
    this.encryptPassword = passwordCodec.encrypt || ((value) => value);
    this.decryptPassword = passwordCodec.decrypt || ((value) => value);
    this.data = {
      repositories: [],
      settings: {
        svnExecutable: '',
        viewMode: 'list'
      }
    };
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.data = {
        repositories: Array.isArray(parsed.repositories) ? parsed.repositories : [],
        settings: {
          svnExecutable: parsed.settings?.svnExecutable || '',
          viewMode: parsed.settings?.viewMode === 'icons' ? 'icons' : 'list'
        }
      };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Could not read application data:', error);
      }
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  getRepositories() {
    return this.data.repositories.map(({ password, passwordEncrypted, ...repository }) => repository);
  }

  getRepository(id) {
    const repository = this.data.repositories.find((item) => item.id === id);
    if (!repository) return undefined;
    return {
      ...repository,
      password: repository.passwordEncrypted
        ? this.decryptPassword(repository.passwordEncrypted)
        : repository.password || ''
    };
  }

  getSavedAccounts() {
    const seen = new Set();
    return this.data.repositories
      .filter((repository) => repository.username && (repository.passwordEncrypted || repository.password))
      .filter((repository) => {
        const key = `${repository.username}\0${repository.passwordEncrypted || repository.password}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((repository) => ({
        id: repository.id,
        username: repository.username,
        sourceName: repository.name
      }));
  }

  saveRepository(input) {
    const existingIndex = input.id
      ? this.data.repositories.findIndex((repository) => repository.id === input.id)
      : -1;
    const existing = existingIndex >= 0 ? this.data.repositories[existingIndex] : null;
    const existingPassword = existing?.passwordEncrypted
      ? this.decryptPassword(existing.passwordEncrypted)
      : existing?.password || '';
    const credentialSource = input.credentialSourceId
      ? this.data.repositories.find((repository) => repository.id === input.credentialSourceId)
      : null;
    const sourcePassword = credentialSource?.passwordEncrypted
      ? this.decryptPassword(credentialSource.passwordEncrypted)
      : credentialSource?.password || '';
    const username = credentialSource?.username || input.username?.trim() || '';
    const password = credentialSource
      ? sourcePassword
      : input.password === undefined ? existingPassword : input.password;
    const repository = {
      id: existing?.id || crypto.randomUUID(),
      name: input.name.trim(),
      url: input.url.trim().replace(/\/+$/, ''),
      username,
      passwordEncrypted: password ? this.encryptPassword(password) : '',
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    if (!repository.name || !repository.url) {
      throw new Error('仓库名称和地址不能为空');
    }

    if (existingIndex >= 0) {
      this.data.repositories[existingIndex] = repository;
    } else {
      this.data.repositories.push(repository);
    }
    this.save();
    const { passwordEncrypted, ...safeRepository } = repository;
    return safeRepository;
  }

  deleteRepository(id) {
    const originalLength = this.data.repositories.length;
    this.data.repositories = this.data.repositories.filter((repository) => repository.id !== id);
    if (this.data.repositories.length !== originalLength) {
      this.save();
      return true;
    }
    return false;
  }

  getSettings() {
    return { ...this.data.settings };
  }

  saveSettings(settings) {
    this.data.settings = {
      ...this.data.settings,
      ...settings
    };
    this.save();
    return this.getSettings();
  }
}

module.exports = { JsonStore };
