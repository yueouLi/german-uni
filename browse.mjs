import { openDb } from './_db.mjs';

const db = openDb();

// === 1. Bayern: alle Hochschulen ===
// Wir haben kein bundesland gefüllt — nutzen Koordinaten-Bounding-Box für Bayern
// Bayern: ~ lat 47.3–50.6, lon 8.9–13.8
console.log('\n=== 1) Bayern (per Koordinaten-Box) ===');
const bayern = db
    .prepare(
        `SELECT name_de, stadt, typ, latitude, longitude
         FROM hochschule
         WHERE latitude BETWEEN 47.3 AND 50.6
           AND longitude BETWEEN 8.9 AND 13.8
           AND typ IN ('Universität','TU','FH','Kunst','Musik','PH')
         ORDER BY typ, name_de`
    )
    .all();
console.log(`Gefunden: ${bayern.length}`);
for (const r of bayern) {
    console.log(`  [${r.typ.padEnd(11)}] ${r.name_de}  —  ${r.stadt ?? '?'}`);
}

// === 2. Alle TU ===
console.log('\n=== 2) Alle Technischen Universitäten ===');
const tus = db
    .prepare(
        `SELECT name_de, stadt, gruendungsjahr, studenten_anzahl
         FROM hochschule
         WHERE typ = 'TU'
         ORDER BY studenten_anzahl DESC NULLS LAST, name_de`
    )
    .all();
console.log(`Gefunden: ${tus.length}`);
for (const r of tus) {
    const s = r.studenten_anzahl ? `${r.studenten_anzahl} Stud.` : '?';
    const g = r.gruendungsjahr ?? '?';
    console.log(`  ${r.name_de.padEnd(50)} ${(r.stadt ?? '?').padEnd(20)} ${g}  ${s}`);
}

// === 3. Top-Städte: wo sind die meisten Unis? ===
console.log('\n=== 3) Top-15 Städte nach Anzahl Hochschulen ===');
const staedte = db
    .prepare(
        `SELECT stadt, COUNT(*) AS n
         FROM hochschule
         WHERE stadt IS NOT NULL
           AND typ IN ('Universität','TU','FH','Kunst','Musik','PH')
         GROUP BY stadt
         ORDER BY n DESC, stadt
         LIMIT 15`
    )
    .all();
for (const r of staedte) {
    console.log(`  ${r.stadt.padEnd(25)} ${r.n}`);
}

db.close();
