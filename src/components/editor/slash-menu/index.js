import { Plugin, PluginKey } from "@milkdown/prose/state";
import { $prose } from "@milkdown/utils";

export const SLASH_MENU_KEY = new PluginKey("slashMenu");

export const createSlashMenuPlugin = (tooltipRef) => {
  let lastModITime = 0;

  return $prose(
    () =>
      new Plugin({
        key: SLASH_MENU_KEY,
        props: {
          handleTextInput(view, from, to, text) {
            if (text !== "/") return false;
            if (!view.editable) return false;

            // Only fire if preceded by a space (so " /") fires but "/" doesn't)
            if (from > 0) {
              const charBefore = view.state.doc.textBetween(from - 1, from);
              if (charBefore !== " ") return false;
            } else {
              // At position 0 (start of doc) — no preceding space
              return false;
            }

            if (tooltipRef.value?.visible) return false;

            // Insert the slash manually so the user sees it while the menu is open
            const tr = view.state.tr.insertText("/", from, to);
            view.dispatch(tr);

            const coords = view.coordsAtPos(from);
            tooltipRef.value?.open(
              { top: coords.bottom + 4, left: coords.left },
              (action) => {
                handleAction(view, from, action);
              },
              () => {
                view.focus();
              },
            );
            return true;
          },
          handleKeyDown(view, event) {
            if (!view.editable) return false;
            const isMod = event.metaKey || event.ctrlKey;

            if (isMod && event.key.toLowerCase() === "i") {
              lastModITime = Date.now();
              if (tooltipRef.value?.visible) return false;

              const { from } = view.state.selection;
              const coords = view.coordsAtPos(from);
              tooltipRef.value?.open(
                { top: coords.bottom + 4, left: coords.left },
                (action) => {
                  handleAction(view, from, action);
                },
                () => view.focus(),
              );
              event.preventDefault();
              return true;
            }

            if (isMod && event.key.toLowerCase() === "t") {
              const now = Date.now();
              if (now - lastModITime < 500) {
                tooltipRef.value?.close();
                const { from } = view.state.selection;
                handleAction(view, from, "insert-table");
                event.preventDefault();
                return true;
              }
            }

            if (tooltipRef.value?.visible) {
              if (event.key === "Escape") {
                tooltipRef.value.close();
                return true;
              }
            }

            return false;
          },
        },
      }),
  );
};

function handleAction(view, pos, action) {
  const { state, dispatch } = view;
  const { schema } = state;
  let tr = state.tr;

  // 1. Identify and delete the trigger slash
  let slashPos = -1;
  try {
    const docText = state.doc.textBetween(
      pos,
      Math.min(pos + 1, state.doc.content.size),
    );
    if (docText === "/") {
      slashPos = pos;
    } else {
      const prevText = state.doc.textBetween(Math.max(0, pos - 1), pos);
      if (prevText === "/") slashPos = pos - 1;
    }
  } catch (e) {
    console.warn("[SlashMenu] Failed to find slash:", e);
  }

  if (slashPos !== -1) {
    tr.delete(slashPos, slashPos + 1);
  }

  // 2. Resolve target position in the NEW document state
  const mappedPos = tr.mapping.map(pos);
  const $pos = tr.doc.resolve(mappedPos);

  try {
    switch (action) {
      case "insert-table": {
        const table = createTable(schema);
        if (table) {
          tr.replaceWith(mappedPos, mappedPos, table);
        }
        break;
      }
      case "h1":
      case "h2":
      case "h3": {
        const level = parseInt(action.at(1));
        tr.setBlockType(mappedPos, mappedPos, schema.nodes.heading, { level });
        break;
      }
      case "insert-code":
        tr.setBlockType(mappedPos, mappedPos, schema.nodes.code_block);
        break;
      case "insert-mermaid":
        if (schema.nodes.mermaid_block) {
          const node = schema.nodes.mermaid_block.create({
            value: "graph TD\n  A-->B",
          });
          tr.replaceWith(mappedPos, mappedPos, node);
        }
        break;
      case "insert-hr":
        if (schema.nodes.hr) {
          tr.replaceWith(mappedPos, mappedPos, schema.nodes.hr.create());
        }
        break;
      case "blockquote":
      case "bullet-list":
      case "ordered-list":
      case "task-list": {
        // Recalculate block range against the document in the current transaction
        const range = tr.doc.resolve(mappedPos).blockRange();
        if (range) {
          if (action === "blockquote") {
            tr.wrap(range, [{ type: schema.nodes.blockquote }]);
          } else if (action === "bullet-list") {
            tr.wrap(range, [
              { type: schema.nodes.bullet_list },
              { type: schema.nodes.list_item },
            ]);
          } else if (action === "ordered-list") {
            tr.wrap(range, [
              { type: schema.nodes.ordered_list },
              { type: schema.nodes.list_item },
            ]);
          } else if (action === "task-list") {
            tr.wrap(range, [
              { type: schema.nodes.bullet_list },
              { type: schema.nodes.list_item, attrs: { checked: false } },
            ]);
          }
        }
        break;
      }
    }
  } catch (e) {
    console.error("[SlashMenu] Action failed:", action, e);
  }

  if (tr.docChanged) {
    dispatch(tr.scrollIntoView());
  }
  view.focus();
}

function createTable(schema) {
  const tableType = schema.nodes.table;
  // Milkdown's GFM schema splits header and body rows into separate types:
  // `table_header_row` (which only accepts `table_header` cells) and
  // `table_row` (which only accepts `table_cell` cells). The `table` content
  // is `table_header_row table_row+`. Using `table_row` with `table_header`
  // cells (the prosemirror-tables default) produces malformed tables that
  // later trip schema errors on addRow*/addColumn* operations.
  const headerRowType =
    schema.nodes.table_header_row || schema.nodes.table_row;
  const rowType = schema.nodes.table_row;
  const cellType = schema.nodes.table_cell;
  const headerType = schema.nodes.table_header;
  const paraType = schema.nodes.paragraph;

  if (!tableType || !rowType || !cellType || !headerType || !paraType)
    return null;

  const headerRow = headerRowType.create(null, [
    headerType.createAndFill(null, paraType.createAndFill()),
    headerType.createAndFill(null, paraType.createAndFill()),
  ]);
  const bodyRow = rowType.create(null, [
    cellType.createAndFill(null, paraType.createAndFill()),
    cellType.createAndFill(null, paraType.createAndFill()),
  ]);

  return tableType.create(null, [headerRow, bodyRow]);
}
