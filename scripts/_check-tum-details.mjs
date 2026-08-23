import { openDb } from './_db.mjs';
const db = openDb();
const rows = db.prepare(`
    SELECT sg.id, sg.name_de, sg.abschluss, sg.regelstudienzeit, sg.ects, sg.sprache,
           sg.studiengebuehr_non_eu, z.zulassungsart, z.eignungsverfahren,
           z.deadline_ws, z.deadline_ss, z.bewerbungs_url
    FROM studiengang sg
    LEFT JOIN zulassung z ON z.studiengang_id = sg.id
    WHERE sg.hochschule_id = (SELECT id FROM hochschule WHERE wikidata_qid = 'Q157808')
      AND z.id IS NOT NULL
    LIMIT 10
`).all();
for (const r of rows) {
    console.log('\n---', r.id, r.name_de, '(' + r.abschluss + ')');
    console.log('  RZ:', r.regelstudienzeit, 'ECTS:', r.ects, 'Spr:', r.sprache, 'Geb:', r.studiengebuehr_non_eu);
    console.log('  Zulassung:', r.zulassungsart, 'Eig:', r.eignungsverfahren);
    console.log('  WS-Frist:', r.deadline_ws);
    console.log('  SS-Frist:', r.deadline_ss);
    console.log('  Bewerbung URL:', r.bewerbungs_url?.slice(0, 100));
}
db.close();
