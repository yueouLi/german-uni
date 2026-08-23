// TUM: für jeden studiengang detail-page laden und Anforderungen/Bewerbung extrahieren
// Läuft konkurrent (3 parallel), speichert in studiengang + zulassung Tabellen.

import { chromium } from 'playwright';
import { openDb } from './_db.mjs';

const TUM_QID = 'Q157808';
const CONCURRENCY = 3;
const LIMIT = process.argv.includes('--limit')
    ? parseInt(process.argv[process.argv.indexOf('--limit') + 1], 10)
    : null;

const db = openDb();
const tum = db.prepare('SELECT id FROM hochschule WHERE wikidata_qid = ?').get(TUM_QID);

const ONLY_MISSING = process.argv.includes('--only-missing');
const studies = ONLY_MISSING
    ? db.prepare(`
        SELECT sg.id, sg.name_de, sg.abschluss, sg.url
        FROM studiengang sg LEFT JOIN zulassung z ON z.studiengang_id = sg.id
        WHERE sg.hochschule_id = ? AND sg.url IS NOT NULL AND z.id IS NULL
        ORDER BY sg.id
    `).all(tum.id)
    : db.prepare(`
        SELECT id, name_de, abschluss, url
        FROM studiengang
        WHERE hochschule_id = ? AND url IS NOT NULL
        ORDER BY id
    `).all(tum.id);

const targets = LIMIT ? studies.slice(0, LIMIT) : studies;
console.log(`TUM Studies to enrich: ${targets.length}\n`);

// ------- Parser -------
function parseDetailData(data) {
    const eck = data.eckdaten || '';
    const parsed = {};

    // Regelstudienzeit: "4 Semester (Vollzeit)"
    const rz = eck.match(/Regelstudienzeit\s+(\d+)\s+Semester/i);
    if (rz) parsed.regelstudienzeit = parseInt(rz[1], 10);

    // Credits/ECTS: "120 ECTS"
    const ec = eck.match(/(\d+)\s+ECTS/i);
    if (ec) parsed.ects = parseInt(ec[1], 10);

    // Bewerbungszeitraum — TUM Format hat viele Varianten:
    //   "Wintersemester: 01.02. – 31.05."
    //   "Wintersemester 01.04. bis 31.05."
    //   "Sommersemester 01.10. – 30.11."
    // Wir suchen auch außerhalb Eckdaten — im gesamten Text
    const fullText = (eck || '') + ' ' + (data.bewerbung || '');
    const wsRe = /Wintersemester[:\s]*(\d{1,2}[.\/]\d{1,2}[.\s\-–bis]{1,10}\d{1,2}[.\/]\d{1,2}\.?)/i;
    const ssRe = /Sommersemester[:\s]*(\d{1,2}[.\/]\d{1,2}[.\s\-–bis]{1,10}\d{1,2}[.\/]\d{1,2}\.?)/i;
    const wsM = fullText.match(wsRe);
    const ssM = fullText.match(ssRe);
    parsed.deadline_ws = wsM ? wsM[1].trim() : null;
    parsed.deadline_ss = ssM ? ssM[1].trim() : null;

    // Vollzeit/Teilzeit
    parsed.vollzeit = /Vollzeit/i.test(eck) ? 1 : 0;

    // Sprache aus Unterrichtssprache-Sektion
    const spr = data.unterrichtssprache || '';
    if (/englisch/i.test(spr) && !/deutsch/i.test(spr)) parsed.sprache = 'en';
    else if (/englisch/i.test(spr) && /deutsch/i.test(spr)) parsed.sprache = 'de/en';
    else parsed.sprache = 'de';

    // Studiengebühr Nicht-EU
    const geb = data.gebuehren || '';
    const gebM = geb.match(/(\d{1,3}(?:[.,]\d{3})?|\d{4,5})\s*Euro\s*je\s*Semester/i);
    if (gebM) parsed.studiengebuehr_non_eu = parseInt(gebM[1].replace(/[.,]/g, ''), 10);

    // Eignungsverfahren
    parsed.eignungsverfahren = /Eignungsverfahren/i.test(data.bewerbung || '') ? 1 : 0;

    // Zulassungsart
    if (parsed.eignungsverfahren) parsed.zulassungsart = 'Eignung';
    else if (/zulassungsfrei/i.test(data.bewerbung || '')) parsed.zulassungsart = 'zulassungsfrei';
    else if (/NC|Numerus Clausus/i.test(data.bewerbung || '')) parsed.zulassungsart = 'NC';
    else parsed.zulassungsart = null;

    // Sprachnachweis Details (nur relevanter Absatz)
    const sprDetail = spr.match(/Erforderlicher Sprachnachweis[^]*?(?=Weitere|$)/i);
    parsed.sprachnachweis_details = sprDetail ? sprDetail[0].slice(0, 500).trim() : null;

    // Erforderliche Dokumente
    if (data.dokumente) {
        // Simple: split by common bullet indicators
        const items = data.dokumente
            .split(/(?:•|\n|●| - |; )/)
            .map(s => s.trim())
            .filter(s => s.length > 3 && s.length < 150);
        parsed.erforderliche_dokumente = items.slice(0, 20).join('\n');
    }

    return parsed;
}

// ------- Scraper -------
async function scrapeOne(page, s) {
    try {
        await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(500);

        const data = await page.evaluate(() => {
            const out = {};
            // Section-by-heading extractor
            function getSection(headingRegex) {
                const heads = document.querySelectorAll('h2, h3');
                for (const h of heads) {
                    if (!headingRegex.test((h.textContent || '').trim())) continue;
                    let text = '';
                    let sib = h.nextElementSibling;
                    while (sib && !/^H[123]$/.test(sib.tagName)) {
                        text += ' ' + (sib.textContent || '');
                        if (text.length > 2000) break;
                        sib = sib.nextElementSibling;
                    }
                    return text.replace(/\s+/g, ' ').trim();
                }
                return null;
            }
            out.eckdaten = getSection(/^Eckdaten$/i);
            out.unterrichtssprache = getSection(/Unterrichtssprache/i);
            out.gebuehren = getSection(/Gebühren/i);
            // Try mehrere Bewerbungs-Sektions-Titel
            out.bewerbung = getSection(/^Bewerbung und Zulassung/i)
                         || getSection(/^Bewerbungsablauf/i)
                         || getSection(/^Auswahlprozess/i)
                         || getSection(/Bewerbung/i);
            out.dokumente = getSection(/erforderliche Dokumente/i)
                         || getSection(/Onlinebewerbung erforderlich/i);
            out.profil = getSection(/Studiengangsprofil/i);
            // Auch: gesamter Body-Text als Fallback für Regex
            out.bodyText = document.body?.textContent?.replace(/\s+/g, ' ').slice(0, 8000) || '';
            // Look for direct application link (usually "Onlinebewerbung", "Bewerbung starten")
            const applyBtn = [...document.querySelectorAll('a')]
                .find(a => /onlinebewerb|bewerbung starten|jetzt bewerben/i.test((a.textContent||'').trim()));
            out.bewerbungs_url = applyBtn?.href || null;
            return out;
        });

        return { ok: true, s, data, parsed: parseDetailData(data) };
    } catch (e) {
        return { ok: false, s, error: e.message };
    }
}

// ------- Main -------
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'de-DE' });

const updateSg = db.prepare(`
    UPDATE studiengang
    SET regelstudienzeit=?, ects=?, sprache=?, vollzeit=?,
        studiengebuehr_non_eu=?, updated_at=datetime('now')
    WHERE id=?
`);

// Erst prüfen ob zulassung schon existiert, dann upsert
const zulassungExists = db.prepare('SELECT id FROM zulassung WHERE studiengang_id = ?');
const zulassungInsert = db.prepare(`
    INSERT INTO zulassung (studiengang_id, zulassungsart, deadline_ws, deadline_ss,
                           eignungsverfahren, sprachnachweis_details, erforderliche_dokumente,
                           bewerbungs_url, quelle_url, verifiziert_am)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);
const zulassungUpdate = db.prepare(`
    UPDATE zulassung SET zulassungsart=?, deadline_ws=?, deadline_ss=?,
                         eignungsverfahren=?, sprachnachweis_details=?,
                         erforderliche_dokumente=?, bewerbungs_url=?,
                         quelle_url=?, verifiziert_am=datetime('now')
    WHERE studiengang_id=?
`);

let done = 0, ok = 0, err = 0;
const errors = [];

// Worker Pool
async function worker(pageIndex) {
    const page = await ctx.newPage();
    while (true) {
        const s = targets.shift();
        if (!s) break;
        const r = await scrapeOne(page, s);
        done++;
        if (!r.ok) {
            err++;
            errors.push(`[${s.id}] ${s.name_de}: ${r.error}`);
            process.stdout.write(`.[${done}/${targets.length + done}] ✗ ${s.name_de.slice(0, 40)}\n`);
            continue;
        }
        ok++;
        const p = r.parsed;

        // Update studiengang
        updateSg.run(
            p.regelstudienzeit ?? null,
            p.ects ?? null,
            p.sprache ?? null,
            p.vollzeit ?? null,
            p.studiengebuehr_non_eu ?? null,
            s.id
        );

        // Zulassung upsert
        const existing = zulassungExists.get(s.id);
        const args = [
            p.zulassungsart ?? null,
            p.deadline_ws ?? null,
            p.deadline_ss ?? null,
            p.eignungsverfahren ?? 0,
            p.sprachnachweis_details ?? null,
            p.erforderliche_dokumente ?? null,
            r.data.bewerbungs_url ?? null,
            s.url,
        ];
        if (existing) zulassungUpdate.run(...args, s.id);
        else zulassungInsert.run(s.id, ...args);

        if (done % 10 === 0) console.log(`[${done}] ${s.name_de.slice(0, 50)} — RZ=${p.regelstudienzeit}, ECTS=${p.ects}, Spr=${p.sprache}, Geb=${p.studiengebuehr_non_eu || 0}`);
    }
    await page.close();
}

const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
await Promise.all(workers);

console.log(`\n=== Ergebnis ===`);
console.log(`OK: ${ok}   Fehler: ${err}`);
if (errors.length) {
    console.log('Erste 5 Fehler:');
    for (const e of errors.slice(0, 5)) console.log('  ', e);
}

// Zusammenfassung
const stats = db.prepare(`
    SELECT
        COUNT(*) AS total,
        COUNT(regelstudienzeit) AS with_rz,
        COUNT(ects) AS with_ects,
        COUNT(studiengebuehr_non_eu) AS with_fee,
        SUM(CASE WHEN sprache='en' THEN 1 ELSE 0 END) AS eng,
        SUM(CASE WHEN sprache='de' THEN 1 ELSE 0 END) AS deu
    FROM studiengang WHERE hochschule_id = ?
`).get(tum.id);
console.log(`\nTUM Datenqualität:`);
console.log(`  Total:         ${stats.total}`);
console.log(`  mit RZ:        ${stats.with_rz}`);
console.log(`  mit ECTS:      ${stats.with_ects}`);
console.log(`  mit Fee:       ${stats.with_fee}`);
console.log(`  Englisch:      ${stats.eng}`);
console.log(`  Deutsch:       ${stats.deu}`);

const zulStats = db.prepare(`
    SELECT COUNT(*) c, SUM(eignungsverfahren) eig FROM zulassung z
    JOIN studiengang sg ON sg.id = z.studiengang_id
    WHERE sg.hochschule_id = ?
`).get(tum.id);
console.log(`  Zulassung-Einträge: ${zulStats.c}`);
console.log(`  Eignungsverfahren:  ${zulStats.eig}`);

await browser.close();
db.close();
