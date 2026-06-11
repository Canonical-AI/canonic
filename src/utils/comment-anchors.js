// Comment anchor matching.
//
// A comment anchors to the document by storing the exact text it was made
// against (anchor.quotedText). The editor highlights a comment by searching
// for that quoted text in the doc's plain text. When the quoted text can no
// longer be found — because the document was edited since the comment was made
// — the anchor is "stale": there is nothing to highlight, so the UI shows a
// "Text has changed" badge instead of silently dropping the highlight.
//
// `plainText` must be the same block-separated representation the editor
// highlights against: doc.textBetween(0, size, "\n", "\n"). Pass `null` when
// the doc text is not known yet (editor not mounted) so nothing is flagged.

// Mirror the editor's highlight threshold: quotes under 2 chars and resolved
// comments are never highlighted, so they are never "stale".
export function isAnchorStale(plainText, comment) {
  if (!comment || comment.resolved) return false;
  const text = comment.anchor?.quotedText;
  if (!text || text.length < 2) return false;
  if (plainText == null) return false;
  return !plainText.includes(text);
}

// Ids of comments whose anchor text no longer appears in the document.
export function findStaleCommentIds(plainText, comments) {
  if (!Array.isArray(comments)) return [];
  return comments.filter((c) => isAnchorStale(plainText, c)).map((c) => c.id);
}
