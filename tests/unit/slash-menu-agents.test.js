import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import SlashMenuTooltip from "../../src/components/editor/slash-menu/SlashMenuTooltip.vue";

// Mock the store so the tooltip can be mounted in isolation (no IPC/pinia).
const mockStore = {
  configuredAgents: [
    { id: "claude", name: "Claude" },
    { id: "codex", name: "Codex" },
  ],
  openAgentPanel: vi.fn(),
};
vi.mock("../../src/store", () => ({
  useAppStore: () => mockStore,
}));

function items() {
  return [...document.body.querySelectorAll(".slash-tooltip-item")];
}
function clickItem(label) {
  const el = items().find((n) => n.textContent.includes(label));
  if (!el) throw new Error(`menu item not found: ${label}`);
  el.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
  );
}

describe("slash menu agent commands", () => {
  let wrapper;
  let onAction;

  beforeEach(async () => {
    document.body.innerHTML = "";
    mockStore.configuredAgents = [
      { id: "claude", name: "Claude" },
      { id: "codex", name: "Codex" },
    ];
    mockStore.openAgentPanel = vi.fn();
    onAction = vi.fn();
    wrapper = mount(SlashMenuTooltip, { attachTo: document.body });
    wrapper.vm.open({ top: 0, left: 0 }, onAction, () => {});
    await nextTick();
  });

  it("shows Review and Build at the root", () => {
    const labels = items().map((n) => n.textContent.trim());
    expect(labels).toContain("Review with agent");
    expect(labels).toContain("Build with agent");
  });

  it("/review lists configured agents and opens the panel in reviewer mode", async () => {
    clickItem("Review with agent");
    await nextTick();
    const labels = items().map((n) => n.textContent.trim());
    expect(labels).toEqual(["Claude", "Codex"]);

    clickItem("Claude");
    await nextTick();
    expect(mockStore.openAgentPanel).toHaveBeenCalledWith({
      agentId: "claude",
      flavor: "reviewer",
    });
    // trigger "/" cleanup routed through the editor action callback
    expect(onAction).toHaveBeenCalledWith("agent-command");
    expect(wrapper.vm.visible).toBe(false);
  });

  it("/build opens the selected agent in implementer mode", async () => {
    clickItem("Build with agent");
    await nextTick();
    clickItem("Codex");
    await nextTick();
    expect(mockStore.openAgentPanel).toHaveBeenCalledWith({
      agentId: "codex",
      flavor: "implementer",
    });
  });

  it("offers a set-up fallback when no agents are configured", async () => {
    mockStore.configuredAgents = [];
    // reopen so the dynamic list recomputes from the new agent list
    wrapper.vm.open({ top: 0, left: 0 }, onAction, () => {});
    await nextTick();
    clickItem("Build with agent");
    await nextTick();
    const labels = items().map((n) => n.textContent.trim());
    expect(labels).toEqual(["Set up an agent…"]);

    clickItem("Set up an agent…");
    await nextTick();
    expect(mockStore.openAgentPanel).toHaveBeenCalledWith({
      agentId: null,
      flavor: "implementer",
    });
  });
});
