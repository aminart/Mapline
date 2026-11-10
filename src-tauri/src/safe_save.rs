// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

//! Saving a project without risking the file already on disk.
//!
//! Writing straight over a `.mapline` file leaves it truncated or half
//! written if the app crashes, the machine loses power or the disk fills up
//! mid-write. Instead the new content goes to a temporary file next to it,
//! which is flushed to disk and then renamed over the original: the rename
//! replaces the file in one step, so the path always holds either the old
//! version or the new one, complete. The previous version is kept beside it
//! as `<name>.bak`, to recover from a save the user regrets.

use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Extensions the app may save a project to (current and legacy).
pub const PROJECT_EXTENSIONS: [&str; 2] = ["mapline", "missionmap"];

/// `dir/name.ext` → `dir/name.ext.<suffix>`.
fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name: OsString = path.file_name().map(OsString::from).unwrap_or_default();
    name.push(".");
    name.push(suffix);
    path.with_file_name(name)
}

/// Where the previous version of `path` is kept.
pub fn backup_path(path: &Path) -> PathBuf {
    sibling(path, "bak")
}

fn is_project_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| PROJECT_EXTENSIONS.iter().any(|p| p.eq_ignore_ascii_case(e)))
}

/// Flushes a directory entry change (the rename) to disk. Unix only: on
/// Windows directories cannot be opened this way and NTFS journals renames.
fn sync_dir(dir: &Path) {
    #[cfg(unix)]
    if let Ok(d) = File::open(dir) {
        let _ = d.sync_all();
    }
    #[cfg(not(unix))]
    let _ = dir;
}

/// Writes `contents` to `path` safely, keeping the previous version as
/// `<path>.bak`. If anything fails, the original file is left untouched.
pub fn save_atomic(path: &Path, contents: &[u8]) -> io::Result<()> {
    if !is_project_file(path) {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "not a project file"));
    }
    // Save through a symbolic link to the file it points to, rather than
    // replacing the link with a plain file.
    let target = match fs::canonicalize(path) {
        Ok(real) => real,
        Err(e) if e.kind() == io::ErrorKind::NotFound => path.to_path_buf(),
        Err(e) => return Err(e),
    };
    let previous = fs::metadata(&target).ok().filter(|m| m.is_file());
    let dir = target.parent().filter(|d| !d.as_os_str().is_empty()).unwrap_or(Path::new("."));

    let tmp = sibling(&target, &format!("tmp-{}", std::process::id()));
    let written = (|| {
        let mut file = OpenOptions::new().write(true).create(true).truncate(true).open(&tmp)?;
        file.write_all(contents)?;
        file.sync_all()?;
        drop(file);
        if let Some(meta) = &previous {
            // Keep the original's permissions (read-only bits, mode on Unix).
            let _ = fs::set_permissions(&tmp, meta.permissions());
        }
        Ok::<(), io::Error>(())
    })();
    if let Err(e) = written {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }

    // The new version is safely on disk: keep a copy of the old one, then
    // swap the new one in. A failed backup does not block the save, which
    // is what the user asked for and is itself safe.
    if previous.is_some() {
        let bak = backup_path(&target);
        if let Ok(f) = fs::copy(&target, &bak).and_then(|_| File::open(&bak)) {
            let _ = f.sync_all();
        }
    }
    if let Err(e) = fs::rename(&tmp, &target) {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    sync_dir(dir);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mapline-safe-save-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn entries(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn first_save_creates_the_file_without_backup() {
        let dir = temp_dir("first");
        let path = dir.join("Clinique.mapline");
        save_atomic(&path, b"v1").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"v1");
        assert_eq!(entries(&dir), ["Clinique.mapline"]);
    }

    #[test]
    fn later_saves_keep_the_previous_version_as_bak() {
        let dir = temp_dir("bak");
        let path = dir.join("Clinique.mapline");
        save_atomic(&path, b"v1").unwrap();
        save_atomic(&path, b"v2").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"v2");
        assert_eq!(fs::read(backup_path(&path)).unwrap(), b"v1");
        save_atomic(&path, b"v3").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"v3");
        assert_eq!(fs::read(backup_path(&path)).unwrap(), b"v2");
        assert_eq!(entries(&dir), ["Clinique.mapline", "Clinique.mapline.bak"]);
    }

    #[test]
    fn a_failed_write_leaves_the_original_untouched() {
        let dir = temp_dir("fail");
        let path = dir.join("Clinique.mapline");
        save_atomic(&path, b"v1").unwrap();
        // A directory where the temporary file should go makes the write fail.
        fs::create_dir(sibling(&path, &format!("tmp-{}", std::process::id()))).unwrap();
        assert!(save_atomic(&path, b"v2").is_err());
        assert_eq!(fs::read(&path).unwrap(), b"v1");
        assert!(!backup_path(&path).exists());
    }

    #[test]
    fn refuses_files_that_are_not_projects() {
        let dir = temp_dir("ext");
        assert!(save_atomic(&dir.join("notes.txt"), b"x").is_err());
        assert!(save_atomic(&dir.join("ancien.missionmap"), b"x").is_ok());
        assert!(save_atomic(&dir.join("MAJ.MAPLINE"), b"x").is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn saves_through_a_symbolic_link() {
        let dir = temp_dir("link");
        let real = dir.join("real.mapline");
        let link = dir.join("link.mapline");
        fs::write(&real, b"v1").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();
        save_atomic(&link, b"v2").unwrap();
        assert!(fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
        assert_eq!(fs::read(&real).unwrap(), b"v2");
        assert_eq!(fs::read(dir.join("real.mapline.bak")).unwrap(), b"v1");
    }
}
