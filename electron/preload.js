const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("canonic", {
  // Config
  config: {
    read: () => ipcRenderer.invoke("config:read"),
    write: (config) => ipcRenderer.invoke("config:write", config),
    exists: () => ipcRenderer.invoke("config:exists"),
    validate: (config) => ipcRenderer.invoke("config:validate", config),
  },

  // App
  app: {
    getVersion: () => ipcRenderer.invoke("app:version"),
    isDefaultEditor: () => ipcRenderer.invoke("app:is-default-md"),
    setDefaultEditor: (value) => ipcRenderer.invoke("app:set-default-md", value),
    openConfig: () => ipcRenderer.invoke("app:open-config"),
    editAction: (action) => ipcRenderer.invoke("app:edit-action", action),
  },

  // Telemetry
  telemetry: {
    log: (event, details) =>
      ipcRenderer.invoke("telemetry:log", event, details),
  },

  // Dialogs
  dialog: {
    confirm: (title, message) => ipcRenderer.invoke("dialog:confirm", title, message),
  },

  // Workspace
  workspace: {
    openDialog: () => ipcRenderer.invoke("workspace:open-dialog"),
    init: (path, template) =>
      ipcRenderer.invoke("workspace:init", path, template),
    getDefault: () => ipcRenderer.invoke("workspace:get-default"),
    openDirectoryDialog: () => ipcRenderer.invoke("dialog:open-directory"),
    recents: () => ipcRenderer.invoke("workspace:recent-list"),
    addRecent: (path, name) =>
      ipcRenderer.invoke("workspace:recent-add", path, name),
    removeRecent: (path) => ipcRenderer.invoke("workspace:recent-remove", path),
  },

  // Files
  files: {
    openDialog: () => ipcRenderer.invoke("files:open-dialog"),
    list: (workspacePath) => ipcRenderer.invoke("files:list", workspacePath),
    tree: (workspacePath, opts) => ipcRenderer.invoke("files:tree", workspacePath, opts),
    read: (workspacePath, filePath) =>
      ipcRenderer.invoke("files:read", workspacePath, filePath),
    write: (workspacePath, filePath, content) =>
      ipcRenderer.invoke("files:write", workspacePath, filePath, content),
    writeBinary: (workspacePath, filePath, buffer) =>
      ipcRenderer.invoke("files:write-binary", workspacePath, filePath, buffer),
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
    getIndex: () => ipcRenderer.invoke("files:index"),
    onIndexUpdate: (cb) => { ipcRenderer.on("files:index-update", (_, idx) => cb(idx)) },
    offIndexUpdate: () => { ipcRenderer.removeAllListeners("files:index-update") },
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
    commitDiff: (workspacePath, filePath, oid) =>
      ipcRenderer.invoke("git:commit-diff", workspacePath, filePath, oid),
    readCommit: (workspacePath, filePath, oid) =>
      ipcRenderer.invoke("git:read-commit", workspacePath, filePath, oid),
    status: (workspacePath) => ipcRenderer.invoke("git:status", workspacePath),
    deleteBranch: (workspacePath, name) =>
      ipcRenderer.invoke("git:delete-branch", workspacePath, name),
    logAll: (workspacePath, filePath, branchList) =>
      ipcRenderer.invoke("git:log-all", workspacePath, filePath, branchList),
    fileStatus: (workspacePath, filePath) =>
      ipcRenderer.invoke("git:file-status", workspacePath, filePath),
    isFileTracked: (workspacePath, filePath) =>
      ipcRenderer.invoke("git:is-file-tracked", workspacePath, filePath),
    onBranchUpdate: (cb) => { ipcRenderer.on('git:branch-updated', () => cb()) },
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

  // Workspace find & replace
  workspaceSearch: {
    search: (params) => ipcRenderer.invoke("search:workspace", params),
    applyReplacement: (params) =>
      ipcRenderer.invoke("search:workspace-replace", params),
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
    onStats: (cb) => { ipcRenderer.on("share:stats", (_, stats) => cb(stats)) },
    offStats: (cb) => { ipcRenderer.removeListener("share:stats", cb) },
    onOpenPeer: (cb) => { ipcRenderer.on("share:open-peer", (_, data) => cb(data)) },
    startWorkspace: (workspacePath, options) => ipcRenderer.invoke("share:start-workspace", workspacePath, options),
    startAllWorkspaces: (workspaces, options) => ipcRenderer.invoke("share:start-all-workspaces", workspaces, options),
    stopWorkspace: (key) => ipcRenderer.invoke("share:stop-workspace", key),
    getWorkspaceStats: () => ipcRenderer.invoke("share:workspace-stats"),
    listActive: () => ipcRenderer.invoke("share:list-active"),
    onNetworkChanged: (cb) => { ipcRenderer.on("share:network-changed", () => cb()) },
    offNetworkChanged: (cb) => { ipcRenderer.removeListener("share:network-changed", cb) },
  },

  // Peers
  peers: {
    list: () => ipcRenderer.invoke("peers:list"),
    listDiscovered: () => ipcRenderer.invoke("peers:list-discovered"),
    favorite: (id) => ipcRenderer.invoke("peers:favorite", id),
    unfavorite: (id) => ipcRenderer.invoke("peers:unfavorite", id),
    fetchManifest: (id) => ipcRenderer.invoke("peers:fetch-manifest", id),
    openFile: (id, relPath, wsName) => ipcRenderer.invoke("peers:open-peer-file", id, relPath, wsName),
    onFound: (cb) => { ipcRenderer.on("peers:found", (_, peer) => cb(peer)) },
    offFound: (cb) => { ipcRenderer.removeListener("peers:found", cb) },
    onLost: (cb) => { ipcRenderer.on("peers:lost", (_, data) => cb(data)) },
    offLost: (cb) => { ipcRenderer.removeListener("peers:lost", cb) },
  },

  // Peer comments
  peerComments: {
    onReceived: (cb) => { ipcRenderer.on("comments:received", (_, data) => cb(data)) },
    offReceived: (cb) => { ipcRenderer.removeListener("comments:received", cb) },
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
    onAvailable: (cb) => {
      ipcRenderer.on("update:available", (_, info) => cb(info))
    },
    onDownloaded: (cb) => {
      ipcRenderer.on("update:downloaded", (_, info) => cb(info))
    },
    onProgress: (cb) => {
      ipcRenderer.on("update:progress", (_, progress) => cb(progress))
    },
    onError: (cb) => { ipcRenderer.on("update:error", (_, msg) => cb(msg)) },
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
    cancel: () => ipcRenderer.invoke("ai:cancel"),
    complete: (params) => ipcRenderer.invoke("ai:complete", params),
    onChunk: (cb) => { ipcRenderer.on("ai:chunk", (_, text) => cb(text)) },
    onToolCallDelta: (cb) => { ipcRenderer.on("ai:tool_call_delta", (_, deltas) => cb(deltas)) },
    onFinishReason: (cb) => { ipcRenderer.on("ai:finish_reason", (_, reason) => cb(reason)) },
    onDone: (cb) => { ipcRenderer.on("ai:done", () => cb()) },
    onError: (cb) => { ipcRenderer.on("ai:error", (_, msg) => cb(msg)) },
    removeListeners: () => {
      ipcRenderer.removeAllListeners("ai:chunk");
      ipcRenderer.removeAllListeners("ai:tool_call_delta");
      ipcRenderer.removeAllListeners("ai:finish_reason");
      ipcRenderer.removeAllListeners("ai:done");
      ipcRenderer.removeAllListeners("ai:error");
    },
  },

  menu: {
    onOpenSettings: (cb) => { ipcRenderer.on("menu:open-settings", () => cb()) },
    onNewWorkspace: (cb) => { ipcRenderer.on("menu:new-workspace", (_, path) => cb(path)) },
    onOpenWorkspace: (cb) => { ipcRenderer.on("menu:open-workspace", (_, path) => cb(path)) },
    onOpenFile: (cb) => { ipcRenderer.on("menu:open-file", (_, path) => cb(path)) },
    onChangeTheme: (cb) => { ipcRenderer.on("menu:change-theme", (_, theme) => cb(theme)) },
    onChangeFont: (cb) => { ipcRenderer.on("menu:change-font", (_, font) => cb(font)) },
    onReloadConfig: (cb) => { ipcRenderer.on("menu:reload-config", () => cb()) },
  },

  // Agent session bridge
  agentSession: {
    onSessionStart: (cb) => { ipcRenderer.on('agent:session-start', (_, data) => cb(data)) },
    onComment: (cb) => { ipcRenderer.on('agent:comment', (_, data) => cb(data)) },
    onActivity: (cb) => { ipcRenderer.on('agent:activity', (_, data) => cb(data)) },
    onSessionCancel: (cb) => { ipcRenderer.on('agent:session-cancel', (_, data) => cb(data)) },
    onSessionDone: (cb) => { ipcRenderer.on('agent:session-done', (_, data) => cb(data)) },
    submit: (params) => ipcRenderer.invoke('agent:submit', params),
    cancel: (sessionId) => ipcRenderer.invoke('agent:cancel', sessionId),
    removeListeners: () => {
      ipcRenderer.removeAllListeners('agent:session-start')
      ipcRenderer.removeAllListeners('agent:comment')
      ipcRenderer.removeAllListeners('agent:session-cancel')
      ipcRenderer.removeAllListeners('agent:session-done')
    },
  },

  // AI Control — agent management, sessions, MCP registration
  agentControl: {
    // Presets
    getPresets: () => ipcRenderer.invoke('agent-control:get-presets'),
    getModels: (agentId) => ipcRenderer.invoke('agent-control:get-models', agentId),
    checkInstalled: (agentId) => ipcRenderer.invoke('agent-control:check-installed', agentId),

    // Custom agents
    getCustomAgents: () => ipcRenderer.invoke('agent-control:get-custom-agents'),
    addCustomAgent: (config) => ipcRenderer.invoke('agent-control:add-custom-agent', config),
    removeCustomAgent: (id) => ipcRenderer.invoke('agent-control:remove-custom-agent', id),

    // Sessions
    startSession: (params) => ipcRenderer.invoke('agent-control:start-session', params),
    sendMessage: (params) => ipcRenderer.invoke('agent-control:send-message', params),
    resume: (params) => ipcRenderer.invoke('agent-control:resume', params),
    stopSession: (sessionId) => ipcRenderer.invoke('agent-control:stop-session', sessionId),
    openInTerminal: (params) => ipcRenderer.invoke('agent-control:open-terminal', params),
    popOutTerminal: (params) => ipcRenderer.invoke('pty:popout', params),

    // Embedded PTY terminal — agent runs its native interactive TUI inside Canonic.
    ptySpawn: (params) => ipcRenderer.invoke('pty:spawn', params),
    ptyInput: (params) => ipcRenderer.invoke('pty:input', params),
    ptyResize: (params) => ipcRenderer.invoke('pty:resize', params),
    ptyKill: (params) => ipcRenderer.invoke('pty:kill', params),
    onPtyData: (cb) => { ipcRenderer.removeAllListeners('pty:data'); ipcRenderer.on('pty:data', (_, data) => cb(data)) },
    onPtyExit: (cb) => { ipcRenderer.removeAllListeners('pty:exit'); ipcRenderer.on('pty:exit', (_, data) => cb(data)) },

    // Session events (main → renderer). Each registration replaces any prior listener
    // on the same channel — otherwise a re-run of the renderer setup (HMR in dev, store
    // re-init) stacks listeners and every stdout chunk gets handled N times = dup output.
    onStdout: (cb) => { ipcRenderer.removeAllListeners('agent-control:stdout'); ipcRenderer.on('agent-control:stdout', (_, data) => cb(data)) },
    onStderr: (cb) => { ipcRenderer.removeAllListeners('agent-control:stderr'); ipcRenderer.on('agent-control:stderr', (_, data) => cb(data)) },
    onExit: (cb) => { ipcRenderer.removeAllListeners('agent-control:exit'); ipcRenderer.on('agent-control:exit', (_, data) => cb(data)) },
    onError: (cb) => { ipcRenderer.removeAllListeners('agent-control:error'); ipcRenderer.on('agent-control:error', (_, data) => cb(data)) },
    onCopyToClipboard: (cb) => { ipcRenderer.removeAllListeners('agent-control:copy-to-clipboard'); ipcRenderer.on('agent-control:copy-to-clipboard', (_, data) => cb(data)) },
    onTerminalCommand: (cb) => { ipcRenderer.removeAllListeners('agent-control:terminal-command'); ipcRenderer.on('agent-control:terminal-command', (_, data) => cb(data)) },
    onCommentsIngested: (cb) => { ipcRenderer.removeAllListeners('agent-control:comments-ingested'); ipcRenderer.on('agent-control:comments-ingested', (_, data) => cb(data)) },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('agent-control:stdout')
      ipcRenderer.removeAllListeners('agent-control:stderr')
      ipcRenderer.removeAllListeners('agent-control:exit')
      ipcRenderer.removeAllListeners('agent-control:error')
      ipcRenderer.removeAllListeners('agent-control:copy-to-clipboard')
      ipcRenderer.removeAllListeners('agent-control:terminal-command')
      ipcRenderer.removeAllListeners('agent-control:comments-ingested')
      ipcRenderer.removeAllListeners('pty:data')
      ipcRenderer.removeAllListeners('pty:exit')
    },

    // History
    getHistory: () => ipcRenderer.invoke('agent-control:get-history'),
    saveHistory: (session) => ipcRenderer.invoke('agent-control:save-history', session),
    deleteHistory: (sessionId) => ipcRenderer.invoke('agent-control:delete-history', sessionId),

    // Push live editor state (focused doc + open tray) to the MCP server.
    setEditorState: (state) => ipcRenderer.invoke('mcp:set-editor-state', state),

    // MCP registration
    getMcpPort: () => ipcRenderer.invoke('agent-control:get-mcp-port'),
    checkMcp: (agentId) => ipcRenderer.invoke('agent-control:check-mcp', agentId),
    registerMcp: (params) => ipcRenderer.invoke('agent-control:register-mcp', params),
    optOutMcp: (agentId) => ipcRenderer.invoke('agent-control:opt-out-mcp', agentId),

    // Folder picker
    pickDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  },
});
