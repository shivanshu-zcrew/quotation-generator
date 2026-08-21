import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Upload, AlertCircle, Trash2 } from "lucide-react";
import ReactQuill, { Quill } from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { CommentableHtml, CommentBadge } from "./ReviewComments";
import { sanitizeTermsHtml, removeEmptyTableRows as stripEmptyTableRows, tidyTermsHtml } from "../utils/sanitizeTermsHtml";
import { uploadTermsImage } from "../utils/imageUpload";
import { convertS3KeyToUrl, convertBatchS3KeysToUrls } from "../hooks/useS3Image";
import { refreshRenderedImages } from "../utils/inlineImages";
import {
  TERMS_TOOLBAR_MODULE,
  TERMS_EDITOR_FORMATS,
  TERMS_CLIPBOARD_MATCHERS,
  TERMS_PICKER_LABEL_CSS,
  TERMS_CONTENT_CSS,
  TERMS_STICKY_TOOLBAR_CSS,
  TERMS_TOOLBAR_THEME_CSS,
  TERMS_TABLE_UI_CSS,
  TERMS_IMAGE_UI_CSS,
  TERMS_HEADING_SIZE_CSS,
  fixEmptyQuillLines,
} from "../utils/richTextConfig";

// The Terms editor's toolbar sticks to the top of the page while scrolling
// (see TERMS_STICKY_TOOLBAR_CSS). Some pages that host this editor (e.g.
// ViewQuotationScreen) have their own sticky page header above it, which
// would otherwise overlap at the same top:0 position. Measure any such
// sticky content once on mount (and on resize) so the toolbar sticks just
// below it instead, without every host page needing to know about /
// configure this editor's internals.
function useStickyToolbarOffset(ref) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const compute = () => {
      const el = ref.current;
      if (!el) return;
      let total = 0;
      document.querySelectorAll('[style*="sticky"]').forEach((node) => {
        if (node === el || el.contains(node) || node.contains(el)) return;
        const style = window.getComputedStyle(node);
        if (style.position !== 'sticky') return;
        const top = parseFloat(style.top);
        if (Number.isNaN(top) || top > 4) return; // only headers pinned at the very top
        if (node.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
          total += node.getBoundingClientRect().height;
        }
      });
      setOffset(total);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [ref]);

  return offset;
}

// Simple Section Structure
export const newSection = () => ({
  id: `sec-${Date.now()}-${Math.random()}`,
  heading: "",
  content: "",
  images: [],
});

// ============================================================
// HTML content helpers
// ============================================================
// Old records stored plain text (with literal "\n" line breaks); new records
// store real HTML produced by the Quill editor below. Both are kept in
// `content` — this heuristic tells them apart wherever `content` is
// consumed (viewer, PDF export, persistence).
const HTML_TAG_RE = /<[a-z][\s\S]*>/i;
export const isHtmlContent = (str) => HTML_TAG_RE.test(str || "");

// Legacy plain text needs each line wrapped in its own <p> before being
// treated as HTML — otherwise browsers/Quill collapse raw newlines to
// spaces. Per-line <p> (rather than one <br>-joined blob, what this used to
// do) matches how modern Quill HTML is already structured, so the same
// hanging-indent CSS (TERMS_CONTENT_CSS) applies to legacy content too, and
// each line wraps under normal whitespace rules instead of staying one
// giant white-space:pre-wrap block (which, right at the point a line fills
// the container, can break a word mid-way instead of carrying it whole to
// the next line). Mirrors formatTermsText's legacy branch in pdfGenerator.js.
const toHtmlContent = (content) => {
  if (!content) return "";
  if (isHtmlContent(content)) return content;
  return content
    .split("\n")
    .map((line) => `<p>${line.trim() === "" ? "<br>" : line}</p>`)
    .join("");
};

// Quill's empty-editor output is "<p><br></p>" — not an empty string, so a
// plain truthiness/`.trim()` check treats it as "has content". Strip tags to
// check for real visible text.
const stripTags = (html) => (html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

// A row someone added (via the table toolbar or +Row) and never filled in —
// every cell blank, no text, no image — is dead weight in the saved/exported
// document: an empty stripe in the PDF and in Zoho/admin views. Deliberately
// only runs here, at the save/export boundary (sectionsToHTML below), not on
// every keystroke in the live editor (extractTableSizing/onChange in
// TermsSectionEditor) — stripping it while still editing would yank a row
// out from under someone the moment they add it and before they've had a
// chance to type into it. Shares its actual empty-row/table logic with
// sanitizeTermsHtml's removeEmptyTableRows (the render-path equivalent of
// this save-path one — see the comment there) rather than duplicating it.
function removeEmptyTableRows(html) {
  if (!html || !html.includes("<table")) return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  stripEmptyTableRows(container);
  return container.innerHTML;
}

// ============================================================
// For PDF Export and for persistence (the payload sent to the backend)
// ============================================================
export const sectionsToHTML = (sections) => {
  const safeSections = Array.isArray(sections) ? sections : [];

  return safeSections.map((sec, idx) => {
    if (!sec) return "";

    const contentHtml = removeEmptyTableRows(toHtmlContent(sec.content));
    const hasContent = stripTags(contentHtml).length > 0;
    const hasHeading = !!sec.heading?.trim();

    if (!hasHeading && !hasContent) return "";

    // The common case (no heading) — persist/export the content directly.
    // Wrapping it in a decorative div here and never unwrapping it on load
    // would nest one more wrapper on every edit/save cycle.
    if (!hasHeading) return contentHtml;

    let html = `<div style="margin-bottom:28px;">`;
    html += `<h4 style="font-weight:700;color:#0f172a;margin-bottom:12px;">${idx + 1}. ${sec.heading}</h4>`;
    if (hasContent) {
      html += `<div style="line-height:1.85;color:#374151;">${contentHtml}</div>`;
    }
    html += `</div>`;
    return html;
  }).join("");
};

export const sectionsToHTMLWithoutImages = sectionsToHTML;

// ============================================================
// htmlToSections - converts the persisted string back into section format
// ============================================================
export const htmlToSections = (rawText = "", existingImages = []) => {
  if (!rawText || typeof rawText !== 'string' || rawText.trim() === "") {
    return [newSection()];
  }

  return [{
    id: `sec-${Date.now()}`,
    heading: "",
    content: toHtmlContent(rawText.trim()),
    images: existingImages || []
  }];
};

// ============================================================
// Table sizing transforms — a table's own width/indent (set by dragging its
// outer left/right edge in TableResizeHandles) can't be stored as a Quill
// format on the <table> tag itself: Quill only supports formats on
// Inline/Block blots, and a table's own blot (TableContainer) is a plain
// Container, same as TableRow. So while a table is being EDITED, the value
// is mirrored onto every cell as data-table-width/data-table-indent (real
// attributes on real formattable TableCell blots — see the tableWidth/
// tableIndent attributors in richTextConfig.js), which is what
// TableResizeHandles reads and writes via quill.formatLine(). These two
// functions move the value between that representation and its natural
// home — style="width:...;margin-left:..." directly on the <table> tag,
// which is what the saved/exported HTML should actually contain, and what
// the PDF/viewer render paths read with no extra code — at the two points
// HTML crosses the Quill boundary: extractTableSizing runs on Quill's own
// output before it's saved (onChange); injectTableSizing runs on saved
// content before Quill loads it (defaultValue).
function extractTableSizing(html) {
  if (!html || !html.includes("<table")) return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("table").forEach((table) => {
    const cells = Array.from(table.querySelectorAll("td[data-table-width], td[data-table-indent]"));
    if (cells.length === 0) return;
    const width = cells[0].getAttribute("data-table-width");
    const indent = cells[0].getAttribute("data-table-indent");
    table.querySelectorAll("td").forEach((cell) => {
      cell.removeAttribute("data-table-width");
      cell.removeAttribute("data-table-indent");
    });
    const styleParts = [];
    if (width) styleParts.push(`width:${width}`);
    if (indent) styleParts.push(`margin-left:${indent}`);
    if (styleParts.length === 0) return;
    const existing = (table.getAttribute("style") || "").trim();
    const prefix = existing ? `${existing}${existing.endsWith(";") ? "" : ";"}` : "";
    table.setAttribute("style", `${prefix}${styleParts.join(";")}`);
  });
  return container.innerHTML;
}

function injectTableSizing(html) {
  if (!html || !html.includes("<table")) return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("table").forEach((table) => {
    const width = table.style.width;
    const indent = table.style.marginLeft;
    if (!width && !indent) return;
    table.querySelectorAll("td").forEach((cell) => {
      if (width) cell.setAttribute("data-table-width", width);
      if (indent) cell.setAttribute("data-table-indent", indent);
    });
  });
  return container.innerHTML;
}

// ============================================================
// Table tools — a small "Insert table" bar (opened from the toolbar's
// table button) and a contextual row/column bar shown while the cursor is
// inside a table. Both are thin UI wrappers around methods the built-in
// Quill table module already exposes and Quill itself already exercises
// (insertTable/insertRow*/insertColumn*/deleteRow/deleteColumn/deleteTable)
// — no table-editing logic is reimplemented here.
// ============================================================
const tableUiButtonStyle = { width: "auto", padding: "6px 12px", fontSize: "0.78rem", fontWeight: 500 };

// Clicking these buttons would otherwise blur the Quill editor (moving the
// browser's native selection onto the button), and the table module's
// insert/delete methods all bail out early when `quill.getSelection()`
// comes back null — so every action here first (a) stops the button click
// from stealing focus at all via onMouseDown, and (b) calls quill.focus()
// defensively, which restores Quill's own last-known selection
// (`savedRange`) if focus was lost anyway (e.g. from typing in the
// row/column count inputs below, which — unlike a plain button — must be
// focusable).
const keepQuillFocused = (e) => e.preventDefault();

function TableInsertBar({ quill, onClose }) {
  const [rows, setRows] = useState("3");
  const [cols, setCols] = useState("3");
  const clamp = (value) => Math.min(10, Math.max(1, parseInt(value, 10) || 1));

  const handleInsert = () => {
    const tableModule = quill.getModule("table");
    if (!tableModule) return;
    quill.focus();
    // Quill's own insertTable (quill/modules/table.js) inserts the table's
    // row content at the cursor's raw index with no regard for where on the
    // current line that is — so clicking "Insert" with the cursor anywhere
    // in the middle of an existing line (not just at its very start) pulls
    // whatever text preceded the cursor on that line into the table's first
    // cell, splitting the line instead of leaving it untouched. Moving the
    // selection to the END of the current line first (right after its own
    // trailing newline) before calling insertTable makes the table always
    // land as a clean new block right after the whole line, regardless of
    // where in that line the cursor actually was — matching how a "insert
    // below this line" action is expected to behave, e.g. in Word/Docs.
    const range = quill.getSelection();
    if (range) {
      const [line] = quill.getLine(range.index);
      if (line) quill.setSelection(line.offset(quill.scroll) + line.length(), 0, "silent");
    }
    tableModule.insertTable(clamp(rows), clamp(cols));
    onClose();
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap",
      padding: "0.6rem 0.75rem", marginTop: "0.5rem",
      background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px",
      fontSize: "0.8rem", color: "#475569",
    }}>
      <span style={{ fontWeight: 600 }}>Insert table</span>
      <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        Rows
        <input
          type="number" min={1} max={10} value={rows}
          onChange={(e) => setRows(e.target.value)}
          style={{ width: "48px", padding: "4px 6px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "0.8rem" }}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        Columns
        <input
          type="number" min={1} max={10} value={cols}
          onChange={(e) => setCols(e.target.value)}
          style={{ width: "48px", padding: "4px 6px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "0.8rem" }}
        />
      </label>
      <button type="button" className="terms-table-popover-btn" style={tableUiButtonStyle}
        onMouseDown={keepQuillFocused} onClick={handleInsert}>
        Insert
      </button>
      <button type="button" className="terms-table-popover-btn" style={tableUiButtonStyle}
        onMouseDown={keepQuillFocused} onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}

function TableContextBar({ quill, onAction }) {
  const tableModule = quill.getModule("table");
  if (!tableModule) return null;

  const run = (fn) => () => {
    quill.focus();
    fn();
    onAction();
  };

  const actions = [
    { label: "+ Row above", onClick: run(() => tableModule.insertRowAbove()) },
    { label: "+ Row below", onClick: run(() => tableModule.insertRowBelow()) },
    { label: "+ Col left", onClick: run(() => tableModule.insertColumnLeft()) },
    { label: "+ Col right", onClick: run(() => tableModule.insertColumnRight()) },
  ];
  const deleteActions = [
    { label: "Row", onClick: run(() => tableModule.deleteRow()) },
    { label: "Column", onClick: run(() => tableModule.deleteColumn()) },
    { label: "Table", onClick: run(() => tableModule.deleteTable()), danger: true },
  ];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap",
      padding: "0.5rem 0.75rem", marginTop: "0.5rem",
      background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px",
      fontSize: "0.75rem", color: "#475569",
    }}>
      <span style={{ fontWeight: 600, marginRight: "0.15rem" }}>Table:</span>
      {actions.map((a) => (
        <button key={a.label} type="button" className="terms-table-context-btn"
          style={{ width: "auto", padding: "5px 10px" }}
          onMouseDown={keepQuillFocused} onClick={a.onClick}>
          {a.label}
        </button>
      ))}
      {deleteActions.map((a) => (
        <button key={a.label} type="button" className={`terms-table-context-btn${a.danger ? " danger" : ""}`}
          style={{ width: "auto", padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: "4px" }}
          title={`Delete ${a.label.toLowerCase()}`}
          onMouseDown={keepQuillFocused} onClick={a.onClick}>
          <Trash2 size={12} />{a.label}
        </button>
      ))}
    </div>
  );
}

const MIN_COLUMN_PERCENT = 5;
const MIN_ROW_HEIGHT_PX = 24;
const MIN_TABLE_WIDTH_PERCENT = 20;

// Draggable column/row border handles overlaid on the active table, shown
// alongside TableContextBar. Resizing writes through Quill's own format
// pipeline (quill.formatLine with the cellWidth/cellHeight formats
// registered in richTextConfig.js) so it's undoable (Ctrl+Z) and persists
// through save/reload like any other formatting — but only once, on
// mouseup: while actually dragging, the live preview is a direct DOM style
// mutation (cheap, and Quill never reconciles mid-drag since no
// text-change fires), not a formatLine call per mouse-move, which would
// otherwise flood undo history with one step per pixel moved.
function TableResizeHandles({ quill, table }) {
  const overlayRef = useRef(null);
  const [layout, setLayout] = useState(null);

  const recompute = useCallback(() => {
    const overlayEl = overlayRef.current;
    const tableEl = table?.domNode;
    if (!overlayEl || !tableEl || !tableEl.isConnected || tableEl.rows.length === 0 || tableEl.rows[0].cells.length === 0) {
      setLayout(null);
      return;
    }
    const overlayRect = overlayEl.getBoundingClientRect();
    const tableRect = tableEl.getBoundingClientRect();
    const top = tableRect.top - overlayRect.top;
    const left = tableRect.left - overlayRect.left;

    const firstRowCells = Array.from(tableEl.rows[0].cells);
    const cols = [];
    let colAcc = left;
    for (let i = 0; i < firstRowCells.length - 1; i += 1) {
      colAcc += firstRowCells[i].getBoundingClientRect().width;
      cols.push({ colIndex: i, x: colAcc });
    }

    const rows = Array.from(tableEl.rows);
    const rowHandles = [];
    let rowAcc = top;
    for (let i = 0; i < rows.length; i += 1) {
      rowAcc += rows[i].getBoundingClientRect().height;
      rowHandles.push({ rowIndex: i, y: rowAcc });
    }

    setLayout({ cols, rows: rowHandles, top, left, width: tableRect.width, height: tableRect.height });
  }, [table]);

  // No direct recompute() call here: ResizeObserver fires its callback once
  // as soon as observe() is called (establishing the initial size), which
  // covers the first measurement too — so every recompute happens inside a
  // subscription callback (ResizeObserver or the resize listener) rather
  // than synchronously in the effect body.
  useEffect(() => {
    const tableEl = table?.domNode;
    if (!tableEl) return undefined;
    const ro = new ResizeObserver(recompute);
    ro.observe(tableEl);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [table, recompute]);

  // Recomputes every column's percentage from its currently-rendered width
  // (reflecting whatever the live-preview drag just set for the two
  // resized columns, and each other column's pre-existing width
  // otherwise) and commits all of them in one pass — not just the two that
  // moved. That keeps the table's widths a complete, self-consistent set
  // that always sums to ~100%, instead of mixing explicit percentages with
  // browser-auto ones (which can lay out inconsistently under
  // table-layout:fixed).
  const commitColumnWidths = (tableWidth) => {
    const firstRow = table.rows()[0];
    if (!firstRow) return;
    const cellBlots = [];
    firstRow.children.forEach((cell) => cellBlots.push(cell));
    cellBlots.forEach((cellBlot, colIdx) => {
      const widthPx = cellBlot.domNode.getBoundingClientRect().width;
      const pct = `${((widthPx / tableWidth) * 100).toFixed(3)}%`;
      table.cells(colIdx).forEach((cell) => {
        if (!cell) return;
        quill.formatLine(cell.offset(quill.scroll), 1, "cellWidth", pct, "user");
      });
    });
    recompute();
  };

  const commitRowHeight = (rowIndex, heightPx) => {
    const row = table.rows()[rowIndex];
    if (!row) return;
    row.children.forEach((cell) => {
      quill.formatLine(cell.offset(quill.scroll), 1, "cellHeight", `${Math.round(heightPx)}px`, "user");
    });
    recompute();
  };

  // Writes the table's own width (and, when the left edge was dragged,
  // indent) to every cell — see the tableWidth/tableIndent attributors in
  // richTextConfig.js and extractTableSizing/injectTableSizing above for
  // why this can't just be a style on the <table> tag directly while
  // Quill owns the document.
  const commitTableSizing = (containerWidth, widthPx, indentPx) => {
    const widthPct = `${((widthPx / containerWidth) * 100).toFixed(3)}%`;
    const indentPct = indentPx != null ? `${((indentPx / containerWidth) * 100).toFixed(3)}%` : null;
    table.rows().forEach((row) => {
      row.children.forEach((cell) => {
        const offset = cell.offset(quill.scroll);
        quill.formatLine(offset, 1, "tableWidth", widthPct, "user");
        if (indentPct != null) quill.formatLine(offset, 1, "tableIndent", indentPct, "user");
      });
    });
    recompute();
  };

  const startColumnDrag = (startEvent, colIndex) => {
    startEvent.preventDefault();
    startEvent.stopPropagation();
    const handleEl = startEvent.currentTarget;
    const tableEl = table.domNode;
    const tableWidth = tableEl.getBoundingClientRect().width;
    const leftCellsDom = table.cells(colIndex).map((c) => c?.domNode).filter(Boolean);
    const rightCellsDom = table.cells(colIndex + 1).map((c) => c?.domNode).filter(Boolean);
    if (leftCellsDom.length === 0 || rightCellsDom.length === 0) return;
    const startLeftWidth = leftCellsDom[0].getBoundingClientRect().width;
    const startRightWidth = rightCellsDom[0].getBoundingClientRect().width;
    const minPx = (MIN_COLUMN_PERCENT / 100) * tableWidth;
    const startClientX = startEvent.clientX;
    handleEl.classList.add("dragging");

    const onMove = (moveEvent) => {
      let dx = moveEvent.clientX - startClientX;
      dx = Math.max(minPx - startLeftWidth, Math.min(startRightWidth - minPx, dx));
      const leftPct = `${(((startLeftWidth + dx) / tableWidth) * 100).toFixed(3)}%`;
      const rightPct = `${(((startRightWidth - dx) / tableWidth) * 100).toFixed(3)}%`;
      leftCellsDom.forEach((el) => { el.style.width = leftPct; });
      rightCellsDom.forEach((el) => { el.style.width = rightPct; });
      recompute();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      handleEl.classList.remove("dragging");
      commitColumnWidths(tableWidth);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // `invert` is for the table's outer top handle: it's the same underlying
  // action as dragging row 0's own bottom handle (both just change row 0's
  // height), but visually the mouse needs to move the opposite way —
  // dragging the top edge *down* should shrink the row, not grow it.
  const startRowDrag = (startEvent, rowIndex, invert = false) => {
    startEvent.preventDefault();
    startEvent.stopPropagation();
    const handleEl = startEvent.currentTarget;
    const rowCellsDom = Array.from(table.domNode.rows[rowIndex]?.cells || []);
    if (rowCellsDom.length === 0) return;
    const startHeight = table.domNode.rows[rowIndex].getBoundingClientRect().height;
    const startClientY = startEvent.clientY;
    handleEl.classList.add("dragging");

    let finalHeight = startHeight;
    const onMove = (moveEvent) => {
      const dy = moveEvent.clientY - startClientY;
      finalHeight = Math.max(MIN_ROW_HEIGHT_PX, startHeight + (invert ? -dy : dy));
      rowCellsDom.forEach((el) => { el.style.height = `${finalHeight}px`; });
      recompute();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      handleEl.classList.remove("dragging");
      commitRowHeight(rowIndex, finalHeight);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Right edge: resizes the table's overall width — every column keeps its
  // existing relative share (columns are already stored as percentages of
  // the table, so this "just works" the moment the table's own width
  // changes; no column-percentage recalculation needed here).
  const startTableWidthDrag = (startEvent) => {
    startEvent.preventDefault();
    startEvent.stopPropagation();
    const handleEl = startEvent.currentTarget;
    const tableEl = table.domNode;
    const containerWidth = overlayRef.current.getBoundingClientRect().width;
    const startWidthPx = tableEl.getBoundingClientRect().width;
    const startIndentPx = parseFloat(getComputedStyle(tableEl).marginLeft) || 0;
    const minWidthPx = (MIN_TABLE_WIDTH_PERCENT / 100) * containerWidth;
    const maxWidthPx = containerWidth - startIndentPx;
    const startClientX = startEvent.clientX;
    handleEl.classList.add("dragging");

    let finalWidthPx = startWidthPx;
    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startClientX;
      finalWidthPx = Math.max(minWidthPx, Math.min(maxWidthPx, startWidthPx + dx));
      tableEl.style.width = `${((finalWidthPx / containerWidth) * 100).toFixed(3)}%`;
      recompute();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      handleEl.classList.remove("dragging");
      commitTableSizing(containerWidth, finalWidthPx, null);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Left edge: indents the table (grows/shrinks margin-left) while shrinking
  // /growing width by the same amount, so the *right* edge stays fixed in
  // place — matches how dragging a shape's left handle behaves elsewhere.
  const startTableIndentDrag = (startEvent) => {
    startEvent.preventDefault();
    startEvent.stopPropagation();
    const handleEl = startEvent.currentTarget;
    const tableEl = table.domNode;
    const containerWidth = overlayRef.current.getBoundingClientRect().width;
    const startWidthPx = tableEl.getBoundingClientRect().width;
    const startIndentPx = parseFloat(getComputedStyle(tableEl).marginLeft) || 0;
    const rightEdgePx = startIndentPx + startWidthPx;
    const minWidthPx = (MIN_TABLE_WIDTH_PERCENT / 100) * containerWidth;
    const maxIndentPx = Math.max(0, rightEdgePx - minWidthPx);
    const startClientX = startEvent.clientX;
    handleEl.classList.add("dragging");

    let finalWidthPx = startWidthPx;
    let finalIndentPx = startIndentPx;
    const onMove = (moveEvent) => {
      let dx = moveEvent.clientX - startClientX;
      dx = Math.max(-startIndentPx, Math.min(maxIndentPx - startIndentPx, dx));
      finalIndentPx = startIndentPx + dx;
      finalWidthPx = rightEdgePx - finalIndentPx;
      tableEl.style.marginLeft = `${((finalIndentPx / containerWidth) * 100).toFixed(3)}%`;
      tableEl.style.width = `${((finalWidthPx / containerWidth) * 100).toFixed(3)}%`;
      recompute();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      handleEl.classList.remove("dragging");
      commitTableSizing(containerWidth, finalWidthPx, finalIndentPx);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div ref={overlayRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {layout && layout.cols.map((c) => (
        <div key={`col-${c.colIndex}`} className="terms-table-col-handle"
          style={{ left: c.x, top: layout.top, height: layout.height, pointerEvents: "auto" }}
          onMouseDown={(e) => startColumnDrag(e, c.colIndex)} />
      ))}
      {layout && layout.rows.map((r) => (
        <div key={`row-${r.rowIndex}`} className="terms-table-row-handle"
          style={{ top: r.y, left: layout.left, width: layout.width, pointerEvents: "auto" }}
          onMouseDown={(e) => startRowDrag(e, r.rowIndex)} />
      ))}
      {layout && (
        <>
          <div className="terms-table-row-handle" title="Resize row 1 from the top"
            style={{ top: layout.top, left: layout.left, width: layout.width, pointerEvents: "auto" }}
            onMouseDown={(e) => startRowDrag(e, 0, true)} />
          <div className="terms-table-col-handle" title="Indent table"
            style={{ left: layout.left, top: layout.top, height: layout.height, pointerEvents: "auto" }}
            onMouseDown={startTableIndentDrag} />
          <div className="terms-table-col-handle" title="Resize table width"
            style={{ left: layout.left + layout.width, top: layout.top, height: layout.height, pointerEvents: "auto" }}
            onMouseDown={startTableWidthDrag} />
        </>
      )}
    </div>
  );
}

// Runs once when the editor mounts. Quill's clipboard parser rebuilds a
// fresh DOM node for every embed on load and only copies attributes it
// explicitly recognizes (alt/height/width for images — see the 'image'
// entry in TERMS_EDITOR_FORMATS in richTextConfig.js), so data-s3-key —
// needed to refresh a since-expired src (see refreshRenderedImages in
// ../utils/inlineImages.js) — doesn't survive being loaded back into the
// editor, even though it survives being *saved* out of it (Quill's
// getSemanticHTML serializes an image's actual live DOM node verbatim, so
// the plain setAttribute in handleInlineImageSelected below already shows
// up in the saved HTML on its own). Recovers it by position-matching the
// freshly-rendered <img> elements against the same tags in the HTML Quill
// was actually given: nothing else in this rich text produces <img> tags
// (the separate image-gallery feature keeps its images in the termsImages
// array, not inline in this HTML), and Quill preserves image order even
// though it drops their attributes, so pairing them up by index is
// reliable — bails out entirely rather than guessing if the counts don't
// match for any reason.
async function reconcileInlineImages(editor, originalHtml) {
  if (!editor || !originalHtml || !originalHtml.includes("<img")) return;
  const scratch = document.createElement("div");
  scratch.innerHTML = originalHtml;
  const sourceImages = Array.from(scratch.querySelectorAll("img"));
  const liveImages = Array.from(editor.root.querySelectorAll("img"));
  if (sourceImages.length === 0 || sourceImages.length !== liveImages.length) return;
  const keys = sourceImages.map((img) => img.getAttribute("data-s3-key"));
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (uniqueKeys.length === 0) return;
  const urls = await convertBatchS3KeysToUrls(uniqueKeys);
  liveImages.forEach((liveImg, i) => {
    const key = keys[i];
    if (!key) return;
    liveImg.setAttribute("data-s3-key", key);
    const url = urls[key];
    if (url) liveImg.setAttribute("src", url);
  });
}

const MIN_IMAGE_WIDTH_PX = 40;
// The PDF's own content area is a fixed 874px container with 10px padding,
// plus the Terms & Conditions section's own 12px padding + 1px border
// around it (all in pdfGenerator.js) — 874 - 2*10 - 2*12 - 2*1 = 828px is
// what an image actually has to fit into there. Capped a bit under that
// (not right at 828) as a margin for anything not accounted for here, so
// a resize that looks fine in the editor can't end up wider than the PDF
// page can actually show it.
const MAX_IMAGE_WIDTH_PX = 800;

// Corner drag handles shown around an inline image while it's selected (a
// plain DOM click on the <img> — see TermsSectionEditor's click handler),
// matching Word's click-an-image-to-resize-it behavior. Same "direct DOM
// mutation for live preview, single commit
// through Quill's format API on mouseup" pattern as TableResizeHandles —
// see that component's comment for why (one undo step per drag, not one
// per pixel moved).
function ImageResizeHandles({ quill, imageEl, onDeleted }) {
  const overlayRef = useRef(null);
  const [rect, setRect] = useState(null);

  // imageEl is a DOM node handed down from TermsSectionEditor's selection
  // state, but it needs to be imperatively mutated here (live drag preview,
  // reading layout) — this project's react-hooks lint config flags direct
  // mutation of anything traced back to a prop (and, separately, flags
  // writing a ref's `.current` outside an effect/handler too), so it's
  // mirrored into a ref via an effect and every read/write below goes
  // through that ref instead of the prop directly, the escape hatch this
  // rule expects for imperative DOM work.
  const imageElRef = useRef(imageEl);
  useEffect(() => {
    imageElRef.current = imageEl;
  }, [imageEl]);

  const recompute = useCallback(() => {
    const overlayEl = overlayRef.current;
    const el = imageElRef.current;
    if (!overlayEl || !el || !el.isConnected) { setRect(null); return; }
    const overlayRect = overlayEl.getBoundingClientRect();
    const imgRect = el.getBoundingClientRect();
    setRect({
      top: imgRect.top - overlayRect.top,
      left: imgRect.left - overlayRect.left,
      width: imgRect.width,
      height: imgRect.height,
    });
  }, []);

  useEffect(() => {
    if (!imageEl) return undefined;
    const ro = new ResizeObserver(recompute);
    ro.observe(imageEl);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [imageEl, recompute]);

  // HTML's width/height attributes on <img> (what Quill's Image blot's own
  // format() writes — quill/formats/image.js) must be bare numbers, not
  // CSS lengths — an attribute value like "300px" fails HTML's "valid
  // non-negative integer" parsing rule and is silently ignored, so the
  // image just wouldn't resize. Re-derives the live blot via Quill.find()
  // rather than trusting a captured index, since the image may have
  // shifted position from other edits between selecting it and finishing
  // a drag.
  const commitSize = (widthPx, heightPx) => {
    const el = imageElRef.current;
    const w = String(Math.round(widthPx));
    const h = String(Math.round(heightPx));
    // Sets the width/height attributes directly first, so the correct size
    // shows the instant this runs rather than waiting on quill.formatText()
    // below. quill.formatText() uses "imgWidth"/"imgHeight", not the more
    // obvious "width"/"height" — those literal names collide with
    // CellWidthStyle/CellHeightStyle (registered in richTextConfig.js for
    // table cells), which target the real CSS width/height properties on a
    // completely different blot; Quill resolves an attribute name globally
    // by that name regardless of which blot it's meant for, so under the
    // literal names an image's width/height silently got routed to the
    // table attributor's handling instead of TrackedImage's own (confirmed
    // directly with an isolated Quill instance, not just reasoned about) —
    // see the long comment on TrackedImage in richTextConfig.js.
    el.style.width = "";
    el.style.height = "";
    el.setAttribute("width", w);
    el.setAttribute("height", h);
    const blot = Quill.find(el);
    if (blot) {
      const index = blot.offset(quill.scroll);
      quill.formatText(index, 1, "imgWidth", w, "user");
      quill.formatText(index, 1, "imgHeight", h, "user");
    }
    recompute();
  };

  // Backspace/Delete already remove a selected image natively (standard
  // Quill/contenteditable embed behavior, no custom code needed) — this
  // button is purely a discoverable, explicit way to do the same thing,
  // matching the delete controls already offered for tables.
  const handleDelete = () => {
    const el = imageElRef.current;
    const blot = Quill.find(el);
    if (!blot) return;
    const index = blot.offset(quill.scroll);
    quill.deleteText(index, 1, "user");
    onDeleted?.();
  };

  const startDrag = (startEvent, corner) => {
    startEvent.preventDefault();
    startEvent.stopPropagation();
    const handleEl = startEvent.currentTarget;
    const el = imageElRef.current;
    const startWidth = el.getBoundingClientRect().width;
    const startHeight = el.getBoundingClientRect().height;
    const aspectRatio = startWidth / startHeight;
    // Left-side handles grow the image when dragged left (negative
    // clientX delta), so their sign is inverted relative to right-side
    // ones — top vs. bottom doesn't need its own axis since height always
    // just follows width via the locked aspect ratio.
    const sign = corner === "tl" || corner === "bl" ? -1 : 1;
    const startClientX = startEvent.clientX;
    handleEl.classList.add("dragging");

    let finalWidth = startWidth;
    let finalHeight = startHeight;
    const onMove = (moveEvent) => {
      const dx = (moveEvent.clientX - startClientX) * sign;
      finalWidth = Math.min(MAX_IMAGE_WIDTH_PX, Math.max(MIN_IMAGE_WIDTH_PX, startWidth + dx));
      finalHeight = finalWidth / aspectRatio;
      el.style.width = `${finalWidth}px`;
      el.style.height = `${finalHeight}px`;
      recompute();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      handleEl.classList.remove("dragging");
      commitSize(finalWidth, finalHeight);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // The overlay div (and its ref) must always render, even before `rect`
  // is known — recompute() above can only ever populate `rect` by reading
  // overlayRef.current, so gating this whole return on `rect` (as an
  // earlier version of this component did) would be a permanent deadlock:
  // the ref never attaches, so recompute() can never find it, so `rect`
  // can never get set in the first place. Only the border/handles inside
  // are conditional. Same fix as TableResizeHandles's identical overlay.
  const corners = rect ? [
    { key: "tl", top: rect.top, left: rect.left, cursor: "nwse-resize" },
    { key: "tr", top: rect.top, left: rect.left + rect.width, cursor: "nesw-resize" },
    { key: "bl", top: rect.top + rect.height, left: rect.left, cursor: "nesw-resize" },
    { key: "br", top: rect.top + rect.height, left: rect.left + rect.width, cursor: "nwse-resize" },
  ] : [];

  return (
    <div ref={overlayRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {rect && (
        <div style={{
          position: "absolute", top: rect.top, left: rect.left, width: rect.width, height: rect.height,
          border: "1.5px solid #2563eb", pointerEvents: "none",
        }} />
      )}
      {corners.map((c) => (
        <div key={c.key} className="terms-image-resize-handle"
          style={{ top: c.top, left: c.left, cursor: c.cursor, pointerEvents: "auto" }}
          onMouseDown={(e) => startDrag(e, c.key)} />
      ))}
      {rect && (
        <button type="button" className="terms-image-delete-btn" title="Delete image"
          style={{ top: rect.top - 11, left: rect.left + rect.width - 11, pointerEvents: "auto" }}
          onMouseDown={keepQuillFocused} onClick={handleDelete}>
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

// Uploads one file through the same S3 pipeline the toolbar's image button
// uses (compression + presigned PUT — see uploadTermsImage) and inserts it
// as a tracked embed at `range`. Shared between the toolbar's explicit file
// picker (handleInlineImageSelected below) and Quill's own built-in
// drag-and-drop / paste-image handling (the `uploader` module wired up in
// TermsSectionEditor's `modules`) — without overriding that module, Quill's
// default uploader handler (quill/modules/uploader.js) reads a dropped or
// pasted image file straight into a base64 data: URI via FileReader and
// embeds it verbatim: no compression, no size cap, no data-s3-key (so a
// later expired-URL refresh has nothing to refresh from — moot for data:
// URIs, which never expire, but it does mean these images silently skip
// this app's whole upload/compression pipeline). A single dropped photo
// straight off a phone can be several MB; base64 grows that by ~33% again,
// landing directly in the saved termsAndConditions string — multiplied
// across a few images, that's a multi-MB quotation document, a much slower
// save/fetch/PDF-export for it, and, in the worst case, a save that fails
// outright against MongoDB's 16MB document limit. Routing drop/paste
// through the exact same path as the toolbar button closes that gap:
// same compression, same size validation, same S3 storage, same tracked
// data-s3-key.
async function uploadImageIntoEditor(quill, range, file, { onUploadingChange, onError } = {}) {
  if (!file.type.startsWith("image/")) {
    onError?.(`"${file.name}" is not an image.`);
    return;
  }
  onError?.("");
  onUploadingChange?.(true);
  try {
    const key = await uploadTermsImage(file);
    // A brand-new quotation doesn't exist in the DB yet, so the signed-URL
    // endpoint's ownership check (canAccessS3Key, quotationController.js)
    // has nothing to find this key on yet and denies it (403) even though
    // the upload itself just succeeded — the same gap
    // handleTermsImagesUpload (QuotationTemplate.jsx, the terms image
    // gallery) already works around with a local object URL. Mirror that
    // here: fall back to a local preview of the file just uploaded, still
    // tagged with its durable data-s3-key, so refreshRenderedImages/
    // reconcileInlineImages swap in the real signed URL themselves the
    // first time this content renders again after the quotation is
    // actually saved (the viewer, a PDF export, or just reopening this
    // editor) — see the comment on data-s3-key in TermsCondition.jsx.
    const url = (await convertS3KeyToUrl(key)) || URL.createObjectURL(file);
    const insertAt = range?.index ?? quill.getLength();
    quill.insertEmbed(insertAt, "image", url, "user");
    // insertEmbed only takes a URL — the durable S3 key is attached as a
    // separate format right after, through Quill's own format API (the
    // TrackedImage blot registered in richTextConfig.js) rather than a raw
    // setAttribute call. It has to go through the format system, not just
    // the DOM: a plain setAttribute is invisible to Quill's own delta
    // model, and confirmed by inspecting a real saved document, Quill's
    // internal update cycle (re-deriving its delta from the DOM after any
    // later format() call, e.g. an ImageResizeHandles resize) silently
    // drops DOM attributes it doesn't track that way, even though the DOM
    // mutation looked identical to a tracked one.
    quill.formatText(insertAt, 1, "data-s3-key", key, "user");
    quill.setSelection(insertAt + 1, 0, "silent");
    quill.focus();
  } catch {
    onError?.("Failed to upload image. Please try again.");
  } finally {
    onUploadingChange?.(false);
  }
}

// One Quill instance + its table UI state per section. Kept as its own
// component (rather than inline in the .map() below) so each section's
// popover/context-bar state, and the ref to its own Quill instance, stay
// independent of every other section.
function TermsSectionEditor({ sec, updateSection }) {
  // Holding the Quill instance in state (set from the ref callback below,
  // which React invokes during commit — not render) rather than reading a
  // ref's `.current` directly in the render body: the latter isn't safe to
  // read while rendering (React may call render more than once per commit)
  // and is flagged by this project's react-hooks lint config.
  const [editor, setEditor] = useState(null);
  const [insertBarOpen, setInsertBarOpen] = useState(false);
  // The table blot the cursor is currently inside, or null — rather than a
  // plain boolean, so TableResizeHandles has the actual table to read
  // rows/cells/DOM from without having to re-derive it.
  const [activeTable, setActiveTable] = useState(null);
  // The <img> DOM node currently selected as a single embed, or null —
  // Word-style "click an image to select it and show resize handles".
  const [selectedImage, setSelectedImage] = useState(null);

  // The `modules` object below is a react-quill-new "dirty prop": if it's
  // not deep-equal to the previous render's value, react-quill-new tears
  // down and fully re-instantiates the underlying Quill editor (losing
  // focus/cursor) — see react-quill-new's shouldComponentRegenerate. A
  // toolbar handler closing directly over setInsertBarOpen would be a new
  // function identity every render (i.e. every keystroke, since typing
  // triggers onChange → state update → re-render), which would trigger
  // that teardown constantly. Routing the call through a ref keeps the
  // function handed to Quill stable, and building `modules` itself via a
  // lazy useState initializer (rather than recreating it inline every
  // render) keeps the whole object referentially stable too.
  const toggleInsertBarRef = useRef(() => setInsertBarOpen((v) => !v));
  // Where the cursor was right before the (native, modal) file picker
  // opened — captured explicitly rather than relying on Quill's own
  // savedRange, since a long-lived native dialog is exactly the kind of
  // focus/blur sequence that's worth not gambling on.
  const pendingImageRangeRef = useRef(null);
  const fileInputRef = useRef(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const [modules] = useState(() => ({
    toolbar: {
      container: TERMS_TOOLBAR_MODULE,
      handlers: {
        table: (...args) => toggleInsertBarRef.current(...args),
        // A plain `function`, not an arrow function: Quill calls toolbar
        // handlers with `this` bound to the Toolbar module instance, which
        // is the officially-supported way to reach the current Quill
        // instance (`this.quill`) here — no React state closure needed, so
        // this can stay part of the same referentially-stable `modules`
        // object (see the comment above toggleInsertBarRef) without the
        // ref-indirection trick that requires.
        image() {
          pendingImageRangeRef.current = this.quill.getSelection();
          fileInputRef.current?.click();
        },
        // Cleans up pasted-content noise (Word/webpage background-color
        // spans, literal "1.1"/"•" characters standing in for real
        // headings/lists) — see tidyTermsHtml (sanitizeTermsHtml.js) for
        // the actual transform. Needs no React state, unlike `table` above,
        // so it doesn't need the toggleInsertBarRef indirection.
        tidy() {
          const quill = this.quill;
          const tidied = tidyTermsHtml(quill.root.innerHTML);
          // Resets the history module's merge-window timer so this always
          // lands as its own dedicated Ctrl+Z step, instead of silently
          // merging into whatever the user typed just before clicking it.
          quill.history.cutoff();
          quill.clipboard.dangerouslyPasteHTML(tidied, "user");
        },
      },
    },
    table: true,
    clipboard: { matchers: TERMS_CLIPBOARD_MATCHERS },
    // Overrides Quill's default uploader handler (base64-embeds a dropped/
    // pasted image directly, no compression or size cap — see the long
    // comment on uploadImageIntoEditor above) so drag-and-drop and
    // paste-an-image-from-the-clipboard both go through the same S3 upload
    // path as the toolbar's image button. setImageUploading/setImageUploadError
    // are plain useState setters — permanently stable identities, so closing
    // over them directly here doesn't reintroduce the "new function identity
    // every render" problem the toggleInsertBarRef indirection above guards
    // against (that problem is specifically about a closure whose *behavior*
    // needs to track a changing value across renders; these setters never
    // change no matter when they're called). `this.quill` is Quill's own
    // uploader-module binding — same pattern the `image()` toolbar handler
    // above already uses.
    uploader: {
      mimetypes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
      handler(range, files) {
        const quill = this.quill;
        files.reduce(
          (chain, file) => chain.then(() => uploadImageIntoEditor(quill, quill.getSelection() || range, file, {
            onUploadingChange: setImageUploading,
            onError: setImageUploadError,
          })),
          Promise.resolve()
        );
      },
    },
  }));

  const refreshInTable = useCallback((quill) => {
    const tableModule = quill?.getModule?.("table");
    const range = quill?.getSelection?.();
    const [tableBlot] = range && tableModule ? tableModule.getTable(range) : [null];
    setActiveTable(tableBlot || null);
  }, []);

  // The "Insert table" bar and the row/column context bar (below) need to
  // stay visible no matter where in a long Terms & Conditions block they're
  // opened from — including right at the very start of the content, before
  // any scrolling has happened. Rendering them as ordinary React children
  // after <ReactQuill> (an earlier version of this did, and a sticky-only
  // fix after that still did) places them, in the DOM, after Quill's entire
  // (possibly very long) content div — so their "resting" position is below
  // all of it, and position:sticky only pins an element once you've
  // scrolled far enough for that resting position to reach the sticky
  // offset. For a long document, that means scrolling almost all the way to
  // the bottom before the bar ever appears — useless right where a table is
  // most often added, at the top.
  //
  // Instead, a portal renders the bar into a plain DOM node inserted
  // directly after Quill's own toolbar and before its content div (`.ql-
  // container`), so the bar's resting position is right under the toolbar,
  // near the top of the document — visible immediately with no scrolling.
  // It's still position:sticky (pinned just under the already-sticky
  // toolbar — TERMS_STICKY_TOOLBAR_CSS) so it also stays visible while
  // scrolled deep into the content, tracking the toolbar wherever it's
  // currently pinned on screen.
  const [tableBarPortal, setTableBarPortal] = useState(null);
  useEffect(() => {
    const toolbarEl = editor?.container?.parentElement?.querySelector(".ql-toolbar");
    if (!toolbarEl) return undefined;
    const portalNode = document.createElement("div");
    portalNode.className = "terms-table-bar-sticky";
    toolbarEl.insertAdjacentElement("afterend", portalNode);
    setTableBarPortal(portalNode);

    // Toolbar height is measured (not hardcoded) because it wraps to more
    // than one row on narrower widths — written straight to the node's
    // style rather than through React state so a toolbar reflow doesn't
    // trigger a re-render of the whole section editor.
    const ro = new ResizeObserver(() => {
      portalNode.style.top = `calc(var(--terms-toolbar-top, 0px) + ${toolbarEl.getBoundingClientRect().height}px)`;
    });
    ro.observe(toolbarEl);

    return () => {
      ro.disconnect();
      portalNode.remove();
      setTableBarPortal(null);
    };
  }, [editor]);

  // Quill's toolbar auto-generates the "tidy" button with no visible label
  // and aria-label="tidy" (the raw format name) — give it a user-facing
  // name/tooltip instead. Runs after the toolbar exists (same lookup the
  // table-bar-portal effect above already uses) rather than trying to set
  // this via the toolbar's own config, which has no hook for a button's
  // title/aria-label.
  useEffect(() => {
    const tidyButton = editor?.container?.parentElement?.querySelector(".ql-toolbar .ql-tidy");
    if (!tidyButton) return;
    tidyButton.title = "Auto align";
    tidyButton.setAttribute("aria-label", "Auto align");
  }, [editor]);

  // Memoized so React attaches this ref exactly once on mount (and detaches
  // once on unmount) instead of on every render — an inline arrow function
  // here would count as "a new ref" each render, causing React to detach
  // and reattach it every time (harmless here since the underlying Quill
  // instance doesn't change, but pointless churn).
  const setEditorRef = useCallback((instance) => {
    setEditor(instance?.getEditor?.() ?? null);
  }, []);

  useEffect(() => {
    if (!editor) return undefined;
    const handleSelectionChange = () => refreshInTable(editor);
    editor.on("selection-change", handleSelectionChange);
    return () => editor.off("selection-change", handleSelectionChange);
  }, [editor, refreshInTable]);

  // Whether a click landed on an image is determined directly from the DOM
  // event target — not from Quill's selection state. A plain click on an
  // <img> inside a contenteditable region doesn't reliably select it as a
  // whole embed across browsers (very often it just drops a collapsed
  // cursor next to it instead), so going through Quill's selection model
  // to figure out "was an image clicked" is exactly the kind of thing that
  // works in some browsers and silently doesn't in others. This sidesteps
  // that ambiguity entirely: any click on an <img> selects it for resizing,
  // any other click within the editor clears the selection, full stop.
  // Quill's selection is only ever consulted later, at resize-commit time
  // (ImageResizeHandles re-derives the live blot via Quill.find()).
  useEffect(() => {
    if (!editor) return undefined;
    const handleClick = (e) => {
      const img = e.target.closest?.("img");
      setSelectedImage(img && editor.root.contains(img) ? img : null);
    };
    editor.root.addEventListener("click", handleClick);
    return () => editor.root.removeEventListener("click", handleClick);
  }, [editor]);

  // A table's own width/indent has nowhere to live as a Quill format (see
  // the comment above extractTableSizing/injectTableSizing) — it only ever
  // reaches the actual <table> DOM node through this direct sync, read back
  // off whichever cell is carrying it. Re-run on every text-change (cheap:
  // skips any table whose DOM already matches) so a table pasted in
  // mid-session — e.g. copied from another quotation's Terms field —
  // picks up its saved size immediately too, not just tables present when
  // the editor first mounted.
  useEffect(() => {
    if (!editor) return undefined;
    const syncTableSizing = () => {
      editor.root.querySelectorAll("table").forEach((table) => {
        const cell = table.querySelector("td[data-table-width], td[data-table-indent]");
        if (!cell) return;
        const width = cell.getAttribute("data-table-width");
        const indent = cell.getAttribute("data-table-indent");
        if (width && table.style.width !== width) table.style.width = width;
        if (indent && table.style.marginLeft !== indent) table.style.marginLeft = indent;
      });
    };
    syncTableSizing();
    editor.on("text-change", syncTableSizing);
    return () => editor.off("text-change", syncTableSizing);
  }, [editor]);

  // Computed once (lazy initializer) rather than inline in JSX: defaultValue
  // is only ever consumed by Quill on the very first mount (uncontrolled
  // component), so recomputing it on every render would be pure waste.
  const [initialContent] = useState(() => injectTableSizing(sec.content || ""));

  // Runs once per mount — a freshly-inserted image (handleInlineImageSelected
  // below) already carries a working src and a correctly-attached
  // data-s3-key, so this is only for images that were already in the
  // document when the editor loaded, whose src may since have expired.
  useEffect(() => {
    if (!editor) return undefined;
    reconcileInlineImages(editor, initialContent);
    return undefined;
  }, [editor, initialContent]);

  const handleInlineImageSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be re-picked later
    if (!file || !editor) return;

    const range = pendingImageRangeRef.current || editor.getSelection() || { index: editor.getLength(), length: 0 };
    // Cleared unconditionally (not just in the success/failure path below)
    // so a rejected non-image pick can't leave a stale captured range behind
    // for the next, unrelated upload to reuse.
    pendingImageRangeRef.current = null;
    await uploadImageIntoEditor(editor, range, file, {
      onUploadingChange: setImageUploading,
      onError: setImageUploadError,
    });
  };

  return (
    <div className="terms-quill-wrapper" style={{ marginBottom: "1rem", position: "relative" }}>
      <style>{TERMS_TABLE_UI_CSS}{TERMS_IMAGE_UI_CSS}{TERMS_HEADING_SIZE_CSS}</style>
      <ReactQuill
        ref={setEditorRef}
        theme="snow"
        defaultValue={initialContent}
        onChange={(html) => updateSection(sec.id, { content: extractTableSizing(fixEmptyQuillLines(html)) })}
        placeholder="Write your terms and conditions here..."
        modules={modules}
        formats={TERMS_EDITOR_FORMATS}
      />
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleInlineImageSelected}
        style={{ display: "none" }}
      />
      {imageUploading && (
        <div style={{ marginTop: "0.4rem", fontSize: "0.78rem", color: "#64748b" }}>
          Uploading image…
        </div>
      )}
      {imageUploadError && (
        <div style={{
          marginTop: "0.4rem", display: "flex", alignItems: "flex-start", gap: "0.4rem",
          fontSize: "0.78rem", color: "#c1352b",
        }}>
          <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{imageUploadError}</span>
        </div>
      )}
      {activeTable && editor && <TableResizeHandles quill={editor} table={activeTable} />}
      {selectedImage && editor && (
        <ImageResizeHandles quill={editor} imageEl={selectedImage} onDeleted={() => setSelectedImage(null)} />
      )}
      {(insertBarOpen || activeTable) && editor && tableBarPortal && createPortal(
        insertBarOpen ? (
          <TableInsertBar quill={editor} onClose={() => setInsertBarOpen(false)} />
        ) : (
          <TableContextBar quill={editor} onAction={() => refreshInTable(editor)} />
        ),
        tableBarPortal
      )}
    </div>
  );
}

// ============================================================
// TermsEditor with Image Upload — S3 direct upload version
// ============================================================
export default function TermsEditor({
  sections = [],
  onChange,
  termsImages = [],
  onTermsImagesUpload,
  onRemoveTermsImage,
  onError, // optional: parent can surface this via its snackbar/toast
  commentProps,
}) {
  const safeSections = Array.isArray(sections) && sections.length > 0 ? sections : [newSection()];

  const rootRef = useRef(null);
  const toolbarOffset = useStickyToolbarOffset(rootRef);

  // Inline error so the component gives feedback even with no parent handler.
  const [uploadError, setUploadError] = useState("");

  const updateSection = (id, patch) => {
    onChange(prev => prev.map(s => s?.id === id ? { ...s, ...patch } : s));
  };

  const raiseError = (msg) => {
    setUploadError(msg);
    if (onError) onError(msg);
  };

  // Only images are allowed. If the user picks any non-image file, reject the
  // whole selection with a clear error rather than silently dropping it.
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // reset so the same file can be re-picked after fixing
    if (files.length === 0) return;

    const nonImages = files.filter(file => !file.type.startsWith("image/"));

    if (nonImages.length > 0) {
      const names = nonImages.map(f => `"${f.name}"`).join(", ");
      raiseError(
        nonImages.length === 1
          ? `${names} is not an image. Only image files (JPG, PNG, GIF, WebP) are allowed.`
          : `${names} are not images. Only image files (JPG, PNG, GIF, WebP) are allowed.`
      );
      return; // reject the entire selection — nothing gets uploaded
    }

    // All good — clear any previous error and hand the valid images to the parent.
    setUploadError("");
    if (onTermsImagesUpload) {
      onTermsImagesUpload(files);
    }
  };

  return (
    <div ref={rootRef} style={{ '--terms-toolbar-top': `${toolbarOffset}px` }}>
      <style>{TERMS_PICKER_LABEL_CSS}{TERMS_TOOLBAR_THEME_CSS}{TERMS_STICKY_TOOLBAR_CSS}</style>
      {safeSections.map((sec) => (
        <div key={sec.id} style={{
          background: "#fff",
          border: "1.5px solid #e2e8f0",
          borderRadius: "12px",
          padding: "1.5rem",
          marginBottom: "1rem"
        }}>
          {/* Rich text editor */}
          {commentProps && <CommentBadge {...commentProps} />}
          <TermsSectionEditor sec={sec} updateSection={updateSection} />

          {/* Add Image Button */}
          <div style={{ marginTop: "1rem" }}>
            <label
              htmlFor="terms-image-upload"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "#f1f5f9",
                color: "#475569",
                padding: "10px 16px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.9rem",
                border: "1px solid #e2e8f0",
                fontWeight: "500"
              }}
            >
              <Upload size={18} />
              Add Image to Terms & Conditions
            </label>
            <input
              type="file"
              id="terms-image-upload"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              style={{ display: "none" }}
            />
          </div>

          {/* Non-image rejection error */}
          {uploadError && (
            <div style={{
              marginTop: "0.75rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem",
              background: "#fdeceb",
              border: "1px solid #f8d6d2",
              borderRadius: "8px",
              padding: "0.6rem 0.8rem",
              fontSize: "0.8rem",
              color: "#c1352b",
              fontWeight: 500
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Preview Uploaded Images */}
          {termsImages && termsImages.length > 0 && (
            <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "12px" }}>
              {termsImages.map((img, index) => (
                <div key={img.id || index} style={{
                  position: "relative",
                  width: "120px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc"
                }}>
                  <img
                    src={img.url || img.base64}
                    alt={img.fileName || "terms"}
                    style={{ width: "100%", height: "80px", objectFit: "cover", display: "block", opacity: img.uploading ? 0.5 : 1 }}
                  />
                  {img.uploading && (
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.65rem",
                      color: "#475569",
                      background: "rgba(255,255,255,0.4)"
                    }}>
                      Uploading…
                    </div>
                  )}
                  <button
                    onClick={() => onRemoveTermsImage && onRemoveTermsImage(img.id)}
                    style={{
                      position: "absolute",
                      top: "4px",
                      right: "4px",
                      background: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: "50%",
                      width: "20px",
                      height: "20px",
                      cursor: "pointer",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    ×
                  </button>
                  {img.fileName && (
                    <div style={{
                      fontSize: "0.6rem",
                      color: "#6b7280",
                      textAlign: "center",
                      padding: "4px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}>
                      {img.fileName.length > 15 ? img.fileName.slice(0, 12) + "..." : img.fileName}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// TermsViewer - displays formatted content and images
// ============================================================
// Wraps the read-only rendering of one section's rich-text content so its
// container can be refreshed after mount — any inline image's src may have
// expired since this HTML was saved (see refreshRenderedImages in
// ../utils/inlineImages.js for why). A separate component (rather than the
// div living straight in TermsViewer's .map()) purely so this can have its
// own ref + effect; React doesn't allow hooks inside a loop body directly.
function TermsViewerContent({ html }) {
  const containerRef = useRef(null);
  useEffect(() => {
    refreshRenderedImages(containerRef.current);
  }, [html]);
  return (
    <div className="ql-snow">
      <div
        ref={containerRef}
        className="ql-editor"
        style={{ padding: 0, color: "#374151" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

export function TermsViewer({ sections = [], termsImages = [], commentProps }) {
  const safeSections = Array.isArray(sections) ? sections : [];

  let allImages = [...termsImages];

  safeSections.forEach(sec => {
    if (sec.images && Array.isArray(sec.images)) {
      sec.images.forEach(img => {
        if (img.url && !allImages.some(existing => existing.url === img.url)) {
          allImages.push(img);
        }
      });
    }
  });

  const hasTextContent = safeSections.some(sec =>
    (sec.heading?.trim()) || stripTags(toHtmlContent(sec.content)).length > 0
  );

  const hasImages = allImages.length > 0;

  if (!hasTextContent && !hasImages) {
    return (
      <div style={{
        padding: "3rem",
        background: "#f8fafc",
        borderRadius: "12px",
        textAlign: "center",
        color: "#94a3b8",
        border: "1px dashed #e2e8f0"
      }}>
        No terms and conditions added.
      </div>
    );
  }

  return (
    <div style={{
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      borderRadius: "12px",
      padding: "2.5rem",
      fontSize: "0.97rem",
      color: "#1f2937"
    }}>
      <style>{TERMS_CONTENT_CSS}</style>
      {safeSections.map((sec, idx) => {
        const contentHtml = toHtmlContent(sec.content);
        const hasContent = stripTags(contentHtml).length > 0;
        return (
          <div key={sec.id} style={{ marginBottom: "2.8rem" }}>
            {sec.heading?.trim() && (
              <h4 style={{
                fontWeight: 700,
                color: "#0f172a",
                marginBottom: "1.25rem",
                fontSize: "1.1rem"
              }}>
                {idx + 1}. {sec.heading}
              </h4>
            )}

            {hasContent && (
              commentProps ? (
                <CommentableHtml
                  {...commentProps}
                  html={sanitizeTermsHtml(contentHtml)}
                />
              ) : (
                <TermsViewerContent html={sanitizeTermsHtml(contentHtml)} />
              )
            )}
          </div>
        );
      })}

      {allImages.length > 0 && (
        <div style={{ marginTop: "2rem", display: "flex", flexWrap: "wrap", gap: "16px" }}>
          {allImages.map((img, idx) => (
            <img
              key={img.id || idx}
              src={img.url || img.base64}
              alt={img.fileName || `terms-${idx}`}
              style={{ maxWidth: "200px", maxHeight: "150px", borderRadius: "8px", border: "1px solid #e2e8f0", objectFit: "contain" }}
              onError={(e) => {
                console.error('Image failed to load:', img.url);
                e.target.style.display = 'none';
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
