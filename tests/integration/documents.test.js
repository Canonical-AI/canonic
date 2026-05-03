import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAppStore } from "../../src/store/index.js";

const mockFiles = {};

const mockApi = {
  config: {
    read: vi
      .fn()
      .mockResolvedValue({ displayName: "Test", model: "claude-sonnet-4-6" }),
    write: vi.fn(),
    exists: vi.fn(),
    validate: vi.fn(),
  },
  workspace: {
    init: vi.fn().mockResolvedValue({ path: "/ws" }),
    getDefault: vi.fn(),
    openDialog: vi.fn(),
    openDirectoryDialog: vi.fn(),
  },
  files: {
    list: vi.fn(async () =>
      Object.entries(mockFiles).map(([p]) => ({
        path: p,
        name: p.replace(".md", ""),
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
    newDoc: vi.fn(async (_, name) => {
      const p = `${name}.md`;
      mockFiles[p] = `# ${name}\n`;
      return p;
    }),
    move: vi.fn(async (_, oldPath, newPath) => {
      if (mockFiles[oldPath]) {
        mockFiles[newPath] = mockFiles[oldPath];
        delete mockFiles[oldPath];
      }
    }),
    trash: {
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({ success: true }),
      restore: vi.fn().mockResolvedValue({ success: true }),
      purge: vi.fn().mockResolvedValue(true),
    },
  },
  git: {
    commit: vi.fn().mockResolvedValue({ success: true, oid: "abc123" }),
    log: vi.fn().mockResolvedValue([]),
    branches: vi
      .fn()
      .mockResolvedValue({ branches: ["main"], current: "main" }),
    createBranch: vi.fn(),
    checkout: vi.fn(),
    merge: vi.fn(),
    diff: vi.fn(),
    readCommit: vi.fn(),
    status: vi.fn(),
    logAll: vi.fn(async () => {
      throw new Error("logAll not implemented");
    }),
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
  },
  peers: { list: vi.fn().mockResolvedValue([]) },
  cleanup: {
    resetConfig: vi.fn(),
    deleteWorkspace: vi.fn(),
    getPaths: vi.fn(),
  },
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
  versions: {
    list: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
    delete: vi.fn(),
  },
  ai: {
    chat: vi.fn(),
    onChunk: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    removeListeners: vi.fn(),
  },
};

vi.stubGlobal("window", { canonic: mockApi });

describe("document CRUD", () => {
  let store;

  beforeEach(async () => {
    setActivePinia(createPinia());
    store = useAppStore();
    // Clear in-memory file store
    Object.keys(mockFiles).forEach((k) => delete mockFiles[k]);
    vi.clearAllMocks();
    // Set up workspace
    store.workspacePath = "/ws";
    store.workspaceName = "ws";
  });

  // CREATE
  it("createFile() creates a new md file and opens it", async () => {
    await store.createFile("meeting-notes");

    expect(mockFiles["meeting-notes.md"]).toBeDefined();
    expect(store.currentFile).toBe("meeting-notes.md");
    expect(store.currentContent).toBe("# meeting-notes\n");
  });

  it("createFile() appears in file list", async () => {
    await store.createFile("roadmap");
    await store.refreshFiles();

    expect(store.files.some((f) => f.path === "roadmap.md")).toBe(true);
  });

  // READ
  it("openFile() loads content into store", async () => {
    mockFiles["vision.md"] = "# Vision\n\nOur north star is clarity.";
    await store.openFile("vision.md");

    expect(store.currentFile).toBe("vision.md");
    expect(store.currentContent).toBe("# Vision\n\nOur north star is clarity.");
    expect(store.isDirty).toBe(false);
  });

  it("openFile() indexes content for search", async () => {
    mockFiles["spec.md"] = "# Spec\n\nDetails here.";
    await store.openFile("spec.md");

    expect(mockApi.search.index).toHaveBeenCalledWith(
      "/ws",
      "spec.md",
      "# Spec\n\nDetails here.",
    );
  });

  it("openFile() loads associated comments", async () => {
    mockFiles["doc.md"] = "# Doc";
    mockApi.comments.get.mockResolvedValueOnce([
      { id: "c1", text: "hello", resolved: false, anchor: {} },
    ]);
    await store.openFile("doc.md");

    expect(store.comments).toHaveLength(1);
    expect(store.comments[0].id).toBe("c1");
  });

  // UPDATE
  it("saveFile() writes content and clears dirty flag", async () => {
    store.currentFile = "notes.md";
    store.isDirty = true;
    await store.saveFile("# Notes\n\nUpdated content.");

    expect(mockFiles["notes.md"]).toBe("# Notes\n\nUpdated content.\n");
    expect(store.isDirty).toBe(false);
    expect(store.currentContent).toBe("# Notes\n\nUpdated content.\n");
  });

  it("commitFile() commits the current file and reloads log", async () => {
    store.currentFile = "plan.md";
    mockApi.git.commit.mockResolvedValueOnce({
      success: true,
      oid: "deadbeef",
    });
    mockApi.git.log.mockResolvedValueOnce([
      { oid: "deadbeef", message: "Add plan\n" },
    ]);

    const result = await store.commitFile("Add plan");

    expect(result.success).toBe(true);
    expect(store.commitLog).toHaveLength(1);
    expect(store.commitLog[0].message.trim()).toBe("Add plan");
  });

  it("renameFile() moves content to new path and updates currentFile", async () => {
    mockFiles["old-name.md"] = "# Old name";
    store.currentFile = "old-name.md";
    mockApi.files.read.mockResolvedValueOnce("# Old name");

    const newPath = await store.renameFile("old-name.md", "new-name");

    expect(newPath).toBe("new-name.md");
    expect(store.currentFile).toBe("new-name.md");
    expect(mockApi.files.move).toHaveBeenCalledWith(
      "/ws",
      "old-name.md",
      "new-name.md",
    );
  });

  // DELETE
  it("delete via files.delete removes file from mock store", async () => {
    mockFiles["temp.md"] = "# Temp";
    await mockApi.files.delete("/ws", "temp.md");
    expect(mockFiles["temp.md"]).toBeUndefined();
  });

  // Branch operations
  it("createBranch() creates branch and refreshes", async () => {
    mockApi.git.createBranch.mockResolvedValueOnce({ success: true });
    mockApi.git.branches.mockResolvedValueOnce({
      branches: ["main", "feature"],
      current: "main",
    });

    const result = await store.createBranch("feature");
    expect(result.success).toBe(true);
    expect(store.branches).toContain("feature");
  });

  it("checkoutBranch() switches branch and reloads file", async () => {
    store.currentFile = "doc.md";
    mockFiles["doc.md"] = "# Doc on branch";
    mockApi.git.checkout.mockResolvedValueOnce({ success: true });
    mockApi.git.log.mockResolvedValueOnce([]);

    await store.checkoutBranch("feature");
    expect(store.currentBranch).toBe("feature");
    expect(mockApi.files.read).toHaveBeenCalled();
  });
});
