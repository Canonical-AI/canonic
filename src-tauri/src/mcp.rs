// Local MCP (Model Context Protocol) server, ported from electron/mcp-server.js +
// the MCP/REST bits of electron/api-server.js.
//
// Agents (Claude Code, Codex, Gemini, OpenCode) connect over HTTP/JSON-RPC to use
// Canonic tools — read/write docs, post comments, inspect git history. The embedded
// PTY launches the agent with CANONIC_MCP_URL pointed at this server, so the agent
// can comment on the user's docs. Bound to 127.0.0.1 on a random port; the port is
// surfaced to the renderer via agent_control_get_mcp_port.

use axum::{
    extract::Query,
    http::{HeaderMap, StatusCode},
    response::{sse::{Event, KeepAlive, Sse}, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use futures_util::stream::{self, Stream, StreamExt};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::Emitter;

// ── Global state ──────────────────────────────────────────────────────────────
struct McpState {
    port: u16,
    #[allow(dead_code)]
    token: String,
}

fn mcp_state() -> &'static OnceLock<McpState> {
    static S: OnceLock<McpState> = OnceLock::new();
    &S
}

pub fn get_port() -> Option<u16> {
    mcp_state().get().map(|s| s.port)
}

#[derive(Clone, Debug, Default)]
struct EditorState {
    focused: Option<String>,
    open: Vec<String>,
    unsaved: std::collections::HashMap<String, String>,
}

// Live editor view, pushed from the renderer (mcp_set_editor_state). Lets agents see
// what the user is actually looking at instead of guessing a path.
fn editor_state() -> &'static Mutex<EditorState> {
    static E: OnceLock<Mutex<EditorState>> = OnceLock::new();
    E.get_or_init(|| Mutex::new(EditorState::default()))
}

pub fn set_editor_state(focused: Option<String>, open: Vec<String>, unsaved: std::collections::HashMap<String, String>) {
    if let Ok(mut g) = editor_state().lock() {
        *g = EditorState { focused, open, unsaved };
    }
}

fn get_editor_state() -> (Option<String>, Vec<String>) {
    editor_state()
        .lock()
        .map(|g| (g.focused.clone(), g.open.clone()))
        .unwrap_or_else(|_| (None, Vec::new()))
}

fn get_unsaved_content(path: &str) -> Option<String> {
    let rel = rel_doc_path(path).ok()?;
    editor_state().lock().ok()?.unsaved.get(&rel).cloned()
}

// ── Path / comment helpers (mirror electron, must match the editor's filename scheme) ──
fn workspace_path() -> Result<String, String> {
    crate::commands::current_workspace_path().ok_or_else(|| "No workspace open".to_string())
}

// Lexically normalize (resolve `.`/`..` without touching the fs) so writes to
// not-yet-existing files are still containment-checked.
fn normalize_lexical(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in p.components() {
        match comp {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn resolve_path(doc_path: &str) -> Result<PathBuf, String> {
    let ws = workspace_path()?;
    let clean = doc_path.trim_start_matches('/');
    let root = Path::new(&ws)
        .canonicalize()
        .map_err(|e| format!("Invalid workspace root: {}", e))?;
    let full = normalize_lexical(&root.join(clean));
    if full == root || full.starts_with(&root) {
        Ok(full)
    } else {
        Err(format!("Path escapes workspace: {}", doc_path))
    }
}

// Workspace-relative, forward-slashed path (validates containment first).
fn rel_doc_path(doc_path: &str) -> Result<String, String> {
    let ws = workspace_path()?;
    let full = resolve_path(doc_path)?;
    let root = Path::new(&ws).canonicalize().map_err(|e| e.to_string())?;
    let rel = full.strip_prefix(&root).map_err(|e| e.to_string())?;
    Ok(rel.to_string_lossy().replace('\\', "/"))
}

fn comments_file_for(rel: &str) -> PathBuf {
    let id = rel.replace(['\\', '/'], "_");
    crate::commands::config_dir_path()
        .join("comments")
        .join(format!("{}.json", id))
}

fn read_comments_for(rel: &str) -> Vec<Value> {
    let f = comments_file_for(rel);
    if !f.exists() {
        return Vec::new();
    }
    std::fs::read_to_string(f)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default()
}

fn write_comment(rel: &str, comment: Value) -> Result<(), String> {
    let f = comments_file_for(rel);
    if let Some(parent) = f.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut existing = read_comments_for(rel);
    existing.push(comment);
    let content = serde_json::to_string_pretty(&existing).map_err(|e| e.to_string())?;
    std::fs::write(f, content).map_err(|e| e.to_string())
}

// ── Standing instructions returned by `initialize` (snapshot of focus/tray) ──
fn build_instructions() -> String {
    let (focused, open) = get_editor_state();
    let mut lines = vec![
        "You are connected to Canonic, the user's local Markdown doc workspace.".to_string(),
        "Use the Canonic tools to act on docs: get_open_docs (what the user is viewing right now), read_doc / write_doc / create_doc, and post_comment / read_comments for inline review.".to_string(),
        "When the user refers to \"this doc\" or gives no path, act on the focused doc. Call get_open_docs to refresh — the focus and open tray change as the user works.".to_string(),
        "When the user says they updated or changed a doc and wants you to act on the edits, call get_doc_changes to fetch the diff (use get_doc_history first if they reference an older revision), then plan and implement from those differences.".to_string(),
    ];
    if let Some(f) = &focused {
        lines.push(format!("Right now the user is focused on: {}", f));
    }
    if !open.is_empty() {
        lines.push(format!("Open in the tray: {}", open.join(", ")));
    }
    lines.join("\n")
}

// ── Tool implementations ──────────────────────────────────────────────────────
// Each returns the tool result object (or {error} for a soft error).

fn tool_read_doc(args: &Value) -> Value {
    let path = args.get("path").and_then(|p| p.as_str()).unwrap_or("");
    match resolve_path(path) {
        Ok(fp) => {
            if !fp.exists() {
                return json!({ "error": format!("Doc not found: {}", path) });
            }
            match std::fs::read_to_string(&fp) {
                Ok(content) => json!({ "content": content }),
                Err(e) => json!({ "error": e.to_string() }),
            }
        }
        Err(e) => json!({ "error": e }),
    }
}

fn tool_write_doc(args: &Value) -> Value {
    let path = args.get("path").and_then(|p| p.as_str()).unwrap_or("");
    let content = args.get("content").and_then(|c| c.as_str()).unwrap_or("");
    match resolve_path(path) {
        Ok(fp) => {
            if let Some(parent) = fp.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    return json!({ "error": e.to_string() });
                }
            }

            // If the user has unsaved changes, save them first then make the changes.
            if let Some(unsaved) = get_unsaved_content(path) {
                if let Err(e) = std::fs::write(&fp, &unsaved) {
                    log::error!("Failed to write unsaved changes for {:?}: {}", fp, e);
                } else {
                    if let Ok(rel) = rel_doc_path(path) {
                        if let Some(app) = crate::commands::app_handle() {
                            use tauri::Emitter;
                            let _ = app.emit("agent:file-saved", json!({ "path": rel }));
                        }
                    }
                }
            }

            match std::fs::write(&fp, content) {
                // Push to any live share viewers, same as files_write.
                Ok(_) => {
                    if let Ok(rel) = rel_doc_path(path) {
                        crate::server::push_update(&rel, content);
                    }
                    json!({ "ok": true })
                }
                Err(e) => json!({ "error": e.to_string() }),
            }
        }
        Err(e) => json!({ "error": e }),
    }
}

fn tool_create_doc(args: &Value) -> Value {
    let path = args.get("path").and_then(|p| p.as_str()).unwrap_or("");
    let content = args.get("content").and_then(|c| c.as_str()).unwrap_or("");
    match resolve_path(path) {
        Ok(fp) => {
            if fp.exists() {
                return json!({ "error": format!("Doc already exists: {}", path) });
            }
            if let Some(parent) = fp.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    return json!({ "error": e.to_string() });
                }
            }
            match std::fs::write(&fp, content) {
                Ok(_) => json!({ "ok": true }),
                Err(e) => json!({ "error": e.to_string() }),
            }
        }
        Err(e) => json!({ "error": e }),
    }
}

fn tool_list_docs(args: &Value) -> Value {
    let ws = match workspace_path() {
        Ok(w) => w,
        Err(e) => return json!({ "error": e }),
    };
    let root = Path::new(&ws);
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        let p = entry.path();
        let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
        if name.starts_with('.') && name != ".canonic" {
            continue;
        }
        if entry.file_type().is_file() && name.ends_with(".md") {
            let rel = p.strip_prefix(root).unwrap_or(p).to_string_lossy().replace('\\', "/");
            files.push(json!({ "path": rel, "name": name }));
        }
    }

    // Optional glob filter (translate ** then * to regex; escape specials first).
    if let Some(glob) = args.get("glob").and_then(|g| g.as_str()) {
        let mut pat = String::new();
        for c in glob.chars() {
            if ".+^${}()|[]\\".contains(c) {
                pat.push('\\');
            }
            pat.push(c);
        }
        let pat = pat.replace("\\*\\*", ".*").replace('*', "[^/]*");
        if let Ok(re) = regex::Regex::new(&format!("(?i)^{}(?:/.*)?$", pat)) {
            files.retain(|f| {
                let path = f.get("path").and_then(|x| x.as_str()).unwrap_or("");
                let name = f.get("name").and_then(|x| x.as_str()).unwrap_or("");
                re.is_match(path) || re.is_match(name)
            });
        }
    }
    json!({ "files": files })
}

fn tool_post_comment(args: &Value) -> Value {
    let path = args.get("path").and_then(|p| p.as_str()).unwrap_or("");
    let text = args.get("text").and_then(|t| t.as_str()).unwrap_or("");
    let anchor = args.get("anchor").cloned().unwrap_or_else(|| json!({}));

    let rel = match rel_doc_path(path) {
        Ok(r) => r,
        Err(e) => return json!({ "error": e }),
    };

    let comment_id = uuid::Uuid::new_v4().to_string();
    let now = chrono_iso8601();
    let comment = json!({
        "id": comment_id,
        "anchor": anchor,
        "text": text,
        "author": "AI Agent",
        "isAgent": true,
        "agentName": "AI Agent",
        "resolved": false,
        "createdAt": now
    });

    if let Err(e) = write_comment(&rel, comment) {
        return json!({ "error": e });
    }

    // Renderer updates the comments panel (store: api.agentSession.onComment → addAgentComment).
    if let Some(app) = crate::commands::app_handle() {
        let _ = app.emit(
            "agent:comment",
            json!({
                "commentId": comment_id,
                "file": rel,
                "anchor": anchor,
                "text": text,
                "agentName": "AI Agent"
            }),
        );
    }

    json!({ "ok": true, "commentId": comment_id })
}

fn tool_read_comments(args: &Value) -> Value {
    let path = args.get("path").and_then(|p| p.as_str()).unwrap_or("");
    let rel = match rel_doc_path(path) {
        Ok(r) => r,
        Err(e) => return json!({ "error": e }),
    };
    let comments: Vec<Value> = read_comments_for(&rel)
        .into_iter()
        .filter(|c| !c.get("resolved").and_then(|r| r.as_bool()).unwrap_or(false))
        .collect();
    json!({ "comments": comments })
}

fn tool_get_doc_history(args: &Value) -> Value {
    let path = args.get("path").and_then(|p| p.as_str()).unwrap_or("");
    let ws = match workspace_path() {
        Ok(w) => w,
        Err(e) => return json!({ "error": e }),
    };
    let rel = match rel_doc_path(path) {
        Ok(r) => r,
        Err(e) => return json!({ "error": e }),
    };
    let commits = crate::commands::git_log(ws, rel.clone()).unwrap_or_default();
    let revisions: Vec<Value> = commits
        .iter()
        .map(|c| {
            let oid = c.get("oid").and_then(|o| o.as_str()).unwrap_or("");
            json!({
                "oid": oid,
                "shortOid": &oid[..oid.len().min(8)],
                "message": c.get("message").cloned().unwrap_or(json!("")),
                "author": c.get("author").cloned().unwrap_or(json!("")),
                "date": iso_from_millis(c.get("timestamp").and_then(|t| t.as_i64()).unwrap_or(0))
            })
        })
        .collect();
    json!({ "path": rel, "revisions": revisions })
}

fn tool_get_doc_changes(args: &Value) -> Value {
    let path = args.get("path").and_then(|p| p.as_str()).unwrap_or("");
    let since = args.get("since").and_then(|s| s.as_str()).map(|s| s.to_string());
    let ws = match workspace_path() {
        Ok(w) => w,
        Err(e) => return json!({ "error": e }),
    };
    let rel = match rel_doc_path(path) {
        Ok(r) => r,
        Err(e) => return json!({ "error": e }),
    };
    let full = match resolve_path(path) {
        Ok(f) => f,
        Err(e) => return json!({ "error": e }),
    };
    if !full.exists() {
        return json!({ "error": format!("Doc not found: {}", path) });
    }
    let current = std::fs::read_to_string(&full).unwrap_or_default();
    let commits = crate::commands::git_log(ws.clone(), rel.clone()).unwrap_or_default();

    let (before, after, compared_against): (String, String, String);
    if let Some(since_oid) = since {
        before = crate::commands::git_read_commit_internal(&ws, &rel, &since_oid).unwrap_or_default();
        after = current.clone();
        compared_against = format!("revision {}", &since_oid[..since_oid.len().min(8)]);
    } else if let Some(head) = commits.first() {
        let head_oid = head.get("oid").and_then(|o| o.as_str()).unwrap_or("").to_string();
        let head_content =
            crate::commands::git_read_commit_internal(&ws, &rel, &head_oid).unwrap_or_default();
        if head_content != current {
            before = head_content;
            after = current.clone();
            compared_against = format!("last commit {} (uncommitted edits)", &head_oid[..head_oid.len().min(8)]);
        } else {
            let (b, a) = crate::commands::commit_diff_internal(&ws, &rel, &head_oid);
            before = b;
            after = a;
            compared_against = format!("commit {} vs its parent", &head_oid[..head_oid.len().min(8)]);
        }
    } else {
        before = String::new();
        after = current.clone();
        compared_against = "no prior revision (entire document is new)".to_string();
    }

    let (added, removed) = crate::diff::count_diff(&before, &after);
    json!({
        "path": rel,
        "comparedAgainst": compared_against,
        "hasChanges": added + removed > 0,
        "added": added,
        "removed": removed,
        "diff": crate::diff::generate_diff(&before, &after, 3)
    })
}

fn tool_start_session(args: &Value) -> Value {
    let path = args.get("path").and_then(|p| p.as_str()).unwrap_or("");
    let prompt = args.get("prompt").cloned().unwrap_or(Value::Null);
    let session_id = uuid::Uuid::new_v4().to_string();
    if let Some(app) = crate::commands::app_handle() {
        let _ = app.emit(
            "agent:session-start",
            json!({
                "sessionId": session_id,
                "file": path,
                "agentName": "MCP Agent",
                "workspacePath": crate::commands::current_workspace_path(),
                "prompt": prompt
            }),
        );
    }
    json!({ "ok": true, "sessionId": session_id })
}

fn current_branch(ws: &str) -> String {
    git2::Repository::open(ws)
        .ok()
        .and_then(|repo| {
            repo.head().ok().and_then(|h| h.shorthand().map(|s| s.to_string()))
        })
        .unwrap_or_else(|| "main".to_string())
}

fn tool_get_workspace_info(_args: &Value) -> Value {
    let ws = crate::commands::current_workspace_path();
    let (focused, open) = get_editor_state();
    let name = ws
        .as_ref()
        .and_then(|w| Path::new(w).file_name().map(|n| n.to_string_lossy().to_string()));
    let branch = ws.as_ref().map(|w| current_branch(w)).unwrap_or_else(|| "main".to_string());
    json!({
        "name": name,
        "path": ws,
        "branch": branch,
        "focusedDoc": focused,
        "openDocs": open
    })
}

fn tool_get_open_docs(_args: &Value) -> Value {
    let (focused, open) = get_editor_state();
    json!({ "focusedDoc": focused, "openDocs": open })
}

fn dispatch_tool(name: &str, args: &Value) -> Value {
    match name {
        "read_doc" => tool_read_doc(args),
        "write_doc" => tool_write_doc(args),
        "create_doc" => tool_create_doc(args),
        "list_docs" => tool_list_docs(args),
        "post_comment" => tool_post_comment(args),
        "read_comments" => tool_read_comments(args),
        "get_doc_history" => tool_get_doc_history(args),
        "get_doc_changes" => tool_get_doc_changes(args),
        "start_session" => tool_start_session(args),
        "get_workspace_info" => tool_get_workspace_info(args),
        "get_open_docs" => tool_get_open_docs(args),
        _ => json!({ "error": format!("Tool not found: {}", name) }),
    }
}

fn tool_descriptors() -> Vec<Value> {
    let s = |t: &str| json!({ "type": "string", "description": t });
    vec![
        json!({ "name": "read_doc", "description": "Return markdown content of a workspace doc", "inputSchema": { "type": "object", "properties": { "path": s("Relative path to the doc within the workspace") }, "required": ["path"] } }),
        json!({ "name": "write_doc", "description": "Overwrite a doc; triggers file watcher so editor repaints live", "inputSchema": { "type": "object", "properties": { "path": s("Relative path to the doc"), "content": s("New markdown content") }, "required": ["path", "content"] } }),
        json!({ "name": "create_doc", "description": "Create a new doc at path", "inputSchema": { "type": "object", "properties": { "path": s("Relative path for the new doc"), "content": s("Initial markdown content (optional)") }, "required": ["path"] } }),
        json!({ "name": "list_docs", "description": "Tree of workspace docs (filtered by optional glob)", "inputSchema": { "type": "object", "properties": { "glob": s("Optional glob pattern to filter (e.g. \"Specs/**\")") } } }),
        json!({ "name": "post_comment", "description": "Leave a comment on a doc, optionally anchored to a quoted passage", "inputSchema": { "type": "object", "properties": { "path": s("Relative path to the doc"), "text": s("Comment body text"), "anchor": { "type": "object", "properties": { "quotedText": s("Exact passage to anchor the comment to") } } }, "required": ["path", "text"] } }),
        json!({ "name": "read_comments", "description": "Return open comments for a doc", "inputSchema": { "type": "object", "properties": { "path": s("Relative path to the doc") }, "required": ["path"] } }),
        json!({ "name": "get_doc_history", "description": "List the commit revisions for a doc (newest first), each with its oid, message, author and date.", "inputSchema": { "type": "object", "properties": { "path": s("Relative path to the doc") }, "required": ["path"] } }),
        json!({ "name": "get_doc_changes", "description": "Review what changed in a doc as a unified diff. Compares the current version on disk against the last committed revision by default; pass `since` (an oid from get_doc_history) to compare against an older revision.", "inputSchema": { "type": "object", "properties": { "path": s("Relative path to the doc"), "since": s("Optional commit oid to compare against") }, "required": ["path"] } }),
        json!({ "name": "start_session", "description": "Open a doc in Canonic and show agent-waiting pill", "inputSchema": { "type": "object", "properties": { "path": s("Relative path to open"), "prompt": s("Optional prompt shown to the user") }, "required": ["path"] } }),
        json!({ "name": "get_workspace_info", "description": "Workspace name, path, current branch, the focused doc, and all open docs", "inputSchema": { "type": "object", "properties": {} } }),
        json!({ "name": "get_open_docs", "description": "What the user is looking at right now: the focused doc and the open tray.", "inputSchema": { "type": "object", "properties": {} } }),
    ]
}

// ── Origin gate (port of mcp-server.js hasForeignOrigin) ──────────────────────
// Agents/curl send no Origin and pass. A non-localhost Origin is a web page reaching
// in and is rejected.
fn has_foreign_origin(headers: &HeaderMap) -> bool {
    let o = match headers.get("origin").and_then(|v| v.to_str().ok()) {
        Some(o) => o,
        None => return false,
    };
    let after = o.split("://").nth(1).unwrap_or(o);
    let host = after.split(['/', ':']).next().unwrap_or("");
    host != "localhost" && host != "127.0.0.1"
}

// ── JSON-RPC handler ──────────────────────────────────────────────────────────
fn rpc_error(id: &Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}
fn rpc_result(id: &Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

async fn handle_mcp(headers: HeaderMap, body: String) -> Response {
    if has_foreign_origin(&headers) {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "forbidden" }))).into_response();
    }
    let parsed: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(rpc_error(&Value::Null, -32700, "Parse error"))).into_response(),
    };
    let id = parsed.get("id").cloned().unwrap_or(Value::Null);
    let method = parsed.get("method").and_then(|m| m.as_str()).unwrap_or("");
    let params = parsed.get("params").cloned().unwrap_or(json!({}));

    match method {
        "initialize" => Json(rpc_result(&id, json!({
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "Canonic", "version": "1.0.0" },
            "instructions": build_instructions()
        }))).into_response(),
        "tools/list" => Json(rpc_result(&id, json!({ "tools": tool_descriptors() }))).into_response(),
        "tools/call" => {
            let name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or(json!({}));
            let result = dispatch_tool(name, &args);
            let content = if let Some(err) = result.get("error").and_then(|e| e.as_str()) {
                json!({ "content": [{ "type": "text", "text": format!("Error: {}", err) }], "isError": true })
            } else {
                json!({ "content": [{ "type": "text", "text": serde_json::to_string_pretty(&result).unwrap_or_default() }] })
            };
            Json(rpc_result(&id, content)).into_response()
        }
        "notifications/initialized" => StatusCode::ACCEPTED.into_response(),
        "ping" => Json(json!({ "ok": true })).into_response(),
        _ => Json(rpc_error(&id, -32601, &format!("Method not found: {}", method))).into_response(),
    }
}

// ── SSE endpoint (minimal; Claude/Gemini use streamable-HTTP /mcp) ─────────────
async fn handle_sse() -> Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>> {
    let connected = stream::once(async {
        Ok::<Event, std::convert::Infallible>(Event::default().event("connected").data("{}"))
    });
    let s = connected.chain(stream::pending::<Result<Event, std::convert::Infallible>>());
    Sse::new(s).keep_alive(KeepAlive::default())
}

async fn handle_health() -> impl IntoResponse {
    Json(json!({ "ok": true, "mcp": true }))
}

// ── REST mirror for curl agents (Pi) ──────────────────────────────────────────
#[derive(serde::Deserialize)]
struct PathQuery {
    path: Option<String>,
}

#[derive(serde::Deserialize)]
struct DocPost {
    path: String,
    content: String,
}

#[derive(serde::Deserialize)]
struct CommentPost {
    path: Option<String>,
    text: String,
    #[serde(default)]
    anchor: Value,
}

async fn rest_workspace(headers: HeaderMap) -> Response {
    if has_foreign_origin(&headers) {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "forbidden" }))).into_response();
    }
    let mut info = tool_get_workspace_info(&json!({}));
    let files = tool_list_docs(&json!({}));
    if let Some(obj) = info.as_object_mut() {
        obj.insert("files".into(), files.get("files").cloned().unwrap_or(json!([])));
    }
    Json(info).into_response()
}

fn focused_or(path: Option<String>) -> Option<String> {
    path.filter(|p| !p.is_empty()).or_else(|| get_editor_state().0)
}

async fn rest_doc_get(headers: HeaderMap, Query(q): Query<PathQuery>) -> Response {
    if has_foreign_origin(&headers) {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "forbidden" }))).into_response();
    }
    let path = match focused_or(q.path) {
        Some(p) => p,
        None => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "no doc focused" }))).into_response(),
    };
    let result = tool_read_doc(&json!({ "path": path.clone() }));
    if let Some(err) = result.get("error") {
        return (StatusCode::NOT_FOUND, Json(json!({ "error": err }))).into_response();
    }
    Json(json!({ "path": path, "content": result.get("content").cloned().unwrap_or(json!("")) })).into_response()
}

async fn rest_doc_post(headers: HeaderMap, Json(body): Json<DocPost>) -> Response {
    if has_foreign_origin(&headers) {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "forbidden" }))).into_response();
    }
    Json(tool_write_doc(&json!({ "path": body.path, "content": body.content }))).into_response()
}

async fn rest_comment_get(headers: HeaderMap, Query(q): Query<PathQuery>) -> Response {
    if has_foreign_origin(&headers) {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "forbidden" }))).into_response();
    }
    let path = match focused_or(q.path) {
        Some(p) => p,
        None => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "no doc focused" }))).into_response(),
    };
    Json(tool_read_comments(&json!({ "path": path }))).into_response()
}

async fn rest_comment_post(headers: HeaderMap, Json(body): Json<CommentPost>) -> Response {
    if has_foreign_origin(&headers) {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "forbidden" }))).into_response();
    }
    let path = match focused_or(body.path) {
        Some(p) => p,
        None => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "no doc focused" }))).into_response(),
    };
    Json(tool_post_comment(&json!({ "path": path, "text": body.text, "anchor": body.anchor }))).into_response()
}

// ── Server startup ────────────────────────────────────────────────────────────
fn lockfile_path() -> PathBuf {
    crate::commands::config_dir_path().join("api.lock")
}

fn write_lockfile(port: u16, token: &str) {
    let p = lockfile_path();
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&p, json!({ "port": port, "token": token }).to_string());
}

pub fn start_mcp_server(_app: tauri::AppHandle) {
    let token = uuid::Uuid::new_v4().to_string();
    std::thread::spawn(move || {
        let rt = match tokio::runtime::Runtime::new() {
            Ok(r) => r,
            Err(_) => return,
        };
        rt.block_on(async move {
            let router = Router::new()
                .route("/health", get(handle_health))
                .route("/mcp", post(handle_mcp))
                .route("/sse", get(handle_sse))
                .route("/mcp/sse", get(handle_sse))
                .route("/workspace", get(rest_workspace))
                .route("/doc", get(rest_doc_get).post(rest_doc_post))
                .route("/comment", get(rest_comment_get).post(rest_comment_post));

            let listener = match tokio::net::TcpListener::bind(("127.0.0.1", 0u16)).await {
                Ok(l) => l,
                Err(_) => return,
            };
            let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
            let _ = mcp_state().set(McpState { port, token: token.clone() });
            write_lockfile(port, &token);
            // Re-point any agent configs already registered (the port rotates each launch).
            crate::commands::sync_all_mcp_configs(port);

            let _ = axum::serve(listener, router).await;
        });
    });
}

// ── small date helpers (avoid pulling a date crate) ───────────────────────────
fn iso_from_millis(ms: i64) -> String {
    epoch_to_iso(ms / 1000)
}

pub fn chrono_iso8601() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    epoch_to_iso(secs)
}

// Convert unix seconds → UTC ISO-8601 without external crates.
fn epoch_to_iso(secs: i64) -> String {
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // Civil-from-days (Howard Hinnant's algorithm).
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000Z", year, month, d, h, m, s)
}
