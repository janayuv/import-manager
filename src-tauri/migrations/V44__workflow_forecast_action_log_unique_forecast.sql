-- At most one acknowledgment row per forecast (operational safety + idempotent ack).
DELETE FROM workflow_forecast_action_log
WHERE rowid NOT IN (
    SELECT MIN(rowid) FROM workflow_forecast_action_log GROUP BY forecast_id
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wf_forecast_action_log_forecast_id
    ON workflow_forecast_action_log (forecast_id);
