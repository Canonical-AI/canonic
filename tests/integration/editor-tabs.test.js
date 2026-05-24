import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";
import { useAppStore } from "../../src/store/index.js";

const mockFiles = {};

const mockApi = {
  config: {
    read: vi.fn().mockResolvedValue({ displayName: "Test" }),
    write: vi.fn(async (cfg) => ({ success: true, config: cfg })),
    exists: vi.fn(),
    validate: vi.fn(),
  },
  workspace: {
    init: vi.fn().mockResolvedValue({ path: "/ws" }),
    getDefault: vi.fn().mockResolvedValue("/home/user/workspaces/blank"),
    openDialog: vi.fn(),
    openDirectoryDialog: vi.fn(),
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
    branches: vi
      .fn()
      .mockResolvedValue({ branches: ["main"], current: "main" }),
    createBranch: vi.fn(),
    checkout: vi.fn().mockResolvedValue({ success: true }),
    merge: vi.fn(),
    diff: vi.fn(),
    readCommit: vi.fn(),
    status: vi.fn(),
    fileStatus: vi.fn().mockResolvedValue({ isUncommitted: false }),
  },
  comments: {
    get: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
    move: vi.fn(),
  },
  search: { query: vi.fn().mockResolvedValue([]), index: vi.fn() },
  share: {
    start: vi.fn(),
    stop: vi.fn(),
    openLink: vi.fn(),
    openShared: vi.fn(),
    onStats: vi.fn(),
  },
  peers: { list: vi.fn().mockResolvedValue([]) },
  cleanup: { resetConfig: vi.fn(), deleteWorkspace: vi.fn(), getPaths: vi.fn() },
  update: {
    check: vi.fn(),
    install: vi.fn(),
    onAvailable: vi.fn(),
    onDownloaded: vi.fn(),
  },
  docBranches: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue({ success: true }),
  },
  versions: { list: vi.fn().mockResolvedValue([]), save: vi.fn(), delete: vi.fn() },
  ai: {
    chat: vi.fn(),
    onChunk: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    removeListeners: vi.fn(),
  },
};

const mockLocalStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};
vi.stubGlobal("localStorage", mockLocalStorage);
vi.stubGlobal("window", { canonic: mockApi, localStorage: mockLocalStorage });

describe("editor tabs", () => {
  let store;

  beforeEach(async () => {
    setActivePinia(createPinia());
    store = useAppStore();
    Object.keys(mockFiles).forEach((k) => delete mockFiles[k]);
    vi.clearAllMocks();
    store.workspacePath = "/ws";
    store.workspaceName = "ws";
    mockFiles["a.md"] = "# A";
    mockFiles["b.md"] = "# B";
    mockFiles["c.md"] = "# C";
    await store.refreshFiles();
  });

  it("default tabs enabled and positioned at bottom", () => {
    expect(store.tabsEnabled).toBe(true);
    expect(store.tabsPosition).toBe("bottom");
  });

  it("opening files appends tabs in open order", async () => {
    await store.openFile("a.md");
    await store.openFile("b.md");
    await store.openFile("c.md");
    expect(store.openTabs).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("re-opening an already-tabbed file does not duplicate it", async () => {
    await store.openFile("a.md");
    await store.openFile("b.md");
    await store.openFile("a.md");
    expect(store.openTabs).toEqual(["a.md", "b.md"]);
    expect(store.currentFile).toBe("a.md");
  });

  it("closeTab() removes a non-active tab without changing active doc", async () => {
    await store.openFile("a.md");
    await store.openFile("b.md");
    await store.openFile("c.md");
    store.closeTab("a.md");
    expect(store.openTabs).toEqual(["b.md", "c.md"]);
    expect(store.currentFile).toBe("c.md");
  });

  it("closeTab() on active tab activates the next neighbor", async () => {
    await store.openFile("a.md");
    await store.openFile("b.md");
    await store.openFile("c.md");
    await store.openFile("b.md"); // make b active
    store.closeTab("b.md");
    await nextTick();
    expect(store.openTabs).toEqual(["a.md", "c.md"]);
    expect(store.currentFile).toBe("c.md");
  });

  it("closeTab() on active tab with no right neighbor activates previous", async () => {
    await store.openFile("a.md");
    await store.openFile("b.md");
    store.closeTab("b.md");
    await nextTick();
    expect(store.openTabs).toEqual(["a.md"]);
    expect(store.currentFile).toBe("a.md");
  });

  it("closeTab() on the only tab clears active doc", async () => {
    await store.openFile("a.md");
    store.closeTab("a.md");
    expect(store.openTabs).toEqual([]);
    expect(store.currentFile).toBe(null);
  });

  it("closing a tab keeps unsaved edits buffered for re-open", async () => {
    await store.openFile("a.md");
    store.currentContent = "edited A";
    store.isDirty = true;
    await store.openFile("b.md");
    store.closeTab("a.md");
    expect(store.openTabs).toEqual(["b.md"]);
    await store.openFile("a.md");
    expect(store.currentContent).toBe("edited A");
    expect(store.isDirty).toBe(true);
  });

  it("renameFile() rewrites the tab path in place", async () => {
    await store.openFile("a.md");
    await store.openFile("b.md");
    await store.renameFile("a.md", "alpha");
    expect(store.openTabs).toEqual(["alpha.md", "b.md"]);
  });

  it("deleteFile() drops the tab", async () => {
    await store.openFile("a.md");
    await store.openFile("b.md");
    await store.deleteFile("a.md");
    expect(store.openTabs).toEqual(["b.md"]);
  });

  it("openWorkspace() clears tabs", async () => {
    await store.openFile("a.md");
    await store.openFile("b.md");
    await store.openWorkspace("/ws2", "blank");
    expect(store.openTabs).toEqual([]);
  });

  it("config tabsEnabled=false disables tabs in the store", async () => {
    mockApi.config.read.mockResolvedValueOnce({
      displayName: "Test",
      tabsEnabled: false,
      tabsPosition: "top",
    });
    await store.loadConfig();
    expect(store.tabsEnabled).toBe(false);
    expect(store.tabsPosition).toBe("top");
  });
});
