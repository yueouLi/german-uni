// Migration 004 + 005: Varianten-Disambiguierung und Deadline-Parsing.
// Idempotent — ADD COLUMN wird übersprungen wenn die Spalte schon da ist.

import { openDb } from './_db.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = openDb();

function applyMigration(file) {
    const sql = readFileSync(join(__dirname, '..', 'sql', file), 'utf8');
    for (const stmt of sql.split(';').map(s => s.trim()).filter(Boolean)) {
        try {
            db.exec(stmt);
        } catch (e) {
            if (/duplicate column name/i.test(e.message)) continue;
            throw e;
        }
    }
    console.log(`${file} angewendet`);
}

applyMigration('004_disambiguation.sql');
applyMigration('005_deadline_parsed.sql');

// ---------- 004: stufe + variante ----------

// Stufe aus URL/Name ableiten. Bayerisches Lehramt (LMU) hat bewusst keine Stufe:
// Staatsexamen-Struktur ohne Bachelor/Master-Trennung.
function deriveStufe(url, name) {
    const hay = `${url || ''} ${name || ''}`.toLowerCase();
    if (/master-of-education|\bm\.\s?ed\b/.test(hay)) return 'Master';
    if (/bachelor-of-education|\bb\.\s?ed\b/.test(hay)) return 'Bachelor';
    if (/\bmaster\b|m\.\s?sc|\bm\.\s?a\b|m\.\s?eng|\bmba\b/.test(hay)) return 'Master';
    if (/\bbachelor\b|b\.\s?sc|\bb\.\s?a\b|b\.\s?eng/.test(hay)) return 'Bachelor';
    if (/promotion|doktor|doctor|\bphd\b/.test(hay)) return 'PhD';
    if (/staatsexamen/.test(hay)) return 'Staatsexamen';
    if (/diplom/.test(hay)) return 'Diplom';
    if (/zertifikat/.test(hay)) return 'Zertifikat';
    return null;
}

const SCHULART = {
    gymnasium: 'Gymnasium',
    realschule: 'Realschule',
    mittelschule: 'Mittelschule',
    grundschule: 'Grundschule',
    sonderpaedagogik: 'Sonderpädagogik',
    'berufliche-schulen': 'Berufliche Schulen',
};
const FACHART = {
    unterrichtsfach: 'Unterrichtsfach',
    didaktikfach: 'Didaktikfach',
    erweiterungsfach: 'Erweiterungsfach',
    qualifizierungsstudium: 'Qualifizierungsstudium',
    hauptfach: 'Hauptfach',
    nebenfach: 'Nebenfach',
};

// Variante = das, was zwei gleichnamige Programme unterscheidet.
// Reihenfolge: Ed-Stufe > Lehramt-Schulart/Fachart > Campus > ECTS-Umfang.
function deriveVariante(url, name) {
    const u = (url || '').toLowerCase();
    const n = name || '';
    const parts = [];

    if (/master-of-education|\bm\.\s?ed\b/i.test(u + ' ' + n)) parts.push('M.Ed.');
    else if (/bachelor-of-education|\bb\.\s?ed\b/i.test(u + ' ' + n)) parts.push('B.Ed.');

    for (const [k, v] of Object.entries(SCHULART)) {
        if (u.includes(`lehramt-${k}`) || u.includes(`-${k}-`) || u.includes(`${k}didaktik`)) {
            parts.push(v);
            break;
        }
    }

    // Sonderpädagogik gibt es "mit Grundschul-" und "mit Mittelschuldidaktik" —
    // sonst kollidieren die beiden Zweige unter identischem Namen.
    const didaktik = /mit-(grundschul|mittelschul)didaktik/.exec(u);
    if (didaktik) {
        parts.push(didaktik[1] === 'grundschul' ? 'mit Grundschuldidaktik' : 'mit Mittelschuldidaktik');
    }
    for (const [k, v] of Object.entries(FACHART)) {
        if (u.includes(k)) { parts.push(v); break; }
    }

    // Campus steht im Namen, nicht in der URL: "(am Campus Heilbronn)"
    const campus = /\((?:am\s+)?(?:Campus|Hauptstandort:?)\s+([^)]+)\)/i.exec(n);
    if (campus) parts.push(`Campus ${campus[1].trim()}`);

    const ects = /(\d+)\s*ECTS/i.exec(n);
    if (ects) parts.push(`${ects[1]} ECTS`);

    return parts.length ? parts.join(' · ') : null;
}

const progs = db.prepare('SELECT id, name_de, url FROM studiengang').all();
const setMeta = db.prepare('UPDATE studiengang SET variante = ?, stufe = ? WHERE id = ?');

let nStufe = 0, nVariante = 0;
for (const p of progs) {
    const stufe = deriveStufe(p.url, p.name_de);
    const variante = deriveVariante(p.url, p.name_de);
    if (stufe) nStufe++;
    if (variante) nVariante++;
    setMeta.run(variante, stufe, p.id);
}
console.log(`  stufe gesetzt: ${nStufe}/${progs.length}, variante gesetzt: ${nVariante}/${progs.length}`);

// Kontrolle: bleiben Programme übrig, die im Viewer als Duplikat erscheinen?
const stillAmbiguous = db.prepare(`
    SELECT hochschule_id, name_de, abschluss, IFNULL(variante,'') v, COUNT(*) c
    FROM studiengang
    GROUP BY hochschule_id, name_de, abschluss, IFNULL(variante,'')
    HAVING c > 1
`).all();
if (stillAmbiguous.length) {
    console.log(`  WARNUNG: ${stillAmbiguous.length} Gruppen bleiben mehrdeutig:`);
    for (const g of stillAmbiguous.slice(0, 10)) {
        console.log(`    ${g.c}x  ${g.name_de} [${g.abschluss}] ${g.v || '(keine Variante)'}`);
    }
} else {
    console.log('  keine mehrdeutigen Gruppen mehr');
}

// ---------- 005: Deadlines parsen ----------

// Akzeptiert "01.04. – 31.05.", "15.05 - 15.07.", en/em-dash und Bindestrich,
// optionaler Punkt am Monatsende. Gibt ['MM-DD','MM-DD'] oder null zurück.
function parseRange(s) {
    if (!s) return null;
    const m = /^\s*(\d{1,2})\.(\d{1,2})\.?\s*[–—-]\s*(\d{1,2})\.(\d{1,2})\.?\s*$/.exec(s);
    if (!m) return null;
    const [, d1, m1, d2, m2] = m.map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    if (m1 < 1 || m1 > 12 || m2 < 1 || m2 > 12 || d1 < 1 || d1 > 31 || d2 < 1 || d2 > 31) return null;
    return [`${pad(m1)}-${pad(d1)}`, `${pad(m2)}-${pad(d2)}`];
}

const zul = db.prepare('SELECT id, deadline_ws, deadline_ss FROM zulassung').all();
const setDl = db.prepare(`
    UPDATE zulassung
    SET deadline_ws_start = ?, deadline_ws_end = ?, deadline_ss_start = ?, deadline_ss_end = ?
    WHERE id = ?
`);

let okWs = 0, okSs = 0;
const failed = [];
for (const z of zul) {
    const ws = parseRange(z.deadline_ws);
    const ss = parseRange(z.deadline_ss);
    if (z.deadline_ws && !ws) failed.push(z.deadline_ws);
    if (z.deadline_ss && !ss) failed.push(z.deadline_ss);
    if (ws) okWs++;
    if (ss) okSs++;
    setDl.run(ws?.[0] ?? null, ws?.[1] ?? null, ss?.[0] ?? null, ss?.[1] ?? null, z.id);
}

const totalWs = zul.filter(z => z.deadline_ws).length;
const totalSs = zul.filter(z => z.deadline_ss).length;
console.log(`  WS geparst: ${okWs}/${totalWs}, SS geparst: ${okSs}/${totalSs}`);
if (failed.length) {
    console.log(`  nicht geparst (${failed.length}):`, [...new Set(failed)]);
}

db.close();
console.log('Fertig.');
