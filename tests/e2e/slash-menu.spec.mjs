import { test, expect } from "@playwright/test";
import {
  launchApp,
  closeApp,
  createAndOpenDoc,
  typeInEditor,
} from "./helpers.mjs";

test.describe("slash menu and table features", () => {
  let app, page, workspacePath, configDir;

  test.beforeEach(async () => {
    ({ app, page, workspacePath, configDir } = await launchApp());
    await createAndOpenDoc(page, workspacePath);
  });

  test.afterEach(async () => {
    await closeApp(app, configDir);
  });

  test("/ triggers slash menu", async () => {
    await typeInEditor(page, "/");
    await expect(page.locator(".slash-tooltip")).toBeVisible();
    await expect(page.locator(".slash-tooltip-item.active")).toContainText(
      "Insert",
    );
  });

  test("Ctrl+I triggers slash menu", async () => {
    const isMac = process.platform === "darwin";
    const mod = isMac ? "Meta" : "Control";
    await page.keyboard.down(mod);
    await page.keyboard.press("i");
    await page.keyboard.up(mod);
    await expect(page.locator(".slash-tooltip")).toBeVisible();
  });

  test("/ → Insert → Table inserts a table", async () => {
    await typeInEditor(page, "/");
    await page.keyboard.press("Enter"); // Select Insert
    // After entering submenu, first item is Text & Headings based on our data structure
    // main -> insert (submenu)
    // insert -> text (submenu), lists (submenu), table (action), etc.

    // Let's search specifically for table
    await page.keyboard.type("table");
    await page.keyboard.press("Enter");

    await expect(page.locator(".editor table")).toBeVisible();
    await expect(page.locator(".editor th")).toHaveCount(2);
  });

  test("Ctrl+I+T inserts a table rapidly", async () => {
    const isMac = process.platform === "darwin";
    const mod = isMac ? "Meta" : "Control";
    await page.keyboard.down(mod);
    await page.keyboard.press("i");
    await page.keyboard.press("t");
    await page.keyboard.up(mod);

    await expect(page.locator(".editor table")).toBeVisible();
  });

  test("table toolbar appears when clicking inside table", async () => {
    // Insert table first
    await typeInEditor(page, "/");
    await page.keyboard.press("Enter");
    await page.keyboard.type("table");
    await page.keyboard.press("Enter");

    // Click first cell
    await page.locator(".editor th").first().click();

    // Check for table toolbar
    await expect(page.locator(".table-toolbar")).toBeVisible();
  });

  test("right-click inside table opens context menu", async () => {
    // Insert table first
    await typeInEditor(page, "/");
    await page.keyboard.press("Enter");
    await page.keyboard.type("table");
    await page.keyboard.press("Enter");

    // Right click first cell
    await page.locator(".editor th").first().click({ button: "right" });

    // Check for context menu
    await expect(page.locator(".context-menu")).toBeVisible();
    await expect(page.locator(".menu-item")).toContainText([
      "Add Row Above",
      "Add Column Left",
    ]);
  });

  test("slash menu filtering works", async () => {
    await typeInEditor(page, "/");
    await page.keyboard.press("Enter"); // Go to Insert submenu
    await page.keyboard.type("mermaid");
    await expect(page.locator(".slash-tooltip-item.active")).toContainText(
      "Mermaid Diagram",
    );
    await page.keyboard.press("Enter");
    await expect(
      page.locator('.editor [data-type="mermaid_block"]'),
    ).toBeVisible();
  });

  test("inserting list via slash menu works without error", async () => {
    await typeInEditor(page, "/");
    await page.keyboard.press("Enter"); // Insert submenu
    await page.keyboard.type("lists");
    await page.keyboard.press("Enter"); // Lists submenu
    await page.keyboard.type("bullet");
    await page.keyboard.press("Enter");

    await expect(page.locator(".editor ul li")).toBeVisible();
    // Ensure slash is gone
    const content = await page.locator(".editor").innerText();
    expect(content).not.toContain("/");
  });

  async function insertTableAndFocus() {
    await typeInEditor(page, "/");
    await page.keyboard.press("Enter");
    await page.keyboard.type("table");
    await page.keyboard.press("Enter");
    await page.locator(".editor table").first().waitFor({ state: "visible" });
    // Click a body cell (not header) — addRowBefore on a header row triggers
    // Milkdown's GFM header re-rendering and inserts an extra row.
    await page.locator(".editor td").first().click();
    await expect(page.locator(".table-toolbar")).toBeVisible();
  }

  // Real data rows excluding Milkdown's empty `data-is-header` marker rows.
  function dataRows() {
    return page.locator(
      ".editor table tr:not([data-is-header]):has(td, th)",
    );
  }

  // Click via DOM so the mouse events (and any focus/selection side-effects)
  // don't interfere with the editor's current selection in the table cell.
  async function clickToolbar(title) {
    await page
      .locator(`.table-toolbar .tb-btn[title="${title}"]`)
      .evaluate((el) => el.click());
  }

  test("toolbar add row below adds a row", async () => {
    await insertTableAndFocus();
    await expect(dataRows()).toHaveCount(2);
    await clickToolbar("Add row below");
    await expect(dataRows()).toHaveCount(3);
  });

  test("toolbar add row above adds a row", async () => {
    await insertTableAndFocus();
    await clickToolbar("Add row above");
    await expect(dataRows()).toHaveCount(3);
  });

  test("toolbar delete row removes a row", async () => {
    await insertTableAndFocus();
    await clickToolbar("Add row below");
    await expect(dataRows()).toHaveCount(3);
    await clickToolbar("Delete row");
    await expect(dataRows()).toHaveCount(2);
  });

  test("toolbar add column right adds a column", async () => {
    await insertTableAndFocus();
    const firstRowCells = () =>
      dataRows().first().locator("td, th");
    await expect(firstRowCells()).toHaveCount(2);
    await clickToolbar("Add column right");
    await expect(firstRowCells()).toHaveCount(3);
  });

  test("toolbar add column left adds a column", async () => {
    await insertTableAndFocus();
    await clickToolbar("Add column left");
    await expect(dataRows().first().locator("td, th")).toHaveCount(3);
  });

  test("toolbar delete column removes a column", async () => {
    await insertTableAndFocus();
    await clickToolbar("Add column right");
    await expect(dataRows().first().locator("td, th")).toHaveCount(3);
    await clickToolbar("Delete column");
    await expect(dataRows().first().locator("td, th")).toHaveCount(2);
  });

  test("toolbar delete table removes the table", async () => {
    await insertTableAndFocus();
    await page
      .locator(".table-toolbar .tb-btn.del-table")
      .evaluate((el) => el.click());
    await expect(page.locator(".editor table")).toHaveCount(0);
  });

  test("context menu Add Row Below adds a row", async () => {
    await insertTableAndFocus();
    await page.locator(".editor td").first().click({ button: "right" });
    await expect(page.locator(".context-menu")).toBeVisible();
    await page
      .locator(".context-menu .menu-item", { hasText: "Add Row Below" })
      .click();
    await expect(dataRows()).toHaveCount(3);
  });

  test("context menu Delete Column removes a column", async () => {
    await insertTableAndFocus();
    await page.locator(".editor td").first().click({ button: "right" });
    await page
      .locator(".context-menu .menu-item", { hasText: "Delete Column" })
      .click();
    await expect(dataRows().first().locator("td, th")).toHaveCount(1);
  });
});
