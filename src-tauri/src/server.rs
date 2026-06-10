use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
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

// Escape a JSON blob for safe embedding inside an inline <script>. Stops document or
// comment content from breaking out of the element (`</script>`) or terminating the JS
// string via U+2028 / U+2029. The values themselves stay valid JS once escaped.
fn escape_script_json(s: &str) -> String {
    s.replace('<', "\\u003c")
     .replace('>', "\\u003e")
     .replace('&', "\\u0026")
     .replace('\u{2028}', "\\u2028")
     .replace('\u{2029}', "\\u2029")
}

// CSS for the interactive comment layer. Only emitted on comment-enabled shares, so the
// strict view-only pages stay byte-for-byte unchanged.
const COMMENT_CSS: &str = r#"
  .comments-col { flex: 0 0 300px; padding: 56px 0 96px; position: sticky; top: 0; align-self: flex-start; }
  .comments-col h3 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 14px; font-weight: 600; }
  .c-card { border: 1px solid #e8e5e1; border-radius: 8px; padding: 11px 13px; margin-bottom: 8px; background: #fff; }
  .c-author { font-weight: 600; font-size: 0.8125rem; color: #333; }
  .c-quote { font-size: 0.75rem; color: #4A7A9B; border-left: 2px solid #cfe0ea; padding-left: 8px; margin: 6px 0; }
  .c-text { font-size: 0.875rem; color: #1a1a1a; white-space: pre-wrap; }
  .c-reply { font-size: 0.8125rem; color: #333; margin: 6px 0 0 12px; padding-left: 8px; border-left: 2px solid #e8e5e1; white-space: pre-wrap; }
  .c-reply-author { font-weight: 600; }
  .c-reply-btn { margin-top: 8px; background: none; border: none; color: #4A7A9B; cursor: pointer; padding: 0; font-size: 0.75rem; font-weight: 500; }
  .c-empty { color: #999; font-size: 0.75rem; }
  #sel-comment-btn { position: absolute; display: none; z-index: 50; background: #4A7A9B; color: #fff; border: none; border-radius: 6px; padding: 5px 11px; font-size: 0.8125rem; font-weight: 500; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.18); }
  #cmt-pop { position: absolute; display: none; z-index: 51; width: 280px; background: #fff; border: 1px solid #d0cac4; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.16); padding: 12px; }
  #cmt-pop .pop-quote { font-size: 0.75rem; color: #4A7A9B; margin-bottom: 8px; max-height: 48px; overflow: hidden; }
  #cmt-pop input, #cmt-pop textarea { width: 100%; border: 1px solid #d0cac4; border-radius: 6px; padding: 7px 9px; font: inherit; font-size: 0.875rem; margin-bottom: 8px; resize: vertical; }
  #cmt-pop textarea { min-height: 64px; }
  #cmt-pop .pop-actions { display: flex; gap: 8px; justify-content: flex-end; }
  #cmt-pop button { border: none; border-radius: 6px; padding: 6px 12px; font-size: 0.8125rem; font-weight: 500; cursor: pointer; }
  #cmt-pop .btn-post { background: #4A7A9B; color: #fff; }
  #cmt-pop .btn-cancel { background: #ede9e5; color: #555; }
  @media (max-width: 980px) { .layout { flex-direction: column; align-items: stretch; } .comments-col { flex: 1 1 auto; padding: 0 0 40px; position: static; } .page { flex: 1 1 auto; } }
"#;

// Right-margin comment thread container.
const COMMENT_ASIDE_HTML: &str =
    r#"<aside class="comments-col"><h3>Comments</h3><div id="comments-list"></div></aside>"#;

// Floating "Comment" button + the add/reply popover. Markup only; behavior is in COMMENT_SCRIPT.
const COMMENT_WIDGET_HTML: &str = r#"<button id="sel-comment-btn" type="button">💬 Comment</button>
<div id="cmt-pop">
  <div class="pop-quote" id="pop-quote"></div>
  <input id="pop-name" type="text" placeholder="Your name" autocomplete="name">
  <textarea id="pop-text" placeholder="Add a comment…"></textarea>
  <div class="pop-actions">
    <button class="btn-cancel" id="pop-cancel" type="button">Cancel</button>
    <button class="btn-post" id="pop-post" type="button">Comment</button>
  </div>
</div>"#;

// The whole browser comment layer. Reads its config from the single escaped `__CANONIC__`
// blob injected ahead of it (token, file path, viewed commit oid, existing comments) and
// renders/threads comments with textContent only — no innerHTML, so doc/comment text can
// never inject markup.
const COMMENT_SCRIPT: &str = r#"(function(){
  var TOKEN=__CANONIC__.token, FILE=__CANONIC__.file, OID=__CANONIC__.oid;
  var DATA=Array.isArray(__CANONIC__.comments)?__CANONIC__.comments:[];
  var NAME_KEY="canonic_commenter_name";
  var listEl=document.getElementById("comments-list");
  var btn=document.getElementById("sel-comment-btn");
  var pop=document.getElementById("cmt-pop");
  var popQuote=document.getElementById("pop-quote");
  var popName=document.getElementById("pop-name");
  var popText=document.getElementById("pop-text");
  var popPost=document.getElementById("pop-post");
  var docBody=document.getElementById("doc-body");
  var pendingQuote="", replyTo=null;
  function initials(n){return n.split(/\s+/).filter(Boolean).map(function(w){return w.charAt(0);}).join("").slice(0,2).toUpperCase();}
  function uuid(){try{return crypto.randomUUID();}catch(e){return "c-"+Date.now()+"-"+Math.random().toString(16).slice(2);}}
  function el(tag,cls,txt){var e=document.createElement(tag);if(cls){e.className=cls;}if(txt!=null){e.textContent=txt;}return e;}
  function render(){
    listEl.textContent="";
    var active=DATA.filter(function(c){return !c.resolved;});
    if(!active.length){listEl.appendChild(el("p","c-empty","No comments yet. Select text to add one."));return;}
    active.forEach(function(c){
      var card=el("div","c-card");
      card.appendChild(el("div","c-author",c.author||"Anonymous"));
      if(c.anchor&&c.anchor.quotedText){card.appendChild(el("div","c-quote","“"+c.anchor.quotedText+"”"));}
      card.appendChild(el("div","c-text",c.text||""));
      (c.replies||[]).forEach(function(r){
        var row=el("div","c-reply");
        row.appendChild(el("span","c-reply-author",(r.author||"Anonymous")+": "));
        row.appendChild(document.createTextNode(r.text||""));
        card.appendChild(row);
      });
      var rb=el("button","c-reply-btn","Reply");
      rb.addEventListener("click",function(){openPop(c.anchor&&c.anchor.quotedText?c.anchor.quotedText:"",c.id,rb);});
      card.appendChild(rb);
      listEl.appendChild(card);
    });
  }
  function hideBtn(){btn.style.display="none";}
  function hidePop(){pop.style.display="none";replyTo=null;}
  function openPop(quote,parentId,anchorEl){
    replyTo=parentId||null;
    pendingQuote=quote||"";
    hideBtn();
    popQuote.textContent=pendingQuote?("“"+pendingQuote.slice(0,140)+(pendingQuote.length>140?"…":"")+"”"):"";
    popName.value=localStorage.getItem(NAME_KEY)||"";
    popText.value="";
    popText.placeholder=replyTo?"Write a reply…":"Add a comment…";
    var r=anchorEl?anchorEl.getBoundingClientRect():{top:80,left:80};
    pop.style.display="block";
    pop.style.top=(window.scrollY+r.top-8)+"px";
    pop.style.left=(window.scrollX+Math.max(8,(r.left||80)-40))+"px";
    (popName.value?popText:popName).focus();
  }
  document.addEventListener("mouseup",function(){
    setTimeout(function(){
      if(pop.style.display==="block"){return;}
      var sel=window.getSelection();
      var text=sel?sel.toString().trim():"";
      if(!text||!sel.anchorNode||!docBody.contains(sel.anchorNode)){hideBtn();return;}
      pendingQuote=text;
      var rr=sel.getRangeAt(0).getBoundingClientRect();
      btn.style.display="block";
      btn.style.top=(window.scrollY+rr.top-40)+"px";
      btn.style.left=(window.scrollX+rr.left)+"px";
    },0);
  });
  btn.addEventListener("mousedown",function(e){e.preventDefault();});
  btn.addEventListener("click",function(){
    var r=null;try{r=window.getSelection().getRangeAt(0).getBoundingClientRect();}catch(e){}
    openPop(pendingQuote,null,{getBoundingClientRect:function(){return r||{top:80,left:80};}});
  });
  document.getElementById("pop-cancel").addEventListener("click",hidePop);
  popPost.addEventListener("click",function(){
    var name=(popName.value||"").trim();
    var text=(popText.value||"").trim();
    if(!name){popName.focus();return;}
    if(!text){popText.focus();return;}
    localStorage.setItem(NAME_KEY,name);
    var payload;
    if(replyTo){
      payload={id:uuid(),parentId:replyTo,author:name,authorInitials:initials(name),text:text,source:"browser",createdAt:new Date().toISOString()};
    }else{
      payload={id:uuid(),author:name,authorInitials:initials(name),type:"selection",source:"browser",anchor:{quotedText:pendingQuote},text:text,resolved:false,createdAt:new Date().toISOString()};
      if(OID){payload.commitOid=OID;}
    }
    popPost.disabled=true;popPost.textContent="Posting…";
    fetch("/comments?token="+encodeURIComponent(TOKEN),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filePath:FILE,comments:[payload]})})
      .then(function(res){if(!res.ok){throw new Error("HTTP "+res.status);}
        if(replyTo){var root=DATA.filter(function(c){return c.id===replyTo;})[0];if(root){root.replies=root.replies||[];root.replies.push(payload);}}
        else{DATA.push(payload);}
        render();hidePop();var s=window.getSelection();if(s){s.removeAllRanges();}})
      .catch(function(err){alert("Could not post comment: "+err.message);})
      .then(function(){popPost.disabled=false;popPost.textContent="Comment";});
  });
  render();
})();"#;

// Merge browser-posted comments into the stored list. A payload carrying `parentId` is
// appended as a reply to that root (deduped by id); otherwise it's a new root (deduped by
// id). Orphan replies (missing parent) are dropped. Writes the same file the app reads.
fn merge_incoming_comments(existing: &mut Vec<Value>, incoming: &[Value]) {
    for c in incoming {
        let id = match c.get("id").and_then(|i| i.as_str()) {
            Some(id) => id.to_string(),
            None => continue,
        };
        if let Some(parent_id) = c.get("parentId").and_then(|p| p.as_str()) {
            if let Some(root) = existing
                .iter_mut()
                .find(|e| e.get("id").and_then(|i| i.as_str()) == Some(parent_id))
            {
                if let Some(obj) = root.as_object_mut() {
                    let replies = obj.entry("replies").or_insert_with(|| json!([]));
                    if let Some(arr) = replies.as_array_mut() {
                        let dup = arr
                            .iter()
                            .any(|r| r.get("id").and_then(|i| i.as_str()) == Some(id.as_str()));
                        if !dup {
                            arr.push(c.clone());
                        }
                    }
                }
            }
        } else {
            let dup = existing
                .iter()
                .any(|e| e.get("id").and_then(|i| i.as_str()) == Some(id.as_str()));
            if !dup {
                existing.push(c.clone());
            }
        }
    }
}

// Helper to render HTML doc page
#[allow(clippy::too_many_arguments)]
fn render_doc_page(
    title: &str,
    content: &str,
    author: &str,
    doc_url: &str,
    file_path: &str,
    token: &str,
    viewed_oid: &str,
    can_comment: bool,
    comments: &Value,
    nonce: &str,
) -> String {
    let deep_link = format!("canonic://open?url={}", urlencoding::encode(doc_url));
    
    // Parse markdown using pulldown-cmark, then sanitize. pulldown-cmark passes raw
    // inline HTML through verbatim, so an unsanitized doc body is a stored-XSS vector
    // for anyone viewing the share over the LAN. ammonia strips <script>, on* handlers,
    // javascript: URLs, etc., while keeping standard formatting/tables/images.
    let parser = pulldown_cmark::Parser::new(content);
    let mut raw_html = String::new();
    pulldown_cmark::html::push_html(&mut raw_html, parser);
    let html_output = ammonia::clean(&raw_html);

    let meta_label = if can_comment { "Comment enabled" } else { "View only" };
    let (comment_css, aside_block, interactive_block): (&str, String, String) = if can_comment {
        // One escaped config blob feeds the script — avoids per-value placeholder
        // substitution and double-encoding, and keeps user content out of the markup.
        let cfg = json!({ "token": token, "file": file_path, "oid": viewed_oid, "comments": comments });
        let cfg_js = escape_script_json(&cfg.to_string());
        let mut script_body = String::from("var __CANONIC__=");
        script_body.push_str(&cfg_js);
        script_body.push_str(";\n");
        script_body.push_str(COMMENT_SCRIPT);
        let interactive = format!(
            "{}\n<script nonce=\"{}\">{}</script>",
            COMMENT_WIDGET_HTML, nonce, script_body
        );
        (COMMENT_CSS, COMMENT_ASIDE_HTML.to_string(), interactive)
    } else {
        ("", String::new(), String::new())
    };

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
  .layout {{
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 32px;
    max-width: 1120px;
    margin: 0 auto;
  }}
  .page {{
    flex: 0 1 720px;
    max-width: 720px;
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
  {}
</style>
</head>
<body>
<div class="layout">
  <div class="page">
    <div class="meta">
      <span>Shared by <strong>{}</strong></span>
      <span class="meta-dot">·</span>
      <span>{}</span>
      <a class="open-app-btn" href="{}" title="Open in Canonic app">Open in Canonic ↗</a>
    </div>
    <div id="doc-body">{}</div>
  </div>
  {}
</div>
{}
</body>
</html>"#,
        escape_html(title),
        comment_css,
        escape_html(author),
        meta_label,
        deep_link,
        html_output,
        aside_block,
        interactive_block
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

    // Same file the desktop app reads (commands::comments_file_path), so browser comments
    // and replies show up in the app and survive `CANONIC_CONFIG_DIR` overrides.
    let comments_file = crate::commands::comments_file_path(&body.file_path);
    if let Some(parent) = comments_file.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })));
        }
    }

    let mut existing: Vec<Value> = if comments_file.exists() {
        fs::read_to_string(&comments_file)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_default()
    } else {
        vec![]
    };

    merge_incoming_comments(&mut existing, &body.comments);

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

    (StatusCode::OK, Json(json!({
        "scope": share.scope,
        "files": files,
        "sharedAt": crate::mcp::chrono_iso8601(),
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

    let comments_file = crate::commands::comments_file_path(&query_path);
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
        // Commenting reuses the existing share permission model: anything above view-only
        // (comment/copy) gets the interactive layer. View-only pages stay script-free.
        let can_comment = share.permission != "view";
        let viewed_oid = query.oid.clone().unwrap_or_default();
        let nonce = uuid::Uuid::new_v4().simple().to_string();
        let html = render_doc_page(
            &title, &content, &author, &doc_url,
            &query_path, &share.token, &viewed_oid, can_comment, &comments, &nonce,
        );
        // Relax the CSP just enough for our own nonce'd script + same-origin POST when
        // commenting is enabled; everything else stays locked (no remote/inline script).
        let csp = if can_comment {
            format!(
                "default-src 'none'; img-src * data:; style-src 'unsafe-inline'; font-src data:; connect-src 'self'; script-src 'nonce-{}'; base-uri 'none'; form-action 'none'",
                nonce
            )
        } else {
            SHARE_CSP.to_string()
        };
        let mut resp = Html(html).into_response();
        let h = resp.headers_mut();
        h.insert(header::CONTENT_TYPE, HeaderValue::from_static("text/html; charset=utf-8"));
        if let Ok(v) = HeaderValue::from_str(&csp) {
            h.insert(header::CONTENT_SECURITY_POLICY, v);
        }
        return resp;
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
                let _ = ws_tx.send(Message::Text(msg)).await;
            }
        }
    } else {
        let msg = json!({
            "type": "manifest",
            "author": author
        }).to_string();
        let _ = ws_tx.send(Message::Text(msg)).await;
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

// Does this share serve `file_path`? Used to route live updates to the right
// viewers instead of broadcasting every doc to every connected client.
fn is_excluded(share: &ActiveShare, file_path: &str) -> bool {
    share.excluded_paths.iter().any(|ex| file_path.starts_with(ex))
}

fn share_covers(share: &ActiveShare, file_path: &str) -> bool {
    if is_excluded(share, file_path) {
        return false;
    }
    match share.scope.as_str() {
        "directory" => {
            file_path == share.key || file_path.starts_with(&format!("{}/", share.key))
        }
        "workspace" | "all-workspaces" => true,
        // "file" and anything unexpected: exact file match only.
        _ => share.key == file_path,
    }
}

pub fn push_update(file_path: &str, content: &str) {
    // Notify only the sockets of shares that actually cover this file. The ws-client
    // map is keyed by share key, so collect the covering keys (releasing the shares
    // lock before taking the clients lock) and push to just those.
    let keys: Vec<String> = match get_active_shares() {
        Ok(shares) => shares
            .values()
            .filter(|s| share_covers(s, file_path))
            .map(|s| s.key.clone())
            .collect(),
        Err(_) => return,
    };
    if keys.is_empty() {
        return;
    }
    let payload = json!({
        "type": "update",
        "filePath": file_path,
        "content": content
    })
    .to_string();
    if let Ok(clients) = get_ws_clients().lock() {
        for key in &keys {
            if let Some(list) = clients.get(key) {
                for tx in list {
                    let _ = tx.send(Message::Text(payload.clone()));
                }
            }
        }
    }
}

// Bind a share-server socket on a random high port, retrying on collision.
fn bind_share_listener() -> Result<std::net::TcpListener, String> {
    use std::net::{SocketAddr, TcpListener};
    let mut last_err = String::new();
    for _ in 0..10 {
        let port = 13800 + (rand::random::<u16>() % 10000);
        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        match TcpListener::bind(addr) {
            Ok(listener) => return Ok(listener),
            Err(e) => last_err = e.to_string(),
        }
    }
    Err(format!(
        "Failed to bind a share port after 10 attempts: {last_err}"
    ))
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

    // Bind synchronously so a bind failure is returned to the caller instead of
    // being swallowed in a detached thread (which left the share registered but
    // serving nothing). Retry a few ports on collision.
    let listener = bind_share_listener()?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
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
        let rt = match tokio::runtime::Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                log::error!("share server: failed to start runtime: {e}");
                return;
            }
        };
        rt.block_on(async {
            let listener = match tokio::net::TcpListener::from_std(listener) {
                Ok(l) => l,
                Err(e) => {
                    log::error!("share server: failed to adopt listener: {e}");
                    return;
                }
            };
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
        // View-only page: no script of our own, so the doc body must stay inert too.
        let html = render_doc_page(
            "Title", md, "Author", "http://127.0.0.1/doc",
            "f.md", "tok", "", false, &json!([]), "nonce",
        );
        assert!(!html.contains("<script"), "script tag survived: {html}");
        assert!(
            !html.to_lowercase().contains("onerror"),
            "event handler survived: {html}"
        );
        assert!(!html.contains("javascript:"), "javascript: url survived: {html}");
        assert!(html.contains("View only"), "view-only label missing: {html}");
    }

    #[test]
    fn render_doc_page_comment_enabled_has_widget() {
        let comments = json!([
            { "id": "c1", "author": "Priya", "text": "tighten", "anchor": { "quotedText": "segment" } }
        ]);
        let html = render_doc_page(
            "Doc", "# Body", "Author", "http://127.0.0.1/doc",
            "Vision.md", "tok123", "", true, &comments, "NONCEXYZ",
        );
        assert!(html.contains("Comment enabled"), "label missing: {html}");
        assert!(html.contains("nonce=\"NONCEXYZ\""), "nonce missing: {html}");
        assert!(html.contains("id=\"comments-list\""), "comments column missing: {html}");
        assert!(html.contains("/comments?token="), "post endpoint missing: {html}");
        assert!(html.contains("Priya"), "existing comment not embedded: {html}");
        // Exactly our own one script element — nothing smuggled in.
        assert_eq!(html.matches("<script").count(), 1, "unexpected extra script: {html}");
        assert_eq!(html.matches("</script>").count(), 1, "unbalanced script tags: {html}");
    }

    #[test]
    fn embedded_comment_text_cannot_break_out_of_script() {
        let comments = json!([
            { "id": "x", "author": "A", "text": "</script><script>alert(1)</script>",
              "anchor": { "quotedText": "q" } }
        ]);
        let html = render_doc_page(
            "Doc", "# Body", "Author", "http://127.0.0.1/doc",
            "Vision.md", "tok", "", true, &comments, "N",
        );
        // The malicious text is escaped, so the only real script tags are our own.
        assert_eq!(html.matches("<script").count(), 1, "breakout via comment text: {html}");
        assert_eq!(html.matches("</script>").count(), 1, "breakout via comment text: {html}");
        assert!(html.contains("\\u003c/script\\u003e"), "comment text not escaped: {html}");
    }

    #[test]
    fn merge_incoming_comments_appends_reply_and_dedupes() {
        let mut existing = vec![json!({ "id": "root1", "author": "P", "text": "hi" })];

        // New reply on an existing root.
        merge_incoming_comments(
            &mut existing,
            &[json!({ "id": "r1", "parentId": "root1", "author": "B", "text": "agree" })],
        );
        let replies = existing[0].get("replies").and_then(|r| r.as_array()).unwrap();
        assert_eq!(replies.len(), 1);
        assert_eq!(replies[0]["id"], "r1");

        // Same reply id again is ignored.
        merge_incoming_comments(
            &mut existing,
            &[json!({ "id": "r1", "parentId": "root1", "author": "B", "text": "agree" })],
        );
        assert_eq!(existing[0]["replies"].as_array().unwrap().len(), 1);

        // New root is appended; orphan reply (unknown parent) is dropped.
        merge_incoming_comments(
            &mut existing,
            &[
                json!({ "id": "root2", "author": "C", "text": "new" }),
                json!({ "id": "r9", "parentId": "ghost", "author": "C", "text": "lost" }),
            ],
        );
        assert_eq!(existing.len(), 2);
        assert_eq!(existing[1]["id"], "root2");
    }

    #[test]
    fn escape_html_escapes_metacharacters() {
        assert_eq!(escape_html("<a>&\"</a>"), "&lt;a&gt;&amp;&quot;&lt;/a&gt;");
    }

    fn test_share(key: &str, scope: &str, excluded: Vec<String>) -> ActiveShare {
        ActiveShare {
            key: key.to_string(),
            port: 0,
            token: String::new(),
            local_url: String::new(),
            permission: "view".to_string(),
            scope: scope.to_string(),
            workspaces: vec![],
            excluded_paths: excluded,
            tagged_only: false,
            reads: std::sync::atomic::AtomicU64::new(0),
            shutdown_tx: std::sync::Mutex::new(None),
        }
    }

    #[test]
    fn share_covers_file_scope_is_exact() {
        let s = test_share("Specs/a.md", "file", vec![]);
        assert!(share_covers(&s, "Specs/a.md"));
        assert!(!share_covers(&s, "Specs/b.md"));
    }

    #[test]
    fn share_covers_directory_scope_is_prefix() {
        let s = test_share("Specs", "directory", vec![]);
        assert!(share_covers(&s, "Specs"));
        assert!(share_covers(&s, "Specs/a.md"));
        assert!(!share_covers(&s, "SpecsX/a.md")); // sibling dir sharing a prefix
        assert!(!share_covers(&s, "Other/a.md"));
    }

    #[test]
    fn share_covers_workspace_respects_exclusions() {
        let s = test_share("__workspace__", "workspace", vec!["Private/".to_string()]);
        assert!(share_covers(&s, "Specs/a.md"));
        assert!(!share_covers(&s, "Private/secret.md"));
    }
}
