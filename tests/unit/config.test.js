import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Point config at a temp dir before the module loads
const tmpDir = path.join(os.tmpdir(), `canonic-test-${process.pid}`);
process.env.CANONIC_CONFIG_DIR = tmpDir;
fs.mkdirSync(tmpDir, { recursive: true });

const config = await import("../../electron/config.js");
const configPath = config.CONFIG_PATH; // the actual path the module is using

describe("config", () => {
  beforeEach(() => {
    // Remove the config file before each test for a clean slate
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  });

  afterEach(() => {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  });

  it("exists() returns false when no config file", () => {
    expect(config.exists()).toBe(false);
  });

  it("read() returns null when no config file (first-run state)", () => {
    expect(config.read()).toBeNull();
  });

  it("read() merges defaults after write() so all fields are present", () => {
    config.write({ displayName: "Test" });
    const cfg = config.read();
    expect(cfg).toHaveProperty("displayName", "Test");
    expect(cfg).toHaveProperty("providers");
    expect(cfg.assistant).toHaveProperty("model");
    expect(cfg.completion).toHaveProperty("model");
    expect(cfg).toHaveProperty("telemetryEnabled", false);
    expect(cfg.sharingDefaults).toMatchObject({
      scope: "file",
      permission: "view",
    });
  });

  it("write() persists config and read() returns it", () => {
    const saved = config.write({
      displayName: "Alice",
      providers: [{ id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-test" }],
      assistant: { providerId: "openrouter", model: "claude-sonnet-4-6" },
    });
    expect(saved.displayName).toBe("Alice");
    expect(config.exists()).toBe(true);
    const reread = config.read();
    expect(reread.displayName).toBe("Alice");
    expect(reread.assistant.model).toBe("claude-sonnet-4-6");
  });

  it("validate() requires displayName", () => {
    const { valid, errors } = config.validate({ displayName: "" });
    expect(valid).toBe(false);
    expect(errors).toHaveProperty("displayName");
  });

  it("validate() passes with only displayName set", () => {
    const { valid } = config.validate({ displayName: "Bob" });
    expect(valid).toBe(true);
  });

  it("validate() does not require apiKey", () => {
    const { valid } = config.validate({ displayName: "Bob", apiKey: "" });
    expect(valid).toBe(true);
  });

  it("read() includes autoUpdate: true by default", () => {
    config.write({ displayName: "Test" });
    const cfg = config.read();
    expect(cfg.autoUpdate).toBe(true);
  });

  it("read() includes updateChannel: 'stable' by default", () => {
    config.write({ displayName: "Test" });
    const cfg = config.read();
    expect(cfg.updateChannel).toBe("stable");
  });

  it("write() persists autoUpdate: false and read() returns it", () => {
    config.write({ displayName: "Test", autoUpdate: false });
    expect(config.read().autoUpdate).toBe(false);
  });

  it("write() persists updateChannel: 'experimental' and read() returns it", () => {
    config.write({ displayName: "Test", updateChannel: "experimental" });
    expect(config.read().updateChannel).toBe("experimental");
  });

  // ── assistant preference persistence ─────────────────────────────────────
  it("defaults: assistant.caps contains all six capability flags", () => {
    config.write({ displayName: "Test" });
    const cfg = config.read();
    expect(cfg.assistant.caps).toMatchObject({
      indexWorkspace: true,
      readDocs: true,
      listTree: true,
      webSearch: true,
      postComments: true,
      suggestEdits: true,
    });
  });

  it("defaults: assistant.effortLevel, showThinking, thinkingExpanded present", () => {
    config.write({ displayName: "Test" });
    const cfg = config.read();
    expect(cfg.assistant.effortLevel).toBe("Medium");
    expect(cfg.assistant.showThinking).toBe(true);
    expect(cfg.assistant.thinkingExpanded).toBe(false);
  });

  it("write() persists assistant.effortLevel and read() returns it", () => {
    config.write({ displayName: "Test", assistant: { effortLevel: "High" } });
    expect(config.read().assistant.effortLevel).toBe("High");
  });

  it("write() persists partial assistant.caps and merges with defaults on read", () => {
    config.write({
      displayName: "Test",
      assistant: { caps: { listTree: false, webSearch: false } },
    });
    const cfg = config.read();
    expect(cfg.assistant.caps.listTree).toBe(false);
    expect(cfg.assistant.caps.webSearch).toBe(false);
    // Unspecified flags keep their defaults
    expect(cfg.assistant.caps.indexWorkspace).toBe(true);
    expect(cfg.assistant.caps.readDocs).toBe(true);
    expect(cfg.assistant.caps.postComments).toBe(true);
  });

  it("read() of legacy config without assistant.caps fills in defaults", () => {
    // Write raw file that omits caps entirely (legacy users)
    fs.writeFileSync(
      configPath,
      JSON.stringify({ displayName: "Legacy", providers: [], assistant: { name: "Spark" } }),
      "utf-8",
    );
    const cfg = config.read();
    expect(cfg.assistant.caps).toBeDefined();
    expect(cfg.assistant.caps.indexWorkspace).toBe(true);
    expect(cfg.assistant.caps.listTree).toBe(true);
  });

  it("write() round-trips thinkingExpanded=true", () => {
    config.write({ displayName: "Test", assistant: { thinkingExpanded: true } });
    expect(config.read().assistant.thinkingExpanded).toBe(true);
  });

  it("write() preserves other assistant fields when only caps changes", () => {
    config.write({
      displayName: "Test",
      assistant: { providerId: "openrouter", model: "claude-sonnet-4-6", name: "Spark" },
    });
    config.write({
      ...config.read(),
      assistant: { ...config.read().assistant, caps: { postComments: false } },
    });
    const cfg = config.read();
    expect(cfg.assistant.providerId).toBe("openrouter");
    expect(cfg.assistant.model).toBe("claude-sonnet-4-6");
    expect(cfg.assistant.name).toBe("Spark");
    expect(cfg.assistant.caps.postComments).toBe(false);
  });
});
