// Line-based unified diff, ported from electron/diff.js (keep the two in sync).
// LCS dynamic-programming backtrack producing eq/ins/del ops, used by the MCP
// `get_doc_changes` tool and the `git_commit_diff` command.

pub enum Op {
    Eq(String),
    Ins(String),
    Del(String),
}

fn build_ops(before: &str, after: &str) -> Vec<Op> {
    let a: Vec<&str> = before.split('\n').collect();
    let b: Vec<&str> = after.split('\n').collect();
    let m = a.len();
    let n = b.len();

    // dp[i][j] = length of LCS of a[i..] and b[j..]
    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    for i in (0..m).rev() {
        for j in (0..n).rev() {
            dp[i][j] = if a[i] == b[j] {
                dp[i + 1][j + 1] + 1
            } else {
                dp[i + 1][j].max(dp[i][j + 1])
            };
        }
    }

    let mut ops = Vec::new();
    let (mut i, mut j) = (0usize, 0usize);
    while i < m || j < n {
        if i < m && j < n && a[i] == b[j] {
            ops.push(Op::Eq(a[i].to_string()));
            i += 1;
            j += 1;
        } else if j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j]) {
            ops.push(Op::Ins(b[j].to_string()));
            j += 1;
        } else {
            ops.push(Op::Del(a[i].to_string()));
            i += 1;
        }
    }
    ops
}

pub fn count_diff(before: &str, after: &str) -> (usize, usize) {
    let mut added = 0;
    let mut removed = 0;
    for op in build_ops(before, after) {
        match op {
            Op::Ins(_) => added += 1,
            Op::Del(_) => removed += 1,
            Op::Eq(_) => {}
        }
    }
    (added, removed)
}

pub fn generate_diff(before: &str, after: &str, context_lines: usize) -> String {
    let ops = build_ops(before, after);
    let len = ops.len();

    let changed: std::collections::HashSet<usize> = ops
        .iter()
        .enumerate()
        .filter_map(|(idx, op)| if matches!(op, Op::Eq(_)) { None } else { Some(idx) })
        .collect();
    if changed.is_empty() {
        return "(no changes)".to_string();
    }

    let mut visible = std::collections::BTreeSet::new();
    for &idx in &changed {
        let start = idx.saturating_sub(context_lines);
        let end = (idx + context_lines).min(len.saturating_sub(1));
        for k in start..=end {
            visible.insert(k);
        }
    }

    let mut lines = Vec::new();
    let mut last_idx: i64 = -1;
    for idx in visible {
        if last_idx != -1 && idx as i64 > last_idx + 1 {
            lines.push("  ···".to_string());
        }
        let rendered = match &ops[idx] {
            Op::Ins(l) => format!("+ {}", l),
            Op::Del(l) => format!("- {}", l),
            Op::Eq(l) => format!("  {}", l),
        };
        lines.push(rendered);
        last_idx = idx as i64;
    }
    lines.join("\n")
}
