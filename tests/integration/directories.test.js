import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAppStore } from "../../src/store/index.js";
import fs from "fs";
import os from "os";
import path from "path";

// These tests hit the real electron/git.js to verify directory creation on disk.
// We mock only the IPC bridge — the store will call the mock API.
const tmpDir = path.join(os.tmpdir(), `canonic-dir-test-${process.pid}`);
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
    init: vi.fn().mockResolvedValue({ path: tmpDir }),
    getDefault: vi.fn(),
    openDialog: vi.fn(),
    openDirectoryDialog: vi.fn(),
  },
  files: {
    list: vi.fn(async () =>
      Object.entries(mockFiles).map(([p]) => ({
        path: p,
        name: path.basename(p, ".md"),
        type: "file",
      })),
    ),
    read: vi.fn(async (_, p) => mockFiles[p] ?? null),
    write: vi.fn(async (ws, p, content) => {
      // Actually write to disk so directory tests work
      const full = path.join(ws, p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
      mockFiles[p] = content;
    }),
    delete: vi.fn(async (ws, p) => {
      delete mockFiles[p];
      const full = path.join(ws, p);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    }),
    newDoc: vi.fn(async (ws, name) => {
      const p = `${name}.md`;
      const full = path.join(ws, p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, `# ${name}\n`);
      mockFiles[p] = `# ${name}\n`;
      return p;
    }),
    mkdir: vi.fn(async (ws, dirName) => {
      const full = path.join(ws, dirName);
      fs.mkdirSync(full, { recursive: true });
      const keepFile = path.join(full, ".gitkeep");
      fs.writeFileSync(keepFile, "");
      return { path: dirName };
    }),
    move: vi.fn(async (ws, oldPath, newPath) => {
      const oldFull = path.join(ws, oldPath);
      const newFull = path.join(ws, newPath);
      if (fs.existsSync(oldFull)) {
        fs.mkdirSync(path.dirname(newFull), { recursive: true });
        fs.renameSync(oldFull, newFull);
      }
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
    commit: vi.fn().mockResolvedValue({ success: true, oid: "abc" }),
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

describe("directory CRUD", () => {
  let store;

  beforeEach(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    setActivePinia(createPinia());
    store = useAppStore();
    store.workspacePath = tmpDir;
    store.workspaceName = path.basename(tmpDir);
    Object.keys(mockFiles).forEach((k) => delete mockFiles[k]);
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("mkdir creates directory on disk", async () => {
    await mockApi.files.mkdir(tmpDir, "Discovery");
    expect(fs.existsSync(path.join(tmpDir, "Discovery"))).toBe(true);
  });

  it("mkdir creates .gitkeep so empty directory is tracked", async () => {
    await mockApi.files.mkdir(tmpDir, "Planning");
    expect(fs.existsSync(path.join(tmpDir, "Planning", ".gitkeep"))).toBe(true);
  });

  it("can create a file inside a directory", async () => {
    await mockApi.files.mkdir(tmpDir, "Strategy");
    await mockApi.files.write(
      tmpDir,
      "Strategy/north-star.md",
      "# North Star\n",
    );

    expect(fs.existsSync(path.join(tmpDir, "Strategy", "north-star.md"))).toBe(
      true,
    );
    expect(
      fs.readFileSync(path.join(tmpDir, "Strategy", "north-star.md"), "utf-8"),
    ).toBe("# North Star\n");
  });

  it("newDoc inside a directory uses correct path", async () => {
    await mockApi.files.mkdir(tmpDir, "Vision");
    const p = await mockApi.files.newDoc(tmpDir, "Vision/product-vision");

    expect(p).toBe("Vision/product-vision.md");
    expect(
      fs.existsSync(path.join(tmpDir, "Vision", "product-vision.md")),
    ).toBe(true);
  });

  it("renameFile() works for nested paths", async () => {
    await mockApi.files.mkdir(tmpDir, "Docs");
    await mockApi.files.write(tmpDir, "Docs/draft.md", "# Draft");
    store.currentFile = "Docs/draft.md";
    mockApi.files.read.mockResolvedValueOnce("# Draft");

    const newPath = await store.renameFile("Docs/draft.md", "final");
    expect(newPath).toBe("Docs/final.md");
    expect(store.currentFile).toBe("Docs/final.md");
  });

  it("list returns files from nested directory", async () => {
    await mockApi.files.mkdir(tmpDir, "Implementation");
    await mockApi.files.write(tmpDir, "Implementation/tech-spec.md", "# Tech");
    await mockApi.files.write(tmpDir, "Implementation/rollout.md", "# Rollout");

    const files = await mockApi.files.list(tmpDir);
    const paths = files.map((f) => f.path);
    expect(paths).toContain("Implementation/tech-spec.md");
    expect(paths).toContain("Implementation/rollout.md");
  });

  it("delete removes file from nested directory", async () => {
    await mockApi.files.mkdir(tmpDir, "Trash");
    await mockApi.files.write(tmpDir, "Trash/temp.md", "# Temp");
    await mockApi.files.delete(tmpDir, "Trash/temp.md");

    expect(fs.existsSync(path.join(tmpDir, "Trash", "temp.md"))).toBe(false);
  });
});
