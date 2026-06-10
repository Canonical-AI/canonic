import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const activeListeners = new Map();

async function addListener(channel, cb) {
  if (activeListeners.has(channel)) {
    activeListeners.get(channel)();
    activeListeners.delete(channel);
  }
  const unlisten = await listen(channel, (event) => {
    // Map event payload structure to match what electron sends (often just the data as first param)
    cb(event.payload);
  });
  activeListeners.set(channel, unlisten);
}

function removeListener(channel) {
  if (activeListeners.has(channel)) {
    activeListeners.get(channel)();
    activeListeners.delete(channel);
  }
}

window.canonic = {
  // Config
  config: {
    read: () => invoke('config_read'),
    write: (config) => invoke('config_write', { config }),
    exists: () => invoke('config_exists'),
    validate: (config) => invoke('config_validate', { config }),
  },

  // App
  app: {
    getVersion: () => invoke('app_version'),
    isDefaultEditor: () => invoke('app_is_default_md'),
    setDefaultEditor: (value) => invoke('app_set_default_md', { value }),
    openConfig: () => invoke('app_open_config'),
    editAction: (action) => invoke('app_edit_action', { action }),
    // Pin the native macOS window appearance to the active theme's scheme
    // ("dark" | "light") so vibrancy/titlebar/menus follow the theme, not the OS.
    setWindowTheme: (scheme) => invoke('set_window_theme', { scheme }),
  },

  // Telemetry
  telemetry: {
    log: (event, details) => invoke('telemetry_log', { event, details }),
  },

  // Dialogs
  dialog: {
    confirm: (title, message) => invoke('dialog_confirm', { title, message }),
  },

  // Workspace
  workspace: {
    openDialog: () => invoke('workspace_open_dialog'),
    init: (path, template) => invoke('workspace_init', { path, template }),
    getDefault: () => invoke('workspace_get_default'),
    openDirectoryDialog: () => invoke('dialog_open_directory'),
    recents: () => invoke('workspace_recent_list'),
    addRecent: (path, name) => invoke('workspace_recent_add', { path, name }),
    removeRecent: (path) => invoke('workspace_recent_remove', { path }),
  },

  // Files
  files: {
    openDialog: () => invoke('files_open_dialog'),
    list: (workspacePath) => invoke('files_list', { workspacePath }),
    tree: (workspacePath, opts) => invoke('files_tree', { workspacePath, opts }),
    read: (workspacePath, filePath) => invoke('files_read', { workspacePath, filePath }),
    write: (workspacePath, filePath, content) => invoke('files_write', { workspacePath, filePath, content }),
    writeBinary: (workspacePath, filePath, buffer) => invoke('files_write_binary', { workspacePath, filePath, buffer }),
    delete: (workspacePath, filePath) => invoke('files_delete', { workspacePath, filePath }),
    newDoc: (workspacePath, fileName) => invoke('files_new', { workspacePath, fileName }),
    mkdir: (workspacePath, dirPath) => invoke('files_mkdir', { workspacePath, dirPath }),
    rmdir: (workspacePath, dirPath) => invoke('files_rmdir', { workspacePath, dirPath }),
    move: (workspacePath, oldPath, newPath) => invoke('files_move', { workspacePath, oldPath, newPath }),
    getIndex: () => invoke('files_index'),
    onIndexUpdate: (cb) => addListener('files:index-update', cb),
    offIndexUpdate: () => removeListener('files:index-update'),
    trash: {
      delete: (workspacePath, itemPath, isDirectory) => invoke('files_trash_delete', { workspacePath, itemPath, isDirectory }),
      list: (workspacePath) => invoke('files_trash_list', { workspacePath }),
      restore: (workspacePath, id) => invoke('files_trash_restore', { workspacePath, id }),
      purge: (workspacePath, id) => invoke('files_trash_purge', { workspacePath, id }),
    },
  },

  // Git
  git: {
    commit: (workspacePath, filePath, message) => invoke('git_commit', { workspacePath, filePath, message }),
    log: (workspacePath, filePath) => invoke('git_log', { workspacePath, filePath }),
    branches: (workspacePath) => invoke('git_branches', { workspacePath }),
    createBranch: (workspacePath, name) => invoke('git_create_branch', { workspacePath, name }),
    checkout: (workspacePath, name) => invoke('git_checkout', { workspacePath, name }),
    merge: (workspacePath, from, message) => invoke('git_merge', { workspacePath, from, message }),
    diff: (workspacePath, filePath, oid) => invoke('git_diff', { workspacePath, filePath, oid }),
    commitDiff: (workspacePath, filePath, oid) => invoke('git_commit_diff', { workspacePath, filePath, oid }),
    readCommit: (workspacePath, filePath, oid) => invoke('git_read_commit', { workspacePath, filePath, oid }),
    status: (workspacePath) => invoke('git_status', { workspacePath }),
    deleteBranch: (workspacePath, name) => invoke('git_delete_branch', { workspacePath, name }),
    logAll: (workspacePath, filePath, branchList) => invoke('git_log_all', { workspacePath, filePath, branchList }),
    fileStatus: (workspacePath, filePath) => invoke('git_file_status', { workspacePath, filePath }),
    isFileTracked: (workspacePath, filePath) => invoke('git_is_file_tracked', { workspacePath, filePath }),
    onBranchUpdate: (cb) => addListener('git:branch-updated', cb),
  },

  // Comments
  comments: {
    get: (docId) => invoke('comments_get', { docId }),
    save: (docId, comments) => invoke('comments_save', { docId, comments }),
    move: (oldId, newId) => invoke('comments_move', { oldId, newId }),
  },

  // Search
  search: {
    query: (query, workspacePath) => invoke('search_query', { query, workspacePath }),
    index: (workspacePath, filePath, content) => invoke('search_index', { workspacePath, filePath, content }),
  },

  // Workspace find & replace
  workspaceSearch: {
    search: (params) => invoke('search_workspace', { params }),
    applyReplacement: (params) => invoke('search_workspace_replace', { params }),
  },

  // Sharing
  share: {
    start: (workspacePath, filePath, options) => invoke('share_start', { workspacePath, filePath, options }),
    stop: (filePath) => invoke('share_stop', { filePath }),
    openLink: (url) => invoke('share_open_link', { url }),
    openShared: (url, token) => invoke('share_open_shared', { url, token }),
    getStats: (filePath) => invoke('share_stats', { filePath }),
    onStats: (cb) => addListener('share:stats', cb),
    offStats: (cb) => removeListener('share:stats'),
    onOpenPeer: (cb) => addListener('share:open-peer', cb),
    startWorkspace: (workspacePath, options) => invoke('share_start_workspace', { workspacePath, options }),
    startAllWorkspaces: (workspaces, options) => invoke('share_start_all_workspaces', { workspaces, options }),
    stopWorkspace: (key) => invoke('share_stop_workspace', { key }),
    getWorkspaceStats: () => invoke('share_workspace_stats'),
    listActive: () => invoke('share_list_active'),
    onNetworkChanged: (cb) => addListener('share:network-changed', cb),
    offNetworkChanged: (cb) => removeListener('share:network-changed'),
  },

  // Peers
  peers: {
    list: () => invoke('peers_list'),
    listDiscovered: () => invoke('peers_list_discovered'),
    favorite: (id) => invoke('peers_favorite', { id }),
    unfavorite: (id) => invoke('peers_unfavorite', { id }),
    fetchManifest: (id) => invoke('peers_fetch_manifest', { id }),
    openFile: (id, relPath, wsName) => invoke('peers_open_file', { id, relPath, wsName }),
    onFound: (cb) => addListener('peers:found', cb),
    offFound: (cb) => removeListener('peers:found'),
    onLost: (cb) => addListener('peers:lost', cb),
    offLost: (cb) => removeListener('peers:lost'),
  },

  // Peer comments
  peerComments: {
    onReceived: (cb) => addListener('comments:received', cb),
    offReceived: (cb) => removeListener('comments:received'),
  },

  // Cleanup / Uninstall
  cleanup: {
    resetConfig: () => invoke('cleanup_reset_config'),
    deleteWorkspace: (path) => invoke('cleanup_delete_workspace', { path }),
    getPaths: () => invoke('cleanup_get_paths'),
  },

  // Demo workspace lifecycle
  demo: {
    register: (path) => invoke('demo_register', { path }),
    cleanup: () => invoke('demo_cleanup'),
  },

  // Updates
  update: {
    check: () => invoke('update_check'),
    download: () => invoke('update_download'),
    install: () => invoke('update_install'),
    onAvailable: (cb) => addListener('update:available', cb),
    onDownloaded: (cb) => addListener('update:downloaded', cb),
    onProgress: (cb) => addListener('update:progress', cb),
    onError: (cb) => addListener('update:error', cb),
  },

  // Doc branch manifest
  docBranches: {
    get: (workspacePath) => invoke('doc_branches_get', { workspacePath }),
    set: (workspacePath, data) => invoke('doc_branches_set', { workspacePath, data }),
  },

  // Doc versions
  versions: {
    list: (workspacePath, filePath) => invoke('versions_list', { workspacePath, filePath }),
    save: (workspacePath, filePath, name, oid, message) => invoke('versions_save', { workspacePath, filePath, name, oid, message }),
    delete: (workspacePath, filePath, versionName) => invoke('versions_delete', { workspacePath, filePath, versionName }),
  },

  // AI
  ai: {
    chat: (params) => invoke('ai_chat', { params }),
    cancel: () => invoke('ai_cancel'),
    complete: (params) => invoke('ai_complete', { params }),
    onChunk: (cb) => addListener('ai:chunk', cb),
    onToolCallDelta: (cb) => addListener('ai:tool_call_delta', cb),
    onFinishReason: (cb) => addListener('ai:finish_reason', cb),
    onDone: (cb) => addListener('ai:done', cb),
    onError: (cb) => addListener('ai:error', cb),
    removeListeners: () => {
      removeListener('ai:chunk');
      removeListener('ai:tool_call_delta');
      removeListener('ai:finish_reason');
      removeListener('ai:done');
      removeListener('ai:error');
    },
  },

  // Menu events
  menu: {
    onOpenSettings: (cb) => addListener('menu:open-settings', cb),
    onNewWorkspace: (cb) => addListener('menu:new-workspace', cb),
    onOpenWorkspace: (cb) => addListener('menu:open-workspace', cb),
    onOpenFile: (cb) => addListener('menu:open-file', cb),
    onChangeTheme: (cb) => addListener('menu:change-theme', cb),
    onChangeFont: (cb) => addListener('menu:change-font', cb),
    onReloadConfig: (cb) => addListener('menu:reload-config', cb),
  },

  // Agent session bridge
  agentSession: {
    onSessionStart: (cb) => addListener('agent:session-start', cb),
    onComment: (cb) => addListener('agent:comment', cb),
    onActivity: (cb) => addListener('agent:activity', cb),
    onSessionCancel: (cb) => addListener('agent:session-cancel', cb),
    onSessionDone: (cb) => addListener('agent:session-done', cb),
    onFileSaved: (cb) => addListener('agent:file-saved', cb),
    submit: (params) => invoke('agent_submit', { params }),
    cancel: (sessionId) => invoke('agent_cancel', { sessionId }),
    removeListeners: () => {
      removeListener('agent:session-start');
      removeListener('agent:comment');
      removeListener('agent:session-cancel');
      removeListener('agent:session-done');
      removeListener('agent:file-saved');
    },
  },

  // AI Control / PTY
  agentControl: {
    getPresets: () => invoke('agent_control_get_presets'),
    // The store calls these with an object ({ agentId }) that already IS the named-args
    // map — pass it straight through to invoke (don't double-wrap).
    getModels: (args) => invoke('agent_control_get_models', args),
    checkInstalled: (agentId) => invoke('agent_control_check_installed', { agentId }),
    getCustomAgents: () => invoke('agent_control_get_custom_agents'),
    addCustomAgent: (config) => invoke('agent_control_add_custom_agent', { config }),
    removeCustomAgent: (id) => invoke('agent_control_remove_custom_agent', { id }),
    startSession: (params) => invoke('agent_control_start_session', { params }),
    sendMessage: (params) => invoke('agent_control_send_message', { params }),
    resume: (params) => invoke('agent_control_resume', { params }),
    stopSession: (args) => invoke('agent_control_stop_session', args),
    openInTerminal: (params) => invoke('agent_control_open_terminal', { params }),
    popOutTerminal: (params) => invoke('pty_popout', { params }),

    // Embedded PTY
    ptySpawn: (params) => invoke('pty_spawn', { params }),
    ptyInput: (params) => invoke('pty_input', { params }),
    ptyResize: (params) => invoke('pty_resize', { params }),
    ptyKill: (params) => invoke('pty_kill', { params }),
    onPtyData: (cb) => addListener('pty:data', cb),
    onPtyExit: (cb) => addListener('pty:exit', cb),

    // Event streams
    onStdout: (cb) => addListener('agent-control:stdout', cb),
    onStderr: (cb) => addListener('agent-control:stderr', cb),
    onExit: (cb) => addListener('agent-control:exit', cb),
    onError: (cb) => addListener('agent-control:error', cb),
    onCopyToClipboard: (cb) => addListener('agent-control:copy-to-clipboard', cb),
    onTerminalCommand: (cb) => addListener('agent-control:terminal-command', cb),
    onCommentsIngested: (cb) => addListener('agent-control:comments-ingested', cb),
    removeListeners: () => {
      removeListener('agent-control:stdout');
      removeListener('agent-control:stderr');
      removeListener('agent-control:exit');
      removeListener('agent-control:error');
      removeListener('agent-control:copy-to-clipboard');
      removeListener('agent-control:terminal-command');
      removeListener('agent-control:comments-ingested');
      removeListener('pty:data');
      removeListener('pty:exit');
    },

    getHistory: () => invoke('agent_control_get_history'),
    // Store passes objects that already are the named-args map — pass through, don't re-wrap.
    saveHistory: (args) => invoke('agent_control_save_history', args),
    deleteHistory: (args) => invoke('agent_control_delete_history', args),
    setEditorState: (state) => invoke('mcp_set_editor_state', { state }),
    getMcpPort: () => invoke('agent_control_get_mcp_port'),
    checkMcp: (args) => invoke('agent_control_check_mcp', args),
    registerMcp: (params) => invoke('agent_control_register_mcp', { params }),
    optOutMcp: (args) => invoke('agent_control_opt_out_mcp', args),
    pickDirectory: () => invoke('dialog_open_directory'),
  },
  // Backup
  backup: {
    getConfig: () => invoke('backup_get_config'),
    setConfig: (config) => invoke('backup_set_config', { backupConfig: config }),
    getWorkspaceConfig: (workspacePath) => invoke('backup_get_workspace_config', { workspacePath }),
    setWorkspaceConfig: (workspacePath, config) => invoke('backup_set_workspace_config', { workspacePath, backupConfig: config }),
    run: (workspacePath) => invoke('backup_run', { workspacePath }),
    list: (workspacePath) => invoke('backup_list', { workspacePath }),
    restore: (workspacePath, filename) => invoke('backup_restore', { workspacePath, filename }),
    delete: (workspacePath, filename) => invoke('backup_delete', { workspacePath, filename }),
    startAuto: (workspacePath) => invoke('backup_start_auto', { workspacePath }),
    stopAuto: () => invoke('backup_stop_auto'),
    onCompleted: (cb) => addListener('backup:completed', cb),
    offCompleted: () => removeListener('backup:completed'),
  },
};
