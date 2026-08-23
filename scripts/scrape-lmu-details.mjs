// LMU-Detailseiten: scrape-lmu-studies.mjs holt nur Namen und Links, deshalb
// standen bei allen 651 LMU-Studiengängen Regelstudienzeit, ECTS, Sprache und
// Zulassungsmodus leer. Die Detailseiten führen genau diese Angaben als
// dt/dd-Paare — sauber strukturiert und über alle Abschlussarten hinweg gleich.
//
// Was hier NICHT geht: Bewerbungsfristen. Die LMU nennt sie nicht pro
// Studiengang, sondern nur zentral auf der Immatrikulationsseite. Ein aus dem
// Eignungsverfahren-Text gefischtes Datum wäre geraten — deshalb bleibt das
// Fristfeld leer und der Zulassungsmodus wird stattdessen gefüllt. Der ist für
// die Zielgruppe sogar die wichtigere Information: er entscheidet, ob überhaupt
// ein Auswahlverfahren zu bestehen ist.
//
// Aktualisiert nur bestehende Zeilen (UPDATE), löscht nichts. Ein Abbruch
// mittendrin lässt also einen konsistenten, nur teilweise ergänzten Stand zurück.
//
// Aufruf:
//   node scripts/scrape-lmu-details.mjs             # alle
//   node scripts/scrape-lmu-details.mjs --limit 20  # Testlauf

import { chromium } from 'playwright';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from './_db.mjs';

function findChromium() {
    const root = join(process.env.LOCALAPPDATA || '', 'ms-playwright');
    if (!existsSync(root)) return undefined;
    const builds = readdirSync(root)
        .filter(d => /^chromium(_headless_shell)?-\d+$/.test(d))
        .sort((a, b) => parseInt(b.split('-')[1], 10) - parseInt(a.split('-')[1], 10));
    for (const b of builds) {
        for (const rel of ['chrome-headless-shell-win64/chrome-headless-shell.exe',
                           'chrome-win/chrome.exe']) {
            const p = join(root, b, rel);
            if (existsSync(p)) return p;
        }
    }
    return undefined;
}

const CONCURRENCY = 4;
const THROTTLE_MS = 250;
const argv = process.argv;
const LIMIT = argv.includes('--limit') ? parseInt(argv[argv.indexOf('--limit') + 1], 10) : null;

// LMU-Zulassungsmodus → unsere zulassungsart-Werte.
// "Freie Studiengänge" heißt: keine Auswahl, Einschreibung genügt.
const ZUL_MAP = [
    // "Kein Studienbeginn möglich" ist kein Zulassungsmodus, sondern die Aussage,
    // dass es überhaupt keinen Einstieg gibt. Deshalb kein zulassungsart-Wert.
    [/Kein Studienbeginn möglich/i,
     { art: null, hinweis: 'Laut LMU ist derzeit kein Studienbeginn im 1. Semester möglich.' }],
    [/Eignungsverfahren|Eignungsfeststellung|Eignungsprüfung/i, { art: 'Eignung', eignung: 1 }],
    [/Bundesweite Zulassungsbeschränkung/i, { art: 'NC' }],
    [/Örtliche Zulassungsbeschränkung|Örtliches Auswahlverfahren/i, { art: 'NC' }],
    // Orientierungstest und Voranmeldung sind keine Auswahl — man kann aber ohne
    // sie nicht einschreiben. Also zulassungsfrei plus Hinweis auf den Pflichtschritt.
    [/Studienorientierungsverfahren/i,
     { art: 'zulassungsfrei', hinweis: 'Studienorientierungsverfahren (Online-Test) ist Pflicht — keine Auswahl, aber ohne Nachweis keine Einschreibung.' }],
    [/Voranmeldeverfahren/i,
     { art: 'zulassungsfrei', hinweis: 'Voranmeldung erforderlich — Termin auf der LMU-Fachseite prüfen.' }],
    [/Freie Studiengänge|zulassungsfrei|keine Zulassungsbeschränkung/i, { art: 'zulassungsfrei' }],
];

function parseZulassung(s) {
    if (!s) return null;
    for (const [re, val] of ZUL_MAP) if (re.test(s)) return val;
    // Unbekannter Modus: Rohtext mitgeben, damit nichts verloren geht.
    return { art: 'Sonstige', hinweis: `Zulassungsmodus laut LMU: ${s}` };
}

// "6 Fachsemester" → 6
function parseSemester(s) {
    const m = /(\d+)\s*Fachsemester/i.exec(s || '');
    return m ? parseInt(m[1], 10) : null;
}

function parseEcts(s) {
    const m = /(\d+)/.exec(s || '');
    if (!m) return null;
    const n = parseInt(m[1], 10);
    // Ein Erweiterungsfach hat 45 ECTS, ein Vollstudium 120-300. Alles über 400
    // ist kein ECTS-Wert, sondern ein verrutschter Text.
    return n >= 5 && n <= 400 ? n : null;
}

// "nur im Wintersemester" / "im Winter- und Sommersemester"
function parseStart(s) {
    const t = s || '';
    const winter = /Winter/i.test(t);
    const sommer = /Sommer/i.test(t);
    return { ws: winter ? 1 : 0, ss: sommer ? 1 : 0 };
}

function parseSprache(s) {
    const t = s || '';
    const de = /Deutsch/i.test(t);
    const en = /Englisch/i.test(t);
    if (de && en) return 'de/en';
    if (en) return 'en';
    if (de) return 'de';
    return null;
}

const db = openDb();
const lmu = db.prepare("SELECT id, name_de FROM hochschule WHERE name_de = 'Ludwig-Maximilians-Universität München'").get();
if (!lmu) { console.error('LMU nicht in der DB gefunden.'); process.exit(1); }

const all = db.prepare(`
    SELECT id, name_de, abschluss, url FROM studiengang
    WHERE hochschule_id = ? AND url LIKE 'http%'
    ORDER BY name_de
`).all(lmu.id);
const targets = LIMIT ? all.slice(0, LIMIT) : all;
console.log(`LMU [${lmu.id}]: ${all.length} Studiengänge mit URL, ${targets.length} werden geladen.\n`);

const browser = await chromium.launch({ headless: true, executablePath: findChromium() });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'de-DE' });

const results = new Map();
const pages = [];
for (let i = 0; i < CONCURRENCY; i++) pages.push(await ctx.newPage());

let done = 0, failed = 0, noFields = 0;
const queue = [...targets];
await Promise.all(pages.map(async (pg) => {
    while (queue.length) {
        const sg = queue.shift();
        try {
            await pg.goto(sg.url, { waitUntil: 'load', timeout: 45000 });
            await pg.waitForFunction(() => document.querySelectorAll('dl dt').length > 0,
                null, { timeout: 15000 }).catch(() => {});
            const kv = await pg.evaluate(() => {
                const o = {};
                for (const dl of document.querySelectorAll('dl')) {
                    const dts = [...dl.querySelectorAll('dt')];
                    const dds = [...dl.querySelectorAll('dd')];
                    dts.forEach((dt, i) => {
                        const k = dt.textContent.trim().replace(/\s+/g, ' ');
                        if (!o[k] && dds[i]) o[k] = dds[i].textContent.trim().replace(/\s+/g, ' ');
                    });
                }
                return o;
            });
            if (!Object.keys(kv).length) noFields++;
            else results.set(sg.id, kv);
        } catch (e) {
            failed++;
        }
        done++;
        if (done % 50 === 0) console.log(`  ${done}/${targets.length} (Fehler: ${failed}, ohne Felder: ${noFields})`);
        await pg.waitForTimeout(THROTTLE_MS);
    }
}));
console.log(`\nGeladen: ${results.size}, fehlgeschlagen: ${failed}, ohne dt/dd: ${noFields}\n`);
await browser.close();

// Die dt-Überschriften schwanken leicht ("Zulassungsmodus 1. Semester" vs.
// "... 1. und höheres Semester"), deshalb wird über Teilstrings gesucht.
function pick(kv, ...needles) {
    for (const n of needles) {
        for (const k of Object.keys(kv)) {
            if (k.toLowerCase().includes(n.toLowerCase())) return kv[k];
        }
    }
    return null;
}

// ---- In die DB: nur UPDATE, nichts löschen ----
const updSg = db.prepare(`
    UPDATE studiengang SET
        regelstudienzeit = COALESCE(?, regelstudienzeit),
        ects = COALESCE(?, ects),
        sprache = COALESCE(?, sprache),
        start_ws = ?, start_ss = ?,
        fachbereich = COALESCE(?, fachbereich),
        fachrichtung = COALESCE(?, fachrichtung),
        updated_at = datetime('now')
    WHERE id = ?
`);

// LMU hat heute 0 zulassung-Zeilen, also anlegen statt aktualisieren. Falls
// doch eine existiert, wird sie ergänzt — nie überschrieben.
const selZul = db.prepare('SELECT id, zulassungsart FROM zulassung WHERE studiengang_id = ?');
const insZul = db.prepare(`
    INSERT INTO zulassung (studiengang_id, zulassungsart, eignungsverfahren, hinweise, quelle_url,
                           verifiziert_am, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, date('now'), datetime('now'), datetime('now'))
`);
const updZul = db.prepare(`
    UPDATE zulassung SET
        zulassungsart = COALESCE(zulassungsart, ?),
        eignungsverfahren = MAX(eignungsverfahren, ?),
        hinweise = COALESCE(hinweise, ?),
        quelle_url = COALESCE(quelle_url, ?),
        verifiziert_am = date('now'),
        updated_at = datetime('now')
    WHERE id = ?
`);

const stat = { rsz: 0, ects: 0, sprache: 0, start: 0, zul: 0, fach: 0, zulNeu: 0 };
const byUrl = new Map(targets.map(t => [t.id, t]));

db.exec('BEGIN');
try {
    for (const [id, kv] of results) {
        const rsz = parseSemester(pick(kv, 'Regelstudienzeit'));
        const ects = parseEcts(pick(kv, 'ECTS'));
        const sprache = parseSprache(pick(kv, 'Studiensprache', 'Sprache'));
        const start = parseStart(pick(kv, 'Studienbeginn'));
        const gruppe = pick(kv, 'Fächergruppe');
        const fak = pick(kv, 'Fakultät');
        const zul = parseZulassung(pick(kv, 'Zulassungsmodus'));

        // Kein einziges Startsemester erkannt? Dann den Bestand nicht platt machen.
        const keepStart = !start.ws && !start.ss;
        const cur = db.prepare('SELECT start_ws, start_ss FROM studiengang WHERE id = ?').get(id);
        updSg.run(rsz, ects, sprache,
                  keepStart ? cur.start_ws : start.ws,
                  keepStart ? cur.start_ss : start.ss,
                  gruppe, fak, id);

        if (rsz) stat.rsz++;
        if (ects) stat.ects++;
        if (sprache) stat.sprache++;
        if (!keepStart) stat.start++;
        if (gruppe || fak) stat.fach++;

        if (zul && (zul.art || zul.hinweis)) {
            const eig = zul.eignung ? 1 : 0;
            const hin = zul.hinweis ?? null;
            const row = selZul.get(id);
            if (row) updZul.run(zul.art, eig, hin, byUrl.get(id).url, row.id);
            else { insZul.run(id, zul.art, eig, hin, byUrl.get(id).url); stat.zulNeu++; }
            if (zul.art) stat.zul++;
        }
    }
    db.exec('COMMIT');
} catch (e) {
    db.exec('ROLLBACK');
    console.error('Abbruch, nichts geschrieben:', e.message);
    process.exit(1);
}

const n = results.size;
const pct = v => `${v}/${n} (${n ? Math.round(v / n * 100) : 0}%)`;
console.log('Geschrieben:');
console.log(`  Regelstudienzeit  ${pct(stat.rsz)}`);
console.log(`  ECTS              ${pct(stat.ects)}`);
console.log(`  Sprache           ${pct(stat.sprache)}`);
console.log(`  Startsemester     ${pct(stat.start)}`);
console.log(`  Fachbereich/-rtg. ${pct(stat.fach)}`);
console.log(`  Zulassungsmodus   ${pct(stat.zul)}  (davon ${stat.zulNeu} neue zulassung-Zeilen)`);

const verteilung = db.prepare(`
    SELECT z.zulassungsart, COUNT(*) n FROM zulassung z
    JOIN studiengang s ON s.id = z.studiengang_id
    WHERE s.hochschule_id = ? GROUP BY 1 ORDER BY 2 DESC
`).all(lmu.id);
console.log('\nZulassungsmodus LMU gesamt:');
for (const r of verteilung) console.log(`  ${r.zulassungsart ?? '(leer)'}: ${r.n}`);

db.close();
