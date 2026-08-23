import { openDb } from './_db.mjs';
const db = openDb();
const searches = ['%Karlsruh%', '%Darmstadt%', '%Konstanz%', '%Mannheim%', '%Ulm%', '%Bayreuth%'];
for (const s of searches) {
    console.log('\n=== ' + s + ' ===');
    const rows = db.prepare(
        "SELECT id, name_de, wikidata_qid, stadt FROM hochschule WHERE name_de LIKE ? AND typ IN ('Universität','TU') LIMIT 5"
    ).all(s);
    for (const r of rows) console.log('  ', r.wikidata_qid, '|', r.name_de, '[' + r.stadt + ']');
}
db.close();
