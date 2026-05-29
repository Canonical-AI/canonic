import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAppStore } from "../../src/store/index.js";

// applyAppearanceSettings is internal to the store; we drive it through
// loadConfig() and assert the resulting <html> class. Transparency must only
// engage on macOS — on Linux/Windows panels stay opaque (no raw-desktop
// see-through, no blur).

function setPlatform(platform) {
  Object.defineProperty(window.navigator, "platform", {
    value: platform,
    configurable: true,
  });
}

// The store wires many IPC listeners (api.share.onStats, api.peers.onFound,
// …) at setup time. A recursive proxy makes every unspecified api.*.*() call a
// harmless no-op, while config.read returns the cfg under test.
function mockCanonic(cfg) {
  const handler = {
    get(target, prop) {
      if (prop in target) return target[prop];
      const fn = () => undefined;
      return new Proxy(fn, handler);
    },
  };
  window.canonic = new Proxy(
    { config: { read: vi.fn().mockResolvedValue(cfg) } },
    handler,
  );
}

describe("window transparency platform gating", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.documentElement.classList.remove("window-transparency");
  });

  afterEach(() => {
    delete window.canonic;
  });

  it("applies the transparency class on macOS when enabled", async () => {
    setPlatform("MacIntel");
    mockCanonic({ windowTransparency: true });
    const store = useAppStore();
    await store.loadConfig();
    expect(
      document.documentElement.classList.contains("window-transparency"),
    ).toBe(true);
  });

  it("omits the transparency class on macOS when disabled", async () => {
    setPlatform("MacIntel");
    mockCanonic({ windowTransparency: false });
    const store = useAppStore();
    await store.loadConfig();
    expect(
      document.documentElement.classList.contains("window-transparency"),
    ).toBe(false);
  });

  it("never applies the transparency class on Windows", async () => {
    setPlatform("Win32");
    mockCanonic({ windowTransparency: true });
    const store = useAppStore();
    await store.loadConfig();
    expect(
      document.documentElement.classList.contains("window-transparency"),
    ).toBe(false);
  });

  it("never applies the transparency class on Linux", async () => {
    setPlatform("Linux x86_64");
    mockCanonic({ windowTransparency: true });
    const store = useAppStore();
    await store.loadConfig();
    expect(
      document.documentElement.classList.contains("window-transparency"),
    ).toBe(false);
  });
});
