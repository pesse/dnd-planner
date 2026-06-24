use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use keyring::Entry;

#[derive(Deserialize)]
pub struct HttpRequest {
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: String,
}

/// Führt einen HTTP-Request aus Rust heraus durch (umgeht WebView CORS/TLS-Probleme).
/// Gibt den Response-Body als String zurück.
#[tauri::command]
async fn http_request(req: HttpRequest) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .build()
        .map_err(|e| e.to_string())?;

    let method = reqwest::Method::from_bytes(req.method.as_bytes())
        .map_err(|e| e.to_string())?;

    let mut builder = client.request(method, &req.url);
    for (k, v) in &req.headers {
        builder = builder.header(k, v);
    }
    builder = builder.body(req.body);

    let res = builder.send().await.map_err(|e| format!("Netzwerkfehler: {}", e))?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(|e| e.to_string())?;

    if status >= 400 {
        return Err(format!("HTTP {}: {}", status, text));
    }
    Ok(text)
}

/// Findet das Projekt-Root (das Verzeichnis das "vault/" enthält)
fn project_root() -> PathBuf {
    let mut dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    loop {
        if dir.join("vault").is_dir() {
            return dir;
        }
        if !dir.pop() {
            break;
        }
    }
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
    let stripped = path.trim_start_matches("./");
    project_root().join(stripped)
}

#[derive(Serialize)]
pub struct EntryInfo {
    name: String,
    is_dir: bool,
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

/// Listet Dateien (.md) UND Unterverzeichnisse — für die Charakterliste
#[tauri::command]
fn list_entries(path: String) -> Result<Vec<EntryInfo>, String> {
    let path = resolve_path(&path);
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut result: Vec<EntryInfo> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let is_dir = e.path().is_dir();
            let is_md = e.path().is_file() && name.ends_with(".md");
            if is_dir || is_md {
                Some(EntryInfo { name, is_dir })
            } else {
                None
            }
        })
        .collect();
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

/// Listet .json-Dateien UND Unterverzeichnisse — für die Monster-Bibliothek
#[tauri::command]
fn list_json_entries(path: String) -> Result<Vec<EntryInfo>, String> {
    let path = resolve_path(&path);
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut result: Vec<EntryInfo> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let is_dir = e.path().is_dir();
            let is_json = e.path().is_file() && name.ends_with(".json");
            if is_dir || is_json {
                Some(EntryInfo { name, is_dir })
            } else {
                None
            }
        })
        .collect();
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

/// Sucht die erste .pdf-Datei in einem Verzeichnis
#[tauri::command]
fn find_pdf_in_dir(path: String) -> Result<Option<String>, String> {
    let path = resolve_path(&path);
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    for entry in entries.filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".pdf") {
            return Ok(Some(name));
        }
    }
    Ok(None)
}

/// Gibt den absoluten Pfad eines (ggf. relativen) Vault-Pfades zurück.
#[tauri::command]
fn get_absolute_path(path: String) -> Result<String, String> {
    Ok(resolve_path(&path).to_string_lossy().to_string())
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    let path = resolve_path(&path);
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Liest eine Binärdatei (z.B. PDF) als Base64-String
#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    let path = resolve_path(&path);
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(base64_encode(&bytes))
}

/// Schreibt eine Binärdatei aus einem Base64-String (z.B. exportiertes PDF)
#[tauri::command]
fn write_file_base64(path: String, data: String) -> Result<(), String> {
    let path = resolve_path(&path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = base64_decode(&data).map_err(|e| e)?;
    fs::write(&path, bytes).map_err(|e| e.to_string())
}

fn base64_decode(data: &str) -> Result<Vec<u8>, String> {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut table = [0xffu8; 256];
    for (i, &c) in CHARS.iter().enumerate() {
        table[c as usize] = i as u8;
    }
    let input: Vec<u8> = data.bytes().filter(|&c| c != b'=' && c != b'\n' && c != b'\r').collect();
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    for chunk in input.chunks(4) {
        let v: Vec<u8> = chunk.iter().map(|&c| {
            let v = table[c as usize];
            if v == 0xff { 0 } else { v }
        }).collect();
        let n = match v.len() {
            4 => ((v[0] as u32) << 18) | ((v[1] as u32) << 12) | ((v[2] as u32) << 6) | (v[3] as u32),
            3 => ((v[0] as u32) << 18) | ((v[1] as u32) << 12) | ((v[2] as u32) << 6),
            2 => ((v[0] as u32) << 18) | ((v[1] as u32) << 12),
            _ => continue,
        };
        out.push(((n >> 16) & 0xff) as u8);
        if v.len() > 2 { out.push(((n >> 8) & 0xff) as u8); }
        if v.len() > 3 { out.push((n & 0xff) as u8); }
    }
    Ok(out)
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((n >> 18) & 63) as usize] as char);
        result.push(CHARS[((n >> 12) & 63) as usize] as char);
        result.push(if chunk.len() > 1 { CHARS[((n >> 6) & 63) as usize] as char } else { '=' });
        result.push(if chunk.len() > 2 { CHARS[(n & 63) as usize] as char } else { '=' });
    }
    result
}

#[tauri::command]
fn write_file_content(path: String, content: String) -> Result<(), String> {
    let path = resolve_path(&path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Listet .json-Dateien in einem Verzeichnis — für Monster- und Encounter-Bibliothek
#[tauri::command]
fn list_json_files(path: String) -> Result<Vec<String>, String> {
    let path = resolve_path(&path);
    if !path.exists() {
        return Ok(vec![]);
    }
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut files: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name();
            let name_str = name.to_string_lossy();
            e.path().is_file() && name_str.ends_with(".json")
        })
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    files.sort();
    Ok(files)
}

#[derive(Serialize)]
pub struct SpellInfo {
    name: String,
    level: u8,
    classes: Vec<String>,
    school: String,
    path: String,
}

/// Lädt alle Zauber aus vault/spells/** als kompakten Index (Name, Stufe, Klassen).
#[tauri::command]
fn load_spells_index(path: String) -> Result<Vec<SpellInfo>, String> {
    let base = resolve_path(&path);
    let mut spells: Vec<SpellInfo> = Vec::new();
    collect_spells(&base, &mut spells);
    spells.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(spells)
}

fn collect_spells(dir: &std::path::Path, out: &mut Vec<SpellInfo>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_dir() {
            collect_spells(&path, out);
        } else if path.extension().map(|e| e == "json").unwrap_or(false) {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                    let name = v["name"].as_str().unwrap_or("").to_string();
                    if name.is_empty() { continue; }
                    let level = v["level"].as_u64()
                        .or_else(|| v["level"].as_str().and_then(|s| s.parse().ok()))
                        .unwrap_or(0) as u8;
                    let classes = v["classes"].as_array()
                        .map(|arr| arr.iter().filter_map(|c| c.as_str().map(|s| s.to_string())).collect())
                        .unwrap_or_default();
                    let school = v["school"].as_str().unwrap_or("").to_string();
                    // Relativer Pfad ab Projekt-Root: ./vault/spells/...
                    let rel = path.strip_prefix(&project_root())
                        .map(|p| format!("./{}", p.to_string_lossy().replace('\\', "/")))
                        .unwrap_or_else(|_| path.to_string_lossy().to_string());
                    out.push(SpellInfo { name, level, classes, school, path: rel });
                }
            }
        }
    }
}

/// Löscht eine Datei oder ein Verzeichnis (rekursiv). Für Vault-Einträge inkl.
/// ordnerbasierter Entitäten (Charaktere, Akte, Kampagnen).
#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let path = resolve_path(&path);
    if !path.exists() {
        return Err(format!("Pfad existiert nicht: {}", path.display()));
    }
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    let old = resolve_path(&old_path);
    let new = resolve_path(&new_path);
    if let Some(parent) = new.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&old, &new).map_err(|e| e.to_string())
}

/// Speichert einen API-Key im OS-Keychain (Windows Credential Manager / macOS Keychain / libsecret).
/// `provider` ist der Service-Name, z.B. "anthropic" oder "groq".
#[tauri::command]
fn save_api_key(provider: String, key: String) -> Result<(), String> {
    Entry::new("dnd-planner", &provider)
        .map_err(|e| e.to_string())?
        .set_password(&key)
        .map_err(|e| e.to_string())
}

/// Lädt einen API-Key aus dem OS-Keychain. Gibt None zurück wenn kein Key gespeichert ist.
#[tauri::command]
fn load_api_key(provider: String) -> Result<Option<String>, String> {
    match Entry::new("dnd-planner", &provider).map_err(|e| e.to_string())?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Löscht einen API-Key aus dem OS-Keychain.
#[tauri::command]
fn delete_api_key(provider: String) -> Result<(), String> {
    match Entry::new("dnd-planner", &provider).map_err(|e| e.to_string())?.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vault Import / Export (ZIP)
// ─────────────────────────────────────────────────────────────────────────────

/// Auswahl der zu im-/exportierenden Vault-Bereiche. `campaigns`/`characters`
/// enthalten die Ordner-Slugs; `items`/`monsters`/`spells` sind ganze Kategorien.
#[derive(Deserialize)]
pub struct TransferSelection {
    #[serde(default)]
    campaigns: Vec<String>,
    #[serde(default)]
    characters: Vec<String>,
    #[serde(default)]
    items: bool,
    #[serde(default)]
    monsters: bool,
    #[serde(default)]
    spells: bool,
}

/// Inhaltsübersicht eines Vaults bzw. eines Export-ZIPs.
#[derive(Serialize)]
pub struct VaultContents {
    campaigns: Vec<String>,
    characters: Vec<String>,
    items: bool,
    monsters: bool,
    spells: bool,
}

#[derive(Serialize)]
pub struct ExportSummary {
    files: usize,
    bytes: u64,
}

#[derive(Serialize)]
pub struct ImportSummary {
    written: usize,
    skipped: usize,
}

/// Direkte Unterverzeichnisse (Slugs) eines Pfades, alphabetisch sortiert.
fn subdirs(path: &Path) -> Vec<String> {
    let mut v: Vec<String> = match fs::read_dir(path) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect(),
        Err(_) => vec![],
    };
    v.sort();
    v
}

/// True, wenn `path` (rekursiv) mindestens eine Datei enthält.
fn dir_has_files(path: &Path) -> bool {
    if let Ok(rd) = fs::read_dir(path) {
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if p.is_file() {
                return true;
            }
            if p.is_dir() && dir_has_files(&p) {
                return true;
            }
        }
    }
    false
}

/// Sammelt rekursiv alle Dateien unter `base` als (Festplatten-Pfad, ZIP-Name).
fn collect_files(base: &Path, prefix: &str, out: &mut Vec<(PathBuf, String)>) {
    let entries = match fs::read_dir(base) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let zip_name = if prefix.is_empty() {
            name
        } else {
            format!("{}/{}", prefix, name)
        };
        if path.is_dir() {
            collect_files(&path, &zip_name, out);
        } else if path.is_file() {
            out.push((path, zip_name));
        }
    }
}

/// Übersicht über die exportierbaren Inhalte des aktuellen Vaults.
#[tauri::command]
fn get_vault_overview() -> VaultContents {
    let vault = project_root().join("vault");
    VaultContents {
        campaigns: subdirs(&vault.join("campaigns")),
        characters: subdirs(&vault.join("characters")),
        items: dir_has_files(&vault.join("items")),
        monsters: dir_has_files(&vault.join("monsters")),
        spells: dir_has_files(&vault.join("spells")),
    }
}

/// Exportiert die gewählten Vault-Bereiche als ZIP nach `dest_path` (absoluter Pfad).
#[tauri::command]
fn export_vault(selection: TransferSelection, dest_path: String) -> Result<ExportSummary, String> {
    let vault = project_root().join("vault");
    let mut files: Vec<(PathBuf, String)> = Vec::new();

    for slug in &selection.campaigns {
        collect_files(
            &vault.join("campaigns").join(slug),
            &format!("campaigns/{}", slug),
            &mut files,
        );
    }
    for slug in &selection.characters {
        collect_files(
            &vault.join("characters").join(slug),
            &format!("characters/{}", slug),
            &mut files,
        );
    }
    if selection.items {
        collect_files(&vault.join("items"), "items", &mut files);
    }
    if selection.monsters {
        collect_files(&vault.join("monsters"), "monsters", &mut files);
    }
    if selection.spells {
        collect_files(&vault.join("spells"), "spells", &mut files);
    }

    let file = fs::File::create(&dest_path)
        .map_err(|e| format!("ZIP konnte nicht erstellt werden: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mut total_bytes: u64 = 0;
    for (fs_path, zip_name) in &files {
        let bytes = fs::read(fs_path).map_err(|e| e.to_string())?;
        zip.start_file(zip_name.as_str(), opts).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
        total_bytes += bytes.len() as u64;
    }

    let manifest = serde_json::json!({
        "generator": "dnd-planner",
        "version": 1,
        "campaigns": selection.campaigns,
        "characters": selection.characters,
        "items": selection.items,
        "monsters": selection.monsters,
        "spells": selection.spells,
    });
    zip.start_file("manifest.json", opts).map_err(|e| e.to_string())?;
    zip.write_all(
        serde_json::to_string_pretty(&manifest)
            .unwrap_or_default()
            .as_bytes(),
    )
    .map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(ExportSummary {
        files: files.len(),
        bytes: total_bytes,
    })
}

/// Liest ein Export-ZIP und meldet, welche Bereiche darin enthalten sind.
#[tauri::command]
fn inspect_import_zip(zip_path: String) -> Result<VaultContents, String> {
    let file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Kein gültiges ZIP: {}", e))?;

    let mut campaigns = std::collections::BTreeSet::new();
    let mut characters = std::collections::BTreeSet::new();
    let (mut items, mut monsters, mut spells) = (false, false, false);

    for i in 0..archive.len() {
        let f = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().replace('\\', "/");
        let segs: Vec<&str> = name.split('/').filter(|s| !s.is_empty()).collect();
        match segs.as_slice() {
            ["campaigns", slug, ..] => {
                campaigns.insert(slug.to_string());
            }
            ["characters", slug, ..] => {
                characters.insert(slug.to_string());
            }
            ["items", ..] => items = true,
            ["monsters", ..] => monsters = true,
            ["spells", ..] => spells = true,
            _ => {}
        }
    }

    Ok(VaultContents {
        campaigns: campaigns.into_iter().collect(),
        characters: characters.into_iter().collect(),
        items,
        monsters,
        spells,
    })
}

/// Importiert die gewählten Bereiche aus einem Export-ZIP in den Vault.
/// Vorhandene Dateien werden nur bei `overwrite == true` ersetzt.
#[tauri::command]
fn import_vault(
    zip_path: String,
    selection: TransferSelection,
    overwrite: bool,
) -> Result<ImportSummary, String> {
    let file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Kein gültiges ZIP: {}", e))?;

    let vault = project_root().join("vault");
    let camp_set: std::collections::HashSet<String> =
        selection.campaigns.iter().cloned().collect();
    let char_set: std::collections::HashSet<String> =
        selection.characters.iter().cloned().collect();

    let mut written = 0usize;
    let mut skipped = 0usize;

    for i in 0..archive.len() {
        let mut f = archive.by_index(i).map_err(|e| e.to_string())?;
        if f.is_dir() {
            continue;
        }
        // enclosed_name() schützt vor Zip-Slip (../ und absolute Pfade).
        // Sofort in einen String auflösen, damit kein Borrow auf `f` offen bleibt.
        let name_str = match f.enclosed_name() {
            Some(p) => p.to_string_lossy().replace('\\', "/"),
            None => continue,
        };
        if name_str == "manifest.json" {
            continue;
        }
        let segs: Vec<&str> = name_str.split('/').filter(|s| !s.is_empty()).collect();
        let selected = match segs.as_slice() {
            ["campaigns", slug, ..] => camp_set.contains(*slug),
            ["characters", slug, ..] => char_set.contains(*slug),
            ["items", ..] => selection.items,
            ["monsters", ..] => selection.monsters,
            ["spells", ..] => selection.spells,
            _ => false,
        };
        if !selected {
            continue;
        }

        let target = vault.join(&name_str);
        if target.exists() && !overwrite {
            skipped += 1;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut buf = Vec::new();
        f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        fs::write(&target, &buf).map_err(|e| e.to_string())?;
        written += 1;
    }

    Ok(ImportSummary { written, skipped })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_current_dir,
            get_absolute_path,
            list_directory,
            list_entries,
            find_pdf_in_dir,
            read_file_content,
            read_file_base64,
            write_file_content,
            list_json_files,
            list_json_entries,
            rename_file,
            delete_path,
            write_file_base64,
            load_spells_index,
            save_api_key,
            load_api_key,
            delete_api_key,
            http_request,
            get_vault_overview,
            export_vault,
            inspect_import_zip,
            import_vault
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
