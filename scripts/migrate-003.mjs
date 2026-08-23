import { readFileSync } from 'node:fs';
import { openDb } from './_db.mjs';

const db = openDb();
const sql = readFileSync(new URL('../sql/003_zulassung_ext.sql', import.meta.url), 'utf8');
// Strip -- comments, then split
const clean = sql.replace(/--[^\n]*/g, '').trim();
const statements = clean.split(';').map(s => s.trim()).filter(s => s.length > 0);
console.log('Statements to run:', statements.length);
for (const stmt of statements) {
    try {
        db.exec(stmt);
        console.log('OK:  ', stmt.slice(0, 70));
    } catch (e) {
        if (/duplicate column/i.test(e.message)) console.log('SKIP:', stmt.slice(0, 70));
        else throw e;
    }
}
db.close();
