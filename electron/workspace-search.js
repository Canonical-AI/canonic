const fs = require("fs");
const path = require("path");
const git = require("isomorphic-git");

const SKIP_DIRS = new Set([".git", "node_modules", ".canonic", "assets", "dist", "build", ".next", ".cache"]);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegex(glob) {
  if (!glob) return null;
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i += 2;
        if (glob[i] === "/") i++;
      } else {
        re += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      re += "[^/]";
      i++;
    } else if ("/.()+|^$[]{}".includes(c)) {
      re += "\\" + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  return new RegExp("^" + re + "$");
}

function matchesGlob(filePath, glob) {
  if (!glob) return true;
  const patterns = glob.split(",").map((s) => s.trim()).filter(Boolean);
  return patterns.some((p) => {
    const re = globToRegex(p);
    if (!re) return false;
    if (re.test(filePath)) return true;
    const base = path.basename(filePath);
    if (re.test(base)) return true;
    return false;
  });
}

function buildSearchRegex(query, opts) {
  if (!query) return { re: null };
  try {
    let pattern = opts.regex ? query : escapeRegex(query);
    if (opts.word) pattern = `\\b(?:${pattern})\\b`;
    const flags = "g" + (opts.case ? "" : "i");
    return { re: new RegExp(pattern, flags) };
  } catch (e) {
    return { error: `Invalid regex: ${e.message}` };
  }
}

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return /\.(md|markdown|txt|json|js|ts|jsx|tsx|vue|css|html|yaml|yml|toml|sh|py|rb|go|rs|java|c|cpp|h|hpp)$/.test(ext);
}

function walkDir(root, rel = "") {
  const out = [];
  const dir = rel ? path.join(root, rel) : root;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walkDir(root, relPath));
    } else if (entry.isFile() && isTextFile(entry.name)) {
      out.push(relPath);
    }
  }
  return out;
}

function findMatchesInText(text, re) {
  const matches = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineMatches = [];
    for (const m of line.matchAll(re)) {
      if (m[0].length === 0) continue;
      lineMatches.push({
        line: i + 1,
        col: m.index,
        text: line,
        length: m[0].length,
      });
    }
    matches.push(...lineMatches);
  }
  return matches;
}

async function searchWorkspace({ workspacePath, query, opts = {}, include = "", exclude = "", allBranches = false }) {
  if (!query) return { branch: [], other: [] };

  const { re, error } = buildSearchRegex(query, opts);
  if (error) return { branch: [], other: [], error };

  const branchResults = [];
  if (workspacePath && fs.existsSync(workspacePath)) {
    const files = walkDir(workspacePath);
    for (const filePath of files) {
      if (include && !matchesGlob(filePath, include)) continue;
      if (exclude && matchesGlob(filePath, exclude)) continue;
      let content;
      try {
        content = fs.readFileSync(path.join(workspacePath, filePath), "utf-8");
      } catch {
        continue;
      }
      const matches = findMatchesInText(content, re);
      if (matches.length) {
        branchResults.push({ filePath, branch: "current", matches });
      }
    }
  }

  const otherResults = [];
  if (allBranches && workspacePath && fs.existsSync(path.join(workspacePath, ".git"))) {
    try {
      const branches = await git.listBranches({ fs, dir: workspacePath });
      const current = await git.currentBranch({ fs, dir: workspacePath });
      const otherBranches = branches.filter((b) => b !== current).slice(0, 10);
      for (const branch of otherBranches) {
        try {
          const oid = await git.resolveRef({ fs, dir: workspacePath, ref: branch });
          await git.walk({
            fs,
            dir: workspacePath,
            trees: [git.TREE({ ref: oid })],
            map: async (filePath, [entry]) => {
              if (!entry) return;
              if (filePath === ".") return;
              const type = await entry.type();
              if (type !== "blob") return;
              if (!isTextFile(filePath)) return;
              if (include && !matchesGlob(filePath, include)) return;
              if (exclude && matchesGlob(filePath, exclude)) return;
              const blob = await entry.content();
              if (!blob) return;
              const content = Buffer.from(blob).toString("utf-8");
              const matches = findMatchesInText(content, re);
              if (matches.length) {
                otherResults.push({ filePath, branch, matches });
              }
            },
          });
        } catch {
          // skip branch on error
        }
      }
    } catch {
      // git not available; ignore
    }
  }

  return { branch: branchResults, other: otherResults };
}

function applyReplacement({ content, query, replacement, opts = {} }) {
  if (!query) return content;
  const { re } = buildSearchRegex(query, opts);
  if (!re) return content;
  return content.replace(re, replacement);
}

module.exports = { searchWorkspace, applyReplacement, _internal: { globToRegex, matchesGlob, buildSearchRegex } };
