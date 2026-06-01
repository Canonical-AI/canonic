import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAppStore } from "../../src/store/index.js";

// The demo workspace (<home>/canonic-demo) is throwaway scratch: registered with
// the main process when demo mode loads so it can be deleted on quit, and cleaned
// up immediately when the user leaves demo mode for a real workspace.
const mockApi = {
  config: {
    read: vi.fn().mockResolvedValue({ displayName: "Test" }),
    write: vi.fn(),
    exists: vi.fn().mockResolvedValue(false),
    validate: vi.fn(),
  },
  workspace: {
    init: vi.fn().mockResolvedValue({ path: "/home/user/canonic-demo" }),
    getDefault: vi.fn().mockResolvedValue("/home/user/canonic"),
    openDialog: vi.fn(),
    openDirectoryDialog: vi.fn(),
  },
  files: {
    list: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue(""),
    write: vi.fn().mockResolvedValue(true),
    mkdir: vi.fn(),
    trash: { list: vi.fn().mockResolvedValue([]) },
  },
  git: {
    log: vi.fn().mockResolvedValue([]),
    branches: vi.fn().mockResolvedValue({ branches: ["main"], current: "main" }),
    checkout: vi.fn().mockResolvedValue({ success: true }),
    fileStatus: vi.fn().mockResolvedValue({ isUncommitted: false }),
  },
  comments: { get: vi.fn().mockResolvedValue([]) },
  search: { query: vi.fn().mockResolvedValue([]), index: vi.fn() },
  share: { onStats: vi.fn() },
  peers: { list: vi.fn().mockResolvedValue([]) },
  docBranches: { get: vi.fn().mockResolvedValue({}) },
  versions: { list: vi.fn().mockResolvedValue([]) },
  demo: {
    register: vi.fn().mockResolvedValue(true),
    cleanup: vi.fn().mockResolvedValue(true),
  },
};

const mockLocalStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; },
};
vi.stubGlobal("localStorage", mockLocalStorage);
vi.stubGlobal("window", { canonic: mockApi, localStorage: mockLocalStorage });

describe("demo workspace cleanup", () => {
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useAppStore();
    vi.clearAllMocks();
  });

  it("registers the demo dir with main when demo mode loads", async () => {
    // enableDemoMode does more than we mock; the register call fires before that
    // chain, so swallow any downstream rejection and assert the registration.
    await store.enableDemoMode().catch(() => {});
    expect(mockApi.demo.register).toHaveBeenCalledWith("/home/user/canonic-demo");
  });

  it("cleans up the demo dir when leaving demo mode", async () => {
    await store.enableDemoMode().catch(() => {});
    store.disableDemoMode();
    expect(mockApi.demo.cleanup).toHaveBeenCalledTimes(1);
  });

  it("does not call cleanup when demo mode was never active", () => {
    store.disableDemoMode();
    expect(mockApi.demo.cleanup).not.toHaveBeenCalled();
  });
});
