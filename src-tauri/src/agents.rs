//! Runs David's Claude Code agents. The web app decides what to run and with which arguments;
//! this module only reads the agent folder, finds the `claude` program, starts it, streams its
//! output lines back as events, and stops it on request. No shell is involved in a run: the
//! arguments go to the program as a list and the brief goes in on standard input.

use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex, OnceLock},
    thread,
};
use tauri::{AppHandle, Emitter, State};

/// Runs in progress, by run id, so they can be stopped.
#[derive(Default)]
pub struct Runs(Arc<Mutex<HashMap<i64, Child>>>);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFile {
    file_name: String,
    text: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LineEvent {
    run_id: i64,
    line: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ExitEvent {
    run_id: i64,
    code: Option<i32>,
    stderr: String,
}

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"))
}

/// "~" and "~/x" mean the home folder.
fn expand(path: &str) -> PathBuf {
    let path = path.trim();
    if path == "~" {
        home()
    } else if let Some(rest) = path.strip_prefix("~/") {
        home().join(rest)
    } else {
        PathBuf::from(path)
    }
}

/// The PATH a Terminal window would have. Apps opened from the Finder get a bare PATH, which
/// misses where Claude Code and Node are usually installed, so ask the login shell once.
fn login_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let from_shell = Command::new(&shell)
            .args(["-lc", "printf %s \"$PATH\""])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .ok()
            .filter(|output| output.status.success())
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
            .unwrap_or_default();
        let home = home();
        let extra = [
            home.join(".local/bin"),
            home.join(".claude/local"),
            home.join(".npm-global/bin"),
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
        ];
        let mut parts: Vec<String> = Vec::new();
        for part in from_shell
            .split(':')
            .chain(std::env::var("PATH").unwrap_or_default().split(':'))
            .map(str::to_string)
            .chain(extra.iter().map(|path| path.display().to_string()))
        {
            if !part.is_empty() && !parts.contains(&part) {
                parts.push(part);
            }
        }
        parts.join(":")
    })
}

fn is_program(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata().map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0).unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

/// Reads the `.md` files in the agent folder. Other files and subfolders are left alone.
#[tauri::command]
pub fn agents_read_dir(folder: String) -> Result<Vec<AgentFile>, String> {
    let path = expand(&folder);
    let entries = std::fs::read_dir(&path).map_err(|_| format!("There is no folder at {}.", path.display()))?;
    let mut files = Vec::new();
    for entry in entries.flatten() {
        let file = entry.path();
        let is_markdown = file.extension().map(|ext| ext.eq_ignore_ascii_case("md")).unwrap_or(false);
        let small = entry.metadata().map(|meta| meta.is_file() && meta.len() < 1_000_000).unwrap_or(false);
        if !is_markdown || !small {
            continue;
        }
        if let Ok(text) = std::fs::read_to_string(&file) {
            files.push(AgentFile { file_name: entry.file_name().to_string_lossy().to_string(), text });
        }
    }
    Ok(files)
}

/// Finds Claude Code: the path David entered, or `claude` on the login shell's PATH.
#[tauri::command]
pub fn agent_find_claude(configured: String) -> Result<String, String> {
    if !configured.trim().is_empty() {
        let path = expand(&configured);
        return if is_program(&path) {
            Ok(path.display().to_string())
        } else {
            Err(format!("There is no Claude Code program at {}.", path.display()))
        };
    }
    login_path()
        .split(':')
        .map(|dir| Path::new(dir).join("claude"))
        .find(|candidate| is_program(candidate))
        .map(|found| found.display().to_string())
        .ok_or_else(|| "Claude Code was not found. Install it, or enter where it is under Settings.".to_string())
}

/// Starts a run and returns at once. Output arrives as `agent-line` events and the end as one
/// `agent-exit` event, each carrying the run id.
#[tauri::command]
pub fn agent_start(
    app: AppHandle,
    runs: State<'_, Runs>,
    run_id: i64,
    program: String,
    args: Vec<String>,
    prompt: String,
    cwd: String,
) -> Result<(), String> {
    let folder = expand(&cwd);
    if !folder.is_dir() {
        return Err(format!("The work folder {} does not exist.", folder.display()));
    }
    let mut child = Command::new(&program)
        .args(&args)
        .current_dir(&folder)
        .env("PATH", login_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start Claude Code: {error}"))?;

    let mut stdin = child.stdin.take().ok_or("Could not write to Claude Code.")?;
    let stdout = child.stdout.take().ok_or("Could not read from Claude Code.")?;
    let mut stderr = child.stderr.take().ok_or("Could not read from Claude Code.")?;
    runs.0.lock().map_err(|e| e.to_string())?.insert(run_id, child);

    thread::spawn(move || {
        let _ = stdin.write_all(prompt.as_bytes());
        // Dropping stdin closes it, which tells Claude Code the brief is complete.
    });

    let errors = thread::spawn(move || {
        let mut text = String::new();
        let _ = stderr.read_to_string(&mut text);
        // Keep the end, where the reason for a failure usually is.
        if text.len() > 8_000 {
            let cut = text.len() - 8_000;
            let cut = (cut..text.len()).find(|&index| text.is_char_boundary(index)).unwrap_or(cut);
            text = text[cut..].to_string();
        }
        text
    });

    let table = runs.0.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut buffer = Vec::new();
        loop {
            buffer.clear();
            match reader.read_until(b'\n', &mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let line = String::from_utf8_lossy(&buffer).trim_end().to_string();
                    if !line.is_empty() {
                        let _ = app.emit("agent-line", LineEvent { run_id, line });
                    }
                }
            }
        }
        let stderr = errors.join().unwrap_or_default();
        let child = table.lock().ok().and_then(|mut map| map.remove(&run_id));
        let code = child.and_then(|mut child| child.wait().ok()).and_then(|status| status.code());
        let _ = app.emit("agent-exit", ExitEvent { run_id, code, stderr });
    });
    Ok(())
}

/// Stops a run. Its output so far is kept; the exit event still follows.
#[tauri::command]
pub fn agent_cancel(runs: State<'_, Runs>, run_id: i64) -> Result<(), String> {
    if let Some(child) = runs.0.lock().map_err(|e| e.to_string())?.get_mut(&run_id) {
        let _ = child.kill();
    }
    Ok(())
}
