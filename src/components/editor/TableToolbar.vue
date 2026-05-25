<template>
    <Teleport to="body">
        <div
            v-if="show"
            class="table-toolbar"
            :style="style"
            @mousedown.prevent
        >
            <div class="tb-group" aria-label="Row controls">
                <span class="tb-label">Row</span>
                <button
                    class="tb-btn" @mousedown.prevent
                    @click="exec('addRowBefore')"
                    title="Add row above"
                    aria-label="Add row above"
                >
                    <ChevronUp :size="14" />
                </button>
                <button
                    class="tb-btn" @mousedown.prevent
                    @click="exec('addRowAfter')"
                    title="Add row below"
                    aria-label="Add row below"
                >
                    <ChevronDown :size="14" />
                </button>
                <button
                    class="tb-btn del" @mousedown.prevent
                    @click="exec('deleteRow')"
                    title="Delete row"
                    aria-label="Delete row"
                >
                    <Trash2 :size="14" />
                    <span class="tb-btn-label">Row</span>
                </button>
            </div>
            <div class="tb-divider tb-divider-strong" />
            <div class="tb-group" aria-label="Column controls">
                <span class="tb-label">Col</span>
                <button
                    class="tb-btn" @mousedown.prevent
                    @click="exec('addColBefore')"
                    title="Add column left"
                    aria-label="Add column left"
                >
                    <ChevronLeft :size="14" />
                </button>
                <button
                    class="tb-btn" @mousedown.prevent
                    @click="exec('addColAfter')"
                    title="Add column right"
                    aria-label="Add column right"
                >
                    <ChevronRight :size="14" />
                </button>
                <button
                    class="tb-btn del" @mousedown.prevent
                    @click="exec('deleteCol')"
                    title="Delete column"
                    aria-label="Delete column"
                >
                    <Trash2 :size="14" />
                    <span class="tb-btn-label">Col</span>
                </button>
            </div>
            <div class="tb-divider tb-divider-strong" />
            <div class="tb-group">
                <button
                    class="tb-btn del-table" @mousedown.prevent
                    @click="exec('deleteTable')"
                    title="Delete table"
                    aria-label="Delete table"
                >
                    <Table :size="14" />
                    <span class="btn-text">Delete Table</span>
                </button>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { ref, reactive, watch } from "vue";
import { usePluginViewContext } from "@prosemirror-adapter/vue";
import {
    ChevronUp,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Trash2,
    Table,
} from "lucide-vue-next";
import {
    deleteTable,
    isInTable,
    selectedRect,
} from "@milkdown/prose/tables";

// Milkdown's GFM table schema splits rows into `table_header_row` (only
// `table_header` cells) and `table_row` (only `table_cell` cells), with
// `table` content `table_header_row table_row+`. Raw prosemirror-tables
// commands assume one row type with mixed cells, so they produce
// "Called contentMatchAt on a node with invalid content" errors against
// Milkdown's schema. The helpers below pick the correct cell/row type
// per position and guard the schema-required minimum row/column counts.

function tableTypes(state) {
    return {
        cell: state.schema.nodes.table_cell,
        header: state.schema.nodes.table_header,
        row: state.schema.nodes.table_row,
        headerRow: state.schema.nodes.table_header_row,
    };
}

function cellTypeForRow(rowNode, types) {
    // Match the row's existing cell type so we never put `table_cell`
    // into a `table_header_row` (or vice versa).
    if (rowNode?.type === types.headerRow) return types.header;
    return types.cell;
}

function addRowAt(state, dispatch, side) {
    if (!isInTable(state)) return false;
    if (!dispatch) return true;
    const types = tableTypes(state);
    if (!types.cell || !types.row) return false;
    const rect = selectedRect(state);
    const { map, tableStart, table } = rect;
    const rowIndex = side === "after" ? rect.bottom : rect.top;
    // Never insert at index 0 — schema requires the first row to be a
    // table_header_row, and we're always inserting a body table_row.
    const safeIndex = Math.max(1, rowIndex);
    let rowPos = tableStart;
    for (let i = 0; i < safeIndex; i++) rowPos += table.child(i).nodeSize;
    const cells = [];
    for (let col = 0; col < map.width; col++) {
        const headerCol = table.nodeAt(map.map[col]);
        cells.push(
            types.cell.createAndFill({
                alignment: headerCol?.attrs.alignment,
            }),
        );
    }
    dispatch(state.tr.insert(rowPos, types.row.create(null, cells)));
    return true;
}

function addColumnAt(state, dispatch, side) {
    if (!isInTable(state)) return false;
    if (!dispatch) return true;
    const types = tableTypes(state);
    if (!types.cell || !types.header) return false;
    const rect = selectedRect(state);
    const { map, tableStart, table } = rect;
    const col = side === "after" ? rect.right : rect.left;
    const tr = state.tr;
    // Walk rows bottom-up so positions in earlier rows aren't shifted by
    // insertions in later ones.
    for (let row = map.height - 1; row >= 0; row--) {
        const rowNode = table.child(row);
        const cellType = cellTypeForRow(rowNode, types);
        // Position to insert at within the row: cumulative offsets of
        // existing cells up to `col`.
        let rowStart = tableStart;
        for (let i = 0; i < row; i++) rowStart += table.child(i).nodeSize;
        // Skip past the row's open token, then sum sizes of cells before col.
        let cellPos = rowStart + 1;
        for (let c = 0; c < col && c < rowNode.childCount; c++) {
            cellPos += rowNode.child(c).nodeSize;
        }
        // Borrow alignment from the existing cell at this column in this row
        // (or the previous column if we're inserting at the right edge).
        const refIndex = Math.min(rowNode.childCount - 1, Math.max(0, col === rowNode.childCount ? col - 1 : col));
        const refCell = rowNode.child(refIndex);
        tr.insert(cellPos, cellType.createAndFill({ alignment: refCell.attrs.alignment }));
    }
    dispatch(tr);
    return true;
}

function deleteRowSafe(state, dispatch) {
    if (!isInTable(state)) return false;
    const rect = selectedRect(state);
    const { map, tableStart, table } = rect;
    const types = tableTypes(state);
    const rowIndex = rect.top;

    // Deleting the header row: promote the next body row to header by
    // replacing the header_row with a new table_header_row built from the
    // first body row's cell contents, then deleting that body row.
    if (rowIndex === 0) {
        if (map.height < 2) return false; // nothing to promote
        if (!types.headerRow || !types.header) return false;
        if (!dispatch) return true;
        const headerRow = table.child(0);
        const firstBody = table.child(1);
        const newHeaderCells = [];
        for (let c = 0; c < firstBody.childCount; c++) {
            const src = firstBody.child(c);
            newHeaderCells.push(
                types.header.createAndFill(
                    { alignment: src.attrs.alignment },
                    src.content,
                ),
            );
        }
        const newHeaderRow = types.headerRow.create(null, newHeaderCells);
        const headerStart = tableStart;
        const headerEnd = headerStart + headerRow.nodeSize;
        const bodyEnd = headerEnd + firstBody.nodeSize;
        // Replace header_row with promoted row AND remove the body row.
        const tr = state.tr.replaceWith(headerStart, bodyEnd, newHeaderRow);
        dispatch(tr);
        return true;
    }

    // Deleting a body row: refuse only if it would leave zero body rows.
    const bodyRowCount = map.height - 1;
    if (bodyRowCount <= 1) return false;
    if (!dispatch) return true;
    let rowPos = tableStart;
    for (let i = 0; i < rowIndex; i++) rowPos += table.child(i).nodeSize;
    const rowSize = table.child(rowIndex).nodeSize;
    dispatch(state.tr.delete(rowPos, rowPos + rowSize));
    return true;
}

function deleteColumnSafe(state, dispatch) {
    if (!isInTable(state)) return false;
    const rect = selectedRect(state);
    const { map, table, tableStart } = rect;
    if (map.width <= 1) return false; // would leave empty rows
    const col = rect.left;
    if (!dispatch) return true;
    const tr = state.tr;
    // Delete bottom-up so earlier positions remain valid.
    for (let row = map.height - 1; row >= 0; row--) {
        const rowNode = table.child(row);
        if (col >= rowNode.childCount) continue;
        let rowStart = tableStart;
        for (let i = 0; i < row; i++) rowStart += table.child(i).nodeSize;
        let cellPos = rowStart + 1;
        for (let c = 0; c < col; c++) cellPos += rowNode.child(c).nodeSize;
        const cellSize = rowNode.child(col).nodeSize;
        tr.delete(cellPos, cellPos + cellSize);
    }
    dispatch(tr);
    return true;
}

const { view, prevState } = usePluginViewContext();

watch([view, prevState], () => updateState());

const show = ref(false);
const style = reactive({
    position: "fixed",
    top: "0px",
    left: "0px",
    zIndex: 2000,
});

function updateState() {
    const v = view.value;
    if (!v) return;
    const { state } = v;
    const { selection } = state;
    const { $from } = selection;

    let isInsideTable = false;
    for (let d = $from.depth; d > 0; d--) {
        const t = $from.node(d).type.name;
        if (t === "table_cell" || t === "table_header") {
            isInsideTable = true;
            break;
        }
    }

    if (!isInsideTable || !v.editable) {
        show.value = false;
        return;
    }

    // Find the table node to position the toolbar
    let tablePos = -1;
    for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === "table") {
            tablePos = $from.before(d);
            break;
        }
    }

    if (tablePos === -1) {
        show.value = false;
        return;
    }

    const coords = v.coordsAtPos(tablePos);
    // Anchor toolbar left edge to the table; clamp to viewport so it stays
    // fully visible when the sidebar is collapsed and the table sits near
    // the left edge. Approximate width is ~340px after labels were added.
    const TOOLBAR_WIDTH = 340;
    const MARGIN = 8;
    const desired = coords.left;
    const maxLeft = window.innerWidth - TOOLBAR_WIDTH - MARGIN;
    const left = Math.max(MARGIN, Math.min(desired, maxLeft));
    style.left = `${left}px`;
    style.top = `${coords.top - 40}px`;
    show.value = true;
}

function exec(action) {
    const v = view.value;
    if (!v) return;

    const { state, dispatch } = v;

    try {
        switch (action) {
            case "addRowBefore":
                return addRowAt(state, dispatch, "before");
            case "addRowAfter":
                return addRowAt(state, dispatch, "after");
            case "deleteRow":
                return deleteRowSafe(state, dispatch);
            case "addColBefore":
                return addColumnAt(state, dispatch, "before");
            case "addColAfter":
                return addColumnAt(state, dispatch, "after");
            case "deleteCol":
                return deleteColumnSafe(state, dispatch);
            case "deleteTable":
                return deleteTable(state, dispatch);
        }
    } catch (err) {
        console.warn("[TableToolbar] command failed:", action, err);
    }
}
</script>

<style scoped>
.table-toolbar {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 3px;
    display: flex;
    align-items: center;
    gap: 2px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    user-select: none;
}

.tb-group {
    display: flex;
    align-items: center;
    gap: 1px;
}

.tb-divider {
    width: 1px;
    height: 14px;
    background: var(--border);
    margin: 0 4px;
}

.tb-divider-strong {
    width: 1px;
    height: 22px;
    background: var(--text-secondary);
    opacity: 0.35;
    margin: 0 8px;
}

.tb-label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    opacity: 0.7;
    padding: 0 6px 0 2px;
}

.tb-btn-label {
    font-size: 0.7rem;
    font-weight: 500;
    margin-left: 3px;
}

.tb-btn {
    height: 24px;
    padding: 0 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background 0.1s;
}

.tb-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}
.tb-btn.del:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
}

.del-table {
    color: #ef4444;
    gap: 4px;
    padding: 0 8px;
}
.del-table:hover {
    background: rgba(239, 68, 68, 0.15);
}
.btn-text {
    font-size: 0.7rem;
    font-weight: 500;
}
</style>
