use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;
use notify::Watcher;

pub fn app_handle() -> Option<tauri::AppHandle> {
    static APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();
    APP.get().cloned()
}

pub fn set_app_handle(app: tauri::AppHandle) {
    static APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();
    let _ = APP.set(app);
}

#[cfg(target_os = "macos")]
#[link(name = "objc")]
extern "C" {
    fn sel_registerName(name: *const std::os::raw::c_char) -> *mut std::ffi::c_void;
    fn objc_getClass(name: *const std::os::raw::c_char) -> *mut std::ffi::c_void;
    fn objc_msgSend(
        receiver: *mut std::ffi::c_void,
        selector: *mut std::ffi::c_void,
    ) -> isize;
}

/// Pin the NSWindow's appearance to a specific aqua variant so the native
/// vibrancy (NSVisualEffectView) renders against the active theme's scheme
/// instead of following the OS system appearance. `dark` → NSAppearanceNameDarkAqua,
/// otherwise NSAppearanceNameAqua. Equivalent ObjC:
/// `[window setAppearance:[NSAppearance appearanceNamed:name]]`.
#[cfg(target_os = "macos")]
unsafe fn set_ns_window_appearance(ns_window: *mut std::ffi::c_void, dark: bool) {
    use std::ffi::c_void;
    use std::os::raw::c_char;

    let appearance_class = objc_getClass(c"NSAppearance".as_ptr());
    let string_class = objc_getClass(c"NSString".as_ptr());
    if appearance_class.is_null() || string_class.is_null() {
        return;
    }

    // objc_msgSend is variadic at the ABI level. Re-type the single declared symbol
    // for the two call shapes we need (object-arg and C-string-arg) instead of
    // redeclaring it, which would trip the clashing-extern-declarations lint.
    type Base = unsafe extern "C" fn(*mut c_void, *mut c_void) -> isize;
    type MsgSendObj = unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> *mut c_void;
    type MsgSendCStr = unsafe extern "C" fn(*mut c_void, *mut c_void, *const c_char) -> *mut c_void;
    let base: Base = objc_msgSend;
    let msg_obj = std::mem::transmute::<Base, MsgSendObj>(base);
    let msg_cstr = std::mem::transmute::<Base, MsgSendCStr>(base);

    // NSString *name = [NSString stringWithUTF8String:"NSAppearanceName…"]
    let name: &std::ffi::CStr = if dark {
        c"NSAppearanceNameDarkAqua"
    } else {
        c"NSAppearanceNameAqua"
    };
    let sel_string_with = sel_registerName(c"stringWithUTF8String:".as_ptr());
    let ns_name = msg_cstr(string_class, sel_string_with, name.as_ptr());
    if ns_name.is_null() {
        return;
    }

    // NSAppearance *appearance = [NSAppearance appearanceNamed:name]
    let sel_named = sel_registerName(c"appearanceNamed:".as_ptr());
    let appearance = msg_obj(appearance_class, sel_named, ns_name);
    if appearance.is_null() {
        return;
    }

    // [window setAppearance:appearance]
    let sel_set = sel_registerName(c"setAppearance:".as_ptr());
    let _ = msg_obj(ns_window, sel_set, appearance);
}

#[cfg(target_os = "macos")]
extern "C" {
    fn dlopen(path: *const std::os::raw::c_char, mode: std::os::raw::c_int) -> *mut std::ffi::c_void;
    fn dlsym(handle: *mut std::ffi::c_void, symbol: *const std::os::raw::c_char) -> *mut std::ffi::c_void;
    fn dlclose(handle: *mut std::ffi::c_void) -> std::os::raw::c_int;
}

#[cfg(target_os = "macos")]
unsafe fn set_window_blur_radius(window_number: isize, radius: i32) {
    let path = b"/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight\0";
    let handle = dlopen(path.as_ptr() as *const _, 1); // RTLD_LAZY = 1
    if !handle.is_null() {
        let sym_default_connection = dlsym(handle, c"CGSDefaultConnectionForThread".as_ptr() as *const _);
        let sym_set_blur_radius = dlsym(handle, c"CGSSetWindowBackgroundBlurRadius".as_ptr() as *const _);
        
        if !sym_default_connection.is_null() && !sym_set_blur_radius.is_null() {
            type CGSDefaultConnectionFn = unsafe extern "C" fn() -> *mut std::ffi::c_void;
            type CGSSetWindowBackgroundBlurRadiusFn = unsafe extern "C" fn(
                connection: *mut std::ffi::c_void,
                window_number: isize,
                radius: i32,
            ) -> i32;
            
            let default_connection: CGSDefaultConnectionFn = std::mem::transmute(sym_default_connection);
            let set_blur_radius: CGSSetWindowBackgroundBlurRadiusFn = std::mem::transmute(sym_set_blur_radius);
            
            let connection = default_connection();
            let _ = set_blur_radius(connection, window_number, radius);
        }
        dlclose(handle);
    }
}

#[cfg(target_os = "macos")]
pub fn apply_window_effects(window: &tauri::WebviewWindow) {
    if let Ok(config) = config_read() {
        let blur = config.get("windowBlur").and_then(|b| b.as_bool()).unwrap_or(true);
        
        // Clear any standard window vibrancy first
        let _ = window_vibrancy::clear_vibrancy(window);
        
        if let Ok(ns_window) = window.ns_window() {
            unsafe {
                // Pin the appearance to dark by default so the first paint matches a
                // dark theme (the default) before the frontend loads and calls
                // set_window_theme with the actual active theme's scheme.
                set_ns_window_appearance(ns_window, true);

                let sel = sel_registerName(c"windowNumber".as_ptr() as *const _);
                let window_number: isize = objc_msgSend(ns_window, sel);
                let radius = if blur { 20 } else { 0 };
                set_window_blur_radius(window_number, radius);
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
#[allow(dead_code)]
pub fn apply_window_effects(_window: &tauri::WebviewWindow) {}

/// Pin the native macOS window appearance to the active theme's scheme
/// ("dark" | "light"). This makes the vibrancy backdrop, titlebar and menus
/// follow the chosen theme rather than the OS system appearance. The AppKit
/// mutation is dispatched to the main thread. No-op off macOS.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn set_window_theme(scheme: String) {
    if let Some(app) = app_handle() {
        let _ = app.run_on_main_thread(move || {
            if let Some(window) = app_handle().and_then(|a| a.get_webview_window("main")) {
                if let Ok(ns_window) = window.ns_window() {
                    let dark = scheme != "light";
                    unsafe { set_ns_window_appearance(ns_window, dark) };
                }
            }
        });
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn set_window_theme(_scheme: String) {}




// --- Config ---

fn get_config_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("CANONIC_CONFIG_DIR") {
        PathBuf::from(dir)
    } else {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_default();
        Path::new(&home).join(".config").join("canonic")
    }
}

fn get_config_path() -> PathBuf {
    get_config_dir().join("config.json")
}

/// Public accessor for the canonic config dir (respects CANONIC_CONFIG_DIR).
pub fn config_dir_path() -> PathBuf {
    get_config_dir()
}

fn get_default_config() -> Value {
    let username = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "Developer".to_string());
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let default_ws = Path::new(&home).join("canonic");

    json!({
        "displayName": username,
        "defaultWorkspacePath": default_ws.to_string_lossy().to_string(),
        "telemetryEnabled": false,
        "autoUpdate": true,
        "updateChannel": "stable",
        "autoShareWorkspace": false,
        "autoShareAllWorkspaces": false,
        "sharingExcludedPaths": [],
        "sharingDefaults": {
            "scope": "file",
            "permission": "view"
        },
        "windowBlur": true,
        "windowTransparency": true,
        "windowTransparencyOpacity": 0.88,
        "editorParagraphSpacing": false,
        "grainEnabled": false,
        "grainOpacity": 0.02,
        "tabsEnabled": true,
        "tabsPosition": "bottom",
        "providers": [],
        "assistant": {
            "providerId": "",
            "model": "",
            "name": "Spark",
            "extraInstructions": "",
            "effortLevel": "Medium",
            "showThinking": true,
            "thinkingExpanded": false,
            "caps": {
                "indexWorkspace": true,
                "readDocs": true,
                "listTree": true,
                "webSearch": true,
                "postComments": true,
                "suggestEdits": true
            }
        },
        "completion": {
            "enabled": false,
            "providerId": "",
            "model": "codestral-latest",
            "debounceMs": 350,
            "maxTokens": 25,
            "wordBoundaryOnly": true,
            "extraInstructions": ""
        },
        "backup": {
            "enabled": false,
            "path": null,
            "intervalMinutes": 30,
            "maxCount": 20
        },
        "theme": {
            "light": "paper",
            "dark": "hal2001",
            "auto": true
        }
    })
}

#[tauri::command]
pub fn config_read() -> Result<Value, String> {
    let p = get_config_path();
    if !p.exists() {
        return Ok(get_default_config());
    }
    let content = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
    let mut config: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    // Merge missing default keys
    let defaults = get_default_config();
    if let (Some(obj), Some(def_obj)) = (config.as_object_mut(), defaults.as_object()) {
        for (k, v) in def_obj {
            if !obj.contains_key(k) {
                obj.insert(k.clone(), v.clone());
            }
        }
    }
    Ok(config)
}

#[tauri::command]
pub fn config_write(config: Value) -> Result<Value, String> {
    let mut errors = serde_json::Map::new();
    if let Some(display_name) = config.get("displayName").and_then(|n| n.as_str()) {
        if display_name.trim().is_empty() {
            errors.insert("displayName".to_string(), json!("Display name is required"));
        }
    }
    if !errors.is_empty() {
        return Ok(json!({ "success": false, "errors": errors }));
    }

    let dir = get_config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = get_config_path();
    
    // Trim API keys in all providers
    let mut config_clone = config.clone();
    if let Some(providers) = config_clone.get_mut("providers").and_then(|p| p.as_array_mut()) {
        for provider in providers {
            if let Some(api_key) = provider.get_mut("apiKey").and_then(|k| k.as_str()) {
                let trimmed = api_key.trim().to_string();
                if let Some(prov_obj) = provider.as_object_mut() {
                    if let Some(key_val) = prov_obj.get_mut("apiKey") {
                        *key_val = Value::String(trimmed);
                    }
                }
            }
        }
    }

    // Merge missing default keys
    let defaults = get_default_config();
    if let (Some(obj), Some(def_obj)) = (config_clone.as_object_mut(), defaults.as_object()) {
        for (k, v) in def_obj {
            if !obj.contains_key(k) {
                obj.insert(k.clone(), v.clone());
            }
        }
    }

    let content = serde_json::to_string_pretty(&config_clone).map_err(|e| e.to_string())?;
    std::fs::write(p, content).map_err(|e| e.to_string())?;

    // Apply window effects at runtime
    if let Some(app) = app_handle() {
        if let Some(_window) = app.get_webview_window("main") {
            #[cfg(target_os = "macos")]
            apply_window_effects(&_window);
        }
    }

    Ok(json!({ "success": true, "config": config_clone }))
}

#[tauri::command]
pub fn config_exists() -> Result<bool, String> {
    Ok(get_config_path().exists())
}

#[tauri::command]
pub fn config_validate(config: Value) -> Result<Value, String> {
    let mut errors = serde_json::Map::new();
    if let Some(display_name) = config.get("displayName").and_then(|n| n.as_str()) {
        if display_name.trim().is_empty() {
            errors.insert("displayName".to_string(), json!("Display name is required"));
        }
    } else {
        errors.insert("displayName".to_string(), json!("Display name is required"));
    }
    let valid = errors.is_empty();
    Ok(json!({ "valid": valid, "errors": errors }))
}

// --- App ---
#[tauri::command]
pub fn app_version() -> Result<String, String> {
    // Baked from Cargo.toml at compile time; CI keeps it in step with
    // tauri.conf.json, which is also the version the updater compares against.
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
pub fn app_is_default_md() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub fn app_set_default_md(_value: bool) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn app_open_config(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = get_config_dir();
    let _ = std::fs::create_dir_all(&dir);
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn app_edit_action(_action: String) -> Result<(), String> {
    Ok(())
}

// Build the native menu. The only channels the renderer actually consumes are
// menu:open-settings (Cmd+,) and the standard edit roles (handled natively by the
// webview). Menu item ids that start with "menu:" are forwarded to the renderer as
// Tauri events so the existing window.canonic.menu.* listeners keep working.
// Only invoked on macOS (global menu bar); Linux/Windows use the custom AppMenu.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn build_app_menu(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

    let settings = MenuItemBuilder::with_id("menu:open-settings", "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(app)
        .map_err(|e| e.to_string())?;

    let app_submenu = SubmenuBuilder::new(app, "Canonic")
        .item(&settings)
        .separator()
        .quit()
        .build()
        .map_err(|e| e.to_string())?;

    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()
        .map_err(|e| e.to_string())?;

    let menu = MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&edit_submenu)
        .build()
        .map_err(|e| e.to_string())?;

    app.set_menu(menu).map_err(|e| e.to_string())?;

    app.on_menu_event(|app, event| {
        use tauri::Emitter;
        let id = event.id().as_ref();
        if id.starts_with("menu:") {
            let _ = app.emit(id, ());
        }
    });

    Ok(())
}

// --- Telemetry ---
#[tauri::command]
pub fn telemetry_log(_event: String, _details: Option<Value>) -> Result<(), String> {
    Ok(())
}

// --- Dialogs ---
#[tauri::command]
pub async fn dialog_confirm(app: tauri::AppHandle, title: String, message: String) -> Result<bool, String> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .message(message)
        .title(title)
        .buttons(MessageDialogButtons::OkCancel)
        .show(move |ok| {
            let _ = tx.send(ok);
        });
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn dialog_open_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    pick_folder(&app).await
}

async fn pick_folder(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    let picked = rx.await.map_err(|e| e.to_string())?;
    Ok(picked
        .and_then(|p| p.into_path().ok())
        .map(|pb| pb.to_string_lossy().to_string()))
}

// --- Workspace ---
#[tauri::command]
pub async fn workspace_open_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    pick_folder(&app).await
}

#[tauri::command]
pub fn workspace_init(path: String, template: String) -> Result<Value, String> {
    {
        let cell = active_workspace_path();
        let lock = cell.get_or_init(|| std::sync::Mutex::new(None));
        if let Ok(mut l) = lock.lock() {
            *l = Some(path.clone());
        }
    }
    let p = Path::new(&path);
    if !p.exists() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }

    // Try to open existing repository
    let mut already_exists = false;
    let repo = match git2::Repository::open(p) {
        Ok(r) => {
            already_exists = true;
            r
        },
        Err(_) => {
            git2::Repository::init(p).map_err(|e| format!("Failed to init git repository: {}", e))?
        }
    };

    // If not already exists, write template files and make first commit
    let mut files_created = Vec::new();
    if !already_exists {
        let files = if template == "pm-framework" {
            get_pm_framework_files()
        } else if template == "canonic-demo" {
            get_canonic_demo_files()
        } else {
            vec![]
        };

        for (rel_path, content) in files {
            let full_path = p.join(rel_path);
            if let Some(parent) = full_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::write(&full_path, content).map_err(|e| e.to_string())?;
            files_created.push(rel_path.to_string());
        }

        // Add README.md
        let readme_path = p.join("README.md");
        std::fs::write(&readme_path, get_readme_content()).map_err(|e| e.to_string())?;
        files_created.push("README.md".to_string());

        // Stage all files and commit
        if !files_created.is_empty() {
            let mut index = repo.index().map_err(|e| e.to_string())?;
            for file in &files_created {
                index.add_path(Path::new(file)).map_err(|e| e.to_string())?;
            }
            index.write().map_err(|e| e.to_string())?;
            let oid = index.write_tree().map_err(|e| e.to_string())?;
            let tree = repo.find_tree(oid).map_err(|e| e.to_string())?;
            let sig = git2::Signature::now("Canonic", "author@canonic.local").map_err(|e| e.to_string())?;
            
            repo.commit(
                Some("HEAD"),
                &sig,
                &sig,
                &format!("Initialize {} workspace", template),
                &tree,
                &[]
            ).map_err(|e| e.to_string())?;
        }
    }

    // Start filesystem watcher
    if let Err(e) = start_watcher_rust(path.clone()) {
        log::error!("[workspace_init] failed to start watcher: {:?}", e);
    }

    Ok(json!({
        "path": path,
        "alreadyExists": already_exists,
        "isExternal": already_exists,
        "filesCreated": files_created
    }))
}

#[tauri::command]
pub fn workspace_get_default() -> Result<String, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|e| format!("Could not find home directory: {}", e))?;
    let default_path = Path::new(&home).join("canonic");
    Ok(default_path.to_string_lossy().to_string())
}

fn get_workspaces_file_path() -> PathBuf {
    get_config_dir().join("workspaces.json")
}

#[tauri::command]
pub fn workspace_recent_list() -> Result<Vec<Value>, String> {
    let p = get_workspaces_file_path();
    if !p.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let recents = data.get("recents").and_then(|r| r.as_array()).cloned().unwrap_or_default();
    Ok(recents)
}

#[tauri::command]
pub fn workspace_recent_add(path: String, name: String) -> Result<Vec<Value>, String> {
    let mut recents = workspace_recent_list()?;
    
    // Remove if already in list
    recents.retain(|w| w.get("path").and_then(|p| p.as_str()) != Some(&path));
    
    let opened_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let display_name = if name.is_empty() {
        Path::new(&path).file_name().and_then(|f| f.to_str()).unwrap_or("Workspace").to_string()
    } else {
        name
    };

    let entry = json!({
        "path": path,
        "name": display_name,
        "openedAt": opened_at
    });
    
    recents.insert(0, entry);
    if recents.len() > 8 {
        recents.truncate(8);
    }
    
    let dir = get_config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = get_workspaces_file_path();
    let data = json!({ "recents": recents });
    let content = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(p, content).map_err(|e| e.to_string())?;
    
    Ok(recents)
}

#[tauri::command]
pub fn workspace_recent_remove(path: String) -> Result<Vec<Value>, String> {
    let mut recents = workspace_recent_list()?;
    recents.retain(|w| w.get("path").and_then(|p| p.as_str()) != Some(&path));
    
    let p = get_workspaces_file_path();
    let data = json!({ "recents": recents });
    let content = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(p, content).map_err(|e| e.to_string())?;
    
    Ok(recents)
}

// --- Files ---

/// Join `relative_path` onto an already-canonicalized `base` and return a path proven to
/// stay inside `base`. Rejects absolute paths and `..` components up front, then
/// canonicalizes the result (resolving symlinks) before the containment check — a plain
/// `base.join(p).starts_with(base)` is NOT sufficient because `base/../x` lexically starts
/// with `base`, and symlinks can point outside. For not-yet-created files we canonicalize
/// the deepest existing ancestor and re-append the new tail.
pub fn safe_join(base: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative_path);
    for comp in rel.components() {
        match comp {
            std::path::Component::ParentDir => {
                return Err("Directory traversal escape blocked!".to_string())
            }
            std::path::Component::Prefix(_) | std::path::Component::RootDir => {
                return Err("Absolute paths are not allowed".to_string())
            }
            _ => {}
        }
    }

    let target = base.join(rel);
    let canonical = match target.canonicalize() {
        Ok(c) => c,
        Err(_) => {
            // Target doesn't exist yet: canonicalize the deepest existing ancestor,
            // then re-append the remaining (non-existent) path tail.
            let mut existing = target.clone();
            let mut tail: Vec<std::ffi::OsString> = Vec::new();
            while !existing.exists() {
                match existing.file_name() {
                    Some(name) => {
                        tail.push(name.to_os_string());
                        existing = match existing.parent() {
                            Some(p) => p.to_path_buf(),
                            None => return Err("Invalid path".to_string()),
                        };
                    }
                    None => break,
                }
            }
            let mut resolved = existing
                .canonicalize()
                .map_err(|e| format!("Invalid path: {}", e))?;
            for name in tail.iter().rev() {
                resolved.push(name);
            }
            resolved
        }
    };

    if canonical == *base || canonical.starts_with(base) {
        Ok(canonical)
    } else {
        Err("Directory traversal escape blocked!".to_string())
    }
}

fn sanitize_path(workspace: &str, relative_path: &str) -> Result<PathBuf, String> {
    let base = Path::new(workspace)
        .canonicalize()
        .map_err(|e| format!("Invalid workspace root: {}", e))?;

    if relative_path.is_empty() || relative_path == "." {
        return Ok(base);
    }
    safe_join(&base, relative_path)
}

#[tauri::command]
pub async fn files_open_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .pick_file(move |file| {
            let _ = tx.send(file);
        });
    let picked = rx.await.map_err(|e| e.to_string())?;
    Ok(picked
        .and_then(|p| p.into_path().ok())
        .map(|pb| pb.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn files_list(workspace_path: String) -> Result<Vec<Value>, String> {
    let root = match Path::new(&workspace_path).canonicalize() {
        Ok(r) => r,
        Err(_) => return Ok(vec![]),
    };
    if !root.exists() {
        return Ok(vec![]);
    }

    let mut flat_list = Vec::new();
    
    fn scan_dir(dir_path: &Path, prefix: &str, flat_list: &mut Vec<Value>) -> Result<(), String> {
        let entries = std::fs::read_dir(dir_path).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            let rel_path = if prefix.is_empty() {
                name.clone()
            } else {
                format!("{}/{}", prefix, name)
            };
            
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            if metadata.is_dir() {
                flat_list.push(json!({
                    "name": name,
                    "path": rel_path,
                    "type": "directory"
                }));
                scan_dir(&path, &rel_path, flat_list)?;
            } else if name.ends_with(".md") {
                let modified = metadata.modified()
                    .map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0))
                    .unwrap_or(0.0);
                
                flat_list.push(json!({
                    "name": name.strip_suffix(".md").unwrap_or(&name),
                    "path": rel_path,
                    "type": "file",
                    "modified": modified
                }));
            }
        }
        Ok(())
    }

    scan_dir(&root, "", &mut flat_list)?;

    fn build_tree_recursive(parent_path: &str, flat_list: &[Value]) -> Vec<Value> {
        let mut children = Vec::new();
        let parent_parts_len = if parent_path.is_empty() { 0 } else { parent_path.split('/').count() };
        
        for item in flat_list {
            let path_str = item.get("path").and_then(|p| p.as_str()).unwrap_or("");
            let parts: Vec<&str> = path_str.split('/').collect();
            
            if parts.len() == parent_parts_len + 1 {
                let is_child = if parent_path.is_empty() {
                    true
                } else {
                    path_str.starts_with(parent_path) && path_str.chars().nth(parent_path.len()) == Some('/')
                };
                
                if is_child {
                    let mut node = item.clone();
                    if node.get("type").and_then(|t| t.as_str()) == Some("directory") {
                        node.as_object_mut().unwrap().insert("children".to_string(), json!(build_tree_recursive(path_str, flat_list)));
                    }
                    children.push(node);
                }
            }
        }
        
        children.sort_by(|a, b| {
            let a_dir = a.get("type").and_then(|t| t.as_str()) == Some("directory");
            let b_dir = b.get("type").and_then(|t| t.as_str()) == Some("directory");
            if a_dir != b_dir {
                b_dir.cmp(&a_dir)
            } else {
                let a_name = a.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let b_name = b.get("name").and_then(|n| n.as_str()).unwrap_or("");
                a_name.to_lowercase().cmp(&b_name.to_lowercase())
            }
        });
        children
    }

    let result_tree = build_tree_recursive("", &flat_list);
    Ok(result_tree)
}

#[tauri::command]
pub fn files_tree(workspace_path: String, opts: Option<Value>) -> Result<Value, String> {
    let root = match Path::new(&workspace_path).canonicalize() {
        Ok(r) => r,
        Err(e) => return Ok(json!({ "entries": [], "truncated": false, "error": e.to_string() })),
    };
    let opts_val = opts.unwrap_or(json!({}));
    let max_depth = opts_val.get("maxDepth").and_then(|d| d.as_u64()).unwrap_or(3) as usize;
    let max_entries = opts_val.get("maxEntries").and_then(|d| d.as_u64()).unwrap_or(500) as usize;
    
    let mut entries = Vec::new();
    let mut truncated = false;
    
    let ignore_set: std::collections::HashSet<&str> = [
        ".git", "node_modules", ".canonic", ".DS_Store", "dist", "build", ".next", ".cache", ".venv", "__pycache__"
    ].iter().cloned().collect();

    #[allow(clippy::too_many_arguments)]
    fn walk(
        abs_dir: &Path, 
        rel_dir: &str, 
        depth: usize, 
        max_depth: usize, 
        max_entries: usize,
        ignore_set: &std::collections::HashSet<&str>,
        entries: &mut Vec<Value>, 
        truncated: &mut bool
    ) {
        if *truncated { return; }
        if depth > max_depth { return; }
        
        let read_dir = match std::fs::read_dir(abs_dir) {
            Ok(d) => d,
            Err(_) => return,
        };
        
        let mut items = Vec::new();
        for entry in read_dir.flatten() {
            items.push(entry);
        }
        
        items.sort_by(|a, b| {
            let a_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let b_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if a_dir != b_dir {
                b_dir.cmp(&a_dir)
            } else {
                a.file_name().cmp(&b.file_name())
            }
        });

        for item in items {
            let name = item.file_name().to_string_lossy().to_string();
            if ignore_set.contains(name.as_str()) || name.starts_with('.') {
                continue;
            }
            if entries.len() >= max_entries {
                *truncated = true;
                return;
            }
            let rel = if rel_dir.is_empty() {
                name.clone()
            } else {
                format!("{}/{}", rel_dir, name)
            };
            
            let is_dir = item.file_type().map(|t| t.is_dir()).unwrap_or(false);
            entries.push(json!({
                "path": rel,
                "type": if is_dir { "dir" } else { "file" }
            }));
            
            if is_dir {
                walk(&item.path(), &rel, depth + 1, max_depth, max_entries, ignore_set, entries, truncated);
            }
        }
    }

    walk(&root, "", 1, max_depth, max_entries, &ignore_set, &mut entries, &mut truncated);
    
    Ok(json!({
        "entries": entries,
        "truncated": truncated,
        "maxDepth": max_depth
    }))
}

#[tauri::command]
pub fn files_read(workspace_path: String, file_path: String) -> Result<String, String> {
    let safe = sanitize_path(&workspace_path, &file_path)?;
    std::fs::read_to_string(safe).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn files_write(workspace_path: String, file_path: String, content: String) -> Result<(), String> {
    let safe = sanitize_path(&workspace_path, &file_path)?;
    if let Some(parent) = safe.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(safe, &content).map_err(|e| e.to_string())?;
    crate::server::push_update(&file_path, &content);
    Ok(())
}

#[tauri::command]
pub fn files_write_binary(workspace_path: String, file_path: String, buffer: Vec<u8>) -> Result<(), String> {
    let safe = sanitize_path(&workspace_path, &file_path)?;
    if let Some(parent) = safe.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(safe, buffer).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn files_delete(workspace_path: String, file_path: String) -> Result<(), String> {
    let safe = sanitize_path(&workspace_path, &file_path)?;
    if safe.is_dir() {
        std::fs::remove_dir_all(safe).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(safe).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn files_new(workspace_path: String, file_name: String) -> Result<String, String> {
    let path = if file_name.ends_with(".md") { file_name } else { format!("{}.md", file_name) };
    let safe = sanitize_path(&workspace_path, &path)?;
    if safe.exists() {
        return Err("File already exists".to_string());
    }
    if let Some(parent) = safe.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let title = Path::new(&path).file_stem().and_then(|s| s.to_str()).unwrap_or("Untitled");
    std::fs::write(&safe, format!("# {}\n", title)).map_err(|e| e.to_string())?;
    Ok(path)
}

#[tauri::command]
pub fn files_mkdir(workspace_path: String, dir_path: String) -> Result<(), String> {
    let safe = sanitize_path(&workspace_path, &dir_path)?;
    std::fs::create_dir_all(safe).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn files_rmdir(workspace_path: String, dir_path: String) -> Result<(), String> {
    let safe = sanitize_path(&workspace_path, &dir_path)?;
    std::fs::remove_dir(safe).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn files_move(workspace_path: String, old_path: String, new_path: String) -> Result<(), String> {
    let safe_old = sanitize_path(&workspace_path, &old_path)?;
    let safe_new = sanitize_path(&workspace_path, &new_path)?;
    if let Some(parent) = safe_new.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::rename(safe_old, safe_new).map_err(|e| e.to_string())
}

static ACTIVE_WATCHER: std::sync::Mutex<Option<notify::RecommendedWatcher>> = std::sync::Mutex::new(None);

fn build_index_rust(workspace_path: &str) -> serde_json::Map<String, Value> {
    let mut index = serde_json::Map::new();
    let root = Path::new(workspace_path);
    
    fn walk(dir: &Path, prefix: &str, index: &mut serde_json::Map<String, Value>, _root: &Path) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                if name.starts_with('.') || name == "node_modules" {
                    continue;
                }
                
                let rel = if prefix.is_empty() {
                    name.clone()
                } else {
                    format!("{}/{}", prefix, name)
                };
                
                if path.is_dir() {
                    walk(&path, &rel, index, _root);
                } else if name.ends_with(".md") {
                    let basename = name.trim_end_matches(".md").to_string();
                    let depth = rel.split('/').count();
                    
                    let should_insert = match index.get(&basename) {
                        None => true,
                        Some(val) => {
                            if let Some(existing_path) = val.as_str() {
                                depth < existing_path.split('/').count()
                            } else {
                                true
                            }
                        }
                    };
                    
                    if should_insert {
                        index.insert(basename, Value::String(rel));
                    }
                }
            }
        }
    }
    
    walk(root, "", &mut index, root);
    index
}

fn stop_watcher_rust() {
    if let Ok(mut lock) = ACTIVE_WATCHER.lock() {
        *lock = None;
    }
}

fn start_watcher_rust(workspace_path: String) -> Result<(), String> {
    stop_watcher_rust();
    
    let initial_index = build_index_rust(&workspace_path);
    if let Some(app) = app_handle() {
        use tauri::Emitter;
        let _ = app.emit("files:index-update", Value::Object(initial_index));
    }
    
    let path_clone = workspace_path.clone();
    let (tx, mut rx) = tokio::sync::mpsc::channel::<bool>(100);
    
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        match res {
            Ok(event) => {
                let mut git_changed = false;
                let mut should_refresh = false;
                
                for path in event.paths {
                    let path_str = path.to_string_lossy();
                    
                    if path_str.contains("node_modules") {
                        continue;
                    }
                    
                    if path_str.contains(".git") {
                        if path_str.ends_with("HEAD") || path_str.contains(".git/HEAD") || path_str.contains(".git\\HEAD") {
                            git_changed = true;
                            should_refresh = true;
                            break;
                        }
                        continue;
                    }
                    
                    if let Some(file_name) = path.file_name() {
                        if file_name.to_string_lossy().starts_with('.') {
                            continue;
                        }
                    }
                    
                    if path.is_dir() || path_str.ends_with(".md") {
                        should_refresh = true;
                    }
                }
                
                if should_refresh {
                    let _ = tx.blocking_send(git_changed);
                }
            }
            Err(e) => {
                log::error!("[watcher] notify error: {:?}", e);
            }
        }
    }).map_err(|e| format!("Failed to create watcher: {}", e))?;
    
    watcher.watch(Path::new(&workspace_path), notify::RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;
    
    if let Ok(mut lock) = ACTIVE_WATCHER.lock() {
        *lock = Some(watcher);
    }
    
    tauri::async_runtime::spawn(async move {
        let mut debounce_timer: Option<std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>>> = None;
        let mut pending_git_changed = false;
        
        loop {
            tokio::select! {
                res = rx.recv() => {
                    match res {
                        Some(git_changed) => {
                            pending_git_changed |= git_changed;
                            debounce_timer = Some(Box::pin(tokio::time::sleep(std::time::Duration::from_millis(100))));
                        }
                        None => break,
                    }
                }
                _ = async {
                    if let Some(timer) = &mut debounce_timer {
                        timer.await;
                    } else {
                        std::future::pending::<()>().await;
                    }
                } => {
                    debounce_timer = None;
                    let git_changed = pending_git_changed;
                    pending_git_changed = false;
                    
                    if let Some(app) = app_handle() {
                        use tauri::Emitter;
                        if git_changed {
                            let _ = app.emit("git:branch-updated", ());
                        } else {
                            let new_index = build_index_rust(&path_clone);
                            let _ = app.emit("files:index-update", Value::Object(new_index));
                        }
                    }
                }
            }
        }
    });
    
    Ok(())
}

#[tauri::command]
pub fn files_index() -> Result<Value, String> {
    let workspace = get_active_workspace()?;
    let index = build_index_rust(&workspace);
    Ok(Value::Object(index))
}

#[tauri::command]
pub fn files_trash_delete(workspace_path: String, item_path: String, _is_directory: bool) -> Result<Value, String> {
    let safe = sanitize_path(&workspace_path, &item_path)?;
    trash::delete(safe).map_err(|e| format!("Failed to move to trash: {}", e))?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn files_trash_list(_workspace_path: String) -> Result<Vec<Value>, String> {
    Ok(vec![])
}

#[tauri::command]
pub fn files_trash_restore(_workspace_path: String, _id: String) -> Result<Value, String> {
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn files_trash_purge(_workspace_path: String, _id: String) -> Result<bool, String> {
    Ok(true)
}

// --- Git ---
#[tauri::command]
pub fn git_commit(workspace_path: String, file_path: String, message: String) -> Result<Value, String> {
    let repo = git2::Repository::open(&workspace_path).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    
    // If file_path is specified, add it. If not, add all.
    if !file_path.is_empty() {
        index.add_path(Path::new(&file_path)).map_err(|e| e.to_string())?;
    } else {
        index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None).map_err(|e| e.to_string())?;
    }
    index.write().map_err(|e| e.to_string())?;
    
    let oid = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(oid).map_err(|e| e.to_string())?;
    
    let signature = git2::Signature::now("Canonic", "author@canonic.local").map_err(|e| e.to_string())?;
    
    // Determine parent commit (if any)
    let mut parents = Vec::new();
    if let Ok(head) = repo.head() {
        if let Ok(commit) = head.peel_to_commit() {
            parents.push(commit);
        }
    }
    
    let parent_refs: Vec<&git2::Commit> = parents.iter().collect();
    
    let new_oid = repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        &message,
        &tree,
        &parent_refs
    ).map_err(|e| e.to_string())?;
    
    Ok(json!({
        "success": true,
        "oid": new_oid.to_string()
    }))
}

#[tauri::command]
pub fn git_log(workspace_path: String, file_path: String) -> Result<Vec<Value>, String> {
    let repo = git2::Repository::open(&workspace_path).map_err(|e| e.to_string())?;
    let mut walk = repo.revwalk().map_err(|e| e.to_string())?;
    
    // Start revwalk from HEAD
    if walk.push_head().is_err() {
        return Ok(vec![]); // No commits yet
    }
    
    let filter_file = !file_path.is_empty();
    let mut list = Vec::new();
    for oid in walk.flatten() {
        if let Ok(commit) = repo.find_commit(oid) {
            let is_merge = commit.parent_count() > 1;
            let include = !filter_file || is_merge || commit_touches_path(&repo, &commit, &file_path);
            if !include {
                continue;
            }
            
            let author = commit.author();
            let author_name = author.name().unwrap_or("Unknown").to_string();
            let message = commit.message().unwrap_or("").to_string();
            let time_sec = commit.time().seconds();
            
            list.push(json!({
                "oid": oid.to_string(),
                "message": message,
                "author": author_name,
                "timestamp": time_sec * 1000 // To milliseconds
            }));
        }
    }
    Ok(list)
}


#[tauri::command]
pub fn git_branches(workspace_path: String) -> Result<Value, String> {
    let repo = git2::Repository::open(&workspace_path).map_err(|e| e.to_string())?;
    let mut branches_list = Vec::new();
    let mut current = "main".to_string();

    let branches = repo.branches(None).map_err(|e| e.to_string())?;
    for entry in branches.flatten() {
        let (branch, _) = entry;
        if let Ok(Some(name)) = branch.name() {
            branches_list.push(name.to_string());
            if branch.is_head() {
                current = name.to_string();
            }
        }
    }
    Ok(json!({ "branches": branches_list, "current": current }))
}

#[tauri::command]
pub fn git_create_branch(workspace_path: String, name: String) -> Result<Value, String> {
    let repo = git2::Repository::open(&workspace_path).map_err(|e| e.to_string())?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    repo.branch(&name, &commit, false).map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn git_checkout(workspace_path: String, name: String) -> Result<Value, String> {
    let repo = git2::Repository::open(&workspace_path).map_err(|e| e.to_string())?;
    
    // Find target commit
    let branch_ref = format!("refs/heads/{}", name);
    let obj = repo.revparse_single(&branch_ref)
        .map_err(|e| format!("Branch ref not found: {}", e))?;
    
    // Checkout tree
    let commit = obj.as_commit().ok_or("Not a commit object")?;
    let tree = commit.tree().map_err(|e| e.to_string())?;
    
    let mut checkout_builder = git2::build::CheckoutBuilder::new();
    checkout_builder.force();
    repo.checkout_tree(tree.as_object(), Some(&mut checkout_builder)).map_err(|e| e.to_string())?;
    
    // Set HEAD to point to target branch
    repo.set_head(&branch_ref).map_err(|e| e.to_string())?;
    
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn git_merge(workspace_path: String, from: String, message: String) -> Result<Value, String> {
    let repo = git2::Repository::open(&workspace_path).map_err(|e| e.to_string())?;

    let their_branch = repo
        .find_branch(&from, git2::BranchType::Local)
        .map_err(|e| format!("Branch '{}' not found: {}", from, e))?;
    let their_commit = their_branch.get().peel_to_commit().map_err(|e| e.to_string())?;
    let annotated = repo
        .reference_to_annotated_commit(their_branch.get())
        .map_err(|e| e.to_string())?;

    let (analysis, _) = repo.merge_analysis(&[&annotated]).map_err(|e| e.to_string())?;

    if analysis.is_up_to_date() {
        return Ok(json!({ "success": true, "upToDate": true }));
    }

    let head_ref = repo.head().map_err(|e| e.to_string())?;

    // Fast-forward: just move the current branch ref to their commit.
    if analysis.is_fast_forward() {
        let refname = head_ref.name().ok_or("Invalid HEAD reference")?.to_string();
        let mut r = repo.find_reference(&refname).map_err(|e| e.to_string())?;
        r.set_target(their_commit.id(), "fast-forward merge").map_err(|e| e.to_string())?;
        repo.set_head(&refname).map_err(|e| e.to_string())?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .map_err(|e| e.to_string())?;
        return Ok(json!({ "success": true, "fastForward": true }));
    }

    // True merge: produce a merge commit with two parents.
    repo.merge(&[&annotated], None, None).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    if index.has_conflicts() {
        let _ = repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()));
        let _ = repo.cleanup_state();
        return Ok(json!({ "success": false, "conflict": true, "error": "Merge conflict" }));
    }

    let tree_oid = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_oid).map_err(|e| e.to_string())?;
    let sig = git2::Signature::now("Canonic", "author@canonic.local").map_err(|e| e.to_string())?;
    let our_commit = head_ref.peel_to_commit().map_err(|e| e.to_string())?;
    let msg = if message.is_empty() {
        format!("Merge branch '{}'", from)
    } else {
        message
    };
    let merge_oid = repo
        .commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&our_commit, &their_commit])
        .map_err(|e| e.to_string())?;
    repo.cleanup_state().map_err(|e| e.to_string())?;
    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
        .map_err(|e| e.to_string())?;

    Ok(json!({ "success": true, "oid": merge_oid.to_string() }))
}

#[tauri::command]
pub fn git_diff(workspace_path: String, file_path: String, oid: Option<String>) -> Result<String, String> {
    let repo = git2::Repository::open(&workspace_path).map_err(|e| e.to_string())?;
    
    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.pathspec(file_path);

    let diff = match oid {
        Some(commit_oid) => {
            if commit_oid.is_empty() || commit_oid == "HEAD" {
                let head = repo.head().map_err(|e| e.to_string())?;
                let commit = head.peel_to_commit().map_err(|e| e.to_string())?;
                let tree = commit.tree().map_err(|e| e.to_string())?;
                repo.diff_tree_to_workdir_with_index(Some(&tree), Some(&mut diff_opts))
                    .map_err(|e| e.to_string())?
            } else {
                let oid_parsed = git2::Oid::from_str(&commit_oid).map_err(|e| e.to_string())?;
                let commit = repo.find_commit(oid_parsed).map_err(|e| e.to_string())?;
                let tree = commit.tree().map_err(|e| e.to_string())?;
                repo.diff_tree_to_workdir_with_index(Some(&tree), Some(&mut diff_opts))
                    .map_err(|e| e.to_string())?
            }
        },
        None => {
            repo.diff_index_to_workdir(None, Some(&mut diff_opts)).map_err(|e| e.to_string())?
        }
    };

    let mut diff_str = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        let content = std::str::from_utf8(line.content()).unwrap_or("");
        match origin {
            '+' | '-' | ' ' => diff_str.push_str(&format!("{}{}", origin, content)),
            _ => {}
        }
        true
    }).map_err(|e| e.to_string())?;

    Ok(diff_str)
}

/// Diff what a single commit introduced for a file: parent blob (before) vs this
/// commit's blob (after). Root commit → before is empty. Reused by MCP get_doc_changes.
pub fn commit_diff_internal(workspace_path: &str, file_path: &str, oid: &str) -> (String, String) {
    let after = git_read_commit_internal(workspace_path, file_path, oid).unwrap_or_default();
    let before = (|| -> Option<String> {
        let repo = git2::Repository::open(workspace_path).ok()?;
        let oid_parsed = git2::Oid::from_str(oid).ok()?;
        let commit = repo.find_commit(oid_parsed).ok()?;
        let parent = commit.parent(0).ok()?;
        git_read_commit_internal(workspace_path, file_path, &parent.id().to_string()).ok()
    })()
    .unwrap_or_default();
    (before, after)
}

#[tauri::command]
pub fn git_commit_diff(workspace_path: String, file_path: String, oid: Option<String>) -> Result<Value, String> {
    let oid = match oid {
        Some(o) if !o.is_empty() && o != "HEAD" => o,
        _ => {
            // No explicit oid → diff HEAD commit's blob vs its parent.
            let head_oid = (|| -> Option<String> {
                let repo = git2::Repository::open(&workspace_path).ok()?;
                let commit = repo.head().ok()?.peel_to_commit().ok()?;
                Some(commit.id().to_string())
            })();
            match head_oid {
                Some(o) => o,
                None => return Ok(json!({ "before": "", "after": "" })),
            }
        }
    };
    let (before, after) = commit_diff_internal(&workspace_path, &file_path, &oid);
    Ok(json!({ "before": before, "after": after }))
}

pub fn git_read_commit_internal(workspace_path: &str, file_path: &str, oid: &str) -> Result<String, String> {
    let repo = git2::Repository::open(workspace_path).map_err(|e| e.to_string())?;
    let oid_parsed = git2::Oid::from_str(oid).map_err(|e| e.to_string())?;
    let commit = repo.find_commit(oid_parsed).map_err(|e| e.to_string())?;
    let tree = commit.tree().map_err(|e| e.to_string())?;
    
    let entry = tree.get_path(Path::new(file_path)).map_err(|e| e.to_string())?;
    let obj = entry.to_object(&repo).map_err(|e| e.to_string())?;
    let blob = obj.as_blob().ok_or("Object is not a blob")?;
    
    let content = std::str::from_utf8(blob.content()).map_err(|e| e.to_string())?.to_string();
    Ok(content)
}

#[tauri::command]
pub fn git_read_commit(workspace_path: String, file_path: String, oid: String) -> Result<String, String> {
    git_read_commit_internal(&workspace_path, &file_path, &oid)
}

#[tauri::command]
pub fn git_status(workspace_path: String) -> Result<Vec<Value>, String> {
    let repo = match git2::Repository::open(&workspace_path) {
        Ok(r) => r,
        Err(_) => return Ok(vec![]),
    };
    let mut status_opts = git2::StatusOptions::new();
    status_opts.include_untracked(true).recurse_untracked_dirs(true);
    let statuses = repo.statuses(Some(&mut status_opts)).map_err(|e| e.to_string())?;
    
    let mut list = Vec::new();
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let status = entry.status();
        let mut type_str = "untracked";
        if status.is_index_new() || status.is_wt_new() {
            type_str = "added";
        } else if status.is_index_modified() || status.is_wt_modified() {
            type_str = "modified";
        } else if status.is_index_deleted() || status.is_wt_deleted() {
            type_str = "deleted";
        }
        
        list.push(json!({
            "path": path,
            "type": type_str,
            "isUncommitted": true
        }));
    }
    Ok(list)
}

#[tauri::command]
pub fn git_delete_branch(workspace_path: String, name: String) -> Result<Value, String> {
    let repo = git2::Repository::open(&workspace_path).map_err(|e| e.to_string())?;
    let mut branch = repo.find_branch(&name, git2::BranchType::Local).map_err(|e| e.to_string())?;
    branch.delete().map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

fn commit_touches_path(_repo: &git2::Repository, commit: &git2::Commit, path: &str) -> bool {
    let path_buf = Path::new(path);
    let current_oid = commit
        .tree()
        .ok()
        .and_then(|t| t.get_path(path_buf).ok())
        .map(|entry| entry.id());
        
    if current_oid.is_none() {
        // If the path doesn't exist in the current commit, check if it did exist in any parent.
        for parent in commit.parents() {
            let parent_exists = parent
                .tree()
                .ok()
                .and_then(|t| t.get_path(path_buf).ok())
                .is_some();
            if parent_exists {
                return true; // Deleted in this commit
            }
        }
        return false;
    }
    
    // First commit - file exists, so it was added in this commit
    if commit.parent_count() == 0 {
        return true;
    }
    
    // Check if the OID differs from any parent's tree OID
    for parent in commit.parents() {
        let parent_oid = parent
            .tree()
            .ok()
            .and_then(|t| t.get_path(path_buf).ok())
            .map(|entry| entry.id());
            
        if parent_oid != current_oid {
            return true;
        }
    }
    
    false
}


fn commit_to_json(commit: &git2::Commit) -> Value {
    let parents: Vec<String> = commit.parents().map(|p| p.id().to_string()).collect();
    json!({
        "oid": commit.id().to_string(),
        "message": commit.message().unwrap_or("").trim(),
        "author": commit.author().name().unwrap_or("Unknown"),
        "timestamp": commit.time().seconds() * 1000,
        "parents": parents,
        "isMerge": commit.parent_count() > 1,
        "branchTips": []
    })
}

#[tauri::command]
pub fn git_log_all(workspace_path: String, file_path: String, branch_list: Vec<String>) -> Result<Vec<Value>, String> {
    let repo = git2::Repository::open(&workspace_path).map_err(|e| e.to_string())?;
    let mut all: std::collections::HashMap<String, Value> = std::collections::HashMap::new();
    let mut branch_tips: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let filter_file = !file_path.is_empty();

    for branch in &branch_list {
        let mut revwalk = match repo.revwalk() {
            Ok(r) => r,
            Err(_) => continue,
        };
        if revwalk.push_ref(&format!("refs/heads/{}", branch)).is_err() {
            continue;
        }
        let mut tip_for_branch: Option<String> = None;
        for oid_res in revwalk {
            let oid = match oid_res {
                Ok(o) => o,
                Err(_) => continue,
            };
            let commit = match repo.find_commit(oid) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let is_merge = commit.parent_count() > 1;
            // Always keep merges; otherwise require the file to exist at that commit.
            let include = !filter_file || is_merge || commit_touches_path(&repo, &commit, &file_path);
            if !include {
                continue;
            }
            let key = oid.to_string();
            if tip_for_branch.is_none() {
                tip_for_branch = Some(key.clone());
            }
            all.entry(key).or_insert_with(|| commit_to_json(&commit));
        }
        if let Some(tip) = tip_for_branch {
            branch_tips.insert(branch.clone(), tip);
        }
    }

    // Fallback: no named branches matched (e.g. detached HEAD) — walk HEAD directly.
    if all.is_empty() {
        if let Ok(mut revwalk) = repo.revwalk() {
            if revwalk.push_head().is_ok() {
                for oid in revwalk.flatten() {
                    if let Ok(commit) = repo.find_commit(oid) {
                        let is_merge = commit.parent_count() > 1;
                        let include =
                            !filter_file || is_merge || commit_touches_path(&repo, &commit, &file_path);
                        if !include {
                            continue;
                        }
                        all.entry(oid.to_string()).or_insert_with(|| commit_to_json(&commit));
                    }
                }
            }
        }
    }

    for (branch, tip) in &branch_tips {
        if let Some(v) = all.get_mut(tip) {
            if let Some(arr) = v.get_mut("branchTips").and_then(|x| x.as_array_mut()) {
                arr.push(json!(branch));
            }
        }
    }

    let mut list: Vec<Value> = all.into_values().collect();
    list.sort_by(|a, b| {
        let ta = a.get("timestamp").and_then(|t| t.as_i64()).unwrap_or(0);
        let tb = b.get("timestamp").and_then(|t| t.as_i64()).unwrap_or(0);
        tb.cmp(&ta)
    });
    Ok(list)
}

#[tauri::command]
pub fn git_file_status(workspace_path: String, file_path: String) -> Result<Value, String> {
    let repo = git2::Repository::open(&workspace_path).map_err(|e| e.to_string())?;
    let status = repo.status_file(Path::new(&file_path)).unwrap_or(git2::Status::empty());
    
    let is_uncommitted = status.contains(git2::Status::WT_MODIFIED) || 
                         status.contains(git2::Status::INDEX_MODIFIED) ||
                         status.contains(git2::Status::WT_NEW) ||
                         status.contains(git2::Status::INDEX_NEW);
                         
    Ok(json!({ "isUncommitted": is_uncommitted }))
}

#[tauri::command]
pub fn git_is_file_tracked(workspace_path: String, file_path: String) -> Result<bool, String> {
    let repo = git2::Repository::open(&workspace_path).map_err(|e| e.to_string())?;
    let status = repo.status_file(Path::new(&file_path)).unwrap_or(git2::Status::empty());
    let is_ignored = status.contains(git2::Status::IGNORED);
    let is_untracked = status.contains(git2::Status::WT_NEW);
    Ok(!is_ignored && !is_untracked)
}

fn get_comments_file(doc_id: &str) -> PathBuf {
    let sanitized: String = doc_id.chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '_' || c == '-' { c } else { '_' })
        .collect();
    get_config_dir().join("comments").join(format!("{}.json", sanitized))
}

/// Path to the JSON file backing a doc's comments. Exposed so the LAN share server
/// (server.rs) writes browser-posted comments to the exact file the app reads, using the
/// same sanitization and honoring `CANONIC_CONFIG_DIR` (the server previously hardcoded
/// `~/.config/canonic`, which diverged when that env var was set).
pub fn comments_file_path(doc_id: &str) -> PathBuf {
    get_comments_file(doc_id)
}

// --- Comments ---
#[tauri::command]
pub fn comments_get(doc_id: String) -> Result<Vec<Value>, String> {
    let p = get_comments_file(&doc_id);
    if !p.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
    let comments: Vec<Value> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(comments)
}

#[tauri::command]
pub fn comments_save(doc_id: String, comments: Vec<Value>) -> Result<(), String> {
    let p = get_comments_file(&doc_id);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&comments).map_err(|e| e.to_string())?;
    std::fs::write(p, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn comments_move(old_id: String, new_id: String) -> Result<(), String> {
    let old_file = get_comments_file(&old_id);
    let new_file = get_comments_file(&new_id);
    if old_file.exists() {
        if let Some(parent) = new_file.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::rename(old_file, new_file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// --- Search (port of electron/search.js: file-backed inverted index) ---
fn search_store() -> &'static std::sync::Mutex<std::collections::HashMap<String, Value>> {
    static S: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, Value>>> =
        std::sync::OnceLock::new();
    S.get_or_init(|| {
        let mut map = std::collections::HashMap::new();
        let p = get_config_dir().join("search-index.json");
        if let Ok(content) = std::fs::read_to_string(&p) {
            if let Ok(Value::Object(obj)) = serde_json::from_str::<Value>(&content) {
                for (k, v) in obj {
                    map.insert(k, v);
                }
            }
        }
        std::sync::Mutex::new(map)
    })
}

fn save_search_store(map: &std::collections::HashMap<String, Value>) {
    let dir = get_config_dir();
    let _ = std::fs::create_dir_all(&dir);
    let obj: serde_json::Map<String, Value> = map.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
    if let Ok(content) = serde_json::to_string(&Value::Object(obj)) {
        let _ = std::fs::write(dir.join("search-index.json"), content);
    }
}

fn safe_byte_slice(s: &str, start: usize, end: usize) -> String {
    let len = s.len();
    let mut start = start.min(len);
    let mut end = end.min(len);
    while start < len && !s.is_char_boundary(start) {
        start += 1;
    }
    while end < len && !s.is_char_boundary(end) {
        end += 1;
    }
    if start >= end {
        return String::new();
    }
    s[start..end].to_string()
}

fn highlight_term(text: &str, term: &str) -> String {
    let pat = regex::escape(term);
    match regex::RegexBuilder::new(&format!("({})", pat))
        .case_insensitive(true)
        .build()
    {
        Ok(re) => re.replace_all(text, "<mark>$1</mark>").to_string(),
        Err(_) => text.to_string(),
    }
}

#[tauri::command]
pub fn search_index(workspace_path: String, file_path: String, content: String) -> Result<bool, String> {
    let key = format!("{}::{}", workspace_path, file_path);
    let title = Path::new(&file_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    let mut map = search_store().lock().map_err(|e| e.to_string())?;
    map.insert(
        key,
        json!({
            "filePath": file_path,
            "workspace": workspace_path,
            "title": title,
            "content": content,
            "source": workspace_path
        }),
    );
    save_search_store(&map);
    Ok(true)
}

#[tauri::command]
pub fn search_query(query: String, workspace_path: String) -> Result<Vec<Value>, String> {
    if query.trim().len() < 2 {
        return Ok(vec![]);
    }
    let terms: Vec<String> = query.to_lowercase().split_whitespace().map(|s| s.to_string()).collect();
    let map = search_store().lock().map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for doc in map.values() {
        let title = doc.get("title").and_then(|t| t.as_str()).unwrap_or("");
        let content = doc.get("content").and_then(|c| c.as_str()).unwrap_or("");
        let workspace = doc.get("workspace").and_then(|w| w.as_str()).unwrap_or("");
        let file_path = doc.get("filePath").and_then(|f| f.as_str()).unwrap_or("");

        let haystack = format!("{} {}", title, content).to_lowercase();
        let score = terms.iter().filter(|t| haystack.contains(t.as_str())).count();
        if score == 0 {
            continue;
        }

        let idx = terms
            .iter()
            .find(|t| haystack.contains(t.as_str()))
            .and_then(|t| haystack.find(t.as_str()))
            .unwrap_or(0);
        let start = idx.saturating_sub(60);
        let end = (idx + 120).min(content.len());
        let mut excerpt = safe_byte_slice(content, start, end).replace('\n', " ").trim().to_string();
        for term in &terms {
            excerpt = highlight_term(&excerpt, term);
        }
        let prefix = if start > 0 { "…" } else { "" };
        let suffix = if end < content.len() { "…" } else { "" };

        results.push(json!({
            "filePath": file_path,
            "workspace": workspace,
            "title": title,
            "excerpt": format!("{}{}{}", prefix, excerpt, suffix),
            "isOwn": workspace == workspace_path,
            "score": score
        }));
    }

    let mut filtered: Vec<Value> = if workspace_path.is_empty() {
        results
    } else {
        results
            .into_iter()
            .filter(|r| r.get("workspace").and_then(|w| w.as_str()) == Some(workspace_path.as_str()))
            .collect()
    };
    filtered.sort_by(|a, b| {
        let sa = a.get("score").and_then(|s| s.as_u64()).unwrap_or(0);
        let sb = b.get("score").and_then(|s| s.as_u64()).unwrap_or(0);
        sb.cmp(&sa)
    });
    filtered.truncate(20);
    Ok(filtered)
}

// --- Workspace find & replace (port of electron/workspace-search.js) ---
fn ws_search_skip_dirs() -> std::collections::HashSet<&'static str> {
    [".git", "node_modules", ".canonic", "assets", "dist", "build", ".next", ".cache"]
        .iter()
        .cloned()
        .collect()
}

fn is_text_file(file_path: &str) -> bool {
    let ext = Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    matches!(
        ext.as_str(),
        "md" | "markdown" | "txt" | "json" | "js" | "ts" | "jsx" | "tsx" | "vue" | "css" | "html"
            | "yaml" | "yml" | "toml" | "sh" | "py" | "rb" | "go" | "rs" | "java" | "c" | "cpp"
            | "h" | "hpp"
    )
}

fn glob_to_regex(glob: &str) -> Option<regex::Regex> {
    if glob.is_empty() {
        return None;
    }
    let chars: Vec<char> = glob.chars().collect();
    let mut re = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '*' {
            if i + 1 < chars.len() && chars[i + 1] == '*' {
                re.push_str(".*");
                i += 2;
                if i < chars.len() && chars[i] == '/' {
                    i += 1;
                }
            } else {
                re.push_str("[^/]*");
                i += 1;
            }
        } else if c == '?' {
            re.push_str("[^/]");
            i += 1;
        } else if "/.()+|^$[]{}".contains(c) {
            re.push('\\');
            re.push(c);
            i += 1;
        } else {
            re.push(c);
            i += 1;
        }
    }
    regex::Regex::new(&format!("^{}$", re)).ok()
}

fn matches_glob(file_path: &str, glob: &str) -> bool {
    if glob.is_empty() {
        return true;
    }
    glob.split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .any(|p| {
            if let Some(re) = glob_to_regex(p) {
                if re.is_match(file_path) {
                    return true;
                }
                let base = Path::new(file_path).file_name().and_then(|f| f.to_str()).unwrap_or("");
                re.is_match(base)
            } else {
                false
            }
        })
}

fn build_search_regex(query: &str, opts: &Value) -> Result<regex::Regex, String> {
    let is_regex = opts.get("regex").and_then(|v| v.as_bool()).unwrap_or(false);
    let word = opts.get("word").and_then(|v| v.as_bool()).unwrap_or(false);
    let case = opts.get("case").and_then(|v| v.as_bool()).unwrap_or(false);
    let mut pattern = if is_regex { query.to_string() } else { regex::escape(query) };
    if word {
        pattern = format!("\\b(?:{})\\b", pattern);
    }
    regex::RegexBuilder::new(&pattern)
        .case_insensitive(!case)
        .build()
        .map_err(|e| format!("Invalid regex: {}", e))
}

fn find_matches_in_text(text: &str, re: &regex::Regex) -> Vec<Value> {
    let mut matches = Vec::new();
    for (i, line) in text.split('\n').enumerate() {
        for m in re.find_iter(line) {
            if m.as_str().is_empty() {
                continue;
            }
            matches.push(json!({
                "line": i + 1,
                "col": m.start(),
                "text": line,
                "length": m.end() - m.start()
            }));
        }
    }
    matches
}

fn ws_walk(root: &Path) -> Vec<String> {
    let skip = ws_search_skip_dirs();
    let mut out = Vec::new();
    fn recurse(root: &Path, rel: &str, skip: &std::collections::HashSet<&str>, out: &mut Vec<String>) {
        let dir = if rel.is_empty() { root.to_path_buf() } else { root.join(rel) };
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let rel_path = if rel.is_empty() { name.clone() } else { format!("{}/{}", rel, name) };
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                if skip.contains(name.as_str()) {
                    continue;
                }
                recurse(root, &rel_path, skip, out);
            } else if is_text_file(&name) {
                out.push(rel_path);
            }
        }
    }
    recurse(root, "", &skip, &mut out);
    out
}

#[tauri::command]
pub fn search_workspace(params: Value) -> Result<Value, String> {
    let workspace_path = params.get("workspacePath").and_then(|w| w.as_str()).unwrap_or("").to_string();
    let query = params.get("query").and_then(|q| q.as_str()).unwrap_or("").to_string();
    if query.is_empty() {
        return Ok(json!({ "branch": [], "other": [] }));
    }
    let opts = params.get("opts").cloned().unwrap_or_else(|| json!({}));
    let include = params.get("include").and_then(|s| s.as_str()).unwrap_or("").to_string();
    let exclude = params.get("exclude").and_then(|s| s.as_str()).unwrap_or("").to_string();
    let all_branches = params.get("allBranches").and_then(|b| b.as_bool()).unwrap_or(false);

    let re = match build_search_regex(&query, &opts) {
        Ok(r) => r,
        Err(e) => return Ok(json!({ "branch": [], "other": [], "error": e })),
    };

    // Current branch: scan the working tree.
    let mut branch_results = Vec::new();
    if !workspace_path.is_empty() && Path::new(&workspace_path).exists() {
        for file_path in ws_walk(Path::new(&workspace_path)) {
            if !include.is_empty() && !matches_glob(&file_path, &include) {
                continue;
            }
            if !exclude.is_empty() && matches_glob(&file_path, &exclude) {
                continue;
            }
            let content = match std::fs::read_to_string(Path::new(&workspace_path).join(&file_path)) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let matches = find_matches_in_text(&content, &re);
            if !matches.is_empty() {
                branch_results.push(json!({ "filePath": file_path, "branch": "current", "matches": matches }));
            }
        }
    }

    // Other branches: walk each branch's tip tree via git2.
    let mut other_results = Vec::new();
    if all_branches && Path::new(&workspace_path).join(".git").exists() {
        if let Ok(repo) = git2::Repository::open(&workspace_path) {
            let current = repo.head().ok().and_then(|h| h.shorthand().map(|s| s.to_string()));
            let mut others = Vec::new();
            if let Ok(branches) = repo.branches(Some(git2::BranchType::Local)) {
                for entry in branches.flatten() {
                    if let Ok(Some(name)) = entry.0.name() {
                        if Some(name.to_string()) != current {
                            others.push(name.to_string());
                        }
                    }
                }
            }
            for branch in others.into_iter().take(10) {
                let tree = repo
                    .find_branch(&branch, git2::BranchType::Local)
                    .ok()
                    .and_then(|b| b.get().peel_to_commit().ok())
                    .and_then(|c| c.tree().ok());
                let tree = match tree {
                    Some(t) => t,
                    None => continue,
                };
                tree.walk(git2::TreeWalkMode::PreOrder, |dir, entry| {
                    let name = entry.name().unwrap_or("");
                    let file_path = format!("{}{}", dir, name);
                    if entry.kind() == Some(git2::ObjectType::Blob) && is_text_file(&file_path) {
                        let pass_include = include.is_empty() || matches_glob(&file_path, &include);
                        let pass_exclude = exclude.is_empty() || !matches_glob(&file_path, &exclude);
                        if pass_include && pass_exclude {
                            if let Ok(obj) = entry.to_object(&repo) {
                                if let Some(blob) = obj.as_blob() {
                                    let content = String::from_utf8_lossy(blob.content());
                                    let matches = find_matches_in_text(&content, &re);
                                    if !matches.is_empty() {
                                        other_results.push(json!({ "filePath": file_path, "branch": branch, "matches": matches }));
                                    }
                                }
                            }
                        }
                    }
                    git2::TreeWalkResult::Ok
                })
                .ok();
            }
        }
    }

    Ok(json!({ "branch": branch_results, "other": other_results }))
}

#[tauri::command]
pub fn search_workspace_replace(params: Value) -> Result<String, String> {
    let content = params.get("content").and_then(|c| c.as_str()).unwrap_or("").to_string();
    let query = params.get("query").and_then(|q| q.as_str()).unwrap_or("");
    if query.is_empty() {
        return Ok(content);
    }
    let replacement = params.get("replacement").and_then(|r| r.as_str()).unwrap_or("");
    let opts = params.get("opts").cloned().unwrap_or_else(|| json!({}));
    let re = match build_search_regex(query, &opts) {
        Ok(r) => r,
        Err(_) => return Ok(content),
    };
    Ok(re.replace_all(&content, replacement).to_string())
}

// --- Sharing ---
#[tauri::command]
pub fn share_start(workspace_path: String, file_path: String, options: Option<Value>) -> Result<Value, String> {
    let permission = options.as_ref().and_then(|o| o.get("permission").and_then(|p| p.as_str())).unwrap_or("view").to_string();
    let scope = options.as_ref().and_then(|o| o.get("scope").and_then(|s| s.as_str())).unwrap_or("file").to_string();
    let tagged_only = options.as_ref().and_then(|o| o.get("taggedOnly").and_then(|t| t.as_bool())).unwrap_or(false);

    let workspaces = vec![crate::server::WorkspaceConfig {
        name: "Workspace".to_string(),
        path: workspace_path,
    }];
    let excluded_paths = options.as_ref()
        .and_then(|o| o.get("excludedPaths").and_then(|e| e.as_array()))
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let share = crate::server::start_sharing_server(
        file_path.clone(),
        scope,
        permission.clone(),
        workspaces,
        excluded_paths,
        tagged_only,
    )?;

    // Announce via mDNS
    let author = std::env::var("USER").unwrap_or_else(|_| "Author".to_string());
    let _ = crate::discovery::announce_share(
        share.port,
        share.token.clone(),
        share.scope.clone(),
        permission,
        author,
        tagged_only,
    );

    Ok(json!({
        "success": true,
        "token": share.token,
        "localUrl": share.local_url,
        "port": share.port,
        "reads": 0
    }))
}

#[tauri::command]
pub fn share_stop(file_path: String) -> Result<Value, String> {
    match crate::server::stop_sharing_server(&file_path) {
        Ok(port) => {
            let _ = crate::discovery::unannounce_share(port);
            Ok(json!({ "success": true }))
        }
        Err(e) => Ok(json!({ "success": false, "error": e })),
    }
}

#[tauri::command]
pub fn share_open_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn share_open_shared(url: String, token: String) -> Result<Value, String> {
    let mut target_url = url;
    if !target_url.contains("token=") {
        if target_url.contains('?') {
            target_url.push_str(&format!("&token={}", token));
        } else {
            target_url.push_str(&format!("?token={}", token));
        }
    }

    let client = reqwest::Client::new();
    let res = client.get(&target_url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("HTTP error status: {}", res.status()));
    }

    let val = res.json::<Value>().await.map_err(|e| format!("Failed to parse response: {}", e))?;
    Ok(json!({
        "success": true,
        "content": val.get("content").unwrap_or(&json!("")),
        "comments": val.get("comments").unwrap_or(&json!([]))
    }))
}

#[tauri::command]
pub fn share_stats(file_path: String) -> Result<Value, String> {
    if let Ok(shares) = crate::server::active_shares().get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new())).lock() {
        if let Some(share) = shares.get(&file_path) {
            let reads = share.reads.load(std::sync::atomic::Ordering::Relaxed);
            return Ok(json!({ "reads": reads, "connected": 0 }));
        }
    }
    Ok(json!({ "reads": 0, "connected": 0 }))
}

#[tauri::command]
pub fn share_start_workspace(workspace_path: String, options: Option<Value>) -> Result<Value, String> {
    let key = "__workspace__".to_string();
    let permission = options.as_ref().and_then(|o| o.get("permission").and_then(|p| p.as_str())).unwrap_or("view").to_string();
    let scope = "workspace".to_string();
    let tagged_only = options.as_ref().and_then(|o| o.get("taggedOnly").and_then(|t| t.as_bool())).unwrap_or(false);

    let workspaces = vec![crate::server::WorkspaceConfig {
        name: "Workspace".to_string(),
        path: workspace_path,
    }];
    let excluded_paths = options.as_ref()
        .and_then(|o| o.get("excludedPaths").and_then(|e| e.as_array()))
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let share = crate::server::start_sharing_server(
        key,
        scope,
        permission.clone(),
        workspaces,
        excluded_paths,
        tagged_only,
    )?;

    let author = std::env::var("USER").unwrap_or_else(|_| "Author".to_string());
    let _ = crate::discovery::announce_share(
        share.port,
        share.token.clone(),
        share.scope.clone(),
        permission,
        author,
        tagged_only,
    );

    Ok(json!({
        "success": true,
        "token": share.token,
        "localUrl": share.local_url,
        "port": share.port,
        "reads": 0
    }))
}

#[tauri::command]
pub fn share_start_all_workspaces(workspaces: Vec<Value>, options: Option<Value>) -> Result<Value, String> {
    let key = "__all_workspaces__".to_string();
    let permission = options.as_ref().and_then(|o| o.get("permission").and_then(|p| p.as_str())).unwrap_or("view").to_string();
    let scope = "all-workspaces".to_string();
    let tagged_only = options.as_ref().and_then(|o| o.get("taggedOnly").and_then(|t| t.as_bool())).unwrap_or(false);

    let mut ws_configs = Vec::new();
    for ws in workspaces {
        if let (Some(name), Some(path)) = (ws.get("name").and_then(|n| n.as_str()), ws.get("path").and_then(|p| p.as_str())) {
            ws_configs.push(crate::server::WorkspaceConfig {
                name: name.to_string(),
                path: path.to_string(),
            });
        }
    }
    let excluded_paths = options.as_ref()
        .and_then(|o| o.get("excludedPaths").and_then(|e| e.as_array()))
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let share = crate::server::start_sharing_server(
        key,
        scope,
        permission.clone(),
        ws_configs,
        excluded_paths,
        tagged_only,
    )?;

    let author = std::env::var("USER").unwrap_or_else(|_| "Author".to_string());
    let _ = crate::discovery::announce_share(
        share.port,
        share.token.clone(),
        share.scope.clone(),
        permission,
        author,
        tagged_only,
    );

    Ok(json!({
        "success": true,
        "token": share.token,
        "localUrl": share.local_url,
        "port": share.port,
        "reads": 0
    }))
}

#[tauri::command]
pub fn share_stop_workspace(key: String) -> Result<Value, String> {
    match crate::server::stop_sharing_server(&key) {
        Ok(port) => {
            let _ = crate::discovery::unannounce_share(port);
            Ok(json!({ "success": true }))
        }
        Err(e) => Ok(json!({ "success": false, "error": e })),
    }
}

#[tauri::command]
pub fn share_workspace_stats() -> Result<Value, String> {
    let mut stats = serde_json::Map::new();
    if let Ok(shares) = crate::server::active_shares().get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new())).lock() {
        for (key, share) in shares.iter() {
            let reads = share.reads.load(std::sync::atomic::Ordering::Relaxed);
            stats.insert(key.clone(), json!({ "reads": reads, "connected": 0 }));
        }
    }
    Ok(Value::Object(stats))
}

#[tauri::command]
pub fn share_list_active() -> Result<Vec<Value>, String> {
    let mut list = Vec::new();
    if let Ok(shares) = crate::server::active_shares().get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new())).lock() {
        for (key, share) in shares.iter() {
            list.push(json!({
                "key": key,
                "port": share.port,
                "token": share.token,
                "scope": share.scope,
                "permission": share.permission
            }));
        }
    }
    Ok(list)
}

// --- Peers ---
fn get_peers_file() -> PathBuf {
    get_config_dir().join("peers.json")
}

fn read_peers() -> Vec<Value> {
    let p = get_peers_file();
    if !p.exists() {
        return vec![];
    }
    std::fs::read_to_string(p)
        .ok()
        .and_then(|c| serde_json::from_str::<Vec<Value>>(&c).ok())
        .unwrap_or_default()
}

fn write_peers(peers: &Vec<Value>) {
    let p = get_peers_file();
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string_pretty(peers) {
        let _ = std::fs::write(p, content);
    }
}

pub fn discovered_peers() -> &'static std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, Value>>> {
    static PEERS: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, Value>>> = std::sync::OnceLock::new();
    &PEERS
}

/// Called by discovery.rs when a peer resolves, so peers_fetch_manifest / peers_open_file
/// (which look peers up here) can reach them.
pub fn register_discovered_peer(id: String, peer: Value) {
    let cell = discovered_peers();
    let lock = cell.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    if let Ok(mut m) = lock.lock() {
        m.insert(id, peer);
    }
}

pub fn unregister_discovered_peer(id: &str) {
    let cell = discovered_peers();
    let lock = cell.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    if let Ok(mut m) = lock.lock() {
        m.remove(id);
    }
}

fn list_discovered_peers() -> Vec<Value> {
    let cell = discovered_peers();
    let lock = cell.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    lock.lock().map(|m| m.values().cloned().collect()).unwrap_or_default()
}

/// Background flush of locally-queued peer comments (port of electron/comment-sync.js).
/// Comments queued under ~/.config/canonic/comments/peers/<author>/<doc>.json are POSTed
/// to that peer's /comments endpoint when the peer is online, then marked synced.
async fn flush_peer_comments() {
    let dir = get_config_dir().join("comments").join("peers");
    if !dir.exists() {
        return;
    }
    let peers = list_discovered_peers();
    let client = reqwest::Client::new();

    let author_dirs = match std::fs::read_dir(&dir) {
        Ok(d) => d,
        Err(_) => return,
    };
    for author_entry in author_dirs.flatten() {
        if !author_entry.path().is_dir() {
            continue;
        }
        let author = author_entry.file_name().to_string_lossy().to_string();
        let peer = match peers.iter().find(|p| p.get("name").and_then(|n| n.as_str()) == Some(author.as_str())) {
            Some(p) => p,
            None => continue, // peer offline — leave queued, retry next cycle
        };
        let host = peer.get("host").and_then(|h| h.as_str()).unwrap_or("127.0.0.1");
        let port = peer.get("port").and_then(|p| p.as_u64()).unwrap_or(0);
        let token = peer.get("token").and_then(|t| t.as_str()).unwrap_or("");

        let files = match std::fs::read_dir(author_entry.path()) {
            Ok(f) => f,
            Err(_) => continue,
        };
        for file_entry in files.flatten() {
            let fname = file_entry.file_name().to_string_lossy().to_string();
            if !fname.ends_with(".json") {
                continue;
            }
            let comments: Vec<Value> = match std::fs::read_to_string(file_entry.path())
                .ok()
                .and_then(|c| serde_json::from_str(&c).ok())
            {
                Some(c) => c,
                None => continue,
            };
            let unsynced: Vec<Value> = comments
                .iter()
                .filter(|c| {
                    !c.get("synced").and_then(|s| s.as_bool()).unwrap_or(false)
                        && !c.get("private").and_then(|p| p.as_bool()).unwrap_or(false)
                })
                .cloned()
                .collect();
            if unsynced.is_empty() {
                continue;
            }
            let rel_path = fname.trim_end_matches(".json").replace('_', "/");
            let url = format!("http://{}:{}/comments?token={}", host, port, token);
            let res = client
                .post(&url)
                .header("Content-Type", "application/json")
                .json(&json!({ "filePath": rel_path, "comments": unsynced }))
                .timeout(std::time::Duration::from_secs(5))
                .send()
                .await;
            if let Ok(r) = res {
                if r.status().is_success() {
                    let unsynced_ids: std::collections::HashSet<String> = unsynced
                        .iter()
                        .filter_map(|c| c.get("id").and_then(|i| i.as_str()).map(|s| s.to_string()))
                        .collect();
                    let updated: Vec<Value> = comments
                        .into_iter()
                        .map(|mut c| {
                            let id = c.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                            if unsynced_ids.contains(&id) {
                                if let Some(obj) = c.as_object_mut() {
                                    obj.insert("synced".into(), json!(true));
                                }
                            }
                            c
                        })
                        .collect();
                    if let Ok(content) = serde_json::to_string_pretty(&updated) {
                        let _ = std::fs::write(file_entry.path(), content);
                    }
                }
            }
        }
    }
}

/// Spawn the 30s peer-comment flush loop (mirrors electron's network watcher cadence).
pub fn start_peer_comment_sync() {
    std::thread::spawn(|| {
        let rt = match tokio::runtime::Runtime::new() {
            Ok(r) => r,
            Err(_) => return,
        };
        loop {
            std::thread::sleep(std::time::Duration::from_secs(30));
            rt.block_on(flush_peer_comments());
        }
    });
}

#[tauri::command]
pub fn peers_list() -> Result<Vec<Value>, String> {
    Ok(read_peers())
}

#[tauri::command]
pub fn peers_list_discovered() -> Result<Vec<Value>, String> {
    let cell = discovered_peers();
    let lock = cell.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    let map = lock.lock().map_err(|e| e.to_string())?;
    Ok(map.values().cloned().collect())
}

#[tauri::command]
pub fn peers_favorite(id: String) -> Result<(), String> {
    let mut peers = read_peers();
    if let Some(idx) = peers.iter().position(|p| p.get("id").and_then(|v| v.as_str()) == Some(&id)) {
        if let Some(obj) = peers[idx].as_object_mut() {
            obj.insert("favorited".to_string(), json!(true));
        }
    } else {
        peers.push(json!({
            "id": id,
            "favorited": true
        }));
    }
    write_peers(&peers);
    Ok(())
}

#[tauri::command]
pub fn peers_unfavorite(id: String) -> Result<(), String> {
    let mut peers = read_peers();
    if let Some(idx) = peers.iter().position(|p| p.get("id").and_then(|v| v.as_str()) == Some(&id)) {
        if let Some(obj) = peers[idx].as_object_mut() {
            obj.insert("favorited".to_string(), json!(false));
        }
    }
    write_peers(&peers);
    Ok(())
}

/// Parse a manually-entered peer address into (host, port, token). Accepts the
/// share URL Canonic hands out (`http://host:port/?token=…`), a bare
/// `host:port:token`, or a `canonic://open?url=…` deep link. A token is
/// required — the share endpoints 403 without it.
fn parse_peer_address(input: &str) -> Result<(String, u16, String), String> {
    let trimmed = input.trim();

    // Unwrap a canonic:// deep link to the inner http URL.
    let s = if let Some(rest) = trimmed.strip_prefix("canonic://open?url=") {
        urlencoding::decode(rest)
            .map(|c| c.into_owned())
            .unwrap_or_else(|_| rest.to_string())
    } else {
        trimmed.to_string()
    };
    let s = s.trim();

    let body = s
        .strip_prefix("http://")
        .or_else(|| s.strip_prefix("https://"))
        .unwrap_or(s);

    // Split the query string off and pull `token` out of it.
    let (hostport_path, query) = match body.split_once('?') {
        Some((hp, q)) => (hp, Some(q)),
        None => (body, None),
    };
    let mut token = String::new();
    if let Some(q) = query {
        for pair in q.split('&') {
            if let Some(v) = pair.strip_prefix("token=") {
                token = urlencoding::decode(v)
                    .map(|c| c.into_owned())
                    .unwrap_or_else(|_| v.to_string());
            }
        }
    }

    // Drop any path segment, keep host:port (and maybe :token in the bare form).
    let hostport = hostport_path.split('/').next().unwrap_or(hostport_path);
    let (host, port) = if token.is_empty() {
        let parts: Vec<&str> = hostport.split(':').collect();
        match parts.as_slice() {
            [h, p] => (
                h.to_string(),
                p.parse::<u16>().map_err(|_| "Invalid port number".to_string())?,
            ),
            [h, p, t] => {
                token = (*t).to_string();
                (
                    h.to_string(),
                    p.parse::<u16>().map_err(|_| "Invalid port number".to_string())?,
                )
            }
            _ => return Err("Expected host:port (with a token)".to_string()),
        }
    } else {
        let (h, p) = hostport
            .rsplit_once(':')
            .ok_or_else(|| "Address is missing a port".to_string())?;
        (
            h.to_string(),
            p.parse::<u16>().map_err(|_| "Invalid port number".to_string())?,
        )
    };

    if host.is_empty() {
        return Err("Address is missing a host".to_string());
    }
    if token.is_empty() {
        return Err("A share token is required — paste the full share link".to_string());
    }
    Ok((host, port, token))
}

/// Connect to a peer by manually-entered share link/address when mDNS discovery
/// can't find it (e.g. a flatpak sandbox or a segmented network). Validates the
/// address by fetching the peer's manifest, then registers it like a discovered
/// peer so the rest of the peer flow (files, comments) works unchanged.
#[tauri::command]
pub async fn peers_connect_manual(address: String) -> Result<Value, String> {
    let (host, port, token) = parse_peer_address(&address)?;

    let url = format!("http://{}:{}/manifest?token={}", host, port, token);
    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Could not reach {}:{} — {}", host, port, e))?;

    if res.status() == reqwest::StatusCode::FORBIDDEN {
        return Err("Wrong or missing token for this peer".to_string());
    }
    if !res.status().is_success() {
        return Err(format!("Peer responded with status {}", res.status()));
    }
    let manifest = res
        .json::<Value>()
        .await
        .map_err(|e| format!("Could not read peer manifest: {}", e))?;

    let author = manifest
        .get("author")
        .and_then(|a| a.as_str())
        .unwrap_or("Peer")
        .to_string();
    let scope = manifest
        .get("scope")
        .and_then(|s| s.as_str())
        .unwrap_or("workspace")
        .to_string();
    let tagged_only = manifest
        .get("taggedOnly")
        .and_then(|t| t.as_bool())
        .unwrap_or(false);

    let peer_id = format!("{}:{}", host, port);
    // The manifest doesn't expose the share permission; default optimistically —
    // the server still enforces the real permission on every request.
    let peer = json!({
        "id": peer_id,
        "name": author,
        "host": host,
        "port": port,
        "token": token,
        "scope": scope,
        "permission": "comment",
        "taggedOnly": tagged_only,
        "online": true,
        "manual": true
    });

    register_discovered_peer(peer_id.clone(), peer.clone());
    if let Some(app) = app_handle() {
        use tauri::Emitter;
        let _ = app.emit("peers:found", peer.clone());
    }
    Ok(peer)
}

#[tauri::command]
pub async fn peers_fetch_manifest(id: String) -> Result<Value, String> {
    let peer = {
        let cell = discovered_peers();
        let lock = cell.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
        let map = lock.lock().map_err(|e| e.to_string())?;
        map.get(&id).cloned().ok_or_else(|| "Peer not online".to_string())?
    };

    let host = peer.get("host").and_then(|h| h.as_str()).unwrap_or("127.0.0.1");
    let port = peer.get("port").and_then(|p| p.as_u64()).unwrap_or(0);
    let token = peer.get("token").and_then(|t| t.as_str()).unwrap_or("");

    let url = format!("http://{}:{}/manifest?token={}", host, port, token);
    
    let client = reqwest::Client::new();
    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("HTTP error status: {}", res.status()));
    }

    let val = res.json::<Value>().await.map_err(|e| format!("Failed to parse response: {}", e))?;
    Ok(json!({
        "success": true,
        "files": val.get("files").unwrap_or(&json!([])),
        "author": val.get("author").unwrap_or(&json!("")),
        "scope": val.get("scope").unwrap_or(&json!(""))
    }))
}

#[tauri::command]
pub async fn peers_open_file(id: String, rel_path: String, ws_name: String) -> Result<Value, String> {
    let peer = {
        let cell = discovered_peers();
        let lock = cell.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
        let map = lock.lock().map_err(|e| e.to_string())?;
        map.get(&id).cloned().ok_or_else(|| "Peer not online".to_string())?
    };

    let host = peer.get("host").and_then(|h| h.as_str()).unwrap_or("127.0.0.1");
    let port = peer.get("port").and_then(|p| p.as_u64()).unwrap_or(0);
    let token = peer.get("token").and_then(|t| t.as_str()).unwrap_or("");

    let mut url = format!("http://{}:{}/file?path={}&token={}", host, port, urlencoding::encode(&rel_path), token);
    if !ws_name.is_empty() {
        url.push_str(&format!("&workspace={}", urlencoding::encode(&ws_name)));
    }

    let client = reqwest::Client::new();
    let res = client.get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("HTTP error status: {}", res.status()));
    }

    let val = res.json::<Value>().await.map_err(|e| format!("Failed to parse response: {}", e))?;
    Ok(json!({
        "success": true,
        "content": val.get("content").unwrap_or(&json!("")),
        "comments": val.get("comments").unwrap_or(&json!([]))
    }))
}

// --- Cleanup ---
#[tauri::command]
pub fn cleanup_reset_config() -> Result<Value, String> {
    let dir = get_config_dir();
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn cleanup_delete_workspace(path: String) -> Result<Value, String> {
    let p = Path::new(&path);
    if p.exists() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())?;
    }
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn cleanup_get_paths() -> Result<Value, String> {
    let cfg = get_config_dir();
    Ok(json!({
        "config": cfg.to_string_lossy(),
        "logs": cfg.join("logs").to_string_lossy()
    }))
}

// --- Demo ---
fn demo_dir_slot() -> &'static std::sync::Mutex<Option<String>> {
    static D: std::sync::OnceLock<std::sync::Mutex<Option<String>>> = std::sync::OnceLock::new();
    D.get_or_init(|| std::sync::Mutex::new(None))
}

#[tauri::command]
pub fn demo_register(path: String) -> Result<(), String> {
    if let Ok(mut d) = demo_dir_slot().lock() {
        *d = Some(path);
    }
    Ok(())
}

#[tauri::command]
pub fn demo_cleanup() -> Result<(), String> {
    if let Ok(mut d) = demo_dir_slot().lock() {
        if let Some(path) = d.take() {
            let p = Path::new(&path);
            // Only remove a demo workspace we registered (name ends in canonic-demo).
            if p.exists() && p.file_name().map(|n| n.to_string_lossy().contains("canonic-demo")).unwrap_or(false) {
                let _ = std::fs::remove_dir_all(p);
            }
        }
    }
    Ok(())
}

// --- Updates ---
// Backed by tauri-plugin-updater. `update_check` queries the configured GitHub
// `latest.json`; if a newer signed release exists it stashes the pending Update
// so `update_download` (streams progress) and `update_install` (verifies the
// signature, swaps the binary, relaunches) can pick it up across IPC calls.
struct PendingUpdate {
    update: tauri_plugin_updater::Update,
    bytes: Option<Vec<u8>>,
}

fn pending_update() -> &'static std::sync::Mutex<Option<PendingUpdate>> {
    static P: std::sync::OnceLock<std::sync::Mutex<Option<PendingUpdate>>> =
        std::sync::OnceLock::new();
    P.get_or_init(|| std::sync::Mutex::new(None))
}

#[tauri::command]
pub async fn update_check(app: tauri::AppHandle) -> Result<Value, String> {
    use tauri::Emitter;
    use tauri_plugin_updater::UpdaterExt;

    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => {
            // Custom (unsigned) manifest fields drive security forcing. The
            // binary itself is still signature-verified at install, so these
            // flags can only nag/force-with-update — never run a bad binary.
            // `critical: true` makes the update mandatory for every client old
            // enough to see it (the plugin only returns one when out of date).
            let raw = &update.raw_json;
            let mandatory = raw
                .get("critical")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let advisory = raw
                .get("advisory")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let info = json!({
                "version": update.version.clone(),
                "notes": update.body.clone(),
                "date": update.date.map(|d| d.to_string()),
                "mandatory": mandatory,
                "advisory": advisory,
            });
            *pending_update().lock().unwrap() =
                Some(PendingUpdate { update, bytes: None });
            let _ = app.emit("update:available", info.clone());
            Ok(json!({ "available": true, "updateInfo": info }))
        }
        Ok(None) => {
            *pending_update().lock().unwrap() = None;
            Ok(json!({ "available": false }))
        }
        Err(e) => {
            let msg = e.to_string();
            let _ = app.emit("update:error", msg.clone());
            Err(msg)
        }
    }
}

#[tauri::command]
pub async fn update_download(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Emitter;

    // Take the stashed Update out so we don't hold the lock across .await.
    let update = match pending_update().lock().unwrap().take() {
        Some(p) => p.update,
        None => return Err("no update available — run update_check first".into()),
    };

    let app_progress = app.clone();
    let mut downloaded: u64 = 0;
    let result = update
        .download(
            move |chunk, content_len| {
                downloaded += chunk as u64;
                let total = content_len.unwrap_or(0);
                let percent = if total > 0 {
                    (downloaded as f64 / total as f64) * 100.0
                } else {
                    0.0
                };
                let _ = app_progress.emit(
                    "update:progress",
                    json!({ "percent": percent, "downloaded": downloaded, "total": total }),
                );
            },
            || {},
        )
        .await;

    match result {
        Ok(bytes) => {
            // Re-stash the Update alongside the downloaded bytes for install.
            *pending_update().lock().unwrap() =
                Some(PendingUpdate { update, bytes: Some(bytes) });
            let _ = app.emit("update:downloaded", ());
            Ok(())
        }
        Err(e) => {
            let msg = e.to_string();
            let _ = app.emit("update:error", msg.clone());
            Err(msg)
        }
    }
}

#[tauri::command]
pub async fn update_install(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Emitter;

    // The updater swaps the installed app bundle and relaunches it. Under
    // `tauri dev` there is no bundle — install() writes to a derived path that
    // doesn't exist and app.restart() fails with "No such file or directory".
    // Refuse cleanly so dev can still exercise the check/download UI without
    // crashing the session. Real installs only run in packaged builds.
    if tauri::is_dev() {
        let msg = "Updates can't be installed in a dev build (no app bundle to \
                   replace). Test install in a packaged build.";
        let _ = app.emit("update:error", msg);
        return Err(msg.into());
    }

    let pending = pending_update()
        .lock()
        .unwrap()
        .take()
        .ok_or("no update downloaded")?;
    let bytes = pending
        .bytes
        .ok_or("update not downloaded yet — run update_download first")?;
    pending.update.install(bytes).map_err(|e| e.to_string())?;
    // Replaced the binary; relaunch into the new version. restart() never returns.
    app.restart();
}

// --- Doc Branches ---
#[tauri::command]
pub fn doc_branches_get(workspace_path: String) -> Result<Value, String> {
    let p = Path::new(&workspace_path).join(".canonic").join("doc-branches.json");
    if !p.exists() {
        return Ok(json!({}));
    }
    Ok(std::fs::read_to_string(p)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_else(|| json!({})))
}

#[tauri::command]
pub fn doc_branches_set(workspace_path: String, data: Value) -> Result<Value, String> {
    let dir = Path::new(&workspace_path).join(".canonic");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let content = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("doc-branches.json"), content).map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

// --- Versions (port of electron/versions.js: .canonic/versions.json) ---
fn read_versions(workspace_path: &str) -> Value {
    let p = Path::new(workspace_path).join(".canonic").join("versions.json");
    if !p.exists() {
        return json!({});
    }
    std::fs::read_to_string(p)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_else(|| json!({}))
}

fn write_versions(workspace_path: &str, data: &Value) -> Result<(), String> {
    let dir = Path::new(workspace_path).join(".canonic");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("versions.json"), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn versions_list(workspace_path: String, file_path: String) -> Result<Vec<Value>, String> {
    let all = read_versions(&workspace_path);
    Ok(all.get(&file_path).and_then(|v| v.as_array()).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn versions_save(
    workspace_path: String,
    file_path: String,
    name: String,
    oid: String,
    message: String,
) -> Result<Vec<Value>, String> {
    let mut all = read_versions(&workspace_path);
    if !all.is_object() {
        all = json!({});
    }
    let mut list: Vec<Value> = all.get(&file_path).and_then(|v| v.as_array()).cloned().unwrap_or_default();
    list.retain(|v| v.get("name").and_then(|n| n.as_str()) != Some(name.as_str()));
    list.insert(
        0,
        json!({
            "name": name,
            "oid": oid,
            "message": message,
            "createdAt": crate::mcp::chrono_iso8601()
        }),
    );
    all.as_object_mut().unwrap().insert(file_path, json!(list.clone()));
    write_versions(&workspace_path, &all)?;
    Ok(list)
}

#[tauri::command]
pub fn versions_delete(workspace_path: String, file_path: String, version_name: String) -> Result<(), String> {
    let mut all = read_versions(&workspace_path);
    if let Some(arr) = all.get_mut(&file_path).and_then(|v| v.as_array_mut()) {
        arr.retain(|v| v.get("name").and_then(|n| n.as_str()) != Some(version_name.as_str()));
    }
    write_versions(&workspace_path, &all)?;
    Ok(())
}

// --- AI ---
// Generation counter for cancellation: each ai_chat captures the current generation;
// a newer chat or ai_cancel bumps it, signalling the running stream to stop.
static AI_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[tauri::command]
pub async fn ai_chat(app: tauri::AppHandle, params: Value) -> Result<(), String> {
    use futures_util::StreamExt;
    use std::sync::atomic::Ordering::SeqCst;
    use tauri::Emitter;

    let my_gen = AI_GEN.fetch_add(1, SeqCst) + 1;

    let api_key = params.get("apiKey").and_then(|k| k.as_str()).unwrap_or("").to_string();
    if api_key.is_empty() {
        let _ = app.emit("ai:error", "No API key configured. Open Settings to add your API key.");
        return Ok(());
    }
    let base = params
        .get("baseUrl")
        .and_then(|b| b.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("https://openrouter.ai/api/v1")
        .trim_end_matches('/')
        .to_string();
    let model = params.get("model").and_then(|m| m.as_str()).unwrap_or("").to_string();
    let system = params.get("system").and_then(|s| s.as_str()).map(|s| s.to_string());
    let messages: Vec<Value> = params.get("messages").and_then(|m| m.as_array()).cloned().unwrap_or_default();

    let mut all_messages = messages;
    if let Some(sys) = system {
        if model.to_lowercase().contains("deepseek") {
            // DeepSeek via OpenRouter often rejects/hangs on system prompts — fold into first user msg.
            let folds_into_first = all_messages
                .first()
                .and_then(|m| m.get("role").and_then(|r| r.as_str()))
                == Some("user");
            if folds_into_first {
                let first = all_messages.first_mut().unwrap();
                let orig = first.get("content").and_then(|c| c.as_str()).unwrap_or("").to_string();
                if let Some(obj) = first.as_object_mut() {
                    obj.insert("content".into(), json!(format!("{}\n\n{}", sys, orig)));
                }
            } else {
                all_messages.insert(0, json!({ "role": "user", "content": sys }));
            }
        } else {
            all_messages.insert(0, json!({ "role": "system", "content": sys }));
        }
    }

    let tools = params.get("tools").and_then(|t| t.as_array()).filter(|a| !a.is_empty());

    let mut body = serde_json::Map::new();
    body.insert("model".into(), json!(model));
    body.insert("messages".into(), json!(all_messages));
    body.insert("stream".into(), json!(true));
    body.insert("max_tokens".into(), json!(4096));
    if let Some(t) = tools {
        body.insert("tools".into(), json!(t));
        body.insert("tool_choice".into(), json!("auto"));
    }

    let client = reqwest::Client::new();
    let response = match client
        .post(format!("{}/chat/completions", base))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&Value::Object(body))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            let _ = app.emit("ai:error", e.to_string());
            return Ok(());
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let err = response.json::<Value>().await.unwrap_or_else(|_| json!({}));
        let msg = err
            .pointer("/error/message")
            .and_then(|m| m.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("API error {}", status));
        let _ = app.emit("ai:error", msg);
        return Ok(());
    }

    // A JSON content-type on a streaming endpoint means an error payload, not a stream.
    let ct = response
        .headers()
        .get("content-type")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("")
        .to_string();
    if ct.contains("application/json") {
        let err = response.json::<Value>().await.unwrap_or_else(|_| json!({}));
        let msg = err
            .pointer("/error/message")
            .and_then(|m| m.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "API returned a JSON error payload.".to_string());
        let _ = app.emit("ai:error", msg);
        return Ok(());
    }

    let mut stream = response.bytes_stream();
    // Raw bytes, not a String: a multibyte UTF-8 codepoint can straddle two TCP
    // chunks, so decode only once a complete line has arrived (lines are \n-delimited,
    // an ASCII byte, so a line boundary never splits a codepoint).
    let mut buf: Vec<u8> = Vec::new();
    let mut is_thinking = false;

    // Poll with a short timeout so cancellation is observed even when the upstream
    // sends nothing, and abandon the request if it stalls (otherwise a hung
    // connection leaks this task forever).
    let poll_interval = std::time::Duration::from_millis(500);
    let max_idle = std::time::Duration::from_secs(120);
    let mut last_activity = std::time::Instant::now();

    loop {
        let item = match tokio::time::timeout(poll_interval, stream.next()).await {
            Ok(Some(item)) => item,
            Ok(None) => break, // stream ended
            Err(_) => {
                // No data this tick — check for cancellation / overall stall.
                if AI_GEN.load(SeqCst) != my_gen {
                    let _ = app.emit("ai:done", ());
                    return Ok(());
                }
                if last_activity.elapsed() >= max_idle {
                    let _ = app.emit("ai:error", "AI stream timed out (no data).");
                    return Ok(());
                }
                continue;
            }
        };

        if AI_GEN.load(SeqCst) != my_gen {
            let _ = app.emit("ai:done", ());
            return Ok(());
        }
        let bytes = match item {
            Ok(b) => b,
            Err(e) => {
                let _ = app.emit("ai:error", e.to_string());
                return Ok(());
            }
        };
        last_activity = std::time::Instant::now();
        buf.extend_from_slice(&bytes);

        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = buf.drain(..=pos).collect();
            let decoded = String::from_utf8_lossy(&line_bytes[..line_bytes.len() - 1]);
            let line = decoded.trim();
            if !line.starts_with("data: ") {
                continue;
            }
            let data = line[6..].trim();
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            let parsed: Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let delta = parsed.pointer("/choices/0/delta").cloned().unwrap_or_else(|| json!({}));

            let thinking = delta
                .get("reasoning_content")
                .or_else(|| delta.get("reasoning"))
                .or_else(|| delta.get("thinking"))
                .and_then(|v| v.as_str());
            if let Some(t) = thinking {
                if !is_thinking {
                    let _ = app.emit("ai:chunk", "<think>\n");
                    is_thinking = true;
                }
                let _ = app.emit("ai:chunk", t);
            }

            if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                if !content.is_empty() {
                    if is_thinking {
                        let _ = app.emit("ai:chunk", "\n</think>\n");
                        is_thinking = false;
                    }
                    let _ = app.emit("ai:chunk", content);
                }
            }

            if let Some(tc) = delta.get("tool_calls") {
                let _ = app.emit("ai:tool_call_delta", tc.clone());
            }

            if let Some(fr) = parsed.pointer("/choices/0/finish_reason") {
                if !fr.is_null() {
                    let _ = app.emit("ai:finish_reason", fr.clone());
                }
            }
        }
    }

    if is_thinking {
        let _ = app.emit("ai:chunk", "\n</think>\n");
    }
    let _ = app.emit("ai:done", ());
    Ok(())
}

#[tauri::command]
pub fn ai_cancel() -> Result<(), String> {
    AI_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn ai_complete(params: Value) -> Result<Value, String> {
    let api_key = params.get("apiKey").and_then(|k| k.as_str()).unwrap_or("").to_string();
    let base_url = params.get("baseUrl").and_then(|b| b.as_str()).unwrap_or("").to_string();
    if api_key.is_empty() || base_url.is_empty() {
        return Ok(json!({ "text": "" }));
    }
    let base = base_url.trim_end_matches('/').to_string();
    let model = params.get("model").and_then(|m| m.as_str()).unwrap_or("").to_string();
    let max_tokens = params.get("maxTokens").and_then(|m| m.as_u64()).unwrap_or(25);
    let extra = params.get("extraInstructions").and_then(|s| s.as_str()).unwrap_or("").to_string();
    let prefix = params.get("prefix").and_then(|s| s.as_str()).unwrap_or("").to_string();
    let suffix = params.get("suffix").and_then(|s| s.as_str()).unwrap_or("").to_string();

    let client = reqwest::Client::new();

    let text = if base.contains("codestral.mistral.ai") {
        let body = json!({
            "model": model,
            "prompt": prefix,
            "suffix": suffix,
            "max_tokens": max_tokens,
            "stop": ["\n", "\n\n", "  "]
        });
        let resp = client
            .post(format!("{}/fim/completions", base))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await;
        match resp {
            Ok(r) if r.status().is_success() => {
                let data = r.json::<Value>().await.unwrap_or_else(|_| json!({}));
                data.pointer("/choices/0/text")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .trim_start_matches('\n')
                    .to_string()
            }
            _ => String::new(),
        }
    } else {
        let system = format!(
            "You are an inline text completion assistant for a markdown editor. \
             Complete the text at the cursor. Return ONLY the completion — no explanation, \
             no fences, no preamble. Keep it concise (1–2 sentences max). \
             Match the document tone. If no good completion exists, return empty string.{}",
            if extra.is_empty() {
                String::new()
            } else {
                format!("\n\nAdditional instructions:\n{}", extra)
            }
        );
        let user = format!(
            "<prefix>\n{}\n</prefix>\n<suffix>\n{}\n</suffix>\nComplete the text immediately after </prefix>.",
            prefix, suffix
        );
        let body = json!({
            "model": model,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": user }
            ],
            "stream": false,
            "max_tokens": max_tokens
        });
        let resp = client
            .post(format!("{}/chat/completions", base))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await;
        match resp {
            Ok(r) if r.status().is_success() => {
                let data = r.json::<Value>().await.unwrap_or_else(|_| json!({}));
                data.pointer("/choices/0/message/content")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .trim_start_matches('\n')
                    .to_string()
            }
            _ => String::new(),
        }
    };

    Ok(json!({ "text": text.trim() }))
}

// --- Agent session ---
#[tauri::command]
pub fn agent_submit(_params: Value) -> Result<Value, String> {
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn agent_cancel(_session_id: String) -> Result<Value, String> {
    Ok(json!({ "ok": true }))
}

// --- AI Control Preset & Sessions ---
fn is_installed(binary: &str) -> bool {
    #[cfg(windows)]
    let cmd = "where";
    #[cfg(not(windows))]
    let cmd = "which";

    std::process::Command::new(cmd)
        .arg(binary)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn list_models(agent_id: &str) -> (Vec<String>, Option<String>, String) {
    let (known, default, args, parse_opencode) = match agent_id {
        "claude-code" => (
            vec!["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-3-5"],
            Some("claude-sonnet-4-5"),
            None,
            false,
        ),
        "gemini-cli" => (
            vec!["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
            Some("gemini-2.5-flash"),
            None,
            false,
        ),
        "codex" => (
            vec!["gpt-5-codex", "gpt-5", "o4-mini", "gpt-4.1"],
            Some("gpt-5-codex"),
            None,
            false,
        ),
        "opencode" => (
            vec!["anthropic/claude-sonnet-4-5", "openai/gpt-5", "google/gemini-2.5-flash"],
            Some("anthropic/claude-sonnet-4-5"),
            Some(vec!["models"]),
            true,
        ),
        "pi" => (
            vec!["claude-sonnet-4-5", "gemini-2.5-flash", "gpt-5"],
            Some("claude-sonnet-4-5"),
            Some(vec!["models"]),
            false,
        ),
        _ => (vec![], None, None, false),
    };

    let mut models: Vec<String> = known.iter().map(|s| s.to_string()).collect();
    let mut source = "known".to_string();

    if let Some(run_args) = args {
        let binary = match agent_id {
            "opencode" => "opencode",
            "pi" => "pi",
            _ => "",
        };
        if is_installed(binary) {
            if let Ok(output) = std::process::Command::new(binary)
                .args(run_args)
                .output()
            {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let mut parsed = Vec::new();
                    for line in stdout.lines() {
                        if parse_opencode {
                            let l = line.trim();
                            if !l.is_empty() && l.contains('/') && !l.starts_with('#') {
                                parsed.push(l.to_string());
                            }
                        } else {
                            // pi parsing:
                            let l = line.trim().trim_start_matches([' ', '*', '-', '•']).trim();
                            // first column if tabular
                            let l_col = l.split_whitespace().next().unwrap_or("").trim();
                            if !l_col.is_empty() && !l_col.to_lowercase().starts_with("model") && !l_col.to_lowercase().starts_with("available") && !l_col.to_lowercase().starts_with("name") && !l_col.to_lowercase().starts_with("id") {
                                parsed.push(l_col.to_string());
                            }
                        }
                    }
                    if !parsed.is_empty() {
                        // Prepend parsed models and ensure uniqueness
                        let mut merged = parsed;
                        for m in models {
                            if !merged.contains(&m) {
                                merged.push(m);
                            }
                        }
                        models = merged;
                        source = "cli".to_string();
                    }
                }
            }
        }
    }

    (models, default.map(|s| s.to_string()), source)
}

#[tauri::command]
pub fn agent_control_get_presets() -> Result<Vec<Value>, String> {
    let presets = vec![
        json!({
            "id": "claude-code",
            "name": "Claude Code",
            "binary": "claude",
            "installHint": "npm install -g @anthropic-ai/claude-code",
            "injectContext": false,
            "outputFormat": "stream-json",
            "installed": is_installed("claude")
        }),
        json!({
            "id": "gemini-cli",
            "name": "Gemini CLI",
            "binary": "gemini",
            "installHint": "npm install -g @google/gemini-cli",
            "injectContext": false,
            "outputFormat": "json",
            "installed": is_installed("gemini")
        }),
        json!({
            "id": "codex",
            "name": "Codex",
            "binary": "codex",
            "installHint": "npm install -g @openai/codex",
            "injectContext": false,
            "outputFormat": "jsonl",
            "installed": is_installed("codex")
        }),
        json!({
            "id": "opencode",
            "name": "OpenCode",
            "binary": "opencode",
            "installHint": "npm install -g opencode-ai",
            "injectContext": false,
            "outputFormat": "jsonl",
            "installed": is_installed("opencode")
        }),
        json!({
            "id": "pi",
            "name": "Pi",
            "binary": "pi",
            "installHint": "npm install -g @earendil-works/pi-coding-agent",
            "injectContext": true,
            "outputFormat": "jsonl",
            "installed": is_installed("pi")
        })
    ];
    Ok(presets)
}

#[tauri::command]
pub fn agent_control_get_models(agent_id: String) -> Result<Value, String> {
    if agent_id == "custom" {
        return Ok(json!({ "models": [], "connected": true }));
    }
    let binary = match agent_id.as_str() {
        "claude-code" => "claude",
        "gemini-cli" => "gemini",
        "codex" => "codex",
        "opencode" => "opencode",
        "pi" => "pi",
        _ => "",
    };
    if binary.is_empty() {
        return Ok(json!({ "models": [], "connected": false }));
    }
    let (models, default_model, source) = list_models(&agent_id);
    Ok(json!({
        "models": models,
        "defaultModel": default_model,
        "source": source,
        "connected": is_installed(binary)
    }))
}

#[tauri::command]
pub fn agent_control_check_installed(agent_id: String) -> Result<Value, String> {
    if agent_id == "custom" {
        return Ok(json!({ "installed": true }));
    }
    let binary = match agent_id.as_str() {
        "claude-code" => "claude",
        "gemini-cli" => "gemini",
        "codex" => "codex",
        "opencode" => "opencode",
        "pi" => "pi",
        _ => return Ok(json!({ "installed": false, "error": "unknown preset" })),
    };
    Ok(json!({
        "installed": is_installed(binary),
        "binary": binary
    }))
}

#[tauri::command]
pub fn agent_control_get_custom_agents() -> Result<Vec<Value>, String> {
    let cfg = config_read()?;
    if let Some(custom_agents) = cfg.get("customAgents").and_then(|a| a.as_array()) {
        Ok(custom_agents.clone())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub fn agent_control_add_custom_agent(config: Value) -> Result<Value, String> {
    let mut cfg = config_read()?;
    let mut custom_agents = if let Some(arr) = cfg.get_mut("customAgents").and_then(|a| a.as_array_mut()) {
        arr.clone()
    } else {
        vec![]
    };

    let id = format!("custom-{}", &uuid::Uuid::new_v4().to_string()[..8]);
    let mut entry = config.clone();
    if let Some(obj) = entry.as_object_mut() {
        obj.insert("id".to_string(), json!(id));
        obj.insert("type".to_string(), json!("custom"));
    }
    custom_agents.push(entry.clone());
    
    if let Some(obj) = cfg.as_object_mut() {
        obj.insert("customAgents".to_string(), Value::Array(custom_agents));
    }
    config_write(cfg)?;
    Ok(entry)
}

#[tauri::command]
pub fn agent_control_remove_custom_agent(id: String) -> Result<Value, String> {
    let mut cfg = config_read()?;
    if let Some(custom_agents) = cfg.get_mut("customAgents").and_then(|a| a.as_array_mut()) {
        custom_agents.retain(|agent| {
            agent.get("id").and_then(|i| i.as_str()) != Some(&id)
        });
    }
    config_write(cfg)?;
    Ok(json!({ "success": true }))
}

fn active_workspace_path() -> &'static std::sync::OnceLock<std::sync::Mutex<Option<String>>> {
    static PATH: std::sync::OnceLock<std::sync::Mutex<Option<String>>> = std::sync::OnceLock::new();
    &PATH
}

fn get_active_workspace() -> Result<String, String> {
    let cell = active_workspace_path();
    let lock = cell.get_or_init(|| std::sync::Mutex::new(None));
    let val = lock.lock().map_err(|e| e.to_string())?;
    val.clone().ok_or_else(|| "No active workspace path set".to_string())
}

/// Public accessor used by the MCP server to resolve doc paths against the open workspace.
pub fn current_workspace_path() -> Option<String> {
    let cell = active_workspace_path();
    let lock = cell.get_or_init(|| std::sync::Mutex::new(None));
    lock.lock().ok().and_then(|v| v.clone())
}

fn read_sessions(workspace_path: &str) -> Vec<Value> {
    let p = Path::new(workspace_path).join(".canonic").join("sessions.json");
    if !p.exists() {
        return vec![];
    }
    std::fs::read_to_string(p)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_sessions(workspace_path: &str, sessions: &Vec<Value>) -> Result<(), String> {
    let dir = Path::new(workspace_path).join(".canonic");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join("sessions.json");
    let content = serde_json::to_string_pretty(sessions).map_err(|e| e.to_string())?;
    std::fs::write(p, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtySpawnParams {
    pub session_id: String,
    pub agent_id: String,
    pub binary: Option<String>,
    pub args: Option<Vec<String>>,
    pub cwd: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    pub mcp_port: Option<u16>,
    pub system_prompt: Option<String>,
    pub color_scheme: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyInputParams {
    pub session_id: String,
    pub data: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyResizeParams {
    pub session_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyKillParams {
    pub session_id: String,
}

struct PtySession {
    writer: Box<dyn std::io::Write + Send>,
    child: std::sync::Arc<std::sync::Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    master: Box<dyn portable_pty::MasterPty + Send>,
}

fn pty_sessions() -> &'static std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, PtySession>>> {
    static SESSIONS: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, PtySession>>> = std::sync::OnceLock::new();
    &SESSIONS
}

fn get_pty_sessions() -> Result<std::sync::MutexGuard<'static, std::collections::HashMap<String, PtySession>>, String> {
    let cell = pty_sessions();
    let lock = cell.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    lock.lock().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn agent_control_start_session(_params: Value) -> Result<Value, String> {
    Ok(json!({ "ok": true, "sessionId": "" }))
}

#[tauri::command]
pub fn agent_control_send_message(_params: Value) -> Result<Value, String> {
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn agent_control_resume(_params: Value) -> Result<Value, String> {
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn agent_control_stop_session(_session_id: String) -> Result<Value, String> {
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn agent_control_open_terminal(_params: Value) -> Result<Value, String> {
    Ok(json!({ "ok": true }))
}

fn open_system_terminal(cwd: &str) {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg("-a").arg("Terminal").arg(cwd).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("x-terminal-emulator").current_dir(cwd).spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd").args(["/C", "start", "cmd"]).current_dir(cwd).spawn();
    }
}

#[tauri::command]
pub fn pty_popout(params: Value) -> Result<Value, String> {
    let cwd = params.get("cwd").and_then(|c| c.as_str()).unwrap_or("");
    if !cwd.is_empty() {
        open_system_terminal(cwd);
    }
    Ok(json!({ "ok": true }))
}

/// Append `chunk` to `carry`, then return the longest decodable UTF-8 text from the
/// front of `carry`, leaving an incomplete trailing codepoint behind for the next call.
/// A codepoint split across reads is decoded whole instead of becoming a replacement
/// char; genuinely invalid bytes are decoded lossily so `carry` never grows unbounded.
fn take_utf8(carry: &mut Vec<u8>, chunk: &[u8]) -> String {
    carry.extend_from_slice(chunk);
    match std::str::from_utf8(carry) {
        Ok(s) => {
            let out = s.to_string();
            carry.clear();
            out
        }
        Err(e) => {
            let valid = e.valid_up_to();
            match e.error_len() {
                // Incomplete trailing sequence: emit the valid prefix, keep the tail.
                None => {
                    let out = std::str::from_utf8(&carry[..valid]).unwrap().to_string();
                    carry.drain(..valid);
                    out
                }
                // Genuinely invalid bytes: decode everything lossily and reset.
                Some(_) => {
                    let out = String::from_utf8_lossy(carry).to_string();
                    carry.clear();
                    out
                }
            }
        }
    }
}

#[tauri::command]
pub fn pty_spawn(app: tauri::AppHandle, params: PtySpawnParams) -> Result<Value, String> {
    use portable_pty::PtySystem;

    let exec_bin = if params.agent_id == "custom" {
        params.binary.clone().ok_or_else(|| "No binary provided for custom agent".to_string())?
    } else {
        match params.agent_id.as_str() {
            "claude-code" => "claude".to_string(),
            "gemini-cli" => "gemini".to_string(),
            "codex" => "codex".to_string(),
            "opencode" => "opencode".to_string(),
            "pi" => "pi".to_string(),
            _ => return Err(format!("Unknown preset ID: {}", params.agent_id)),
        }
    };

    let exec_args = if params.agent_id == "custom" {
        params.args.clone().unwrap_or_default()
    } else {
        let mut args = Vec::new();
        if let Some(prompt) = &params.system_prompt {
            match params.agent_id.as_str() {
                "claude-code" | "pi" => {
                    args.push("--append-system-prompt".to_string());
                    args.push(prompt.clone());
                }
                _ => {}
            }
        }
        args
    };

    let pty_system = portable_pty::NativePtySystem::default();
    let cols = params.cols.unwrap_or(80);
    let rows = params.rows.unwrap_or(24);

    let pair = pty_system.openpty(portable_pty::PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| e.to_string())?;

    let mut cmd = portable_pty::CommandBuilder::new(&exec_bin);
    cmd.args(&exec_args);
    if let Some(dir) = &params.cwd {
        cmd.cwd(dir);
    }

    if let Some(mcp) = params.mcp_port {
        let token = crate::mcp::get_token().unwrap_or_default();
        cmd.env("CANONIC_MCP_URL", format!("http://127.0.0.1:{}/mcp?token={}", mcp, token));
        cmd.env("CANONIC_MCP_SSE", format!("http://127.0.0.1:{}/sse?token={}", mcp, token));
        cmd.env("CANONIC_MCP_TOKEN", &token);
    }
    cmd.env("GEMINI_CLI_TRUST_WORKSPACE", "true");
    cmd.env("TERM", "xterm-256color");

    let color_fgbg = if params.color_scheme.as_deref() == Some("light") {
        "0;15"
    } else {
        "15;0"
    };
    cmd.env("COLORFGBG", color_fgbg);

    for (k, v) in std::env::vars() {
        cmd.env(k, v);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let session_id_clone = params.session_id.clone();

    let child_shared = std::sync::Arc::new(std::sync::Mutex::new(child));
    let child_clone = child_shared.clone();

    use tauri::Emitter;
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        // Carry incomplete trailing bytes between reads so a multibyte UTF-8 codepoint
        // split across two reads is decoded whole instead of becoming a replacement char.
        let mut carry: Vec<u8> = Vec::new();
        while let Ok(size) = reader.read(&mut buffer) {
            if size == 0 {
                if !carry.is_empty() {
                    let text = String::from_utf8_lossy(&carry).to_string();
                    let _ = app_handle.emit("pty:data", json!({ "sessionId": session_id_clone, "data": text }));
                    carry.clear();
                }
                break;
            }
            let text = take_utf8(&mut carry, &buffer[..size]);
            if text.is_empty() {
                continue;
            }
            let _ = app_handle.emit("pty:data", json!({ "sessionId": session_id_clone, "data": text }));
        }
        if let Ok(mut c) = child_clone.lock() {
            let _ = c.wait();
        }
        let _ = app_handle.emit("pty:exit", json!({ "sessionId": session_id_clone }));
    });

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let mut sessions = get_pty_sessions()?;
    sessions.insert(params.session_id.clone(), PtySession {
        writer,
        child: child_shared,
        master: pair.master,
    });

    Ok(json!({ "success": true, "sessionId": params.session_id }))
}

#[tauri::command]
pub fn pty_input(params: PtyInputParams) -> Result<(), String> {
    use std::io::Write;
    let mut sessions = get_pty_sessions()?;
    if let Some(session) = sessions.get_mut(&params.session_id) {
        session.writer.write_all(params.data.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_resize(params: PtyResizeParams) -> Result<(), String> {
    let sessions = get_pty_sessions()?;
    if let Some(session) = sessions.get(&params.session_id) {
        session.master.resize(portable_pty::PtySize {
            rows: params.rows,
            cols: params.cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_kill(params: PtyKillParams) -> Result<(), String> {
    let mut sessions = get_pty_sessions()?;
    if let Some(session) = sessions.remove(&params.session_id) {
        if let Ok(mut c) = session.child.lock() {
            let _ = c.kill();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn agent_control_get_history() -> Result<Vec<Value>, String> {
    let ws_path = get_active_workspace()?;
    Ok(read_sessions(&ws_path))
}

#[tauri::command]
pub fn agent_control_save_history(session: Value) -> Result<Value, String> {
    let ws_path = get_active_workspace()?;
    let mut sessions = read_sessions(&ws_path);
    let session_id = session.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
    if let Some(idx) = sessions.iter().position(|s| s.get("id").and_then(|i| i.as_str()) == Some(&session_id)) {
        sessions[idx] = session;
    } else {
        sessions.insert(0, session);
    }
    if sessions.len() > 50 {
        sessions.truncate(50);
    }
    write_sessions(&ws_path, &sessions)?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn agent_control_delete_history(session_id: String) -> Result<Value, String> {
    let ws_path = get_active_workspace()?;
    let mut sessions = read_sessions(&ws_path);
    sessions.retain(|s| s.get("id").and_then(|i| i.as_str()) != Some(&session_id));
    write_sessions(&ws_path, &sessions)?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn mcp_set_editor_state(state: Value) -> Result<(), String> {
    let focused = state.get("focusedDoc").and_then(|f| f.as_str()).map(|s| s.to_string());
    let open = state
        .get("openDocs")
        .and_then(|o| o.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();
    let unsaved = state
        .get("unsavedChanges")
        .and_then(|u| u.as_object())
        .map(|obj| {
            obj.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        })
        .unwrap_or_default();
    crate::mcp::set_editor_state(focused, open, unsaved);
    Ok(())
}

#[tauri::command]
pub fn agent_control_get_mcp_port() -> Result<Value, String> {
    Ok(json!({ "port": crate::mcp::get_port().unwrap_or(0) }))
}

// --- MCP agent config registration (port of electron agent-presets.js mcp* fields) ---
struct McpPreset {
    config_path: PathBuf,
    format: &'static str, // "json" | "toml"
    key: &'static str,    // dotted path, e.g. "mcpServers.canonic"
    entry: Value,         // JSON entry (json format)
    toml_block: String,   // raw block (toml format)
}

fn home_dir() -> PathBuf {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default();
    PathBuf::from(home)
}

fn mcp_preset(agent_id: &str, port: u16) -> Option<McpPreset> {
    let home = home_dir();
    let token = crate::mcp::get_token().unwrap_or_default();
    let url = format!("http://127.0.0.1:{}/mcp?token={}", port, token);
    let sse = format!("http://127.0.0.1:{}/sse?token={}", port, token);
    match agent_id {
        "claude-code" => Some(McpPreset {
            config_path: home.join(".claude.json"),
            format: "json",
            key: "mcpServers.canonic",
            entry: json!({ "type": "http", "url": url }),
            toml_block: String::new(),
        }),
        "gemini-cli" => Some(McpPreset {
            config_path: home.join(".gemini").join("settings.json"),
            format: "json",
            key: "mcpServers.canonic",
            entry: json!({ "httpUrl": url }),
            toml_block: String::new(),
        }),
        "codex" => Some(McpPreset {
            config_path: home.join(".codex").join("config.toml"),
            format: "toml",
            key: "mcp_servers.canonic",
            entry: Value::Null,
            toml_block: format!("[mcp_servers.canonic]\nurl = \"{}\"\n", url),
        }),
        "opencode" => Some(McpPreset {
            config_path: home.join(".config").join("opencode").join("opencode.json"),
            format: "json",
            key: "mcp.canonic",
            entry: json!({ "type": "remote", "url": url, "enabled": true }),
            toml_block: String::new(),
        }),
        "pi" => Some(McpPreset {
            config_path: home.join(".pi").join("agent").join("mcp.json"),
            format: "json",
            key: "mcpServers.canonic",
            entry: json!({ "transport": "sse", "url": sse }),
            toml_block: String::new(),
        }),
        _ => None,
    }
}

fn set_deep(obj: &mut Value, dotted: &str, value: Value) {
    let parts: Vec<&str> = dotted.split('.').collect();
    let mut cur = obj;
    for (i, part) in parts.iter().enumerate() {
        if !cur.is_object() {
            *cur = json!({});
        }
        if i == parts.len() - 1 {
            cur.as_object_mut().unwrap().insert(part.to_string(), value);
            return;
        }
        cur = cur
            .as_object_mut()
            .unwrap()
            .entry(part.to_string())
            .or_insert_with(|| json!({}));
    }
}

fn get_deep<'a>(obj: &'a Value, dotted: &str) -> Option<&'a Value> {
    let mut cur = obj;
    for part in dotted.split('.') {
        cur = cur.get(part)?;
    }
    Some(cur)
}

fn preset_is_registered(preset: &McpPreset) -> bool {
    if !preset.config_path.exists() {
        return false;
    }
    let content = match std::fs::read_to_string(&preset.config_path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    if preset.format == "json" {
        serde_json::from_str::<Value>(&content)
            .ok()
            .and_then(|j| get_deep(&j, preset.key).map(|v| !v.is_null()))
            .unwrap_or(false)
    } else {
        content.contains("[mcp_servers.canonic]")
    }
}

#[tauri::command]
pub fn agent_control_register_mcp(params: Value) -> Result<Value, String> {
    let agent_id = params.get("agentId").and_then(|a| a.as_str()).unwrap_or("");
    let port = params.get("port").and_then(|p| p.as_u64()).unwrap_or(0) as u16;
    let port = if port == 0 { crate::mcp::get_port().unwrap_or(0) } else { port };

    let preset = match mcp_preset(agent_id, port) {
        Some(p) => p,
        None => return Ok(json!({ "ok": false, "error": "unknown agent" })),
    };
    if let Some(parent) = preset.config_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    if preset.format == "json" {
        let mut root = if preset.config_path.exists() {
            std::fs::read_to_string(&preset.config_path)
                .ok()
                .and_then(|c| serde_json::from_str(&c).ok())
                .unwrap_or_else(|| json!({}))
        } else {
            json!({})
        };
        if !root.is_object() {
            root = json!({});
        }
        set_deep(&mut root, preset.key, preset.entry.clone());
        let content = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
        std::fs::write(&preset.config_path, content).map_err(|e| e.to_string())?;
    } else {
        // TOML: update the block if present, or append it if not.
        let mut content = if preset.config_path.exists() {
            std::fs::read_to_string(&preset.config_path).unwrap_or_default()
        } else {
            String::new()
        };
        
        let re = regex::Regex::new(r"(?s)\n*\[mcp_servers\.canonic\]\s*\nurl\s*=\s*[^\n]*").unwrap();
        if re.is_match(&content) {
            content = re.replace(&content, &format!("\n\n{}", preset.toml_block.trim())).to_string();
        } else {
            content = content.trim_end().to_string();
            content.push_str("\n\n");
            content.push_str(&preset.toml_block);
            content.push('\n');
        }
        std::fs::write(&preset.config_path, content).map_err(|e| e.to_string())?;
    }
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn agent_control_check_mcp(agent_id: String) -> Result<Value, String> {
    let cfg = config_read()?;
    if cfg
        .get("mcpOptOuts")
        .and_then(|o| o.get(&agent_id))
        .and_then(|v| v.as_bool())
        == Some(true)
    {
        return Ok(json!({ "registered": false, "optedOut": true }));
    }
    let preset = match mcp_preset(&agent_id, 0) {
        Some(p) => p,
        None => return Ok(json!({ "registered": false, "error": "unknown agent" })),
    };
    Ok(json!({ "registered": preset_is_registered(&preset) }))
}

#[tauri::command]
pub fn agent_control_opt_out_mcp(agent_id: String) -> Result<Value, String> {
    let mut cfg = config_read()?;
    if !cfg.get("mcpOptOuts").map(|o| o.is_object()).unwrap_or(false) {
        if let Some(obj) = cfg.as_object_mut() {
            obj.insert("mcpOptOuts".to_string(), json!({}));
        }
    }
    if let Some(o) = cfg.get_mut("mcpOptOuts").and_then(|o| o.as_object_mut()) {
        o.insert(agent_id, json!(true));
    }
    config_write(cfg)?;
    Ok(json!({ "ok": true }))
}

/// On launch the MCP port rotates, so re-point any agent whose config already has a
/// canonic entry to the live port. Never creates configs the user didn't opt into.
pub fn sync_all_mcp_configs(port: u16) {
    for id in ["claude-code", "gemini-cli", "codex", "opencode", "pi"] {
        if let Some(preset) = mcp_preset(id, port) {
            if preset_is_registered(&preset) {
                let _ = agent_control_register_mcp(json!({ "agentId": id, "port": port }));
            }
        }
    }
}

// --- Template Files Helper ---

fn get_readme_content() -> &'static str {
    "# My Canonic Workspace\n\n\
     A local-first document workspace powered by Canonic.\n\n\
     ## Git concepts in Canonic\n\n\
     | Git term | What it means here |\n\
     |---|---|\n\
     | **Branch** | A working draft or experiment — work here without affecting `main` |\n\
     | **Commit** | A saved checkpoint — like saving a version you can return to |\n\
     | **Merge** | Bring a branch's changes back into `main` when ready |\n\n\
     Start writing in any document. Use the branch selector in the toolbar to create drafts.\n"
}

fn get_pm_framework_files() -> Vec<(&'static str, &'static str)> {
    vec![
        ("Vision/product-vision.md", "# Product Vision\n\n> What we're building and why it matters.\n\n## Vision Statement\n\n_Write a one or two sentence aspirational statement describing the future state you want to create._\n\n## Problem We're Solving\n\n_Describe the core problem from the user's perspective. Who feels this pain? How often? How severely?_\n\n## Why Now\n\n_What has changed in the market, technology, or user behavior that makes this the right time to build?_\n\n## Who This Is For\n\n_Describe your primary user. Be specific — a narrow, vivid description beats a broad one._\n"),
        ("Vision/north-star-metric.md", "# North Star Metric\n\n> The one metric that best captures whether we're delivering value.\n\n## Our North Star\n\n_State the metric and its current value._\n\n## Why This Metric\n\n_Explain why this metric — not others — is the best proxy for user value._\n\n## Leading Indicators\n\n_What smaller metrics predict movement in the North Star before it shows up?_\n\n-\n-\n-\n"),
        ("Strategy/strategy.md", "# Strategy\n\n> How we'll achieve the vision given our constraints.\n\n## Strategic Bets\n\n_What are the 2–4 big moves we're making? Each bet should be specific and falsifiable._\n\n1.\n2.\n3.\n\n## What We're NOT Doing\n\n_Explicitly stating non-priorities prevents scope creep and keeps the team focused._\n\n-\n-\n\n## Key Assumptions\n\n_What must be true for this strategy to work? These are your biggest risks._\n\n-\n-\n"),
        ("Strategy/competitive-analysis.md", "# Competitive Analysis\n\n## Landscape Overview\n\n_Brief description of the competitive space._\n\n## Competitors\n\n| Competitor | Strengths | Weaknesses | Our Differentiation |\n|---|---|---|---|\n|  |  |  |  |\n|  |  |  |  |\n\n## Where We Win\n\n_What can we do that alternatives cannot? Be honest — if the answer is \"nothing yet,\" write that._\n"),
        ("Planning/roadmap.md", "# Roadmap\n\n> What we're building and roughly when.\n\n## Now (current quarter)\n\n_Active work. Should be specific enough that the team knows what done looks like._\n\n- [ ]\n- [ ]\n\n## Next (next quarter)\n\n_Committed but not yet started. High confidence._\n\n-\n-\n\n## Later (future)\n\n_Directional. Subject to change based on what we learn._\n\n-\n-\n\n## Deprioritized\n\n_Things we've considered and actively chosen not to do yet. Write the reason._\n\n-\n"),
        ("Planning/okrs.md", "# OKRs\n\n> Objectives and Key Results for the current period.\n\n**Period:** _Q? 20??_\n\n## Objective 1\n\n_Aspirational, qualitative, memorable._\n\n- KR1: _Measurable outcome_ — **Current: ? / Target: ?**\n- KR2: _Measurable outcome_ — **Current: ? / Target: ?**\n\n## Objective 2\n\n_Aspirational, qualitative, memorable._\n\n- KR1: _Measurable outcome_ — **Current: ? / Target: ?**\n- KR2: _Measurable outcome_ — **Current: ? / Target: ?**\n")
    ]
}

fn get_canonic_demo_files() -> Vec<(&'static str, &'static str)> {
    vec![
        ("Vision/product-vision.md", "# Product Vision\n\n> What we're building and why it matters.\n\n## Vision Statement\n\nCanonic is a local-first document editor for product managers — built on Git — that makes version control, peer review, and AI-assisted thinking feel native to how good PMs already work.\n\n## Problem We're Solving\n\nProduct managers write documents — PRDs, strategies, roadmaps — in tools that treat them as ephemeral notes. Notion, Google Docs, and Confluence have no concept of history, branching, or review. Decisions get made in comments that disappear. \"Final_v3_APPROVED.docx\" is still the state of the art.\n\nThe real problem isn't the format. It's that there's no shared ritual for saying \"this document is ready to build from.\" Engineers have PRs. PMs have Slack threads.\n\n## Why Now\n\nThree things converged:\n\n1. **Remote-first teams normalized async review.** The \"walk over and ask\" fallback is gone. Docs need to stand alone.\n2. **AI can now act as a thinking partner.** The bottleneck isn't writing speed — it's thinking quality. Claude can challenge your reasoning before you've committed to it.\n3. **Local-first is having a moment.** Developers are exhausted by SaaS tools that hold their data hostage. PMs are starting to feel the same way.\n\n## Who This Is For\n\nB2B product managers at 20–500 person companies who ship software. They write documents before building things. They collaborate with engineers and designers. They care about their decisions aging well — they want to look back at why they decided something, not just what.\n\nNot for: enterprise PMOs, agencies, or anyone who needs a PM tool to also be a project tracker.\n"),
        ("Vision/north-star-metric.md", "# North Star Metric\n\n> The one metric that best captures whether we're delivering value.\n\n## Our North Star\n\n**Committed docs per active workspace per month** — the number of documents a user saves a checkpoint commit on, per workspace they actively use.\n\nCurrent baseline: 0 (pre-launch). Target by end of Q3: 3+ per workspace per month.\n\n## Why This Metric\n\nA commit is a meaningful act. It means the user trusted the document enough to snapshot it. It's the PM equivalent of merging a PR. If users aren't committing, they're using Canonic like a notes app — which means we haven't solved the alignment problem, we've just replaced Notion.\n\nHigh commit frequency signals: the user understands the value of version control, they have something worth preserving, and they're developing a habit.\n\n## Leading Indicators\n\n- Files opened per session (are they coming back?)\n- Time-to-first-commit per new workspace (are they getting it?)\n- Comments added per doc (are they collaborating?)\n- AI chat messages per session (are they thinking harder before committing?)\n"),
        ("Strategy/strategy.md", "# Strategy\n\n> How we'll achieve the vision given our constraints.\n\n## Strategic Bets\n\n**1. Win the solo PM first.** No collaboration features required to get value. The version history alone is better than anything a PM has today. Land here, then expand to teams.\n\n**2. Git vocabulary, PM framing.** Don't hide the model — explain it. \"Branch\" is a draft. \"Commit\" is a checkpoint. PMs who understand the metaphor become evangelists. PMs who don't get confused and churn. The README in every workspace explains this.\n\n**3. AI as thinking partner, not ghostwriter.** Every other AI writing tool competes on output quality. We compete on decision quality. The AI asks questions, challenges assumptions, points out what's missing. It doesn't write your PRD — it makes your PRD worth building from.\n\n**4. Open source → paid hosting.** Release the desktop app free and open. Sell the infrastructure (hosted relay, sync server, team access management) later. This keeps the core trustworthy and gives us a credible enterprise path without VC pressure to monetize day one.\n\n## What We're NOT Doing\n\n- Building a project tracker. Canonic is for pre-build alignment, not sprint management.\n- Building a web app. Local-first means local-first. The desktop app is the product.\n- Replacing GitHub for engineers. This is PM-layer tooling. It sits above the code.\n- Supporting real-time collaborative editing (v1). Async review is the model.\n\n## Key Assumptions\n\n- PMs will adopt a new tool if it solves version history — the pain is high enough.\n- The Git mental model is learnable by non-engineers if the UI explains it clearly.\n- AI that pushes back is more valuable than AI that agrees with you.\n- Open source creates enough trust and distribution to make the hosted tier viable.\n"),
        ("Strategy/competitive-analysis.md", "# Competitive Analysis\n\n## Landscape Overview\n\nThe PM document space is dominated by general-purpose collaboration tools (Notion, Google Docs, Confluence) and task managers that bolt on docs (Linear, Jira). Nobody is building for the specific problem of document versioning and pre-build alignment.\n\n## Competitors\n\n| Competitor | Strengths | Weaknesses | Our Differentiation |\n|---|---|---|---|\n| **Notion** | Flexible, widely adopted, good for wikis | No version history, comments get lost, no branching | Git-native history + named versions + branch drafts |\n| **Google Docs** | Real-time collab, version history exists | Version history is useless (auto-saves every few seconds), no structured review | Meaningful commits you choose, not noise |\n| **Confluence** | Enterprise adoption, structured | Terrible UX, no AI, nobody actually reads Confluence | Modern editor, AI that challenges, not just stores |\n| **Linear** | Excellent for eng workflow | Docs are second-class, no deep PM tooling | Documents as first-class artifacts with full git history |\n| **Obsidian** | Local-first, powerful, markdown | No collaboration, no PM templates, no AI | Collaboration + PM-specific structure + AI thinking partner |\n\n## Where We Win\n\nGit under the hood means a real history model — branching, merging, named versions, diffs. No other PM tool has this because they built on databases, not files.\n\nThe AI angle is genuinely different: we tune the system prompt to ask questions, not generate answers. Most AI writing tools make you lazier. We're trying to make PMs think harder.\n\nLocal-first is a real differentiator for privacy-conscious teams and orgs that can't put product strategy in a SaaS tool.\n"),
        ("Planning/roadmap.md", "# Roadmap\n\n> What we're building and roughly when.\n\n## Now (Q2 2026)\n\nActive work — these are in flight or next up.\n\n- [x] Git version control: commit, branch, merge per document\n- [x] Named versions with restore (snapshot any commit as \"v1.0\", \"approved\", etc.)\n- [x] Fork document (create a branch draft)\n- [x] History panel with diff view\n- [x] AI chat (thinking partner, not ghostwriter)\n- [x] Inline comments anchored to selected text\n- [x] Sharing via Cloudflare Tunnel (token-secured links)\n- [x] Demo mode with mock peer data\n- [ ] Show uncommitted changes indicator in editor\n- [ ] Collapsible sidebar\n\n## Next (Q3 2026)\n\nCommitted, not yet started. Building toward team collaboration.\n\n- [ ] Peer document sync — view a teammate's workspace read-only, synced via git fetch\n- [ ] Agent web search — AI can pull in external research on demand\n- [ ] Agent inline suggestions — ghost diff lines the user can accept or reject\n- [ ] Terminal pane — run CLI commands in workspace context\n- [ ] Claude Code integration — \"update the app to reflect this PRD\" launches a Claude Code session\n\n## Later\n\nDirectional, subject to change.\n\n- Hosted relay (paid) — team sync without self-hosting\n- Team access management — share workspaces with ACLs\n- Mobile read-only client\n- Git hooks for document quality (e.g., require filled sections before commit)\n\n## Deprioritized\n\n- Real-time collaborative editing: async review is the right model for pre-build docs; Google Docs already does real-time better than we could\n- Web app: local-first is the differentiator; a web app would require us to store data, which breaks the trust model\n- Integrations (Jira, Linear, Notion export): distraction until core loop is loved\n"),
        ("Discovery/problem-statement.md", "# Problem Statement\n\n> A crisp definition of the problem we're solving.\n\n## The Problem\n\nProduct managers struggle to create a shared, authoritative version of a document that the team trusts enough to build from, because the tools they use treat documents as living notes rather than versioned artifacts — which means engineering teams often start building before the PM is done thinking, and alignment is achieved through Slack threads instead of reviewed documents.\n\n## Evidence\n\n- \"Final_v3_APPROVED.docx\" is a real naming convention used at companies with $1B+ ARR\n- Notion's version history records every keystroke, making it useless for \"what did we decide\"\n- Engineers regularly describe getting requirements mid-sprint via Slack DM\n- In interviews: \"I can tell you what the doc says today but I can't tell you what changed last week or why\"\n\n## Current Workarounds\n\n- Manual version naming in the filename (v1, v2, FINAL, FINAL_APPROVED)\n- Google Docs \"version history\" — exists but not actionable (no branches, no named snapshots)\n- Printing to PDF at key moments and attaching to Jira tickets\n- Duplicate documents (\"Strategy_old.md\") kept as informal archives\n\n## Success Criteria\n\nA PM opens Canonic, writes a requirements doc, commits it at two different stages of review, and can show an engineer the exact diff between \"first draft\" and \"approved\" — without any of those words being in the filename.\n"),
        ("Discovery/user-research.md", "# User Research\n\n> What we've learned directly from users.\n\n## Research Questions\n\n1. How do PMs currently manage document versions and track decisions over time?\n2. What does \"this document is ready to build from\" mean to them — and how do they signal it?\n\n## Methods Used\n\nFounder interviews (10 PMs at B2B SaaS companies, 20–400 employees), alongside survey of 40 PMs in a product community Slack.\n\n## Key Findings\n\n### Finding 1: Version history is the #1 unmet need\n\nEvery PM interviewed had a story about a decision they couldn't reconstruct. \"I know we changed this requirement but I can't find where we landed or why.\" None of them trusted their current tool's version history. Google Docs' history was described as \"too noisy to be useful.\"\n\n### Finding 2: The \"draft → review → approved\" ritual is informal and fragile\n\nMost teams have an implicit flow but no tooling that enforces it. Approval happens via a Slack message or a \"LGTM\" comment. There's no authoritative moment of \"this is the committed version.\"\n\n### Finding 3: PMs are open to Git concepts if explained in their language\n\n\"Branch\" and \"commit\" land if you call them \"draft\" and \"checkpoint.\" Three of ten PMs in initial interviews said they'd wanted something like this for years but assumed it didn't exist.\n\n### Finding 4: AI skepticism is high, but the framing matters\n\nMost PMs have tried AI writing tools and found them underwhelming — they produce generic output that still needs heavy editing. When we described AI that asks questions instead of writes answers, the reaction was universally positive. \"That's actually what I need.\"\n\n## What This Means for the Product\n\nThe core loop is: write → commit → review → approve. Everything we build should make that loop faster and more trustworthy. The AI should be inserted at the review step, not the writing step.\n")
    ]
}

// --- Backup ---

static BACKUP_CANCEL: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>> =
    std::sync::Mutex::new(None);
static BACKUP_LAST_OID: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// Read workspace-local backup config from .canonic/backup.json
fn read_workspace_backup_config(workspace_path: &str) -> Value {
    let path = Path::new(workspace_path).join(".canonic").join("backup.json");
    if !path.exists() {
        return json!({"path": null});
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(json!({"path": null}))
}

/// Write workspace-local backup config to .canonic/backup.json
fn write_workspace_backup_config(workspace_path: &str, config: &Value) -> Result<(), String> {
    let dir = Path::new(workspace_path).join(".canonic");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("backup.json");
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

fn get_backup_dir(workspace_path: &str) -> Result<PathBuf, String> {
    // 1. Check per-workspace override first
    let ws_cfg = read_workspace_backup_config(workspace_path);
    if let Some(ws_path) = ws_cfg.get("path").and_then(|p| p.as_str()) {
        if !ws_path.is_empty() {
            return Ok(PathBuf::from(ws_path));
        }
    }

    // 2. Check global config
    let config = config_read()?;
    if let Some(backup) = config.get("backup") {
        if let Some(custom_path) = backup.get("path").and_then(|p| p.as_str()) {
            if !custom_path.is_empty() {
                return Ok(PathBuf::from(custom_path));
            }
        }
    }

    // 3. Default: .canonic-backups inside workspace
    Ok(Path::new(workspace_path).join(".canonic-backups"))
}

fn backup_name() -> String {
    let now = chrono::Local::now();
    format!("canonic-backup-{}.bundle", now.format("%Y-%m-%dT%H-%M-%S"))
}

fn parse_backup_timestamp(filename: &str) -> Option<i64> {
    // canonic-backup-2026-06-09T14-30-00.bundle
    let ts_part = filename
        .strip_prefix("canonic-backup-")?
        .strip_suffix(".bundle")?;
    let naive = chrono::NaiveDateTime::parse_from_str(ts_part, "%Y-%m-%dT%H-%M-%S").ok()?;
    use chrono::TimeZone;
    let dt = chrono::Local.from_local_datetime(&naive).single()?;
    Some(dt.timestamp_millis())
}

#[tauri::command]
pub fn backup_get_config() -> Result<Value, String> {
    let config = config_read()?;
    let backup = config.get("backup").cloned().unwrap_or(json!({
        "enabled": false,
        "path": null,
        "intervalMinutes": 30,
        "maxCount": 20
    }));
    Ok(backup)
}

#[tauri::command]
pub fn backup_set_config(backup_config: Value) -> Result<Value, String> {
    let mut config = config_read()?;

    // Validate path if set
    if let Some(path) = backup_config.get("path").and_then(|p| p.as_str()) {
        if !path.is_empty() {
            let p = Path::new(path);
            if !p.exists() {
                return Ok(json!({"success": false, "error": "Backup path does not exist"}));
            }
            // Check writable
            let test_file = p.join(".canonic-backup-test");
            if let Err(e) = std::fs::write(&test_file, b"test") {
                return Ok(json!({"success": false, "error": format!("Backup path is not writable: {}", e)}));
            }
            let _ = std::fs::remove_file(&test_file);
        }
    }

    config.as_object_mut()
        .ok_or("Invalid config")?
        .insert("backup".to_string(), backup_config.clone());

    config_write(config)?;

    // If enabled, start auto-backup; if disabled, stop it
    let enabled = backup_config.get("enabled").and_then(|e| e.as_bool()).unwrap_or(false);
    if enabled {
        let _ = backup_start_auto_internal();
    } else {
        let _ = backup_stop_auto_internal();
    }

    Ok(json!({"success": true}))
}

#[tauri::command]
pub fn backup_get_workspace_config(workspace_path: String) -> Result<Value, String> {
    let global = backup_get_config()?;
    let ws_cfg = read_workspace_backup_config(&workspace_path);

    // Merge: workspace override + global defaults
    Ok(json!({
        "enabled": global.get("enabled").and_then(|e| e.as_bool()).unwrap_or(false),
        "path": ws_cfg.get("path").and_then(|p| p.as_str()).unwrap_or(""),
        "intervalMinutes": global.get("intervalMinutes").and_then(|m| m.as_u64()).unwrap_or(30),
        "maxCount": global.get("maxCount").and_then(|m| m.as_u64()).unwrap_or(20),
        "hasWorkspaceOverride": ws_cfg.get("path").and_then(|p| p.as_str()).map(|s| !s.is_empty()).unwrap_or(false)
    }))
}

#[tauri::command]
pub fn backup_set_workspace_config(workspace_path: String, backup_config: Value) -> Result<Value, String> {
    // Validate path if set
    if let Some(path) = backup_config.get("path").and_then(|p| p.as_str()) {
        if !path.is_empty() {
            let p = Path::new(path);
            if !p.exists() {
                return Ok(json!({"success": false, "error": "Backup path does not exist"}));
            }
            let test_file = p.join(".canonic-backup-test");
            if let Err(e) = std::fs::write(&test_file, b"test") {
                return Ok(json!({"success": false, "error": format!("Backup path is not writable: {}", e)}));
            }
            let _ = std::fs::remove_file(&test_file);
        }
    }

    write_workspace_backup_config(&workspace_path, &backup_config)?;
    Ok(json!({"success": true}))
}

#[tauri::command]
pub async fn backup_run(workspace_path: String) -> Result<Value, String> {
    backup_internal(&workspace_path)
}

fn backup_internal(workspace_path: &str) -> Result<Value, String> {
    let backup_dir = get_backup_dir(workspace_path)?;
    std::fs::create_dir_all(&backup_dir).map_err(|e| format!("Cannot create backup dir: {}", e))?;

    let repo = git2::Repository::open(workspace_path)
        .map_err(|e| format!("Cannot open repository: {}", e))?;

    // Get current HEAD oid
    let head_oid = match repo.head() {
        Ok(head) => head.peel_to_commit().map(|c| c.id()).ok(),
        Err(_) => None,
    };

    let head_oid_str = head_oid.map(|o| o.to_string()).unwrap_or_default();

    // Check if anything changed since last backup
    {
        if let Ok(mut last) = BACKUP_LAST_OID.lock() {
            if let Some(ref last_oid) = *last {
                if last_oid == &head_oid_str {
                    return Ok(json!({"success": true, "skipped": true, "reason": "no changes since last backup"}));
                }
            }
            *last = Some(head_oid_str.clone());
        }
    }

    let filename = backup_name();
    let filepath = backup_dir.join(&filename);

    // Use git CLI to create bundle with all refs
    let output = std::process::Command::new("git")
        .args(["bundle", "create"])
        .arg(&filepath)
        .arg("--all")
        .current_dir(workspace_path)
        .output()
        .map_err(|e| format!("Failed to run git bundle create: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // "Refusing to create empty bundle" is not really an error — nothing to back up
        if stderr.contains("Refusing to create empty bundle") {
            return Ok(json!({"success": true, "skipped": true, "reason": "empty repository, nothing to back up"}));
        }
        return Err(format!("Bundle creation failed: {}", stderr));
    }

    let metadata = std::fs::metadata(&filepath).map_err(|e| e.to_string())?;
    let size = metadata.len();
    let timestamp = chrono::Local::now().timestamp_millis();

    // Enforce maxCount
    enforce_max_backups(&backup_dir)?;

    if let Some(app) = app_handle() {
        use tauri::Emitter;
        let _ = app.emit("backup:completed", json!({
            "filename": filename,
            "path": filepath.to_string_lossy(),
            "size": size,
            "timestamp": timestamp,
            "oid": head_oid_str
        }));
    }

    Ok(json!({
        "success": true,
        "skipped": false,
        "filename": filename,
        "path": filepath.to_string_lossy(),
        "size": size,
        "timestamp": timestamp,
        "oid": head_oid_str
    }))
}

fn enforce_max_backups(backup_dir: &Path) -> Result<(), String> {
    let config = config_read()?;
    let max_count: usize = config
        .get("backup")
        .and_then(|b| b.get("maxCount"))
        .and_then(|m| m.as_u64())
        .unwrap_or(20) as usize;

    let mut files: Vec<PathBuf> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(backup_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("bundle") {
                files.push(path);
            }
        }
    }

    files.sort_by(|a, b| {
        let a_name = a.file_name().unwrap_or_default().to_string_lossy();
        let b_name = b.file_name().unwrap_or_default().to_string_lossy();
        b_name.cmp(&a_name) // newest first by filename
    });

    while files.len() > max_count {
        if let Some(oldest) = files.pop() {
            let _ = std::fs::remove_file(&oldest);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn backup_list(workspace_path: String) -> Result<Vec<Value>, String> {
    let backup_dir = get_backup_dir(&workspace_path)?;
    if !backup_dir.exists() {
        return Ok(vec![]);
    }

    let mut results = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&backup_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("bundle") {
                continue;
            }
            let filename = path.file_name().unwrap_or_default().to_string_lossy();
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let ts = parse_backup_timestamp(&filename).unwrap_or(0);

            results.push(json!({
                "filename": filename,
                "path": path.to_string_lossy(),
                "size": size,
                "timestamp": ts
            }));
        }
    }

    results.sort_by(|a, b| {
        let a_ts = a.get("timestamp").and_then(|t| t.as_i64()).unwrap_or(0);
        let b_ts = b.get("timestamp").and_then(|t| t.as_i64()).unwrap_or(0);
        b_ts.cmp(&a_ts) // newest first
    });

    Ok(results)
}

#[tauri::command]
pub fn backup_restore(workspace_path: String, filename: String) -> Result<Value, String> {
    let backup_dir = get_backup_dir(&workspace_path)?;
    let bundle_path = backup_dir.join(&filename);
    if !bundle_path.exists() {
        return Err(format!("Backup file not found: {}", filename));
    }

    let _repo = git2::Repository::open(&workspace_path)
        .map_err(|e| format!("Cannot open repository: {}", e))?;

    // Create a restore branch name from the timestamp
    let branch_name = if let Some(ts) = parse_backup_timestamp(&filename) {
        let dt = chrono::DateTime::from_timestamp_millis(ts).unwrap_or_default();
        format!(
            "restore-{}",
            dt.format("%Y%m%d-%H%M%S")
        )
    } else {
        format!("restore-{}", uuid::Uuid::new_v4())
    };

    // Use git2 bundle verification and then fetch
    // First get the ref tips from the bundle
    let mut refs_to_fetch: Vec<String> = Vec::new();
    {
        // List refs from the bundle file using git bundle list-heads
        let output = std::process::Command::new("git")
            .args(["bundle", "list-heads"])
            .arg(&bundle_path)
            .current_dir(&workspace_path)
            .output()
            .map_err(|e| format!("Failed to run git bundle list-heads: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "Bundle verification failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                refs_to_fetch.push(parts[1].to_string());
            }
        }
    }

    if refs_to_fetch.is_empty() {
        return Err("No refs found in bundle".to_string());
    }

    // Fetch from the bundle using git fetch
    let fetch_output = std::process::Command::new("git")
        .args(["fetch"])
        .arg(&bundle_path)
        .args(&refs_to_fetch)
        .current_dir(&workspace_path)
        .output()
        .map_err(|e| format!("Failed to fetch from bundle: {}", e))?;

    if !fetch_output.status.success() {
        return Err(format!(
            "Fetch from bundle failed: {}",
            String::from_utf8_lossy(&fetch_output.stderr)
        ));
    }

    // Create restore branch from the first ref
    let first_ref = "FETCH_HEAD".to_string();
    let branch_output = std::process::Command::new("git")
        .args(["branch", &branch_name, &first_ref])
        .current_dir(&workspace_path)
        .output()
        .map_err(|e| format!("Failed to create restore branch: {}", e))?;

    if !branch_output.status.success() {
        return Err(format!(
            "Branch creation failed: {}",
            String::from_utf8_lossy(&branch_output.stderr)
        ));
    }

    Ok(json!({
        "success": true,
        "branch": branch_name
    }))
}

#[tauri::command]
pub fn backup_delete(workspace_path: String, filename: String) -> Result<Value, String> {
    let backup_dir = get_backup_dir(&workspace_path)?;
    let bundle_path = backup_dir.join(&filename);
    if !bundle_path.exists() {
        return Err(format!("Backup file not found: {}", filename));
    }
    std::fs::remove_file(&bundle_path).map_err(|e| e.to_string())?;
    Ok(json!({"success": true}))
}

#[tauri::command]
pub fn backup_start_auto(_workspace_path: String) -> Result<Value, String> {
    // Reset last oid so next tick always runs
    if let Ok(mut last) = BACKUP_LAST_OID.lock() {
        *last = None;
    }
    backup_start_auto_internal()?;
    Ok(json!({"success": true}))
}

fn backup_start_auto_internal() -> Result<(), String> {
    // Stop existing timer
    let _ = backup_stop_auto_internal();

    let config = config_read()?;
    let backup = config.get("backup").cloned().unwrap_or_default();
    let interval_minutes = backup
        .get("intervalMinutes")
        .and_then(|m| m.as_u64())
        .unwrap_or(30);

    let (tx, mut rx) = tokio::sync::oneshot::channel::<()>();

    if let Ok(mut cancel) = BACKUP_CANCEL.lock() {
        *cancel = Some(tx);
    }

    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(interval_minutes * 60));
        interval.tick().await; // skip immediate first tick
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    let workspace = match get_active_workspace() {
                        Ok(w) => w,
                        Err(_) => continue,
                    };
                    if let Err(e) = backup_internal(&workspace) {
                        log::error!("[backup] auto-backup failed: {}", e);
                    }
                }
                _ = &mut rx => {
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn backup_stop_auto() -> Result<Value, String> {
    backup_stop_auto_internal()?;
    Ok(json!({"success": true}))
}

fn backup_stop_auto_internal() -> Result<(), String> {
    if let Ok(mut cancel) = BACKUP_CANCEL.lock() {
        if let Some(tx) = cancel.take() {
            let _ = tx.send(());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // safe_join is always called with an already-canonical base (sanitize_path
    // canonicalizes first), so mirror that here.
    fn canonical_tmp() -> std::path::PathBuf {
        std::env::temp_dir().canonicalize().unwrap()
    }

    #[test]
    fn safe_join_allows_nested_relative() {
        let base = canonical_tmp();
        let p = safe_join(&base, "sub/dir/file.md").unwrap();
        assert!(p.starts_with(&base));
        assert!(p.ends_with("sub/dir/file.md"));
    }

    #[test]
    fn safe_join_blocks_parent_traversal() {
        let base = canonical_tmp();
        assert!(safe_join(&base, "../escape.md").is_err());
        assert!(safe_join(&base, "a/../../escape.md").is_err());
    }

    #[test]
    fn safe_join_blocks_absolute() {
        let base = canonical_tmp();
        assert!(safe_join(&base, "/etc/passwd").is_err());
    }

    #[test]
    fn sanitize_path_handles_empty_and_dot() {
        let base = canonical_tmp();
        let base_str = base.to_string_lossy().to_string();
        assert_eq!(sanitize_path(&base_str, "").unwrap(), base);
        assert_eq!(sanitize_path(&base_str, ".").unwrap(), base);
        assert!(sanitize_path(&base_str, "..").is_err());
    }

    #[test]
    fn take_utf8_passes_clean_ascii() {
        let mut carry = Vec::new();
        assert_eq!(take_utf8(&mut carry, b"hello\n"), "hello\n");
        assert!(carry.is_empty());
    }

    #[test]
    fn take_utf8_carries_split_codepoint() {
        // '€' is E2 82 AC. Split it across two reads — the first read must not emit a
        // replacement char; the byte stays buffered until completed.
        let mut carry = Vec::new();
        let euro = "€".as_bytes(); // [0xE2, 0x82, 0xAC]
        let first = take_utf8(&mut carry, &euro[..2]);
        assert_eq!(first, "");
        assert_eq!(carry.len(), 2);
        let second = take_utf8(&mut carry, &euro[2..]);
        assert_eq!(second, "€");
        assert!(carry.is_empty());
    }

    #[test]
    fn take_utf8_emits_valid_prefix_and_carries_tail() {
        let mut carry = Vec::new();
        let mut input = b"ab".to_vec();
        input.extend_from_slice(&"€".as_bytes()[..1]); // trailing incomplete byte
        let out = take_utf8(&mut carry, &input);
        assert_eq!(out, "ab");
        assert_eq!(carry.len(), 1);
    }
}
