use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Welcome to GSPL Paradigm, {}! Your seeds await.", name)
}

#[tauri::command]
fn get_status() -> serde_json::Value {
    serde_json::json!({
        "version": "1.0.0",
        "platform": "desktop",
        "engine": "tauri-v2"
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, get_status])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running GSPL Paradigm");
}
