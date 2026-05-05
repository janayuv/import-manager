-- In-app bug tracker (developer tool): notes + optional screenshot path + JSON context/meta.

CREATE TABLE IF NOT EXISTS bug_notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('OPEN','SOLVED')) DEFAULT 'OPEN',
  screenshot_path TEXT,
  context TEXT,
  meta TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bug_notes_updated_at_desc ON bug_notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_notes_status ON bug_notes(status);

PRAGMA user_version = 77;
