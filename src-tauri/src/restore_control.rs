//! Global flags for restore isolation: pause background DB work and prevent concurrent restores.

use std::sync::atomic::{AtomicBool, Ordering};

static BACKGROUND_JOBS_PAUSED: AtomicBool = AtomicBool::new(false);
static RESTORE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

fn ts() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string()
}

/// True while restore requests background schedulers / ticks to stand down.
pub fn background_jobs_paused() -> bool {
    BACKGROUND_JOBS_PAUSED.load(Ordering::SeqCst)
}

pub fn pause_background_jobs() {
    BACKGROUND_JOBS_PAUSED.store(true, Ordering::SeqCst);
    log::info!(
        target: "import_manager::restore",
        "[{}] Background jobs paused",
        ts()
    );
}

pub fn resume_background_jobs() {
    BACKGROUND_JOBS_PAUSED.store(false, Ordering::SeqCst);
    log::info!(
        target: "import_manager::restore",
        "[{}] Background jobs resumed",
        ts()
    );
}

/// Returns `Err("Restore already in progress")` if another restore holds the lock.
pub fn try_begin_restore() -> Result<(), String> {
    if RESTORE_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Restore already in progress".to_string());
    }
    log::info!(
        target: "import_manager::restore",
        "[{}] Restore lock acquired",
        ts()
    );
    Ok(())
}

pub fn end_restore() {
    RESTORE_IN_PROGRESS.store(false, Ordering::SeqCst);
    log::info!(
        target: "import_manager::restore",
        "[{}] Restore lock released",
        ts()
    );
}

/// On drop: [`resume_background_jobs`] + [`end_restore`]. Use for `?`/panic-safe cleanup.
pub struct RestoreSessionGuard;

impl RestoreSessionGuard {
    pub fn new() -> Self {
        Self
    }
}

impl Drop for RestoreSessionGuard {
    fn drop(&mut self) {
        resume_background_jobs();
        end_restore();
    }
}
