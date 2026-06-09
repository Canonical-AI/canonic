use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{Html, IntoResponse},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use futures_util::{sink::SinkExt, stream::StreamExt};

// Active share structure
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WorkspaceConfig {
    pub name: String,
    pub path: String,
}

pub struct ActiveShare {
    pub key: String, // filePath or workspacePath
    pub port: u16,
    pub token: String,
    pub local_url: String,
    pub permission: String,
    pub scope: String, // "file" | "directory" | "workspace" | "all-workspaces"
    pub workspaces: Vec<WorkspaceConfig>,
    pub excluded_paths: Vec<String>,
    pub tagged_only: bool,
    pub reads: std::sync::atomic::AtomicU64,
    pub shutdown_tx: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

pub fn active_shares() -> &'static std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, std::sync::Arc<ActiveShare>>>> {
    static SHARES: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, std::sync::Arc<ActiveShare>>>> = std::sync::OnceLock::new();
    &SHARES
}

fn get_active_shares() -> Result<std::sync::MutexGuard<'static, std::collections::HashMap<String, std::sync::Arc<ActiveShare>>>, String> {
    let cell = active_shares();
    let lock = cell.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    lock.lock().map_err(|e| e.to_string())
}

// Websocket connection manager
type WsClients = Arc<Mutex<HashMap<String, Vec<tokio::sync::mpsc::UnboundedSender<Message>>>>>;
fn ws_clients() -> &'static WsClients {
    static CLIENTS: OnceLock<WsClients> = OnceLock::new();
    CLIENTS.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn get_ws_clients() -> WsClients {
    ws_clients().clone()
}

// Helper to get LAN IP
pub fn get_lan_ip() -> String {
    if let Ok(addrs) = if_addrs::get_if_addrs() {
        for addr in addrs {
            if !addr.is_loopback() && addr.ip().is_ipv4() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

// CSP for the served share pages. They are static formatted markdown — no script of
// our own — so we forbid all script execution outright (defense in depth on top of the
// ammonia sanitize). Inline <style> in the page template needs style-src 'unsafe-inline';
// doc images may be remote, hence img-src *.
const SHARE_CSP: &str =
    "default-src 'none'; img-src * data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'";

// Helper to escape HTML
fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
}

// Helper to render HTML doc page
fn render_doc_page(title: &str, content: &str, author: &str, doc_url: &str) -> String {
    let deep_link = format!("canonic://open?url={}", urlencoding::encode(doc_url));
    
    // Parse markdown using pulldown-cmark, then sanitize. pulldown-cmark passes raw
    // inline HTML through verbatim, so an unsanitized doc body is a stored-XSS vector
    // for anyone viewing the share over the LAN. ammonia strips <script>, on* handlers,
    // javascript: URLs, etc., while keeping standard formatting/tables/images.
    let parser = pulldown_cmark::Parser::new(content);
    let mut raw_html = String::new();
    pulldown_cmark::html::push_html(&mut raw_html, parser);
    let html_output = ammonia::clean(&raw_html);

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{} — Canonic</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.7;
    color: #1a1a1a;
    background: #f9f8f7;
    padding: 0 16px;
  }}
  .page {{
    max-width: 720px;
    margin: 0 auto;
    padding: 56px 0 96px;
  }}
  .meta {{
    font-size: 0.8125rem;
    color: #888;
    margin-bottom: 40px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e8e5e1;
    display: flex;
    align-items: center;
    gap: 12px;
  }}
  .meta-dot {{ color: #ccc; }}
  .open-app-btn {{
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    color: white;
    background: #4A7A9B;
    text-decoration: none;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 5px;
  }}
  .open-app-btn:hover {{ opacity: 0.85; }}
  h1 {{ font-size: 1.875rem; font-weight: 700; margin: 0 0 8px; color: #111; line-height: 1.25; }}
  h2 {{ font-size: 1.375rem; font-weight: 600; margin: 40px 0 12px; color: #111; }}
  h3 {{ font-size: 1.125rem; font-weight: 600; margin: 32px 0 10px; color: #111; }}
  h4 {{ font-size: 1rem; font-weight: 600; margin: 24px 0 8px; }}
  p {{ margin: 0 0 20px; }}
  ul, ol {{ margin: 0 0 20px 24px; }}
  li {{ margin-bottom: 4px; }}
  blockquote {{
    border-left: 3px solid #4A7A9B;
    padding: 4px 0 4px 16px;
    margin: 0 0 20px;
    color: #555;
    font-style: italic;
  }}
  code {{
    font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
    font-size: 0.875em;
    background: #ede9e5;
    padding: 2px 6px;
    border-radius: 4px;
  }}
  pre {{
    background: #1a1a1a;
    color: #e8e5e1;
    padding: 20px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 0 0 20px;
  }}
  pre code {{ background: none; padding: 0; color: inherit; font-size: 0.875rem; }}
  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 20px;
    font-size: 0.9rem;
  }}
  th, td {{ padding: 10px 14px; border: 1px solid #e0dbd5; text-align: left; }}
  th {{ background: #f0ece8; font-weight: 600; }}
  tr:nth-child(even) {{ background: #faf8f6; }}
  a {{ color: #4A7A9B; }}
  img {{ max-width: 100%; height: auto; border-radius: 6px; }}
  hr {{ border: none; border-top: 1px solid #e8e5e1; margin: 32px 0; }}
</style>
</head>
<body>
<div class="page">
  <div class="meta">
    <span>Shared by <strong>{}</strong></span>
    <span class="meta-dot">·</span>
    <span>View only</span>
    <a class="open-app-btn" href="{}" title="Open in Canonic app">Open in Canonic ↗</a>
  </div>
  {}
</div>
</body>
</html>"#,
        escape_html(title),
        escape_html(author),
        deep_link,
        html_output
    )
}

fn collect_markdown_files(
    workspaces: &[WorkspaceConfig],
    excluded_paths: &[String],
) -> Vec<Value> {
    let mut results = Vec::new();
    for ws in workspaces {
        let base_path = Path::new(&ws.path);
        if !base_path.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(base_path).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            if path.extension().map(|ext| ext == "md").unwrap_or(false) {
                let rel = path.strip_prefix(base_path).unwrap_or(path).to_string_lossy().into_owned();
                let norm_rel = rel.replace('\\', "/");
                // Check exclusions
                if excluded_paths.iter().any(|ex| norm_rel.starts_with(ex)) {
                    continue;
                }
                results.push(json!({
                    "workspace": ws.name,
                    "path": norm_rel
                }));
            }
        }
    }
    results
}

#[derive(Deserialize)]
struct TokenQuery {
    token: String,
}

#[derive(Deserialize)]
struct FileQuery {
    token: String,
    path: Option<String>,
    workspace: Option<String>,
    oid: Option<String>,
}

#[derive(Deserialize)]
struct CommentsBody {
    #[serde(rename = "filePath")]
    file_path: String,
    comments: Vec<Value>,
}

async fn handle_health() -> impl IntoResponse {
    Json(json!({ "ok": true }))
}

async fn handle_comments(
    State(share): State<Arc<ActiveShare>>,
    Query(query): Query<TokenQuery>,
    Json(body): Json<CommentsBody>,
) -> impl IntoResponse {
    if query.token != share.token {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Invalid token" })));
    }
    if share.permission == "view" {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Comments not allowed" })));
    }

    let home = std::env::var("HOME").unwrap_or_default();
    let comments_dir = Path::new(&home).join(".config").join("canonic").join("comments");
    if let Err(e) = fs::create_dir_all(&comments_dir) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })));
    }

    let file_name = format!("{}.json", body.file_path.replace('/', "_"));
    let comments_file = comments_dir.join(file_name);

    let mut existing: Vec<Value> = if comments_file.exists() {
        fs::read_to_string(&comments_file)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_else(|| vec![])
    } else {
        vec![]
    };

    let mut ids = std::collections::HashSet::new();
    for c in &existing {
        if let Some(id) = c.get("id").and_then(|i| i.as_str()) {
            ids.insert(id.to_string());
        }
    }

    for c in body.comments.clone() {
        if let Some(id) = c.get("id").and_then(|i| i.as_str()) {
            if !ids.contains(id) {
                existing.push(c);
            }
        }
    }

    if let Ok(content) = serde_json::to_string_pretty(&existing) {
        let _ = fs::write(comments_file, content);
    }

    if let Some(app) = crate::commands::app_handle() {
        use tauri::Emitter;
        let _ = app.emit("comments:received", json!({ "filePath": body.file_path, "comments": body.comments }));
    }

    (StatusCode::OK, Json(json!({ "ok": true })))
}

async fn handle_manifest(
    State(share): State<Arc<ActiveShare>>,
    Query(query): Query<TokenQuery>,
) -> impl IntoResponse {
    if query.token != share.token {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Invalid token" }))).into_response();
    }
    let files = collect_markdown_files(&share.workspaces, &share.excluded_paths);
    let author = std::env::var("USER").unwrap_or_else(|_| "Author".to_string());
    
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let hours = (now % 86400) / 3600;
    let minutes = (now % 3600) / 60;
    let seconds = now % 60;
    let time_str = format!("2026-06-08T{:02}:{:02}:{:02}Z", hours, minutes, seconds);

    (StatusCode::OK, Json(json!({
        "scope": share.scope,
        "files": files,
        "sharedAt": time_str,
        "author": author,
        "taggedOnly": share.tagged_only
    }))).into_response()
}

async fn handle_file(
    State(share): State<Arc<ActiveShare>>,
    headers: HeaderMap,
    Query(query): Query<FileQuery>,
) -> impl IntoResponse {
    if query.token != share.token {
        return (StatusCode::FORBIDDEN, "Invalid token").into_response();
    }

    let query_path = match query.path.as_ref().filter(|p| !p.is_empty()) {
        Some(p) => p.clone(),
        None => {
            if share.scope == "file" {
                share.key.clone()
            } else {
                return (StatusCode::BAD_REQUEST, "Missing path parameter").into_response();
            }
        }
    };

    let ws = if let Some(ws_name) = &query.workspace {
        share.workspaces.iter().find(|w| w.name == *ws_name)
    } else {
        share.workspaces.first()
    };

    let ws = match ws {
        Some(w) => w,
        None => return (StatusCode::NOT_FOUND, "Workspace not found").into_response(),
    };

    let base_path = match Path::new(&ws.path).canonicalize() {
        Ok(bp) => bp,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    // Reject absolute paths / `..` traversal / symlink escapes before any read.
    // A plain join + starts_with check is insufficient (see commands::safe_join).
    let target_path = match crate::commands::safe_join(&base_path, &query_path) {
        Ok(p) => p,
        Err(_) => return (StatusCode::FORBIDDEN, "Path traversal blocked").into_response(),
    };

    share.reads.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    let content = match &query.oid {
        Some(oid) => {
            match crate::commands::git_read_commit_internal(&ws.path, &query_path, oid) {
                Ok(c) => c,
                Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
            }
        }
        None => {
            if !target_path.exists() {
                return (StatusCode::NOT_FOUND, "File not found").into_response();
            }
            match fs::read_to_string(&target_path) {
                Ok(c) => c,
                Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
            }
        }
    };

    let home = std::env::var("HOME").unwrap_or_default();
    let comments_file = Path::new(&home)
        .join(".config")
        .join("canonic")
        .join("comments")
        .join(format!("{}.json", query_path.replace('/', "_")));

    let comments: Value = if comments_file.exists() {
        fs::read_to_string(comments_file)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_else(|| json!([]))
    } else {
        json!([])
    };

    let accept = headers.get("accept").and_then(|h| h.to_str().ok()).unwrap_or("");
    if accept.contains("text/html") {
        let title = Path::new(&query_path).file_stem().unwrap_or_default().to_string_lossy();
        let author = std::env::var("USER").unwrap_or_else(|_| "Author".to_string());
        let doc_url = format!("http://127.0.0.1:{}/file?path={}&token={}", share.port, urlencoding::encode(&query_path), share.token);
        let html = render_doc_page(&title, &content, &author, &doc_url);
        return (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                (header::CONTENT_SECURITY_POLICY, SHARE_CSP),
            ],
            Html(html),
        )
            .into_response();
    }

    (StatusCode::OK, Json(json!({
        "filePath": query_path,
        "workspace": ws.name,
        "content": content,
        "comments": comments,
        "oid": query.oid
    }))).into_response()
}

async fn handle_browse(
    State(share): State<Arc<ActiveShare>>,
    Query(query): Query<TokenQuery>,
) -> impl IntoResponse {
    if query.token != share.token {
        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
    }

    share.reads.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    let files = collect_markdown_files(&share.workspaces, &share.excluded_paths);

    let mut file_links = String::new();
    for f in &files {
        if let Some(path_str) = f.get("path").and_then(|p| p.as_str()) {
            let title = Path::new(path_str).file_stem().unwrap_or_default().to_string_lossy();
            let url = format!("/file?path={}&token={}", urlencoding::encode(path_str), share.token);
            file_links.push_str(&format!(
                r#"<a class="doc-link" href="{}">{}<span class="doc-path">{}</span></a>"#,
                url, escape_html(&title), escape_html(path_str)
            ));
        }
    }

    let author = std::env::var("USER").unwrap_or_else(|_| "Author".to_string());

    let html = format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workspace — {}</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: #f9f8f7; color: #1a1a1a; padding: 0 16px; }}
  .page {{ max-width: 640px; margin: 0 auto; padding: 48px 0 80px; }}
  .header {{ margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid #e8e5e1; }}
  h1 {{ font-size: 1.5rem; font-weight: 700; margin-bottom: 4px; }}
  .meta {{ font-size: 0.8125rem; color: #888; }}
  .doc-link {{
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 12px; padding: 12px 14px; border-radius: 8px;
    text-decoration: none; color: #1a1a1a;
    border: 1px solid #e8e5e1; margin-bottom: 6px;
    transition: background 0.1s, border-color 0.1s;
    font-size: 0.9375rem; font-weight: 500;
  }}
  .doc-link:hover {{ background: #f0ece8; border-color: #d0cac4; }}
  .doc-path {{ font-size: 0.75rem; color: #999; font-weight: 400; font-family: monospace; }}
  .empty {{ color: #888; font-size: 0.875rem; }}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>{}'s workspace</h1>
    <p class="meta">{} document{} · view only</p>
  </div>
  {}
</div>
</body>
</html>"#,
        escape_html(&author),
        escape_html(&author),
        files.len(),
        if files.len() != 1 { "s" } else { "" },
        if files.is_empty() { r#"<p class="empty">No documents found.</p>"#.to_string() } else { file_links }
    );

    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CONTENT_SECURITY_POLICY, SHARE_CSP),
        ],
        Html(html),
    )
        .into_response()
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(share): State<Arc<ActiveShare>>,
    Query(query): Query<TokenQuery>,
) -> impl IntoResponse {
    if query.token != share.token {
        return (StatusCode::FORBIDDEN, "Unauthorized").into_response();
    }
    ws.on_upgrade(move |socket| handle_ws_socket(socket, share))
}

async fn handle_ws_socket(socket: WebSocket, share: Arc<ActiveShare>) {
    let author = std::env::var("USER").unwrap_or_else(|_| "Author".to_string());
    let (mut ws_tx, mut ws_rx) = socket.split();

    // If it's a file share, read and send the document
    // We can assume the key represents the file path if scope is "file"
    if share.scope == "file" {
        if let Some(ws) = share.workspaces.first() {
            let full_path = Path::new(&ws.path).join(&share.key);
            if let Ok(content) = fs::read_to_string(full_path) {
                let msg = json!({
                    "type": "doc",
                    "filePath": share.key,
                    "content": content,
                    "author": author
                }).to_string();
                let _ = ws_tx.send(Message::Text(msg.into())).await;
            }
        }
    } else {
        let msg = json!({
            "type": "manifest",
            "author": author
        }).to_string();
        let _ = ws_tx.send(Message::Text(msg.into())).await;
    }

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Message>();
    let key = share.key.clone();
    
    {
        if let Ok(mut clients) = get_ws_clients().lock() {
            clients.entry(key.clone()).or_default().push(tx);
        }
    }

    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(_)) = ws_rx.next().await {
            // keep alive ping-pong or ignore
        }
    });

    tokio::select! {
        _ = (&mut send_task) => { recv_task.abort(); }
        _ = (&mut recv_task) => { send_task.abort(); }
    };

    if let Ok(mut clients) = get_ws_clients().lock() {
        if let Some(list) = clients.get_mut(&key) {
            list.retain(|c| !c.is_closed());
        }
    }
}

pub fn push_update(file_path: &str, content: &str) {
    if let Ok(clients) = get_ws_clients().lock() {
        for list in clients.values() {
            let payload = json!({
                "type": "update",
                "filePath": file_path,
                "content": content
            }).to_string();
            for tx in list {
                let _ = tx.send(Message::Text(payload.clone().into()));
            }
        }
    }
}

pub fn start_sharing_server(
    key: String,
    scope: String,
    permission: String,
    workspaces: Vec<WorkspaceConfig>,
    excluded_paths: Vec<String>,
    tagged_only: bool,
) -> Result<Arc<ActiveShare>, String> {
    // Stop existing share with the same key
    let _ = stop_sharing_server(&key);

    // Pick a random port
    let port = 13800 + (rand::random::<u16>() % 10000);
    let token = uuid::Uuid::new_v4().to_string();
    let lan_ip = get_lan_ip();
    let is_workspace = key == "__workspace__" || key == "__all_workspaces__";
    let path_prefix = if is_workspace { "browse" } else { "doc" };
    let local_url = format!("http://{}:{}/{}?token={}", lan_ip, port, path_prefix, token);

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    let share = Arc::new(ActiveShare {
        key: key.clone(),
        port,
        token,
        local_url,
        permission,
        scope,
        workspaces,
        excluded_paths,
        tagged_only,
        reads: std::sync::atomic::AtomicU64::new(0),
        shutdown_tx: std::sync::Mutex::new(Some(shutdown_tx)),
    });

    {
        let mut shares = get_active_shares()?;
        shares.insert(key.clone(), share.clone());
    }

    let share_clone = share.clone();
    let app = Router::new()
        .route("/health", get(handle_health))
        .route("/comments", post(handle_comments))
        .route("/manifest", get(handle_manifest))
        .route("/file", get(handle_file))
        .route("/doc", get(handle_file)) // doc acts same as file
        .route("/browse", get(handle_browse))
        .route("/ws", get(ws_handler))
        .route("/", get(ws_handler))
        .with_state(share_clone);

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
            let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
            
            let server = axum::serve(listener, app);
            tokio::select! {
                _ = server => {}
                _ = shutdown_rx => {}
            }
        });
    });

    Ok(share)
}

pub fn stop_sharing_server(key: &str) -> Result<u16, String> {
    let mut shares = get_active_shares()?;
    if let Some(share) = shares.remove(key) {
        if let Some(tx) = share.shutdown_tx.lock().unwrap().take() {
            let _ = tx.send(());
        }
        Ok(share.port)
    } else {
        Err("No active share found for this key".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_doc_page_strips_active_content() {
        let md = "# Title\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>\n\n[link](javascript:alert(3))";
        let html = render_doc_page("Title", md, "Author", "http://127.0.0.1/doc");
        assert!(!html.contains("<script"), "script tag survived: {html}");
        assert!(
            !html.to_lowercase().contains("onerror"),
            "event handler survived: {html}"
        );
        assert!(!html.contains("javascript:"), "javascript: url survived: {html}");
    }

    #[test]
    fn escape_html_escapes_metacharacters() {
        assert_eq!(escape_html("<a>&\"</a>"), "&lt;a&gt;&amp;&quot;&lt;/a&gt;");
    }
}
