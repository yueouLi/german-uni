// TUM: alle Studiengänge über die eingebettete studyfinder-Liste holen
// Kein Filter-Klick nötig — Autocomplete-UL enthält alle Courses beim initialen Load

import { chromium } from 'playwright';
import { openDb } from './_db.mjs';

const TUM_QID = 'Q157808';
const URL = 'https://www.tum.de/studium/studienangebot';

const db = openDb();
const tum = db.prepare('SELECT id, name_de FROM hochschule WHERE wikidata_qid = ?').get(TUM_QID);
if (!tum) { console.error('TUM nicht in DB'); process.exit(1); }
console.log(`Target: [${tum.id}] ${tum.name_de}\n`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'de-DE' });
const page = await ctx.newPage();

console.log(`Öffne ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2000);

// Extract all courses from the embedded autocomplete list
const courses = await page.evaluate(() => {
    const items = document.querySelectorAll('li[data-course="true"] a');
    return [...items].map(a => ({
        text: (a.textContent || '').trim(),
        href: a.href,
    }));
});

console.log(`Gefunden: ${courses.length} Studiengänge (roh)`);

// Parse "Fachname - Abschlusstyp (kürzel)"
// Manche haben keinen " - Abschluss" Suffix (z.B. "AI in Society")
function parseCourse(text, url) {
    // Regex: everything before " - <Abschluss>"
    const m = text.match(/^(.+?)\s+-\s+(Bachelor of Science.*|Master of Science.*|Bachelor of Arts.*|Master of Arts.*|Bachelor of Education.*|Master of Education.*|Master of Engineering.*|Bachelor of Engineering.*|Doctor.*|Staatsexamen.*|Diplom.*)$/i);
    let name, abschlussRaw;
    if (m) {
        name = m[1].trim();
        abschlussRaw = m[2].toLowerCase();
    } else {
        name = text.trim();
        abschlussRaw = url.toLowerCase();
    }
    // B.Ed. und M.Ed. tragen denselben Namen und dieselbe abschluss-Kategorie,
    // aber unterschiedliche Fristen und Zulassungsart. Ohne stufe/variante
    // verschmelzen sie im Viewer zu einer Karte mit widersprüchlichen Daten.
    let abschluss = 'Sonstige', stufe = null, variante = null;
    if (/master.*education|-med($|\W)/i.test(abschlussRaw)) {
        abschluss = 'Lehramt'; stufe = 'Master'; variante = 'M.Ed.';
    } else if (/bachelor.*education|-bed($|\W)/i.test(abschlussRaw)) {
        abschluss = 'Lehramt'; stufe = 'Bachelor'; variante = 'B.Ed.';
    } else if (/master|m\.sc|m\.a|m\.eng/i.test(abschlussRaw)) {
        abschluss = 'Master'; stufe = 'Master';
    } else if (/bachelor|b\.sc|b\.a|b\.eng/i.test(abschlussRaw)) {
        abschluss = 'Bachelor'; stufe = 'Bachelor';
    } else if (/promotion|doctor/i.test(abschlussRaw)) {
        abschluss = 'PhD'; stufe = 'PhD';
    } else if (/staatsexamen/i.test(abschlussRaw)) {
        abschluss = 'Staatsexamen'; stufe = 'Staatsexamen';
    } else if (/diplom/i.test(abschlussRaw)) {
        abschluss = 'Diplom'; stufe = 'Diplom';
    }

    // Campus steht im Namen, nicht im Abschluss-Suffix: "(am Campus Heilbronn)"
    const campus = /\((?:am\s+)?(?:Campus|Hauptstandort:?)\s+([^)]+)\)/i.exec(name);
    if (campus) {
        const c = `Campus ${campus[1].trim()}`;
        variante = variante ? `${variante} · ${c}` : c;
    }

    return { name, abschluss, stufe, variante };
}

// Sprache aus URL / Name: englisch wenn viel Englisch drin
function detectSprache(text) {
    if (/master of arts|bachelor of arts/i.test(text)) {
        // Kann de oder en sein — schwer aus Titel
    }
    if (/\b(and|for|in|of|the|studies|science|engineering)\b/i.test(text) &&
        !/\b(und|der|die|das|für|mit)\b/i.test(text)) {
        return 'en';
    }
    return 'de';
}

// Insert
const insert = db.prepare(`
    INSERT INTO studiengang (hochschule_id, name_de, abschluss, stufe, variante, url, sprache, beschreibung, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

const deleted = db.prepare('DELETE FROM studiengang WHERE hochschule_id = ?').run(tum.id);
console.log(`Alte TUM-Einträge gelöscht: ${deleted.changes}`);

let inserted = 0;
db.exec('BEGIN');
for (const c of courses) {
    const { name, abschluss, stufe, variante } = parseCourse(c.text, c.href);
    const sprache = detectSprache(c.text);
    insert.run(tum.id, name.slice(0, 200), abschluss, stufe, variante, c.href, sprache, c.text.slice(0, 400));
    inserted++;
}
db.exec('COMMIT');

console.log(`Inserted: ${inserted}`);

const byAbschluss = db.prepare(`
    SELECT abschluss, COUNT(*) c FROM studiengang WHERE hochschule_id = ? GROUP BY abschluss ORDER BY c DESC
`).all(tum.id);
console.log('\nNach Abschluss:');
for (const r of byAbschluss) console.log(`  ${r.abschluss.padEnd(15)} ${r.c}`);

// Stichprobe
console.log('\nStichprobe:');
const sample = db.prepare(`
    SELECT name_de, abschluss FROM studiengang WHERE hochschule_id = ? ORDER BY RANDOM() LIMIT 10
`).all(tum.id);
for (const r of sample) console.log(`  [${r.abschluss.padEnd(10)}] ${r.name_de}`);

await browser.close();
db.close();
console.log('\nFertig.');
