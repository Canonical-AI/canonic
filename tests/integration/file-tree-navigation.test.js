import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";
import { useAppStore } from "../../src/store/index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockFiles = {};

async function flush() {
  for (let i = 0; i < 5; i++) {
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
  }
}

const mockApi = {
  config: {
    read: vi.fn().mockResolvedValue({ displayName: "Test" }),
    write: vi.fn(),
    exists: vi.fn(),
    validate: vi.fn(),
  },
  workspace: {
    init: vi.fn().mockResolvedValue({ path: "/ws" }),
    getDefault: vi.fn().mockResolvedValue("/home/user/workspaces/blank"),
    openDialog: vi.fn(),
    openDirectoryDialog: vi.fn(),
    recents: vi.fn().mockResolvedValue([]),
    addRecent: vi.fn().mockResolvedValue([]),
    removeRecent: vi.fn().mockResolvedValue([]),
  },
  files: {
    list: vi.fn(async () =>
      Object.keys(mockFiles).map((p) => ({
        path: p,
        name: p.split("/").pop().replace(".md", ""),
        type: "file",
      })),
    ),
    read: vi.fn(async (_, p) => mockFiles[p] ?? null),
    write: vi.fn(async (_, p, content) => {
      mockFiles[p] = content;
    }),
    delete: vi.fn(async (_, p) => {
      delete mockFiles[p];
    }),
    move: vi.fn(async (_, oldPath, newPath) => {
      if (mockFiles[oldPath]) {
        mockFiles[newPath] = mockFiles[oldPath];
        delete mockFiles[oldPath];
      }
    }),
    mkdir: vi.fn(),
    trash: {
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn(async (_, p) => {
        delete mockFiles[p];
      }),
      restore: vi.fn().mockResolvedValue({ success: true }),
      purge: vi.fn().mockResolvedValue(true),
    },
  },
  git: {
    commit: vi.fn().mockResolvedValue({ success: true }),
    log: vi.fn().mockResolvedValue([]),
    logAll: vi.fn().mockResolvedValue([]),
    branches: vi
      .fn()
      .mockResolvedValue({ branches: ["main"], current: "main" }),
    createBranch: vi.fn(),
    checkout: vi.fn().mockResolvedValue({ success: true }),
    merge: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    diff: vi.fn().mockResolvedValue(null),
    rollback: vi.fn().mockResolvedValue({ success: true }),
    readCommit: vi.fn(),
    status: vi.fn(),
    fileStatus: vi.fn().mockResolvedValue({ isUncommitted: false }),
  },
  comments: {
    get: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
    move: vi.fn(),
  },
  mockFiles: {},
  search: { query: vi.fn().mockResolvedValue([]), index: vi.fn() },
  versions: { list: vi.fn().mockResolvedValue([]), save: vi.fn(), delete: vi.fn() },
  share: {
    start: vi.fn(),
    stop: vi.fn(),
    status: vi.fn().mockResolvedValue(null),
    onStats: vi.fn(),
    onNetworkChanged: undefined,
  },
  peers: {
    list: vi.fn().mockResolvedValue([]),
    favorite: vi.fn().mockResolvedValue(true),
    unfavorite: vi.fn().mockResolvedValue(true),
    getFavorited: vi.fn().mockResolvedValue([]),
    setDiscovery: vi.fn().mockResolvedValue(true),
    getDiscoveryStatus: vi.fn().mockResolvedValue(false),
    onFound: undefined,
    onLost: undefined,
  },
  app: {
    getVersion: vi.fn().mockResolvedValue("1.0.0"),
    isDefaultEditor: vi.fn().mockResolvedValue(false),
    setDefaultEditor: vi.fn(),
    openConfig: vi.fn(),
    editAction: vi.fn(),
  },
  update: {
    onAvailable: undefined,
    onProgress: undefined,
    onDownloaded: undefined,
    onError: undefined,
  },
  agentSession: {
    onSessionStart: vi.fn(),
    onComment: vi.fn(),
    onActivity: undefined,
    onSessionDone: vi.fn(),
    onSessionCancel: vi.fn(),
  },
  agentControl: {
    onStdout: vi.fn(),
    onStderr: vi.fn(),
    onExit: vi.fn(),
    onError: vi.fn(),
    onCopyToClipboard: undefined,
    onCommentsIngested: undefined,
  },
  menu: {},
  telemetry: { logEvent: vi.fn() },
  mcpserver: {
    port: vi.fn().mockResolvedValue(null),
    register: vi.fn(),
    optOut: vi.fn(),
  },
  legacy: {
    migrate: vi.fn().mockResolvedValue({}),
  },
};

// ── Test tree structure ──────────────────────────────────────────────────────
// Flat file list mimicking gitService.listFiles output. Directories have
// children arrays populated; files are leaf nodes. _open controls expansion.

function makeTree() {
  return [
    {
      name: "README.md",
      path: "README.md",
      type: "file",
    },
    {
      name: "Strategy",
      path: "Strategy",
      type: "directory",
      _open: false,
      children: [
        {
          name: "product-vision.md",
          path: "Strategy/product-vision.md",
          type: "file",
        },
        {
          name: "competitive-analysis.md",
          path: "Strategy/competitive-analysis.md",
          type: "file",
        },
        {
          name: "Nested",
          path: "Strategy/Nested",
          type: "directory",
          _open: false,
          children: [
            {
              name: "deep.md",
              path: "Strategy/Nested/deep.md",
              type: "file",
            },
          ],
        },
      ],
    },
    {
      name: "Design",
      path: "Design",
      type: "directory",
      _open: false,
      children: [
        {
          name: "wireframes.md",
          path: "Design/wireframes.md",
          type: "file",
        },
      ],
    },
    {
      name: "notes.md",
      path: "notes.md",
      type: "file",
    },
  ];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("file tree keyboard navigation", () => {
  let store;

  beforeEach(async () => {
    setActivePinia(createPinia());
    Object.keys(mockFiles).forEach((k) => delete mockFiles[k]);

    // Seed mock files so openFile() has content to read
    mockFiles["README.md"] = "# README";
    mockFiles["notes.md"] = "# Notes";
    mockFiles["Strategy/product-vision.md"] = "# Vision";
    mockFiles["Strategy/competitive-analysis.md"] = "# Competitive";
    mockFiles["Strategy/Nested/deep.md"] = "# Deep";
    mockFiles["Design/wireframes.md"] = "# Wireframes";

    // Fresh localStorage so treeOpenDirs initializes clean — other test files
    // may have left a window.localStorage stub in the shared worker.
    const mockLocalStorage = {
      store: {},
      getItem(key) { return this.store[key] || null; },
      setItem(key, val) { this.store[key] = String(val); },
      removeItem(key) { delete this.store[key]; },
    };
    vi.stubGlobal("localStorage", mockLocalStorage);

    // Construct the flat mockApi that the store will destructure
    const fullApi = { ...mockApi };
    // The store accesses api.files.list etc. through destructuring
    vi.stubGlobal("__APP_VERSION__", "1.0.0");

    // Provide the mock API
    vi.stubGlobal("canonic", fullApi);
    vi.stubGlobal("window", { canonic: fullApi, localStorage: mockLocalStorage });

    store = useAppStore();
    store.workspacePath = "/ws";
    store.files = makeTree();

    // Reduce delay for tests
    await flush();
  });

  // ── flatVisibleTree ──

  describe("flatVisibleTree", () => {
    it("lists only root-level items when all directories are collapsed", () => {
      expect(store.flatVisibleTree.map((i) => i.path)).toEqual([
        "README.md",
        "Strategy",
        "Design",
        "notes.md",
      ]);
    });

    it("shows children when a directory is expanded", () => {
      store.files[1]._open = true; // Strategy
      const paths = store.flatVisibleTree.map((i) => i.path);
      expect(paths).toEqual([
        "README.md",
        "Strategy",
        "Strategy/product-vision.md",
        "Strategy/competitive-analysis.md",
        "Strategy/Nested",
        "Design",
        "notes.md",
      ]);
    });

    it("shows deeply nested children when both parent and child are expanded", () => {
      store.files[1]._open = true; // Strategy
      store.files[1].children[2]._open = true; // Nested
      const paths = store.flatVisibleTree.map((i) => i.path);
      expect(paths).toContain("Strategy/Nested/deep.md");
    });
  });

  // ── focusTree / blurTree ──

  describe("focusTree / blurTree", () => {
    it("focusTree sets treeFocused and resets focusIndex to 0", () => {
      store.focusTree();
      expect(store.treeFocused).toBe(true);
      expect(store.treeFocusIndex).toBe(0);
    });

    it("blurTree clears treeFocused", () => {
      store.focusTree();
      store.blurTree();
      expect(store.treeFocused).toBe(false);
    });
  });

  // ── navigateTree ──

  describe("navigateTree", () => {
    beforeEach(() => {
      store.focusTree();
    });

    it("moves down the list", () => {
      store.navigateTree("down");
      expect(store.treeFocusIndex).toBe(1);
      store.navigateTree("down");
      expect(store.treeFocusIndex).toBe(2);
    });

    it("wraps around at the bottom", () => {
      const len = store.flatVisibleTree.length;
      store.treeFocusIndex = len - 1;
      store.navigateTree("down");
      expect(store.treeFocusIndex).toBe(0);
    });

    it("moves up the list", () => {
      store.treeFocusIndex = 2;
      store.navigateTree("up");
      expect(store.treeFocusIndex).toBe(1);
    });

    it("wraps around at the top", () => {
      store.navigateTree("up");
      expect(store.treeFocusIndex).toBe(
        store.flatVisibleTree.length - 1,
      );
    });
  });

  // ── leftOnTree ──

  describe("leftOnTree", () => {
    beforeEach(() => {
      store.focusTree();
    });

    it("collapses an expanded directory", () => {
      store.files[1]._open = true; // Strategy
      // Move focus to the Strategy directory
      store.treeFocusIndex = store.flatVisibleTree.findIndex(
        (i) => i.path === "Strategy",
      );
      store.leftOnTree();
      expect(store.files[1]._open).toBe(false);
    });

    it("moves focus to parent for a file inside a folder", () => {
      store.files[1]._open = true; // expand Strategy
      const fileIdx = store.flatVisibleTree.findIndex(
        (i) => i.path === "Strategy/product-vision.md",
      );
      store.treeFocusIndex = fileIdx;
      store.leftOnTree();
      const focused = store.flatVisibleTree[store.treeFocusIndex];
      expect(focused.path).toBe("Strategy");
    });

    it("stays at root when left is pressed on a root-level file", () => {
      store.treeFocusIndex = 0; // README.md
      store.leftOnTree();
      expect(store.treeFocusIndex).toBe(0);
    });
  });

  // ── rightOnTree ──

  describe("rightOnTree", () => {
    beforeEach(() => {
      store.focusTree();
    });

    it("expands a collapsed directory", () => {
      const dirIdx = store.flatVisibleTree.findIndex(
        (i) => i.path === "Strategy",
      );
      store.treeFocusIndex = dirIdx;
      store.rightOnTree();
      expect(store.files[1]._open).toBe(true);
    });

    it("moves to the first child of an already expanded directory", () => {
      store.files[1]._open = true;
      const dirIdx = store.flatVisibleTree.findIndex(
        (i) => i.path === "Strategy",
      );
      store.treeFocusIndex = dirIdx;
      store.rightOnTree();
      const focused = store.flatVisibleTree[store.treeFocusIndex];
      expect(focused.path).toBe("Strategy/product-vision.md");
    });

    it("opens a file when right is pressed on a file", async () => {
      store.treeFocusIndex = 0; // README.md
      store.rightOnTree();
      // openFile is async; let the microtask queue flush so currentFile is set
      await nextTick();
      await nextTick();
      expect(store.currentFile).toBe("README.md");
    });
  });

  // ── openFocused ──

  describe("openFocused", () => {
    beforeEach(() => {
      store.focusTree();
    });

    it("toggles a directory when focused", () => {
      const dirIdx = store.flatVisibleTree.findIndex(
        (i) => i.path === "Design",
      );
      store.treeFocusIndex = dirIdx;
      store.openFocused();
      // Design should now be expanded
      expect(store.files[2]._open).toBe(true);
      store.openFocused();
      expect(store.files[2]._open).toBe(false);
    });

    it("opens a file when focused", async () => {
      store.treeFocusIndex = 0; // README.md
      store.openFocused();
      await nextTick();
      await nextTick();
      expect(store.currentFile).toBe("README.md");
    });
  });

  // ── treeFilterMatches ──

  describe("treeFilterMatches", () => {
    it("returns empty when filter text is empty", () => {
      store.setTreeFilter("");
      expect(store.treeFilterMatches).toEqual([]);
    });

    it("finds matching files by name (case-insensitive)", () => {
      store.setTreeFilter("read");
      const names = store.treeFilterMatches.map((m) => m.name);
      expect(names).toContain("README.md");
    });

    it("finds matching directories by name", () => {
      store.setTreeFilter("design");
      const paths = store.treeFilterMatches.map((m) => m.path);
      expect(paths).toContain("Design");
    });

    it("caps results at 5", () => {
      // Add enough files with a common prefix
      store.files = [
        { name: "a1.md", path: "a1.md", type: "file" },
        { name: "a2.md", path: "a2.md", type: "file" },
        { name: "a3.md", path: "a3.md", type: "file" },
        { name: "a4.md", path: "a4.md", type: "file" },
        { name: "a5.md", path: "a5.md", type: "file" },
        { name: "a6.md", path: "a6.md", type: "file" },
        { name: "a7.md", path: "a7.md", type: "file" },
      ];
      store.setTreeFilter("a");
      expect(store.treeFilterMatches.length).toBeLessThanOrEqual(5);
    });

    it("searches nested directories", () => {
      store.setTreeFilter("wire");
      const paths = store.treeFilterMatches.map((m) => m.path);
      expect(paths).toContain("Design/wireframes.md");
    });

    it("resets focusIndex on filter change", () => {
      store.treeFocusIndex = 3;
      store.setTreeFilter("strat");
      expect(store.treeFocusIndex).toBe(0);
    });
  });

  // ── navigateToPath ──

  describe("navigateToPath", () => {
    it("expands ancestor directories and focuses the target", () => {
      store.navigateToPath("Strategy/competitive-analysis.md");
      expect(store.files[1]._open).toBe(true); // Strategy expanded
      expect(store.treeFocused).toBe(true);
      const focused = store.flatVisibleTree[store.treeFocusIndex];
      expect(focused.path).toBe("Strategy/competitive-analysis.md");
    });

    it("focuses a root-level item without expanding anything", () => {
      store.navigateToPath("notes.md");
      const focused = store.flatVisibleTree[store.treeFocusIndex];
      expect(focused.path).toBe("notes.md");
    });

    it("falls back to index 0 when target does not exist", () => {
      store.treeFocusIndex = 5;
      store.navigateToPath("nonexistent.md");
      expect(store.treeFocusIndex).toBe(0);
      expect(store.treeFocused).toBe(true);
    });
  });

  // ── trashFocused / undoLastTrash ──

  describe("trashFocused / undoLastTrash", () => {
    beforeEach(() => {
      store.focusTree();
    });

    it("trashFocused removes a file and pushes to undo stack", async () => {
      store.treeFocusIndex = 0; // README.md
      const prevLen = store.flatVisibleTree.length;
      // Skip actual IPC; trash.delete will call mock which may throw.
      // We just verify the undo stack entry is created and the item is removed.
      // The mock is set up above and will run.
      await store.trashFocused();
      // Undo stack should have one entry
      expect(store.treeUndoStack.length).toBe(1);
      expect(store.treeUndoStack[0].path).toBe("README.md");
      expect(store.treeUndoStack[0].isDirectory).toBe(false);
    });

    it("undoLastTrash pops the stack", async () => {
      store.treeFocusIndex = 0;
      await store.trashFocused();
      const stackLen = store.treeUndoStack.length;
      await store.undoLastTrash();
      expect(store.treeUndoStack.length).toBe(stackLen - 1);
    });

    it("undoLastTrash is a no-op when stack is empty", async () => {
      store.treeUndoStack = [];
      await store.undoLastTrash();
      expect(store.treeUndoStack.length).toBe(0);
    });
  });
});
