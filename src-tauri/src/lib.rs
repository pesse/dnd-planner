use std::fs;
use std::path::{Path, PathBuf};

/// Findet das Projekt-Root (das Verzeichnis das "vault/" enthält)
fn project_root() -> PathBuf {
    // Strategie: vom current_dir aus nach oben suchen bis "vault" gefunden wird
    let mut dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    loop {
        if dir.join("vault").is_dir() {
            return dir;
        }
        if !dir.pop() {
            break;
        }
    }
    // Fallback: neben dem Binary suchen
    if let Ok(exe) = std::env::current_exe() {
        let mut d = exe.clone();
        while d.pop() {
            if d.join("vault").is_dir() {
                return d;
            }
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn resolve_path(path: &str) -> PathBuf {
    let p = Path::new(path);
    if p.is_absolute() {
        return p.to_path_buf();
    }
    // Relative Pfade wie "./vault/..." gegen project_root auflösen
    let stripped = path.trim_start_matches("./");
    project_root().join(stripped)
}

#[tauri::command]
fn get_current_dir() -> String {
    format!(
        "cwd={} | root={}",
        std::env::current_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
        project_root().to_string_lossy()
    )
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<String>, String> {
    let path = resolve_path(&path);
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut files: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name();
            let name_str = name.to_string_lossy();
            e.path().is_file() && name_str.ends_with(".md")
        })
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    files.sort();
    Ok(files)
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    let path = resolve_path(&path);
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file_content(path: String, content: String) -> Result<(), String> {
    let path = resolve_path(&path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_current_dir,
            list_directory,
            read_file_content,
            write_file_content
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
