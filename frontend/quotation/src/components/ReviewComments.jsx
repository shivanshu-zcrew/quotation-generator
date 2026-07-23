import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MessageSquarePlus, MessageSquare, Check, Trash2, X } from 'lucide-react';
import { getSelectionAnchor, splitTextWithHighlights } from '../utils/textAnchor';

const styles = {
  mark: {
    backgroundColor: '#fef08a',
    borderBottom: '2px solid #eab308',
    cursor: 'pointer',
    borderRadius: 2,
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
};

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

function CommentEntry({ comment, canManage, onResolve, canDeleteComment, onDelete }) {
  const [busy, setBusy] = useState(false);
  const canDelete = canDeleteComment ? canDeleteComment(comment) : false;

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

  return (
    <div style={styles.entry}>
      <div style={styles.entryQuote}>&ldquo;{comment.quote}&rdquo;</div>
      <div style={styles.entryComment}>{comment.comment}</div>
      <div style={styles.entryMeta}>
        <span>
          {comment.createdBySnapshot?.name || 'Reviewer'} &middot; {relativeTime(comment.createdAt)}
          {comment.resolved && <span style={{ color: '#059669', fontWeight: 700 }}> &middot; Resolved</span>}
        </span>
        <span style={styles.entryActions}>
          {canManage && !comment.resolved && (
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
  canManage, onResolve, canDeleteComment, onDelete,
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

  const handleMouseUp = useCallback(() => {
    if (!canAdd) return;
    const anchor = getSelectionAnchor(containerRef.current);
    if (anchor) {
      setActivePopover(null);
      setPendingAnchor(anchor);
      setComposerOpen(false);
    }
  }, [canAdd]);

  const segments = useMemo(() => splitTextWithHighlights(text || '', comments), [text, comments]);

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

  if (!text || !text.trim()) {
    return placeholder;
  }

  return (
    <>
      <Tag ref={containerRef} style={textStyle} onMouseUp={handleMouseUp}>
        {segments.map((seg, idx) => (
          seg.commentIds ? (
            <mark key={idx} style={styles.mark} onClick={(e) => handleMarkClick(e, seg.commentIds)}>
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
            />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Renders read-only HTML (e.g. rich-text Terms & Conditions content) with the
 * same select-to-comment interaction as CommentableText, but without
 * inline-highlighting existing comments in place — slicing arbitrary HTML by
 * character offset without corrupting tags isn't safe, so existing comments
 * are listed via CommentBadge underneath instead.
 */
export function CommentableHtml({
  html, targetType, targetKey, comments = [], canAdd, onAdd,
  canManage, onResolve, canDeleteComment, onDelete,
  contentStyle, placeholder = null,
}) {
  const mergedContentStyle = { padding: 0, color: '#374151', ...contentStyle };
  const containerRef = useRef(null);
  const floatRef = useRef(null);
  const [pendingAnchor, setPendingAnchor] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const closeAll = useCallback(() => {
    setPendingAnchor(null);
    setComposerOpen(false);
    setComposerText('');
  }, []);

  useEffect(() => {
    if (!canAdd) return undefined;
    const handleMouseDown = (e) => {
      if (floatRef.current && floatRef.current.contains(e.target)) return;
      if (containerRef.current && containerRef.current.contains(e.target)) return;
      closeAll();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [canAdd, closeAll]);

  const handleMouseUp = useCallback(() => {
    if (!canAdd) return;
    const anchor = getSelectionAnchor(containerRef.current);
    if (anchor) {
      setPendingAnchor(anchor);
      setComposerOpen(false);
    }
  }, [canAdd]);

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

  if (!html || !html.trim()) {
    return placeholder;
  }

  return (
    <>
      <div className="ql-snow">
        <div
          ref={containerRef}
          className="ql-editor"
          style={mergedContentStyle}
          onMouseUp={handleMouseUp}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      {comments.length > 0 && (
        <CommentBadge
          comments={comments}
          canManage={canManage}
          onResolve={onResolve}
          canDeleteComment={canDeleteComment}
          onDelete={onDelete}
        />
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
export function CommentBadge({ comments = [], canManage, onResolve, canDeleteComment, onDelete }) {
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
        <div style={{ marginTop: 6, border: '1px solid #fde68a', borderRadius: 8, padding: '0.5rem 0.65rem', backgroundColor: '#fffbeb' }}>
          {comments.map(c => (
            <CommentEntry
              key={c._id}
              comment={c}
              canManage={canManage}
              onResolve={onResolve}
              canDeleteComment={canDeleteComment}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
