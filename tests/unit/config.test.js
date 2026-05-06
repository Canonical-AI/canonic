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
    expect(cfg).toHaveProperty("model");
    expect(cfg).toHaveProperty("telemetryEnabled", false);
    expect(cfg.sharingDefaults).toMatchObject({
      scope: "file",
      permission: "view",
    });
  });

  it("write() persists config and read() returns it", () => {
    const saved = config.write({
      displayName: "Alice",
      apiKey: "",
      model: "claude-sonnet-4-6",
    });
    expect(saved.displayName).toBe("Alice");
    expect(config.exists()).toBe(true);
    const reread = config.read();
    expect(reread.displayName).toBe("Alice");
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
});
