import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";
import { useAppStore } from "../../src/store/index.js";

const mockFiles = {};

// Let async watchers (currentFile promotion) and the openFile chain settle.
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

describe("split panels", () => {
  let store;

  beforeEach(async () => {
    setActivePinia(createPinia());
    store = useAppStore();
    Object.keys(mockFiles).forEach((k) => delete mockFiles[k]);
    vi.clearAllMocks();
    store.workspacePath = "/ws";
    store.workspaceName = "ws";
    mockFiles["a.md"] = "# A\n\nAlpha.";
    mockFiles["b.md"] = "# B\n\nBravo.";
    mockFiles["c.md"] = "# C\n\nCharlie.";
    mockFiles["d.md"] = "# D\n\nDelta.";
    await store.refreshFiles();
    await store.openFile("a.md");
  });

  it("flatDocList flattens the file tree to path/name entries", () => {
    const paths = store.flatDocList.map((d) => d.path).sort();
    expect(paths).toEqual(["a.md", "b.md", "c.md", "d.md"]);
  });

  it("addRefPane() opens a reference pane", () => {
    store.addRefPane("b.md");
    expect(store.refPanes).toEqual(["b.md"]);
  });

  it("addRefPane() ignores the active document", () => {
    store.addRefPane("a.md");
    expect(store.refPanes).toEqual([]);
  });

  it("addRefPane() ignores a duplicate path", () => {
    store.addRefPane("b.md");
    store.addRefPane("b.md");
    expect(store.refPanes).toEqual(["b.md"]);
  });

  it("addRefPane() caps at two reference panes", () => {
    store.addRefPane("b.md");
    store.addRefPane("c.md");
    store.addRefPane("d.md");
    expect(store.refPanes).toEqual(["b.md", "c.md"]);
  });

  it("removeRefPane() closes a pane", () => {
    store.addRefPane("b.md");
    store.addRefPane("c.md");
    store.removeRefPane(0);
    expect(store.refPanes).toEqual(["c.md"]);
  });

  it("setRefPaneFile() changes the document shown in a pane", () => {
    store.addRefPane("b.md");
    store.setRefPaneFile(0, "c.md");
    expect(store.refPanes).toEqual(["c.md"]);
  });

  it("setRefPaneFile() drops the pane when the picked doc is the active doc", () => {
    store.addRefPane("b.md");
    store.setRefPaneFile(0, "a.md");
    expect(store.refPanes).toEqual([]);
  });

  it("setActivePane() focuses a pane without swapping its content", () => {
    store.addRefPane("b.md");
    store.setActivePane("b.md");
    expect(store.activePane).toBe("b.md");
    // No swap: the primary doc and the pane stay in place.
    expect(store.currentFile).toBe("a.md");
    expect(store.refPanes).toEqual(["b.md"]);
  });

  it("savePaneFile() writes pane edits to disk for an arbitrary path", async () => {
    store.addRefPane("b.md");
    await store.savePaneFile("b.md", "# B\n\nEdited in pane.");
    expect(mockFiles["b.md"]).toBe("# B\n\nEdited in pane.\n");
    expect(store.currentFile).toBe("a.md"); // primary doc untouched
  });

  it("setRefPaneFile() carries the active marker to the new path", () => {
    store.addRefPane("b.md");
    store.setActivePane("b.md");
    store.setRefPaneFile(0, "c.md");
    expect(store.refPanes).toEqual(["c.md"]);
    expect(store.activePane).toBe("c.md");
  });

  it("removeRefPane() resets the active pane back to main", () => {
    store.addRefPane("b.md");
    store.setActivePane("b.md");
    store.removeRefPane(0);
    expect(store.activePane).toBe("main");
  });

  it("openFile() refocuses the primary editor", async () => {
    store.addRefPane("b.md");
    store.setActivePane("b.md");
    await store.openFile("c.md");
    expect(store.activePane).toBe("main");
  });

  it("openFile() removes a doc from the panes when it becomes active", async () => {
    store.addRefPane("b.md");
    store.addRefPane("c.md");
    await store.openFile("b.md");
    expect(store.currentFile).toBe("b.md");
    expect(store.refPanes).toEqual(["c.md"]);
  });

  it("promotes a reference pane when the active doc is deleted", async () => {
    store.addRefPane("b.md");
    await store.deleteFile("a.md");
    await flush();
    expect(store.currentFile).toBe("b.md");
    expect(store.refPanes).toEqual([]);
  });

  it("renameFile() keeps the path of a referenced pane in sync", async () => {
    store.addRefPane("b.md");
    await store.renameFile("b.md", "bravo");
    expect(store.refPanes).toEqual(["bravo.md"]);
  });

  it("openWorkspace() resets reference panes", async () => {
    store.addRefPane("b.md");
    await store.openWorkspace("/ws2", "blank");
    expect(store.refPanes).toEqual([]);
  });

  it("splitStacked persists to localStorage", async () => {
    expect(typeof store.splitStacked).toBe("boolean");
    store.splitStacked = false;
    await nextTick();
    expect(localStorage.getItem("canonic:splitStacked")).toBe("false");
    store.splitStacked = true;
    await nextTick();
    expect(localStorage.getItem("canonic:splitStacked")).toBe("true");
  });
});
