const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  MenuItem,
  protocol,
  net,
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec, execSync, spawnSync } = require("child_process");
const { autoUpdater } = require("electron-updater");
const crypto = require("crypto");
const semver = require("semver");

const configService = require("./config");
const versionsService = require("./versions");
const apiServer = require("./api-server");
const { startWatcher, stopWatcher, getIndex } = require("./fileIndex");

// Services loaded lazily in setupIpcHandlers to ensure logger is ready
let gitService;
let searchService;
let shareService;
const discoveryService = require("./discovery");
const { flushPeerComments } = require("./comment-sync");

// Register canonic-asset:// as a secure scheme before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'canonic-asset', privileges: { secure: true, standard: true, supportFetchAPI: true } }
])

// Track active workspace for asset serving
let activeWorkspacePath = null

// In-memory list of currently discovered (online) peers
const discoveredPeers = [];

// ── Network watcher ────────────────────────────────────────────────────────
let networkWatcherInterval = null;
let lastNetworkInterface = null;

function getActiveInterface() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return name;
    }
  }
  return null;
}

function startNetworkWatcher() {
  if (networkWatcherInterval) return;
  lastNetworkInterface = getActiveInterface();
  networkWatcherInterval = setInterval(() => {
    const current = getActiveInterface();
    if (current !== lastNetworkInterface) {
      lastNetworkInterface = current;
      const stoppedPorts = shareService.stopAllShares();
      stoppedPorts.forEach((port) => discoveryService.unpublishShare(port));
      discoveredPeers.length = 0;
      clearInterval(networkWatcherInterval);
      networkWatcherInterval = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("share:network-changed");
      }
    }
  }, 30000);
}

// ── Comment sync queue ─────────────────────────────────────────────────────
const PEER_COMMENTS_DIR = path.join(
  os.homedir(),
  ".config",
  "canonic",
  "comments",
  "peers",
);

// Suppress harmless Chrome DevTools autofill protocol errors
app.commandLine.appendSwitch("disable-features", "AutofillServerCommunication");

const isDev = !app.isPackaged;
const CANONIC_DIR = path.join(os.homedir(), ".config", "canonic");

// File-based logging — readable at ~/Library/Logs/Canonic/main.log (mac)
// or at app.getPath('logs')/main.log on all platforms.
const LOG_FILE = path.join(CANONIC_DIR, "main.log");

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args
    .map((a) => {
      try {
        return typeof a === "object" ? JSON.stringify(a) : String(a);
      } catch {
        return "[Unstringifiable Object]";
      }
    })
    .join(" ")}\n`;
  try {
    if (!fs.existsSync(CANONIC_DIR))
      fs.mkdirSync(CANONIC_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
  console.log(...args);
}

function logError(...args) {
  const line = `[${new Date().toISOString()}] ERROR ${args
    .map((a) => {
      try {
        return a instanceof Error
          ? a.stack
          : typeof a === "object"
            ? JSON.stringify(a)
            : String(a);
      } catch {
        return "[Unstringifiable Object]";
      }
    })
    .join(" ")}\n`;
  try {
    if (!fs.existsSync(CANONIC_DIR))
      fs.mkdirSync(CANONIC_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
  console.error(...args);
}

const PEERS_FILE = path.join(CANONIC_DIR, "peers.json");

function readPeers() {
  if (!fs.existsSync(PEERS_FILE)) return [];
  try {
    const content = fs.readFileSync(PEERS_FILE, "utf-8");
    return content ? JSON.parse(content) : [];
  } catch (err) {
    console.error("[main] Error parsing peers.json:", err.message);
    return [];
  }
}
const USAGE_LOG_PATH = path.join(CANONIC_DIR, "usage.log");

// Ensure ~/.canonic exists
if (!fs.existsSync(CANONIC_DIR)) {
  fs.mkdirSync(CANONIC_DIR, { recursive: true });
}
if (!fs.existsSync(path.join(CANONIC_DIR, "peers"))) {
  fs.mkdirSync(path.join(CANONIC_DIR, "peers"), { recursive: true });
}
if (!fs.existsSync(path.join(CANONIC_DIR, "comments"))) {
  fs.mkdirSync(path.join(CANONIC_DIR, "comments"), { recursive: true });
}

let mainWindow;
let updateDownloaded = false;

// Track file passed via OS "open-file" event (macOS) or CLI (Win/Linux)
let fileToOpenOnStartup =
  process.argv.find((arg) => arg.endsWith(".md") && fs.existsSync(arg)) || null;

app.on("open-file", (event, path) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("menu:open-file", path);
  } else {
    fileToOpenOnStartup = path;
  }
});

function resolveSafePath(base, target) {
  // If target is an absolute path and base is null, allow it (for workspace-less files)
  if (!base && path.isAbsolute(target)) {
    return target;
  }
  if (!base) {
    console.error("[resolveSafePath] No base provided for target:", target);
    throw new Error("Base path required for relative targets");
  }
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(base, target);
  if (!resolvedTarget.startsWith(resolvedBase)) {
    console.error("[resolveSafePath] Path traversal blocked:", {
      base,
      target,
      resolvedBase,
      resolvedTarget,
    });
    throw new Error("Path traversal blocked: " + target);
  }
  return resolvedTarget;
}

function applyWindowBlur(win, enabled) {
  if (!win || process.platform === "win32") return;
  win.setBackgroundColor(enabled ? "#00000000" : "#0C0E12");
}

function createWindow() {
  const cfg = configService.read();
  const isWin = process.platform === "win32";
  const blurEnabled = !isWin && cfg.windowBlur !== false;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    transparent: blurEnabled,
    icon: path.join(
      __dirname,
      "../public",
      isWin ? "canonical-logo.ico" : "canonical-logo.svg",
    ),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
    backgroundColor: blurEnabled ? "#00000000" : "#0C0E12",
  });

  applyWindowBlur(mainWindow, blurEnabled);

  mainWindow.webContents.on("context-menu", (event, params) => {
    const menu = new Menu();

    // Add spelling suggestions
    for (const suggestion of params.dictionarySuggestions) {
      menu.append(
        new MenuItem({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion),
        }),
      );
    }

    // Allow adding to dictionary
    if (params.misspelledWord) {
      menu.append(
        new MenuItem({
          label: `Add "${params.misspelledWord}" to Dictionary`,
          click: () =>
            mainWindow.webContents.session.addWordToSpellCheckerDictionary(
              params.misspelledWord,
            ),
        }),
      );
    }

    if (menu.items.length > 0) menu.append(new MenuItem({ type: "separator" }));

    // macOS Writing Tools (Apple Intelligence)
    if (process.platform === "darwin") {
      menu.append(new MenuItem({ role: "writingTools" }));
      menu.append(new MenuItem({ type: "separator" }));
    }

    // Standard Edit actions
    menu.append(
      new MenuItem({ role: "cut", enabled: params.editFlags.canCut }),
    );
    menu.append(
      new MenuItem({ role: "copy", enabled: params.editFlags.canCopy }),
    );
    menu.append(
      new MenuItem({ role: "paste", enabled: params.editFlags.canPaste }),
    );
    menu.append(new MenuItem({ type: "separator" }));

    // macOS Spelling & Grammar
    if (process.platform === "darwin") {
      menu.append(
        new MenuItem({
          label: "Spelling and Grammar",
          submenu: [
            { role: "showSpellingPanel" },
            { role: "checkSpellingLayout" },
            { type: "separator" },
            { role: "checkSpelling" },
          ],
        }),
      );
    } else {
      // Windows/Linux spelling toggle if needed (Electron doesn't have a role for this, handled by OS/Web)
    }

    menu.popup();
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_URL || "http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.webContents.on("did-finish-load", () => {
    if (fileToOpenOnStartup) {
      mainWindow.webContents.send("menu:open-file", fileToOpenOnStartup);
      fileToOpenOnStartup = null;
    }
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const isDevUrl =
      isDev &&
      url.startsWith(process.env.VITE_DEV_URL || "http://localhost:5173");
    const isFileUrl = !isDev && url.startsWith("file://");
    if (!isDevUrl && !isFileUrl) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const { shell } = require("electron");
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

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
app.setAsDefaultProtocolClient("canonic");

// macOS: handle canonic:// links when app is already open
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

function handleDeepLink(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "open") {
      const docUrl = u.searchParams.get("url");
      if (docUrl && mainWindow) {
        mainWindow.focus();
        mainWindow.webContents.send("share:open-peer", { url: docUrl });
      }
    }
  } catch (e) {
    console.error("[deep-link] parse error", e);
  }
}

app.on("will-quit", () => {
  if (networkWatcherInterval) clearInterval(networkWatcherInterval);
  discoveryService.stopDiscovery();
  stopWatcher();
});

async function setDefaultEditor(value) {
  if (value) {
    app.setAsDefaultProtocolClient("canonic");

    if (process.platform === "win32") {
      shell.openExternal("ms-settings:defaultapps");
    } else if (process.platform === "linux") {
      try {
        exec("xdg-mime default canonic.desktop text/markdown");
      } catch (e) {
        console.error("[main] Failed to set default mime type", e);
      }
    } else if (process.platform === "darwin") {
      if (!app.isPackaged) {
        await dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "Dev Mode",
          message:
            "Default editor registration only works in a packaged build.",
          detail: "Build and install the app, then try again.",
          buttons: ["OK"],
        });
        return false;
      }

      // swift CLI required (Xcode Command Line Tools)
      const swiftCheck = spawnSync("which", ["swift"], { encoding: "utf8" });
      const swiftAvailable = swiftCheck.status === 0;

      if (swiftAvailable) {
        const bundleId = "ai.canonic.app";
        console.log("[main] Setting default .md editor to", bundleId);

        // Use LSSetDefaultRoleHandlerForContentType — works silently on all macOS
        // versions without requiring a consent dialog (unlike NSWorkspace.setDefaultApplication
        // on macOS 12+ which needs UI and can't run from a subprocess).
        // LSRegisterURL forces LaunchServices to re-scan the app bundle so it picks
        // up the LSItemContentTypes we added in afterPack.js.
        const script = [
          "import CoreServices",
          "import Foundation",
          "",
          'let bundleId = "' + bundleId + '"',
          'print("Bundle ID:", bundleId)',
          "",
          "guard let appUrls = LSCopyApplicationURLsForBundleIdentifier(bundleId as CFString, nil)?.takeRetainedValue() as? [URL],",
          "      let appUrl = appUrls.first else {",
          '    print("ERROR: app not found")',
          "    exit(1)",
          "}",
          'print("App path:", appUrl.path)',
          "",
          "let regStatus = LSRegisterURL(appUrl as CFURL, true)",
          'print("LSRegisterURL:", regStatus)',
          "",
          'let utis = ["public.markdown", "net.daringfireball.markdown"]',
          "var failed = false",
          "for uti in utis {",
          "    let s = LSSetDefaultRoleHandlerForContentType(uti as CFString, .editor, bundleId as CFString)",
          '    print("LSSet(\\(uti)):", s)',
          "    if s != noErr { failed = true }",
          "}",
          "if failed { exit(1) }",
          'print("OK")',
        ].join("\n");

        const tempScriptPath = path.join(
          os.tmpdir(),
          "set_default_" + Date.now() + ".swift",
        );
        fs.writeFileSync(tempScriptPath, script);

        let swiftStdout = "";
        let scriptSucceeded = false;
        try {
          const result = spawnSync("swift", [tempScriptPath], {
            encoding: "utf8",
            timeout: 30000,
          });
          swiftStdout = (result.stdout || "").trim();
          console.log("[main] Swift output:\n", swiftStdout);
          if (result.status !== 0) {
            console.error("[main] Swift stderr:\n", result.stderr);
            await dialog.showMessageBox(mainWindow, {
              type: "error",
              title: "Set Default Editor — Debug",
              message: "Swift script failed (exit " + result.status + ")",
              detail: swiftStdout + "\n" + (result.stderr || ""),
              buttons: ["OK"],
            });
          } else {
            scriptSucceeded = true;
          }
        } finally {
          try {
            fs.unlinkSync(tempScriptPath);
          } catch {}
        }

        if (scriptSucceeded) {
          // LSSetDefaultRoleHandlerForContentType returning noErr is the confirmation.
          // A separate verification subprocess reads stale LaunchServices cache and
          // gives false negatives, so we trust the noErr result directly.
          await dialog.showMessageBox({
            type: "info",
            title: "Default Editor Set",
            message: "Canonic is now your default Markdown editor.",
          });
          return true;
        }
      } else {
        console.log("[main] Swift not available — showing manual instructions");
      }

      // Fallback to manual instructions
      await dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Set Default Editor",
        message: "To make Canonic your default .md editor on macOS:",
        detail:
          "1. Right-click any .md file in Finder\n2. Select 'Get Info'\n3. Under 'Open with', select Canonic\n4. Click 'Change All...'",
        buttons: ["Got it"],
      });
    }
    return true;
  } else {
    return app.removeAsDefaultProtocolClient("canonic");
  }
}

function createMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Settings...",
                accelerator: "CmdOrCtrl+,",
                click: () => {
                  mainWindow?.webContents.send("menu:open-settings");
                },
              },
              {
                label: "Set as Default Markdown Editor",
                click: async () => {
                  await setDefaultEditor(true);
                },
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Workspace...",
          accelerator: "CmdOrCtrl+Shift+N",
          click: async () => {
            const { canceled, filePaths } = await dialog.showOpenDialog(
              mainWindow,
              {
                properties: ["openDirectory", "createDirectory"],
                title: "Choose a folder for your new workspace",
              },
            );
            if (!canceled && filePaths[0]) {
              mainWindow?.webContents.send("menu:new-workspace", filePaths[0]);
            }
          },
        },
        {
          label: "Open File...",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            const { canceled, filePaths } = await dialog.showOpenDialog(
              mainWindow,
              {
                title: "Open Markdown File",
                filters: [{ name: "Markdown", extensions: ["md"] }],
                properties: ["openFile"],
              },
            );
            if (!canceled && filePaths[0]) {
              mainWindow?.webContents.send("menu:open-file", filePaths[0]);
            }
          },
        },
        {
          label: "Open Workspace...",
          accelerator: "CmdOrCtrl+Shift+O",
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ["openDirectory", "createDirectory"],
              title: "Open or create a Canonic workspace",
            });
            if (!result.canceled && result.filePaths[0]) {
              mainWindow?.webContents.send(
                "menu:open-workspace",
                result.filePaths[0],
              );
            }
          },
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(process.platform === "darwin"
          ? [
              { type: "separator" },
              { role: "front" },
              { type: "separator" },
              { role: "window" },
            ]
          : [{ role: "close" }]),
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Learn More",
          click: async () => {
            await shell.openExternal("https://canonic.local");
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  log("[main] app ready");
  try {
    setupIpcHandlers();
    log("[main] IPC handlers registered");
  } catch (err) {
    logError("[main] setupIpcHandlers failed:", err);
  }

  // Serve workspace assets (images etc.) via canonic-asset:///relative/path
  protocol.handle('canonic-asset', (request) => {
    try {
      if (!activeWorkspacePath) return new Response('no workspace', { status: 404 })
      const url = new URL(request.url)
      const relativePath = decodeURIComponent((url.hostname + url.pathname).replace(/^\//, ''))
      const fullPath = resolveSafePath(activeWorkspacePath, relativePath)
      const data = fs.readFileSync(fullPath)
      const ext = path.extname(relativePath).slice(1).toLowerCase()
      const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
      return new Response(data, { headers: { 'Content-Type': mimeMap[ext] || 'application/octet-stream' } })
    } catch (e) {
      return new Response('not found', { status: 404 })
    }
  })

  createMenu();
  createWindow();
  setupAutoUpdater();

  // Auto-share workspace if previously enabled
  const cfg = configService.read();
  if (
    cfg?.autoShareWorkspace &&
    cfg.defaultWorkspacePath &&
    fs.existsSync(cfg.defaultWorkspacePath)
  ) {
    log("[main] auto-sharing workspace:", cfg.defaultWorkspacePath);
    const options = {
      ...(cfg.sharingDefaults || {}),
      excludedPaths: cfg.sharingExcludedPaths || [],
      id: shareService.WORKSPACE_KEY,
    };
    const wsName = path.basename(cfg.defaultWorkspacePath);
    shareService
      .startWorkspaceShare(
        [{ path: cfg.defaultWorkspacePath, name: wsName }],
        options,
      )
      .then((result) => {
        if (result.success) {
          const author = cfg.displayName || os.userInfo().username;
          discoveryService.announceShare({
            port: result.port,
            token: result.token,
            scope: "workspace",
            permission: result.permission,
            author,
          });
          startNetworkWatcher();
        }
      })
      .catch((err) => {
        logError("[main] auto-share failed:", err);
      });
  }

  if (cfg?.autoShareAllWorkspaces) {
    const ALL_WS_KEY = "__all_workspaces__";
    // We don't have recentWorkspaces in main process easily accessible (they are in localStorage).
    // Actually, let's just trigger a 'menu:sync-all-workspaces' to the renderer or similar?
    // No, better to read the recentWorkspaces if they were stored in config?
    // They are not. They are only in localStorage.
    // So the RENDERER must trigger all-workspace sharing on load.
  }

  await apiServer
    .start((event) => {
      if (event.type === "session-start") {
        mainWindow?.focus();
        if (process.platform === "darwin") app.focus({ steal: true });
      }
      mainWindow?.webContents.send(`agent:${event.type}`, event.data);
    })
    .catch((err) => {
      logError("[api-server] failed to start:", err);
    });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function setupAutoUpdater() {
  if (isDev) return;

  // Read channel preference at boot (changing channel requires restart)
  const cfg = configService.read();
  autoUpdater.autoDownload = false; // downloads are controlled manually
  autoUpdater.allowPrerelease = cfg?.updateChannel === "experimental";

  autoUpdater.checkForUpdatesAndNotify();

  // Check for updates every 4 hours
  setInterval(
    () => {
      autoUpdater.checkForUpdates();
    },
    4 * 60 * 60 * 1000,
  );

  autoUpdater.on("update-available", (info) => {
    if (!semver.gt(info.version, app.getVersion())) {
      log(
        "[updates] available version",
        info.version,
        "is not newer than",
        app.getVersion(),
      );
      return;
    }

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
  apiServer.stop();
  if (process.platform !== "darwin") app.quit();
});

function setupIpcHandlers() {
  try {
    log("[ipc] loading git service");
    gitService = require("./git");
    log("[ipc] loading search service");
    searchService = require("./search");
    log("[ipc] loading share service");
    shareService = require("./share");
    log("[ipc] all services loaded");
  } catch (err) {
    logError("[ipc] failed to load services:", err);
    throw err;
  }

  // Forward share stats events to renderer
  shareService.emitter.on("stats", (stats) => {
    mainWindow?.webContents.send("share:stats", stats);
  });

  // Forward incoming peer comments to renderer
  shareService.emitter.on("comments:received", ({ filePath, comments }) => {
    mainWindow?.webContents.send("comments:received", { filePath, comments });
  });

  // Start mDNS discovery and wire peer events
  discoveryService.startDiscovery();

  discoveryService.emitter.on("peer:found", (peer) => {
    const idx = discoveredPeers.findIndex((p) => p.id === peer.id);
    if (idx >= 0) discoveredPeers[idx] = peer;
    else discoveredPeers.push(peer);

    // Upsert to peers.json
    const peers = readPeers();
    const pidx = peers.findIndex((p) => p.id === peer.id);
    if (pidx >= 0)
      peers[pidx] = { ...peers[pidx], ...peer, lastSeen: Date.now() };
    else peers.push({ ...peer, favorited: false, lastSeen: Date.now() });
    fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2), "utf-8");

    mainWindow?.webContents.send("peers:found", peer);
  });

  discoveryService.emitter.on("peer:lost", ({ id }) => {
    const idx = discoveredPeers.findIndex((p) => p.id === id);
    if (idx >= 0) discoveredPeers.splice(idx, 1);
    mainWindow?.webContents.send("peers:lost", { id });
  });

  // Start 60s comment sync interval
  setInterval(() => flushPeerComments(discoveredPeers), 60000);

  ipcMain.handle("dialog:confirm", async (_, title, message) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["Cancel", "Continue"],
      defaultId: 0,
      cancelId: 0,
      title,
      message,
    });
    return result.response === 1;
  });

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
        activeWorkspacePath = workspacePath
        const result = await gitService.initWorkspace(workspacePath, template);
        startWatcher(workspacePath, (index, gitChanged) => {
          if (gitChanged) {
            mainWindow?.webContents.send("git:branch-updated");
          } else {
            mainWindow?.webContents.send("files:index-update", index);
          }
        });
        return result;
      } catch (err) {
        return { error: err.message, path: workspacePath };
      }
    },
  );

  ipcMain.handle("workspace:get-default", async () => {
    const defaultPath = path.join(os.homedir(), "canonic");
    return defaultPath;
  });

  ipcMain.handle("files:open-dialog", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "Open Markdown File",
      filters: [{ name: "Markdown", extensions: ["md"] }],
      properties: ["openFile"],
    });
    if (canceled) return null;
    return filePaths[0];
  });

  ipcMain.handle("app:version", () => {
    return app.getVersion() || require("../package.json").version;
  });

  ipcMain.handle("app:is-default-md", async () => {
    const isProtocolDefault = app.isDefaultProtocolClient("canonic");

    try {
      if (process.platform === "win32") {
        const output = execSync(
          'reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.md\\UserChoice" /v ProgId',
          { encoding: "utf8" },
        );
        return output.includes("Canonic") || output.includes("ai.canonic.app");
      } else if (process.platform === "linux") {
        const output = execSync("xdg-mime query default text/markdown", {
          encoding: "utf8",
        });
        return output.toLowerCase().includes("canonic");
      } else if (process.platform === "darwin") {
        // Read LaunchServices prefs plist directly — LSCopy* APIs read from a
        // per-process cache that doesn't reflect writes made by other subprocesses.
        const pyCode = [
          "import plistlib, os, sys",
          "p = os.path.expanduser('~/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist')",
          "try:",
          "    with open(p, 'rb') as f: d = plistlib.load(f)",
          "    for h in d.get('LSHandlers', []):",
          "        if h.get('LSHandlerContentType') == 'public.markdown':",
          "            print(h.get('LSHandlerRoleEditor') or h.get('LSHandlerRoleAll', ''))",
          "            sys.exit(0)",
          "    print('')",
          "except: print('')",
        ].join("\n");
        const result = spawnSync("python3", ["-c", pyCode], {
          encoding: "utf8",
          timeout: 5000,
        });
        return (result.stdout || "").trim() === "ai.canonic.app";
      }
    } catch (e) {
      // Fallback
    }

    return isProtocolDefault;
  });

  ipcMain.handle("app:set-default-md", async (_, value) => {
    return setDefaultEditor(value);
  });

  // --- Files ---
  ipcMain.handle("files:index", () => getIndex());

  ipcMain.handle("files:list", async (_, workspacePath) => {
    if (!workspacePath) return [];
    return gitService.listFiles(workspacePath);
  });

  ipcMain.handle("files:read", async (_, workspacePath, filePath) => {
    try {
      console.log("[main:files:read] reading:", { workspacePath, filePath });
      const fullPath = resolveSafePath(workspacePath, filePath);
      if (!fs.existsSync(fullPath)) {
        console.warn("[main:files:read] file not found:", fullPath);
        return null;
      }
      const content = fs.readFileSync(fullPath, "utf-8");
      console.log("[main:files:read] success, read", content.length, "bytes");
      return content;
    } catch (err) {
      console.error("[main:files:read] error:", err.message);
      return null;
    }
  });

  ipcMain.handle("files:write", async (_, workspacePath, filePath, content) => {
    try {
      const fullPath = resolveSafePath(workspacePath, filePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, content, "utf-8");
      // Push live update to any connected WebSocket clients
      shareService.pushUpdate(filePath, content);
      return true;
    } catch (err) {
      console.error("[main:files:write] error:", err.message);
      return false;
    }
  });

  ipcMain.handle("files:write-binary", async (_, workspacePath, filePath, buffer) => {
    try {
      const fullPath = resolveSafePath(workspacePath, filePath)
      const dir = path.dirname(fullPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(fullPath, Buffer.from(buffer))
      return filePath
    } catch (err) {
      console.error("[main:files:write-binary] error:", err.message)
      return null
    }
  })

  ipcMain.handle("files:delete", async (_, workspacePath, filePath) => {
    const fullPath = resolveSafePath(workspacePath, filePath);
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
    const d = resolveSafePath(workspacePath, ".canonic", "trash");
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
      const id = crypto.randomUUID();
      const src = resolveSafePath(workspacePath, itemPath);
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
    const dest = resolveSafePath(workspacePath, item.originalPath);
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
    const fullPath = resolveSafePath(workspacePath, dirPath);
    fs.mkdirSync(fullPath, { recursive: true });
    fs.writeFileSync(path.join(fullPath, ".gitkeep"), "", "utf-8");
    return true;
  });

  ipcMain.handle("files:rmdir", async (_, workspacePath, dirPath) => {
    const fullPath = resolveSafePath(workspacePath, dirPath);
    if (fs.existsSync(fullPath))
      fs.rmSync(fullPath, { recursive: true, force: true });
    return true;
  });

  ipcMain.handle("files:move", async (_, workspacePath, oldPath, newPath) => {
    const oldFull = resolveSafePath(workspacePath, oldPath);
    const newFull = resolveSafePath(workspacePath, newPath);
    const dir = path.dirname(newFull);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(oldFull, newFull);
    return true;
  });

  ipcMain.handle("files:new", async (_, workspacePath, fileName) => {
    const filePath = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
    const fullPath = resolveSafePath(workspacePath, filePath);
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

  ipcMain.handle("git:is-file-tracked", async (_, workspacePath, filePath) => {
    return gitService.isFileTracked(workspacePath, filePath);
  });

  // --- Comments ---
  ipcMain.handle("comments:get", async (_, docId) => {
    const commentsFile = path.join(CANONIC_DIR, "comments", `${docId}.json`);
    if (!fs.existsSync(commentsFile)) return [];
    return JSON.parse(fs.readFileSync(commentsFile, "utf-8"));
  });

  ipcMain.handle("comments:save", async (_, docId, comments) => {
    const commentsDir = path.join(CANONIC_DIR, "comments");
    if (!fs.existsSync(commentsDir)) {
      fs.mkdirSync(commentsDir, { recursive: true });
    }
    const commentsFile = path.join(commentsDir, `${docId}.json`);
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

  const wsSearchService = require("./workspace-search");
  ipcMain.handle("search:workspace", async (_, params) => {
    return wsSearchService.searchWorkspace(params || {});
  });
  ipcMain.handle("search:workspace-replace", async (_, params) => {
    return wsSearchService.applyReplacement(params || {});
  });

  // --- Sharing ---
  ipcMain.handle("share:start", async (_, workspacePath, filePath, options) => {
    const result = await shareService.startShare(
      workspacePath,
      filePath,
      options,
    );
    if (result.success) {
      const cfg = configService.read();
      const author = cfg?.displayName || os.userInfo().username;
      discoveryService.announceShare({
        port: result.port,
        token: result.token,
        scope: options?.scope || "file",
        permission: result.permission,
        author,
        taggedOnly: options?.taggedOnly,
      });
      startNetworkWatcher();
    }
    return result;
  });

  ipcMain.handle("share:stop", async (_, filePath) => {
    const result = shareService.stopShare(filePath);
    if (result.success) discoveryService.unpublishShare(result.port);
    return result;
  });

  ipcMain.handle("share:open-link", async (_, url) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
  });

  ipcMain.handle("share:stats", async (_, filePath) => {
    return shareService.getStats(filePath);
  });

  ipcMain.handle("share:list-active", async () => {
    return shareService.listActiveShares();
  });

  ipcMain.handle("share:start-workspace", async (_, workspacePath, options) => {
    const wsName = path.basename(workspacePath);
    const result = await shareService.startWorkspaceShare(
      [{ path: workspacePath, name: wsName }],
      {
        ...options,
        id: shareService.WORKSPACE_KEY,
      },
    );

    if (result.success) {
      const cfg = configService.read();
      const author = cfg?.displayName || os.userInfo().username;
      discoveryService.announceShare({
        port: result.port,
        token: result.token,
        scope: "workspace",
        permission: result.permission,
        author,
        taggedOnly: options?.taggedOnly,
      });
      startNetworkWatcher();

      // Persist auto-share preference
      const currentCfg = configService.read();
      if (currentCfg) {
        configService.write({ ...currentCfg, autoShareWorkspace: true });
      }
    }
    return result;
  });

  ipcMain.handle(
    "share:start-all-workspaces",
    async (_, workspaces, options) => {
      const key = "__all_workspaces__";
      const result = await shareService.startWorkspaceShare(workspaces, {
        ...options,
        id: key,
        scope: "all-workspaces",
      });

      if (result.success) {
        const cfg = configService.read();
        const author = cfg?.displayName || os.userInfo().username;
        discoveryService.announceShare({
          port: result.port,
          token: result.token,
          scope: "all-workspaces",
          permission: result.permission,
          author,
          taggedOnly: options?.taggedOnly,
        });
        startNetworkWatcher();
      }
      return result;
    },
  );

  ipcMain.handle(
    "share:stop-workspace",
    async (_, key = shareService.WORKSPACE_KEY) => {
      const result = shareService.stopWorkspaceShare(key);
      if (result.success) {
        discoveryService.unpublishShare(result.port);

        if (key === shareService.WORKSPACE_KEY) {
          const cfg = configService.read();
          if (cfg) {
            configService.write({ ...cfg, autoShareWorkspace: false });
          }
        }
      }
      return result;
    },
  );

  ipcMain.handle("share:workspace-stats", async () => {
    return shareService.getStats(shareService.WORKSPACE_KEY);
  });

  // --- Peers ---
  ipcMain.handle("peers:list", async () => {
    return readPeers();
  });

  ipcMain.handle("peers:list-discovered", async () => {
    return discoveredPeers;
  });

  ipcMain.handle("peers:favorite", async (_, peerId) => {
    const peers = readPeers();
    const idx = peers.findIndex((p) => p.id === peerId);
    if (idx >= 0) peers[idx].favorited = true;
    fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2), "utf-8");
    return { success: true };
  });

  ipcMain.handle("peers:unfavorite", async (_, peerId) => {
    const peers = readPeers();
    const idx = peers.findIndex((p) => p.id === peerId);
    if (idx >= 0) peers[idx].favorited = false;
    fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2), "utf-8");
    return { success: true };
  });

  ipcMain.handle("peers:fetch-manifest", async (_, peerId) => {
    const peer = discoveredPeers.find((p) => p.id === peerId);
    if (!peer) return { success: false, error: "Peer not online" };
    try {
      const { default: fetch } = await import("node-fetch");
      const res = await fetch(
        `http://${peer.host}:${peer.port}/manifest?token=${peer.token}`,
        { timeout: 10000 },
      );
      if (!res.ok) {
        logError(
          `[peers] manifest fetch failed for ${peerId}: HTTP ${res.status}`,
        );
        return { success: false, error: `HTTP ${res.status}` };
      }
      return { success: true, ...(await res.json()) };
    } catch (err) {
      logError(`[peers] manifest fetch error for ${peerId}:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("peers:open-peer-file", async (_, peerId, relPath, wsName) => {
    const peer = discoveredPeers.find((p) => p.id === peerId);
    if (!peer) return { success: false, error: "Peer not online" };
    try {
      const { default: fetch } = await import("node-fetch");
      let url = `http://${peer.host}:${peer.port}/file?path=${encodeURIComponent(relPath)}&token=${peer.token}`;
      if (wsName) url += `&workspace=${encodeURIComponent(wsName)}`;

      const res = await fetch(url, {
        timeout: 15000,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        logError(
          `[peers] file fetch failed for ${peerId}/${relPath}: HTTP ${res.status}`,
        );
        return { success: false, error: `HTTP ${res.status}` };
      }
      return { success: true, ...(await res.json()) };
    } catch (err) {
      logError(`[peers] file fetch error for ${peerId}/${relPath}:`, err);
      return { success: false, error: err.message };
    }
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
    gitService.setAuthor({
      name: saved.displayName,
      email: `${saved.displayName.replace(/\s+/g, ".")}@canonic.local`,
    });

    // Apply window blur toggle at runtime
    applyWindowBlur(mainWindow, saved.windowBlur !== false);

    // Re-announce any active shares so peers see the new name
    const activeShares = shareService.listActiveShares();
    for (const share of activeShares) {
      discoveryService.unpublishShare(share.port);
      discoveryService.announceShare({
        port: share.port,
        token: share.token,
        scope:
          share.key === shareService.WORKSPACE_KEY
            ? "workspace"
            : share.key === "__all_workspaces__"
              ? "all-workspaces"
              : "file",
        permission: share.permission,
        author: saved.displayName || os.userInfo().username,
        taggedOnly: share.taggedOnly,
      });
    }

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
    const p = resolveSafePath(workspacePath, ".canonic", "doc-branches.json");
    if (!fs.existsSync(p)) return {};
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {
      return {};
    }
  });

  ipcMain.handle("doc-branches:set", async (_, workspacePath, data) => {
    const dir = resolveSafePath(workspacePath, ".canonic");
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
    const result = await autoUpdater.checkForUpdates();
    if (result?.updateInfo) {
      if (!semver.gt(result.updateInfo.version, app.getVersion())) {
        return { updateInfo: null };
      }
    }
    return result;
  });

  ipcMain.handle("update:download", async () => {
    if (isDev) return;
    return autoUpdater.downloadUpdate();
  });

  ipcMain.handle("update:install", async () => {
    updateDownloaded = false; // prevent close handler from re-showing install dialog
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

  // --- Inline completion ---
  ipcMain.handle(
    "ai:complete",
    async (
      _,
      { prefix, suffix, model, apiKey, baseUrl, maxTokens, extraInstructions },
    ) => {
      if (!apiKey || !baseUrl) return { text: "" };
      const base = baseUrl.replace(/\/+$/, "");
      try {
        let text = "";
        if (base.includes("codestral.mistral.ai")) {
          const response = await fetch(`${base}/fim/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              prompt: prefix,
              suffix,
              max_tokens: maxTokens ?? 25,
              stop: ["\n", "\n\n", "  "],
            }),
          });
          if (!response.ok) return { text: "" };
          const data = await response.json();
          text = (data.choices?.[0]?.text || "").replace(/^\n+/, "");
        } else {
          const response = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content:
                    "You are an inline text completion assistant for a markdown editor. " +
                    "Complete the text at the cursor. Return ONLY the completion — no explanation, " +
                    "no fences, no preamble. Keep it concise (1–2 sentences max). " +
                    "Match the document tone. If no good completion exists, return empty string." +
                    (extraInstructions
                      ? `\n\nAdditional instructions:\n${extraInstructions}`
                      : ""),
                },
                {
                  role: "user",
                  content: `<prefix>\n${prefix}\n</prefix>\n<suffix>\n${suffix}\n</suffix>\nComplete the text immediately after </prefix>.`,
                },
              ],
              stream: false,
              max_tokens: maxTokens ?? 25,
            }),
          });
          if (!response.ok) return { text: "" };
          const data = await response.json();
          text = (data.choices?.[0]?.message?.content || "").replace(
            /^\n+/,
            "",
          );
        }
        return { text: text.trim() };
      } catch {
        return { text: "" };
      }
    },
  );

  // --- Agent session ---
  ipcMain.handle("agent:submit", async (_, { sessionId, prompt, content }) => {
    return await apiServer.submitAction(sessionId, prompt, content);
  });

  ipcMain.handle("agent:cancel", async (_, sessionId) => {
    return apiServer.cancelSession(sessionId);
  });

  log("[ipc] all handlers registered successfully");
}
