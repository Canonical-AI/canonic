const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("canonic", {
  // Config
  config: {
    read: () => ipcRenderer.invoke("config:read"),
    write: (config) => ipcRenderer.invoke("config:write", config),
    exists: () => ipcRenderer.invoke("config:exists"),
    validate: (config) => ipcRenderer.invoke("config:validate", config),
  },

  // Telemetry
  telemetry: {
    log: (event, details) =>
      ipcRenderer.invoke("telemetry:log", event, details),
  },

  // Workspace
  workspace: {
    openDialog: () => ipcRenderer.invoke("workspace:open-dialog"),
    init: (path, template) =>
      ipcRenderer.invoke("workspace:init", path, template),
    getDefault: () => ipcRenderer.invoke("workspace:get-default"),
    openDirectoryDialog: () => ipcRenderer.invoke("dialog:open-directory"),
  },

  // Files
  files: {
    list: (workspacePath) => ipcRenderer.invoke("files:list", workspacePath),
    read: (workspacePath, filePath) =>
      ipcRenderer.invoke("files:read", workspacePath, filePath),
    write: (workspacePath, filePath, content) =>
      ipcRenderer.invoke("files:write", workspacePath, filePath, content),
    delete: (workspacePath, filePath) =>
      ipcRenderer.invoke("files:delete", workspacePath, filePath),
    newDoc: (workspacePath, fileName) =>
      ipcRenderer.invoke("files:new", workspacePath, fileName),
    mkdir: (workspacePath, dirPath) =>
      ipcRenderer.invoke("files:mkdir", workspacePath, dirPath),
    rmdir: (workspacePath, dirPath) =>
      ipcRenderer.invoke("files:rmdir", workspacePath, dirPath),
    move: (workspacePath, oldPath, newPath) =>
      ipcRenderer.invoke("files:move", workspacePath, oldPath, newPath),
    trash: {
      delete: (workspacePath, itemPath, isDirectory) =>
        ipcRenderer.invoke("files:trash", workspacePath, itemPath, isDirectory),
      list: (workspacePath) =>
        ipcRenderer.invoke("files:trash-list", workspacePath),
      restore: (workspacePath, id) =>
        ipcRenderer.invoke("files:trash-restore", workspacePath, id),
      purge: (workspacePath, id) =>
        ipcRenderer.invoke("files:trash-purge", workspacePath, id),
    },
  },

  // Git
  git: {
    commit: (workspacePath, filePath, message) =>
      ipcRenderer.invoke("git:commit", workspacePath, filePath, message),
    log: (workspacePath, filePath) =>
      ipcRenderer.invoke("git:log", workspacePath, filePath),
    branches: (workspacePath) =>
      ipcRenderer.invoke("git:branches", workspacePath),
    createBranch: (workspacePath, name) =>
      ipcRenderer.invoke("git:create-branch", workspacePath, name),
    checkout: (workspacePath, name) =>
      ipcRenderer.invoke("git:checkout", workspacePath, name),
    merge: (workspacePath, from, message) =>
      ipcRenderer.invoke("git:merge", workspacePath, from, message),
    diff: (workspacePath, filePath, oid) =>
      ipcRenderer.invoke("git:diff", workspacePath, filePath, oid),
    readCommit: (workspacePath, filePath, oid) =>
      ipcRenderer.invoke("git:read-commit", workspacePath, filePath, oid),
    status: (workspacePath) => ipcRenderer.invoke("git:status", workspacePath),
    deleteBranch: (workspacePath, name) =>
      ipcRenderer.invoke("git:delete-branch", workspacePath, name),
    logAll: (workspacePath, filePath, branchList) =>
      ipcRenderer.invoke("git:log-all", workspacePath, filePath, branchList),
    fileStatus: (workspacePath, filePath) =>
      ipcRenderer.invoke("git:file-status", workspacePath, filePath),
  },

  // Comments
  comments: {
    get: (docId) => ipcRenderer.invoke("comments:get", docId),
    save: (docId, comments) =>
      ipcRenderer.invoke("comments:save", docId, comments),
    move: (oldId, newId) => ipcRenderer.invoke("comments:move", oldId, newId),
  },

  // Search
  search: {
    query: (query, workspacePath) =>
      ipcRenderer.invoke("search:query", query, workspacePath),
    index: (workspacePath, filePath, content) =>
      ipcRenderer.invoke("search:index", workspacePath, filePath, content),
  },

  // Sharing
  share: {
    start: (workspacePath, filePath, options) =>
      ipcRenderer.invoke("share:start", workspacePath, filePath, options),
    stop: (filePath) => ipcRenderer.invoke("share:stop", filePath),
    openLink: (url) => ipcRenderer.invoke("share:open-link", url),
    openShared: (url, token) =>
      ipcRenderer.invoke("peers:open-shared", url, token),
    getStats: (filePath) => ipcRenderer.invoke("share:stats", filePath),
    onStats: (cb) => ipcRenderer.on("share:stats", (_, stats) => cb(stats)),
    offStats: (cb) => ipcRenderer.removeListener("share:stats", cb),
    onOpenPeer: (cb) => ipcRenderer.on("share:open-peer", (_, data) => cb(data)),
    startWorkspace: (workspacePath) => ipcRenderer.invoke("share:start-workspace", workspacePath),
    stopWorkspace: () => ipcRenderer.invoke("share:stop-workspace"),
    getWorkspaceStats: () => ipcRenderer.invoke("share:workspace-stats"),
  },

  // Peers
  peers: {
    list: () => ipcRenderer.invoke("peers:list"),
  },

  // Cleanup / Uninstall
  cleanup: {
    resetConfig: () => ipcRenderer.invoke("cleanup:reset-config"),
    deleteWorkspace: (path) =>
      ipcRenderer.invoke("cleanup:delete-workspace", path),
    getPaths: () => ipcRenderer.invoke("cleanup:get-paths"),
  },

  // Updates
  update: {
    check: () => ipcRenderer.invoke("update:check"),
    download: () => ipcRenderer.invoke("update:download"),
    install: () => ipcRenderer.invoke("update:install"),
    onAvailable: (cb) =>
      ipcRenderer.on("update:available", (_, info) => cb(info)),
    onDownloaded: (cb) =>
      ipcRenderer.on("update:downloaded", (_, info) => cb(info)),
    onProgress: (cb) =>
      ipcRenderer.on("update:progress", (_, progress) => cb(progress)),
    onError: (cb) => ipcRenderer.on("update:error", (_, msg) => cb(msg)),
  },

  // Doc branch manifest (per-workspace, stored in .canonic/doc-branches.json)
  docBranches: {
    get: (workspacePath) =>
      ipcRenderer.invoke("doc-branches:get", workspacePath),
    set: (workspacePath, data) =>
      ipcRenderer.invoke("doc-branches:set", workspacePath, data),
  },

  // Doc versions (per-file named snapshots pointing to commit OIDs)
  versions: {
    list: (workspacePath, filePath) =>
      ipcRenderer.invoke("versions:list", workspacePath, filePath),
    save: (workspacePath, filePath, name, oid, message) =>
      ipcRenderer.invoke(
        "versions:save",
        workspacePath,
        filePath,
        name,
        oid,
        message,
      ),
    delete: (workspacePath, filePath, versionName) =>
      ipcRenderer.invoke(
        "versions:delete",
        workspacePath,
        filePath,
        versionName,
      ),
  },

  // AI (proxied through main process to avoid CORS)
  ai: {
    chat: (params) => ipcRenderer.invoke("ai:chat", params),
    onChunk: (cb) => ipcRenderer.on("ai:chunk", (_, text) => cb(text)),
    onDone: (cb) => ipcRenderer.on("ai:done", () => cb()),
    onError: (cb) => ipcRenderer.on("ai:error", (_, msg) => cb(msg)),
    removeListeners: () => {
      ipcRenderer.removeAllListeners("ai:chunk");
      ipcRenderer.removeAllListeners("ai:done");
      ipcRenderer.removeAllListeners("ai:error");
    },
  },
});
