import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';

const dbPath = path.join(
  os.homedir(),
  'AppData',
  'Roaming',
  'com.jana.importmanager',
  'import-manager.db'
);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, err => {
  if (err) {
    console.error('Error opening db:', err.message);
    process.exit(1);
  }
});

async function run() {
  console.log('--- STARTING DATABASE STRESS TEST ---');

  // 1. Measure simple read
  let start = Date.now();
  await new Promise(r =>
    db.all('SELECT COUNT(*) FROM shipments', (e, rows) => {
      console.log(
        `Shipments count: ${rows[0]['COUNT(*)']} (took ${Date.now() - start}ms)`
      );
      r();
    })
  );

  // 2. Measure report_view
  console.log('\n--- REPORT GENERATION (report_view) ---');
  for (let i = 0; i < 5; i++) {
    start = Date.now();
    await new Promise(r =>
      db.all('SELECT * FROM report_view LIMIT 1000', (e, rows) => r())
    );
    console.log(`Report run ${i + 1}: ${Date.now() - start}ms`);
  }

  // 3. Write Latency
  console.log('\n--- WRITE LATENCY ---');
  start = Date.now();
  const stmt = db.prepare(
    "INSERT INTO audit_logs (table_name, action, created_at) VALUES ('test', 'stress_test', datetime('now'))"
  );
  for (let i = 0; i < 1000; i++) {
    stmt.run();
  }
  stmt.finalize();
  console.log(`1000 sequential inserts took ${Date.now() - start}ms`);

  db.run("DELETE FROM audit_logs WHERE action = 'stress_test'");

  console.log('\n--- TEST COMPLETE ---');
}

run();
