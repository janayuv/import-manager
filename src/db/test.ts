import sqlite3 from 'sqlite3'

export function openInsecureDatabase() {
  // This should trigger the SQLite encryption rule
  // eslint-disable-next-line no-restricted-syntax
  const db = new sqlite3.Database('./insecure.db')

  db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)')
    db.run('INSERT INTO users (name) VALUES (?)', ['test user'])
  })

  return db
}

export function queryInsecureData() {
  // eslint-disable-next-line no-restricted-syntax
  const db = new sqlite3.Database('./data.sqlite')

  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM users', (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}
