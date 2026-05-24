function buildOps(before, after) {
  const a = (before ?? "").split("\n");
  const b = (after ?? "").split("\n");
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) {
      ops.push({ type: "eq", line: a[i] });
      i++;
      j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      ops.push({ type: "ins", line: b[j] });
      j++;
    } else {
      ops.push({ type: "del", line: a[i] });
      i++;
    }
  }
  return ops;
}

export function countDiff(before, after) {
  let added = 0;
  let removed = 0;
  for (const op of buildOps(before, after)) {
    if (op.type === "ins") added++;
    else if (op.type === "del") removed++;
  }
  return { added, removed };
}

export function generateDiff(before, after, contextLines = 3) {
  const ops = buildOps(before, after);
  const changed = new Set(
    ops.map((op, idx) => (op.type !== "eq" ? idx : -1)).filter((x) => x >= 0),
  );
  if (!changed.size) return "(no changes)";

  const visible = new Set();
  for (const idx of changed) {
    for (
      let k = Math.max(0, idx - contextLines);
      k <= Math.min(ops.length - 1, idx + contextLines);
      k++
    ) {
      visible.add(k);
    }
  }

  const lines = [];
  let lastIdx = -1;
  for (const idx of [...visible].sort((a, b) => a - b)) {
    if (lastIdx !== -1 && idx > lastIdx + 1) lines.push("  ···");
    const op = ops[idx];
    lines.push(
      (op.type === "ins" ? "+ " : op.type === "del" ? "- " : "  ") + op.line,
    );
    lastIdx = idx;
  }
  return lines.join("\n");
}
