const fs = require("fs");
const path = require("path");
const os = require("os");

const CANONIC_DIR =
  process.env.CANONIC_CONFIG_DIR || path.join(os.homedir(), ".canonic");
const CONFIG_PATH = path.join(CANONIC_DIR, "config.json");

const DEFAULTS = {
  displayName: os.userInfo().username,
  defaultWorkspacePath: path.join(os.homedir(), "canonic"),
  telemetryEnabled: false,
  autoUpdate: true,
  updateChannel: "stable",
  autoShareWorkspace: false,
  autoShareAllWorkspaces: false,
  sharingExcludedPaths: [],
  sharingDefaults: {
    scope: "file",
    permission: "view",
  },
  windowBlur: true,
  providers: [],
  assistant: {
    providerId: "",
    model: "",
    name: "Spark",
    extraInstructions: "",
  },
  completion: {
    enabled: false,
    providerId: "",
    model: "codestral-latest",
    debounceMs: 350,
    maxTokens: 25,
    wordBoundaryOnly: true,
    extraInstructions: "",
  },
};

// --- Slug helpers ---

const KNOWN_LABELS = {
  "openrouter.ai": "OpenRouter",
  "api.openai.com": "OpenAI",
  "api.mistral.ai": "Mistral",
  "codestral.mistral.ai": "Codestral",
  "api.deepseek.com": "DeepSeek",
  "api.groq.com": "Groq",
  "localhost": "Local",
};

function labelFromUrl(url) {
  try {
    return KNOWN_LABELS[new URL(url).hostname] || new URL(url).hostname;
  } catch {
    return "";
  }
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
}

function uniqueSlug(base, existing) {
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

// --- Migration from old flat config format ---

function migrate(raw) {
  if (raw.providers) return raw; // already new format

  const providers = [];
  let assistantProviderId = "";
  let completionProviderId = "";

  if (raw.apiKey || raw.baseUrl) {
    const label = labelFromUrl(raw.baseUrl) || "Provider";
    const id = slugify(label);
    providers.push({
      id,
      label,
      baseUrl: raw.baseUrl || "",
      apiKey: raw.apiKey || "",
    });
    assistantProviderId = id;
  }

  const c = raw.completion || {};
  if (c.apiKey && c.baseUrl && c.baseUrl !== (raw.baseUrl || "")) {
    const label = labelFromUrl(c.baseUrl) || "Completions";
    const id = uniqueSlug(
      slugify(label),
      providers.map((p) => p.id)
    );
    providers.push({ id, label, baseUrl: c.baseUrl, apiKey: c.apiKey });
    completionProviderId = id;
  } else if (c.apiKey && assistantProviderId) {
    completionProviderId = assistantProviderId;
  }

  return {
    ...raw,
    providers,
    assistant: {
      providerId: assistantProviderId,
      model: raw.model || "",
    },
    completion: {
      enabled: c.enabled ?? false,
      providerId: completionProviderId,
      model: c.model || "codestral-latest",
    },
  };
}

// --- Resolve a provider by id ---

function resolveProvider(config, providerId) {
  return config.providers?.find((p) => p.id === providerId) || null;
}

const isDev = process.env.NODE_ENV !== "production";

function read() {
  if (isDev) console.log("[Config] Reading config from:", CONFIG_PATH);
  if (!fs.existsSync(CONFIG_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    const migrated = migrate(raw);
    return {
      ...DEFAULTS,
      ...migrated,
      sharingDefaults: {
        ...DEFAULTS.sharingDefaults,
        ...(migrated.sharingDefaults || {}),
      },
      providers: migrated.providers || [],
      assistant: { ...DEFAULTS.assistant, ...(migrated.assistant || {}) },
      completion: { ...DEFAULTS.completion, ...(migrated.completion || {}) },
    };
  } catch (err) {
    if (isDev) console.error("[Config] Error reading config:", err);
    return null;
  }
}

function write(config) {
  // Trim API keys in all providers
  if (Array.isArray(config.providers)) {
    config.providers = config.providers.map((p) => ({
      ...p,
      apiKey: (p.apiKey || "").trim(),
    }));
  }

  const merged = {
    ...DEFAULTS,
    ...config,
    sharingDefaults: {
      ...DEFAULTS.sharingDefaults,
      ...(config.sharingDefaults || {}),
    },
    providers: config.providers || [],
    assistant: { ...DEFAULTS.assistant, ...(config.assistant || {}) },
    completion: { ...DEFAULTS.completion, ...(config.completion || {}) },
  };

  if (isDev)
    console.log(
      "[Config] Writing config:",
      JSON.stringify(
        {
          ...merged,
          providers: merged.providers.map((p) => ({
            ...p,
            apiKey: p.apiKey ? p.apiKey.slice(0, 6) + "..." + p.apiKey.slice(-4) : "",
          })),
        },
        null,
        2
      )
    );

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
  return { valid: Object.keys(errors).length === 0, errors };
}

module.exports = { read, write, exists, validate, resolveProvider, CONFIG_PATH };
