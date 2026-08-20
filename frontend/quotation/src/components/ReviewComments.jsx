import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MessageSquarePlus, MessageSquare, Check, Trash2, X, Edit2 } from 'lucide-react';
import { getSelectionAnchor, splitTextWithHighlights, locateQuote } from '../utils/textAnchor';
import { refreshRenderedImages } from '../utils/inlineImages';

const styles = {
  mark: {
    backgroundColor: '#fef3c7',
    borderBottom: '2px solid #f59e0b',
    cursor: 'pointer',
  },
  toolbarBtn: {
    position: 'fixed',
    zIndex: 1200,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0.4rem 0.7rem',
    backgroundColor: '#111827',
    color: '#fff',
    borderRadius: 8,
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
  },
  panel: {
    position: 'fixed',
    zIndex: 1200,
    width: 300,
    maxWidth: 'calc(100vw - 24px)',
    maxHeight: 'calc(100vh - 16px)',
    overflowY: 'auto',
    backgroundColor: '#fff',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
    padding: '0.75rem',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  textarea: {
    width: '100%',
    minHeight: 64,
    resize: 'vertical',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    padding: '0.45rem 0.6rem',
    fontSize: '0.82rem',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  actionsRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: '0.5rem',
  },
  primaryBtn: {
    padding: '0.35rem 0.75rem',
    backgroundColor: '#111827',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.76rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  ghostBtn: {
    padding: '0.35rem 0.75rem',
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: '0.76rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  entry: {
    padding: '0.5rem 0',
    borderBottom: '1px solid #f1f5f9',
  },
  entryQuote: {
    fontSize: '0.72rem',
    color: '#92400e',
    backgroundColor: '#fffbeb',
    borderLeft: '3px solid #f59e0b',
    padding: '0.25rem 0.5rem',
    marginBottom: '0.35rem',
    fontStyle: 'italic',
    wordBreak: 'break-word',
  },
  entryComment: {
    fontSize: '0.82rem',
    color: '#1f2937',
    lineHeight: 1.4,
  },
  entryMeta: {
    fontSize: '0.68rem',
    color: '#9ca3af',
    marginTop: '0.25rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  entryActions: {
    display: 'flex',
    gap: 8,
  },
  iconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.68rem',
    fontWeight: 600,
    padding: 0,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '0.15rem 0.55rem',
    borderRadius: 999,
    backgroundColor: '#fef3c7',
    color: '#92400e',
    border: '1px solid #fde68a',
    fontSize: '0.7rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  expandedPanel: {
    marginTop: 6,
    border: '1px solid #fde68a',
    borderRadius: 8,
    padding: '0.5rem 0.65rem',
    backgroundColor: '#fffbeb',
  },
};

// If the current text selection overlaps an already-commented span (a
// <mark data-comment-ids>), surface that existing comment instead of
// letting a new, overlapping/duplicate comment be created on the same
// text — the reviewer should edit or resolve the existing one, not stack
// another comment on top of it.
function findOverlappingMark(container) {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !container) return null;
  const range = sel.getRangeAt(0);
  const marks = container.querySelectorAll('mark[data-comment-ids]');
  for (const mark of marks) {
    if (range.intersectsNode(mark)) return mark;
  }
  return null;
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function CommentEntry({ comment, canManage, onResolve, canDeleteComment, onDelete, onEdit }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.comment);
  // A "pending" comment is staged locally (e.g. during an active reject/
  // return review) and hasn't been saved to the backend yet — Resolve makes
  // no sense for it (there's nothing to resolve server-side), and the person
  // who staged it can always edit/remove it regardless of the normal author
  // check (there's no "author" to check against until it's actually saved).
  const isPending = !!comment.pending;
  const canDelete = isPending ? true : (canDeleteComment ? canDeleteComment(comment) : false);
  // Editing uses the same author-or-admin rule as deleting.
  const canEdit = !!onEdit && (isPending ? true : (canDeleteComment ? canDeleteComment(comment) : false));

  const doResolve = async () => {
    setBusy(true);
    await onResolve?.(comment._id);
    setBusy(false);
  };
  const doDelete = async () => {
    setBusy(true);
    await onDelete?.(comment._id);
    setBusy(false);
  };
  const startEdit = () => {
    setEditText(comment.comment);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditText(comment.comment);
    setEditing(false);
  };
  const saveEdit = async () => {
    if (!editText.trim() || editText.trim() === comment.comment) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const result = await onEdit?.(comment._id, editText.trim());
    setBusy(false);
    if (result?.success !== false) setEditing(false);
  };

  return (
    <div style={styles.entry}>
      <div style={styles.entryQuote}>&ldquo;{comment.quote}&rdquo;</div>
      {editing ? (
        <>
          <textarea
            autoFocus
            style={styles.textarea}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          <div style={styles.actionsRow}>
            <button type="button" style={styles.ghostBtn} onClick={cancelEdit} disabled={busy}>Cancel</button>
            <button
              type="button"
              style={{ ...styles.primaryBtn, opacity: editText.trim() && !busy ? 1 : 0.55 }}
              disabled={!editText.trim() || busy}
              onClick={saveEdit}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      ) : (
        <div style={styles.entryComment}>{comment.comment}</div>
      )}
      {isPending && !editing && (
        <div style={{ fontSize: '0.66rem', color: '#b45309', fontWeight: 600, marginTop: 2 }}>
          Not saved yet — included when you confirm
        </div>
      )}
      {!editing && (
        <div style={styles.entryMeta}>
          <span>
            {comment.createdBySnapshot?.name || 'Reviewer'} &middot; {relativeTime(comment.createdAt)}
            {comment.resolved && <span style={{ color: '#059669', fontWeight: 700 }}> &middot; Resolved</span>}
          </span>
          <span style={styles.entryActions}>
            {canEdit && !comment.resolved && (
              <button type="button" style={{ ...styles.iconBtn, color: '#374151' }} onClick={startEdit} disabled={busy}>
                <Edit2 size={11} /> Edit
              </button>
            )}
            {canManage && !isPending && !comment.resolved && (
              <button type="button" style={{ ...styles.iconBtn, color: '#059669' }} onClick={doResolve} disabled={busy}>
                <Check size={11} /> Resolve
              </button>
            )}
            {canDelete && (
              <button type="button" style={{ ...styles.iconBtn, color: '#dc2626' }} onClick={doDelete} disabled={busy}>
                <Trash2 size={11} /> Delete
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// Positions a floating element relative to a selection/click rect, flipping
// above it when there isn't enough room below (e.g. selection near the
// bottom of the viewport) so its contents — like the Save button — never
// end up pushed off-screen.
function getPanelPosition(rect, { width = 300, height = 220 } = {}) {
  if (typeof window === 'undefined' || !rect) return { top: 0, left: 0 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const left = Math.max(8, Math.min(rect.left, vw - width - 8));

  const spaceBelow = vh - rect.bottom;
  const spaceAbove = rect.top;
  const margin = 8;

  if (spaceBelow >= height + margin || spaceBelow >= spaceAbove) {
    const top = Math.max(margin, Math.min(rect.bottom + margin, vh - height - margin));
    return { top, left };
  }

  const top = Math.max(margin, rect.top - height - margin);
  return { top, left };
}

/**
 * Renders read-only text with existing comment highlights, and (if canAdd)
 * lets the viewer select a substring to attach a new comment to.
 */
export function CommentableText({
  text, targetType, targetKey, comments = [], canAdd, onAdd,
  canManage, onResolve, canDeleteComment, onDelete, onEdit,
  textStyle, as: Tag = 'div', placeholder = null,
}) {
  const containerRef = useRef(null);
  const floatRef = useRef(null);
  const [pendingAnchor, setPendingAnchor] = useState(null); // { quote, prefix, suffix, rect }
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activePopover, setActivePopover] = useState(null); // { commentIds, rect }

  const closeAll = useCallback(() => {
    setPendingAnchor(null);
    setComposerOpen(false);
    setComposerText('');
    setActivePopover(null);
  }, []);

  useEffect(() => {
    if (!canAdd && !activePopover) return undefined;
    const handleMouseDown = (e) => {
      if (floatRef.current && floatRef.current.contains(e.target)) return;
      if (containerRef.current && containerRef.current.contains(e.target)) return;
      closeAll();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [canAdd, activePopover, closeAll]);

  // Listen at the document level, not on the text element itself — a drag
  // selection very often ends with the pointer slightly outside the element
  // it started in (past the last character, over padding, over a neighboring
  // cell), and a mouseup that lands outside the container never bubbles
  // through it, so an element-level onMouseUp silently misses exactly those
  // selections. This is the "sometimes the add-comment button doesn't show
  // up" bug — checking the *selection's* anchor point against the container
  // (rather than where the pointer happened to be released) makes it fire
  // reliably regardless of where the drag ends. touchend covers the same
  // interaction on touch devices (tablets), where there is no mouseup at all.
  useEffect(() => {
    if (!canAdd) return undefined;
    const handleSelectionEnd = (e) => {
      // Own floating "Comment" button / composer panel — let its own
      // onClick handlers (Save, Cancel, the toggle button) run undisturbed.
      if (floatRef.current && floatRef.current.contains(e.target)) return;

      const container = containerRef.current;
      if (!container) return;
      const sel = typeof window !== 'undefined' ? window.getSelection() : null;

      // No selection left (a plain tap elsewhere collapses it) — if a
      // "Comment" trigger or composer from a previous selection was still
      // showing, tapping away without picking new text should dismiss it
      // rather than leaving it stuck on screen.
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        closeAll();
        return;
      }
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        closeAll();
        return;
      }

      const overlappingMark = findOverlappingMark(container);
      if (overlappingMark) {
        setPendingAnchor(null);
        setComposerOpen(false);
        setActivePopover({
          commentIds: overlappingMark.dataset.commentIds.split(','),
          rect: overlappingMark.getBoundingClientRect(),
        });
        return;
      }
      const anchor = getSelectionAnchor(container);
      if (anchor) {
        setActivePopover(null);
        setPendingAnchor(anchor);
        setComposerOpen(false);
      }
    };
    document.addEventListener('mouseup', handleSelectionEnd);
    document.addEventListener('touchend', handleSelectionEnd);
    return () => {
      document.removeEventListener('mouseup', handleSelectionEnd);
      document.removeEventListener('touchend', handleSelectionEnd);
    };
  }, [canAdd, closeAll]);

  // A field with no real value today can still be worth commenting on (e.g.
  // "this should have a value") — rather than hiding the whole interaction
  // whenever the field happens to be empty, fall back to a literal, selectable
  // "N/A" so the exact same select-to-comment flow still works. Only kicks in
  // when there's actually something to do with it (can add, or a comment is
  // already anchored here from before the field was cleared).
  const hasRealText = !!(text && text.trim());
  const displayText = hasRealText ? text : ((canAdd || comments.length > 0) ? 'N/A' : '');

  const segments = useMemo(() => splitTextWithHighlights(displayText, comments), [displayText, comments]);

  const handleMarkClick = (e, commentIds) => {
    e.stopPropagation();
    setPendingAnchor(null);
    setComposerOpen(false);
    setActivePopover({ commentIds, rect: e.target.getBoundingClientRect() });
  };

  const submitComment = async () => {
    if (!composerText.trim() || !pendingAnchor) return;
    setSubmitting(true);
    const result = await onAdd?.({
      targetType,
      targetKey,
      quote: pendingAnchor.quote,
      prefix: pendingAnchor.prefix,
      suffix: pendingAnchor.suffix,
      comment: composerText.trim(),
    });
    setSubmitting(false);
    if (result?.success !== false) {
      closeAll();
      window.getSelection()?.removeAllRanges();
    }
  };

  if (!displayText) {
    return placeholder;
  }

  return (
    <>
      <Tag ref={containerRef} style={textStyle}>
        {segments.map((seg, idx) => (
          seg.commentIds ? (
            <mark key={idx} data-comment-ids={seg.commentIds.join(',')} style={styles.mark} onClick={(e) => handleMarkClick(e, seg.commentIds)}>
              {seg.text}
            </mark>
          ) : (
            <React.Fragment key={idx}>{seg.text}</React.Fragment>
          )
        ))}
      </Tag>

      {pendingAnchor && !composerOpen && (
        <button
          ref={floatRef}
          type="button"
          style={{ ...styles.toolbarBtn, ...getPanelPosition(pendingAnchor.rect, { width: 160, height: 40 }) }}
          onClick={() => setComposerOpen(true)}
        >
          <MessageSquarePlus size={14} /> Comment
        </button>
      )}

      {pendingAnchor && composerOpen && (
        <div
          ref={floatRef}
          style={{ ...styles.panel, ...getPanelPosition(pendingAnchor.rect, { width: 300, height: 300 }) }}
        >
          <div style={styles.panelHeader}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>Add comment</span>
            <button type="button" style={{ ...styles.iconBtn, color: '#9ca3af' }} onClick={closeAll}><X size={14} /></button>
          </div>
          <div style={styles.entryQuote}>&ldquo;{pendingAnchor.quote}&rdquo;</div>
          <textarea
            autoFocus
            style={styles.textarea}
            placeholder="What needs to change here?"
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
          />
          <div style={styles.actionsRow}>
            <button type="button" style={styles.ghostBtn} onClick={closeAll}>Cancel</button>
            <button
              type="button"
              style={{ ...styles.primaryBtn, opacity: composerText.trim() && !submitting ? 1 : 0.55 }}
              disabled={!composerText.trim() || submitting}
              onClick={submitComment}
            >
              {submitting ? 'Saving…' : 'Save comment'}
            </button>
          </div>
        </div>
      )}

      {activePopover && (
        <div
          ref={floatRef}
          style={{
            ...styles.panel,
            ...getPanelPosition(activePopover.rect, {
              width: 300,
              height: Math.min(420, 140 + 90 * activePopover.commentIds.length),
            }),
          }}
        >
          <div style={styles.panelHeader}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>Review comment</span>
            <button type="button" style={{ ...styles.iconBtn, color: '#9ca3af' }} onClick={closeAll}><X size={14} /></button>
          </div>
          {comments.filter(c => activePopover.commentIds.includes(c._id)).map(c => (
            <CommentEntry
              key={c._id}
              comment={c}
              canManage={canManage}
              onResolve={onResolve}
              canDeleteComment={canDeleteComment}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </>
  );
}

// Wraps the DOM text spanning [start, end) of container.textContent in a
// <mark data-comment-ids="..."> — walking real text nodes and splitting them
// with the standard Text.splitText API, so tags can never be corrupted (no
// HTML string slicing). Handles a match that spans more than one text node
// (e.g. a selection crossing a <strong>) by wrapping each intersecting piece
// with the same data-comment-ids.
function wrapRangeInMarks(container, start, end, commentId) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node = walker.nextNode();
  while (node) { textNodes.push(node); node = walker.nextNode(); }

  let cursor = 0;
  for (const textNode of textNodes) {
    const nodeStart = cursor;
    const nodeEnd = cursor + textNode.length;
    cursor = nodeEnd;
    if (nodeEnd <= start || nodeStart >= end) continue;

    const sliceStart = Math.max(start, nodeStart) - nodeStart;
    const sliceEnd = Math.min(end, nodeEnd) - nodeStart;

    let target = textNode;
    if (sliceEnd < target.length) target.splitText(sliceEnd);
    if (sliceStart > 0) target = target.splitText(sliceStart);

    const mark = document.createElement('mark');
    mark.dataset.commentIds = commentId;
    Object.assign(mark.style, styles.mark);
    target.parentNode.insertBefore(mark, target);
    mark.appendChild(target);
  }
}

/**
 * Renders read-only HTML (e.g. rich-text Terms & Conditions content) with the
 * same select-to-comment interaction as CommentableText — existing comments
 * are marked in place (same simple dark-underline style), resolved via real
 * DOM text nodes rather than slicing the HTML string, so tags can't break.
 */
export function CommentableHtml({
  html, targetType, targetKey, comments = [], canAdd, onAdd,
  canManage, onResolve, canDeleteComment, onDelete, onEdit,
  contentStyle, placeholder = null,
}) {
  const mergedContentStyle = { padding: 0, color: '#374151', ...contentStyle };
  const containerRef = useRef(null);
  const floatRef = useRef(null);
  const [pendingAnchor, setPendingAnchor] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activePopover, setActivePopover] = useState(null); // { commentIds, rect }

  const closeAll = useCallback(() => {
    setPendingAnchor(null);
    setComposerOpen(false);
    setComposerText('');
    setActivePopover(null);
  }, []);

  useEffect(() => {
    if (!canAdd && !activePopover) return undefined;
    const handleMouseDown = (e) => {
      if (floatRef.current && floatRef.current.contains(e.target)) return;
      if (containerRef.current && containerRef.current.contains(e.target)) return;
      closeAll();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [canAdd, activePopover, closeAll]);

  // Same empty-value fallback as CommentableText — an empty Terms &
  // Conditions block can still be worth flagging ("this needs content"), so
  // fall back to literal, selectable "N/A" rather than disappearing entirely.
  const hasRealHtml = !!(html && html.trim());
  const displayHtml = hasRealHtml ? html : ((canAdd || comments.length > 0) ? '<p>N/A</p>' : '');

  // Re-derive marks from scratch each time (reset to the plain HTML first)
  // so re-running this for a changed comments array never compounds nested
  // <mark> wrappers from a previous pass.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = displayHtml || '';
    // Any inline image in this HTML (Terms & Conditions — see
    // TermsCondition.jsx) may have a since-expired src; refresh it before
    // the user notices a broken image.
    refreshRenderedImages(container);
    if (!comments.length) return;

    const fullText = container.textContent || '';
    const claimed = []; // [{start,end}] — skip overlapping matches, first comment wins (same rule as splitTextWithHighlights)
    for (const comment of comments) {
      const located = locateQuote(fullText, comment);
      if (!located) continue;
      const overlaps = claimed.some(r => located.start < r.end && located.end > r.start);
      if (overlaps) continue;
      claimed.push(located);
      wrapRangeInMarks(container, located.start, located.end, comment._id);
    }
  }, [displayHtml, comments]);

  // See the matching comment in CommentableText — document-level, not
  // element-level, so a drag-selection that ends outside this element's
  // bounds (very easy to do, and the actual cause of the "add comment"
  // trigger sometimes not showing up) still registers correctly.
  useEffect(() => {
    if (!canAdd) return undefined;
    const handleSelectionEnd = (e) => {
      // Own floating "Comment" button / composer panel — let its own
      // onClick handlers (Save, Cancel, the toggle button) run undisturbed.
      if (floatRef.current && floatRef.current.contains(e.target)) return;

      const container = containerRef.current;
      if (!container) return;
      const sel = typeof window !== 'undefined' ? window.getSelection() : null;

      // No selection left (a plain tap elsewhere collapses it) — if a
      // "Comment" trigger or composer from a previous selection was still
      // showing, tapping away without picking new text should dismiss it
      // rather than leaving it stuck on screen.
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        closeAll();
        return;
      }
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        closeAll();
        return;
      }

      const overlappingMark = findOverlappingMark(container);
      if (overlappingMark) {
        setPendingAnchor(null);
        setComposerOpen(false);
        setActivePopover({
          commentIds: overlappingMark.dataset.commentIds.split(','),
          rect: overlappingMark.getBoundingClientRect(),
        });
        return;
      }
      const anchor = getSelectionAnchor(container);
      if (anchor) {
        setActivePopover(null);
        setPendingAnchor(anchor);
        setComposerOpen(false);
      }
    };
    document.addEventListener('mouseup', handleSelectionEnd);
    document.addEventListener('touchend', handleSelectionEnd);
    return () => {
      document.removeEventListener('mouseup', handleSelectionEnd);
      document.removeEventListener('touchend', handleSelectionEnd);
    };
  }, [canAdd, closeAll]);

  const handleContentClick = useCallback((e) => {
    const mark = e.target.closest?.('mark[data-comment-ids]');
    if (!mark) return;
    e.stopPropagation();
    setPendingAnchor(null);
    setComposerOpen(false);
    setActivePopover({ commentIds: mark.dataset.commentIds.split(','), rect: mark.getBoundingClientRect() });
  }, []);

  const submitComment = async () => {
    if (!composerText.trim() || !pendingAnchor) return;
    setSubmitting(true);
    const result = await onAdd?.({
      targetType,
      targetKey,
      quote: pendingAnchor.quote,
      prefix: pendingAnchor.prefix,
      suffix: pendingAnchor.suffix,
      comment: composerText.trim(),
    });
    setSubmitting(false);
    if (result?.success !== false) {
      closeAll();
      window.getSelection()?.removeAllRanges();
    }
  };

  if (!displayHtml) {
    return placeholder;
  }

  return (
    <>
      <div className="ql-snow">
        <div
          ref={containerRef}
          className="ql-editor"
          style={mergedContentStyle}
          onClick={handleContentClick}
        />
      </div>

      {activePopover && (
        <div
          ref={floatRef}
          style={{
            ...styles.panel,
            ...getPanelPosition(activePopover.rect, {
              width: 300,
              height: Math.min(420, 140 + 90 * activePopover.commentIds.length),
            }),
          }}
        >
          <div style={styles.panelHeader}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>Review comment</span>
            <button type="button" style={{ ...styles.iconBtn, color: '#9ca3af' }} onClick={closeAll}><X size={14} /></button>
          </div>
          {comments.filter(c => activePopover.commentIds.includes(c._id)).map(c => (
            <CommentEntry
              key={c._id}
              comment={c}
              canManage={canManage}
              onResolve={onResolve}
              canDeleteComment={canDeleteComment}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}

      {pendingAnchor && !composerOpen && (
        <button
          ref={floatRef}
          type="button"
          style={{ ...styles.toolbarBtn, ...getPanelPosition(pendingAnchor.rect, { width: 160, height: 40 }) }}
          onClick={() => setComposerOpen(true)}
        >
          <MessageSquarePlus size={14} /> Comment
        </button>
      )}

      {pendingAnchor && composerOpen && (
        <div
          ref={floatRef}
          style={{ ...styles.panel, ...getPanelPosition(pendingAnchor.rect, { width: 300, height: 300 }) }}
        >
          <div style={styles.panelHeader}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>Add comment</span>
            <button type="button" style={{ ...styles.iconBtn, color: '#9ca3af' }} onClick={closeAll}><X size={14} /></button>
          </div>
          <div style={styles.entryQuote}>&ldquo;{pendingAnchor.quote}&rdquo;</div>
          <textarea
            autoFocus
            style={styles.textarea}
            placeholder="What needs to change here?"
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
          />
          <div style={styles.actionsRow}>
            <button type="button" style={styles.ghostBtn} onClick={closeAll}>Cancel</button>
            <button
              type="button"
              style={{ ...styles.primaryBtn, opacity: composerText.trim() && !submitting ? 1 : 0.55 }}
              disabled={!composerText.trim() || submitting}
              onClick={submitComment}
            >
              {submitting ? 'Saving…' : 'Save comment'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Small pill shown in edit mode (where the field is a live input/textarea,
 * so inline highlighting isn't possible). Click expands the comment thread
 * inline, directly under the field — same slot existing field-error text uses.
 */
export function CommentBadge({ comments = [], canManage, onResolve, canDeleteComment, onDelete, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  if (!comments.length) return null;

  const unresolvedCount = comments.filter(c => !c.resolved).length;

  return (
    <div style={{ marginTop: 4 }}>
      <span style={styles.badge} onClick={() => setExpanded(v => !v)}>
        <MessageSquare size={11} />
        {unresolvedCount > 0 ? `${unresolvedCount} unresolved comment${unresolvedCount > 1 ? 's' : ''}` : `${comments.length} comment${comments.length > 1 ? 's' : ''} resolved`}
      </span>
      {expanded && (
        <div style={styles.expandedPanel}>
          {comments.map(c => (
            <CommentEntry
              key={c._id}
              comment={c}
              canManage={canManage}
              onResolve={onResolve}
              canDeleteComment={canDeleteComment}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
