import { defineStore } from "pinia";
import { ref, reactive, computed, watch } from "vue";
import demoConfig from "../demo/config.json";
import { storage } from "../utils/storage.js";

export const useAppStore = defineStore("app", () => {
  // ==========================================
  // ── WORKSPACE INITIALIZATION & HISTORY ──
  // ==========================================
  const workspacePath = ref(null);
  const workspaceName = ref(null);
  const recentWorkspaces = ref(
    JSON.parse(storage.getItem("canonic:recentWorkspaces") || "[]"),
  );

  // ==========================================
  // ── ACTIVE DOCUMENT & FILE TREE ──
  // ==========================================
  const files = ref([]);
  const currentFile = ref(null);
  const currentContent = ref("");

  // ── Tree keyboard navigation (yazi-style) ──
  const treeFocused = ref(false);
  const treeFilter = ref("");
  const treeFocusIndex = ref(0);
  const treeUndoStack = ref([]); // { id, originalPath, isDirectory } — for Ctrl+Z undo

  // ── Persisted open directories ──
  const TREE_OPEN_KEY = "canonic:treeOpenDirs";
  const treeOpenDirs = ref(
    new Set(JSON.parse(storage.getItem(TREE_OPEN_KEY) || "[]"))
  );

  // Walk the file tree and apply _open state from the persisted set
  function applyOpenDirs(items) {
    if (!items) return;
    const openSet = treeOpenDirs.value;
    for (const item of items) {
      if (item.type === "directory") {
        item._open = openSet.has(item.path);
        if (item.children) applyOpenDirs(item.children);
      }
    }
  }

  // Persist and apply a directory's open/closed state
  function setTreeDirOpen(path, open) {
    if (open) {
      treeOpenDirs.value.add(path);
    } else {
      treeOpenDirs.value.delete(path);
    }
    storage.setItem(TREE_OPEN_KEY, JSON.stringify([...treeOpenDirs.value]));
    applyOpenDirs(files.value);
  }

  // Flat list of visible tree nodes (respects collapsed state) for keyboard nav.
  // Uses original item references so _open mutations propagate back to files.value.
  const flatVisibleTree = computed(() => {
    const out = [];
    const walk = (items, depth) => {
      for (const item of items || []) {
        item._depth = depth;
        out.push(item);
        if (item.type === "directory" && item.children && item._open) {
          walk(item.children, depth + 1);
        }
      }
    };
    walk(files.value, 0);
    return out;
  });

  // Top 5 matches for the quick-filter dropdown (searches ALL files, ignores collapse)
  const treeFilterMatches = computed(() => {
    const filter = treeFilter.value.trim().toLowerCase();
    if (!filter) return [];
    const matches = [];
    const walk = (items) => {
      for (const item of items || []) {
        const name = (item.name || "").toLowerCase();
        if (name.includes(filter)) {
          matches.push({ path: item.path, name: item.name, type: item.type });
        }
        if (item.children) walk(item.children);
      }
    };
    walk(files.value);
    return matches.slice(0, 5);
  });

  // Navigate to a specific path: expand parent directories, then focus the item
  function navigateToPath(targetPath) {
    // Expand all ancestor directories
    const expandAncestors = (items, target) => {
      for (const item of items || []) {
        if (item.type === "directory" && target.startsWith(item.path + "/")) {
          item._open = true;
          if (item.children) expandAncestors(item.children, target);
          return;
        }
        if (item.path === target) return;
      }
    };
    expandAncestors(files.value, targetPath);

    // Now find the item in the flat visible list
    const list = flatVisibleTree.value;
    for (let i = 0; i < list.length; i++) {
      if (list[i].path === targetPath) {
        treeFocusIndex.value = i;
        treeFocused.value = true;
        return;
      }
    }
    // Target not found (e.g. deleted while the filter dropdown was open).
    // Reset focus to the root so the tree is in a known-good state.
    treeFocusIndex.value = 0;
    treeFocused.value = true;
  }

  // ==========================================
  // ── SPLIT REFERENCE PANES & INTERFACE ──
  // ==========================================
  // Split panels: file paths of the editable reference panes shown beside the primary editor
  const refPanes = ref([]);
  // Which pane currently has editing focus: 'main' for the primary editor, or a
  // ref-pane file path. Drives the active-pane highlight and Cmd+S routing.
  const activePane = ref("main");
  // Flat list of every doc in the workspace — used by the split-panel quicksearch switcher
  const flatDocList = computed(() => {
    const out = [];
    const walk = (items) => {
      for (const it of items || []) {
        if (it.type === "file") out.push({ path: it.path, name: it.name });
        else if (it.children) walk(it.children);
      }
    };
    walk(files.value);
    return out;
  });

  // ── Tree navigation actions ──
  function focusTree() {
    treeFocused.value = true;
    treeFocusIndex.value = 0;
  }

  function blurTree() {
    treeFocused.value = false;
  }

  function navigateTree(direction) {
    const list = flatVisibleTree.value;
    if (list.length === 0) return;
    if (direction === "up") {
      treeFocusIndex.value = (treeFocusIndex.value - 1 + list.length) % list.length;
    } else if (direction === "down") {
      treeFocusIndex.value = (treeFocusIndex.value + 1) % list.length;
    }
  }

  function expandCollapseTree(action) {
    const list = flatVisibleTree.value;
    const idx = treeFocusIndex.value;
    if (idx < 0 || idx >= list.length) return;
    const item = list[idx];
    if (item.type !== "directory") return;

    if (action === "expand" && !item._open) {
      setTreeDirOpen(item.path, true);
    } else if (action === "collapse" && item._open) {
      setTreeDirOpen(item.path, false);
    } else if (action === "toggle") {
      setTreeDirOpen(item.path, !item._open);
    }
  }

  function openFocused() {
    const list = flatVisibleTree.value;
    const idx = treeFocusIndex.value;
    if (idx < 0 || idx >= list.length) return;
    const item = list[idx];
    if (item.type === "directory") {
      expandCollapseTree("toggle");
    } else {
      openFile(item.path);
    }
  }

  function leftOnTree() {
    const list = flatVisibleTree.value;
    const idx = treeFocusIndex.value;
    if (idx < 0 || idx >= list.length) return;
    const item = list[idx];
    if (item.type === "directory" && item._open) {
      // Collapse expanded directory
      setTreeDirOpen(item.path, false);
    } else if (item.type === "file" || (item.type === "directory" && !item._open)) {
      // Move to parent directory
      const parentPath = item.path.includes("/") ? item.path.split("/").slice(0, -1).join("/") : "";
      if (!parentPath) {
        treeFocusIndex.value = 0;
        return;
      }
      for (let i = 0; i < list.length; i++) {
        if (list[i].path === parentPath && list[i].type === "directory") {
          treeFocusIndex.value = i;
          return;
        }
      }
    }
  }

  function rightOnTree() {
    const list = flatVisibleTree.value;
    const idx = treeFocusIndex.value;
    if (idx < 0 || idx >= list.length) return;
    const item = list[idx];
    if (item.type === "directory") {
      if (!item._open) {
        setTreeDirOpen(item.path, true);
      } else {
        // Move to first child if any
        const nextIdx = idx + 1;
        if (nextIdx < list.length && list[nextIdx]._depth > item._depth) {
          treeFocusIndex.value = nextIdx;
        }
      }
    } else {
      openFile(item.path);
    }
  }

  async function trashFocused() {
    const list = flatVisibleTree.value;
    const idx = treeFocusIndex.value;
    if (idx < 0 || idx >= list.length) return;
    const item = list[idx];
    try {
      if (item.type === "file") {
        // Capture info before deleting
        const trashEntry = { path: item.path, isDirectory: false };
        await api.files.trash.delete(workspacePath.value, item.path, false);
        treeUndoStack.value.push(trashEntry);
        if (currentFile.value === item.path) {
          currentFile.value = null;
        }
        await refreshFiles();
      } else {
        const trashEntry = { path: item.path, isDirectory: true };
        await api.files.trash.delete(workspacePath.value, item.path, true);
        treeUndoStack.value.push(trashEntry);
        if (currentFile.value?.startsWith(item.path)) {
          currentFile.value = null;
        }
        await refreshFiles();
      }
      // Clamp focus index
      if (treeFocusIndex.value >= flatVisibleTree.value.length) {
        treeFocusIndex.value = Math.max(0, flatVisibleTree.value.length - 1);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error("[Store] trashFocused failed:", err);
    }
  }

  async function undoLastTrash() {
    if (treeUndoStack.value.length === 0) return;
    const entry = treeUndoStack.value.pop();
    try {
      // Find the trash item by original path and restore it
      await loadTrash();
      const match = trashItems.value.find(t => t.originalPath === entry.path);
      if (match) {
        await api.files.trash.restore(workspacePath.value, match.id);
        await refreshFiles();
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error("[Store] undoLastTrash failed:", err);
    }
  }

  function setTreeFilter(text) {
    treeFilter.value = text;
    treeFocusIndex.value = 0;
  }

  const treeShowMoveFor = ref(null); // path of item to show move dropdown for

  function moveFocused() {
    const list = flatVisibleTree.value;
    const idx = treeFocusIndex.value;
    if (idx < 0 || idx >= list.length) return;
    treeShowMoveFor.value = list[idx].path;
  }

  // ==========================================
  // ── GIT VERSIONING & REPOSITORY STATE ──
  // ==========================================
  const branches = ref([]);
  const currentBranch = ref("main");
  const isExternalRepo = ref(false);
  const commitLog = ref([]);
  const fileIsUncommitted = ref(false);
  const isDirty = ref(false);
  const unsavedBuffer = reactive({});
  const isLoading = ref(false);

  // ==========================================
  // ── INLINE COMMENTS ──
  // ==========================================
  const comments = ref([]);

  // ==========================================
  // ── PEER-TO-PEER SHARING ──
  // ==========================================
  // Per-file share state — persists across doc switches
  const sharesByFile = reactive({}); // filePath -> shareInfo object
  const shareStatsByFile = reactive({}); // filePath -> { reads, connected }
  const shareInfo = computed(() => sharesByFile[currentFile.value] || null);
  const shareStats = computed(
    () => shareStatsByFile[currentFile.value] || { reads: 0, connected: 0 },
  );

  // Workspace-level share (separate from per-doc)
  const WORKSPACE_KEY = "__workspace__";
  const workspaceShareInfo = computed(
    () => sharesByFile[WORKSPACE_KEY] || null,
  );
  const workspaceShareStats = computed(
    () => shareStatsByFile[WORKSPACE_KEY] || { reads: 0, connected: 0 },
  );

  // ==========================================
  // ── SYSTEM CONFIG & PREFERENCES ──
  // ==========================================
  const config = ref(null);
  const sidebarTab = ref("files");
  const rightPanelTab = ref("comments");

  const isSmallScreen = ref(false);
  if (
    typeof window !== "undefined" &&
    typeof window.addEventListener === "function"
  ) {
    const checkSize = () => {
      isSmallScreen.value = window.innerWidth < 768;
    };
    checkSize();
    window.addEventListener("resize", checkSize);
  }

  const distractionFreeMode = ref(
    storage.getItem("canonic:distractionFreeMode") === "true",
  );
  watch(distractionFreeMode, (val) => {
    storage.setItem("canonic:distractionFreeMode", String(val));
  });

  const isCompactLayout = computed(() => isSmallScreen.value);

  // Window transparency preference (set from config in applyAppearanceSettings).
  const _transparencyPref = ref(false);
  watch(
    _transparencyPref,
    (on) => {
      document.documentElement.classList.toggle("window-transparency", on);
    },
    { immediate: true },
  );
  // Compact layout floats panels/tooltips over content. CSS uses this class to
  // re-opaque those surfaces while keeping the main background transparent.
  watch(
    isCompactLayout,
    (compact) => {
      document.documentElement.classList.toggle("compact-layout", compact);
    },
    { immediate: true },
  );

  const sidebarCollapsed = ref(
    storage.getItem("canonic:sidebarCollapsed") === "true",
  );
  watch(sidebarCollapsed, (val) => {
    storage.setItem("canonic:sidebarCollapsed", String(val));
  });
  const rightPanelCollapsed = ref(
    storage.getItem("canonic:rightPanelCollapsed") !== "false",
  );
  watch(rightPanelCollapsed, (val) => {
    storage.setItem("canonic:rightPanelCollapsed", String(val));
  });
  const showLineNumbers = ref(
    storage.getItem("canonic:line-numbers") === "true",
  );
  if (showLineNumbers.value) {
    document.documentElement.setAttribute("data-line-numbers", "true");
  }
  watch(showLineNumbers, (val) => {
    storage.setItem("canonic:line-numbers", String(val));
    if (val) {
      document.documentElement.setAttribute("data-line-numbers", "true");
    } else {
      document.documentElement.removeAttribute("data-line-numbers");
    }
  });
  // Split panels: true = stacked top/bottom (default), false = side by side
  const splitStacked = ref(storage.getItem("canonic:splitStacked") !== "false");
  watch(splitStacked, (val) => {
    storage.setItem("canonic:splitStacked", String(val));
  });

  // Editor tabs: ordered list of open file paths (session-only, oldest-first)
  const openTabs = ref([]);
  // Tabs prefs cached in localStorage so first paint matches config; config wins on load
  const tabsEnabled = ref(storage.getItem("canonic:tabsEnabled") !== "false");
  const tabsPosition = ref(storage.getItem("canonic:tabsPosition") || "bottom");
  watch(tabsEnabled, (val) => {
    storage.setItem("canonic:tabsEnabled", String(val));
  });
  watch(tabsPosition, (val) => {
    storage.setItem("canonic:tabsPosition", val);
  });

  function addTab(filePath) {
    if (!filePath) return;
    if (!openTabs.value.includes(filePath)) {
      openTabs.value.push(filePath);
    }
  }

  function closeTab(filePath) {
    const idx = openTabs.value.indexOf(filePath);
    if (idx === -1) return;
    openTabs.value.splice(idx, 1);
    if (currentFile.value === filePath) {
      const next = openTabs.value[idx] || openTabs.value[idx - 1] || null;
      if (next) {
        openFile(next);
      } else {
        currentFile.value = null;
        currentContent.value = "";
        isDirty.value = false;
      }
    }
  }

  // ==========================================
  // ── VERSION SNAPSHOTS & TRASH ──
  // ==========================================
  const docVersions = ref([]);
  const docBranchMap = ref({}); // { 'path/to/file.md': { activeBranch: 'branch', branches: ['branch'] } }
  const trashItems = ref([]);

  // ==========================================
  // ── DEMO MODE ──
  // ==========================================
  const isDemoMode = ref(false);
  const demoWorkspaceDir = ref(null); // throwaway demo dir, cleaned on exit/leave
  const demoPeers = ref([]);
  const demoFiles = ref({});
  const _demoComments = ref({});

  // ==========================================
  // ── SEARCH INTERFACE ──
  // ==========================================
  const searchResults = ref([]);
  const searchViewOpen = ref(false);

  // Workspace find & replace state
  const wsSearch = reactive({
    query: "",
    replace: "",
    include: "",
    exclude: "",
    opts: { case: false, word: false, regex: false },
    allBranches: false,
    results: { branch: [], other: [] },
    searching: false,
    lastError: "",
    pendingFocus: null, // { filePath, line } — UI consumes to scroll editor
  });

  const FIND_HOTKEY_DEFAULTS = {
    findInDoc: "Mod-f",
    findInWorkspace: "Mod-Shift-f",
    findNext: "Mod-g",
    findPrev: "Mod-Shift-g",
  };

  const findHotkeys = computed(() => {
    const cfgKeys = config.value?.hotkeys || {};
    const merged = {};
    for (const k of Object.keys(FIND_HOTKEY_DEFAULTS)) {
      merged[k] = cfgKeys[k] || FIND_HOTKEY_DEFAULTS[k];
    }
    return merged;
  });

  const agentSession = ref(null); // null | { sessionId, agentName, file, startedAt }
  const agentActivity = ref(null); // null | { activityType, label }
  const actionPickerOpen = ref(false);

  // ── AI Control: Agent configuration ─────────────────────────────────────
  const agentPresets = ref([])         // loaded from main process: [{ id, name, binary, installHint, installed }]
  const configuredAgents = ref([])     // [{ id, name, type: 'preset'|'custom', presetId?, binary, args?, mcpConfigPath? }]
  const activeAgentId = ref(null)
  const activeModel = ref('')          // current model name
  const activeEffort = ref('medium')   // 'low' | 'medium' | 'high'
  const activeFlavor = ref('reviewer') // 'reviewer' | 'implementer'
  const targetDir = ref(null)          // target directory for implementer mode

  // ── AI Control: Active session ──────────────────────────────────────────
  const controlSession = ref(null)     // { id, agentId, agentName, model, effort, flavor, cwd, status, startedAt, pid? }
  const controlMessages = ref([])      // [{ id, role, content, type, toolCalls, timestamp }]
  const controlStatus = ref('idle')    // 'idle' | 'starting' | 'running' | 'waiting' | 'error' | 'ended'
  const controlTokenCount = ref(0)
  const controlHasRealTokens = ref(false)  // true once an agent reports real usage; stops char-estimate
  const controlStreamBuffer = ref('')
  const controlLineBuffer = ref('')    // holds an incomplete trailing JSONL line between stdout chunks

  // ── AI Control: Embedded terminal session ──────────────────────────────
  // The agent runs its NATIVE interactive TUI inside an xterm panel (see AgentTerminal.vue).
  // We parse nothing — the agent owns turns, permissions, memory, resume. Consistent across
  // every CLI because only their headless modes diverge; interactive modes all just work.
  const terminalSession = ref(null)    // { id, agentId, agentName, type, binary, args, cwd, mcpPort }

  // ── AI Control: Session history ─────────────────────────────────────────
  const controlHistory = ref([])       // [{ id, title, agentId, agentName, model, effort, flavor, cwd, status, startedAt, endedAt, messageCount }]

  // ── AI Control: MCP state ───────────────────────────────────────────────
  const mcpPort = ref(null)
  const mcpOptOuts = ref({})          // { [agentId]: true }

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
  const peerFileComments = ref([]); // comments visible in sidebar when viewing a peer file
  const activeCommentId = ref(null); // drives bidirectional scroll between sidebar and viewer
  const networkChanged = ref(false);
  const externalChangeNotice = ref(null); // { file, at } when active doc changed on disk while dirty
  const editorRevision = ref(0); // bump to force editor remount (e.g. after reload-from-disk)
  const externalReloadAt = ref(0); // bump on external fs change so reference panes reload from disk
  const fileIndex = ref({});
  const appVersion = ref(__APP_VERSION__ || "");

  // Global in-app confirm dialog. `confirmDialog` holds the active request
  // ({ title, message, confirmText, cancelText, danger }) or null. ConfirmModal
  // is mounted once at the layout root and renders whenever this is non-null.
  const confirmDialog = ref(null);
  let confirmResolver = null;

  function confirm(opts) {
    if (confirmResolver) confirmResolver(false);
    confirmDialog.value = {
      title: opts?.title || "Are you sure?",
      message: opts?.message || "",
      confirmText: opts?.confirmText,
      cancelText: opts?.cancelText,
      danger: !!opts?.danger,
    };
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function resolveConfirm(value) {
    const r = confirmResolver;
    confirmResolver = null;
    confirmDialog.value = null;
    if (r) r(!!value);
  }

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
    api.agentSession.onSessionStart((data) => startAgentSession(data));
    api.agentSession.onComment((data) => {
      agentActivity.value = {
        activityType: "writing_comment",
        label: "Writing comment…",
      };
      addAgentComment(data);
    });
    api.agentSession.onActivity?.((data) => {
      agentActivity.value = {
        activityType: data.activityType,
        label: data.label,
      };
    });
    api.agentSession.onSessionDone(() => {
      agentSession.value = null;
      agentActivity.value = null;
      actionPickerOpen.value = false;
    });
    api.agentSession.onSessionCancel(() => {
      agentSession.value = null;
      agentActivity.value = null;
      actionPickerOpen.value = false;
    });
    api.agentSession.onFileSaved?.((data) => {
      const filePath = data.path;
      if (currentFile.value === filePath) {
        isDirty.value = false;
      }
      clearUnsaved(filePath);
    });
  }

  // Register AI Control IPC listeners once
  if (api.agentControl) {
    api.agentControl.onStdout((data) => handleControlStdout(data))
    api.agentControl.onStderr((data) => handleControlStderr(data))
    api.agentControl.onExit((data) => handleControlExit(data))
    api.agentControl.onError((data) => handleControlError(data))
    api.agentControl.onCopyToClipboard?.(({ text }) => {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(text).catch(() => {})
      }
    })
    // An agent (Pi) queued comments to the inbox; main ingested them — reload the panel.
    api.agentControl.onCommentsIngested?.(({ count }) => {
      if (count > 0) {
        loadComments()
        controlMessages.value.push({
          id: crypto.randomUUID(), role: 'context',
          content: `Added ${count} comment${count === 1 ? '' : 's'} to the workspace.`,
          type: 'context-injection', timestamp: Date.now()
        })
      }
    })
  }

  // Wire share stats listener once — updates whichever file is being shared
  api.share.onStats((stats) => {
    shareStatsByFile[stats.filePath] = {
      reads: stats.reads,
      connected: stats.connected,
    };
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
    api.share.onNetworkChanged(() => {
      networkChanged.value = true;
    });
  }

  // Reload the primary editor's doc from disk after an external change. When the
  // user has unsaved edits we surface a notice instead of clobbering their work.
  async function syncActiveDocFromDisk() {
    if (!workspacePath.value || !currentFile.value) return;
    if (isDirty.value) {
      externalChangeNotice.value = { file: currentFile.value, at: Date.now() };
      return;
    }
    try {
      const disk = await api.files.read(workspacePath.value, currentFile.value);
      if (disk != null && disk !== currentContent.value) {
        currentContent.value = disk;
        editorRevision.value += 1; // remount editor with fresh content
      }
    } catch {}
  }

  let externalSyncTimer = null;
  if (api.files.onIndexUpdate) {
    api.files.onIndexUpdate(async (idx) => {
      fileIndex.value = idx;
      // External fs change — repopulate sidebar tree
      if (!workspacePath.value || isDemoMode.value) return;
      await refreshFiles();
      // Coalesce bursts of writes (e.g. an agent streaming edits to the open doc)
      // into a single reload so the editor and panes don't thrash mid-stream.
      clearTimeout(externalSyncTimer);
      externalSyncTimer = setTimeout(() => {
        externalReloadAt.value = Date.now(); // editable panes reload (dirty-guarded)
        syncActiveDocFromDisk();
      }, 250);
    });
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

  // ==========================================
  // ── PREFERENCES & APP CONFIGURATION ──
  // ==========================================
  function applyAppearanceSettings(cfg) {
    // Transparency only renders correctly on macOS (vibrancy). On
    // Linux/Windows the semi-transparent panels would show the raw desktop
    // or the window's solid backgroundColor, so keep panels opaque there.
    const isMac =
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad/.test(navigator.platform || "");
    const transparencyOn = isMac && cfg?.windowTransparency !== false;
    // The watcher applies the actual class (also gated on compact layout).
    _transparencyPref.value = transparencyOn;
    storage.setItem("canonic:window-transparency", String(transparencyOn));

    const transparencyOpacity = cfg?.windowTransparencyOpacity ?? 0.88;
    document.documentElement.style.setProperty(
      "--blur-opacity",
      String(transparencyOpacity),
    );
    storage.setItem(
      "canonic:transparency-opacity",
      String(transparencyOpacity),
    );

    const grainOn = !!cfg?.grainEnabled;
    document.documentElement.classList.toggle("grain-enabled", grainOn);

    const grainOpacity = cfg?.grainOpacity ?? 0.02;
    document.documentElement.style.setProperty(
      "--grain-opacity",
      String(grainOpacity),
    );

    const paragraphSpacing = cfg?.editorParagraphSpacing === true;
    document.documentElement.classList.toggle(
      "editor-paragraph-spacing",
      paragraphSpacing,
    );
  }

  function applyTabsSettings(cfg) {
    if (!cfg) return;
    if (typeof cfg.tabsEnabled === "boolean") {
      tabsEnabled.value = cfg.tabsEnabled;
    }
    if (cfg.tabsPosition === "top" || cfg.tabsPosition === "bottom") {
      tabsPosition.value = cfg.tabsPosition;
    }
  }

  async function loadConfig() {
    if (import.meta.env.DEV) console.log("[Store] Loading config...");
    config.value = await api.config.read();
    applyAppearanceSettings(config.value);
    applyTabsSettings(config.value);
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
      applyAppearanceSettings(result.config);
      applyTabsSettings(result.config);
      if (import.meta.env.DEV) console.log("[Store] Config saved successfully");
    } else {
      if (import.meta.env.DEV)
        console.warn("[Store] Config save failed:", result.errors);
    }
    return result;
  }

  // ==========================================
  // ── WORKSPACE & DIRECTORY MANAGEMENT ──
  // ==========================================
  async function openWorkspace(chosenPath, template = "blank") {
    isLoading.value = true;
    try {
      const result = await api.workspace.init(chosenPath, template);
      if (result.error) throw new Error(result.error);
      workspacePath.value = result.path;
      isExternalRepo.value = result.isExternal === true;
      workspaceName.value = chosenPath.split(/[\\/]/).pop();
      // Record in the durable main-process history (skip the demo workspace).
      // Falls back to a local-only list if the bridge is unavailable (web/tests).
      if (!isDemoMode.value) {
        const entry = {
          path: chosenPath,
          name: workspaceName.value,
          openedAt: Date.now(),
        };
        if (api.workspace?.addRecent) {
          try {
            recentWorkspaces.value = await api.workspace.addRecent(
              entry.path,
              entry.name,
            );
          } catch {
            recentWorkspaces.value = [
              entry,
              ...recentWorkspaces.value.filter((w) => w.path !== entry.path),
            ].slice(0, 8);
          }
        } else {
          recentWorkspaces.value = [
            entry,
            ...recentWorkspaces.value.filter((w) => w.path !== entry.path),
          ].slice(0, 8);
        }
        storage.setItem(
          "canonic:recentWorkspaces",
          JSON.stringify(recentWorkspaces.value),
        );
      }
      refPanes.value = [];
      openTabs.value = [];
      currentFile.value = null;
      currentContent.value = "";
      comments.value = [];
      await refreshFiles();
      await refreshBranches();
      // Restore last used branch if it exists in the workspace
      const cfg = await loadConfig();

      if (cfg?.autoShareAllWorkspaces && !sharesByFile["__all_workspaces__"]) {
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

  // Load the durable recent-workspace list from the main process (source of
  // truth) into the reactive ref, caching to localStorage for instant paint.
  // No-op fallback to the cached value when the bridge isn't present (web/tests).
  async function loadRecents() {
    if (!api.workspace?.recents) return recentWorkspaces.value;
    try {
      const list = await api.workspace.recents();
      if (Array.isArray(list)) {
        recentWorkspaces.value = list;
        storage.setItem("canonic:recentWorkspaces", JSON.stringify(list));
      }
    } catch {
      // keep the cached value
    }
    return recentWorkspaces.value;
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
    const renamedRefIdx = refPanes.value.indexOf(oldPath);
    if (renamedRefIdx !== -1) refPanes.value[renamedRefIdx] = newPath;
    const renamedTabIdx = openTabs.value.indexOf(oldPath);
    if (renamedTabIdx !== -1) openTabs.value[renamedTabIdx] = newPath;
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
    const deletedRefIdx = refPanes.value.indexOf(filePath);
    if (deletedRefIdx !== -1) refPanes.value.splice(deletedRefIdx, 1);
    const deletedTabIdx = openTabs.value.indexOf(filePath);
    if (deletedTabIdx !== -1) openTabs.value.splice(deletedTabIdx, 1);
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
    refPanes.value = refPanes.value.filter((p) => !p.startsWith(prefix));
    openTabs.value = openTabs.value.filter((p) => !p.startsWith(prefix));
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

    // Update reference panes if a shown doc (or its parent) was moved
    refPanes.value = refPanes.value.map((p) => {
      if (p === filePath) return newPath;
      if (p.startsWith(filePath + "/")) return p.replace(filePath, newPath);
      return p;
    });

    // Same rewrite for editor tabs
    openTabs.value = openTabs.value.map((p) => {
      if (p === filePath) return newPath;
      if (p.startsWith(filePath + "/")) return p.replace(filePath, newPath);
      return p;
    });

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

  // ==========================================
  // ── TRASH BIN MANAGEMENT ──
  // ==========================================
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
    applyOpenDirs(files.value);
  }

  function clearUnsaved(filePath) {
    delete unsavedBuffer[filePath];
  }

  async function reloadCurrentFromDisk() {
    if (!workspacePath.value || !currentFile.value) return;
    const disk = await api.files.read(workspacePath.value, currentFile.value);
    if (disk == null) return;
    currentContent.value = disk;
    isDirty.value = false;
    clearUnsaved(currentFile.value);
    externalChangeNotice.value = null;
    editorRevision.value += 1;
  }

  // ==========================================
  // ── SPLIT MULTI-PANEL EDITOR ──
  // ==========================================
  const MAX_REF_PANES = 2;

  function addRefPane(filePath) {
    if (!filePath || filePath === currentFile.value) return;
    if (refPanes.value.includes(filePath)) return;
    if (refPanes.value.length >= MAX_REF_PANES) return;
    refPanes.value.push(filePath);
  }

  function removeRefPane(index) {
    if (index < 0 || index >= refPanes.value.length) return;
    const removed = refPanes.value[index];
    refPanes.value.splice(index, 1);
    if (activePane.value === removed) activePane.value = "main";
  }

  function setRefPaneFile(index, filePath) {
    if (index < 0 || index >= refPanes.value.length || !filePath) return;
    const prev = refPanes.value[index];
    const wasActive = activePane.value === prev;
    // Picking the active doc, or a doc already shown in another pane, would duplicate it
    if (filePath === currentFile.value) {
      refPanes.value.splice(index, 1);
      if (wasActive) activePane.value = "main";
      return;
    }
    const existing = refPanes.value.indexOf(filePath);
    if (existing !== -1 && existing !== index) {
      refPanes.value.splice(index, 1);
      if (wasActive) activePane.value = "main";
      return;
    }
    refPanes.value[index] = filePath;
    if (wasActive) activePane.value = filePath;
  }

  // Mark which pane is focused for editing. Panes edit in place — clicking one no
  // longer swaps it into the primary slot; it just becomes the active editing target.
  function setActivePane(id) {
    activePane.value = id || "main";
  }

  // Persist an edit made in a reference pane. Mirrors saveFile() but targets an
  // arbitrary path rather than the primary currentFile.
  async function savePaneFile(filePath, content) {
    if (!workspacePath.value || !filePath) return;
    const normalized = normalizeMarkdown(content);
    await api.files.write(workspacePath.value, filePath, normalized);
    clearUnsaved(filePath);
    api.search.index(workspacePath.value, filePath, normalized);
    return normalized;
  }

  // When the active doc closes (deleted, etc.) while panes are open, promote one.
  watch(currentFile, (val) => {
    if (!val && refPanes.value.length > 0) {
      const next = refPanes.value.shift();
      openFile(next);
    }
  });

  // ==========================================
  // ── ACTIVE FILE LOAD & SAVE ──
  // ==========================================
  async function openFile(filePath) {
    // Close search view if open — user navigated to a doc
    if (searchViewOpen.value) searchViewOpen.value = false;

    // If this file is shown in a reference pane, drop it — it is becoming the active doc
    const refIdx = refPanes.value.indexOf(filePath);
    if (refIdx !== -1) refPanes.value.splice(refIdx, 1);

    // Opening a doc into the primary editor focuses it.
    activePane.value = "main";

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
    if (import.meta.env.DEV) {
      console.log("[Store] File content read, setting currentFile to:", filePath);
    }
    currentFile.value = filePath;
    addTab(filePath);

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
    return (
      md
        .replace(/\r\n/g, "\n") // consistent line endings
        .replace(/[ \t]+$/gm, "") // strip trailing whitespace per line
        .trimEnd() + "\n"
    ); // single trailing newline
    // NOTE: blank lines between blocks are intentionally preserved (no collapse)
    // so user-authored spacing round-trips. Empty paragraphs map to blank lines
    // via preserveEmptyLinesRemark / stripEmptyLineBr in MilkdownEditor.vue.
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
    if (!workspacePath.value || isDemoMode.value) return;
    const match = assetUrl.match(/^canonic-asset:\/\/(.+)$/);
    if (!match) return;
    const relativePath = match[1]; // e.g. 'assets/image-1234.png'
    const tracked = await api.git.isFileTracked(
      workspacePath.value,
      relativePath,
    );
    if (!tracked) {
      await api.files.delete(workspacePath.value, relativePath);
    }
  }

  async function saveAsset(uint8array, ext) {
    if (!workspacePath.value || isDemoMode.value) return null;
    const safeExt =
      (ext || "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") || "png";
    const filename = `assets/image-${Date.now()}.${safeExt}`;
    const result = await api.files.writeBinary(
      workspacePath.value,
      filename,
      uint8array,
    );
    return result ? `canonic-asset://${filename}` : null;
  }

  // ==========================================
  // ── GIT VERSION CONTROL & BRANCHES ──
  // ==========================================
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
        "You have uncommitted changes. Switching branches may lose these changes or cause conflicts. Continue?",
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

  // ==========================================
  // ── INLINE COMMENTS ──
  // ==========================================
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

  async function deleteAgentComments() {
    const before = comments.value.length;
    comments.value = comments.value.filter((c) => !c.isAgent);
    const removed = before - comments.value.length;
    if (removed > 0) await persistComments();
    return removed;
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

  // ==========================================
  // ── DEMO WORKSPACE ENVIRONMENT ──
  // ==========================================
  async function enableDemoMode() {
    const cfg = demoConfig;
    const defaultPath = await api.workspace.getDefault();
    const parent = defaultPath.replace(/\/[^/]+$/, "");
    const demoPath = `${parent}/${cfg.workspaceName}`;
    demoWorkspaceDir.value = demoPath;
    // Tell main to delete this scratch dir on quit so demo files never linger.
    api.demo?.register?.(demoPath);

    _demoComments.value = cfg.comments || {};
    demoPeers.value = cfg.peers || [];
    demoFiles.value = cfg.files ? { ...cfg.files } : {};
    isDemoMode.value = true;

    // AI Control demo data
    controlHistory.value = (cfg.agentSessions || []).map(s => ({ ...s }))
    configuredAgents.value = (cfg.configuredAgents || []).map(a => ({ ...a }))
    if (configuredAgents.value.length > 0 && !activeAgentId.value) {
      activeAgentId.value = configuredAgents.value[0].id
    }

    await openWorkspace(demoPath, cfg.template || "pm-framework");

    if (cfg.files && workspacePath.value) {
      for (const [filePath, content] of Object.entries(cfg.files)) {
        await api.files.write(workspacePath.value, filePath, content);
      }
      await refreshFiles();
      // Land in split view so the side-by-side panels feature is visible in demo
      await openFile("Vision/product-vision.md");
      addRefPane("Strategy/strategy.md");
    }
  }

  function disableDemoMode() {
    isDemoMode.value = false;
    demoPeers.value = [];
    demoFiles.value = {};
    _demoComments.value = {};
    comments.value = comments.value.filter((c) => !c.isDemo);
    controlHistory.value = []
    configuredAgents.value = []
    activeAgentId.value = null
    // Remove the throwaway demo dir now that we're leaving demo mode.
    if (demoWorkspaceDir.value) {
      api.demo?.cleanup?.();
      demoWorkspaceDir.value = null;
    }
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
      shareStatsByFile[currentFile.value] = {
        reads: result.reads ?? 0,
        connected: 0,
      };
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
    const cfg = config.value || (await loadConfig());
    const options = {
      permission: cfg?.sharingDefaults?.permission || "view",
      excludedPaths: JSON.parse(
        JSON.stringify(cfg?.sharingExcludedPaths || []),
      ),
    };
    const result = await api.share.startWorkspace(workspacePath.value, options);
    if (result.success) {
      sharesByFile[WORKSPACE_KEY] = result;
      shareStatsByFile[WORKSPACE_KEY] = {
        reads: result.reads ?? 0,
        connected: 0,
      };
    }
    return result;
  }

  async function startAllWorkspacesShare() {
    const cfg = config.value || (await loadConfig());
    const workspaces = recentWorkspaces.value.map((w) => ({
      path: w.path,
      name: w.name,
    }));
    const options = {
      permission: cfg?.sharingDefaults?.permission || "view",
      excludedPaths: JSON.parse(
        JSON.stringify(cfg?.sharingExcludedPaths || []),
      ),
    };
    const ALL_WS_KEY = "__all_workspaces__";
    const result = await api.share.startAllWorkspaces(workspaces, options);
    if (result.success) {
      sharesByFile[ALL_WS_KEY] = result;
      shareStatsByFile[ALL_WS_KEY] = { reads: result.reads ?? 0, connected: 0 };
    }
    return result;
  }

  async function stopAllWorkspacesShare() {
    const ALL_WS_KEY = "__all_workspaces__";
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
      const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let pattern = opts.regex ? query : escape(query);
      if (opts.word) pattern = `\\b(?:${pattern})\\b`;
      const flags = "g" + (opts.case ? "" : "i");
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }

  function _findInTextByLines(text, re) {
    if (!re) return [];
    const out = [];
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const m of line.matchAll(re)) {
        if (m[0].length === 0) continue;
        out.push({
          line: i + 1,
          col: m.index,
          text: line,
          length: m[0].length,
        });
      }
    }
    return out;
  }

  function _demoWorkspaceSearch() {
    const re = _buildSearchRegex(wsSearch.query, wsSearch.opts);
    if (!re) {
      wsSearch.results = { branch: [], other: [] };
      wsSearch.lastError = "Invalid regex";
      return;
    }
    wsSearch.lastError = "";
    const branchResults = [];
    for (const [filePath, content] of Object.entries(demoFiles.value || {})) {
      const matches = _findInTextByLines(content, re);
      if (matches.length) {
        branchResults.push({ filePath, branch: "current", matches });
      }
    }
    wsSearch.results = { branch: branchResults, other: [] };
  }

  async function runWorkspaceSearch() {
    const q = (wsSearch.query || "").trim();
    if (!q) {
      wsSearch.results = { branch: [], other: [] };
      wsSearch.lastError = "";
      return;
    }
    wsSearch.searching = true;
    wsSearch.lastError = "";
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
      wsSearch.lastError = "Demo mode is read-only.";
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
        original || "",
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
      wsSearch.lastError = "Demo mode is read-only.";
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
    const next = (original || "").replace(re, (match, ...rest) => {
      re.lastIndex = 0;
      return wsSearch.replace;
    });
    // Above replaces all on the line — for true "next only" semantics use a one-shot regex.
    const oneShot = new RegExp(re.source, re.flags.replace("g", ""));
    const single = (original || "").replace(oneShot, wsSearch.replace);
    if (single === original)
      return { replaced: 0, skipped: (wsSearch.results.other || []).length };
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
    wsSearch.pendingFocus = {
      filePath: result.filePath,
      line: result.line || 1,
    };
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

  async function startAgentSession({
    sessionId,
    file,
    agentName,
    workspacePath: wsParam,
  }) {
    agentActivity.value = null;
    agentSession.value = { sessionId, agentName, file, startedAt: Date.now() };

    // Resolve workspace + file path.
    // Agent may send: (a) explicit wsParam + relative file, (b) absolute file
    // under a known workspace with no wsParam, (c) relative file matching current ws.
    let ws = wsParam;
    let relFile = file;
    const isAbsolute = file && (file.startsWith("/") || /^[A-Za-z]:[\\/]/.test(file));

    if (!ws && isAbsolute) {
      const match = recentWorkspaces.value.find(
        (w) =>
          file === w.path ||
          file.startsWith(w.path.endsWith("/") ? w.path : w.path + "/"),
      );
      if (match) ws = match.path;
    }
    if (!ws) ws = workspacePath.value;

    if (ws && isAbsolute) {
      const prefix = ws.endsWith("/") ? ws : ws + "/";
      if (file.startsWith(prefix)) relFile = file.slice(prefix.length);
    }

    if (ws && ws !== workspacePath.value) {
      await openWorkspace(ws);
    }
    if (relFile && workspacePath.value) {
      await openFile(relFile);
    }
    agentSession.value = {
      sessionId,
      agentName,
      file: relFile,
      startedAt: Date.now(),
    };
  }

  async function cancelAgentSession() {
    if (!agentSession.value) return;
    const { sessionId } = agentSession.value;
    agentSession.value = null;
    actionPickerOpen.value = false;
    await api.agentSession.cancel(sessionId);
  }

  async function submitAgentAction(prompt) {
    if (!agentSession.value) return;
    const { sessionId } = agentSession.value;
    try {
      await api.agentSession.submit({
        sessionId,
        prompt,
        content: currentContent.value,
      });
    } finally {
      agentSession.value = null;
      actionPickerOpen.value = false;
    }
  }

  async function addAgentComment({ commentId, file, anchor, text, agentName }) {
    if (file !== currentFile.value) return;
    const comment = {
      id: commentId,
      isAgent: true,
      agentName,
      author: agentName,
      anchor,
      text,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    comments.value.push(comment);
    await persistComments();
  }

  function openActionPicker() {
    actionPickerOpen.value = true;
  }
  function closeActionPicker() {
    actionPickerOpen.value = false;
  }

  // ── AI Control: Agent config actions ────────────────────────────────────
  async function loadAgentPresets() {
    if (api.agentControl?.getPresets) {
      agentPresets.value = await api.agentControl.getPresets()
    }
  }

  async function loadConfiguredAgents() {
    // Load custom agents from config
    if (api.agentControl?.getCustomAgents) {
      const custom = await api.agentControl.getCustomAgents()
      const presets = agentPresets.value.map(p => ({
        id: p.id,
        name: p.name,
        type: 'preset',
        presetId: p.id,
        binary: p.binary,
        injectContext: !!p.injectContext,
        outputFormat: p.outputFormat,
        installed: p.installed
      }))
      configuredAgents.value = [...presets, ...custom]
      
      // Set default active agent to first installed preset
      if (!activeAgentId.value && configuredAgents.value.length > 0) {
        const firstInstalled = configuredAgents.value.find(a => a.installed !== false)
        if (firstInstalled) activeAgentId.value = firstInstalled.id
      }
    }
  }

  async function addCustomAgent(config) {
    if (api.agentControl?.addCustomAgent) {
      const result = await api.agentControl.addCustomAgent(config)
      if (result.ok) {
        configuredAgents.value.push(result.agent)
      }
      return result
    }
  }

  async function removeCustomAgent(id) {
    if (api.agentControl?.removeCustomAgent) {
      await api.agentControl.removeCustomAgent(id)
      configuredAgents.value = configuredAgents.value.filter(a => a.id !== id)
      if (activeAgentId.value === id) {
        activeAgentId.value = configuredAgents.value[0]?.id || null
      }
    }
  }

  function setActiveAgent(agentId) {
    if (agentId === activeAgentId.value) return
    if (controlStatus.value === 'running') {
      // Save current session to history before switching
      saveControlSessionToHistory()
    }
    // End any live embedded terminal — it's bound to the previous agent.
    if (terminalSession.value) endTerminalSession()
    activeAgentId.value = agentId
    // Reset session state
    controlMessages.value = []
    controlStatus.value = 'idle'
    controlTokenCount.value = 0
    controlHasRealTokens.value = false
    controlStreamBuffer.value = ''
    controlLineBuffer.value = ''
    // Wipe model selection — the real model is unknown until a session starts (or the user
    // opens the model dropdown, which triggers a live fetch). Show "default" until then.
    activeModel.value = ''
    availableModels.value = []
    defaultModelHint.value = ''
  }

  const availableModels = ref([])       // models populated on demand by discoverAgentModels
  const modelsLoading = ref(false)      // true while fetching models for the dropdown
  const defaultModelHint = ref('')      // agent's suggested default (for placeholder)

  // Called when the user opens the model selector — fetches live and shows a loading state.
  async function openModelSelector() {
    if (!activeAgentId.value) return
    modelsLoading.value = true
    try {
      await discoverAgentModels(activeAgentId.value)
    } finally {
      modelsLoading.value = false
    }
  }

  async function discoverAgentModels(agentId) {
    const agent = configuredAgents.value.find(a => a.id === agentId)
    if (!agent) return
    const presetId = agent.type === 'preset' ? (agent.presetId || agent.id) : null
    if (!presetId) return
    if (api.agentControl?.getModels) {
      const result = await api.agentControl.getModels({ agentId: presetId })
      if (result.models && result.models.length > 0) {
        availableModels.value = result.models
      }
      // Remember the default as a placeholder hint, but do NOT auto-select it —
      // activeModel stays empty ("default") until the user picks or a session reports one.
      if (result.defaultModel) defaultModelHint.value = result.defaultModel
    }
  }

  function setAgentModel(model) {
    activeModel.value = model
    saveAgentControlPrefs()
  }

  function setAgentEffort(effort) {
    activeEffort.value = effort
    saveAgentControlPrefs()
  }

  function setActiveFlavor(flavor) {
    activeFlavor.value = flavor
    saveAgentControlPrefs()
  }

  // Open the right-hand agent panel, optionally pre-selecting an agent and
  // flavor. Used by the editor's /review and /build slash commands.
  function openAgentPanel({ agentId = null, flavor = null } = {}) {
    if (agentId) setActiveAgent(agentId)
    if (flavor) setActiveFlavor(flavor)
    rightPanelTab.value = 'agent'
    rightPanelCollapsed.value = false
  }

  function setTargetDir(dir) {
    targetDir.value = dir
    saveAgentControlPrefs()
  }

  async function pickTargetDirectory() {
    if (api.agentControl?.pickDirectory) {
      const dir = await api.agentControl.pickDirectory()
      if (dir) targetDir.value = dir
      saveAgentControlPrefs()
    }
  }

  async function saveAgentControlPrefs() {
    if (!config.value) return
    const next = JSON.parse(JSON.stringify(config.value))
    if (!next.agentControl) next.agentControl = {}
    next.agentControl.activeAgentId = activeAgentId.value
    next.agentControl.model = activeModel.value
    next.agentControl.effort = activeEffort.value
    next.agentControl.flavor = activeFlavor.value
    next.agentControl.targetDir = targetDir.value
    await saveConfig(next)
  }

  function hydrateAgentControlPrefs() {
    const ac = config.value?.agentControl
    if (!ac) return
    if (ac.activeAgentId) activeAgentId.value = ac.activeAgentId
    if (ac.model) activeModel.value = ac.model
    if (ac.effort) activeEffort.value = ac.effort
    if (ac.flavor) activeFlavor.value = ac.flavor
    if (ac.targetDir) targetDir.value = ac.targetDir
  }

  // Assemble the live workspace as an inline context block for agents that read inline
  // instead of via MCP (Pi). Includes the file list, the current doc, and open comments,
  // plus an instruction to edit files directly with the agent's built-in tools.
  function buildInlineWorkspaceContext(docPath, docContent) {
    const parts = []
    const wsName = workspacePath.value ? (workspacePath.value.split('/').pop() || workspacePath.value) : null

    // Flatten the (possibly nested) file tree to a list of doc paths.
    const flat = []
    const walk = (nodes) => {
      for (const n of nodes || []) {
        if (n.path && n.type !== 'directory' && !n.children) flat.push(n.path)
        if (n.children) walk(n.children)
      }
    }
    walk(files.value)

    if (wsName) {
      const fileList = flat.length ? `\n<files>\n${flat.map(p => '- ' + p).join('\n')}\n</files>` : ''
      parts.push(`<workspace name="${wsName}">${fileList}\n</workspace>`)
    }
    if (docContent) {
      parts.push(`<current_document path="${docPath || 'untitled'}">\n${docContent}\n</current_document>`)
    }
    const open = (comments.value || []).filter(c => !c.resolved)
    if (open.length) {
      const lines = open.map(c => {
        const q = c.anchor?.quotedText || c.quotedText
        return q ? `- on "${String(q).slice(0, 80)}": ${c.text}` : `- ${c.text}`
      })
      parts.push(`<comments doc="${docPath || ''}">\n${lines.join('\n')}\n</comments>`)
    }
    parts.push(
      `<instructions>\n` +
      `The workspace data above is provided inline and is current — you do NOT need any external/MCP tools to read it.\n\n` +
      `EDITING A DOCUMENT: only when the user explicitly asks you to change a document's content, edit the markdown file directly in your working directory with your built-in write/edit tools.\n\n` +
      `LEAVING A COMMENT: a comment is feedback ABOUT the document — it is NOT a document edit. ` +
      `NEVER write comment text into the document itself. ` +
      `To leave a comment, append exactly one JSON object per line to the file \`.canonic/comments.inbox.jsonl\` in your working directory (create the file/folder if missing). Each line must be:\n` +
      `{"path":"<relative doc path>","quotedText":"<exact snippet from the doc you are commenting on, or empty>","text":"<your comment>"}\n` +
      `Do not modify the document when asked to comment. Canonic ingests this file and attaches the comments after you finish.\n` +
      `</instructions>`
    )
    return parts.join('\n\n')
  }

  // ── AI Control: Session actions ─────────────────────────────────────────
  async function startControlSession({ prompt, contextDoc, contextSelection } = {}) {
    if (controlStatus.value === 'running') {
      // Already running — send prompt to existing session instead
      return sendControlMessage(prompt)
    }
    if (!activeAgentId.value) return

    const agent = configuredAgents.value.find(a => a.id === activeAgentId.value)
    if (!agent) return

    const sessionId = crypto.randomUUID()
    const cwd = targetDir.value || workspacePath.value

    controlStatus.value = 'starting'
    controlMessages.value = []
    controlTokenCount.value = 0
    controlHasRealTokens.value = false
    controlStreamBuffer.value = ''
    controlLineBuffer.value = ''

    // Auto-inject current doc context if available and not explicitly provided
    const docPath = contextDoc || currentFile.value
    const docContent = contextSelection || (currentFile.value && !contextDoc ? currentContent.value : null)
    
    // Workspace name (last dir segment)
    if (workspacePath.value) {
      const wsName = workspacePath.value.split('/').pop() || workspacePath.value
      controlMessages.value.push({
        id: crypto.randomUUID(),
        role: 'context',
        content: `workspace: ${wsName}`,
        type: 'context-injection',
        timestamp: Date.now()
      })
    }
    if (docPath) {
      const docName = docPath.split('/').pop()?.replace(/\.md$/, '') || docPath
      controlMessages.value.push({
        id: crypto.randomUUID(),
        role: 'context',
        content: `doc: ${docName}`,
        type: 'context-injection',
        timestamp: Date.now()
      })
    }

    // Add user message
    if (prompt) {
      controlMessages.value.push({
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
        type: 'user',
        timestamp: Date.now()
      })
    }

    // Build full prompt. Two strategies:
    //  • injectContext agents (e.g. Pi): the live workspace is embedded inline so the agent
    //    never has to make permission-gated tool calls just to read; it edits files directly.
    //  • everyone else: a hint pointing at the Canonic MCP server.
    let fullPrompt = prompt || ''
    if (agent.injectContext) {
      fullPrompt = buildInlineWorkspaceContext(docPath, docContent) + '\n\n' + fullPrompt
    } else {
      let toolHint = ''
      if (mcpPort.value) {
        const tools = ['read_doc', 'write_doc', 'create_doc', 'list_docs', 'post_comment', 'read_comments', 'start_session', 'get_workspace_info']
        toolHint = `\n\n<available_tools>\nYou have access to Canonic MCP tools. Use them to interact with the workspace:\n${tools.map(t => '- ' + t).join('\n')}\n\nTo post a comment on a doc, use post_comment with path, text, and optional anchor (quotedText).\nTo read a doc, use read_doc with the relative path.\n</available_tools>`
      }
      if (docContent) {
        fullPrompt = `<current_document path="${docPath || 'untitled'}">\n${docContent}\n</current_document>${toolHint}\n\n${fullPrompt}`
      } else if (toolHint) {
        fullPrompt = toolHint + '\n\n' + fullPrompt
      }
    }

    try {
      const mcpP = mcpPort.value || 0

      // Auto-register MCP for preset agents (first session only). Skipped for injectContext
      // agents — they get data inline and don't use the MCP server.
      if (agent.type === 'preset' && agent.presetId && mcpP && !agent.injectContext) {
        const mcp = await checkMcpRegistration(agent.presetId)
        if (!mcp.registered && !mcp.optedOut && !mcpOptOuts.value[agent.presetId]) {
          await registerMcp(agent.presetId)
        }
      }

      const result = await api.agentControl.startSession({
        sessionId,
        agentId: agent.type === 'preset' ? agent.presetId : 'custom',
        customBinary: agent.type === 'custom' ? agent.binary : undefined,
        customArgs: agent.type === 'custom' ? agent.args : undefined,
        cwd,
        prompt: fullPrompt,
        model: activeModel.value,
        effort: activeEffort.value,
        mcpPort: mcpP
      })

      if (result.error) {
        controlStatus.value = 'error'
        const hint = result.notInstalled && result.installHint
          ? `\nInstall it with: ${result.installHint}`
          : ''
        controlMessages.value.push({
          id: crypto.randomUUID(),
          role: 'agent',
          content: `Error: ${result.error}${hint}`,
          type: 'error',
          notInstalled: result.notInstalled || false,
          installHint: result.installHint || null,
          timestamp: Date.now()
        })
        return
      }

      controlSession.value = {
        id: sessionId,
        agentId: activeAgentId.value,
        agentName: agent.name,
        model: activeModel.value,
        effort: activeEffort.value,
        flavor: activeFlavor.value,
        outputFormat: agent.outputFormat,
        cwd,
        status: 'running',
        startedAt: Date.now(),
        pid: result.pid
      }
      controlStatus.value = 'running'
    } catch (err) {
      controlStatus.value = 'error'
      controlMessages.value.push({
        id: crypto.randomUUID(),
        role: 'agent',
        content: `Failed to start agent: ${err.message}`,
        type: 'error',
        timestamp: Date.now()
      })
    }
  }

  function handleControlStdout({ sessionId, text }) {
    if (!controlSession.value || controlSession.value.id !== sessionId) return
    
    // Try to parse JSON-mode output (Pi --mode json, etc.)
    controlStreamBuffer.value += text

    // Single-object 'json' agents (Gemini) emit ONE pretty-printed JSON object at completion.
    // Its lines are not individually valid JSON, so the JSONL path below would dump each line
    // as a raw text bubble. Accumulate silently and parse the whole buffer once at exit.
    if (controlSession.value.outputFormat === 'json') {
      if (!controlHasRealTokens.value) {
        controlTokenCount.value = Math.ceil(controlStreamBuffer.value.length / 4)
      }
      return
    }

    // JSONL: each event is one line, but a stdout chunk can split a line mid-way.
    // Carry the incomplete trailing line over to the next chunk so it parses whole.
    const buffered = controlLineBuffer.value + text
    const lines = buffered.split('\n')
    let remainder = lines.pop() || ''  // last element: may be a complete line w/o trailing \n
    // If the remainder is itself valid JSON, the line was complete (agent emitted no
    // trailing newline) — consume it now; otherwise hold it for the next chunk.
    if (remainder.trim()) {
      try { handleJsonEvent(JSON.parse(remainder.trim())); remainder = '' } catch { /* incomplete — keep */ }
    }
    controlLineBuffer.value = remainder
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        handleJsonEvent(JSON.parse(line.trim()))
      } catch {
        // Not JSON — raw text mode (opencode etc.); show as-is.
        pushAgentText(line)
      }
    }

    // Char-estimate fallback — only until the agent reports real usage tokens.
    if (!controlHasRealTokens.value) {
      controlTokenCount.value = Math.ceil(controlStreamBuffer.value.length / 4)
    }
  }

  // ── Canonical message pushers (shared by all agent schemas) ──────────────
  // Guard against an identical message landing back-to-back (e.g. an agent that re-emits
  // its final text, or a duplicated stdout delivery). A genuine repeat is rare in chat;
  // a doubled bubble is the common failure, so suppress consecutive exact matches.
  function isDuplicateOfLast(type, content, toolName) {
    const last = controlMessages.value[controlMessages.value.length - 1]
    return !!last && last.type === type && last.content === content && last.toolName === toolName
  }
  function pushAgentText(text) {
    if (!text || !text.trim()) return
    if (isDuplicateOfLast('agent', text, undefined)) return
    controlMessages.value.push({
      id: crypto.randomUUID(), role: 'agent', content: text, type: 'agent', timestamp: Date.now()
    })
  }
  function pushToolCall(toolName, toolArgs) {
    const content = JSON.stringify(toolArgs || {}, null, 2)
    if (isDuplicateOfLast('tool-call', content, toolName || 'unknown')) return
    controlMessages.value.push({
      id: crypto.randomUUID(), role: 'agent',
      content,
      type: 'tool-call',
      toolName: toolName || 'unknown',
      toolSummary: Object.keys(toolArgs || {}).slice(0, 2).join(', '),
      timestamp: Date.now()
    })
  }
  function pushToolResult(result) {
    if (result == null) return
    const text = typeof result === 'string' ? result : JSON.stringify(result)
    controlMessages.value.push({
      id: crypto.randomUUID(), role: 'context',
      content: `result: ${text.slice(0, 200)}`, type: 'context-injection', timestamp: Date.now()
    })
  }
  function pushAgentError(msg) {
    controlMessages.value.push({
      id: crypto.randomUUID(), role: 'agent', content: `Error: ${msg || 'Unknown error'}`,
      type: 'error', timestamp: Date.now()
    })
  }
  // Real token usage from an agent's usage object. Once seen we trust it and stop estimating.
  function setRealTokens(usage) {
    if (!usage) return
    const input = usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? usage.input ?? 0
    const output = usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? usage.output ?? 0
    // New tokens only. Some agents (Pi) fold cached-context reads into `totalTokens`
    // (e.g. input 27 + output 29 + cacheRead 5504 = 5560) — counting cache reads makes a
    // "say hi" look like thousands of tokens. Prefer input+output; only fall back to a
    // reported total when neither is present.
    const total = (input + output) > 0
      ? (input + output)
      : (usage.totalTokens ?? usage.total_tokens ?? usage.total ?? 0)
    if (total > 0) {
      controlTokenCount.value = total
      controlHasRealTokens.value = true
    }
  }

  function handleJsonEvent(event) {
    if (!event || typeof event !== 'object') return

    // Capture the agent's own session/thread id from any event that carries one, so
    // "Open in terminal" can hand off the exact session (claude --resume <id>, etc.).
    if (controlSession.value && !controlSession.value.agentSessionId) {
      const sid = event.session_id || event.thread_id || event.sessionId || event.threadId || event.sessionID
      if (sid) controlSession.value.agentSessionId = sid
    }
    // Capture the real model the session is running once the agent reports it, so the UI
    // can show the concrete model instead of "default".
    const reportedModel = event.model || event.message?.model
    if (reportedModel && controlSession.value) {
      controlSession.value.model = reportedModel
      if (!activeModel.value) activeModel.value = reportedModel
    }

    // ── Claude Code stream-json schema ──────────────────────────────────────
    // {type:'system',subtype:'init',session_id}, {type:'assistant',message:{content[],usage}},
    // {type:'user',message:{content[tool_result]}}, {type:'result',result,usage}
    if (event.type === 'system' && event.subtype === 'init') {
      if (event.session_id && controlSession.value) controlSession.value.agentSessionId = event.session_id
      return
    }
    if (event.type === 'assistant' && event.message) {
      const blocks = Array.isArray(event.message.content) ? event.message.content : []
      for (const b of blocks) {
        if (b.type === 'text') pushAgentText(b.text)
        else if (b.type === 'tool_use') pushToolCall(b.name, b.input)
      }
      setRealTokens(event.message.usage)
      return
    }
    if (event.type === 'user' && event.message) {
      const blocks = Array.isArray(event.message.content) ? event.message.content : []
      for (const b of blocks) {
        if (b.type === 'tool_result') {
          const c = Array.isArray(b.content) ? b.content.map(x => x.text || '').join('') : b.content
          pushToolResult(c)
        }
      }
      return
    }
    if (event.type === 'result') {
      // Final summary event. Show result text only if nothing streamed already.
      const streamed = controlMessages.value.some(m => m.role === 'agent' && m.type === 'agent')
      if (!streamed && event.result) pushAgentText(event.result)
      if (event.subtype && event.subtype !== 'success') pushAgentError(event.error || event.subtype)
      setRealTokens(event.usage)
      return
    }

    // ── Codex JSONL schema (exec --json) ────────────────────────────────────
    // {type:'item.completed',item:{type:'agent_message',text}} | item.type 'command_execution'
    // {type:'token_count',info:{total_token_usage:{input_tokens,output_tokens}}}
    if (event.type === 'item.completed' && event.item) {
      const it = event.item
      if (it.type === 'agent_message') pushAgentText(it.text || it.message)
      else if (it.type === 'reasoning') pushToolResult(it.text)
      else if (it.type === 'command_execution' || it.type === 'tool_call') pushToolCall(it.command || it.name, it.arguments || { command: it.command })
      return
    }
    if (event.type === 'token_count') {
      setRealTokens(event.info?.total_token_usage || event.info || event)
      return
    }
    // Legacy Codex: {msg:{type:'agent_message',message}}
    if (event.msg && typeof event.msg === 'object') {
      if (event.msg.type === 'agent_message') pushAgentText(event.msg.message || event.msg.text)
      return
    }

    // ── Pi schema (--mode json) ─────────────────────────────────────────────
    // message_update = streaming text/thinking deltas (skip — they flood, full text
    // arrives in message_end). message_end {message:{content[thinking|text],usage,model}}.
    // turn_end/agent_end = final wrap-up; trust their usage totals.
    if (event.type === 'message_update' || event.type === 'tool_execution_update') return
    if (event.type === 'tool_execution_start') {
      pushToolCall(event.toolName, event.args)
      return
    }
    if (event.type === 'tool_execution_end') {
      const text = Array.isArray(event.result?.content)
        ? event.result.content.map(c => c.text || '').join('')
        : event.result
      if (event.isError) pushAgentError(typeof text === 'string' ? text : 'tool error')
      else pushToolResult(text)
      return
    }
    if (event.type === 'message_end' && event.message) {
      // Pi emits message_end for BOTH the echoed user prompt and the assistant reply —
      // only surface the assistant's, else the user's text repeats back as an agent bubble.
      if (event.message.role === 'assistant') {
        // Surface ONLY text here. Tool calls arrive separately via tool_execution_start
        // and are also embedded in this content array — pushing them here too would
        // double every tool bubble. Skip thinking/toolCall blocks.
        const blocks = Array.isArray(event.message.content) ? event.message.content : []
        for (const b of blocks) {
          if (b.type === 'text') pushAgentText(b.text)
        }
        setRealTokens(event.message.usage)
      }
      return
    }
    if ((event.type === 'turn_end' || event.type === 'agent_end') && event.message) {
      if (event.message.role === 'assistant') setRealTokens(event.message.usage)
      return
    }

    // ── Gemini CLI schema (--output-format json) ────────────────────────────
    // One object at completion: {session_id, response, stats:{models:{<name>:{tokens:{...}}}}}.
    if (typeof event.response === 'string' && event.stats) {
      pushAgentText(event.response)
      const models = event.stats.models || {}
      const names = Object.keys(models)
      if (names.length && controlSession.value) {
        controlSession.value.model = names[names.length - 1]  // main model (last) over router
        if (!activeModel.value) activeModel.value = controlSession.value.model
      }
      // New tokens across every model used (prompt + generated). Skip cached reads.
      let input = 0, output = 0
      for (const n of names) {
        const t = models[n].tokens || {}
        input += t.prompt ?? t.input ?? 0
        output += (t.candidates ?? 0) + (t.thoughts ?? 0)
      }
      setRealTokens({ input, output })
      return
    }

    // ── OpenCode schema (--format json) ─────────────────────────────────────
    // Every event carries top-level sessionID + a `part`. text parts = assistant
    // text (complete, not deltas — distinct part ids). tool_use = a tool call with
    // part.state.input. step_finish carries token usage (input/output exclude cache).
    if (event.part && typeof event.sessionID === 'string') {
      const p = event.part
      if (event.type === 'text' || p.type === 'text') {
        pushAgentText(p.text)
      } else if (event.type === 'tool_use' || p.type === 'tool') {
        pushToolCall(p.tool || p.name, p.state?.input || p.input)
        if (p.state?.output != null) pushToolResult(p.state.output)
      } else if (event.type === 'step_finish' || p.type === 'step-finish') {
        setRealTokens(p.tokens)
      }
      return
    }

    // ── Generic schema ──────────────────────────────────────────────────────
    switch (event.type) {
      case 'session':
        if (event.id && controlSession.value) controlSession.value.agentSessionId = event.id
        break
      case 'assistant':
        pushAgentText(event.content)
        setRealTokens(event.usage)
        break
      case 'tool_call':
      case 'tool_use':
        pushToolCall(event.tool || event.name, event.input || event.arguments)
        break
      case 'tool_result':
        pushToolResult(event.content || event.output)
        break
      case 'error':
        pushAgentError(event.message || event.error)
        break
      case 'usage':
        setRealTokens(event.usage || event)
        break
      case 'done':
      case 'complete':
        setRealTokens(event.usage)
        break
      default:
        break
    }
  }

  function handleControlStderr({ sessionId, text }) {
    if (!controlSession.value || controlSession.value.id !== sessionId) return
    // Show stderr as de-emphasis context — crucial for debugging agent errors
    if (text.trim()) {
      controlMessages.value.push({
        id: crypto.randomUUID(),
        role: 'context',
        content: `stderr: ${text.trim()}`,
        type: 'context-injection',
        timestamp: Date.now()
      })
    }
    controlStreamBuffer.value += text
    if (!controlHasRealTokens.value) {
      controlTokenCount.value = Math.ceil(controlStreamBuffer.value.length / 4)
    }
  }

  function handleControlExit({ sessionId, code, signal }) {
    if (!controlSession.value || controlSession.value.id !== sessionId) return

    // For -p/print mode agents, exit is normal — finalize response from stream buffer.
    const buf = controlStreamBuffer.value
    // First try the WHOLE buffer as one JSON object (Gemini --output-format json and any
    // other single-object agent). If that parses, it's the complete result.
    let parsedWhole = false
    if (buf.trim().startsWith('{')) {
      try { handleJsonEvent(JSON.parse(buf.trim())); parsedWhole = true } catch {}
    }
    // Otherwise treat as JSONL and parse any remaining lines.
    if (!parsedWhole) {
      const lines = buf.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line.trim())
          handleJsonEvent(event)
        } catch {}
      }
    }

    // If no assistant message was parsed, show raw output
    const hasResponse = controlMessages.value.some(m => m.role === 'agent' && m.type === 'agent')
    if (!hasResponse && buf.trim()) {
      controlMessages.value.push({
        id: crypto.randomUUID(),
        role: 'agent',
        content: buf.trim(),
        type: 'agent',
        timestamp: Date.now()
      })
    }

    if (code !== 0 && code !== null) {
      controlSession.value.status = 'error'
      controlMessages.value.push({
        id: crypto.randomUUID(),
        role: 'agent',
        content: `Agent exited with code ${code}`,
        type: 'error',
        timestamp: Date.now()
      })
    } else {
      controlSession.value.status = 'ended'
    }
    controlStatus.value = controlSession.value.status
    controlStreamBuffer.value = ''
    controlLineBuffer.value = ''

    saveControlSessionToHistory()
  }

  function handleControlError({ sessionId, error }) {
    if (!controlSession.value || controlSession.value.id !== sessionId) return
    controlSession.value.status = 'error'
    controlStatus.value = 'error'
    controlMessages.value.push({
      id: crypto.randomUUID(),
      role: 'agent',
      content: `Error: ${error}`,
      type: 'error',
      timestamp: Date.now()
    })
    saveControlSessionToHistory()
  }

  // Prepare an embedded-terminal session: ensure the agent's MCP config points at the live
  // port, then stash spawn params. AgentTerminal.vue registers its PTY listeners and calls
  // ptySpawn once mounted (listener-before-spawn so no initial output is lost).
  // One short line priming the agent: where it is, what's open, and that the canonic MCP tools
  // are available for comments/edits. Injected silently as a system prompt where the CLI
  // supports it; otherwise prepended to the typed first message (still one line, not a wall).
  function buildTerminalContext(agent) {
    // injectContext agents (Pi) can't speak MCP by default. Give them direct, deterministic
    // curl instructions against the local REST API so they don't have to spin figuring it out.
    if (agent?.injectContext) {
      return buildCurlContext()
    }
    const parts = []
    if (workspaceName.value) parts.push(`workspace "${workspaceName.value}"`)
    if (currentFile.value) parts.push(`open doc: ${currentFile.value}`)
    return `Canonic ${parts.join(', ')}. Use the canonic MCP tools to read, comment on, and edit docs here.`
  }

  // Deterministic curl playbook for agents without MCP (Pi). The live port is baked in.
  function buildCurlContext() {
    const port = mcpPort.value
    const base = port ? `http://127.0.0.1:${port}` : 'http://127.0.0.1:<canonic-port>'
    return [
      `You are connected to Canonic, the user's local Markdown doc workspace, through a REST API at ${base}.`,
      `You do NOT have MCP tools — use curl. (If you happen to have an MCP extension, the server is also at ${base}/mcp, but curl is the reliable path.)`,
      ``,
      `FIRST, before anything else, run these two commands and read the output so you know the workspace and what the user is looking at:`,
      `  curl -s ${base}/workspace`,
      `  curl -s ${base}/doc`,
      ``,
      `/workspace returns {name, path, branch, focusedDoc, openDocs, files}. focusedDoc is the doc the user has open right now.`,
      `/doc with no args returns the focused doc as {path, content}.`,
      ``,
      `Then act on docs with these exact commands (paths are relative to the workspace root):`,
      `  Read a doc:      curl -s '${base}/doc?path=Folder/file.md'`,
      `  Write a doc:     curl -s -X POST ${base}/doc -H 'Content-Type: application/json' -d '{"path":"Folder/file.md","content":"...full new markdown..."}'`,
      `  Comment:         curl -s -X POST ${base}/comment -H 'Content-Type: application/json' -d '{"path":"Folder/file.md","text":"your note","anchor":{"quotedText":"exact passage from the doc"}}'`,
      `  Read comments:   curl -s '${base}/comment?path=Folder/file.md'`,
      ``,
      `When the user says "this doc" or gives no path, act on focusedDoc. Writing a doc replaces its entire contents, so read it first and send the full updated markdown.`
    ].join('\n')
  }

  async function startTerminalSession({ prompt } = {}) {
    if (!activeAgentId.value) return null
    const agent = configuredAgents.value.find(a => a.id === activeAgentId.value)
    if (!agent) return null

    const cwd = targetDir.value || workspacePath.value
    const mcpP = mcpPort.value || 0

    // First-run MCP registration for preset agents (skip injectContext agents like Pi).
    if (agent.type === 'preset' && agent.presetId && mcpP && !agent.injectContext) {
      const mcp = await checkMcpRegistration(agent.presetId)
      if (!mcp.registered && !mcp.optedOut && !mcpOptOuts.value[agent.presetId]) {
        await registerMcp(agent.presetId)
      }
    }

    // Context goes in as a silent system prompt where supported (AgentTerminal decides whether to
    // also type it, based on the spawn result). The typed first message is just the user's prompt.
    const trimmed = (prompt || '').trim()

    terminalSession.value = {
      id: crypto.randomUUID(),
      agentId: agent.type === 'custom' ? 'custom' : agent.presetId,
      agentName: agent.name,
      type: agent.type,
      binary: agent.type === 'custom' ? agent.binary : undefined,
      args: agent.type === 'custom' ? agent.args : undefined,
      cwd,
      mcpPort: mcpP,
      systemPrompt: buildTerminalContext(agent),   // context injected silently if the CLI allows (curl playbook for Pi)
      userPrompt: trimmed,                     // raw prompt typed into the TUI
      prompt: trimmed,                         // alias kept for history + resume
      startedAt: Date.now()
    }
    saveTerminalSessionToHistory('running')
    return terminalSession.value
  }

  // Record a terminal session in shared controlHistory. Terminal sessions are PTY-opaque
  // (no captured agent session id), so "resume" = re-launch a fresh terminal with the same
  // agent + cwd + prompt rather than reattaching to the live process.
  function saveTerminalSessionToHistory(status) {
    const s = terminalSession.value
    if (!s) return
    const title = (s.prompt && s.prompt.slice(0, 40)) || `${s.agentName} session`
    const entry = {
      id: s.id,
      title: title + (s.prompt && s.prompt.length > 40 ? '...' : ''),
      agentId: s.agentId,
      agentName: s.agentName,
      flavor: activeFlavor.value,
      cwd: s.cwd,
      prompt: s.prompt || '',
      kind: 'terminal',
      status,
      startedAt: s.startedAt,
      endedAt: status === 'running' ? null : Date.now()
    }
    const idx = controlHistory.value.findIndex(h => h.id === entry.id)
    if (idx >= 0) controlHistory.value[idx] = entry
    else controlHistory.value.unshift(entry)
    if (api.agentControl?.saveHistory) api.agentControl.saveHistory({ session: entry })
  }

  function endTerminalSession() {
    if (terminalSession.value) {
      saveTerminalSessionToHistory('ended')
      if (api.agentControl?.ptyKill) {
        api.agentControl.ptyKill({ sessionId: terminalSession.value.id })
      }
    }
    terminalSession.value = null
  }

  // Re-open a past session: select its agent, then start a fresh terminal with the same prompt.
  async function resumeTerminalFromHistory(entry) {
    if (!entry) return null
    // Match the agent the session ran with (preset id or custom).
    const agent = configuredAgents.value.find(a =>
      (a.type === 'custom' ? 'custom' : a.presetId) === entry.agentId
    )
    if (agent && activeAgentId.value !== agent.id) setActiveAgent(agent.id)
    endTerminalSession()
    return startTerminalSession({ prompt: entry.prompt || '' })
  }

  // Hand the session off to the user's real terminal (system Terminal app), opened in its cwd.
  async function popOutTerminal() {
    const s = terminalSession.value
    if (!s || !api.agentControl?.popOutTerminal) return { error: 'no session' }
    return api.agentControl.popOutTerminal({ agentId: s.agentId, binary: s.binary, cwd: s.cwd })
  }

  // Push the user's current editor view to the MCP server so agents can answer
  // "what am I looking at" (get_open_docs / get_workspace_info) without asking for a path.
  // focusedDoc = the active tab; openDocs = the whole open tray.
  let editorStateDebounce = null;
  function syncEditorState() {
    clearTimeout(editorStateDebounce);
    editorStateDebounce = setTimeout(() => {
      const unsavedChanges = {};
      if (isDirty.value && currentFile.value) {
        unsavedChanges[currentFile.value] = currentContent.value;
      }
      for (const path of Object.keys(unsavedBuffer)) {
        if (unsavedBuffer[path] !== undefined && path !== currentFile.value) {
          unsavedChanges[path] = unsavedBuffer[path];
        }
      }
      api.agentControl?.setEditorState?.({
        focusedDoc: currentFile.value,
        openDocs: [...openTabs.value],
        unsavedChanges
      });
    }, 200);
  }

  watch([currentFile, openTabs, isDirty, currentContent], syncEditorState, { deep: true, immediate: true })

  async function stopControlSession() {
    if (!controlSession.value) return
    await api.agentControl.stopSession({ sessionId: controlSession.value.id })
    controlSession.value.status = 'ended'
    controlStatus.value = 'ended'
    saveControlSessionToHistory()
  }

  async function sendControlMessage(prompt) {
    if (!controlSession.value || !prompt) return
    // Add user message to chat (keep the existing thread visible across turns)
    controlMessages.value.push({
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      type: 'user',
      timestamp: Date.now()
    })

    // A still-running agent (long-lived stdin loop) takes the prompt over stdin.
    if (controlStatus.value === 'running' && api.agentControl?.sendMessage) {
      await api.agentControl.sendMessage({
        sessionId: controlSession.value.id,
        prompt
      })
      return
    }

    // Otherwise the single-shot agent has already exited (print mode). Resume its session
    // so the conversation continues server-side instead of spawning a fresh thread.
    await resumeControlSession(prompt)
  }

  // Re-spawn an exited single-shot agent against its own session id, preserving the chat
  // thread. Relies on agentSessionId having been captured from the agent's structured output.
  async function resumeControlSession(prompt) {
    const sess = controlSession.value
    if (!sess) return

    const agent = configuredAgents.value.find(a => a.id === sess.agentId)
    const previousSessionId = sess.agentSessionId

    if (!api.agentControl?.resume || !previousSessionId) {
      sess.status = 'error'
      controlStatus.value = 'error'
      controlMessages.value.push({
        id: crypto.randomUUID(),
        role: 'agent',
        content: 'Cannot continue this conversation — no resumable session id was captured. Start a new session.',
        type: 'error',
        timestamp: Date.now()
      })
      return
    }

    // Reset per-turn streaming state but KEEP controlMessages (the thread).
    controlStreamBuffer.value = ''
    controlLineBuffer.value = ''
    sess.status = 'running'
    controlStatus.value = 'running'

    const result = await api.agentControl.resume({
      sessionId: sess.id,
      agentId: agent?.type === 'custom' ? 'custom' : (agent?.presetId || sess.agentId),
      previousSessionId,
      cwd: sess.cwd,
      prompt,
      model: sess.model,
      effort: sess.effort,
      mcpPort: mcpPort.value || 0
    })

    if (result?.error) {
      sess.status = 'error'
      controlStatus.value = 'error'
      controlMessages.value.push({
        id: crypto.randomUUID(),
        role: 'agent',
        content: `Error: ${result.error}`,
        type: 'error',
        timestamp: Date.now()
      })
    }
  }

  async function openInTerminal() {
    if (!controlSession.value) return
    await api.agentControl.openInTerminal({
      sessionId: controlSession.value.id,
      agentId: controlSession.value.agentId,
      resumeId: controlSession.value.id,
      agentSessionId: controlSession.value.agentSessionId || null
    })
  }

  function saveControlSessionToHistory() {
    if (!controlSession.value || controlMessages.value.length === 0) return
    const firstUserMsg = controlMessages.value.find(m => m.role === 'user')
    const title = firstUserMsg?.content?.slice(0, 40) || 'Empty session'
    const entry = {
      id: controlSession.value.id,
      title: title + (firstUserMsg?.content?.length > 40 ? '...' : ''),
      agentId: controlSession.value.agentId,
      agentName: controlSession.value.agentName,
      model: controlSession.value.model,
      effort: controlSession.value.effort,
      flavor: controlSession.value.flavor,
      cwd: controlSession.value.cwd,
      status: controlSession.value.status,
      startedAt: controlSession.value.startedAt,
      endedAt: Date.now(),
      messageCount: controlMessages.value.length
    }
    // Update if already exists, else add
    const idx = controlHistory.value.findIndex(h => h.id === entry.id)
    if (idx >= 0) {
      controlHistory.value[idx] = entry
    } else {
      controlHistory.value.unshift(entry)
    }
    // Persist
    if (api.agentControl?.saveHistory) {
      api.agentControl.saveHistory({ session: entry })
    }
  }

  async function loadControlHistory() {
    if (api.agentControl?.getHistory) {
      controlHistory.value = await api.agentControl.getHistory()
    }
  }

  async function deleteControlHistoryEntry(sessionId) {
    if (api.agentControl?.deleteHistory) {
      await api.agentControl.deleteHistory({ sessionId })
    }
    controlHistory.value = controlHistory.value.filter(h => h.id !== sessionId)
  }

  // ── AI Control: MCP actions ─────────────────────────────────────────────
  async function loadMcpPort() {
    if (api.agentControl?.getMcpPort) {
      const result = await api.agentControl.getMcpPort()
      if (result.port) mcpPort.value = result.port
    }
  }

  async function checkMcpRegistration(agentId) {
    if (api.agentControl?.checkMcp) {
      return await api.agentControl.checkMcp({ agentId })
    }
    return { registered: false }
  }

  async function registerMcp(agentId) {
    if (api.agentControl?.registerMcp) {
      return await api.agentControl.registerMcp({ agentId, port: mcpPort.value })
    }
    return { ok: false }
  }

  async function optOutMcp(agentId) {
    if (api.agentControl?.optOutMcp) {
      await api.agentControl.optOutMcp({ agentId })
    }
    mcpOptOuts.value[agentId] = true
  }

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
    const idx = peerFileComments.value.findIndex((c) => c.id === id);
    if (idx >= 0)
      peerFileComments.value[idx] = {
        ...peerFileComments.value[idx],
        ...patch,
      };
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
    loadRecents,
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
    splitStacked,
    isSmallScreen,
    distractionFreeMode,
    isCompactLayout,
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
    refPanes,
    activePane,
    flatDocList,
    addRefPane,
    removeRefPane,
    setRefPaneFile,
    setActivePane,
    savePaneFile,
    openTabs,
    tabsEnabled,
    tabsPosition,
    closeTab,
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
    deleteAgentComments,
    confirmDialog,
    confirm,
    resolveConfirm,
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
    externalChangeNotice,
    editorRevision,
    externalReloadAt,
    reloadCurrentFromDisk,
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

    // ── AI Control exports ──
    agentPresets,
    configuredAgents,
    activeAgentId,
    activeModel,
    activeEffort,
    activeFlavor,
    targetDir,
    controlSession,
    terminalSession,
    controlMessages,
    controlStatus,
    controlTokenCount,
    controlHasRealTokens,
    controlStreamBuffer,
    controlLineBuffer,
    controlHistory,
    mcpPort,
    mcpOptOuts,
    availableModels,
    modelsLoading,
    defaultModelHint,
    openModelSelector,
    loadAgentPresets,
    loadConfiguredAgents,
    addCustomAgent,
    removeCustomAgent,
    setActiveAgent,
    setAgentModel,
    setAgentEffort,
    setActiveFlavor,
    openAgentPanel,
    setTargetDir,
    pickTargetDirectory,
    hydrateAgentControlPrefs,
    discoverAgentModels,
    startControlSession,
    sendControlMessage,
    handleControlStdout,
    handleControlStderr,
    handleControlExit,
    handleControlError,
    stopControlSession,
    startTerminalSession,
    endTerminalSession,
    resumeTerminalFromHistory,
    popOutTerminal,
    openInTerminal,
    loadControlHistory,
    deleteControlHistoryEntry,
    checkMcpRegistration,
    loadMcpPort,
    registerMcp,
    optOutMcp,

    // ── File tree keyboard navigation (yazi-style) ──
    treeFocused,
    treeFilter,
    treeFocusIndex,
    treeUndoStack,
    flatVisibleTree,
    focusTree,
    blurTree,
    navigateTree,
    expandCollapseTree,
    openFocused,
    leftOnTree,
    rightOnTree,
    trashFocused,
    undoLastTrash,
    setTreeFilter,
    setTreeDirOpen,
    treeOpenDirs,
    treeShowMoveFor,
    moveFocused,
    treeFilterMatches,
    navigateToPath,
  };
});
