const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const configService = require("./config");
const versionsService = require("./versions");
const { autoUpdater } = require("electron-updater");
const apiServer = require("./api-server");

// Suppress harmless Chrome DevTools autofill protocol errors
app.commandLine.appendSwitch("disable-features", "AutofillServerCommunication");

const isDev = !app.isPackaged;
const CANONIC_DIR = path.join(os.homedir(), ".canonic");
const PEERS_FILE = path.join(CANONIC_DIR, "peers.json");
const USAGE_LOG_PATH = path.join(CANONIC_DIR, "usage.log");

// Ensure ~/.canonic exists
if (!fs.existsSync(CANONIC_DIR)) {
  fs.mkdirSync(CANONIC_DIR, { recursive: true });
  fs.mkdirSync(path.join(CANONIC_DIR, "peers"), { recursive: true });
  fs.mkdirSync(path.join(CANONIC_DIR, "comments"), { recursive: true });
}

let mainWindow;
let updateDownloaded = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: path.join(
      __dirname,
      "../public",
      process.platform === "win32"
        ? "canonical-logo.ico"
        : "canonical-logo.svg",
    ),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: "#0C0E12",
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    // DevTools can be opened manually with Cmd+Option+I / F12
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Prompt before closing if an update is ready
  mainWindow.on("close", async (e) => {
    if (updateDownloaded) {
      e.preventDefault();
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: "question",
        buttons: ["Update and Restart", "Later", "Cancel"],
        defaultId: 0,
        cancelId: 2,
        message:
          "A new version has been downloaded. Would you like to install it now?",
        title: "Update Available",
      });

      if (response === 0) {
        autoUpdater.quitAndInstall();
      } else if (response === 1) {
        updateDownloaded = false;
        mainWindow.close();
      }
    }
  });

  // Allow opening DevTools via keyboard shortcut in dev
  if (isDev) {
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if ((input.meta || input.control) && input.alt && input.key === "i") {
        mainWindow.webContents.toggleDevTools();
      }
    });
  }
}

// Register canonic:// deep link protocol
app.setAsDefaultProtocolClient('canonic')

// macOS: handle canonic:// links when app is already open
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

function handleDeepLink(url) {
  try {
    const u = new URL(url)
    if (u.hostname === 'open') {
      const docUrl = u.searchParams.get('url')
      if (docUrl && mainWindow) {
        mainWindow.focus()
        mainWindow.webContents.send('share:open-peer', { url: docUrl })
      }
    }
  } catch (e) {
    console.error('[deep-link] parse error', e)
  }
}

app.whenReady().then(async () => {
  createWindow();
  setupIpcHandlers();
  setupAutoUpdater();
  await apiServer.start((event) => {
    if (event.type === 'session-start') {
      mainWindow?.focus()
      if (process.platform === 'darwin') app.focus({ steal: true })
    }
    mainWindow?.webContents.send(`agent:${event.type}`, event.data)
  }).catch((err) => {
    console.error('[api-server] failed to start:', err)
  })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function setupAutoUpdater() {
  if (isDev) return;

  autoUpdater.autoDownload = false;
  autoUpdater.checkForUpdatesAndNotify();

  // Check for updates every 4 hours
  setInterval(
    () => {
      autoUpdater.checkForUpdates();
    },
    4 * 60 * 60 * 1000,
  );

  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("update:available", info);
  });

  autoUpdater.on("download-progress", (progressObj) => {
    mainWindow?.webContents.send("update:progress", progressObj);
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateDownloaded = true;
    mainWindow?.webContents.send("update:downloaded", info);
  });

  autoUpdater.on("error", (err) => {
    mainWindow?.webContents.send("update:error", err.message);
  });
}

app.on("window-all-closed", () => {
  apiServer.stop()
  if (process.platform !== "darwin") app.quit();
});

function setupIpcHandlers() {
  const gitService = require("./git");
  const searchService = require("./search");
  const shareService = require("./share");

  // Forward share stats events to renderer
  shareService.emitter.on('stats', (stats) => {
    mainWindow?.webContents.send('share:stats', stats)
  })

  // --- Workspace ---
  ipcMain.handle("workspace:open-dialog", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Open or create a Canonic workspace",
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(
    "workspace:init",
    async (_, workspacePath, template = "blank") => {
      try {
        return await gitService.initWorkspace(workspacePath, template);
      } catch (err) {
        return { error: err.message, path: workspacePath };
      }
    },
  );

  ipcMain.handle("workspace:get-default", async () => {
    const defaultPath = path.join(os.homedir(), "canonic");
    return defaultPath;
  });

  // --- Files ---
  ipcMain.handle("files:list", async (_, workspacePath) => {
    return gitService.listFiles(workspacePath);
  });

  ipcMain.handle("files:read", async (_, workspacePath, filePath) => {
    const fullPath = path.join(workspacePath, filePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, "utf-8");
  });

  ipcMain.handle("files:write", async (_, workspacePath, filePath, content) => {
    const fullPath = path.join(workspacePath, filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
    // Push live update to any connected WebSocket clients
    shareService.pushUpdate(filePath, content);
    return true;
  });

  ipcMain.handle("files:delete", async (_, workspacePath, filePath) => {
    const fullPath = path.join(workspacePath, filePath);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    return true;
  });

  // --- Trash (soft delete) ---
  function moveItem(src, dest) {
    // fs.renameSync fails cross-device (EXDEV) on Windows — fall back to copy+delete
    try {
      fs.renameSync(src, dest);
    } catch (err) {
      if (err.code === "EXDEV") {
        fs.cpSync(src, dest, { recursive: true });
        fs.rmSync(src, { recursive: true, force: true });
      } else {
        throw err;
      }
    }
  }

  function getTrashDir(workspacePath) {
    const d = path.join(workspacePath, ".canonic", "trash");
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    return d;
  }
  function readTrashIndex(trashDir) {
    const p = path.join(trashDir, "index.json");
    if (!fs.existsSync(p)) return [];
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {
      return [];
    }
  }
  function writeTrashIndex(trashDir, index) {
    fs.writeFileSync(
      path.join(trashDir, "index.json"),
      JSON.stringify(index, null, 2),
      "utf-8",
    );
  }

  ipcMain.handle(
    "files:trash",
    async (_, workspacePath, itemPath, isDirectory) => {
      const trashDir = getTrashDir(workspacePath);
      const id = require("crypto").randomUUID();
      const src = path.join(workspacePath, itemPath);
      if (!fs.existsSync(src))
        return { success: false, error: "File not found" };
      moveItem(src, path.join(trashDir, id));
      const index = readTrashIndex(trashDir);
      index.unshift({
        id,
        originalPath: itemPath,
        deletedAt: new Date().toISOString(),
        isDirectory: !!isDirectory,
      });
      writeTrashIndex(trashDir, index);
      return { success: true, id };
    },
  );

  ipcMain.handle("files:trash-list", async (_, workspacePath) => {
    return readTrashIndex(getTrashDir(workspacePath));
  });

  ipcMain.handle("files:trash-restore", async (_, workspacePath, id) => {
    const trashDir = getTrashDir(workspacePath);
    const index = readTrashIndex(trashDir);
    const item = index.find((i) => i.id === id);
    if (!item) return { success: false, error: "Not in trash" };
    const src = path.join(trashDir, id);
    if (!fs.existsSync(src))
      return { success: false, error: "Trash file missing" };
    const dest = path.join(workspacePath, item.originalPath);
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    moveItem(src, dest);
    writeTrashIndex(
      trashDir,
      index.filter((i) => i.id !== id),
    );
    return { success: true, originalPath: item.originalPath };
  });

  ipcMain.handle("files:trash-purge", async (_, workspacePath, id) => {
    const trashDir = getTrashDir(workspacePath);
    const index = readTrashIndex(trashDir);
    const item = index.find((i) => i.id === id);
    if (item) {
      const src = path.join(trashDir, id);
      if (fs.existsSync(src)) {
        if (item.isDirectory) fs.rmSync(src, { recursive: true, force: true });
        else fs.unlinkSync(src);
      }
      writeTrashIndex(
        trashDir,
        index.filter((i) => i.id !== id),
      );
    }
    return true;
  });

  ipcMain.handle("files:mkdir", async (_, workspacePath, dirPath) => {
    const fullPath = path.join(workspacePath, dirPath);
    fs.mkdirSync(fullPath, { recursive: true });
    fs.writeFileSync(path.join(fullPath, ".gitkeep"), "", "utf-8");
    return true;
  });

  ipcMain.handle("files:rmdir", async (_, workspacePath, dirPath) => {
    const fullPath = path.join(workspacePath, dirPath);
    if (fs.existsSync(fullPath))
      fs.rmSync(fullPath, { recursive: true, force: true });
    return true;
  });

  ipcMain.handle("files:move", async (_, workspacePath, oldPath, newPath) => {
    const oldFull = path.join(workspacePath, oldPath);
    const newFull = path.join(workspacePath, newPath);
    const dir = path.dirname(newFull);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(oldFull, newFull);
    return true;
  });

  ipcMain.handle("files:new", async (_, workspacePath, fileName) => {
    const filePath = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
    const fullPath = path.join(workspacePath, filePath);
    const template = `# ${fileName.replace(".md", "")}\n\n`;
    fs.writeFileSync(fullPath, template, "utf-8");
    return filePath;
  });

  // --- Git ---
  ipcMain.handle("git:commit", async (_, workspacePath, filePath, message) => {
    return gitService.commit(workspacePath, filePath, message);
  });

  ipcMain.handle("git:log", async (_, workspacePath, filePath) => {
    return gitService.log(workspacePath, filePath);
  });

  ipcMain.handle("git:branches", async (_, workspacePath) => {
    return gitService.branches(workspacePath);
  });

  ipcMain.handle("git:create-branch", async (_, workspacePath, branchName) => {
    return gitService.createBranch(workspacePath, branchName);
  });

  ipcMain.handle("git:checkout", async (_, workspacePath, branchName) => {
    return gitService.checkout(workspacePath, branchName);
  });

  ipcMain.handle("git:merge", async (_, workspacePath, fromBranch, message) => {
    return gitService.merge(workspacePath, fromBranch, message);
  });

  ipcMain.handle("git:delete-branch", async (_, workspacePath, branchName) => {
    return await gitService.deleteBranch(workspacePath, branchName);
  });

  ipcMain.handle("git:diff", async (_, workspacePath, filePath, oid) => {
    return gitService.diff(workspacePath, filePath, oid);
  });

  ipcMain.handle("git:read-commit", async (_, workspacePath, filePath, oid) => {
    return gitService.readCommit(workspacePath, filePath, oid);
  });

  ipcMain.handle("git:status", async (_, workspacePath) => {
    return gitService.status(workspacePath);
  });

  ipcMain.handle(
    "git:log-all",
    async (_, workspacePath, filePath, branchList) => {
      return gitService.logAllBranches(workspacePath, filePath, branchList);
    },
  );

  ipcMain.handle("git:file-status", async (_, workspacePath, filePath) => {
    return gitService.fileStatus(workspacePath, filePath);
  });

  // --- Comments ---
  ipcMain.handle("comments:get", async (_, docId) => {
    const commentsFile = path.join(CANONIC_DIR, "comments", `${docId}.json`);
    if (!fs.existsSync(commentsFile)) return [];
    return JSON.parse(fs.readFileSync(commentsFile, "utf-8"));
  });

  ipcMain.handle("comments:save", async (_, docId, comments) => {
    const commentsFile = path.join(CANONIC_DIR, "comments", `${docId}.json`);
    fs.writeFileSync(commentsFile, JSON.stringify(comments, null, 2), "utf-8");
    return true;
  });

  ipcMain.handle("comments:move", async (_, oldDocId, newDocId) => {
    const oldFile = path.join(CANONIC_DIR, "comments", `${oldDocId}.json`);
    const newFile = path.join(CANONIC_DIR, "comments", `${newDocId}.json`);
    if (fs.existsSync(oldFile)) {
      fs.renameSync(oldFile, newFile);
    }
    return true;
  });

  // --- Search ---
  ipcMain.handle("search:query", async (_, query, workspacePath) => {
    return searchService.search(query, workspacePath);
  });

  ipcMain.handle(
    "search:index",
    async (_, workspacePath, filePath, content) => {
      return searchService.index(workspacePath, filePath, content);
    },
  );

  // --- Sharing ---
  ipcMain.handle("share:start", async (_, workspacePath, filePath, options) => {
    return shareService.startShare(workspacePath, filePath, options);
  });

  ipcMain.handle("share:stop", async (_, filePath) => {
    return shareService.stopShare(filePath);
  });

  ipcMain.handle("share:open-link", async (_, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle("share:stats", async (_, filePath) => {
    return shareService.getStats(filePath);
  });

  ipcMain.handle("share:start-workspace", async (_, workspacePath) => {
    return shareService.startWorkspaceShare(workspacePath);
  });

  ipcMain.handle("share:stop-workspace", async () => {
    return shareService.stopWorkspaceShare();
  });

  ipcMain.handle("share:workspace-stats", async () => {
    return shareService.getStats(shareService.WORKSPACE_KEY);
  });

  // --- Peers ---
  ipcMain.handle("peers:list", async () => {
    if (!fs.existsSync(PEERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(PEERS_FILE, "utf-8"));
  });

  ipcMain.handle("peers:open-shared", async (_, url, token) => {
    return shareService.fetchSharedDoc(url, token);
  });

  // --- Config ---
  ipcMain.handle("config:read", async () => {
    return configService.read();
  });

  ipcMain.handle("config:write", async (_, config) => {
    if (isDev) {
      console.log("[Config] Writing config:", {
        ...config,
        apiKey: config.apiKey
          ? `${config.apiKey.slice(0, 6)}...${config.apiKey.slice(-4)}`
          : "(empty)",
      });
    }
    const { valid, errors } = configService.validate(config);
    if (!valid) {
      if (isDev) console.warn("[Config] Validation failed:", errors);
      return { success: false, errors };
    }
    const saved = configService.write(config);
    // Hot-reload author in git service
    const gitService = require("./git");
    gitService.setAuthor({
      name: saved.displayName,
      email: `${saved.displayName.replace(/\s+/g, ".")}@canonic.local`,
    });
    return { success: true, config: saved };
  });

  ipcMain.handle("config:exists", async () => {
    return configService.exists();
  });

  ipcMain.handle("config:validate", async (_, config) => {
    return configService.validate(config);
  });

  ipcMain.handle("telemetry:log", async (_, event, details) => {
    const entry = `[${new Date().toISOString()}] [${event}] ${JSON.stringify(details || {})}\n`;
    fs.appendFileSync(USAGE_LOG_PATH, entry, "utf-8");
    return true;
  });

  ipcMain.handle("dialog:open-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // --- Doc Versions ---
  ipcMain.handle("versions:list", async (_, workspacePath, filePath) => {
    return versionsService.list(workspacePath, filePath);
  });

  ipcMain.handle(
    "versions:save",
    async (_, workspacePath, filePath, name, oid, message) => {
      return versionsService.save(workspacePath, filePath, name, oid, message);
    },
  );

  ipcMain.handle(
    "versions:delete",
    async (_, workspacePath, filePath, versionName) => {
      versionsService.remove(workspacePath, filePath, versionName);
      return true;
    },
  );

  ipcMain.handle("doc-branches:get", async (_, workspacePath) => {
    const p = path.join(workspacePath, ".canonic", "doc-branches.json");
    if (!fs.existsSync(p)) return {};
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {
      return {};
    }
  });

  ipcMain.handle("doc-branches:set", async (_, workspacePath, data) => {
    const dir = path.join(workspacePath, ".canonic");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "doc-branches.json"),
      JSON.stringify(data, null, 2),
      "utf-8",
    );
    return { success: true };
  });

  // --- Cleanup / Uninstall ---
  ipcMain.handle("cleanup:reset-config", async () => {
    try {
      if (fs.existsSync(CANONIC_DIR)) {
        fs.rmSync(CANONIC_DIR, { recursive: true, force: true });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("cleanup:delete-workspace", async (_, workspacePath) => {
    try {
      if (!workspacePath || !fs.existsSync(workspacePath)) {
        return { success: false, error: "Workspace path not found" };
      }
      fs.rmSync(workspacePath, { recursive: true, force: true });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("cleanup:get-paths", async () => {
    const config = configService.read();
    return {
      configDir: CANONIC_DIR,
      configFile: configService.CONFIG_PATH,
      defaultWorkspace: config?.defaultWorkspacePath || null,
      currentWorkspace: null,
    };
  });

  // --- Updates ---
  ipcMain.handle("update:check", async () => {
    if (isDev) return { isDev: true };
    return autoUpdater.checkForUpdates();
  });

  ipcMain.handle("update:download", async () => {
    if (isDev) return;
    return autoUpdater.downloadUpdate();
  });

  ipcMain.handle("update:install", async () => {
    autoUpdater.quitAndInstall();
  });

  // --- AI Chat ---
  ipcMain.handle(
    "ai:chat",
    async (event, { messages, system, model, apiKey, baseUrl }) => {
      if (isDev) {
        console.log("[AI] Request starting:", {
          model,
          baseUrl,
          messageCount: messages.length,
          hasSystem: !!system,
          keyPrefix: apiKey ? apiKey.slice(0, 7) : "(none)",
        });
      }

      if (!apiKey) {
        if (isDev) console.warn("[AI] Request failed: No API key");
        event.sender.send(
          "ai:error",
          "No API key configured. Open Settings to add your API key.",
        );
        return;
      }
      const base = (baseUrl || "https://openrouter.ai/api/v1").replace(
        /\/+$/,
        "",
      );
      const allMessages = system
        ? [{ role: "system", content: system }, ...messages]
        : messages;
      try {
        if (isDev) console.log(`[AI] Fetching ${base}/chat/completions`);
        const response = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: allMessages,
            stream: true,
            max_tokens: 2048,
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          if (isDev) console.error("[AI] API Error:", response.status, err);
          event.sender.send(
            "ai:error",
            err.error?.message || `API error ${response.status}`,
          );
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        if (isDev) console.log("[AI] Streaming response...");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.delta?.content;
              if (text) event.sender.send("ai:chunk", text);
            } catch {}
          }
        }
        if (isDev) console.log("[AI] Response complete");
        event.sender.send("ai:done");
      } catch (err) {
        if (isDev) console.error("[AI] Fetch Error:", err);
        event.sender.send("ai:error", err.message);
      }
    },
  );

  // --- Agent session ---
  ipcMain.handle('agent:submit', async (_, { sessionId, prompt, content }) => {
    return await apiServer.submitAction(sessionId, prompt, content)
  })

  ipcMain.handle('agent:cancel', async (_, sessionId) => {
    return apiServer.cancelSession(sessionId)
  })
}
