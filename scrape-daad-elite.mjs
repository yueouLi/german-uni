// DAAD "International Programmes": eine JSON-API liefert alle Programme aller
// deutschen Hochschulen auf einmal. Damit sind 130 Hochschulen mit einem
// Scraper abgedeckt, statt 130 Einzelimplementierungen zu pflegen.
// Welche Unis dazugehören, steht in ACADEMY_TO_DB — nur diese werden angefasst.
//
// Grenze der Quelle: DAAD listet nur international vermarktete Programme.
// Für TUM sind das 76 statt der 183, die scrape-tum-studies.mjs findet, für LMU
// 47 statt 651. Deshalb werden TUM und LMU hier bewusst NICHT angefasst —
// die eigenen Scraper sind dort die bessere Quelle.
//
// Zweistufig, weil die API die Fristen nur als Freitext führt
// ("Register by 1 September 2026 + 3 more"). Die Aufschlüsselung nach
// Semester UND nach EU/non-EU steht nur im HTML der Detailseite — und genau
// die non-EU-Frist ist die, die für chinesische Bewerber gilt.
//
// Aufruf:
//   node scripts/scrape-daad-elite.mjs              # alles
//   node scripts/scrape-daad-elite.mjs --limit 20   # nur 20 Details (Testlauf)
//   node scripts/scrape-daad-elite.mjs --no-details # nur Liste, keine Details

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

const API = 'https://www2.daad.de/deutschland/studienangebote/international-programmes/api/solr/en/search.json?q=&limit=3000';
const BASE = 'https://www2.daad.de';
const CONCURRENCY = 3;
const THROTTLE_MS = 400;

const argv = process.argv;
const LIMIT = argv.includes('--limit') ? parseInt(argv[argv.indexOf('--limit') + 1], 10) : null;
const NO_DETAILS = argv.includes('--no-details');

// DAAD-Anzeigename → Name in unserer hochschule-Tabelle.
// Fest verdrahtet statt Fuzzy-Match: "University of Hamburg" und "Hamburg
// University of Technology" sind verschiedene Hochschulen, ein LIKE '%Hamburg%'
// würde Programme der falschen Uni zuordnen.
const ACADEMY_TO_DB = {
    'Heidelberg University': 'Ruprecht-Karls-Universität Heidelberg',
    'Freie Universität Berlin': 'Freie Universität Berlin',
    'RWTH Aachen University': 'RWTH Aachen',
    'Karlsruhe Institute of Technology': 'Karlsruher Institut für Technologie',
    'Humboldt-Universität zu Berlin': 'Humboldt-Universität zu Berlin',
    'Technische Universität Berlin': 'Technische Universität Berlin',
    'University of Hamburg': 'Universität Hamburg',
    'University of Tübingen': 'Eberhard Karls Universität Tübingen',
    'University of Bonn': 'Rheinische Friedrich-Wilhelms-Universität Bonn',
    'Dresden University of Technology': 'Technische Universität Dresden',
    'University of Stuttgart': 'Universität Stuttgart',
    'Technical University of Darmstadt': 'Technische Universität Darmstadt',
    'Leibniz University Hannover': 'Leibniz Universität Hannover',
    'University of Konstanz': 'Universität Konstanz',
    'Technische Universität Braunschweig': 'Technische Universität Braunschweig',

    // Zweite Welle: U15-Verbund und weitere gerankte Volluniversitäten.
    // Weiter unten im QS-Ranking, aber für die Zielgruppe oft die realistischere
    // Bewerbung als RWTH oder TUM — und alle gebührenfrei bzw. sehr günstig.
    'University of Freiburg': 'Albert-Ludwigs-Universität Freiburg',
    'University of Göttingen': 'Georg-August-Universität Göttingen',
    'FAU Erlangen-Nürnberg': 'Friedrich-Alexander-Universität Erlangen-Nürnberg',
    'University of Cologne': 'Universität zu Köln',
    'University of Münster': 'Universität Münster',
    'Goethe University Frankfurt': 'Goethe-Universität Frankfurt am Main',
    'Leipzig University': 'Universität Leipzig',
    'Heinrich Heine University Düsseldorf': 'Heinrich-Heine-Universität Düsseldorf',
    'Julius-Maximilians-Universität Würzburg': 'Julius-Maximilians-Universität Würzburg',
    'University of Mannheim': 'Universität Mannheim',
    'Ruhr-Universität Bochum': 'Ruhr-Universität Bochum',
    'Johannes Gutenberg University Mainz': 'Johannes Gutenberg-Universität Mainz',
    'Friedrich Schiller University Jena': 'Friedrich-Schiller-Universität Jena',
    'University of Bremen': 'Universität Bremen',
    'University of Duisburg-Essen': 'Universität Duisburg-Essen',
    'Bielefeld University': 'Universität Bielefeld',

    // Welle 3: alle weiteren Hochschulen, deren DAAD-Name sich eindeutig auf
    // genau einen DB-Eintrag normalisieren liess (Umlaute, "University of"-
    // Varianten, Kurznamen). Jeder Treffer wurde gegen die DAAD-Stadt geprüft;
    // 0 Namen zeigten auf zwei Hochschulen. Enthält Universitäten, FHs und vier
    // private Hochschulen — die FHs sind bewusst dabei: niedrigere Hürden,
    // berufsnahe Fächer, oft ohne Studiengebühren.
    "University of Potsdam": "Universität Potsdam",
    "Hochschule Fresenius - University of Applied Sciences": "Hochschule Fresenius",
    "Technische Hochschule Ingolstadt": "Technische Hochschule Ingolstadt",
    "Leuphana University Lüneburg": "Leuphana Universität Lüneburg",
    "University of Bayreuth": "Universität Bayreuth",
    "Saarland University": "Universität des Saarlandes",
    "Deggendorf Institute of Technology": "Technische Hochschule Deggendorf",
    "Otto von Guericke University Magdeburg": "Otto-von-Guericke-Universität Magdeburg",
    "Heilbronn University of Applied Sciences": "Hochschule Heilbronn",
    "Brandenburg University of Technology Cottbus-Senftenberg": "Brandenburgische Technische Universität",
    "Justus Liebig University Giessen": "Justus-Liebig-Universität Gießen",
    "Rhine-Waal University of Applied Sciences": "Hochschule Rhein-Waal",
    "University of Regensburg": "Universität Regensburg",
    "University of Passau": "Universität Passau",
    "University of Kassel": "Universität Kassel",
    "University of Hohenheim": "Universität Hohenheim",
    "Kiel University": "Christian-Albrechts-Universität zu Kiel",
    "Ulm University": "Universität Ulm",
    "Fulda University of Applied Sciences": "Hochschule Fulda",
    "Bauhaus-Universität Weimar": "Bauhaus-Universität Weimar",
    "Chemnitz University of Technology": "Technische Universität Chemnitz",
    "Technische Universität Ilmenau": "Technische Universität Ilmenau",
    "Frankfurt School of Finance & Management": "Frankfurt School of Finance & Management",
    "European University Viadrina": "Europa-Universität Viadrina",
    "Hamburg University of Technology": "Technische Universität Hamburg",
    "University of Siegen": "Universität Siegen",
    "Bremen University of Applied Sciences": "Hochschule Bremen",
    "University of Oldenburg": "Carl von Ossietzky Universität Oldenburg",
    "Trier University": "Universität Trier",
    "University of Augsburg": "Universität Augsburg",
    "University of Bamberg": "Otto-Friedrich-Universität Bamberg",
    "Catholic University of Eichstätt-Ingolstadt": "Katholische Universität Eichstätt-Ingolstadt",
    "Osnabrück University of Applied Sciences": "Hochschule Osnabrück",
    "Technical University of Applied Sciences Wildau": "Technische Hochschule Wildau",
    "Osnabrück University": "Universität Osnabrück",
    "Furtwangen University": "Hochschule Furtwangen",
    "Hochschule Bonn-Rhein-Sieg": "Hochschule Bonn-Rhein-Sieg",
    "Europa-Universität Flensburg": "Europa-Universität Flensburg",
    "EBS Universität für Wirtschaft und Recht": "EBS Universität für Wirtschaft und Recht",
    "Hannover Medical School": "Medizinische Hochschule Hannover",
    "Ansbach University of Applied Sciences": "Hochschule für angewandte Wissenschaften Ansbach",
    "Darmstadt University of Applied Sciences": "Hochschule Darmstadt",
    "Hamburg University of Applied Sciences": "Hochschule für Angewandte Wissenschaften Hamburg",
    "Martin Luther University Halle-Wittenberg": "Martin-Luther-Universität Halle-Wittenberg",
    "Dresden International University": "Dresden International University",
    "WHU - Otto Beisheim School of Management": "WHU – Otto Beisheim School of Management",
    "Eberswalde University for Sustainable Development": "Hochschule für nachhaltige Entwicklung Eberswalde",
    "Dortmund University of Applied Sciences and Arts": "Fachhochschule Dortmund",
    "RheinMain University of Applied Sciences": "Hochschule RheinMain",
    "Albstadt-Sigmaringen University": "Hochschule Albstadt-Sigmaringen",
    "University of Greifswald": "Universität Greifswald",
    "Technische Hochschule Mannheim": "Technische Hochschule Mannheim",
    "University of Education Freiburg": "Pädagogische Hochschule Freiburg",
    "University of Koblenz": "Universität Koblenz",
    "Technische Hochschule Lübeck": "Technische Hochschule Lübeck",
    "Mainz University of Applied Sciences": "Hochschule Mainz",
    "University of Hildesheim": "Stiftungsuniversität Hildesheim",
    "Hertie School": "Hertie School",
    "Frankfurt University of Applied Sciences": "Frankfurt University of Applied Sciences",
    "Hochschule Wismar - University of Applied Sciences, Technology, Business and Design": "Hochschule Wismar",
    "South Westphalia University of Applied Sciences": "Fachhochschule Südwestfalen",
    "University of Rostock": "Universität Rostock",
    "Nordhausen University of Applied Sciences": "Hochschule Nordhausen",
    "Kempten University of Applied Sciences": "Hochschule für angewandte Wissenschaften Kempten",
    "Reutlingen University": "Hochschule Reutlingen",
    "Aschaffenburg University of Applied Sciences": "Technische Hochschule Aschaffenburg",
    "Esslingen University of Applied Sciences": "Hochschule Esslingen",
    "Ulm University of Applied Sciences": "Technische Hochschule Ulm",
    "University of Wuppertal": "Bergische Universität Wuppertal",
    "Karlsruhe University of Applied Sciences": "Hochschule Karlsruhe",
    "Hamm-Lippstadt University of Applied Sciences": "Hochschule Hamm-Lippstadt",
    "Magdeburg-Stendal University of Applied Sciences": "Fachhochschule Magdeburg-Stendal",
    "International Psychoanalytic University Berlin": "International Psychoanalytic University Berlin",
    "Bochum University of Applied Sciences": "Hochschule für Technik, Wirtschaft und Gesundheit Bochum",
    "University of Erfurt": "Universität Erfurt",
    "Friedensau Adventist University": "Theologische Hochschule Friedensau",
    "Hochschule Geisenheim University": "Hochschule Geisenheim",
    "University of Technology Nuremberg": "Technische Universität Nürnberg",
    "University of Applied Sciences Jena": "Ernst-Abbe-Hochschule Jena",
    "Bucerius Law School": "Bucerius Law School",
    "Baden-Wuerttemberg Cooperative State University": "Duale Hochschule Baden-Württemberg",
    "Merseburg University of Applied Sciences": "Hochschule Merseburg",
    "Neubrandenburg University of Applied Sciences": "Hochschule Neubrandenburg",
    "University of Applied Sciences Potsdam": "Fachhochschule Potsdam",
    "Witten/Herdecke University": "Universität Witten/Herdecke",
    "University of Vechta": "Universität Vechta",
    "University of Applied Sciences Erfurt": "Fachhochschule Erfurt",
    "Universität zu Lübeck": "Universität zu Lübeck",
    "Internationale Hochschule Liebenzell": "Internationale Hochschule Liebenzell",
    "Folkwang University of the Arts": "Folkwang Universität der Künste",
    "University of Education Schwäbisch Gmünd": "Pädagogische Hochschule Schwäbisch Gmünd",
    "University of Applied Sciences Koblenz": "Hochschule Koblenz",
    "Zeppelin University": "Zeppelin Universität",
    "Berliner Hochschule für Technik": "Berliner Hochschule für Technik",
    "University of Veterinary Medicine Hannover": "Tierärztliche Hochschule Hannover",
    "HafenCity University Hamburg": "HafenCity Universität Hamburg",
    "DHBW Mosbach": "Duale Hochschule Baden-Württemberg Mosbach",
    "Harz University of Applied Sciences": "Hochschule Harz",
    "Flensburg University of Applied Sciences": "Hochschule Flensburg",
};

// courseType: 1=Bachelor, 2=Master, 3=PhD. 4-7 und 56 sind Sprach-/Sommer-/
// Vorbereitungskurse — keine Studiengänge, gehören nicht in die Tabelle.
const COURSE_TYPE = { 1: 'Bachelor', 2: 'Master', 3: 'PhD' };

const MONTHS = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
    august: 8, september: 9, october: 10, november: 11, december: 12,
};

const db = openDb();

// ---- Uni-Namen auflösen und hart scheitern, wenn einer fehlt ----
const findUni = db.prepare('SELECT id, name_de FROM hochschule WHERE name_de = ?');
const uniIdByAcademy = new Map();
const missing = [];
for (const [academy, dbName] of Object.entries(ACADEMY_TO_DB)) {
    const row = findUni.get(dbName);
    if (row) uniIdByAcademy.set(academy, row.id);
    else missing.push(`${academy} → "${dbName}"`);
}
if (missing.length) {
    console.error('Diese Hochschulen stehen nicht unter dem erwarteten Namen in der DB:');
    for (const m of missing) console.error('  ' + m);
    process.exit(1);
}
console.log(`${uniIdByAcademy.size} Ziel-Hochschulen aufgelöst.\n`);

// ---- Parser ----

// "4 semesters" → 4. "4 semesters, 8 semesters" → 4 (die kürzere Variante).
function parseDuration(s) {
    if (!s) return null;
    const m = /(\d+)\s*semester/i.exec(s);
    return m ? parseInt(m[1], 10) : null;
}

// "No tuition fees" → 0. "6,000" → 6000. "Tuition varies" → null,
// weil ein geratener Betrag schlimmer ist als ein ehrliches "unbekannt".
function parseFee(s) {
    if (!s) return null;
    if (/no tuition fees/i.test(s)) return 0;
    const m = /([\d.,]+)/.exec(s);
    if (!m) return null;
    const n = parseInt(m[1].replace(/[.,]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
}

function parseLanguages(langs) {
    if (!langs || !langs.length) return null;
    const hasDe = langs.some(l => /german/i.test(l));
    const hasEn = langs.some(l => /english/i.test(l));
    if (hasDe && hasEn) return 'de/en';
    if (hasEn) return 'en';
    if (hasDe) return 'de';
    return null;
}

// "until 1 September" / "1 June to 15 July" / "until 15.07." → 'MM-DD'
function toMonthDay(day, monthName) {
    const m = MONTHS[String(monthName).toLowerCase()];
    if (!m || !day) return null;
    const d = parseInt(day, 10);
    if (d < 1 || d > 31) return null;
    return String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

// Die Detailseite listet die Fristen unter "Application periods" als Zeilenblöcke:
//
//   Application periods
//   The following is valid for applicants from: non-EU countries
//   For the summer semester:
//   until 1 September
//   The following is valid for applicants from:
//   EU countries
//   Iceland
//   For the winter semester:
//   1 March - 15 July
//   Combined Master's degree / PhD programme      <- ab hier andere Rubrik
//
// Zeilenweise geparst, nicht per Regex über den ganzen Text: die Zielgruppe steht
// teils auf mehreren Zeilen, und ein Datumsbereich kann ebenso auf der Semester-
// zeile wie auf der Folgezeile stehen.
const SECTION_END = /^(?:More information on application periods|Combined Master|Joint degree|Description\/content|Costs|Tuition fee|Academic admission|Language requirements|Application deadline for|Submit application to)/i;

function parseDeadlines(text) {
    const out = { ws: null, ss: null, wsNonEu: null, ssNonEu: null };
    if (!text) return out;

    const lines = text.split('\n').map(l => l.trim());
    const from = lines.findIndex(l => /^Application periods$/i.test(l));
    if (from < 0) return out;

    // Nur bis zur nächsten Rubrik lesen. Sonst landen Sätze aus der
    // Programmbeschreibung ("...applications close in June...") in der Frist.
    const section = [];
    for (let i = from + 1; i < lines.length; i++) {
        if (SECTION_END.test(lines[i])) break;
        section.push(lines[i]);
    }

    let isNonEu = false, allCountries = false;
    for (let i = 0; i < section.length; i++) {
        const line = section[i];

        const audience = /^The following is valid for applicants from:?\s*(.*)$/i.exec(line);
        if (audience) {
            // Zielgruppe kann hinter dem Doppelpunkt oder auf den Folgezeilen
            // stehen — bis zur ersten "For the … semester"-Zeile mitlesen.
            let who = audience[1];
            for (let j = i + 1; j < section.length && !/^For the /i.test(section[j]); j++) {
                who += ' ' + section[j];
            }
            isNonEu = /non-?EU|outside (?:of )?the European Union|not members? of the European Union/i.test(who);
            allCountries = /all countries/i.test(who);
            continue;
        }

        const sem = /^For the (winter|summer) semester/i.exec(line);
        if (!sem) continue;

        // Datum steht entweder auf derselben Zeile oder auf den nächsten zwei.
        const seg = [line.replace(/^For the (winter|summer) semester:?/i, ''),
                     section[i + 1] || '', section[i + 2] || ''].join(' ');

        // "1 March - 15 July", "1 June to 15 July", "15.11. – 15.02."
        const range = /(\d{1,2})\.?\s+([A-Za-z]+)\s*(?:to|until|[-–—])\s*(\d{1,2})\.?\s+([A-Za-z]+)/i.exec(seg);
        const until = /until\s+(\d{1,2})\.?\s+([A-Za-z]+)/i.exec(seg);
        let start = null, end = null;
        if (range) {
            start = toMonthDay(range[1], range[2]);
            end = toMonthDay(range[3], range[4]);
        } else if (until) {
            end = toMonthDay(until[1], until[2]);
        }
        if (!end) continue;

        const key = sem[1].toLowerCase() === 'winter' ? 'ws' : 'ss';
        const val = { start, end };
        // "all countries" gilt auch für non-EU-Bewerber, deshalb zählt es dort mit.
        if (isNonEu || allCountries) out[key + 'NonEu'] = val;
        if (!out[key]) out[key] = val;
    }
    return out;
}

// 83 der 375 Programme führen die Frist als HTML-Freitext im API-Feld statt im
// strukturierten Block ("Early Bird Application Period: 1 October - 30 October").
// Nur 7 davon sind eindeutig parsebar — die anderen nennen mehrere Zeiträume ohne
// Semesterbezug. Also unverändert als Hinweis speichern, statt zu raten.
function stripHtml(h) {
    if (!h) return null;
    const s = h.replace(/<(?:p|br|li|div)[^>]*>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
        .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
        .replace(/&ndash;|&mdash;/g, '–')
        .replace(/&amp;/g, '&')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();
    return s || null;
}

function fmtRange(r) {
    if (!r) return null;
    const de = (md) => md ? md.slice(3) + '.' + md.slice(0, 2) + '.' : null;
    return r.start ? `${de(r.start)} – ${de(r.end)}` : `bis ${de(r.end)}`;
}

// ---- Schritt 1: Liste über die API ----
// Playwright erwartet Chromium-Build 1228, lokal liegen nur 1223/1234. Statt
// 150 MB nachzuladen (was hinter dem Zscaler-Proxy ohnehin oft scheitert) den
// vorhandenen Build direkt benennen, falls der erwartete Pfad fehlt.
const browser = await chromium.launch({ headless: true, executablePath: findChromium() });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'en-US' });
const page = await ctx.newPage();

console.log('Hole Programmliste von der DAAD-API…');
const res = await page.goto(API, { waitUntil: 'domcontentloaded', timeout: 120000 });
if (res.status() !== 200) { console.error('API antwortet', res.status()); process.exit(1); }
const all = JSON.parse(await page.evaluate(() => document.body.innerText)).courses;
console.log(`API: ${all.length} Einträge insgesamt.`);

const courses = all.filter(c => uniIdByAcademy.has(c.academy) && COURSE_TYPE[c.courseType]);
console.log(`Davon Studiengänge an den ${uniIdByAcademy.size} Ziel-Unis: ${courses.length}\n`);

// ---- Schritt 2: Detailseiten für Fristen ----
const details = new Map();
if (!NO_DETAILS) {
    const targets = LIMIT ? courses.slice(0, LIMIT) : courses;
    console.log(`Lade ${targets.length} Detailseiten (${CONCURRENCY} parallel)…`);

    const pages = [];
    for (let i = 0; i < CONCURRENCY; i++) pages.push(await ctx.newPage());

    let done = 0, failed = 0;
    const queue = [...targets];
    await Promise.all(pages.map(async (pg) => {
        while (queue.length) {
            const c = queue.shift();
            try {
                await pg.goto(BASE + c.link, { waitUntil: 'load', timeout: 60000 });
                // Der Inhalt kommt per JS nach. Ohne dieses Warten liest man ein
                // leeres Gerüst — im ersten Testlauf hatten deshalb 14 von 20
                // Seiten scheinbar keine Frist.
                await pg.waitForFunction(
                    () => /Application periods|Programme duration/i.test(document.body.innerText),
                    null, { timeout: 20000 }).catch(() => {});
                const text = await pg.evaluate(() => document.body.innerText);
                details.set(c.id, {
                    deadlines: parseDeadlines(text),
                    // Der offizielle Uni-Link steht als externer Link auf der Seite.
                    official: await pg.evaluate(() => {
                        const a = [...document.querySelectorAll('a[href^="http"]')]
                            .find(x => !/daad\.de|facebook|twitter|instagram|linkedin|youtube|google/i.test(x.href));
                        return a ? a.href : null;
                    }),
                });
            } catch (e) {
                failed++;
            }
            done++;
            if (done % 25 === 0) console.log(`  ${done}/${targets.length} (Fehler: ${failed})`);
            await pg.waitForTimeout(THROTTLE_MS);
        }
    }));
    console.log(`Details geladen: ${details.size}, fehlgeschlagen: ${failed}\n`);
}

await browser.close();

// ---- Schritt 3: In die DB ----
// Nur die Ziel-Unis aus ACADEMY_TO_DB werden geleert. TUM und LMU stehen nicht in
// ACADEMY_TO_DB und bleiben damit unberührt.
const uniIds = [...uniIdByAcademy.values()];
const placeholders = uniIds.map(() => '?').join(',');
const delZul = db.prepare(`
    DELETE FROM zulassung WHERE studiengang_id IN
    (SELECT id FROM studiengang WHERE hochschule_id IN (${placeholders}))
`).run(...uniIds);
const delSg = db.prepare(`DELETE FROM studiengang WHERE hochschule_id IN (${placeholders})`).run(...uniIds);
console.log(`Alte Einträge dieser ${uniIds.length} Unis entfernt: ${delSg.changes} Studiengänge, ${delZul.changes} Zulassungen`);

// Bei sechs Unis steht im Feld stadt ein Bundesland ("Nordrhein-Westfalen" statt
// "Bochum") — Altlast aus einer früheren Quelle, die erst auffällt, seit diese
// Unis Programme haben. DAAD liefert die Stadt korrekt mit. Nur überschreiben,
// wenn dort wirklich ein Bundesland steht: sonst würde die Uni Duisburg-Essen je
// nach Programm mal in Duisburg, mal in Essen landen.
const LAENDER = new Set(['Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen',
    'Freie Hansestadt Bremen', 'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen',
    'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt',
    'Schleswig-Holstein', 'Thüringen']);
const cityByUni = new Map();
for (const c of courses) {
    const id = uniIdByAcademy.get(c.academy);
    // Häufigste Stadt gewinnt: FAU hat 33 Programme in Erlangen, 9 in Nürnberg.
    if (!c.city) continue;
    if (!cityByUni.has(id)) cityByUni.set(id, new Map());
    const m = cityByUni.get(id);
    m.set(c.city, (m.get(c.city) || 0) + 1);
}
const getStadt = db.prepare('SELECT stadt FROM hochschule WHERE id = ?');
const setStadt = db.prepare("UPDATE hochschule SET stadt = ?, updated_at = datetime('now') WHERE id = ?");
let nStadt = 0;
for (const [id, counts] of cityByUni) {
    const cur = getStadt.get(id)?.stadt;
    if (!cur || LAENDER.has(cur)) {
        const best = [...counts].sort((a, b) => b[1] - a[1])[0][0];
        setStadt.run(best, id);
        console.log(`  Stadt korrigiert: "${cur}" → "${best}"`);
        nStadt++;
    }
}
if (nStadt) console.log(`${nStadt} Städte korrigiert.`);

const insSg = db.prepare(`
    INSERT INTO studiengang
        (hochschule_id, name_de, name_en, abschluss, stufe, sprache, regelstudienzeit,
         studiengebuehr_non_eu, start_ws, start_ss, url, beschreibung, fachbereich,
         vollzeit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
`);
const insZul = db.prepare(`
    INSERT INTO zulassung
        (studiengang_id, deadline_ws, deadline_ss,
         deadline_ws_start, deadline_ws_end, deadline_ss_start, deadline_ss_end,
         bewerbungs_url, quelle_url, hinweise, verifiziert_am, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), datetime('now'), datetime('now'))
`);

let nSg = 0, nZul = 0, nWs = 0, nSs = 0, nNonEu = 0;
db.exec('BEGIN');
for (const c of courses) {
    const uniId = uniIdByAcademy.get(c.academy);
    const abschluss = COURSE_TYPE[c.courseType];
    const d = details.get(c.id);

    const sgInfo = insSg.run(
        uniId,
        c.courseName.slice(0, 200),
        c.courseName.slice(0, 200),
        abschluss,
        abschluss,
        parseLanguages(c.languages),
        parseDuration(c.programmeDuration),
        parseFee(c.tuitionFees),
        /winter/i.test(c.beginning || '') ? 1 : 0,
        /summer/i.test(c.beginning || '') ? 1 : 0,
        d?.official || (BASE + c.link),
        (c.subject || '').slice(0, 400) || null,
        c.subject || null,
    );
    nSg++;
    const sgId = sgInfo.lastInsertRowid;

    // Fristen: non-EU hat Vorrang, denn das ist die Frist für die Zielgruppe.
    const dl = d?.deadlines;
    const ws = dl?.wsNonEu || dl?.ws || null;
    const ss = dl?.ssNonEu || dl?.ss || null;
    if (dl?.wsNonEu || dl?.ssNonEu) nNonEu++;

    // "Register by 1 September 2026 + 3 more" ist abgeschnitten und damit als
    // Hinweis wertlos. Der Freitext dagegen ist bei den 83 nicht-parsebaren
    // Programmen die einzige Fristinformation, die es überhaupt gibt.
    const raw = /^Register by/i.test(c.applicationDeadline || '')
        ? null
        : stripHtml(c.applicationDeadline);
    const hinweis = [
        !ws && !ss && raw ? raw : null,
        /no deadline/i.test(c.applicationDeadline || '') ? 'Keine feste Frist laut DAAD' : null,
        c.tuitionFees === 'Tuition varies' ? 'Studiengebühren variieren — Uni-Seite prüfen' : null,
    ].filter(Boolean).join('\n\n').slice(0, 2000) || null;

    if (ws || ss || hinweis) {
        insZul.run(
            sgId,
            fmtRange(ws),
            fmtRange(ss),
            ws?.start ?? null, ws?.end ?? null,
            ss?.start ?? null, ss?.end ?? null,
            d?.official || (BASE + c.link),
            BASE + c.link,
            hinweis,
        );
        nZul++;
        if (ws) nWs++;
        if (ss) nSs++;
    }
}
db.exec('COMMIT');

console.log(`\nEingefügt: ${nSg} Studiengänge, ${nZul} Zulassungen`);
console.log(`  WS-Frist geparst: ${nWs}, SS-Frist geparst: ${nSs}, davon non-EU-spezifisch: ${nNonEu}`);

// ---- Kontrolle ----
console.log('\nPro Hochschule:');
const perUni = db.prepare(`
    SELECT h.name_de, COUNT(sg.id) n,
           SUM(CASE WHEN z.deadline_ws_end IS NOT NULL OR z.deadline_ss_end IS NOT NULL THEN 1 ELSE 0 END) mitFrist,
           SUM(CASE WHEN sg.studiengebuehr_non_eu IS NOT NULL THEN 1 ELSE 0 END) mitGebuehr
    FROM hochschule h
    JOIN studiengang sg ON sg.hochschule_id = h.id
    LEFT JOIN zulassung z ON z.studiengang_id = sg.id
    WHERE h.id IN (${placeholders})
    GROUP BY h.id ORDER BY n DESC
`).all(...uniIds);
for (const r of perUni) {
    console.log(`  ${r.name_de.slice(0, 42).padEnd(44)} ${String(r.n).padStart(3)} Prog., ${String(r.mitFrist).padStart(3)} m. Frist, ${String(r.mitGebuehr).padStart(3)} m. Gebühr`);
}

console.log('\nTUM/LMU unangetastet:');
for (const r of db.prepare(`
    SELECT h.name_kurz, h.name_de, COUNT(sg.id) n FROM hochschule h
    JOIN studiengang sg ON sg.hochschule_id = h.id
    WHERE h.name_de IN ('Technische Universität München','Ludwig-Maximilians-Universität München')
    GROUP BY h.id
`).all()) {
    console.log(`  ${(r.name_kurz || r.name_de).padEnd(12)} ${r.n} Studiengänge`);
}

// Mehrdeutige Gruppen würden im Viewer als eine Karte mit widersprüchlichen
// Fristen erscheinen — dieselbe Klasse Fehler, die Migration 004 behoben hat.
const ambiguous = db.prepare(`
    SELECT hochschule_id, name_de, abschluss, COUNT(*) c
    FROM studiengang WHERE hochschule_id IN (${placeholders})
    GROUP BY hochschule_id, name_de, abschluss HAVING c > 1
`).all(...uniIds);
if (ambiguous.length) {
    console.log(`\nWARNUNG: ${ambiguous.length} mehrdeutige Gruppen:`);
    for (const g of ambiguous.slice(0, 10)) console.log(`  ${g.c}x ${g.name_de} [${g.abschluss}]`);
} else {
    console.log('\nKeine mehrdeutigen Gruppen.');
}

db.close();
console.log('\nFertig. Jetzt: node scripts/build-html.mjs');
