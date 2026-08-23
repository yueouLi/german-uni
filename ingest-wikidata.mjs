// =============================================================
// Wikidata SPARQL Ingest — deutsche Hochschulen
// =============================================================
// Query: alle Instanzen von Hochschule (Q38723) und Subklassen
// mit country=Germany (Q183). Wikidata deckt so ca. 400+ Institutionen.
// =============================================================

import { openDb, ROOT } from './_db.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'dt-uni-app/0.0.1 (personal project; contact: yueou.li@allianz.de)';

// SPARQL: alle Hochschulen in DE mit optionalen Feldern
// P31 = instance of, wdt:P31/wdt:P279* = ist Hochschule oder Subklasse
// Q3918 = Universität, Q38723 = Hochschule, Q189004 = Fachhochschule
// Vereinfacht: kein P131-Recursion (das timed-out).
// Bundesland kommt später via separaten Lookup oder Nominatim.
const SPARQL = `
SELECT ?uni ?uniLabel ?uniLabelEn ?shortName
       ?cityLabel
       ?coord ?founded ?students
       ?type ?typeLabel
       ?website
WHERE {
  ?uni wdt:P31/wdt:P279* wd:Q38723 ;
       wdt:P17 wd:Q183 .
  OPTIONAL { ?uni wdt:P131 ?city . }
  OPTIONAL { ?uni wdt:P625 ?coord . }
  OPTIONAL { ?uni wdt:P571 ?founded . }
  OPTIONAL { ?uni wdt:P2196 ?students . }
  OPTIONAL { ?uni wdt:P31 ?type . }
  OPTIONAL { ?uni wdt:P856 ?website . }
  OPTIONAL { ?uni wdt:P1813 ?shortName . FILTER(LANG(?shortName)="de") }
  OPTIONAL { ?uni rdfs:label ?uniLabelEn . FILTER(LANG(?uniLabelEn)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
}
`;

async function fetchWikidata() {
    const url = `${ENDPOINT}?query=${encodeURIComponent(SPARQL)}&format=json`;
    console.log('Rufe Wikidata SPARQL Endpoint auf...');
    const res = await fetch(url, {
        headers: {
            'Accept': 'application/sparql-results+json',
            'User-Agent': USER_AGENT,
        },
    });
    if (!res.ok) {
        throw new Error(`Wikidata HTTP ${res.status}: ${await res.text()}`);
    }
    const json = await res.json();
    return json.results.bindings;
}

// "Point(11.5761 48.1499)" -> [48.1499, 11.5761]
function parseCoord(pointWkt) {
    if (!pointWkt) return { lat: null, lon: null };
    const m = pointWkt.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
    if (!m) return { lat: null, lon: null };
    return { lat: parseFloat(m[2]), lon: parseFloat(m[1]) };
}

// Wikidata QID aus URI
function qidFromUri(uri) {
    if (!uri) return null;
    const m = uri.match(/(Q\d+)$/);
    return m ? m[1] : null;
}

// Wikidata Typ-QID auf unsere typ-Enum mappen
const TYP_MAP = {
    Q3918: 'Universität',       // Universität
    Q189004: 'FH',              // Fachhochschule
    Q1663017: 'TU',             // Technische Universität
    Q207616: 'Kunst',           // Kunsthochschule
    Q184644: 'Musik',           // Musikhochschule
    Q1341478: 'PH',             // Pädagogische Hochschule
    Q875538: 'Universität',     // public university
};

function mapTyp(typeQid, label) {
    if (typeQid && TYP_MAP[typeQid]) return TYP_MAP[typeQid];
    if (!label) return 'Sonstige';
    const l = label.toLowerCase();
    if (l.includes('technische') || l.includes('tu ')) return 'TU';
    if (l.includes('fachhochschule') || l.includes(' fh ')) return 'FH';
    if (l.includes('kunst')) return 'Kunst';
    if (l.includes('musik')) return 'Musik';
    if (l.includes('pädagog')) return 'PH';
    if (l.includes('universität')) return 'Universität';
    return 'Sonstige';
}

// SPARQL liefert mehrere Zeilen pro Uni (verschiedene types etc.) — dedupen
function collapseRows(rows) {
    const map = new Map();
    for (const r of rows) {
        const qid = qidFromUri(r.uni?.value);
        if (!qid) continue;
        if (!map.has(qid)) {
            map.set(qid, {
                qid,
                name_de: r.uniLabel?.value ?? null,
                name_en: r.uniLabelEn?.value ?? null,
                name_kurz: r.shortName?.value ?? null,
                stadt: r.cityLabel?.value ?? null,
                bundesland: null, // wird nachträglich via P131-Lookup gefüllt
                website: r.website?.value ?? null,
                types: new Set(),
                type_labels: new Set(),
                coord: r.coord?.value ?? null,
                founded: r.founded?.value ?? null,
                students: r.students?.value ?? null,
            });
        }
        const entry = map.get(qid);
        // Merge: nimm ersten nicht-null Wert
        if (r.cityLabel?.value && !entry.stadt) entry.stadt = r.cityLabel.value;
        if (r.type?.value) {
            entry.types.add(qidFromUri(r.type.value));
            if (r.typeLabel?.value) entry.type_labels.add(r.typeLabel.value);
        }
        if (r.coord?.value && !entry.coord) entry.coord = r.coord.value;
        if (r.founded?.value && !entry.founded) entry.founded = r.founded.value;
        if (r.students?.value && !entry.students) entry.students = r.students.value;
    }
    return [...map.values()];
}

function determineTyp(entry) {
    for (const qid of entry.types) {
        if (TYP_MAP[qid]) return TYP_MAP[qid];
    }
    return mapTyp(null, entry.name_de);
}

async function main() {
    const db = openDb();

    // Log-Eintrag
    const runInsert = db.prepare(
        `INSERT INTO sync_run (quelle, started_at, status) VALUES (?, ?, 'running')`
    );
    const runId = runInsert.run('wikidata', new Date().toISOString()).lastInsertRowid;

    let rows;
    try {
        rows = await fetchWikidata();
    } catch (e) {
        db.prepare(
            `UPDATE sync_run SET finished_at=?, status='error', fehler=? WHERE id=?`
        ).run(new Date().toISOString(), String(e), runId);
        console.error('SPARQL Fehler:', e);
        db.close();
        process.exit(1);
    }

    console.log(`SPARQL Zeilen roh: ${rows.length}`);

    // Rohantwort für Debug speichern
    const rawDir = join(ROOT, 'data', 'raw');
    if (!existsSync(rawDir)) mkdirSync(rawDir, { recursive: true });
    const rawPath = join(rawDir, `wikidata-${Date.now()}.json`);
    writeFileSync(rawPath, JSON.stringify(rows, null, 2));
    console.log(`Rohantwort: ${rawPath}`);

    const entries = collapseRows(rows);
    console.log(`Deduped Hochschulen: ${entries.length}`);

    // Insert / Update
    const upsert = db.prepare(`
        INSERT INTO hochschule
            (name_de, name_kurz, name_en, wikidata_qid, website,
             stadt, bundesland, latitude, longitude,
             typ, gruendungsjahr, studenten_anzahl, quelle, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'wikidata', datetime('now'))
        ON CONFLICT(wikidata_qid) DO UPDATE SET
            name_de = excluded.name_de,
            name_kurz = COALESCE(excluded.name_kurz, hochschule.name_kurz),
            name_en = COALESCE(excluded.name_en, hochschule.name_en),
            website = COALESCE(excluded.website, hochschule.website),
            stadt = COALESCE(excluded.stadt, hochschule.stadt),
            bundesland = COALESCE(excluded.bundesland, hochschule.bundesland),
            latitude = COALESCE(excluded.latitude, hochschule.latitude),
            longitude = COALESCE(excluded.longitude, hochschule.longitude),
            typ = COALESCE(excluded.typ, hochschule.typ),
            gruendungsjahr = COALESCE(excluded.gruendungsjahr, hochschule.gruendungsjahr),
            studenten_anzahl = COALESCE(excluded.studenten_anzahl, hochschule.studenten_anzahl),
            updated_at = datetime('now')
    `);

    let inserted = 0,
        updated = 0,
        skipped = 0;

    // Vorher zählen wer schon da ist
    const existing = new Set(
        db
            .prepare('SELECT wikidata_qid FROM hochschule WHERE wikidata_qid IS NOT NULL')
            .all()
            .map((r) => r.wikidata_qid)
    );

    db.exec('BEGIN');
    for (const e of entries) {
        if (!e.name_de) {
            skipped++;
            continue;
        }
        const { lat, lon } = parseCoord(e.coord);
        const foundedYear = e.founded
            ? parseInt(e.founded.slice(0, 4), 10) || null
            : null;
        const students = e.students ? parseInt(e.students, 10) || null : null;
        const typ = determineTyp(e);

        upsert.run(
            e.name_de,
            e.name_kurz,
            e.name_en,
            e.qid,
            e.website,
            e.stadt,
            e.bundesland,
            lat,
            lon,
            typ,
            foundedYear,
            students
        );
        if (existing.has(e.qid)) updated++;
        else inserted++;
    }
    db.exec('COMMIT');

    db.prepare(
        `UPDATE sync_run SET finished_at=?, status='ok',
         rows_inserted=?, rows_updated=?, rows_skipped=? WHERE id=?`
    ).run(new Date().toISOString(), inserted, updated, skipped, runId);

    console.log(`\nErgebnis: ${inserted} neu, ${updated} aktualisiert, ${skipped} übersprungen`);

    // Kurze Qualitäts-Zusammenfassung
    const total = db.prepare('SELECT COUNT(*) c FROM hochschule').get().c;
    const withCoord = db
        .prepare('SELECT COUNT(*) c FROM hochschule WHERE latitude IS NOT NULL')
        .get().c;
    const byTyp = db
        .prepare('SELECT typ, COUNT(*) c FROM hochschule GROUP BY typ ORDER BY c DESC')
        .all();

    console.log(`\n=== Datenqualität ===`);
    console.log(`Gesamt Hochschulen: ${total}`);
    console.log(`Mit Koordinaten:    ${withCoord} (${((withCoord / total) * 100).toFixed(1)}%)`);
    console.log(`Nach Typ:`);
    for (const r of byTyp) console.log(`  ${r.typ ?? '(null)'}: ${r.c}`);

    db.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
