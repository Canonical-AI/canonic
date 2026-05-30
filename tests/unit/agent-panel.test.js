import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAppStore } from "../../src/store/index.js";

// openAgentPanel backs the editor's /review and /build slash commands: it
// opens the right-hand agent panel and pre-selects an agent + flavor.

// Recursive proxy: every unspecified api.*.*() listener call is a no-op so the
// store can be instantiated without a full IPC mock.
function mockCanonic() {
  const handler = {
    get(target, prop) {
      if (prop in target) return target[prop];
      const fn = () => undefined;
      return new Proxy(fn, handler);
    },
  };
  window.canonic = new Proxy(
    { config: { read: vi.fn().mockResolvedValue({}) } },
    handler,
  );
}

describe("store.openAgentPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockCanonic();
  });

  afterEach(() => {
    delete window.canonic;
  });

  it("opens the right panel on the agent tab", () => {
    const store = useAppStore();
    store.rightPanelCollapsed = true;
    store.rightPanelTab = "comments";

    store.openAgentPanel({ agentId: "claude", flavor: "reviewer" });

    expect(store.rightPanelTab).toBe("agent");
    expect(store.rightPanelCollapsed).toBe(false);
  });

  it("selects the given agent and reviewer flavor", () => {
    const store = useAppStore();
    store.openAgentPanel({ agentId: "claude", flavor: "reviewer" });
    expect(store.activeAgentId).toBe("claude");
    expect(store.activeFlavor).toBe("reviewer");
  });

  it("sets implementer flavor for /build", () => {
    const store = useAppStore();
    store.openAgentPanel({ agentId: "codex", flavor: "implementer" });
    expect(store.activeAgentId).toBe("codex");
    expect(store.activeFlavor).toBe("implementer");
  });

  it("opens the panel without an agent (set-up fallback)", () => {
    const store = useAppStore();
    store.openAgentPanel({ flavor: "implementer" });
    expect(store.activeAgentId).toBe(null);
    expect(store.activeFlavor).toBe("implementer");
    expect(store.rightPanelTab).toBe("agent");
    expect(store.rightPanelCollapsed).toBe(false);
  });
});
