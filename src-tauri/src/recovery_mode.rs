//! Emergency recovery entry: activated only via `--recovery` or `IMPORT_MANAGER_RECOVERY=1`.
//! When active, the app exposes recovery-only IPC and allows sign-in despite account lockout.

#[derive(Debug, Clone)]
pub struct RecoveryModeState(bool);

impl RecoveryModeState {
    pub fn from_env_and_args() -> Self {
        let env_on = std::env::var("IMPORT_MANAGER_RECOVERY")
            .map(|v| {
                matches!(
                    v.trim().to_ascii_lowercase().as_str(),
                    "1" | "true" | "yes" | "on"
                )
            })
            .unwrap_or(false);
        let arg_on = std::env::args().any(|a| a == "--recovery");
        Self(env_on || arg_on)
    }

    pub fn is_active(&self) -> bool {
        self.0
    }
}
