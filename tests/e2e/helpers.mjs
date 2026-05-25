import { _electron as electron } from "@playwright/test";
import path from "path";
import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

/**
 * Launch the Electron app with a fresh temp config dir and an empty workspace.
 * Returns { app, page, workspacePath, configDir }.
 */
export async function launchApp() {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "canonic-e2e-"));
  const workspacePath = path.join(configDir, "workspace");
  fs.mkdirSync(workspacePath);

  // Write a minimal config so the app skips the setup screen
  fs.writeFileSync(
    path.join(configDir, "config.json"),
    JSON.stringify({
      displayName: "E2E Test",
      defaultWorkspacePath: workspacePath,
      providers: [],
      assistant: { providerId: "", model: "" },
      completion: { enabled: false, providerId: "", model: "codestral-latest" },
      telemetryEnabled: false,
      autoUpdate: false,
    }),
  );

  const app = await electron.launch({
    args: [path.join(ROOT, "electron/main.js")],
    env: {
      ...process.env,
      CANONIC_CONFIG_DIR: configDir,
      NODE_ENV: "test",
      VITE_DEV_URL: `file://${path.join(ROOT, "dist/index.html")}`,
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");

  return { app, page, workspacePath, configDir };
}

export async function closeApp(app, configDir) {
  await app.close();
  fs.rmSync(configDir, { recursive: true, force: true });
}

/**
 * Create a new document and open it in the editor.
 * Returns the file path.
 */
export async function createAndOpenDoc(
  page,
  workspacePath,
  name = "test-doc.md",
) {
  const filePath = path.join(workspacePath, name);
  fs.writeFileSync(filePath, "");

  // Wait for app to mount before manipulating localStorage / routing
  await page.waitForSelector("#app, .workspace-setup, .main-layout", {
    timeout: 15000,
  });

  // Seed a recent workspace pointing at our temp dir, then navigate to /workspace
  // so MainLayout auto-restores it (rather than landing on the WorkspaceSetup picker
  // populated by the host machine's real recent workspaces).
  await page.evaluate((wp) => {
    localStorage.setItem(
      "canonic:recentWorkspaces",
      JSON.stringify([{ path: wp, name: "e2e-ws", openedAt: Date.now() }]),
    );
    location.hash = "#/workspace";
    location.reload();
  }, workspacePath);

  await page.waitForLoadState("domcontentloaded");

  // Wait for file tree to render so the file we created is clickable
  const baseName = path.basename(name, path.extname(name));
  const fileNode = page.locator(".tree-node .node-name", { hasText: baseName });
  await fileNode.first().waitFor({ state: "visible", timeout: 15000 });
  await fileNode.first().click();

  // Target the specific editable editor
  await page.waitForSelector('.editor[contenteditable="true"]', {
    timeout: 15000,
  });
  return filePath;
}

/**
 * Click inside the editor and type text, optionally pressing Enter first.
 */
export async function typeInEditor(page, text, { newLine = false } = {}) {
  // Use a more specific locator to avoid strict mode violations
  const editor = page.locator('.editor[contenteditable="true"]').first();
  await editor.click();
  if (newLine) await page.keyboard.press("Enter");
  await page.keyboard.type(text);
}

/**
 * Get the inner HTML of the editor content area.
 */
export function editorHTML(page) {
  return page.locator(".editor").innerHTML();
}

/**
 * Get all text content of the editor.
 */
export function editorText(page) {
  return page.locator(".editor").innerText();
}
