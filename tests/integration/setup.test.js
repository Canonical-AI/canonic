import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAppStore } from "../../src/store/index.js";

const mockApi = {
  config: {
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn(),
    exists: vi.fn().mockResolvedValue(false),
    validate: vi.fn(),
  },
  workspace: {
    init: vi.fn().mockResolvedValue({ path: "/fake/workspace" }),
    getDefault: vi.fn().mockResolvedValue("/Users/test/canonic"),
    openDialog: vi.fn(),
    openDirectoryDialog: vi.fn(),
  },
  files: {
    list: vi.fn().mockResolvedValue([]),
    read: vi.fn(),
    write: vi.fn(),
    delete: vi.fn(),
    newDoc: vi.fn(),
    move: vi.fn().mockResolvedValue(true),
    trash: {
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({ success: true }),
      restore: vi.fn().mockResolvedValue({ success: true }),
      purge: vi.fn().mockResolvedValue(true),
    },
  },
  git: {
    commit: vi.fn(),
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
    logAll: vi.fn().mockResolvedValue([]),
    fileStatus: vi.fn().mockResolvedValue({ isUncommitted: false }),
  },
  comments: {
    get: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
    move: vi.fn().mockResolvedValue(true),
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

describe("setup flow", () => {
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useAppStore();
    vi.clearAllMocks();
  });

  it("loadConfig() returns null when no config exists (first-run)", async () => {
    mockApi.config.read.mockResolvedValueOnce(null);
    const result = await store.loadConfig();
    expect(result).toBeNull();
    expect(store.config).toBeNull();
  });

  it("saveConfig() writes config and updates store", async () => {
    const configPayload = {
      displayName: "Jane",
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-6",
    };
    mockApi.config.write.mockResolvedValueOnce({
      success: true,
      config: configPayload,
    });
    const result = await store.saveConfig(configPayload);
    expect(result.success).toBe(true);
    expect(store.config).toMatchObject({ displayName: "Jane" });
    expect(mockApi.config.write).toHaveBeenCalledOnce();
  });

  it("saveConfig() payload is plain JSON (not a Proxy)", async () => {
    mockApi.config.write.mockResolvedValueOnce({ success: true, config: {} });
    await store.saveConfig({
      displayName: "X",
      sharingDefaults: { scope: "file", accessLevel: "read" },
    });
    const [payload] = mockApi.config.write.mock.calls[0];
    expect(() => JSON.stringify(payload)).not.toThrow();
  });

  it("openWorkspace() initializes workspace and loads files", async () => {
    mockApi.workspace.init.mockResolvedValueOnce({
      path: "/Users/test/my-workspace",
    });
    mockApi.files.list.mockResolvedValueOnce([
      { path: "README.md", name: "README", type: "file" },
    ]);
    mockApi.git.branches.mockResolvedValueOnce({
      branches: ["main"],
      current: "main",
    });

    await store.openWorkspace("/Users/test/my-workspace", "blank");

    expect(store.workspacePath).toBe("/Users/test/my-workspace");
    expect(store.workspaceName).toBe("my-workspace");
    expect(store.files).toHaveLength(1);
    expect(store.recentWorkspaces[0].path).toBe("/Users/test/my-workspace");
  });

  it("openWorkspace() throws on init error", async () => {
    mockApi.workspace.init.mockResolvedValueOnce({
      error: "Permission denied",
    });
    await expect(store.openWorkspace("/forbidden", "blank")).rejects.toThrow(
      "Permission denied",
    );
  });

  it("openWorkspace() clears current file and comments", async () => {
    store.currentFile = "old.md";
    store.currentContent = "old content";
    store.comments = [{ id: "c1", text: "old comment" }];

    mockApi.workspace.init.mockResolvedValueOnce({ path: "/new/ws" });
    mockApi.files.list.mockResolvedValueOnce([]);
    mockApi.git.branches.mockResolvedValueOnce({
      branches: ["main"],
      current: "main",
    });

    await store.openWorkspace("/new/ws", "blank");
    expect(store.currentFile).toBeNull();
    expect(store.currentContent).toBe("");
    expect(store.comments).toHaveLength(0);
  });
});
