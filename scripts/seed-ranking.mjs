// Seed ranking table — every QID verified against actual DB content.
// Rankings: QS 2025 (Juni 2024), THE 2025, ARWU 2024.
// Labels: TU9 (offiziell 9), Exzellenzuniversität 2019-2026, U15-Verbund.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDb, ROOT } from './_db.mjs';

const db = openDb();
db.exec(readFileSync(join(ROOT, 'sql', '002_ranking.sql'), 'utf8'));

// -------------------------------------------------------------
// Alle QIDs sind aus der Wikidata-Ingest-DB verifiziert
// -------------------------------------------------------------
const RANKINGS = [
    // === TU9 (9 offiziell) — 4 davon zusätzlich Exzellenz ===
    { qid: 'Q157808', qs: 28,  the: 26,  arwu: 54,   tu9: 1, exz: 1, note: 'TU München' },
    { qid: 'Q273263', qs: 106, the: 99,  arwu: 201,  tu9: 1, exz: 1, note: 'RWTH Aachen' },
    { qid: 'Q309988', qs: 119, the: 105, arwu: 201,  tu9: 1, exz: 1, note: 'KIT Karlsruhe' },
    { qid: 'Q51985',  qs: 154, the: 165, arwu: 301,  tu9: 1, exz: 1, note: 'TU Berlin — Berlin Alliance' },
    { qid: 'Q158158', qs: 239, the: 173, arwu: 201,  tu9: 1, exz: 1, note: 'TU Dresden' },
    { qid: 'Q122453', qs: 312, the: 351, arwu: 401,  tu9: 1,          note: 'Uni Stuttgart' },
    { qid: 'Q310695', qs: 328, the: 251, arwu: 401,  tu9: 1,          note: 'TU Darmstadt' },
    { qid: 'Q678982', qs: 371, the: 351, arwu: 501,  tu9: 1,          note: 'Leibniz Uni Hannover' },
    { qid: 'Q734324', qs: 826, the: 601, arwu: 601,  tu9: 1,          note: 'TU Braunschweig' },

    // === Weitere Exzellenzunis (7, denn 4 sind bereits TU9-Exzellenz oben) ===
    { qid: 'Q55044',  qs: 59,  the: 38,  arwu: 43,           exz: 1, note: 'LMU München' },
    { qid: 'Q151510', qs: 87,  the: 47,  arwu: 57,           exz: 1, note: 'Uni Heidelberg' },
    { qid: 'Q153006', qs: 98,  the: 91,  arwu: 101,          exz: 1, note: 'FU Berlin — Berlin Alliance' },
    { qid: 'Q152087', qs: 120, the: 87,  arwu: 151,          exz: 1, note: 'HU Berlin — Berlin Alliance' },
    { qid: 'Q156725', qs: 205, the: 137, arwu: 151,          exz: 1, note: 'Uni Hamburg' },
    { qid: 'Q152171', qs: 239, the: 91,  arwu: 70,           exz: 1, note: 'Uni Bonn' },
    { qid: 'Q153978', qs: 213, the: 95,  arwu: 151,          exz: 1, note: 'Uni Tübingen' },
    { qid: 'Q835440', qs: 440, the: 201, arwu: 401,          exz: 1, note: 'Uni Konstanz' },

    // === U15-Mitglieder (nicht schon oben) ===
    { qid: 'Q153987', qs: 192, the: 124, arwu: 101,          u15: 1, note: 'Uni Freiburg' },
    { qid: 'Q152838', qs: 249, the: 130, arwu: 101,          u15: 1, note: 'Uni Göttingen' },
    { qid: 'Q168426', qs: 356, the: 251, arwu: 151,          u15: 1, note: 'Uni Münster' },
    { qid: 'Q54096',  qs: 340, the: 155, arwu: 151,          u15: 1, note: 'Uni Köln' },
    { qid: 'Q50662',  qs: 366, the: 176, arwu: 151,          u15: 1, note: 'Goethe Frankfurt' },
    { qid: 'Q161976', qs: 434, the: 165, arwu: 201,          u15: 1, note: 'Uni Würzburg' },
    { qid: 'Q161982', qs: 466, the: 251, arwu: 201,          u15: 1, note: 'Uni Mainz' },
    { qid: 'Q154804', qs: 388, the: 251, arwu: 301,          u15: 1, note: 'Uni Leipzig' },
    { qid: 'Q40025',  qs: 285, the: 137, arwu: 201,          u15: 1, note: 'FAU Erlangen-Nürnberg' },

    // === Weitere Top-Unis (ohne Sonderstatus) ===
    { qid: 'Q309948', qs: 461, the: 351, arwu: 301,                   note: 'Ruhr-Uni Bochum' },
    { qid: 'Q696757', qs: 501, the: 301, arwu: 301,                   note: 'Uni Duisburg-Essen' },
    { qid: 'Q317032', qs: 419, the: 251, arwu: 201,                   note: 'Uni Düsseldorf' },
    { qid: 'Q685557', qs: 601, the: 351,                              note: 'TU Dortmund' },
    { qid: 'Q154561', qs: 468, the: 301, arwu: 301,                   note: 'Uni Jena' },
    { qid: 'Q156737', qs: 601, the: 251, arwu: 301,                   note: 'Uni Kiel' },
    { qid: 'Q317053', qs: 681, the: 501,                              note: 'Uni Gießen' },
    { qid: 'Q155354', qs: 651, the: 401,                              note: 'Uni Marburg' },
    { qid: 'Q24382',  qs: 501, the: 301, arwu: 401,                   note: 'Uni Bielefeld' },
    { qid: 'Q500692', qs: 501, the: 351, arwu: 601,                   note: 'Uni Bremen' },
    { qid: 'Q616905', qs: 601, the: 401,                              note: 'Uni Augsburg' },
    { qid: 'Q32120',  qs: 601, the: 401,                              note: 'Uni Halle-Wittenberg' },
    { qid: 'Q574571', qs: 559, the: 351, arwu: 401,                   note: 'Uni Regensburg' },
    { qid: 'Q153012', qs: 601, the: 401,                              note: 'Uni Potsdam' },
    { qid: 'Q700758', qs: 641, the: 351,                              note: 'Uni Saarland' },
    { qid: 'Q317070', qs: 435, the: 351, arwu: 601,                   note: 'Uni Mannheim' },
    { qid: 'Q835662', qs: 641, the: 176, arwu: 201,                   note: 'Uni Ulm' },
    { qid: 'Q702482', qs: 601, the: 401,                              note: 'Uni Bayreuth' },
];

// -------------------------------------------------------------
// Ausführung
// -------------------------------------------------------------
const byQid = db.prepare('SELECT id, name_de FROM hochschule WHERE wikidata_qid = ?');
const upsert = db.prepare(`
    INSERT INTO ranking (hochschule_id, qs_2025, the_2025, arwu_2024, tu9, exzellenz, u15, stand, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'QS 2025 / THE 2025 / ARWU 2024', datetime('now'))
    ON CONFLICT(hochschule_id) DO UPDATE SET
        qs_2025 = excluded.qs_2025,
        the_2025 = excluded.the_2025,
        arwu_2024 = excluded.arwu_2024,
        tu9 = excluded.tu9,
        exzellenz = excluded.exzellenz,
        u15 = excluded.u15,
        updated_at = datetime('now')
`);

db.exec('DELETE FROM ranking');
console.log('Ranking-Tabelle geleert.\n');

let matched = 0, missed = 0;
const missedList = [];

db.exec('BEGIN');
for (const r of RANKINGS) {
    const row = byQid.get(r.qid);
    if (!row) {
        console.log(`  ✗ QID ${r.qid} nicht in DB (${r.note})`);
        missed++;
        missedList.push(`${r.note} (${r.qid})`);
        continue;
    }
    upsert.run(row.id, r.qs ?? null, r.the ?? null, r.arwu ?? null,
               r.tu9 ?? 0, r.exz ?? 0, r.u15 ?? 0);

    const badges = [];
    if (r.tu9) badges.push('TU9');
    if (r.exz) badges.push('Exz');
    if (r.u15) badges.push('U15');
    const badgeStr = badges.length ? ` [${badges.join(',')}]` : '';
    console.log(`  ✓ QS=${(r.qs ?? '-').toString().padStart(4)}${badgeStr.padEnd(18)}  ${row.name_de.slice(0, 55)}`);
    matched++;
}
db.exec('COMMIT');

// -------------------------------------------------------------
// Verifikation
// -------------------------------------------------------------
console.log(`\n=== Ergebnis ===`);
console.log(`Matched: ${matched}   Missed: ${missed}`);
if (missedList.length) console.log(`Fehlend:\n  - ${missedList.join('\n  - ')}`);

console.log(`\n=== TU9 in DB (soll: 9) ===`);
const tu9Rows = db.prepare(`
    SELECT h.name_de, r.qs_2025, r.exzellenz
    FROM ranking r JOIN hochschule h ON h.id = r.hochschule_id
    WHERE r.tu9 = 1 ORDER BY r.qs_2025 ASC NULLS LAST
`).all();
console.log(`Anzahl: ${tu9Rows.length}`);
for (const r of tu9Rows) {
    console.log(`  QS ${(r.qs_2025+'').padStart(4)}  ${r.exzellenz ? '★' : ' '}  ${r.name_de}`);
}

console.log(`\n=== Exzellenzuniversitäten in DB (soll: 11) ===`);
const exzRows = db.prepare(`
    SELECT h.name_de, r.qs_2025, r.tu9
    FROM ranking r JOIN hochschule h ON h.id = r.hochschule_id
    WHERE r.exzellenz = 1 ORDER BY r.qs_2025 ASC NULLS LAST
`).all();
console.log(`Anzahl: ${exzRows.length}`);
for (const r of exzRows) {
    console.log(`  QS ${(r.qs_2025+'').padStart(4)}  ${r.tu9 ? 'TU9' : '   '}  ${r.name_de}`);
}

db.close();
