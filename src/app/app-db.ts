import { Database } from 'bun:sqlite';

let db: Database | null = null;

export function openAppDb(dataDir: string): void {
  db = new Database(`${dataDir}/app.db`);
  db.run('PRAGMA journal_mode = WAL');
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

export function getSetting(key: string): string | null {
  if (db === null) return null;
  const row = db
    .query<{ value: string }, [string]>(
      'SELECT value FROM settings WHERE key = ?'
    )
    .get(key);
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  if (db === null) return;
  db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}
