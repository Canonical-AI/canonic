import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import AIChat from "../../src/components/panels/AIChat.vue";
import { useAppStore } from "../../src/store/index.js";

// Mock Lucide icons
vi.mock("lucide-vue-next", () => ({
  Sparkles: { render: () => {} },
  SendHorizonal: { render: () => {} },
  ChevronDown: { render: () => {} },
  History: { render: () => {} },
  MessageSquare: { render: () => {} },
  FileText: { render: () => {} },
}));

// Mock window.canonic
const mockApi = {
  ai: {
    chat: vi.fn().mockResolvedValue({}),
    onChunk: vi.fn(),
    onToolCallDelta: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    removeListeners: vi.fn(),
  },
  files: {
    list: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue(""),
    tree: vi.fn().mockResolvedValue({ entries: [] }),
  },
  share: {
    start: vi.fn(),
    stop: vi.fn(),
    openLink: vi.fn(),
    openShared: vi.fn(),
    onStats: vi.fn(),
  },
  docBranches: { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
  git: {
    branches: vi
      .fn()
      .mockResolvedValue({ branches: ["main"], current: "main" }),
    logAll: vi.fn().mockResolvedValue([]),
    status: vi.fn(),
  },
  peers: {
    list: vi.fn().mockResolvedValue([]),
    onFound: vi.fn(),
    onLost: vi.fn(),
  },
  comments: { get: vi.fn().mockResolvedValue([]), onSync: vi.fn() },
  config: {
    read: vi.fn().mockResolvedValue({
      assistant: { providerId: "p1", model: "m1" },
      providers: [{ id: "p1", apiKey: "sk-test", baseUrl: "http://test" }],
    }),
    write: vi.fn().mockResolvedValue({ success: true }),
  },
  app: { getVersion: vi.fn().mockResolvedValue("0.0.1") },
};

vi.stubGlobal("window", {
  canonic: mockApi,
  navigator: {
    clipboard: {
      readText: vi.fn(),
      writeText: vi.fn(),
    },
  },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

describe("AIChat Multiline Paste Truncation", () => {
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useAppStore();
    vi.clearAllMocks();
  });

  it("truncates multiline paste into a marker", async () => {
    const wrapper = mount(AIChat);
    const textarea = wrapper.find("textarea");

    const multilineText = "line 1\nline 2\nline 3";

    const pasteEvent = new Event("paste", { bubbles: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        getData: vi.fn().mockReturnValue(multilineText),
      },
    });
    pasteEvent.preventDefault = vi.fn();

    await textarea.element.dispatchEvent(pasteEvent);

    expect(pasteEvent.preventDefault).toHaveBeenCalled();
    expect(textarea.element.value).toMatch(/\[3 lines pasted #[a-f0-9]+\]/);
  });

  it("deletes the entire marker on backspace", async () => {
    const wrapper = mount(AIChat);
    const textarea = wrapper.find("textarea");

    const multilineText = "line 1\nline 2";
    const pasteEvent = new Event("paste", { bubbles: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: { getData: vi.fn().mockReturnValue(multilineText) },
    });
    await textarea.element.dispatchEvent(pasteEvent);

    const marker = textarea.element.value;
    textarea.element.selectionStart = textarea.element.selectionEnd =
      marker.length;

    const backspaceEvent = new KeyboardEvent("keydown", {
      key: "Backspace",
      bubbles: true,
    });
    backspaceEvent.preventDefault = vi.fn();
    await textarea.element.dispatchEvent(backspaceEvent);

    expect(backspaceEvent.preventDefault).toHaveBeenCalled();
    expect(textarea.element.value).toBe("");
  });

  it("restores full content when sending message", async () => {
    // 1. Setup store with config BEFORE mounting
    store.config = {
      assistant: { providerId: "p1", model: "m1" },
      providers: [{ id: "p1", apiKey: "sk-test", baseUrl: "http://test" }],
    };

    const wrapper = mount(AIChat);
    const textarea = wrapper.find("textarea");

    const multilineText = "line 1\nline 2";
    const pasteEvent = new Event("paste", { bubbles: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: { getData: vi.fn().mockReturnValue(multilineText) },
    });
    await textarea.element.dispatchEvent(pasteEvent);

    const marker = textarea.element.value;
    textarea.element.value = "Before " + marker + " After";
    await textarea.element.dispatchEvent(new Event("input", { bubbles: true }));

    mockApi.ai.chat.mockResolvedValueOnce({});
    await wrapper
      .find(".send-btn")
      .element.dispatchEvent(new Event("click", { bubbles: true }));

    expect(mockApi.ai.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: "Before line 1\nline 2 After",
          }),
        ]),
      }),
    );
  });
});
