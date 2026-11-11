//! Several branches on one PC. Each branch is a separate shop with its own
//! data folder (database, key, snapshots, cloud link). The first branch is the
//! original data folder; the others live in `branches\<id>` inside it. The
//! list and names are kept in `branches.json` next to them.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{PosError, Result};

pub const MAIN_ID: &str = "main";
const FILE: &str = "branches.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Branch {
    pub id: String,
    pub name: String,
}

pub struct BranchRegistry {
    base: PathBuf,
}

fn io(e: impl std::fmt::Display) -> PosError {
    PosError::Db(format!("Could not save the branch list: {}", e))
}

fn id_ok(id: &str) -> bool {
    id == MAIN_ID || (id.len() >= 2 && id.len() <= 40 && id.starts_with('b') && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
}

fn clean_name(name: &str) -> Result<String> {
    let n = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if n.is_empty() {
        return Err(PosError::Validation("Enter a branch name".into()));
    }
    if n.chars().count() > 60 {
        return Err(PosError::Validation("Branch name is too long (60 letters at most)".into()));
    }
    Ok(n)
}

impl BranchRegistry {
    /// `base` is the first branch's data folder (the app's default data folder).
    pub fn new(base: impl Into<PathBuf>) -> Self {
        BranchRegistry { base: base.into() }
    }

    fn file(&self) -> PathBuf {
        self.base.join(FILE)
    }

    /// All branches, the first one always first. A missing or damaged list
    /// still gives the first branch, so the shop always opens.
    pub fn list(&self) -> Vec<Branch> {
        let saved: Vec<Branch> = std::fs::read(self.file())
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let mut out = vec![saved.iter().find(|b| b.id == MAIN_ID).cloned().unwrap_or(Branch { id: MAIN_ID.into(), name: String::new() })];
        for b in saved {
            if b.id != MAIN_ID && id_ok(&b.id) && !out.iter().any(|o| o.id == b.id) {
                out.push(b);
            }
        }
        out
    }

    fn save(&self, list: &[Branch]) -> Result<()> {
        std::fs::create_dir_all(&self.base).map_err(io)?;
        let tmp = self.base.join(format!("{}.tmp", FILE));
        std::fs::write(&tmp, serde_json::to_vec_pretty(list).map_err(io)?).map_err(io)?;
        std::fs::rename(&tmp, self.file()).map_err(io)?;
        Ok(())
    }

    /// The data folder of a branch.
    pub fn dir_of(&self, id: &str) -> Result<PathBuf> {
        if id == MAIN_ID {
            return Ok(self.base.clone());
        }
        if !id_ok(id) || !self.list().iter().any(|b| b.id == id) {
            return Err(PosError::NotFound("branch".into()));
        }
        Ok(self.base.join("branches").join(id))
    }

    /// Which branch a data folder belongs to (None for a folder outside the list).
    pub fn id_of_dir(&self, dir: &Path) -> Option<String> {
        let same = |a: &Path, b: &Path| match (a.canonicalize(), b.canonicalize()) {
            (Ok(x), Ok(y)) => x == y,
            _ => a == b,
        };
        self.list().into_iter().map(|b| b.id).find(|id| self.dir_of(id).map(|d| same(&d, dir)).unwrap_or(false))
    }

    /// A new, empty branch. It is set up (shop details, Owner) the first time it is opened.
    pub fn create(&self, name: &str) -> Result<Branch> {
        let name = clean_name(name)?;
        let mut list = self.list();
        if list.iter().any(|b| b.name.to_lowercase() == name.to_lowercase()) {
            return Err(PosError::Validation(format!("A branch named '{}' already exists", name)));
        }
        let mut raw = [0u8; 5];
        getrandom::getrandom(&mut raw).map_err(|e| PosError::Validation(format!("Could not make a branch id: {}", e)))?;
        let id = format!("b{}", raw.iter().map(|b| format!("{:02x}", b)).collect::<String>());
        let b = Branch { id, name };
        std::fs::create_dir_all(self.base.join("branches").join(&b.id)).map_err(io)?;
        list.push(b.clone());
        self.save(&list)?;
        Ok(b)
    }

    /// Keeps the list's name in step with the branch's shop name.
    pub fn set_name(&self, id: &str, name: &str) -> Result<()> {
        let name = clean_name(name)?;
        let mut list = self.list();
        let Some(b) = list.iter_mut().find(|b| b.id == id) else {
            return Err(PosError::NotFound("branch".into()));
        };
        if b.name == name {
            return Ok(());
        }
        b.name = name;
        self.save(&list)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_branch_is_always_there_and_new_ones_get_their_own_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let r = BranchRegistry::new(tmp.path());
        assert_eq!(r.list(), vec![Branch { id: MAIN_ID.into(), name: String::new() }]);
        assert_eq!(r.dir_of(MAIN_ID).unwrap(), tmp.path());

        r.set_name(MAIN_ID, "  Madina   Store ").unwrap();
        let b = r.create("Gulberg").unwrap();
        assert!(r.dir_of(&b.id).unwrap().is_dir());
        assert_eq!(r.list().iter().map(|b| b.name.as_str()).collect::<Vec<_>>(), vec!["Madina Store", "Gulberg"]);
        assert_eq!(r.id_of_dir(&r.dir_of(&b.id).unwrap()), Some(b.id.clone()));
        assert_eq!(r.id_of_dir(tmp.path()), Some(MAIN_ID.into()));

        assert!(r.create("gulberg").is_err(), "same name twice");
        assert!(r.create("   ").is_err());
        assert!(r.dir_of("../x").is_err());
        assert!(r.dir_of("bnotlisted").is_err());

        r.set_name(&b.id, "Gulberg Branch").unwrap();
        assert_eq!(r.list()[1].name, "Gulberg Branch");
    }

    #[test]
    fn a_damaged_list_still_opens_the_first_branch() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join(FILE), b"not json").unwrap();
        let r = BranchRegistry::new(tmp.path());
        assert_eq!(r.list().len(), 1);
        assert_eq!(r.list()[0].id, MAIN_ID);
    }
}
