import { defineStore } from "pinia";
import { ref, reactive, computed, watch } from "vue";
import demoConfig from "../demo/config.json";

export const useAppStore = defineStore("app", () => {
  const workspacePath = ref(null);
  const workspaceName = ref(null);
  const recentWorkspaces = ref(
    JSON.parse(localStorage.getItem("canonic:recentWorkspaces") || "[]"),
  );
  const files = ref([]);
  const currentFile = ref(null);
  const currentContent = ref("");
  const branches = ref([]);
  const currentBranch = ref("main");
  const isExternalRepo = ref(false);
  const commitLog = ref([]);
  const comments = ref([]);
  const isDirty = ref(false);
  const unsavedBuffer = reactive({});
  const fileIsUncommitted = ref(false);
  const isLoading = ref(false);
  // Per-file share state — persists across doc switches
  const sharesByFile = reactive({});    // filePath -> shareInfo object
  const shareStatsByFile = reactive({}); // filePath -> { reads, connected }
  const shareInfo = computed(() => sharesByFile[currentFile.value] || null);
  const shareStats = computed(() => shareStatsByFile[currentFile.value] || { reads: 0, connected: 0 });

  // Workspace-level share (separate from per-doc)
  const WORKSPACE_KEY = '__workspace__';
  const workspaceShareInfo = computed(() => sharesByFile[WORKSPACE_KEY] || null);
  const workspaceShareStats = computed(() => shareStatsByFile[WORKSPACE_KEY] || { reads: 0, connected: 0 });
  const searchResults = ref([]);
  const config = ref(null);
  const sidebarTab = ref("files");
  const rightPanelTab = ref("comments");
  const sidebarCollapsed = ref(
    localStorage.getItem("canonic:sidebarCollapsed") === "true",
  );
  watch(sidebarCollapsed, (val) => {
    localStorage.setItem("canonic:sidebarCollapsed", String(val));
  });
  const rightPanelCollapsed = ref(
    localStorage.getItem("canonic:rightPanelCollapsed") !== "false",
  );
  watch(rightPanelCollapsed, (val) => {
    localStorage.setItem("canonic:rightPanelCollapsed", String(val));
  });
  const showLineNumbers = ref(
    localStorage.getItem("canonic:line-numbers") === "true",
  );
  if (showLineNumbers.value) {
    document.documentElement.setAttribute("data-line-numbers", "true");
  }
  watch(showLineNumbers, (val) => {
    localStorage.setItem("canonic:line-numbers", String(val));
    if (val) {
      document.documentElement.setAttribute("data-line-numbers", "true");
    } else {
      document.documentElement.removeAttribute("data-line-numbers");
    }
  });
  const docVersions = ref([]);
  const docBranchMap = ref({}); // { 'path/to/file.md': { activeBranch: 'branch', branches: ['branch'] } }

  const trashItems = ref([]);

  const isDemoMode = ref(false);
  const demoPeers = ref([]);
  const demoFiles = ref({});
  const _demoComments = ref({});

  const searchViewOpen = ref(false);

  // Workspace find & replace state
  const wsSearch = reactive({
    query: '',
    replace: '',
    include: '',
    exclude: '',
    opts: { case: false, word: false, regex: false },
    allBranches: false,
    results: { branch: [], other: [] },
    searching: false,
    lastError: '',
    pendingFocus: null, // { filePath, line } — UI consumes to scroll editor
  });

  const FIND_HOTKEY_DEFAULTS = {
    findInDoc: 'Mod-f',
    findInWorkspace: 'Mod-Shift-f',
    findNext: 'Mod-g',
    findPrev: 'Mod-Shift-g',
  };

  const findHotkeys = computed(() => {
    const cfgKeys = config.value?.hotkeys || {};
    const merged = {};
    for (const k of Object.keys(FIND_HOTKEY_DEFAULTS)) {
      merged[k] = cfgKeys[k] || FIND_HOTKEY_DEFAULTS[k];
    }
    return merged;
  });

  const agentSession = ref(null);   // null | { sessionId, agentName, file, startedAt }
  const agentActivity = ref(null);  // null | { activityType, label }
  const actionPickerOpen = ref(false);

  // Peer discovery state
  const discoveredPeers = ref([]);
  const persistedPeers = ref([]);
  const favoritedPeerIds = reactive(new Set());
  const favoritedPeers = computed(() => {
    const onlineMap = new Map(discoveredPeers.value.map((p) => [p.id, p]));
    const result = [];
    for (const id of favoritedPeerIds) {
      const online = onlineMap.get(id);
      if (online) {
        result.push(online);
      } else {
        const persisted = persistedPeers.value.find((p) => p.id === id);
        if (persisted) {
          result.push({ ...persisted, online: false });
        } else {
          result.push({ id, name: id.split("@")[0], online: false });
        }
      }
    }
    return result;
  });

  async function refreshDiscoveredPeers() {
    if (isDemoMode.value) return;
    const peers = await api.peers.listDiscovered();
    discoveredPeers.value = peers;
  }
  const peerFileContent = ref(null); // { peer, relPath, content } | null
  const navBack = ref(null); // { path, name } | null — for wiki-link back navigation
  const peerFileComments = ref([]);  // comments visible in sidebar when viewing a peer file
  const activeCommentId = ref(null); // drives bidirectional scroll between sidebar and viewer
  const networkChanged = ref(false);
  const fileIndex = ref({});
  const appVersion = ref(__APP_VERSION__ || "");

  const api = window.canonic;

  const updateAvailable = ref(false);
  const updateDownloading = ref(false);
  const updateReady = ref(false);
  const updateInfo = ref(null);
  const downloadProgress = ref(0);

  if (api?.update) {
    api.update.onAvailable?.((info) => {
      updateInfo.value = info;
      updateAvailable.value = true;
    });
    api.update.onProgress?.((progress) => {
      updateAvailable.value = false;
      updateDownloading.value = true;
      downloadProgress.value = Math.round(progress.percent);
    });
    api.update.onDownloaded?.(() => {
      updateReady.value = true;
      updateDownloading.value = false;
      downloadProgress.value = 0;
    });
    api.update.onError?.((err) => {
      console.error("[update]", err);
      updateDownloading.value = false;
    });
  }

  function downloadUpdate() {
    updateAvailable.value = false;
    updateDownloading.value = true;
    api?.update.download();
  }

  function installUpdate() {
    api?.update.install();
  }

  async function syncActiveShares() {
    if (!api.share?.listActive) return;
    const active = await api.share.listActive();
    for (const s of active) {
      sharesByFile[s.key] = s;
      shareStatsByFile[s.key] = { reads: s.reads, connected: s.connected };
    }
  }

  // Register agent session IPC listeners once
  if (api.agentSession) {
    api.agentSession.onSessionStart((data) => startAgentSession(data))
    api.agentSession.onComment((data) => {
      agentActivity.value = { activityType: 'writing_comment', label: 'Writing comment…' }
      addAgentComment(data)
    })
    api.agentSession.onActivity?.((data) => {
      agentActivity.value = { activityType: data.activityType, label: data.label }
    })
    api.agentSession.onSessionDone(() => { agentSession.value = null; agentActivity.value = null; actionPickerOpen.value = false })
    api.agentSession.onSessionCancel(() => { agentSession.value = null; agentActivity.value = null; actionPickerOpen.value = false })
  }

  // Wire share stats listener once — updates whichever file is being shared
  api.share.onStats((stats) => {
    shareStatsByFile[stats.filePath] = { reads: stats.reads, connected: stats.connected };
  });

  // Wire peer discovery IPC listeners
  if (api.peers.onFound) {
    api.peers.onFound((peer) => {
      const idx = discoveredPeers.value.findIndex((p) => p.id === peer.id);
      if (idx >= 0) discoveredPeers.value[idx] = peer;
      else discoveredPeers.value.push(peer);
    });
    api.peers.onLost(({ id }) => {
      const idx = discoveredPeers.value.findIndex((p) => p.id === id);
      if (idx >= 0) discoveredPeers.value.splice(idx, 1);
    });
  }

  if (api.share.onNetworkChanged) {
    api.share.onNetworkChanged(() => { networkChanged.value = true });
  }

  if (api.files.onIndexUpdate) {
    api.files.onIndexUpdate((idx) => { fileIndex.value = idx });
  }

  if (api.git.onBranchUpdate) {
    api.git.onBranchUpdate(() => {
      refreshBranches();
      if (currentFile.value) {
        checkFileStatus();
        loadCommitLog();
      }
    });
  }

  async function openStandaloneFile(path) {
    if (!path) return;
    isLoading.value = true;
    try {
      // Buffer unsaved changes for the file we're leaving (workspace or previous standalone)
      if (isDirty.value && currentFile.value) {
        unsavedBuffer[currentFile.value] = currentContent.value;
      }

      workspacePath.value = null;
      workspaceName.value = null;
      isExternalRepo.value = false;
      currentBranch.value = "main";
      files.value = [];
      
      await openFile(path);
      return true;
    } catch (err) {
      console.error("[Store] openStandaloneFile failed:", err);
      return false;
    } finally {
      isLoading.value = false;
    }
  }


  // Active branch for the current document (defaults to 'main' if not in map)
  const currentDocBranch = computed(() => {
    if (!currentFile.value) return currentBranch.value;
    return docBranchMap.value[currentFile.value]?.activeBranch || "main";
  });

  function getDocBranches(filePath) {
    return docBranchMap.value[filePath]?.branches || [];
  }

  async function loadDocBranchMap() {
    if (!workspacePath.value) {
      docBranchMap.value = {};
      return;
    }
    docBranchMap.value = await api.docBranches.get(workspacePath.value);
  }

  async function saveDocBranchMap() {
    if (!workspacePath.value) return;
    await api.docBranches.set(workspacePath.value, docBranchMap.value);
  }

  function applyWindowBlurClass(enabled, opacity) {
    const on = enabled !== false;
    document.documentElement.classList.toggle('window-blur', on);
    localStorage.setItem('canonic:window-blur', String(on));
    const op = opacity ?? 0.72;
    document.documentElement.style.setProperty('--blur-opacity', String(op));
    localStorage.setItem('canonic:blur-opacity', String(op));
  }

  async function loadConfig() {
    if (import.meta.env.DEV) console.log("[Store] Loading config...");
    config.value = await api.config.read();
    applyWindowBlurClass(config.value?.windowBlur, config.value?.windowBlurOpacity);
    if (import.meta.env.DEV) {
      if (config.value) {
        console.log("[Store] Config loaded:", {
          ...config.value,
          apiKey: config.value.apiKey ? "***" : "(none)",
        });
      } else {
        console.log("[Store] No config found (first-run)");
      }
    }
    return config.value;
  }

  async function saveConfig(newConfig) {
    if (import.meta.env.DEV)
      console.log("[Store] Saving config:", {
        ...newConfig,
        apiKey: newConfig.apiKey ? "***" : "(none)",
      });
    const result = await api.config.write(newConfig);
    if (result.success) {
      config.value = result.config;
      applyWindowBlurClass(result.config.windowBlur, result.config.windowBlurOpacity);
      if (import.meta.env.DEV) console.log("[Store] Config saved successfully");
    } else {
      if (import.meta.env.DEV)
        console.warn("[Store] Config save failed:", result.errors);
    }
    return result;
  }

  async function openWorkspace(chosenPath, template = "blank") {
    isLoading.value = true;
    try {
      const result = await api.workspace.init(chosenPath, template);
      if (result.error) throw new Error(result.error);
      workspacePath.value = result.path;
      isExternalRepo.value = result.isExternal === true;
      workspaceName.value = chosenPath.split("/").pop();
      const recent = recentWorkspaces.value.filter(
        (w) => w.path !== chosenPath,
      );
      recent.unshift({
        path: chosenPath,
        name: workspaceName.value,
        openedAt: Date.now(),
      });
      recentWorkspaces.value = recent.slice(0, 8);
      localStorage.setItem(
        "canonic:recentWorkspaces",
        JSON.stringify(recentWorkspaces.value),
      );
      currentFile.value = null;
      currentContent.value = "";
      comments.value = [];
      await refreshFiles();
      await refreshBranches();
      // Restore last used branch if it exists in the workspace
      const cfg = await loadConfig();
      
      if (cfg?.autoShareAllWorkspaces && !sharesByFile['__all_workspaces__']) {
        await startAllWorkspacesShare();
      }

      if (cfg?.lastBranch && branches.value.includes(cfg.lastBranch)) {
        await api.git.checkout(workspacePath.value, cfg.lastBranch);
        currentBranch.value = cfg.lastBranch;
      }

      await loadDocBranchMap();
      await loadTrash();
      if (api.peers?.list) {
        const peers = await api.peers.list();
        persistedPeers.value = peers;
        peers.forEach((p) => {
          if (p.favorited) favoritedPeerIds.add(p.id);
        });
      }
      if (api.files.getIndex) {
        const idx = await api.files.getIndex();
        fileIndex.value = idx;
      }
      await logEvent("workspace:open", { template });
    } finally {
      isLoading.value = false;
    }
  }

  async function renameFile(oldPath, newName) {
    if (!workspacePath.value) return;
    const dir = oldPath.includes("/")
      ? oldPath.split("/").slice(0, -1).join("/")
      : "";
    const cleanName = newName.endsWith(".md") ? newName : `${newName}.md`;
    const newPath = dir ? `${dir}/${cleanName}` : cleanName;
    await api.files.move(workspacePath.value, oldPath, newPath);
    const oldDocId = oldPath.replace(/[\\/]/g, "_");
    const newDocId = newPath.replace(/[\\/]/g, "_");
    await api.comments.move(oldDocId, newDocId);
    if (currentFile.value === oldPath) {
      currentFile.value = newPath;
      if (docBranchMap.value[oldPath]) {
        docBranchMap.value[newPath] = docBranchMap.value[oldPath];
        delete docBranchMap.value[oldPath];
        await saveDocBranchMap();
      }
    }
    await refreshFiles();
    return newPath;
  }

  async function deleteFile(filePath) {
    if (!workspacePath.value) return;
    await api.files.trash.delete(workspacePath.value, filePath, false);
    if (currentFile.value === filePath) {
      currentFile.value = null;
      currentContent.value = "";
      isDirty.value = false;
      fileIsUncommitted.value = false;
      commitLog.value = [];
      docVersions.value = [];
      comments.value = [];
    }
    await refreshFiles();
    await loadTrash();
  }

  async function createDirectory(dirPath) {
    if (!workspacePath.value) return;
    await api.files.mkdir(workspacePath.value, dirPath);
    await refreshFiles();
  }

  async function deleteDirectory(dirPath) {
    if (!workspacePath.value) return;
    const prefix = dirPath + "/";
    if (currentFile.value?.startsWith(prefix)) {
      currentFile.value = null;
      currentContent.value = "";
      isDirty.value = false;
      commitLog.value = [];
      docVersions.value = [];
      comments.value = [];
    }
    await api.files.trash.delete(workspacePath.value, dirPath, true);
    await refreshFiles();
    await loadTrash();
  }

  async function moveFile(filePath, newDirPath) {
    if (!workspacePath.value) return;
    const filename = filePath.split("/").pop();
    const newPath = newDirPath ? `${newDirPath}/${filename}` : filename;

    // Find all files that will be moved (to migrate comments)
    const affectedFiles = [];
    const walk = (items) => {
      for (const it of items) {
        if (it.path === filePath || it.path.startsWith(filePath + "/")) {
          if (it.type === "file") affectedFiles.push(it.path);
          if (it.children) walk(it.children);
        } else if (it.children) {
          walk(it.children);
        }
      }
    };
    walk(files.value);

    // Perform move on disk
    await api.files.move(workspacePath.value, filePath, newPath);

    // Migrate comments for all affected files
    for (const oldFile of affectedFiles) {
      const movedFile = oldFile.replace(filePath, newPath);
      const oldDocId = oldFile.replace(/[\\/]/g, "_");
      const newDocId = movedFile.replace(/[\\/]/g, "_");
      await api.comments.move(oldDocId, newDocId);
    }

    // Update currentFile if it or its parent was moved
    if (currentFile.value === filePath) {
      currentFile.value = newPath;
    } else if (currentFile.value?.startsWith(filePath + "/")) {
      currentFile.value = currentFile.value.replace(filePath, newPath);
    }

    // Update docBranchMap for the item and its descendants
    let changed = false;
    const newDocBranchMap = { ...docBranchMap.value };

    if (newDocBranchMap[filePath]) {
      newDocBranchMap[newPath] = newDocBranchMap[filePath];
      delete newDocBranchMap[filePath];
      changed = true;
    }

    for (const key of Object.keys(newDocBranchMap)) {
      if (key.startsWith(filePath + "/")) {
        const newKey = key.replace(filePath, newPath);
        newDocBranchMap[newKey] = newDocBranchMap[key];
        delete newDocBranchMap[key];
        changed = true;
      }
    }

    if (changed) {
      docBranchMap.value = newDocBranchMap;
      await saveDocBranchMap();
    }

    await refreshFiles();
    return newPath;
  }

  async function loadTrash() {
    if (!workspacePath.value) {
      trashItems.value = [];
      return;
    }
    trashItems.value = (await api.files.trash.list(workspacePath.value)) || [];
  }

  async function restoreFromTrash(id) {
    if (!workspacePath.value) return;
    await api.files.trash.restore(workspacePath.value, id);
    await refreshFiles();
    await loadTrash();
  }

  async function purgeTrashItem(id) {
    if (!workspacePath.value) return;
    await api.files.trash.purge(workspacePath.value, id);
    await loadTrash();
  }

  async function refreshFiles() {
    if (!workspacePath.value) return;
    files.value = await api.files.list(workspacePath.value);
  }

  function clearUnsaved(filePath) {
    delete unsavedBuffer[filePath];
  }

  async function openFile(filePath) {
    // Close search view if open — user navigated to a doc
    if (searchViewOpen.value) searchViewOpen.value = false;

    // Buffer unsaved changes for the file we're leaving
    if (isDirty.value && currentFile.value) {
      unsavedBuffer[currentFile.value] = currentContent.value;
    }

    // Clear peer file if we're opening a local one
    if (peerFileContent.value) {
      openPeerFile(null);
    }

    // Switch to the branch this document is on (only in internal branching mode)
    if (workspacePath.value && !isExternalRepo.value) {
      const docBranch = docBranchMap.value[filePath]?.activeBranch || "main";
      if (docBranch !== currentBranch.value) {
        const result = await api.git.checkout(workspacePath.value, docBranch);
        if (result.success) currentBranch.value = docBranch;
      }
    }

    const diskContent = await api.files.read(workspacePath.value, filePath);
    console.log("[Store] File content read, setting currentFile to:", filePath);
    currentFile.value = filePath;

    // Prefer buffered unsaved content over disk content
    if (unsavedBuffer[filePath] !== undefined) {
      currentContent.value = unsavedBuffer[filePath];
      isDirty.value = true;
    } else {
      currentContent.value = diskContent || "";
      isDirty.value = false;
    }

    await loadComments();
    if (workspacePath.value) {
      await loadCommitLog();
      await loadDocVersions();
      if (diskContent) {
        api.search.index(workspacePath.value, filePath, diskContent);
      }
    }
    await logEvent("file:open");
  }

  function normalizeMarkdown(md) {
    return md
      .replace(/\r\n/g, '\n')      // consistent line endings
      .replace(/[ \t]+$/gm, '')    // strip trailing whitespace per line
      .replace(/\n{3,}/g, '\n\n')  // max one blank line between blocks
      .trimEnd() + '\n'            // single trailing newline
  }

  async function saveFile(content) {
    if (!currentFile.value) return;
    const normalized = normalizeMarkdown(content);
    await api.files.write(workspacePath.value, currentFile.value, normalized);
    currentContent.value = normalized;
    isDirty.value = false;
    clearUnsaved(currentFile.value);
    if (workspacePath.value) {
      api.search.index(workspacePath.value, currentFile.value, content);
      await checkFileStatus();
    }
  }

  async function maybeDeleteAsset(assetUrl) {
    if (!workspacePath.value || isDemoMode.value) return
    const match = assetUrl.match(/^canonic-asset:\/\/(.+)$/)
    if (!match) return
    const relativePath = match[1] // e.g. 'assets/image-1234.png'
    const tracked = await api.git.isFileTracked(workspacePath.value, relativePath)
    if (!tracked) {
      await api.files.delete(workspacePath.value, relativePath)
    }
  }

  async function saveAsset(uint8array, ext) {
    if (!workspacePath.value || isDemoMode.value) return null
    const safeExt = (ext || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'png'
    const filename = `assets/image-${Date.now()}.${safeExt}`
    const result = await api.files.writeBinary(workspacePath.value, filename, uint8array)
    return result ? `canonic-asset://${filename}` : null
  }

  async function checkFileStatus() {
    if (!workspacePath.value || !currentFile.value) {
      fileIsUncommitted.value = false;
      return;
    }
    const result = await api.git.fileStatus(
      workspacePath.value,
      currentFile.value,
    );
    fileIsUncommitted.value = result?.isUncommitted ?? false;
  }

  async function createFile(name) {
    if (!workspacePath.value) return;
    const filePath = await api.files.newDoc(workspacePath.value, name);
    await refreshFiles();
    await openFile(filePath);
    await logEvent("file:create");
    return filePath;
  }

  async function commitFile(message) {
    if (!workspacePath.value || !currentFile.value) return;
    const result = await api.git.commit(
      workspacePath.value,
      currentFile.value,
      message,
    );
    if (result.success) {
      fileIsUncommitted.value = false;
      await loadCommitLog().catch((e) =>
        console.error("[commitFile] loadCommitLog failed:", e),
      );
    }
    return result;
  }

  async function refreshBranches() {
    if (!workspacePath.value) return;
    const result = await api.git.branches(workspacePath.value);
    branches.value = result.branches || [];
    currentBranch.value = result.current || "main";
  }

  async function createBranch(name) {
    if (!workspacePath.value) return;
    const result = await api.git.createBranch(workspacePath.value, name);
    if (result.success) {
      await refreshBranches();
    }
    return result;
  }

  async function checkoutBranch(name) {
    if (!workspacePath.value) return;
    const result = await api.git.checkout(workspacePath.value, name);
    if (result.success) {
      currentBranch.value = name;
      // Update the doc branch map for the current document
      if (currentFile.value) {
        if (!docBranchMap.value[currentFile.value]) {
          if (name !== "main") {
            docBranchMap.value[currentFile.value] = {
              activeBranch: name,
              branches: [name],
            };
          }
        } else {
          docBranchMap.value[currentFile.value].activeBranch = name;
          if (
            name !== "main" &&
            !docBranchMap.value[currentFile.value].branches.includes(name)
          ) {
            docBranchMap.value[currentFile.value].branches.push(name);
          }
        }
        await saveDocBranchMap();
        // Reload content for the current file on the new branch
        const content = await api.files.read(
          workspacePath.value,
          currentFile.value,
        );
        currentContent.value = content || "";
        isDirty.value = false;
        await loadCommitLog();
        await loadDocVersions();
      }
    }
    return result;
  }

  async function switchWorkspaceBranch(name) {
    if (!workspacePath.value) return;

    // Safety check for uncommitted changes
    const { modified } = await api.git.status(workspacePath.value);
    if (modified.length > 0 || isDirty.value) {
      const confirmed = await api.dialog.confirm(
        "Uncommitted changes",
        "You have uncommitted changes. Switching branches may lose these changes or cause conflicts. Continue?"
      );
      if (!confirmed) return { success: false, cancelled: true };
    }

    const result = await api.git.checkout(workspacePath.value, name);
    if (result.success) {
      currentBranch.value = name;
      // Persist workspace branch choice
      const currentConfig = await loadConfig();
      await saveConfig({ ...currentConfig, lastBranch: name });

      await refreshFiles();
      if (currentFile.value) {
        const content = await api.files.read(workspacePath.value, currentFile.value);
        currentContent.value = content || "";
        isDirty.value = false;
        await loadCommitLog();
        await loadDocVersions();
      }
    }
    return result;
  }

  async function mergeBranch(fromBranch, message) {
    if (!workspacePath.value) return;
    const result = await api.git.merge(
      workspacePath.value,
      fromBranch,
      message,
    );
    if (result.success) {
      // Delete the merged branch
      await api.git.deleteBranch(workspacePath.value, fromBranch);
      // Clean up the doc branch manifest
      let changed = false;
      for (const [filePath, info] of Object.entries(docBranchMap.value)) {
        if (info.branches && info.branches.includes(fromBranch)) {
          info.branches = info.branches.filter((b) => b !== fromBranch);
          if (info.activeBranch === fromBranch) info.activeBranch = "main";
          if (info.branches.length === 0) delete docBranchMap.value[filePath];
          changed = true;
        }
      }
      if (changed) await saveDocBranchMap();
      await refreshBranches();
      await refreshFiles();
      // Reload current file content from main
      if (currentFile.value) {
        const content = await api.files.read(
          workspacePath.value,
          currentFile.value,
        );
        currentContent.value = content || "";
        isDirty.value = false;
        await loadCommitLog();
        await loadDocVersions();
      }
    }
    return result;
  }

  async function loadCommitLog() {
    if (!workspacePath.value || !currentFile.value) return;
    try {
      const docBranches = getDocBranches(currentFile.value);
      // Include current branch (may be null/detached) plus doc-owned branches
      const branchCandidates = [
        currentBranch.value,
        "main",
        ...docBranches,
      ].filter(Boolean);
      const branchList = Array.from(new Set(branchCandidates));
      const result = await api.git.logAll(
        workspacePath.value,
        currentFile.value,
        branchList,
      );
      commitLog.value = result || [];
    } catch (err) {
      console.warn("[loadCommitLog] logAll failed, falling back:", err);
      try {
        commitLog.value =
          (await api.git.log(workspacePath.value, currentFile.value)) || [];
      } catch {
        commitLog.value = [];
      }
    }
    try {
      await checkFileStatus();
    } catch {}
  }

  async function loadComments() {
    if (!currentFile.value) return;
    const docId = currentFile.value.replace(/[\\/]/g, "_");
    const saved = (await api.comments.get(docId)) || [];
    if (isDemoMode.value) {
      const demoForFile = _demoComments.value[currentFile.value] || [];
      const now = Date.now();
      const stamped = demoForFile.map((c, i) => ({
        ...c,
        createdAt:
          c.createdAt || new Date(now - (i + 1) * 3600000 * 2).toISOString(),
      }));
      const savedIds = new Set(saved.map((c) => c.id));
      const newDemo = stamped.filter((c) => !savedIds.has(c.id));
      comments.value = [...saved, ...newDemo];
    } else {
      comments.value = saved;
    }
  }

  async function addComment(comment) {
    comments.value.push(comment);
    await persistComments();
    await logEvent("comment:add");
  }

  async function resolveComment(commentId) {
    const c = comments.value.find((c) => c.id === commentId);
    if (c) c.resolved = true;
    await persistComments();
  }

  async function deleteComment(commentId) {
    comments.value = comments.value.filter((c) => c.id !== commentId);
    await persistComments();
  }

  async function persistComments() {
    if (!currentFile.value) return;
    const docId = currentFile.value.replace(/[\\/]/g, "_");
    await api.comments.save(docId, JSON.parse(JSON.stringify(comments.value)));
  }

  async function loadDocVersions() {
    if (!workspacePath.value || !currentFile.value) {
      docVersions.value = [];
      return;
    }
    docVersions.value = await api.versions.list(
      workspacePath.value,
      currentFile.value,
    );
  }

  async function saveDocVersion(name, message) {
    if (!workspacePath.value || !currentFile.value) return;
    if (!commitLog.value.length)
      throw new Error("No commits yet — save a checkpoint first.");
    const oid = commitLog.value[0].oid;
    docVersions.value = await api.versions.save(
      workspacePath.value,
      currentFile.value,
      name,
      oid,
      message,
    );
    await logEvent("version:save");
    return docVersions.value;
  }

  async function deleteDocVersion(versionName) {
    if (!workspacePath.value || !currentFile.value) return;
    await api.versions.delete(
      workspacePath.value,
      currentFile.value,
      versionName,
    );
    docVersions.value = docVersions.value.filter((v) => v.name !== versionName);
  }

  async function restoreDocVersion(oid) {
    if (!workspacePath.value || !currentFile.value) return;
    const content = await api.git.readCommit(
      workspacePath.value,
      currentFile.value,
      oid,
    );
    if (content !== null && content !== undefined) {
      currentContent.value = content;
      isDirty.value = true;
    }
  }

  async function forkDocument(branchName) {
    const result = await createBranch(branchName);
    if (result?.success) {
      await api.git.checkout(workspacePath.value, branchName);
      currentBranch.value = branchName;
      // Record this branch as owned by the current document
      if (currentFile.value) {
        if (!docBranchMap.value[currentFile.value]) {
          docBranchMap.value[currentFile.value] = {
            activeBranch: branchName,
            branches: [branchName],
          };
        } else {
          docBranchMap.value[currentFile.value].activeBranch = branchName;
          if (
            !docBranchMap.value[currentFile.value].branches.includes(branchName)
          ) {
            docBranchMap.value[currentFile.value].branches.push(branchName);
          }
        }
        await saveDocBranchMap();
      }
    }
    return result;
  }

  async function enableDemoMode() {
    const cfg = demoConfig;
    const defaultPath = await api.workspace.getDefault();
    const parent = defaultPath.replace(/\/[^/]+$/, "");
    const demoPath = `${parent}/${cfg.workspaceName}`;

    _demoComments.value = cfg.comments || {};
    demoPeers.value = cfg.peers || [];
    demoFiles.value = cfg.files ? { ...cfg.files } : {};
    isDemoMode.value = true;

    await openWorkspace(demoPath, cfg.template || "pm-framework");

    if (cfg.files && workspacePath.value) {
      for (const [filePath, content] of Object.entries(cfg.files)) {
        await api.files.write(workspacePath.value, filePath, content);
      }
      await refreshFiles();
    }
  }

  function disableDemoMode() {
    isDemoMode.value = false;
    demoPeers.value = [];
    demoFiles.value = {};
    _demoComments.value = {};
    comments.value = comments.value.filter((c) => !c.isDemo);
  }

  async function startShare(options) {
    if (!workspacePath.value || !currentFile.value) return;
    const cleanOptions = JSON.parse(JSON.stringify(options || {}));
    const result = await api.share.start(
      workspacePath.value,
      currentFile.value,
      cleanOptions,
    );
    if (result.success) {
      sharesByFile[currentFile.value] = result;
      shareStatsByFile[currentFile.value] = { reads: result.reads ?? 0, connected: 0 };
      await logEvent("share:start", { scope: options.scope });
    }
    return result;
  }

  async function stopShare() {
    if (!currentFile.value) return;
    await api.share.stop(currentFile.value);
    delete sharesByFile[currentFile.value];
    delete shareStatsByFile[currentFile.value];
  }

  async function startWorkspaceShare() {
    if (!workspacePath.value) return;
    const cfg = config.value || await loadConfig();
    const options = {
      permission: cfg?.sharingDefaults?.accessLevel || 'view',
      excludedPaths: JSON.parse(JSON.stringify(cfg?.sharingExcludedPaths || []))
    };
    const result = await api.share.startWorkspace(workspacePath.value, options);
    if (result.success) {
      sharesByFile[WORKSPACE_KEY] = result;
      shareStatsByFile[WORKSPACE_KEY] = { reads: result.reads ?? 0, connected: 0 };
    }
    return result;
  }

  async function startAllWorkspacesShare() {
    const cfg = config.value || await loadConfig();
    const workspaces = recentWorkspaces.value.map(w => ({ path: w.path, name: w.name }));
    const options = {
      permission: cfg?.sharingDefaults?.accessLevel || 'view',
      excludedPaths: JSON.parse(JSON.stringify(cfg?.sharingExcludedPaths || []))
    };
    const ALL_WS_KEY = '__all_workspaces__';
    const result = await api.share.startAllWorkspaces(workspaces, options);
    if (result.success) {
      sharesByFile[ALL_WS_KEY] = result;
      shareStatsByFile[ALL_WS_KEY] = { reads: result.reads ?? 0, connected: 0 };
    }
    return result;
  }

  async function stopAllWorkspacesShare() {
    const ALL_WS_KEY = '__all_workspaces__';
    await api.share.stopWorkspace(ALL_WS_KEY);
    delete sharesByFile[ALL_WS_KEY];
    delete shareStatsByFile[ALL_WS_KEY];
  }

  async function stopWorkspaceShare() {
    await api.share.stopWorkspace();
    delete sharesByFile[WORKSPACE_KEY];
    delete shareStatsByFile[WORKSPACE_KEY];
  }

  async function searchDocs(query) {
    const results = await api.search.query(query, workspacePath.value);
    searchResults.value = results;
    return results;
  }

  // --- Workspace find & replace ---

  function _buildSearchRegex(query, opts) {
    if (!query) return null;
    try {
      const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let pattern = opts.regex ? query : escape(query);
      if (opts.word) pattern = `\\b(?:${pattern})\\b`;
      const flags = 'g' + (opts.case ? '' : 'i');
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }

  function _findInTextByLines(text, re) {
    if (!re) return [];
    const out = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const m of line.matchAll(re)) {
        if (m[0].length === 0) continue;
        out.push({ line: i + 1, col: m.index, text: line, length: m[0].length });
      }
    }
    return out;
  }

  function _demoWorkspaceSearch() {
    const re = _buildSearchRegex(wsSearch.query, wsSearch.opts);
    if (!re) {
      wsSearch.results = { branch: [], other: [] };
      wsSearch.lastError = 'Invalid regex';
      return;
    }
    wsSearch.lastError = '';
    const branchResults = [];
    for (const [filePath, content] of Object.entries(demoFiles.value || {})) {
      const matches = _findInTextByLines(content, re);
      if (matches.length) {
        branchResults.push({ filePath, branch: 'current', matches });
      }
    }
    wsSearch.results = { branch: branchResults, other: [] };
  }

  async function runWorkspaceSearch() {
    const q = (wsSearch.query || '').trim();
    if (!q) {
      wsSearch.results = { branch: [], other: [] };
      wsSearch.lastError = '';
      return;
    }
    wsSearch.searching = true;
    wsSearch.lastError = '';
    try {
      if (isDemoMode.value) {
        _demoWorkspaceSearch();
        return;
      }
      const res = await api.workspaceSearch.search({
        workspacePath: workspacePath.value,
        query: wsSearch.query,
        opts: { ...wsSearch.opts },
        include: wsSearch.include,
        exclude: wsSearch.exclude,
        allBranches: wsSearch.allBranches,
      });
      wsSearch.results = { branch: res.branch || [], other: res.other || [] };
      if (res.error) wsSearch.lastError = res.error;
    } finally {
      wsSearch.searching = false;
    }
  }

  function _applyReplacementToText(content, query, replacement, opts) {
    const re = _buildSearchRegex(query, opts);
    if (!re) return content;
    return content.replace(re, replacement);
  }

  async function replaceAllInWorkspace() {
    if (isDemoMode.value) {
      wsSearch.lastError = 'Demo mode is read-only.';
      return { replaced: 0, skipped: 0 };
    }
    if (!wsSearch.query) return { replaced: 0, skipped: 0 };
    const targets = wsSearch.results.branch || [];
    const skipped = (wsSearch.results.other || []).length;
    let replacedFiles = 0;
    for (const fileResult of targets) {
      const filePath = fileResult.filePath;
      let original;
      if (currentFile.value === filePath) {
        original = currentContent.value;
      } else if (unsavedBuffer[filePath] !== undefined) {
        original = unsavedBuffer[filePath];
      } else {
        try {
          original = await api.files.read(workspacePath.value, filePath);
        } catch {
          continue;
        }
      }
      const next = _applyReplacementToText(
        original || '',
        wsSearch.query,
        wsSearch.replace,
        wsSearch.opts,
      );
      if (next === original) continue;
      if (currentFile.value === filePath) {
        currentContent.value = next;
        isDirty.value = true;
      } else {
        unsavedBuffer[filePath] = next;
      }
      replacedFiles++;
    }
    await runWorkspaceSearch();
    return { replaced: replacedFiles, skipped };
  }

  async function replaceNextInWorkspace() {
    if (isDemoMode.value) {
      wsSearch.lastError = 'Demo mode is read-only.';
      return { replaced: 0, skipped: 0 };
    }
    const targets = wsSearch.results.branch || [];
    if (!targets.length || !wsSearch.query) return { replaced: 0, skipped: 0 };
    const first = targets[0];
    const filePath = first.filePath;
    let original;
    if (currentFile.value === filePath) {
      original = currentContent.value;
    } else if (unsavedBuffer[filePath] !== undefined) {
      original = unsavedBuffer[filePath];
    } else {
      original = await api.files.read(workspacePath.value, filePath);
    }
    const re = _buildSearchRegex(wsSearch.query, wsSearch.opts);
    if (!re) return { replaced: 0, skipped: 0 };
    const next = (original || '').replace(re, (match, ...rest) => {
      re.lastIndex = 0;
      return wsSearch.replace;
    });
    // Above replaces all on the line — for true "next only" semantics use a one-shot regex.
    const oneShot = new RegExp(re.source, re.flags.replace('g', ''));
    const single = (original || '').replace(oneShot, wsSearch.replace);
    if (single === original) return { replaced: 0, skipped: (wsSearch.results.other || []).length };
    if (currentFile.value === filePath) {
      currentContent.value = single;
      isDirty.value = true;
    } else {
      unsavedBuffer[filePath] = single;
    }
    await runWorkspaceSearch();
    return { replaced: 1, skipped: (wsSearch.results.other || []).length };
  }

  function openWorkspaceSearchResult(result) {
    wsSearch.pendingFocus = { filePath: result.filePath, line: result.line || 1 };
    searchViewOpen.value = false;
    if (result.filePath !== currentFile.value) {
      openFile(result.filePath);
    }
  }

  async function logEvent(event, details = {}) {
    if (!config.value) await loadConfig();
    if (config.value?.telemetryEnabled) {
      await api.telemetry.log(event, details);
    }
  }

  async function startAgentSession({ sessionId, file, agentName, workspacePath: wsParam }) {
    agentActivity.value = null
    agentSession.value = { sessionId, agentName, file, startedAt: Date.now() }
    const ws = wsParam || workspacePath.value
    if (ws && ws !== workspacePath.value) {
      await openWorkspace(ws)
    }
    if (file && ws) {
      await openFile(file)
    }
  }

  async function cancelAgentSession() {
    if (!agentSession.value) return
    const { sessionId } = agentSession.value
    agentSession.value = null
    actionPickerOpen.value = false
    await api.agentSession.cancel(sessionId)
  }

  async function submitAgentAction(prompt) {
    if (!agentSession.value) return
    const { sessionId } = agentSession.value
    try {
      await api.agentSession.submit({ sessionId, prompt, content: currentContent.value })
    } finally {
      agentSession.value = null
      actionPickerOpen.value = false
    }
  }

  async function addAgentComment({ commentId, file, anchor, text, agentName }) {
    if (file !== currentFile.value) return
    const comment = {
      id: commentId,
      isAgent: true,
      agentName,
      author: agentName,
      anchor,
      text,
      resolved: false,
      createdAt: new Date().toISOString(),
    }
    comments.value.push(comment)
    await persistComments()
  }

  function openActionPicker() { actionPickerOpen.value = true }
  function closeActionPicker() { actionPickerOpen.value = false }

  async function favoritePeer(id) {
    await api.peers.favorite(id);
    favoritedPeerIds.add(id);
    const peers = await api.peers.list();
    persistedPeers.value = peers;
  }

  async function unfavoritePeer(id) {
    await api.peers.unfavorite(id);
    favoritedPeerIds.delete(id);
    const peers = await api.peers.list();
    persistedPeers.value = peers;
  }

  function setActiveComment(id) {
    activeCommentId.value = id;
  }

  function openPeerFile(payload) {
    if (!payload) {
      peerFileContent.value = null;
      peerFileComments.value = [];
      activeCommentId.value = null;
      return;
    }
    const { peer, relPath, content, comments } = payload;
    peerFileContent.value = { peer, relPath, content };
    peerFileComments.value = comments ? [...comments] : [];
  }

  function addPeerComment(comment) {
    peerFileComments.value.unshift(comment);
  }

  function updatePeerComment(id, patch) {
    const idx = peerFileComments.value.findIndex(c => c.id === id);
    if (idx >= 0) peerFileComments.value[idx] = { ...peerFileComments.value[idx], ...patch };
  }

  async function copyPeerFileToWorkspace({ relPath, content }) {
    if (!workspacePath.value) return;
    await api.files.write(workspacePath.value, relPath, content);
    await refreshFiles();
  }

  return {
    workspacePath,
    workspaceName,
    recentWorkspaces,
    files,
    currentFile,
    currentContent,
    branches,
    currentBranch,
    isExternalRepo,
    commitLog,
    comments,
    isDirty,
    unsavedBuffer,
    fileIsUncommitted,
    isLoading,
    shareInfo,
    shareStats,
    workspaceShareInfo,
    workspaceShareStats,
    startWorkspaceShare,
    stopWorkspaceShare,
    startAllWorkspacesShare,
    stopAllWorkspacesShare,
    searchResults,
    config,
    sidebarTab,
    rightPanelTab,
    sidebarCollapsed,
    rightPanelCollapsed,
    showLineNumbers,
    isDemoMode,
    demoPeers,
    demoFiles,
    wsSearch,
    searchViewOpen,
    findHotkeys,
    unsavedBuffer,
    runWorkspaceSearch,
    replaceAllInWorkspace,
    replaceNextInWorkspace,
    openWorkspaceSearchResult,
    docVersions,
    docBranchMap,
    currentDocBranch,
    trashItems,
    loadConfig,
    saveConfig,
    openWorkspace,
    refreshFiles,
    openFile,
    openStandaloneFile,
    saveFile,
    saveAsset,
    maybeDeleteAsset,
    clearUnsaved,
    createFile,
    renameFile,
    deleteFile,
    createDirectory,
    deleteDirectory,
    moveFile,
    loadTrash,
    restoreFromTrash,
    purgeTrashItem,
    commitFile,
    refreshBranches,
    createBranch,
    checkoutBranch,
    switchWorkspaceBranch,
    mergeBranch,
    loadCommitLog,
    checkFileStatus,
    loadComments,
    addComment,
    resolveComment,
    deleteComment,
    loadDocVersions,
    saveDocVersion,
    deleteDocVersion,
    restoreDocVersion,
    forkDocument,
    getDocBranches,
    loadDocBranchMap,
    saveDocBranchMap,
    startShare,
    stopShare,
    searchDocs,
    enableDemoMode,
    disableDemoMode,
    logEvent,
    agentSession,
    agentActivity,
    actionPickerOpen,
    startAgentSession,
    cancelAgentSession,
    submitAgentAction,
    addAgentComment,
    openActionPicker,
    closeActionPicker,
    discoveredPeers,
    favoritedPeerIds,
    favoritedPeers,
    peerFileContent,
    navBack,
    peerFileComments,
    activeCommentId,
    networkChanged,
    favoritePeer,
    unfavoritePeer,
    openPeerFile,
    addPeerComment,
    updatePeerComment,
    setActiveComment,
    copyPeerFileToWorkspace,
    fileIndex,
    appVersion,
    updateAvailable,
    updateDownloading,
    updateReady,
    updateInfo,
    downloadProgress,
    downloadUpdate,
    installUpdate,
    commentingActive: ref(false),
    refreshDiscoveredPeers,
    sharesByFile,
    shareStatsByFile,
  };
});
