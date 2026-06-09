use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

fn mdns_daemon() -> &'static OnceLock<ServiceDaemon> {
    static DAEMON: OnceLock<ServiceDaemon> = OnceLock::new();
    &DAEMON
}

fn get_mdns_daemon() -> Result<&'static ServiceDaemon, String> {
    let cell = mdns_daemon();
    if let Some(d) = cell.get() {
        return Ok(d);
    }
    let d = ServiceDaemon::new().map_err(|e| e.to_string())?;
    let _ = cell.set(d);
    Ok(cell.get().unwrap())
}

fn resolved_peers() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn start_discovery() -> Result<(), String> {
    let mdns = get_mdns_daemon()?;
    let service_type = "_canonic._tcp.local.";
    let receiver = mdns.browse(service_type).map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        while let Ok(event) = receiver.recv() {
            if let Some(app) = crate::commands::app_handle() {
                use tauri::Emitter;
                match event {
                    mdns_sd::ServiceEvent::ServiceResolved(info) => {
                        let token = info.get_property_val_str("token").unwrap_or("").to_string();
                        let scope = info.get_property_val_str("scope").unwrap_or("").to_string();
                        let permission = info.get_property_val_str("permission").unwrap_or("").to_string();
                        let author = info.get_property_val_str("author")
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| info.get_fullname().to_string());
                        let tagged_only = info.get_property_val_str("taggedOnly")
                            .map(|v| v == "true")
                            .unwrap_or(false);
                        let host = info.get_property_val_str("ip")
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| info.get_addresses().iter().next().map(|a| a.to_string()).unwrap_or_else(|| "127.0.0.1".to_string()));

                        let peer_id = format!("{}:{}", host, info.get_port());
                        if let Ok(mut cache) = resolved_peers().lock() {
                            cache.insert(info.get_fullname().to_string(), peer_id.clone());
                        }

                        let peer = serde_json::json!({
                            "id": peer_id,
                            "name": author,
                            "host": host,
                            "port": info.get_port(),
                            "token": token,
                            "scope": scope,
                            "permission": permission,
                            "taggedOnly": tagged_only,
                            "online": true
                        });
                        // Make the peer reachable by peers_fetch_manifest / peers_open_file.
                        crate::commands::register_discovered_peer(peer_id.clone(), peer.clone());
                        let _ = app.emit("peers:found", peer);
                    }
                    mdns_sd::ServiceEvent::ServiceRemoved(_, name) => {
                        let fullname = name.to_string();
                        let id = if let Ok(cache) = resolved_peers().lock() {
                            cache.get(&fullname).cloned()
                        } else {
                            None
                        };
                        if let Some(peer_id) = id {
                            crate::commands::unregister_discovered_peer(&peer_id);
                            let _ = app.emit("peers:lost", serde_json::json!({ "id": peer_id }));
                            if let Ok(mut cache) = resolved_peers().lock() {
                                cache.remove(&fullname);
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    });

    Ok(())
}

pub fn announce_share(
    port: u16,
    token: String,
    scope: String,
    permission: String,
    author: String,
    tagged_only: bool,
) -> Result<(), String> {
    let mdns = get_mdns_daemon()?;
    let ip = crate::server::get_lan_ip();
    let service_type = "_canonic._tcp.local.";
    let instance_name = format!("{}-{}", author, port);
    let host_name = format!("{}.local.", instance_name);

    let mut properties = HashMap::new();
    properties.insert("token".to_string(), token.clone());
    properties.insert("scope".to_string(), scope.clone());
    properties.insert("permission".to_string(), permission.clone());
    properties.insert("author".to_string(), author.clone());
    properties.insert("taggedOnly".to_string(), tagged_only.to_string());
    properties.insert("ip".to_string(), ip.clone());

    let my_service = ServiceInfo::new(
        service_type,
        &instance_name,
        &host_name,
        &ip,
        port,
        Some(properties),
    ).map_err(|e| e.to_string())?;

    mdns.register(my_service).map_err(|e| e.to_string())?;

    // loopback notify
    if let Some(app) = crate::commands::app_handle() {
        use tauri::Emitter;
        let _ = app.emit("peers:found", serde_json::json!({
            "id": format!("127.0.0.1:{}", port),
            "name": author,
            "host": "127.0.0.1",
            "port": port,
            "token": token,
            "scope": scope,
            "permission": permission,
            "taggedOnly": tagged_only,
            "online": true,
            "isSelf": true
        }));
    }

    Ok(())
}

pub fn unannounce_share(port: u16) -> Result<(), String> {
    let mdns = get_mdns_daemon()?;
    let author = std::env::var("USER").unwrap_or_else(|_| "Author".to_string());
    let instance_name = format!("{}-{}", author, port);
    let fullname = format!("{}._canonic._tcp.local.", instance_name);
    mdns.unregister(&fullname).map_err(|e| e.to_string())?;

    if let Some(app) = crate::commands::app_handle() {
        use tauri::Emitter;
        let _ = app.emit("peers:lost", serde_json::json!({ "id": format!("127.0.0.1:{}", port) }));
    }

    Ok(())
}
