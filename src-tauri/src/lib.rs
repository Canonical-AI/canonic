mod commands;
mod diff;
pub mod mcp;
pub mod server;
pub mod discovery;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[allow(unused_mut)]
  let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init());

  // macOS-only: register decorum so the native traffic-light buttons are
  // repositioned (and kept in place on resize) to sit centered in our custom
  // 44px titlebar. The crate dependency is target-gated in Cargo.toml, so this
  // does not touch Linux/Windows builds.
  #[cfg(target_os = "macos")]
  {
    builder = builder.plugin(tauri_plugin_decorum::init());
  }

  builder
    .setup(|app| {
      // Cache the AppHandle globally so background threads can emit events
      commands::set_app_handle(app.handle().clone());

      // Auto-updater (desktop only). Checks GitHub releases for a signed
      // `latest.json`; the update_check/download/install commands drive it.
      #[cfg(desktop)]
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

      // Start the local MCP server so agents (Claude/Codex/Gemini/…) get Canonic tools.
      // Bound to 127.0.0.1 on a random port; port is exposed via agent_control_get_mcp_port.
      mcp::start_mcp_server(app.handle().clone());

      // Build the native application menu (emits menu:* events to the renderer).
      // macOS only: there it becomes the global menu bar. On Linux/Windows
      // `set_menu` attaches an in-window GTK/Win32 menu bar that collides with
      // our custom Vue titlebar (the stray "Canonic"/"Edit" strip), so we rely
      // on AppMenu.vue there instead.
      #[cfg(target_os = "macos")]
      let _ = commands::build_app_menu(app.handle());

      // Frameless custom chrome on Linux/Windows: drop the native window
      // decorations so our themed titlebar + window controls are the only chrome.
      // macOS keeps its decorations (traffic lights overlay via titleBarStyle).
      #[cfg(all(desktop, not(target_os = "macos")))]
      {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
          let _ = window.set_decorations(false);
        }
      }

      // Start peer discovery browser
      let _ = discovery::start_discovery();

      // Flush queued peer comments to online peers on a 30s loop.
      commands::start_peer_comment_sync();

      // Apply initial window vibrancy/translucency on macOS
      #[cfg(target_os = "macos")]
      {
        use tauri::Manager;
        use tauri_plugin_decorum::WebviewWindowExt;
        if let Some(window) = app.get_webview_window("main") {
            commands::apply_window_effects(&window);
            // Center the native traffic-light buttons within the 36px custom
            // titlebar: 12px left inset, y=12 ≈ (36 - button_height)/2.
            let _ = window.set_traffic_lights_inset(12.0, 12.0);
        }
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::config_read,
      commands::config_write,
      commands::config_exists,
      commands::config_validate,
      commands::app_version,
      commands::app_is_default_md,
      commands::app_set_default_md,
      commands::app_open_config,
      commands::app_edit_action,
      commands::set_window_theme,
      commands::telemetry_log,
      commands::dialog_confirm,
      commands::dialog_open_directory,
      commands::workspace_open_dialog,
      commands::workspace_init,
      commands::workspace_get_default,
      commands::workspace_recent_list,
      commands::workspace_recent_add,
      commands::workspace_recent_remove,
      commands::files_open_dialog,
      commands::files_list,
      commands::files_tree,
      commands::files_read,
      commands::files_write,
      commands::files_write_binary,
      commands::files_delete,
      commands::files_new,
      commands::files_mkdir,
      commands::files_rmdir,
      commands::files_move,
      commands::files_index,
      commands::files_trash_delete,
      commands::files_trash_list,
      commands::files_trash_restore,
      commands::files_trash_purge,
      commands::git_commit,
      commands::git_log,
      commands::git_branches,
      commands::git_create_branch,
      commands::git_checkout,
      commands::git_merge,
      commands::git_diff,
      commands::git_commit_diff,
      commands::git_read_commit,
      commands::git_status,
      commands::git_delete_branch,
      commands::git_log_all,
      commands::git_file_status,
      commands::git_is_file_tracked,
      commands::comments_get,
      commands::comments_save,
      commands::comments_move,
      commands::search_query,
      commands::search_index,
      commands::search_workspace,
      commands::search_workspace_replace,
      commands::share_start,
      commands::share_stop,
      commands::share_open_link,
      commands::share_open_shared,
      commands::share_stats,
      commands::share_start_workspace,
      commands::share_start_all_workspaces,
      commands::share_stop_workspace,
      commands::share_workspace_stats,
      commands::share_list_active,
      commands::peers_list,
      commands::peers_list_discovered,
      commands::peers_favorite,
      commands::peers_unfavorite,
      commands::peers_fetch_manifest,
      commands::peers_connect_manual,
      commands::peers_open_file,
      commands::cleanup_reset_config,
      commands::cleanup_delete_workspace,
      commands::cleanup_get_paths,
      commands::demo_register,
      commands::demo_cleanup,
      commands::update_check,
      commands::update_download,
      commands::update_install,
      commands::doc_branches_get,
      commands::doc_branches_set,
      commands::versions_list,
      commands::versions_save,
      commands::versions_delete,
      commands::ai_chat,
      commands::ai_cancel,
      commands::ai_complete,
      commands::agent_submit,
      commands::agent_cancel,
      commands::agent_control_get_presets,
      commands::agent_control_get_models,
      commands::agent_control_check_installed,
      commands::agent_control_get_custom_agents,
      commands::agent_control_add_custom_agent,
      commands::agent_control_remove_custom_agent,
      commands::agent_control_start_session,
      commands::agent_control_send_message,
      commands::agent_control_resume,
      commands::agent_control_stop_session,
      commands::agent_control_open_terminal,
      commands::pty_popout,
      commands::pty_spawn,
      commands::pty_input,
      commands::pty_resize,
      commands::pty_kill,
      commands::agent_control_get_history,
      commands::agent_control_save_history,
      commands::agent_control_delete_history,
      commands::mcp_set_editor_state,
      commands::agent_control_get_mcp_port,
      commands::agent_control_check_mcp,
      commands::agent_control_register_mcp,
      commands::agent_control_opt_out_mcp,
      commands::backup_get_config,
      commands::backup_set_config,
      commands::backup_get_workspace_config,
      commands::backup_set_workspace_config,
      commands::backup_run,
      commands::backup_list,
      commands::backup_restore,
      commands::backup_delete,
      commands::backup_start_auto,
      commands::backup_stop_auto
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
