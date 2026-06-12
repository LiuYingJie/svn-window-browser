const state = {
  repositories: [],
  repositoryQuery: '',
  savedAccounts: [],
  activeRepositoryId: null,
  currentPath: '',
  searchQuery: '',
  searchMode: false,
  viewMode: 'list',
  entries: [],
  selectedNames: new Set(),
  selectionAnchor: null,
  loading: false,
  contextEntry: null,
  backgroundTasks: new Map()
};

let marqueeSelection = null;
let suppressFileListClick = false;

const elements = {
  repositoryList: document.querySelector('#repository-list'),
  repositorySearchInput: document.querySelector('#repository-search-input'),
  addRepository: document.querySelector('#add-repository'),
  emptyAdd: document.querySelector('#empty-add-button'),
  emptyState: document.querySelector('#empty-state'),
  browserView: document.querySelector('#browser-view'),
  iconsView: document.querySelector('#icons-view-button'),
  listView: document.querySelector('#list-view-button'),
  fileList: document.querySelector('#file-list'),
  loading: document.querySelector('#loading'),
  loadingMessage: document.querySelector('#loading-message'),
  pageTitle: document.querySelector('#page-title'),
  breadcrumbs: document.querySelector('#breadcrumbs'),
  back: document.querySelector('#back-button'),
  refresh: document.querySelector('#refresh-button'),
  copySelected: document.querySelector('#copy-selected-button'),
  exportCurrent: document.querySelector('#export-current-button'),
  selectionStatus: document.querySelector('#selection-status'),
  itemCount: document.querySelector('#item-count'),
  searchForm: document.querySelector('#search-form'),
  searchInput: document.querySelector('#search-input'),
  clearSearch: document.querySelector('#clear-search-button'),
  repositoryDialog: document.querySelector('#repository-dialog'),
  repositoryForm: document.querySelector('#repository-form'),
  repositoryDialogTitle: document.querySelector('#repository-dialog-title'),
  repositoryLocalDirectory: document.querySelector('#repository-local-directory'),
  chooseLocalDirectory: document.querySelector('#choose-local-directory-button'),
  clearLocalResources: document.querySelector('#clear-local-resources-button'),
  deleteRepository: document.querySelector('#delete-repository-button'),
  credentialMode: document.querySelector('#credential-mode'),
  savedAccountField: document.querySelector('#saved-account-field'),
  savedAccount: document.querySelector('#saved-account'),
  manualAccountFields: document.querySelector('#manual-account-fields'),
  settingsButton: document.querySelector('#settings-button'),
  settingsDialog: document.querySelector('#settings-dialog'),
  cacheButton: document.querySelector('#cache-button'),
  cacheDialog: document.querySelector('#cache-dialog'),
  cacheSize: document.querySelector('#cache-size'),
  cacheFileCount: document.querySelector('#cache-file-count'),
  cacheBatchCount: document.querySelector('#cache-batch-count'),
  clearCache: document.querySelector('#clear-cache-button'),
  clientStatus: document.querySelector('#client-status'),
  svnPath: document.querySelector('#svn-path'),
  detectSvn: document.querySelector('#detect-svn-button'),
  chooseSvn: document.querySelector('#choose-svn-button'),
  downloadSvn: document.querySelector('#download-svn-button'),
  contextMenu: document.querySelector('#resource-context-menu'),
  applyToLocal: document.querySelector('#apply-to-local-button'),
  backgroundTasks: document.querySelector('#background-tasks'),
  backgroundTaskCount: document.querySelector('#background-task-count'),
  backgroundTaskList: document.querySelector('#background-task-list'),
  toast: document.querySelector('#toast')
};

function activeRepository() {
  return state.repositories.find((repository) => repository.id === state.activeRepositoryId);
}

function joinPath(base, name) {
  return [base, name].filter(Boolean).join('/');
}

function showToast(message, type = 'success') {
  elements.toast.textContent = message;
  elements.toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => elements.toast.classList.add('hidden'), 4200);
}

function errorMessage(error) {
  return error?.message || String(error);
}

function progressMessage(message) {
  return String(message || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) || '';
}

function renderBackgroundTasks() {
  const tasks = [...state.backgroundTasks.values()]
    .sort((left, right) => right.startedAt - left.startedAt);
  elements.backgroundTasks.classList.toggle('hidden', tasks.length === 0);
  elements.backgroundTaskCount.textContent = tasks.length ? `${tasks.length} 项` : '';
  elements.backgroundTaskList.replaceChildren();

  for (const task of tasks) {
    const item = document.createElement('div');
    item.className = `background-task ${task.status}`;

    const title = document.createElement('div');
    title.className = 'background-task-title';
    title.textContent = task.name;
    title.title = task.path;

    const status = document.createElement('div');
    status.className = 'background-task-status';
    status.textContent = task.message;
    status.title = task.message;

    const progress = document.createElement('div');
    progress.className = 'background-task-progress';
    item.append(title, status, progress);

    if (task.status !== 'running') {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'background-task-close';
      close.textContent = '×';
      close.title = '关闭任务';
      close.addEventListener('click', () => {
        state.backgroundTasks.delete(task.id);
        renderBackgroundTasks();
      });
      item.append(close);
    }
    elements.backgroundTaskList.append(item);
  }
}

function updateBackgroundTask(taskId, changes) {
  const task = state.backgroundTasks.get(taskId);
  if (!task) return;
  Object.assign(task, changes);
  renderBackgroundTasks();
}

function isEditableTarget(target) {
  return target instanceof Element
    && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function hideContextMenu() {
  state.contextEntry = null;
  elements.contextMenu.classList.add('hidden');
}

function showContextMenu(event, entry) {
  event.preventDefault();
  state.contextEntry = entry;
  elements.applyToLocal.textContent = `应用${entry.kind === 'dir' ? '文件夹' : '文件'}到本地目录`;
  elements.contextMenu.classList.remove('hidden');
  const rect = elements.contextMenu.getBoundingClientRect();
  const left = Math.min(event.clientX, window.innerWidth - rect.width - 8);
  const top = Math.min(event.clientY, window.innerHeight - rect.height - 8);
  elements.contextMenu.style.left = `${Math.max(8, left)}px`;
  elements.contextMenu.style.top = `${Math.max(8, top)}px`;
}

function applyViewMode(viewMode) {
  state.viewMode = viewMode === 'icons' ? 'icons' : 'list';
  elements.browserView.classList.toggle('icons', state.viewMode === 'icons');
  elements.iconsView.classList.toggle('active', state.viewMode === 'icons');
  elements.listView.classList.toggle('active', state.viewMode === 'list');
}

async function setViewMode(viewMode) {
  applyViewMode(viewMode);
  try {
    await window.svnBrowser.settings.setViewMode(viewMode);
  } catch (error) {
    showToast(errorMessage(error), 'error');
  }
}

function renderRepositories() {
  elements.repositoryList.replaceChildren();
  const query = state.repositoryQuery.trim().toLocaleLowerCase('zh-CN');
  const repositories = query
    ? state.repositories.filter((repository) => [
      repository.name,
      repository.url,
      repository.localDirectory
    ].some((value) => value?.toLocaleLowerCase('zh-CN').includes(query)))
    : state.repositories;

  if (repositories.length === 0 && state.repositories.length > 0) {
    const message = document.createElement('div');
    message.className = 'repository-empty';
    message.textContent = `没有找到包含“${state.repositoryQuery.trim()}”的仓库`;
    elements.repositoryList.append(message);
    return;
  }

  for (const repository of repositories) {
    const item = document.createElement('div');
    item.className = `repository-item ${repository.id === state.activeRepositoryId ? 'active' : ''}`;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');

    const icon = document.createElement('span');
    icon.className = 'repository-icon';
    icon.textContent = repository.name.slice(0, 2).toUpperCase();

    const info = document.createElement('span');
    info.className = 'repository-info';
    const name = document.createElement('strong');
    name.textContent = repository.name;
    const url = document.createElement('span');
    url.textContent = repository.url;
    info.append(name, url);

    const menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'repository-menu';
    menu.title = '编辑仓库';
    menu.textContent = '•••';
    menu.addEventListener('click', (event) => {
      event.stopPropagation();
      openRepositoryDialog(repository);
    });

    item.append(icon, info, menu);
    item.addEventListener('click', () => selectRepository(repository.id));
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') selectRepository(repository.id);
    });
    elements.repositoryList.append(item);
  }
}

function renderBreadcrumbs() {
  elements.breadcrumbs.replaceChildren();
  const repository = activeRepository();
  if (!repository) return;
  if (state.searchMode) {
    const root = document.createElement('button');
    root.type = 'button';
    root.className = 'breadcrumb';
    root.textContent = repository.name;
    root.addEventListener('click', clearSearch);
    const separator = document.createElement('span');
    separator.className = 'breadcrumb-separator';
    separator.textContent = '/';
    const label = document.createElement('span');
    label.textContent = `搜索：“${state.searchQuery}”`;
    elements.breadcrumbs.append(root, separator, label);
    return;
  }

  const segments = state.currentPath.split('/').filter(Boolean);
  const parts = [{ label: repository.name, path: '' }];
  let accumulated = '';
  for (const segment of segments) {
    accumulated = joinPath(accumulated, segment);
    parts.push({ label: segment, path: accumulated });
  }

  parts.forEach((part, index) => {
    if (index > 0) {
      const separator = document.createElement('span');
      separator.className = 'breadcrumb-separator';
      separator.textContent = '/';
      elements.breadcrumbs.append(separator);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'breadcrumb';
    button.textContent = part.label;
    button.addEventListener('click', () => loadDirectory(part.path));
    elements.breadcrumbs.append(button);
  });
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function createExplorerIcon(entry) {
  const icon = document.createElement('span');
  icon.className = 'explorer-icon';
  if (entry.kind === 'dir') {
    icon.innerHTML = `
      <svg viewBox="0 0 40 36" aria-hidden="true">
        <path d="M3 8.5c0-2 1.6-3.5 3.5-3.5h9l3.2 4H34c1.7 0 3 1.3 3 3v2H3V8.5Z" fill="#e9a928"/>
        <path d="M3 12h34v17.5c0 2-1.6 3.5-3.5 3.5h-27C4.6 33 3 31.4 3 29.5V12Z" fill="#f7c948"/>
        <path d="M5 14h30l-2.2 15H6.7L5 14Z" fill="#ffd86a"/>
      </svg>`;
    return icon;
  }

  icon.innerHTML = `
    <svg viewBox="0 0 36 40" aria-hidden="true">
      <path d="M7 2h14l8 8v25c0 1.7-1.3 3-3 3H7c-1.7 0-3-1.3-3-3V5c0-1.7 1.3-3 3-3Z" fill="#fff" stroke="#aeb9ca"/>
      <path d="M21 2v8h8" fill="#e8edf5" stroke="#aeb9ca"/>
      <path d="M9 17h15M9 22h15M9 27h11" stroke="#c0c9d6" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`;
  const extension = entry.name.includes('.') ? entry.name.split('.').pop().slice(0, 5) : 'FILE';
  const badge = document.createElement('span');
  badge.className = 'file-extension';
  badge.textContent = extension;
  icon.append(badge);
  return icon;
}

function updateSelectionStatus() {
  const count = state.selectedNames.size;
  elements.copySelected.disabled = state.loading || count === 0;
  elements.selectionStatus.classList.toggle('hidden', count === 0);
  elements.selectionStatus.textContent = count > 0 ? `已选择 ${count} 项` : '';
  elements.itemCount.textContent = count > 0
    ? `${state.entries.length} 个项目，已选择 ${count} 项`
    : `${state.entries.length} 个项目`;
}

function syncSelectedRows() {
  elements.fileList.querySelectorAll('.file-row').forEach((row) => {
    row.classList.toggle('selected', state.selectedNames.has(row.dataset.path));
  });
  updateSelectionStatus();
}

function rectanglesIntersect(left, right) {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

function updateMarqueeSelection(event) {
  if (!marqueeSelection) return;
  const listRect = elements.fileList.getBoundingClientRect();
  const left = Math.min(marqueeSelection.startX, event.clientX);
  const top = Math.min(marqueeSelection.startY, event.clientY);
  const right = Math.max(marqueeSelection.startX, event.clientX);
  const bottom = Math.max(marqueeSelection.startY, event.clientY);
  const width = right - left;
  const height = bottom - top;

  if (width > 3 || height > 3) {
    marqueeSelection.dragged = true;
  }
  marqueeSelection.element.style.left = `${left - listRect.left}px`;
  marqueeSelection.element.style.top = `${top - listRect.top}px`;
  marqueeSelection.element.style.width = `${width}px`;
  marqueeSelection.element.style.height = `${height}px`;

  const selectionRect = { left, top, right, bottom };
  state.selectedNames = new Set(marqueeSelection.baseSelection);
  elements.fileList.querySelectorAll('.file-row').forEach((row) => {
    if (rectanglesIntersect(selectionRect, row.getBoundingClientRect())) {
      state.selectedNames.add(row.dataset.path);
    }
  });
  syncSelectedRows();
}

function finishMarqueeSelection() {
  if (!marqueeSelection) return;
  suppressFileListClick = marqueeSelection.dragged;
  if (suppressFileListClick) {
    setTimeout(() => { suppressFileListClick = false; }, 0);
  }
  marqueeSelection.element.remove();
  marqueeSelection = null;
  const firstSelectedIndex = state.entries.findIndex((entry) => state.selectedNames.has(entry.path));
  state.selectionAnchor = firstSelectedIndex >= 0 ? firstSelectedIndex : null;
  document.removeEventListener('pointermove', updateMarqueeSelection);
  document.removeEventListener('pointerup', finishMarqueeSelection);
  document.removeEventListener('pointercancel', finishMarqueeSelection);
}

function startMarqueeSelection(event) {
  if (
    state.viewMode !== 'icons'
    || state.loading
    || event.button !== 0
    || event.target.closest('.file-row')
  ) {
    return;
  }

  event.preventDefault();
  const element = document.createElement('div');
  element.className = 'selection-marquee';
  elements.fileList.append(element);
  marqueeSelection = {
    startX: event.clientX,
    startY: event.clientY,
    baseSelection: event.ctrlKey ? new Set(state.selectedNames) : new Set(),
    dragged: false,
    element
  };
  if (!event.ctrlKey) {
    state.selectedNames.clear();
    syncSelectedRows();
  }
  updateMarqueeSelection(event);
  document.addEventListener('pointermove', updateMarqueeSelection);
  document.addEventListener('pointerup', finishMarqueeSelection);
  document.addEventListener('pointercancel', finishMarqueeSelection);
}

function selectEntry(index, event) {
  const entry = state.entries[index];
  if (!entry) return;

  if (event.shiftKey && state.selectionAnchor !== null) {
    if (!event.ctrlKey) state.selectedNames.clear();
    const start = Math.min(state.selectionAnchor, index);
    const end = Math.max(state.selectionAnchor, index);
    for (let current = start; current <= end; current += 1) {
      state.selectedNames.add(state.entries[current].path);
    }
  } else if (event.ctrlKey) {
    if (state.selectedNames.has(entry.path)) {
      state.selectedNames.delete(entry.path);
    } else {
      state.selectedNames.add(entry.path);
    }
    state.selectionAnchor = index;
  } else {
    state.selectedNames.clear();
    state.selectedNames.add(entry.path);
    state.selectionAnchor = index;
  }
  renderEntries(state.entries);
}

function renderEntries(entries) {
  elements.fileList.replaceChildren();
  elements.itemCount.textContent = `${entries.length} 个项目`;
  if (!entries.length) {
    const message = document.createElement('div');
    message.className = 'list-message';
    message.textContent = '此目录为空';
    elements.fileList.append(message);
    updateSelectionStatus();
    return;
  }

  entries.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = `file-row ${state.selectedNames.has(entry.path) ? 'selected' : ''}`;
    row.tabIndex = 0;
    row.dataset.path = entry.path;
    row.addEventListener('click', (event) => selectEntry(index, event));
    row.addEventListener('contextmenu', (event) => {
      if (!state.selectedNames.has(entry.path)) {
        state.selectedNames.clear();
        state.selectedNames.add(entry.path);
        state.selectionAnchor = index;
        renderEntries(state.entries);
      }
      showContextMenu(event, entry);
    });
    row.addEventListener('dblclick', () => {
      if (entry.kind === 'dir') loadDirectory(entry.path);
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && entry.kind === 'dir') {
        loadDirectory(entry.path);
      }
    });
    const nameCell = document.createElement('div');
    nameCell.className = 'file-name';
    const nameText = document.createElement('span');
    nameText.className = 'file-name-text';
    const nameLabel = document.createElement('span');
    nameLabel.className = 'file-name-label';
    nameLabel.textContent = entry.name;
    nameText.append(nameLabel);
    if (state.searchMode) {
      const pathLabel = document.createElement('span');
      pathLabel.className = 'file-path-label';
      pathLabel.textContent = entry.path;
      pathLabel.title = entry.path;
      nameText.append(pathLabel);
    }
    nameCell.append(createExplorerIcon(entry), nameText);

    const revision = document.createElement('span');
    revision.className = 'file-meta';
    revision.textContent = entry.revision ? `r${entry.revision}` : '—';
    const author = document.createElement('span');
    author.className = 'file-meta';
    author.textContent = entry.author || '—';
    const date = document.createElement('span');
    date.className = 'file-meta';
    date.textContent = formatDate(entry.date);

    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'row-action';
    exportButton.textContent = '复制到...';
    exportButton.title = `选择目录并复制${entry.kind === 'dir' ? '文件夹' : '文件'}到本地`;
    exportButton.addEventListener('click', (event) => {
      event.stopPropagation();
      exportPath(entry.path);
    });

    row.append(nameCell, revision, author, date, exportButton);
    elements.fileList.append(row);
  });
  updateSelectionStatus();
}

function setLoading(loading, message = '正在读取仓库...') {
  state.loading = loading;
  elements.loadingMessage.textContent = message;
  elements.loading.classList.toggle('hidden', !loading);
  elements.refresh.disabled = loading || !state.activeRepositoryId;
  elements.exportCurrent.disabled = loading || !state.activeRepositoryId;
  elements.back.disabled = loading || !state.activeRepositoryId || (!state.currentPath && !state.searchMode);
  updateSelectionStatus();
}

async function loadDirectory(relativePath) {
  if (!state.activeRepositoryId || state.loading) return;
  setLoading(true);
  try {
    const entries = await window.svnBrowser.svn.list(state.activeRepositoryId, relativePath);
    state.currentPath = relativePath;
    state.searchMode = false;
    state.searchQuery = '';
    elements.searchInput.value = '';
    elements.clearSearch.classList.add('hidden');
    state.entries = entries;
    state.selectedNames.clear();
    state.selectionAnchor = null;
    elements.back.disabled = !relativePath;
    renderBreadcrumbs();
    renderEntries(entries);
  } catch (error) {
    showToast(errorMessage(error), 'error');
    elements.fileList.innerHTML = '<div class="list-message">无法读取此目录，请检查仓库地址、账号和 SVN 客户端设置。</div>';
  } finally {
    setLoading(false);
  }
}

async function selectRepository(id) {
  state.activeRepositoryId = id;
  state.currentPath = '';
  state.entries = [];
  state.selectedNames.clear();
  state.selectionAnchor = null;
  const repository = activeRepository();
  elements.pageTitle.textContent = repository.name;
  elements.emptyState.classList.add('hidden');
  elements.browserView.classList.remove('hidden');
  elements.refresh.disabled = false;
  elements.exportCurrent.disabled = false;
  elements.back.disabled = true;
  renderRepositories();
  renderBreadcrumbs();
  await loadDirectory('');
}

function renderSavedAccounts() {
  elements.savedAccount.replaceChildren();
  for (const account of state.savedAccounts) {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = `${account.username}（来自：${account.sourceName}）`;
    elements.savedAccount.append(option);
  }
}

function updateCredentialFields() {
  const useSaved = elements.credentialMode.value === 'saved' && state.savedAccounts.length > 0;
  elements.savedAccountField.classList.toggle('hidden', !useSaved);
  elements.manualAccountFields.classList.toggle('hidden', useSaved);
}

async function openRepositoryDialog(repository = null) {
  state.savedAccounts = await window.svnBrowser.repositories.accounts();
  renderSavedAccounts();
  elements.repositoryDialogTitle.textContent = repository ? '编辑仓库' : '添加仓库';
  document.querySelector('#repository-id').value = repository?.id || '';
  document.querySelector('#repository-name').value = repository?.name || '';
  document.querySelector('#repository-url').value = repository?.url || '';
  elements.repositoryLocalDirectory.value = repository?.localDirectory || '';
  document.querySelector('#repository-username').value = repository?.username || '';
  document.querySelector('#repository-password').value = '';
  const savedOption = elements.credentialMode.querySelector('option[value="saved"]');
  savedOption.disabled = state.savedAccounts.length === 0;
  elements.credentialMode.value = repository || state.savedAccounts.length === 0 ? 'manual' : 'saved';
  updateCredentialFields();

  elements.clearLocalResources.classList.toggle('hidden', !repository);
  elements.deleteRepository.classList.toggle('hidden', !repository);
  elements.clearLocalResources.onclick = repository ? () => clearLocalResources(repository) : null;
  elements.deleteRepository.onclick = repository ? () => deleteRepository(repository) : null;
  elements.repositoryDialog.showModal();
}

async function saveRepository(event) {
  event.preventDefault();
  const id = document.querySelector('#repository-id').value;
  const payload = {
    id: id || undefined,
    name: document.querySelector('#repository-name').value,
    url: document.querySelector('#repository-url').value,
    localDirectory: elements.repositoryLocalDirectory.value,
    username: document.querySelector('#repository-username').value
  };
  if (elements.credentialMode.value === 'saved') {
    payload.credentialSourceId = elements.savedAccount.value;
  } else {
    const password = document.querySelector('#repository-password').value;
    if (!id || password) payload.password = password;
  }

  try {
    const saved = await window.svnBrowser.repositories.save(payload);
    state.repositories = await window.svnBrowser.repositories.list();
    state.savedAccounts = await window.svnBrowser.repositories.accounts();
    elements.repositoryDialog.close();
    renderRepositories();
    showToast('仓库已保存');
    await selectRepository(saved.id);
  } catch (error) {
    showToast(errorMessage(error), 'error');
  }
}

async function clearLocalResources(repository) {
  try {
    const result = await window.svnBrowser.repositories.clearLocal(repository.id);
    if (!result) return;
    showToast(`已清空本地目录：${result.directory}`);
  } catch (error) {
    showToast(errorMessage(error), 'error');
  }
}

async function deleteRepository(repository) {
  if (!confirm(`确定删除仓库“${repository.name}”吗？`)) return;
  await window.svnBrowser.repositories.delete(repository.id);
  state.repositories = await window.svnBrowser.repositories.list();
  if (state.activeRepositoryId === repository.id) {
    state.activeRepositoryId = null;
    state.currentPath = '';
    elements.pageTitle.textContent = '选择一个仓库';
    elements.breadcrumbs.replaceChildren();
    elements.browserView.classList.add('hidden');
    elements.emptyState.classList.remove('hidden');
    elements.refresh.disabled = true;
    elements.exportCurrent.disabled = true;
  }
  elements.repositoryDialog.close();
  renderRepositories();
  showToast('仓库已删除');
}

async function applyEntryToLocal() {
  const entry = state.contextEntry;
  const repositoryId = state.activeRepositoryId;
  hideContextMenu();
  if (!entry || !repositoryId) return;
  const taskScope = entry.kind === 'file'
    ? entry.path.split('/').slice(0, -1).join('/')
    : entry.path;
  const duplicate = [...state.backgroundTasks.values()].some((task) =>
    task.status === 'running'
    && task.repositoryId === repositoryId
    && (
      task.scope === taskScope
      || task.scope.startsWith(`${taskScope}/`)
      || taskScope.startsWith(`${task.scope}/`)
    )
  );
  if (duplicate) {
    showToast('相同或上级目录已有本地应用任务正在运行');
    return;
  }

  const taskId = crypto.randomUUID();
  state.backgroundTasks.set(taskId, {
    id: taskId,
    repositoryId,
    path: entry.path,
    scope: taskScope,
    name: entry.name,
    status: 'running',
    message: '正在准备后台任务...',
    startedAt: Date.now()
  });
  renderBackgroundTasks();

  try {
    const result = await window.svnBrowser.svn.applyToLocal(
      repositoryId,
      entry.path,
      entry.kind,
      taskId
    );
    updateBackgroundTask(taskId, {
      status: 'done',
      message: `${result.action === 'updated' ? '更新完成' : '检出完成'}：${result.destination}`
    });
    showToast(`${result.action === 'updated' ? '已更新' : '已检出'}到：${result.destination}`);
  } catch (error) {
    updateBackgroundTask(taskId, {
      status: 'failed',
      message: errorMessage(error)
    });
    showToast(errorMessage(error), 'error');
  }
}

async function exportPath(relativePath) {
  if (!state.activeRepositoryId) return;
  try {
    const destination = await window.svnBrowser.svn.export(state.activeRepositoryId, relativePath);
    if (!destination) return;
    showToast(`已复制到：${destination}`);
    await window.svnBrowser.system.showItem(destination);
  } catch (error) {
    showToast(errorMessage(error), 'error');
  }
}

function selectedPaths() {
  return state.entries
    .filter((entry) => state.selectedNames.has(entry.path))
    .map((entry) => entry.path);
}

async function searchRepository(event) {
  event?.preventDefault();
  const keyword = elements.searchInput.value.trim();
  if (!state.activeRepositoryId || !keyword || state.loading) return;
  setLoading(true, `正在搜索“${keyword}”...`);
  try {
    const entries = await window.svnBrowser.svn.search(state.activeRepositoryId, keyword);
    state.searchMode = true;
    state.searchQuery = keyword;
    state.entries = entries;
    state.selectedNames.clear();
    state.selectionAnchor = null;
    elements.clearSearch.classList.remove('hidden');
    elements.back.disabled = false;
    renderBreadcrumbs();
    renderEntries(entries);
    if (entries.length === 0) showToast(`没有找到包含“${keyword}”的文件或文件夹`);
  } catch (error) {
    showToast(errorMessage(error), 'error');
  } finally {
    setLoading(false);
  }
}

function clearSearch() {
  if (!state.searchMode) {
    elements.searchInput.value = '';
    elements.clearSearch.classList.add('hidden');
    return;
  }
  loadDirectory(state.currentPath);
}

async function copySelectionToClipboard() {
  const paths = selectedPaths();
  if (!state.activeRepositoryId || paths.length === 0 || state.loading) return;
  setLoading(true, `正在准备 ${paths.length} 个项目，完成后可在本地文件夹中按 Ctrl+V...`);
  try {
    const result = await window.svnBrowser.svn.copyToClipboard(state.activeRepositoryId, paths);
    showToast(`已复制 ${result.count} 个项目，可到本地文件夹按 Ctrl+V 粘贴`);
  } catch (error) {
    showToast(errorMessage(error), 'error');
  } finally {
    setLoading(false);
  }
}

function goBack() {
  if (state.searchMode) {
    clearSearch();
    return;
  }
  if (!state.currentPath || state.loading) return;
  const parentPath = state.currentPath.split('/').slice(0, -1).join('/');
  loadDirectory(parentPath);
}

async function openSettings() {
  const settings = await window.svnBrowser.settings.get();
  renderClientStatus(settings.client);
  elements.settingsDialog.showModal();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function renderCacheStats(stats) {
  elements.cacheSize.textContent = formatBytes(stats.bytes);
  elements.cacheFileCount.textContent = String(stats.files);
  elements.cacheBatchCount.textContent = String(stats.batches);
  elements.clearCache.disabled = stats.bytes === 0;
}

async function openCache() {
  elements.cacheSize.textContent = '正在统计...';
  elements.cacheFileCount.textContent = '-';
  elements.cacheBatchCount.textContent = '-';
  elements.clearCache.disabled = true;
  elements.cacheDialog.showModal();
  try {
    renderCacheStats(await window.svnBrowser.cache.getStats());
  } catch (error) {
    showToast(errorMessage(error), 'error');
  }
}

async function clearCache() {
  if (!confirm('确定清空全部缓存吗？已复制但尚未粘贴的文件可能无法继续粘贴。')) return;
  elements.clearCache.disabled = true;
  try {
    renderCacheStats(await window.svnBrowser.cache.clear());
    showToast('缓存已清空');
  } catch (error) {
    showToast(errorMessage(error), 'error');
    renderCacheStats(await window.svnBrowser.cache.getStats());
  }
}

function renderClientStatus(client) {
  elements.clientStatus.classList.toggle('ready', client.ready);
  elements.svnPath.textContent = client.svnExecutable || '未检测到 svn.exe';

  if (client.ready) {
    elements.clientStatus.innerHTML = '<strong>可以正常使用</strong>已检测到 SVN 命令行客户端。';
  } else if (client.kind === 'tortoise-only') {
    elements.clientStatus.innerHTML =
      '<strong>已检测到 TortoiseSVN，但缺少命令行客户端</strong>' +
      '这是正常情况：TortoiseSVN 默认不提供 svn.exe。本应用需要额外安装一个 Subversion 命令行客户端。';
  } else {
    elements.clientStatus.innerHTML =
      '<strong>未检测到可用客户端</strong>' +
      '请安装 Windows 版 Subversion 命令行客户端，安装后点击“重新检测”。';
  }
}

async function initialize() {
  const [repositories, settings, savedAccounts] = await Promise.all([
    window.svnBrowser.repositories.list(),
    window.svnBrowser.settings.get(),
    window.svnBrowser.repositories.accounts()
  ]);
  state.repositories = repositories;
  state.savedAccounts = savedAccounts;
  applyViewMode(settings.viewMode);
  renderRepositories();
  if (state.repositories.length > 0) {
    await selectRepository(state.repositories[0].id);
  }
}

elements.addRepository.addEventListener('click', () => openRepositoryDialog());
elements.emptyAdd.addEventListener('click', () => openRepositoryDialog());
elements.repositorySearchInput.addEventListener('input', () => {
  state.repositoryQuery = elements.repositorySearchInput.value;
  renderRepositories();
});
elements.repositoryForm.addEventListener('submit', saveRepository);
elements.searchForm.addEventListener('submit', searchRepository);
elements.clearSearch.addEventListener('click', clearSearch);
elements.credentialMode.addEventListener('change', updateCredentialFields);
elements.chooseLocalDirectory.addEventListener('click', async () => {
  const directory = await window.svnBrowser.repositories.chooseLocalDirectory();
  if (directory) elements.repositoryLocalDirectory.value = directory;
});
elements.iconsView.addEventListener('click', () => setViewMode('icons'));
elements.listView.addEventListener('click', () => setViewMode('list'));
elements.refresh.addEventListener('click', () => loadDirectory(state.currentPath));
elements.back.addEventListener('click', goBack);
elements.copySelected.addEventListener('click', copySelectionToClipboard);
elements.exportCurrent.addEventListener('click', () => exportPath(state.currentPath));
elements.settingsButton.addEventListener('click', openSettings);
elements.cacheButton.addEventListener('click', openCache);
elements.clearCache.addEventListener('click', clearCache);
elements.chooseSvn.addEventListener('click', async () => {
  const client = await window.svnBrowser.settings.chooseSvn();
  if (client) {
    renderClientStatus(client);
    showToast('SVN 客户端路径已保存');
  }
});
elements.detectSvn.addEventListener('click', async () => {
  const client = await window.svnBrowser.settings.detectClient();
  renderClientStatus(client);
  showToast(client.ready ? '已找到 SVN 命令行客户端' : '仍未找到 SVN 命令行客户端', client.ready ? 'success' : 'error');
});
elements.downloadSvn.addEventListener('click', () => window.svnBrowser.settings.openDownload());
elements.applyToLocal.addEventListener('click', applyEntryToLocal);
window.svnBrowser.svn.onApplyProgress((progress) => {
  const message = progressMessage(progress.message);
  if (message) updateBackgroundTask(progress.taskId, { message });
});
document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
elements.fileList.addEventListener('click', (event) => {
  if (suppressFileListClick) {
    suppressFileListClick = false;
    return;
  }
  if (event.target === elements.fileList) {
    state.selectedNames.clear();
    state.selectionAnchor = null;
    renderEntries(state.entries);
  }
});
elements.fileList.addEventListener('pointerdown', startMarqueeSelection);
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('#resource-context-menu')) hideContextMenu();
});
window.addEventListener('blur', hideContextMenu);
window.addEventListener('resize', hideContextMenu);
document.querySelector('.content').addEventListener('scroll', hideContextMenu);
document.addEventListener('keydown', (event) => {
  if (isEditableTarget(event.target)) return;
  if (document.querySelector('dialog[open]') || state.loading) return;
  if (event.ctrlKey && event.key.toLowerCase() === 'c' && state.selectedNames.size > 0) {
    event.preventDefault();
    copySelectionToClipboard();
  } else if (event.ctrlKey && event.key.toLowerCase() === 'a' && state.entries.length > 0) {
    event.preventDefault();
    state.entries.forEach((entry) => state.selectedNames.add(entry.path));
    state.selectionAnchor = 0;
    renderEntries(state.entries);
  } else if (event.key === 'Backspace') {
    event.preventDefault();
    goBack();
  }
});

initialize().catch((error) => showToast(errorMessage(error), 'error'));
