const fs = require("fs");
const path = require("path");
const os = require("os");

const CANONIC_DIR =
  process.env.CANONIC_CONFIG_DIR || path.join(os.homedir(), ".canonic");
const CONFIG_PATH = path.join(CANONIC_DIR, "config.json");

const DEFAULTS = {
  displayName: os.userInfo().username,
  apiKey: "",
  baseUrl: "https://openrouter.ai/api/v1",
  model: "anthropic/claude-sonnet-4-5",
  defaultWorkspacePath: path.join(os.homedir(), "canonic"),
  telemetryEnabled: false,
  sharingDefaults: {
    scope: "file", // none | file | directory | workspace
    accessLevel: "read", // read | comment
  },
};

const isDev = process.env.NODE_ENV !== "production";

function read() {
  if (isDev) console.log("[Config] Reading config from:", CONFIG_PATH);
  if (!fs.existsSync(CONFIG_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    return {
      ...DEFAULTS,
      ...raw,
      sharingDefaults: {
        ...DEFAULTS.sharingDefaults,
        ...(raw.sharingDefaults || {}),
      },
    };
  } catch (err) {
    if (isDev) console.error("[Config] Error reading config:", err);
    return null;
  }
}

function write(config) {
  // Trim API key to prevent common copy-paste whitespace issues
  if (config.apiKey) {
    config.apiKey = config.apiKey.trim();
  }

  const merged = {
    ...DEFAULTS,
    ...config,
    sharingDefaults: {
      ...DEFAULTS.sharingDefaults,
      ...(config.sharingDefaults || {}),
    },
  };

  if (isDev) console.log("[Config] Writing config to:", CONFIG_PATH);
  if (!fs.existsSync(CANONIC_DIR)) {
    fs.mkdirSync(CANONIC_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

function exists() {
  return fs.existsSync(CONFIG_PATH);
}

function validate(config) {
  const errors = {};
  if (!config.displayName?.trim())
    errors.displayName = "Display name is required";
  // API key is optional — AI features just won't work without it
  return { valid: Object.keys(errors).length === 0, errors };
}

module.exports = { read, write, exists, validate, CONFIG_PATH };
