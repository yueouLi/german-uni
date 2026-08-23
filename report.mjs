import { openDb } from './_db.mjs';

const db = openDb();

const total = db.prepare('SELECT COUNT(*) c FROM hochschule').get().c;
console.log(`\n=== Übersicht ===`);
console.log(`Gesamt: ${total}`);

console.log(`\n=== Nach Typ ===`);
for (const r of db
    .prepare('SELECT typ, COUNT(*) c FROM hochschule GROUP BY typ ORDER BY c DESC')
    .all()) {
    console.log(`  ${r.typ ?? '(null)'}: ${r.c}`);
}

console.log(`\n=== Koordinaten-Abdeckung ===`);
const withCoord = db
    .prepare('SELECT COUNT(*) c FROM hochschule WHERE latitude IS NOT NULL')
    .get().c;
console.log(`  ${withCoord} / ${total} (${((withCoord / total) * 100).toFixed(1)}%)`);

console.log(`\n=== Stichprobe "Sonstige" (20) ===`);
for (const r of db
    .prepare(`SELECT name_de, stadt FROM hochschule WHERE typ = 'Sonstige' ORDER BY RANDOM() LIMIT 20`)
    .all()) {
    console.log(`  - ${r.name_de}  [${r.stadt ?? '?'}]`);
}

console.log(`\n=== Bekannte Unis: gefunden? ===`);
const checkList = [
    'Technische Universität München',
    'Ludwig-Maximilians-Universität München',
    'RWTH Aachen',
    'Humboldt-Universität zu Berlin',
    'Ruprecht-Karls-Universität Heidelberg',
    'Universität Freiburg',
    'Universität Hamburg',
    'Universität Bonn',
    'Karlsruher Institut für Technologie',
    'Freie Universität Berlin',
];
for (const q of checkList) {
    const r = db
        .prepare(
            `SELECT name_de, stadt, latitude, typ FROM hochschule
             WHERE name_de LIKE ? OR name_en LIKE ? LIMIT 1`
        )
        .get('%' + q + '%', '%' + q + '%');
    if (r) {
        console.log(`  ✓ ${q}`);
        console.log(`    → ${r.name_de} | ${r.stadt ?? '?'} | ${r.typ} | ${r.latitude ?? '?'}`);
    } else {
        console.log(`  ✗ NICHT GEFUNDEN: ${q}`);
    }
}

console.log(`\n=== Sync-Historie ===`);
for (const r of db.prepare('SELECT * FROM sync_run ORDER BY id DESC LIMIT 5').all()) {
    console.log(
        `  #${r.id} ${r.quelle} ${r.status} — +${r.rows_inserted} ~${r.rows_updated} skip:${r.rows_skipped}`
    );
}

db.close();
