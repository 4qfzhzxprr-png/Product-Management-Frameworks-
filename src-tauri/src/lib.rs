//! The native wrapper: menu bar item, global shortcut and windows.
//! All product logic lives in the web app under `src/`.

mod agents;
mod files;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const MAIN_WINDOW: &str = "main";
const CAPTURE_WINDOW: &str = "capture";
const TRAY_ID: &str = "main";

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn open_capture(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(CAPTURE_WINDOW) {
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
        // Tells the form to start empty.
        let _ = window.emit("capture-opened", ());
    }
}

fn toggle_capture(app: &AppHandle) {
    let visible = app
        .get_webview_window(CAPTURE_WINDOW)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    if visible {
        if let Some(window) = app.get_webview_window(CAPTURE_WINDOW) {
            let _ = window.hide();
        }
    } else {
        open_capture(app);
    }
}

/// Shows the number of items waiting on David beside the menu bar icon.
#[tauri::command]
fn set_waiting_count(app: AppHandle, count: u32) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let title = (count > 0).then(|| count.to_string());
        let _ = tray.set_title(title);
        let tooltip = match count {
            0 => "Daily Work: nothing waiting on you".to_string(),
            1 => "Daily Work: 1 item waiting on you".to_string(),
            n => format!("Daily Work: {n} items waiting on you"),
        };
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

#[tauri::command]
fn show_capture(app: AppHandle) {
    open_capture(&app);
}

/// Secrets for connections (tokens, passwords), one Keychain entry per connection.
/// The app stores them as a JSON string; this layer only moves the string in and out.
mod secrets {
    const SERVICE: &str = "app.dailywork.desktop";

    fn account(connection_id: u32) -> String {
        format!("connection-{connection_id}")
    }

    #[cfg(target_os = "macos")]
    pub fn get(connection_id: u32) -> Result<Option<String>, String> {
        let entry = keyring::Entry::new(SERVICE, &account(connection_id)).map_err(|e| e.to_string())?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    #[cfg(target_os = "macos")]
    pub fn set(connection_id: u32, value: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(SERVICE, &account(connection_id)).map_err(|e| e.to_string())?;
        entry.set_password(value).map_err(|e| e.to_string())
    }

    #[cfg(target_os = "macos")]
    pub fn delete(connection_id: u32) -> Result<(), String> {
        let entry = keyring::Entry::new(SERVICE, &account(connection_id)).map_err(|e| e.to_string())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }

    // The app ships for macOS only. Elsewhere (Linux test runs) secrets live in memory for
    // the session and are never written anywhere.
    #[cfg(not(target_os = "macos"))]
    static MEMORY: std::sync::Mutex<Option<std::collections::HashMap<String, String>>> =
        std::sync::Mutex::new(None);

    #[cfg(not(target_os = "macos"))]
    pub fn get(connection_id: u32) -> Result<Option<String>, String> {
        let memory = MEMORY.lock().map_err(|e| e.to_string())?;
        Ok(memory.as_ref().and_then(|map| map.get(&account(connection_id)).cloned()))
    }

    #[cfg(not(target_os = "macos"))]
    pub fn set(connection_id: u32, value: &str) -> Result<(), String> {
        let mut memory = MEMORY.lock().map_err(|e| e.to_string())?;
        memory.get_or_insert_with(Default::default).insert(account(connection_id), value.to_string());
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    pub fn delete(connection_id: u32) -> Result<(), String> {
        let mut memory = MEMORY.lock().map_err(|e| e.to_string())?;
        if let Some(map) = memory.as_mut() {
            map.remove(&account(connection_id));
        }
        Ok(())
    }
}

#[tauri::command]
fn secret_get(connection_id: u32) -> Result<Option<String>, String> {
    secrets::get(connection_id)
}

#[tauri::command]
fn secret_set(connection_id: u32, value: String) -> Result<(), String> {
    secrets::set(connection_id, &value)
}

#[tauri::command]
fn secret_delete(connection_id: u32) -> Result<(), String> {
    secrets::delete(connection_id)
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let capture = MenuItem::with_id(app, "capture", "Quick Capture", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open Daily Work", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Daily Work", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&capture, &open, &separator, &quit])?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(tauri::include_image!("icons/tray.png"))
        .icon_as_template(true)
        .tooltip("Daily Work")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "capture" => open_capture(app),
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_capture(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            set_waiting_count,
            show_capture,
            secret_get,
            secret_set,
            secret_delete,
            agents::agents_read_dir,
            agents::agent_find_claude,
            agents::agent_start,
            agents::agent_cancel,
            files::backups_folder,
            files::backups_list,
            files::backups_new_path,
            files::backups_prune,
            files::backups_write_text,
            files::backups_restore,
            files::snapshot_write
        ])
        .manage(agents::Runs::default())
        .setup(|app| {
            // A restore chosen before the last restart is swapped in before anything opens the database.
            if let Ok(config) = app.path().app_config_dir() {
                files::apply_pending_restore(&config);
            }
            build_tray(app.handle())?;

            // Control-Option-Space. If another app owns it, capture still works from the menu.
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);
            if let Err(error) = app.global_shortcut().register(shortcut) {
                eprintln!("Could not register the capture shortcut: {error}");
            }

            if let Some(capture) = app.get_webview_window(CAPTURE_WINDOW) {
                let _ = capture.set_visible_on_all_workspaces(true);
            }
            Ok(())
        })
        // Closing a window hides it, so the menu bar item and shortcut keep running.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building the Daily Work app");

    app.run(|_app, _event| {
        // Clicking the Dock icon brings the main window back.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = _event {
            show_main(_app);
        }
    });
}
