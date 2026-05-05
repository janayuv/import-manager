use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PolicyDecisionKind {
    Allow,
    Block,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PolicySeverity {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyDecision {
    pub decision: PolicyDecisionKind,
    pub severity: PolicySeverity,
    pub reason_code: String,
    pub user_message: String,
}

impl PolicyDecision {
    pub fn allow(reason_code: &str, user_message: &str) -> Self {
        Self {
            decision: PolicyDecisionKind::Allow,
            severity: PolicySeverity::Low,
            reason_code: reason_code.to_string(),
            user_message: user_message.to_string(),
        }
    }

    pub fn block(severity: PolicySeverity, reason_code: &str, user_message: &str) -> Self {
        Self {
            decision: PolicyDecisionKind::Block,
            severity,
            reason_code: reason_code.to_string(),
            user_message: user_message.to_string(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyContext {
    pub caller_role: String,
    pub action: String,
    pub target_id: Option<String>,
}

fn role_is_privileged(role: &str) -> bool {
    matches!(
        role.trim().to_lowercase().as_str(),
        "administrator" | "admin" | "manager" | "db_manager"
    )
}

pub fn evaluate_policy(conn: &Connection, ctx: &PolicyContext) -> PolicyDecision {
    if !role_is_privileged(&ctx.caller_role) {
        return PolicyDecision::block(
            PolicySeverity::High,
            "ROLE_NOT_ALLOWED",
            "Your role is not allowed to perform this automation change.",
        );
    }

    if ctx.action == "set_workflow_automation_master_enabled_false" {
        let enabled_rules = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_decision_rules WHERE enabled = 1",
                [],
                |r| r.get::<_, i64>(0),
            )
            .unwrap_or(0);
        if enabled_rules <= 1 {
            return PolicyDecision::block(
                PolicySeverity::High,
                "DISABLE_ALL_AUTOMATION",
                "Blocking this change would effectively disable all automation coverage.",
            );
        }
    }

    if ctx.action == "run_workflow_automation_cycle_command" {
        let recent_runs = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_job_execution_log WHERE job_id = 'automation_cycle' AND datetime(started_at) >= datetime('now', '-1 minute')",
                [],
                |r| r.get::<_, i64>(0),
            )
            .unwrap_or(0);
        if recent_runs >= 3 {
            return PolicyDecision::block(
                PolicySeverity::Medium,
                "CYCLE_RATE_LIMITED",
                "Too many automation cycle runs in the last minute.",
            );
        }
    }

    if ctx.action == "set_workflow_background_job_enabled_command_false"
        && ctx.target_id.as_deref() == Some("maintenance_cleanup")
    {
        return PolicyDecision::block(
            PolicySeverity::High,
            "CANNOT_DISABLE_MAINTENANCE_JOB",
            "maintenance_cleanup cannot be disabled by the system agent.",
        );
    }

    if ctx.action == "list_only" {
        return PolicyDecision::allow("READ_ONLY", "Read-only route allowed.");
    }

    let _ = conn
        .query_row(
            "SELECT value FROM app_metadata WHERE key = 'workflow_automation_paused_until'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional();

    PolicyDecision::allow("POLICY_OK", "Policy checks passed.")
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("mem db");
        conn.execute_batch(
            "
            CREATE TABLE workflow_decision_rules (rule_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE workflow_job_execution_log (
                execution_id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                started_at TEXT NOT NULL,
                status TEXT NOT NULL,
                error_message TEXT
            );
            CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            ",
        )
        .expect("schema");
        conn
    }

    #[test]
    fn blocks_disabling_all_automation() {
        let conn = setup_conn();
        conn.execute(
            "INSERT INTO workflow_decision_rules (rule_id, enabled) VALUES (?1, 1)",
            params!["r1"],
        )
        .unwrap();
        let d = evaluate_policy(
            &conn,
            &PolicyContext {
                caller_role: "administrator".into(),
                action: "set_workflow_automation_master_enabled_false".into(),
                target_id: None,
            },
        );
        assert_eq!(d.decision, PolicyDecisionKind::Block);
        assert_eq!(d.severity, PolicySeverity::High);
    }

    #[test]
    fn blocks_high_cycle_rate() {
        let conn = setup_conn();
        for i in 0..3 {
            conn.execute(
                "INSERT INTO workflow_job_execution_log (execution_id, job_id, started_at, status, error_message) VALUES (?1, 'automation_cycle', datetime('now'), 'SUCCESS', '')",
                params![format!("ex{i}")],
            ).unwrap();
        }
        let d = evaluate_policy(
            &conn,
            &PolicyContext {
                caller_role: "administrator".into(),
                action: "run_workflow_automation_cycle_command".into(),
                target_id: None,
            },
        );
        assert_eq!(d.decision, PolicyDecisionKind::Block);
        assert_eq!(d.severity, PolicySeverity::Medium);
    }

    #[test]
    fn blocks_maintenance_disable_with_clear_message() {
        let conn = setup_conn();
        let d = evaluate_policy(
            &conn,
            &PolicyContext {
                caller_role: "administrator".into(),
                action: "set_workflow_background_job_enabled_command_false".into(),
                target_id: Some("maintenance_cleanup".into()),
            },
        );
        assert_eq!(d.decision, PolicyDecisionKind::Block);
        assert_eq!(d.severity, PolicySeverity::High);
        assert!(d.user_message.contains("cannot be disabled"));
    }
}
