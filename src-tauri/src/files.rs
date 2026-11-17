//! Backup files: the folder they live in, listing and pruning them, writing an export, and
//! restoring one. A restore is only recorded here; the file is swapped in at the next launch,
//! before the database is opened, so it never replaces a file that is in use.

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const RESTORE_MARKER: &str = "restore-from.txt";
const DATABASE: &str = "dailywork.db";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    name: String,
    path: String,
    size: u64,
    modified_ms: u64,
}

fn backups_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").map(PathBuf::from).ok_or("No home folder.")?;
    let dir = home.join("Documents").join("Daily Work Backups");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Only names the app itself makes, so nothing outside the backup folder can be touched.
fn safe_name(name: &str) -> Result<&str, String> {
    let ok = !name.is_empty()
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        && !name.starts_with('.');
    if ok {
        Ok(name)
    } else {
        Err(format!("Not a backup file name: {name}"))
    }
}

/// The folder backups go in, created if needed: ~/Documents/Daily Work Backups.
#[tauri::command]
pub fn backups_folder() -> Result<String, String> {
    Ok(backups_dir()?.display().to_string())
}

/// Backup files, newest first.
#[tauri::command]
pub fn backups_list() -> Result<Vec<BackupFile>, String> {
    let dir = backups_dir()?;
    let mut files: Vec<BackupFile> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|entry| entry.path().extension().map(|ext| ext == "db").unwrap_or(false))
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            let modified_ms = meta
                .modified()
                .ok()?
                .duration_since(std::time::UNIX_EPOCH)
                .ok()?
                .as_millis() as u64;
            Some(BackupFile {
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry.path().display().to_string(),
                size: meta.len(),
                modified_ms,
            })
        })
        .collect();
    files.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(files)
}

/// The full path for a new file in the backup folder. Fails if it already exists.
#[tauri::command]
pub fn backups_new_path(name: String) -> Result<String, String> {
    let path = backups_dir()?.join(safe_name(&name)?);
    if path.exists() {
        return Err(format!("{} already exists.", path.display()));
    }
    Ok(path.display().to_string())
}

/// Keeps the newest `keep` database backups and deletes the rest. Exports are left alone.
#[tauri::command]
pub fn backups_prune(keep: usize) -> Result<usize, String> {
    let files = backups_list()?;
    let mut removed = 0;
    for file in files.iter().skip(keep.max(1)) {
        if std::fs::remove_file(&file.path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

/// Writes text (an export) into the backup folder and returns where.
#[tauri::command]
pub fn backups_write_text(name: String, text: String) -> Result<String, String> {
    let path = backups_dir()?.join(safe_name(&name)?);
    std::fs::write(&path, text).map_err(|e| format!("Could not write {}: {e}", path.display()))?;
    Ok(path.display().to_string())
}

/// Marks a backup to be restored, then restarts the app, which swaps it in before opening it.
#[tauri::command]
pub fn backups_restore(app: AppHandle, name: String) -> Result<(), String> {
    let source = backups_dir()?.join(safe_name(&name)?);
    if !source.is_file() {
        return Err(format!("{} is not there any more.", source.display()));
    }
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::write(config.join(RESTORE_MARKER), source.display().to_string()).map_err(|e| e.to_string())?;
    app.restart();
}

/// Runs at launch, before the web app opens the database. Keeps the current file beside it in
/// case the restore was a mistake.
pub fn apply_pending_restore(config: &Path) {
    let marker = config.join(RESTORE_MARKER);
    let Ok(source) = std::fs::read_to_string(&marker) else { return };
    let _ = std::fs::remove_file(&marker);
    let source = PathBuf::from(source.trim());
    let database = config.join(DATABASE);
    if !source.is_file() {
        eprintln!("Restore skipped: {} is missing", source.display());
        return;
    }
    if database.exists() {
        let _ = std::fs::copy(&database, config.join("dailywork-before-restore.db"));
    }
    for suffix in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(config.join(format!("{DATABASE}{suffix}")));
    }
    if let Err(error) = std::fs::copy(&source, &database) {
        eprintln!("Restore failed: {error}");
    }
}

#[derive(serde::Deserialize)]
pub struct SnapshotFile {
    name: String,
    text: String,
}

/// Replaces the agent snapshot: the read-only copy of the app's data that agent runs may read.
/// Lives in the app's own data folder; returns its path.
#[tauri::command]
pub fn snapshot_write(app: AppHandle, files: Vec<SnapshotFile>) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("agent-snapshot");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        if entry.path().extension().map(|ext| ext == "md").unwrap_or(false) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    for file in files {
        std::fs::write(dir.join(safe_name(&file.name)?), file.text).map_err(|e| e.to_string())?;
    }
    Ok(dir.display().to_string())
}
