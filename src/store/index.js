import { defineStore } from "pinia";
import { ref, reactive, computed, watch } from "vue";

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
    localStorage.getItem("canonic:rightPanelCollapsed") === "true",
  );
  watch(rightPanelCollapsed, (val) => {
    localStorage.setItem("canonic:rightPanelCollapsed", String(val));
  });
  const docVersions = ref([]);
  const docBranchMap = ref({}); // { 'path/to/file.md': { activeBranch: 'branch', branches: ['branch'] } }

  const trashItems = ref([]);

  const isDemoMode = ref(false);
  const demoPeers = ref([]);
  const _demoComments = ref({});

  const api = window.canonic;

  // Wire share stats listener once — updates whichever file is being shared
  api.share.onStats((stats) => {
    shareStatsByFile[stats.filePath] = { reads: stats.reads, connected: stats.connected };
  });

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

  async function loadConfig() {
    if (import.meta.env.DEV) console.log("[Store] Loading config...");
    config.value = await api.config.read();
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
      await loadDocBranchMap();
      await loadTrash();
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
      const oldDocId = oldFile.replace(/\//g, "_");
      const newDocId = movedFile.replace(/\//g, "_");
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
    if (!workspacePath.value) return;

    // Buffer unsaved changes for the file we're leaving
    if (isDirty.value && currentFile.value) {
      unsavedBuffer[currentFile.value] = currentContent.value;
    }

    // Switch to the branch this document is on
    const docBranch = docBranchMap.value[filePath]?.activeBranch || "main";
    if (docBranch !== currentBranch.value) {
      const result = await api.git.checkout(workspacePath.value, docBranch);
      if (result.success) currentBranch.value = docBranch;
    }

    const diskContent = await api.files.read(workspacePath.value, filePath);
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
    await loadCommitLog();
    await loadDocVersions();
    if (diskContent) {
      api.search.index(workspacePath.value, filePath, diskContent);
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
    if (!workspacePath.value || !currentFile.value) return;
    const normalized = normalizeMarkdown(content);
    await api.files.write(workspacePath.value, currentFile.value, normalized);
    currentContent.value = normalized;
    isDirty.value = false;
    clearUnsaved(currentFile.value);
    api.search.index(workspacePath.value, currentFile.value, content);
    await checkFileStatus();
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
    const result = await api.git.checkout(workspacePath.value, name);
    if (result.success) {
      currentBranch.value = name;
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
    const docId = currentFile.value.replace(/\//g, "_");
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
    const docId = currentFile.value.replace(/\//g, "_");
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
    const cfg = await fetch("/demo/config.json").then((r) => r.json());
    const defaultPath = await api.workspace.getDefault();
    const parent = defaultPath.replace(/\/[^/]+$/, "");
    const demoPath = `${parent}/${cfg.workspaceName}`;

    _demoComments.value = cfg.comments || {};
    demoPeers.value = cfg.peers || [];
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
    _demoComments.value = {};
    comments.value = comments.value.filter((c) => !c.isDemo);
  }

  async function startShare(options) {
    if (!workspacePath.value || !currentFile.value) return;
    const result = await api.share.start(
      workspacePath.value,
      currentFile.value,
      options,
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
    const result = await api.share.startWorkspace(workspacePath.value);
    if (result.success) {
      sharesByFile[WORKSPACE_KEY] = result;
      shareStatsByFile[WORKSPACE_KEY] = { reads: result.reads ?? 0, connected: 0 };
    }
    return result;
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

  async function logEvent(event, details = {}) {
    if (!config.value) await loadConfig();
    if (config.value?.telemetryEnabled) {
      await api.telemetry.log(event, details);
    }
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
    searchResults,
    config,
    sidebarTab,
    rightPanelTab,
    sidebarCollapsed,
    rightPanelCollapsed,
    isDemoMode,
    demoPeers,
    docVersions,
    docBranchMap,
    currentDocBranch,
    trashItems,
    loadConfig,
    saveConfig,
    openWorkspace,
    refreshFiles,
    openFile,
    saveFile,
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
  };
});
