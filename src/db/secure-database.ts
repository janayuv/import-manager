import sqlite3 from 'sqlite3';

// Environment variable for database encryption key (Vite uses import.meta.env)
// Safe fallback for when running outside of Vite environment
const getDatabaseKey = (): string => {
  try {
    return (
      import.meta.env.VITE_DATABASE_ENCRYPTION_KEY || 'default-encryption-key'
    );
  } catch {
    return 'default-encryption-key';
  }
};

const DATABASE_ENCRYPTION_KEY = getDatabaseKey();

export interface DatabaseConfig {
  filename: string;
  encryptionKey?: string;
}

export class SecureDatabase {
  private db: sqlite3.Database | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = {
      ...config,
      encryptionKey: config.encryptionKey || DATABASE_ENCRYPTION_KEY,
    };
  }

  /**
   * Open a secure encrypted database connection
   */
  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create database with encryption
        // eslint-disable-next-line no-restricted-syntax
        this.db = new sqlite3.Database(this.config.filename, err => {
          if (err) {
            reject(new Error(`Failed to open database: ${err.message}`));
            return;
          }

          // Set encryption key using PRAGMA
          this.db!.run(`PRAGMA key = '${this.config.encryptionKey}'`, err => {
            if (err) {
              reject(new Error(`Failed to set encryption key: ${err.message}`));
              return;
            }

            // Verify encryption is working
            this.db!.run('PRAGMA cipher_compatibility = 4', err => {
              if (err) {
                reject(
                  new Error(
                    `Failed to set cipher compatibility: ${err.message}`
                  )
                );
                return;
              }

              resolve();
            });
          });
        });
      } catch (error) {
        reject(new Error(`Database initialization failed: ${error}`));
      }
    });
  }

  /**
   * Execute a query with parameters
   */
  async run(sql: string, params: unknown[] = []): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not opened'));
        return;
      }

      this.db.run(sql, params, function (err) {
        if (err) {
          reject(new Error(`Query execution failed: ${err.message}`));
          return;
        }
        resolve(this);
      });
    });
  }

  /**
   * Execute a query and return all rows
   */
  async all(sql: string, params: unknown[] = []): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not opened'));
        return;
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(new Error(`Query execution failed: ${err.message}`));
          return;
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Execute a query and return first row
   */
  async get(sql: string, params: unknown[] = []): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not opened'));
        return;
      }

      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(new Error(`Query execution failed: ${err.message}`));
          return;
        }
        resolve(row);
      });
    });
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(): Promise<void> {
    await this.run('BEGIN TRANSACTION');
  }

  /**
   * Commit a transaction
   */
  async commitTransaction(): Promise<void> {
    await this.run('COMMIT');
  }

  /**
   * Rollback a transaction
   */
  async rollbackTransaction(): Promise<void> {
    await this.run('ROLLBACK');
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      this.db.close(err => {
        if (err) {
          reject(new Error(`Failed to close database: ${err.message}`));
          return;
        }
        this.db = null;
        resolve();
      });
    });
  }

  /**
   * Check if database is open
   */
  isOpen(): boolean {
    return this.db !== null;
  }
}

/**
 * Create a secure database instance
 */
export function createSecureDatabase(
  filename: string,
  encryptionKey?: string
): SecureDatabase {
  return new SecureDatabase({ filename, encryptionKey });
}

/**
 * Example usage function
 */
export async function exampleSecureDatabaseUsage() {
  const db = createSecureDatabase('./secure-data.db');

  try {
    await db.open();

    // Create table
    await db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert data
    await db.run('INSERT INTO users (username, email) VALUES (?, ?)', [
      'john_doe',
      'john@example.com',
    ]);

    // Query data
    const users = await db.all('SELECT * FROM users');
    console.log('Users:', users);
  } catch (error) {
    console.error('Database error:', error);
  } finally {
    await db.close();
  }
}
