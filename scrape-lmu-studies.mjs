// LMU Studiengangsfinder — direkt mit numRows=999 in URL, dann DOM parsen.

import { chromium } from 'playwright';
import { openDb } from './_db.mjs';

const LMU_QID = 'Q55044';
const RESULTS_URL = 'https://www.lmu.de/de/studium/studienangebot/alle-studienfaecher-und-studiengaenge/?query=&sorting=by_name_asc&language=de&language=en&page=1&numRows=999';

const db = openDb();
const lmu = db.prepare('SELECT id, name_de FROM hochschule WHERE wikidata_qid = ?').get(LMU_QID);
console.log(`Target: [${lmu.id}] ${lmu.name_de}\n`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'de-DE' });
const page = await ctx.newPage();

console.log(`Öffne mit numRows=999...`);
await page.goto(RESULTS_URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);

// Erst Ergebnis-Anzahl auslesen (Header wie "X Studiengänge gefunden")
const headerText = await page.evaluate(() => document.querySelector('main')?.textContent?.slice(0, 500));
console.log('--- header sample ---');
console.log(headerText?.slice(0, 400));

// Alle relevanten Ergebnisse: unter dem Filter-Bereich
// Wahrscheinlich Struktur: div/li mit h3 (Titel) + href
const results = await page.evaluate(() => {
    // Try common list result patterns
    const containers = document.querySelectorAll('article, .searchResult, .result, [class*="ergebnis"], [class*="result"], main ol > li, main ul > li');
    const out = [];
    const seen = new Set();
    for (const el of containers) {
        // Title candidate: h2/h3/h4 or first strong link
        const titleEl = el.querySelector('h2, h3, h4') || el.querySelector('a[href*="/studium/"]');
        if (!titleEl) continue;
        const name = titleEl.textContent?.trim().replace(/\s+/g, ' ');
        if (!name || name.length < 3 || name.length > 250) continue;
        const link = el.querySelector('a[href]');
        const href = link?.href || null;
        // Try to find degree/language indicators in surrounding text
        const fullText = el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 500) || '';
        const key = href || name;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name, href, fullText });
    }
    return out;
});

console.log(`\nRaw Kandidaten: ${results.length}`);

// Filter: nur "Studiengang"-artige Einträge
const NAV_WORDS = /^(startseite|studium|studienangebot|übersicht|kontakt|impressum|home|footer|navigation|beratung|bachelor$|master$|lehramt$|promotion$|zertifikat|magister|lizentiat|studiengang finden|sie sind hier|neustart|zurücksetzen)/i;
const studies = results.filter(r => !NAV_WORDS.test(r.name.trim()) && r.name.length > 5);

console.log(`Nach Filter: ${studies.length}`);
console.log('\nErste 20:');
for (const s of studies.slice(0, 20)) {
    console.log(`  - ${s.name.slice(0, 90)}`);
    if (s.href) console.log(`    → ${s.href.slice(0, 120)}`);
}

if (studies.length < 20) {
    // Fallback: dump 20 raw results für Debug
    console.log('\n!! Zu wenig — hier alle Raws:');
    for (const r of results.slice(0, 30)) {
        console.log(`  [${r.name.slice(0, 60)}]  → ${r.href?.slice(-50) || '(no href)'}`);
    }
    console.log('\nAbbruch, DB nicht geändert.');
    await browser.close();
    db.close();
    process.exit(1);
}

// In DB
// URL-first: der Slug enthält verlässlich "bachelor" / "master" / "promotion" / "lehramt" / "staatsexamen"
function detectAbschluss(text, url) {
    const u = (url || '').toLowerCase();
    if (/-promotion-|\/promotion-/.test(u)) return 'PhD';
    if (/-lehramt-|-lehramt\.|\/lehramt-/.test(u)) return 'Lehramt';
    if (/-bachelor-|\/bachelor-/.test(u)) return 'Bachelor';
    if (/-master-|\/master-/.test(u)) return 'Master';
    if (/-staatsexamen-|-juristische-|-medizin-|-zahnmedizin-|-tiermedizin-|-pharmazie-/.test(u)) return 'Staatsexamen';
    if (/-magister-/.test(u)) return 'Magister';
    if (/-diplom-/.test(u)) return 'Diplom';
    if (/-zertifikat-|-aufbaustudium-|-postgradual/.test(u)) return 'Zertifikat';

    // Fallback über Textinhalt
    const t = (text || '').toLowerCase();
    if (t.includes('promotion')) return 'PhD';
    if (t.includes('lehramt')) return 'Lehramt';
    if (t.includes('staatsexamen') || t.includes('juristische prüfung') || t.includes('medizin') || t.includes('pharmazie')) return 'Staatsexamen';
    if (t.includes('master')) return 'Master';
    if (t.includes('bachelor')) return 'Bachelor';
    if (t.includes('magister')) return 'Magister';
    if (t.includes('diplom')) return 'Diplom';
    return 'Sonstige';
}
function detectSprache(text) {
    if (/englisch|english/i.test(text)) return 'en';
    return 'de';
}

const insert = db.prepare(`
    INSERT INTO studiengang (hochschule_id, name_de, abschluss, url, sprache, beschreibung, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

const deleted = db.prepare('DELETE FROM studiengang WHERE hochschule_id = ?').run(lmu.id);
console.log(`\nAlte LMU-Einträge gelöscht: ${deleted.changes}`);

db.exec('BEGIN');
for (const s of studies) {
    insert.run(
        lmu.id,
        s.name.slice(0, 200),
        detectAbschluss(s.fullText, s.href),
        s.href,
        detectSprache(s.fullText),
        s.fullText.slice(0, 400)
    );
}
db.exec('COMMIT');

const count = db.prepare('SELECT COUNT(*) c FROM studiengang WHERE hochschule_id = ?').get(lmu.id).c;
console.log(`In DB: ${count} LMU-Studiengänge`);

const byAbschluss = db.prepare(`
    SELECT abschluss, COUNT(*) c FROM studiengang WHERE hochschule_id = ? GROUP BY abschluss ORDER BY c DESC
`).all(lmu.id);
console.log('\nNach Abschluss:');
for (const r of byAbschluss) console.log(`  ${r.abschluss.padEnd(15)} ${r.c}`);

await browser.close();
db.close();
console.log('\nFertig.');
