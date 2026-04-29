-- Remove deprecated AI extraction artifacts.
DROP INDEX IF EXISTS idx_ai_extraction_log_created;
DROP TABLE IF EXISTS ai_extraction_log;

-- Remove AI provider settings keys if they were persisted.
DELETE FROM app_settings
WHERE key IN (
  'ai_provider',
  'deepseek_api_key',
  'ollama_endpoint',
  'ollama_model'
);
