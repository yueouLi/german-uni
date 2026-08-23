import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { openDb, DB_PATH, ROOT } from './_db.mjs';

const schemaPath = join(ROOT, 'sql', '001_schema.sql');

if (!existsSync(dirname(DB_PATH))) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
}

// Backup falls DB existiert — Regel "nichts überschreiben"
if (existsSync(DB_PATH)) {
    const stamp = new Date().toISOString().slice(0, 10);
    const backup = DB_PATH.replace(/\.db$/, `.BACKUP-${stamp}.db`);
    copyFileSync(DB_PATH, backup);
    console.log(`Backup: ${backup}`);
}

const sql = readFileSync(schemaPath, 'utf8');
const db = openDb();
db.exec(sql);

const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);

console.log(`DB bereit: ${DB_PATH}`);
console.log(`Tabellen (${tables.length}): ${tables.join(', ')}`);

db.close();
