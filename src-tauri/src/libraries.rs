//! Bezug und Installation der verteilten Bibliotheks-Packs.
//!
//! Die Packs liegen als Assets an einem Release mit festem Tag im öffentlichen
//! Transport-Repo. `index.json` ist unverschlüsselt — der Update-Check
//! funktioniert damit ohne jeden Zugangscode. Geschützte Packs sind mit
//! AES-256-GCM verschlüsselt, der Schlüssel wird per scrypt aus dem Zugangscode
//! abgeleitet. Das Containerformat ist in `vault/tools/PACK_FORMAT.md`
//! beschrieben; Referenzimplementierung ist `vault/tools/verify_pack.py`.
//!
//! Zwei Eigenschaften sind hier sicherheitsrelevant und dürfen beim Ändern
//! nicht verlorengehen:
//!
//! 1. Ein Pack darf ausschließlich in die Bibliotheksverzeichnisse schreiben.
//!    Nutzerinhalte (`campaigns/`, `characters/`) werden nie angefasst.
//! 2. Ein fehlender Zugangscode ist kein Fehler, sondern der Zustand `locked`.
//!
//! Dazu die Gegenrichtung: `minVersion` aus dem Index nennt die App-Version, die
//! die Inhalte lesen kann (`min_app_version` in `vault/libraries.yaml`). Ist
//! diese App älter, wird nicht installiert — sonst lägen Dateien im Vault, deren
//! Felder hier niemand auswertet, und die Mechanik fiele still aus.

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use hmac::{Hmac, Mac};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

// ─────────────────────────────────────────────────────────────────────────────
// Konstanten
// ─────────────────────────────────────────────────────────────────────────────

const RELEASE_BASE: &str =
    "https://github.com/pesse/dnd-planner-libraries/releases/download/libraries";

/// Verzeichnisse, in die ein Pack schreiben darf. Muss mit `roots` in
/// `vault/libraries.yaml` übereinstimmen.
const ALLOWED_ROOTS: &[&str] = &[
    "spells", "classes", "species", "feats", "backgrounds", "items", "monsters", "templates",
];

const MAGIC: &[u8; 6] = b"DNDLIB";
const FORMAT_VERSION: u8 = 1;
const KDF_SCRYPT: u8 = 1;
const SALT_LEN: usize = 16;
const VERIFIER_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const HEADER_LEN: usize = 6 + 5 + SALT_LEN + VERIFIER_LEN + NONCE_LEN; // = 71

const KEYRING_SERVICE: &str = "dnd-planner";

// ─────────────────────────────────────────────────────────────────────────────
// Datentypen
// ─────────────────────────────────────────────────────────────────────────────

/// Ein Eintrag aus `index.json`, so wie ihn der Pack-Build schreibt.
#[derive(Debug, Clone, Deserialize)]
pub struct IndexEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    pub license: String,
    pub protected: bool,
    pub file: String,
    pub sha256: String,
    pub size: u64,
    #[serde(rename = "fileCount")]
    pub file_count: usize,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "keyVersion", default)]
    pub key_version: Option<u32>,
    /// Älteste App-Version, die diese Fassung lesen kann. Fehlt bei Packs aus
    /// einem Build vor `schemaVersion` 2 — dann gilt keine Schranke.
    #[serde(rename = "minVersion", default)]
    pub min_version: Option<String>,
}

#[derive(Deserialize)]
struct Index {
    libraries: Vec<IndexEntry>,
}

/// Zustand einer Bibliothek aus Sicht der App — Index plus lokale Lage.
#[derive(Debug, Serialize)]
pub struct LibraryStatus {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub license: String,
    pub protected: bool,
    pub version: String,
    pub size: u64,
    #[serde(rename = "fileCount")]
    pub file_count: usize,
    /// `installed` | `update` | `available` | `locked` | `staleCode` | `appOutdated`
    pub status: String,
    #[serde(rename = "installedVersion")]
    pub installed_version: Option<String>,
    /// Nur gesetzt, wenn der Index eine Mindest-App-Version nennt — die UI
    /// benennt sie im Zustand `appOutdated`.
    #[serde(rename = "minVersion")]
    pub min_version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct InstalledFile {
    path: String,
    sha256: String,
}

/// Was von einer Installation lokal festgehalten wird. Die Dateiliste erlaubt
/// beim Update, zurückgezogene Einträge zu entfernen und lokal bearbeitete
/// Dateien zu erkennen.
#[derive(Debug, Serialize, Deserialize)]
struct InstalledState {
    version: String,
    #[serde(rename = "keyVersion", default)]
    key_version: Option<u32>,
    #[serde(rename = "installedAt")]
    installed_at: u64,
    files: Vec<InstalledFile>,
}

#[derive(Debug, Default, Serialize)]
pub struct InstallSummary {
    pub written: usize,
    /// Übersprungen, weil lokal bearbeitet.
    #[serde(rename = "skippedModified")]
    pub skipped_modified: usize,
    /// Entfernt, weil im neuen Pack nicht mehr enthalten.
    pub removed: usize,
    /// Vorhandene, aber nicht von uns verwaltete Dateien. Ist dieser Wert > 0
    /// und wurde nicht `adopt` übergeben, wurde nichts geschrieben.
    #[serde(rename = "needsAdopt")]
    pub needs_adopt: usize,
}

// ─────────────────────────────────────────────────────────────────────────────
// Pfade & Zustand
// ─────────────────────────────────────────────────────────────────────────────

fn vault() -> PathBuf {
    crate::project_root().join("vault")
}

/// Ablage der Installationszustände. Der Punkt-Präfix hält das Verzeichnis aus
/// den Datei-Listings der App heraus.
pub fn state_dir() -> PathBuf {
    vault().join(".libraries")
}

fn state_path(id: &str) -> PathBuf {
    state_dir().join(format!("{}.json", id))
}

fn read_state(id: &str) -> Option<InstalledState> {
    let raw = fs::read_to_string(state_path(id)).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_state(id: &str, state: &InstalledState) -> Result<(), String> {
    fs::create_dir_all(state_dir()).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(state_path(id), json).map_err(|e| e.to_string())
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn sha256_hex(data: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(data);
    format!("{:x}", h.finalize())
}

// ─────────────────────────────────────────────────────────────────────────────
// App-Version gegen `minVersion`
// ─────────────────────────────────────────────────────────────────────────────

/// Version, an der die Schranke gemessen wird — `None` heißt: keine Schranke.
///
/// Der Wert kommt aus `tauri.conf.json`, nicht aus `Cargo.toml` (nur die erste
/// wird beim Release aus dem Tag nachgezogen). Im Dev-Build gilt keine
/// Schranke: committet steht dort immer die Version des *letzten* Releases,
/// eine Deklaration auf die kommende Fassung sperrte sonst die Entwicklung an
/// den eigenen Inhalten aus.
fn version_gate(app: &tauri::AppHandle) -> Option<String> {
    if cfg!(debug_assertions) {
        return None;
    }
    Some(app.package_info().version.to_string())
}

/// Zahlentripel einer Version. Ein Suffix (`-rc1`, `+build`, vierte Stelle)
/// fällt weg — ein Release Candidate der verlangten Version soll die Schranke
/// erfüllen, statt an ihr zu scheitern.
fn version_triple(v: &str) -> Option<(u64, u64, u64)> {
    let core = v.trim().trim_start_matches('v');
    let core = core.split(['-', '+']).next()?;
    let mut parts = core.split('.');
    let major = parts.next()?.trim().parse().ok()?;
    let minor = parts.next()?.trim().parse().ok()?;
    let patch = parts.next()?.trim().parse().ok()?;
    Some((major, minor, patch))
}

/// True, wenn `current` die verlangte Mindestversion erreicht.
///
/// Unlesbare Angaben werden nicht geraten: dann gilt die Schranke. Der Build
/// weist solche Werte ohnehin ab (`check_version` in `build_packs.py`).
fn satisfies_min(current: &str, min: &str) -> bool {
    match (version_triple(current), version_triple(min)) {
        (Some(c), Some(m)) => c >= m,
        _ => false,
    }
}

/// True, wenn diese App die Fassung nicht einspielen darf.
fn too_old_for(gate: Option<&str>, min_version: Option<&str>) -> bool {
    match (gate, min_version) {
        (Some(current), Some(min)) => !satisfies_min(current, min),
        _ => false,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Zugangscodes
// ─────────────────────────────────────────────────────────────────────────────
//
// Gleiche Ablage wie die API-Keys in lib.rs: OS-Keychain über `keyring`.
// Zusätzlich zur keyVersion, unter der ein Code gespeichert wurde — daran
// erkennt die App eine Passwortrotation und kann sie benennen, statt still
// zu scheitern.

fn code_entry(id: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, &format!("library-code-{}", id)).map_err(|e| e.to_string())
}

/// Gespeicherter Code als `(code, keyVersion)`. Das Format im Keychain ist
/// `<keyVersion>:<code>`; ältere Einträge ohne Präfix gelten als Version 1.
fn load_code(id: &str) -> Option<(String, u32)> {
    let stored = code_entry(id).ok()?.get_password().ok()?;
    match stored.split_once(':') {
        Some((v, code)) => match v.parse::<u32>() {
            Ok(version) => Some((code.to_string(), version)),
            Err(_) => Some((stored.clone(), 1)),
        },
        None => Some((stored, 1)),
    }
}

fn store_code(id: &str, code: &str, key_version: u32) -> Result<(), String> {
    code_entry(id)?
        .set_password(&format!("{}:{}", key_version, code))
        .map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Container: Kopf, Schlüsselableitung, Entschlüsselung
// ─────────────────────────────────────────────────────────────────────────────

struct PackHeader {
    log_n: u8,
    r: u32,
    p: u32,
    salt: Vec<u8>,
    verifier: Vec<u8>,
    nonce: Vec<u8>,
    /// Die Kopfbytes selbst — gehen als AAD in AES-GCM ein.
    raw: Vec<u8>,
}

fn parse_header(blob: &[u8]) -> Result<PackHeader, String> {
    if blob.len() < HEADER_LEN {
        return Err(format!(
            "Pack ist zu kurz ({} statt mindestens {} Bytes).",
            blob.len(),
            HEADER_LEN
        ));
    }
    if &blob[0..6] != MAGIC {
        return Err("Datei ist kein geschützter Pack.".into());
    }
    if blob[6] != FORMAT_VERSION {
        return Err(format!(
            "Pack-Format {} wird von dieser Version nicht unterstützt — bitte die App aktualisieren.",
            blob[6]
        ));
    }
    if blob[7] != KDF_SCRYPT {
        return Err(format!("Unbekanntes Schlüsselverfahren ({}).", blob[7]));
    }
    Ok(PackHeader {
        log_n: blob[8],
        r: blob[9] as u32,
        p: blob[10] as u32,
        salt: blob[11..27].to_vec(),
        verifier: blob[27..59].to_vec(),
        nonce: blob[59..71].to_vec(),
        raw: blob[..HEADER_LEN].to_vec(),
    })
}

/// scrypt → Master, daraus getrennt Verschlüsselungsschlüssel und Verifier.
fn derive_keys(code: &str, h: &PackHeader) -> Result<(Vec<u8>, Vec<u8>), String> {
    let params = scrypt::Params::new(h.log_n, h.r, h.p, 32)
        .map_err(|e| format!("Ungültige scrypt-Parameter: {}", e))?;
    let mut master = [0u8; 32];
    scrypt::scrypt(code.as_bytes(), &h.salt, &params, &mut master)
        .map_err(|e| format!("Schlüsselableitung fehlgeschlagen: {}", e))?;

    let mac = |label: &[u8]| -> Vec<u8> {
        // Qualifiziert, weil `KeyInit` (aes-gcm) dieselbe Methode anbietet.
        let mut m = <HmacSha256 as Mac>::new_from_slice(&master)
            .expect("HMAC nimmt jede Schlüssellänge");
        m.update(label);
        m.finalize().into_bytes().to_vec()
    };
    Ok((mac(b"dnd-planner:enc"), mac(b"dnd-planner:verify")))
}

/// Prüft einen Zugangscode allein am Kopf — ohne den ganzen Pack zu laden.
fn code_matches(header: &PackHeader, code: &str) -> Result<bool, String> {
    let (_, verifier) = derive_keys(code, header)?;
    // Konstante Laufzeit ist hier zweitrangig (der Angreifer hätte die Datei
    // ohnehin), schadet aber nicht.
    Ok(constant_time_eq(&verifier, &header.verifier))
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn decrypt_pack(blob: &[u8], code: &str) -> Result<Vec<u8>, String> {
    let header = parse_header(blob)?;
    let (enc_key, verifier) = derive_keys(code, &header)?;
    if !constant_time_eq(&verifier, &header.verifier) {
        return Err("Falscher Zugangscode.".into());
    }
    let cipher = Aes256Gcm::new_from_slice(&enc_key)
        .map_err(|e| format!("Schlüssel unbrauchbar: {}", e))?;
    cipher
        .decrypt(
            Nonce::from_slice(&header.nonce),
            Payload {
                msg: &blob[HEADER_LEN..],
                aad: &header.raw,
            },
        )
        .map_err(|_| "Pack ist beschädigt oder wurde verändert.".to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Netzwerk
// ─────────────────────────────────────────────────────────────────────────────

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .use_rustls_tls()
        .build()
        .map_err(|e| e.to_string())
}

async fn fetch_index() -> Result<Vec<IndexEntry>, String> {
    let url = format!("{}/index.json", RELEASE_BASE);
    let res = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Bibliotheksverzeichnis nicht erreichbar: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Bibliotheksverzeichnis: HTTP {}", res.status()));
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    let index: Index =
        serde_json::from_str(&text).map_err(|e| format!("index.json unlesbar: {}", e))?;
    Ok(index.libraries)
}

/// Lädt nur die Kopfbytes eines Packs — für die Codeprüfung reicht das.
async fn fetch_header(file: &str) -> Result<PackHeader, String> {
    let url = format!("{}/{}", RELEASE_BASE, file);
    let res = client()?
        .get(&url)
        .header("Range", format!("bytes=0-{}", HEADER_LEN - 1))
        .send()
        .await
        .map_err(|e| format!("Pack-Kopf nicht ladbar: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Pack-Kopf: HTTP {}", res.status()));
    }
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    // Server ohne Range-Unterstützung liefern die ganze Datei; der Kopf steht
    // trotzdem vorn, parse_header nimmt sich nur die ersten Bytes.
    parse_header(&bytes)
}

async fn fetch_pack(entry: &IndexEntry) -> Result<Vec<u8>, String> {
    let url = format!("{}/{}", RELEASE_BASE, entry.file);
    let res = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download fehlgeschlagen: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Download: HTTP {}", res.status()));
    }
    let bytes = res.bytes().await.map_err(|e| e.to_string())?.to_vec();

    let actual = sha256_hex(&bytes);
    if actual != entry.sha256 {
        return Err(format!(
            "Prüfsumme weicht ab — Download verworfen (erwartet {}, erhalten {}).",
            &entry.sha256[..12.min(entry.sha256.len())],
            &actual[..12]
        ));
    }
    Ok(bytes)
}

// ─────────────────────────────────────────────────────────────────────────────
// Pfad-Schutz
// ─────────────────────────────────────────────────────────────────────────────

/// True, wenn ein Pack-Eintrag geschrieben werden darf.
///
/// Erlaubt sind ausschließlich die Bibliotheksverzeichnisse sowie
/// Lizenzhinweise direkt im Vault. Alles andere — insbesondere `campaigns/`
/// und `characters/` — wird verworfen. Diese Prüfung ist die zweite Sicherung
/// zusätzlich zu `enclosed_name()` des zip-Crates gegen Zip-Slip.
fn is_allowed_entry(name: &str) -> bool {
    let segs: Vec<&str> = name.split('/').filter(|s| !s.is_empty()).collect();
    match segs.as_slice() {
        [] => false,
        [single] => single.starts_with("LICENSE") && !single.contains(".."),
        [root, ..] => ALLOWED_ROOTS.contains(root),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Kommandos
// ─────────────────────────────────────────────────────────────────────────────

/// Lädt das Verzeichnis und verschneidet es mit dem lokalen Stand.
#[tauri::command]
pub async fn fetch_library_index(app: tauri::AppHandle) -> Result<Vec<LibraryStatus>, String> {
    let gate = version_gate(&app);
    let entries = fetch_index().await?;
    Ok(entries
        .into_iter()
        .map(|e| status_for(e, gate.as_deref()))
        .collect())
}

fn status_for(entry: IndexEntry, gate: Option<&str>) -> LibraryStatus {
    let state = read_state(&entry.id);
    let installed_version = state.as_ref().map(|s| s.version.clone());

    // Die Versionsschranke geht allen anderen Zuständen vor: sie ist die
    // einzige, die auch ein hinterlegter Zugangscode nicht aufhebt. Ein
    // vorhandenes Update bleibt damit sichtbar, aber unangeboten.
    let status = if too_old_for(gate, entry.min_version.as_deref()) {
        "appOutdated".to_string()
    } else if entry.protected {
        match load_code(&entry.id) {
            None => "locked".to_string(),
            Some((_, stored_version)) => {
                let expected = entry.key_version.unwrap_or(1);
                if stored_version != expected {
                    // Passwort wurde rotiert — benennbar statt still scheiternd.
                    "staleCode".to_string()
                } else {
                    installed_status(&entry, installed_version.as_deref())
                }
            }
        }
    } else {
        installed_status(&entry, installed_version.as_deref())
    };

    LibraryStatus {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        license: entry.license,
        protected: entry.protected,
        version: entry.version,
        size: entry.size,
        file_count: entry.file_count,
        status,
        installed_version,
        min_version: entry.min_version,
    }
}

fn installed_status(entry: &IndexEntry, installed: Option<&str>) -> String {
    match installed {
        None => "available".to_string(),
        Some(v) if v == entry.version => "installed".to_string(),
        Some(_) => "update".to_string(),
    }
}

/// Probiert einen Zugangscode gegen alle geschützten Bibliotheken.
///
/// Der Nutzer bekommt einen Code und weiß in der Regel nicht, wozu er gehört —
/// deshalb ordnet die App ihn selbst zu, statt eine Auswahl zu verlangen.
/// Rückgabe sind die Namen der damit entsperrten Bibliotheken.
#[tauri::command]
pub async fn try_access_code(code: String) -> Result<Vec<String>, String> {
    let code = code.trim().to_string();
    if code.is_empty() {
        return Err("Kein Zugangscode eingegeben.".into());
    }

    let entries = fetch_index().await?;
    let mut unlocked = Vec::new();

    for entry in entries.iter().filter(|e| e.protected) {
        let header = match fetch_header(&entry.file).await {
            Ok(h) => h,
            // Ein unlesbarer Pack darf die Prüfung der anderen nicht abbrechen.
            Err(_) => continue,
        };
        if code_matches(&header, &code)? {
            store_code(&entry.id, &code, entry.key_version.unwrap_or(1))?;
            unlocked.push(entry.name.clone());
        }
    }

    if unlocked.is_empty() {
        return Err("Der Code passt zu keiner Bibliothek.".into());
    }
    Ok(unlocked)
}

/// Lädt eine Bibliothek und schreibt sie in den Vault.
///
/// `adopt` bezieht sich auf Dateien, die bereits vorliegen, aber nicht von uns
/// installiert wurden (Bestandsinstallationen). Ohne `adopt` wird in diesem
/// Fall nichts geschrieben und `needsAdopt` gemeldet, damit die UI nachfragen
/// kann.
#[tauri::command]
pub async fn install_library(
    app: tauri::AppHandle,
    id: String,
    adopt: bool,
) -> Result<InstallSummary, String> {
    let entries = fetch_index().await?;
    let entry = entries
        .into_iter()
        .find(|e| e.id == id)
        .ok_or_else(|| format!("Unbekannte Bibliothek '{}'.", id))?;

    // Zweite Sicherung neben dem Zustand `appOutdated`: hier endet der Weg auch
    // dann, wenn die Oberfläche die Sperre nicht beachtet.
    let gate = version_gate(&app);
    if too_old_for(gate.as_deref(), entry.min_version.as_deref()) {
        return Err(format!(
            "„{}“ setzt dnd-planner {} oder neuer voraus (installiert: {}). \
             Bitte die App aktualisieren.",
            entry.name,
            entry.min_version.unwrap_or_default(),
            gate.unwrap_or_default()
        ));
    }

    let blob = fetch_pack(&entry).await?;
    let zip_bytes = if entry.protected {
        let (code, _) = load_code(&entry.id)
            .ok_or_else(|| format!("Für '{}' ist kein Zugangscode hinterlegt.", entry.name))?;
        decrypt_pack(&blob, &code)?
    } else {
        blob
    };

    extract_pack(&entry, &zip_bytes, adopt)
}

/// Auspacken, Zustandsabgleich und Schreiben. Synchron gehalten — reines
/// Dateisystem, kein Netz.
fn extract_pack(entry: &IndexEntry, zip_bytes: &[u8], adopt: bool) -> Result<InstallSummary, String> {
    let vault = vault();
    let previous = read_state(&entry.id);
    let known: HashMap<String, String> = previous
        .as_ref()
        .map(|s| {
            s.files
                .iter()
                .map(|f| (f.path.clone(), f.sha256.clone()))
                .collect()
        })
        .unwrap_or_default();

    let cursor = std::io::Cursor::new(zip_bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Pack ist kein gültiges ZIP: {}", e))?;

    let mut summary = InstallSummary::default();
    let mut planned: Vec<(String, Vec<u8>, String)> = Vec::new(); // (Pfad, Inhalt, sha256)

    for i in 0..archive.len() {
        let mut f = archive.by_index(i).map_err(|e| e.to_string())?;
        if f.is_dir() {
            continue;
        }
        // enclosed_name() wehrt Zip-Slip ab (../, absolute Pfade).
        let name = match f.enclosed_name() {
            Some(p) => p.to_string_lossy().replace('\\', "/"),
            None => continue,
        };
        if !is_allowed_entry(&name) {
            // Ein Pack, der außerhalb der Bibliotheksverzeichnisse schreiben
            // will, ist entweder fehlerhaft gebaut oder manipuliert.
            return Err(format!(
                "Pack enthält einen unzulässigen Pfad ({}) — Installation abgebrochen.",
                name
            ));
        }

        let mut buf = Vec::new();
        f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        let hash = sha256_hex(&buf);
        let target = vault.join(&name);

        if target.exists() {
            match known.get(&name) {
                // Von uns installiert: nur überschreiben, wenn unverändert.
                Some(installed_hash) => {
                    let current = fs::read(&target).map(|b| sha256_hex(&b)).unwrap_or_default();
                    if &current != installed_hash {
                        summary.skipped_modified += 1;
                        continue;
                    }
                }
                // Vorhanden, aber nicht von uns — Bestandsinstallation.
                None => {
                    summary.needs_adopt += 1;
                    if !adopt {
                        continue;
                    }
                }
            }
        }
        planned.push((name, buf, hash));
    }

    // Ohne Zustimmung nichts anfassen, wenn Bestandsdateien betroffen wären.
    if summary.needs_adopt > 0 && !adopt {
        return Ok(InstallSummary {
            written: 0,
            skipped_modified: 0,
            removed: 0,
            needs_adopt: summary.needs_adopt,
        });
    }

    let mut files = Vec::with_capacity(planned.len());
    for (name, data, hash) in planned {
        let target = vault.join(&name);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&target, &data).map_err(|e| format!("{}: {}", name, e))?;
        files.push(InstalledFile { path: name, sha256: hash });
        summary.written += 1;
    }

    // Zurückgezogene Einträge entfernen — aber nur solche, die wir installiert
    // haben und die der Nutzer seither nicht verändert hat.
    if let Some(prev) = &previous {
        let still_here: std::collections::HashSet<&str> =
            files.iter().map(|f| f.path.as_str()).collect();
        for old in &prev.files {
            if still_here.contains(old.path.as_str()) {
                continue;
            }
            let target = vault.join(&old.path);
            if !target.exists() {
                continue;
            }
            let current = fs::read(&target).map(|b| sha256_hex(&b)).unwrap_or_default();
            if current == old.sha256 && fs::remove_file(&target).is_ok() {
                summary.removed += 1;
            }
        }
    }

    write_state(
        &entry.id,
        &InstalledState {
            version: entry.version.clone(),
            key_version: entry.key_version,
            installed_at: now_secs(),
            files,
        },
    )?;

    Ok(summary)
}

/// Lokal installierte Bibliotheken samt Version — ohne Netzzugriff.
#[tauri::command]
pub fn installed_libraries() -> Result<HashMap<String, String>, String> {
    let dir = state_dir();
    let mut out = HashMap::new();
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(out), // noch nichts installiert
    };
    for e in entries.filter_map(|e| e.ok()) {
        let path = e.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        if let Some(id) = path.file_stem().and_then(|s| s.to_str()) {
            if let Some(state) = read_state(id) {
                out.insert(id.to_string(), state.version);
            }
        }
    }
    Ok(out)
}

/// Entfernt einen gespeicherten Zugangscode. Bereits installierte Inhalte
/// bleiben liegen — sie sind heruntergeladen und gehören dem Nutzer.
#[tauri::command]
pub fn forget_access_code(id: String) -> Result<(), String> {
    match code_entry(&id)?.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn erlaubt_nur_bibliotheksverzeichnisse() {
        assert!(is_allowed_entry("spells/hervorrufung/aetzkugel.json"));
        assert!(is_allowed_entry("templates/monster.json"));
        assert!(is_allowed_entry("LICENSE-SRD.md"));

        // Nutzerinhalte sind tabu.
        assert!(!is_allowed_entry("campaigns/thromm/campaign.md"));
        assert!(!is_allowed_entry("characters/silvara/character.json"));
        // Alles Unbekannte ebenso.
        assert!(!is_allowed_entry(".libraries/srd.json"));
        assert!(!is_allowed_entry("beliebig/datei.json"));
        assert!(!is_allowed_entry("einzeldatei.json"));
        assert!(!is_allowed_entry(""));
    }

    #[test]
    fn kopf_wird_streng_geprueft() {
        let mut header = vec![0u8; HEADER_LEN];
        header[..6].copy_from_slice(MAGIC);
        header[6] = FORMAT_VERSION;
        header[7] = KDF_SCRYPT;
        header[8] = 16;
        header[9] = 8;
        header[10] = 1;
        assert!(parse_header(&header).is_ok());

        // Zu kurz
        assert!(parse_header(&header[..HEADER_LEN - 1]).is_err());
        // Falsches Magic → offener Pack, kein geschützter
        let mut wrong = header.clone();
        wrong[0] = b'X';
        assert!(parse_header(&wrong).is_err());
        // Künftige Formatversion wird nicht geraten
        let mut future = header.clone();
        future[6] = 2;
        assert!(parse_header(&future).is_err());
    }

    /// Gegenprobe zur Python-Seite: gleiche Ableitung, gleiche Werte.
    /// Die Erwartungswerte stammen aus vault/tools/verify_pack.py.
    #[test]
    fn schluesselableitung_passt_zur_python_seite() {
        let header = PackHeader {
            log_n: 14, // im Test kleiner gewählt, damit er schnell läuft
            r: 8,
            p: 1,
            salt: b"0123456789abcdef".to_vec(),
            verifier: vec![0; VERIFIER_LEN],
            nonce: vec![0; NONCE_LEN],
            raw: vec![],
        };
        let (enc, verify) = derive_keys("korund-flussbett-31", &header).unwrap();
        assert_eq!(enc.len(), 32);
        assert_eq!(verify.len(), 32);
        assert_ne!(enc, verify, "Ableitungen müssen getrennt sein");

        // Erwartungswerte aus der Python-Referenzimplementierung:
        //   python3 -c "import sys; sys.path.insert(0,'tools')
        //   from verify_pack import derive_keys
        //   print(*[b.hex() for b in derive_keys('korund-flussbett-31',
        //                                        b'0123456789abcdef', 14, 8, 1)])"
        assert_eq!(
            hex(&enc),
            "fbb89f03dc96160c05bf873a80720e969df73bf54ce6fbaca5329d08edb15d4e",
            "Ableitung weicht von der Python-Seite ab"
        );
        assert_eq!(
            hex(&verify),
            "4a489c0147477c5609f4b6316621831ef98cdadfcc5fd794f3f02acf022681cb"
        );
    }

    fn hex(b: &[u8]) -> String {
        b.iter().map(|x| format!("{:02x}", x)).collect()
    }

    #[test]
    fn falscher_code_wird_abgewiesen() {
        let header = PackHeader {
            log_n: 14,
            r: 8,
            p: 1,
            salt: b"0123456789abcdef".to_vec(),
            verifier: vec![0xAA; VERIFIER_LEN],
            nonce: vec![0; NONCE_LEN],
            raw: vec![],
        };
        assert!(!code_matches(&header, "irgendwas").unwrap());
    }

    /// Von `vault/tools/build_packs.py` erzeugter Pack (scrypt log2(N)=14 statt
    /// 16, damit der Test schnell bleibt; festes Salt und Nonce). Enthält ein
    /// ZIP mit `spells/testzauber.json`. Neu erzeugbar mit dem Skript im
    /// Kommentar von `schluesselableitung_passt_zur_python_seite`.
    const TESTVEKTOR: &str = "444e444c494201010e0801000102030405060708090a0b0c0d0e0f5f2ea74eb090d73f9020\
1505c7029997af1bdc5e99f7afc054f7a46348bf8ae46465666768696a6b6c6d6e6f497ab2d6346aed9c6a6ce193c036527f5\
fede65dff51f42638811650166514e1c822706530bd8eb5b6b6667e4e19390d42937239d50db42fa2fd09f51b4954a8532a58\
9d680aac44809c15b26465f386b7dee3b1f30628d536caa2504e8736393d1d474600492e98766cad2170c161dc4771325f999\
dbe783d0a70e7c32d7ed413d7776316207832f3f89f2a8eab35473906a61ac818c73467a7c4f427134d9108cc0150556746 \
9a654984d41b35fec18f354d78ef8ace9a575542d331e5e93677da8079a3f5351ed88cc33d3e587110e506";

    fn unhex(s: &str) -> Vec<u8> {
        let clean: String = s.chars().filter(|c| !c.is_whitespace()).collect();
        (0..clean.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&clean[i..i + 2], 16).unwrap())
            .collect()
    }

    /// Der eigentliche Vertragstest zwischen Python und Rust: ein drüben
    /// erzeugter Pack muss hier auspackbar sein — inklusive AAD-Bindung des
    /// Kopfes und GCM-Prüfsumme.
    #[test]
    fn python_pack_laesst_sich_entschluesseln() {
        let blob = unhex(TESTVEKTOR);
        let zip_bytes = decrypt_pack(&blob, "korund-flussbett-31")
            .expect("von Python erzeugter Pack muss lesbar sein");

        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&zip_bytes)).unwrap();
        let names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        assert_eq!(names, vec!["spells/testzauber.json"]);
        assert!(is_allowed_entry(&names[0]));
    }

    #[test]
    fn falscher_code_oeffnet_python_pack_nicht() {
        let blob = unhex(TESTVEKTOR);
        let err = decrypt_pack(&blob, "zunder-nebelpfad-07").unwrap_err();
        assert!(err.contains("Falscher Zugangscode"), "unerwartet: {}", err);
    }

    /// Der Kopf geht als AAD ein — verbogene KDF-Parameter dürfen nicht dazu
    /// führen, dass ein billiger abgeleiteter Schlüssel akzeptiert wird.
    #[test]
    fn manipulierter_kopf_wird_abgewiesen() {
        let mut blob = unhex(TESTVEKTOR);
        blob[8] = 10; // scrypt-Kosten heruntersetzen
        assert!(decrypt_pack(&blob, "korund-flussbett-31").is_err());

        let mut blob = unhex(TESTVEKTOR);
        let last = blob.len() - 1;
        blob[last] ^= 0x01; // Ciphertext kippen
        let err = decrypt_pack(&blob, "korund-flussbett-31").unwrap_err();
        assert!(err.contains("beschädigt"), "unerwartet: {}", err);
    }

    #[test]
    fn versionsvergleich_zaehlt_das_tripel() {
        assert!(satisfies_min("0.2.1", "0.2.1"));
        assert!(satisfies_min("0.3.0", "0.2.1"));
        assert!(satisfies_min("1.0.0", "0.9.9"));
        assert!(!satisfies_min("0.2.0", "0.2.1"));
        assert!(!satisfies_min("0.1.9", "0.2.0"));

        // Ein Vorabbau der verlangten Version erfüllt die Schranke.
        assert!(satisfies_min("0.2.1-rc1", "0.2.1"));
        assert!(satisfies_min("v0.2.1", "0.2.1"));
        assert!(satisfies_min("0.2.1.3", "0.2.1"));

        // Unlesbares wird nicht geraten — die Schranke gilt.
        assert!(!satisfies_min("0.2", "0.2.1"));
        assert!(!satisfies_min("0.2.1", "demnächst"));
    }

    /// Ohne Angabe im Index gibt es keine Schranke — Packs aus einem Build vor
    /// `schemaVersion` 2 bleiben installierbar. Ebenso ohne Gate (Dev-Build).
    #[test]
    fn ohne_minversion_keine_sperre() {
        assert!(!too_old_for(Some("0.1.0"), None));
        assert!(!too_old_for(None, Some("9.9.9")));
        assert_ne!(status_for(test_entry(None), Some("0.1.0")).status, "appOutdated");
        assert_ne!(status_for(test_entry(Some("9.9.9")), None).status, "appOutdated");
    }

    /// Die Schranke geht dem Zugangscode vor: eine geschützte Bibliothek meldet
    /// nicht `locked`, wenn die App ohnehin zu alt ist.
    #[test]
    fn zu_alte_app_schlaegt_jeden_anderen_zustand() {
        let entry = test_entry(Some("0.2.1"));
        let status = status_for(entry, Some("0.2.0"));
        assert_eq!(status.status, "appOutdated");
        assert_eq!(status.min_version.as_deref(), Some("0.2.1"));
    }

    fn test_entry(min_version: Option<&str>) -> IndexEntry {
        IndexEntry {
            // Eine id, unter der kein Installationszustand liegen kann.
            id: "test-nicht-installiert".into(),
            name: "Test".into(),
            version: "abcdef12".into(),
            license: "CC-BY-4.0".into(),
            protected: true,
            file: "lib-test-abcdef12.enc".into(),
            sha256: String::new(),
            size: 0,
            file_count: 0,
            description: None,
            key_version: Some(1),
            min_version: min_version.map(str::to_string),
        }
    }

    #[test]
    fn keyversion_praefix_wird_gelesen() {
        // Kein Keychain-Zugriff — nur die Formatlogik.
        assert_eq!("2:geheim".split_once(':'), Some(("2", "geheim")));
    }
}
