// Baut einen self-contained HTML Viewer mit eingebetteten Daten aus SQLite.
// Output: viewer.html (offline, direkt im Browser öffenbar)
//
// Programm-zuerst: die Hauptliste zeigt Studiengänge, nicht Hochschulen, weil
// die Entscheidungseinheit eines Bewerbers die Bewerbung ist. Die Karte ist
// Beiwerk und einklappbar.
//
// Leaflet + OSM Tiles werden CDN-geladen. Wenn Zscaler die CDN blockiert,
// bleibt alles ausser der Karte benutzbar.

import { openDb } from './_db.mjs';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'viewer.html');

const db = openDb();

const unis = db.prepare(`
    SELECT h.id, h.name_de, h.name_kurz, h.name_en, h.stadt, h.bundesland, h.typ,
           h.latitude, h.longitude, h.gruendungsjahr, h.studenten_anzahl,
           h.website, h.wikidata_qid,
           r.qs_2025, r.the_2025, r.arwu_2024,
           r.tu9, r.exzellenz, r.u15,
           (SELECT COUNT(*) FROM studiengang WHERE hochschule_id = h.id) AS studiengang_count,
           (SELECT COUNT(*) FROM studiengang sg2
              JOIN zulassung z2 ON z2.studiengang_id = sg2.id
             WHERE sg2.hochschule_id = h.id) AS zulassung_count
    FROM hochschule h
    LEFT JOIN ranking r ON r.hochschule_id = h.id
    ORDER BY h.name_de
`).all();

const programs = db.prepare(`
    SELECT sg.id, sg.hochschule_id, sg.name_de, sg.abschluss, sg.stufe, sg.variante,
           sg.url, sg.sprache, sg.regelstudienzeit, sg.ects, sg.studiengebuehr_non_eu,
           z.zulassungsart, z.eignungsverfahren,
           z.deadline_ws, z.deadline_ss,
           z.deadline_ws_start, z.deadline_ws_end,
           z.deadline_ss_start, z.deadline_ss_end,
           z.sprachnachweis_details, z.bewerbungs_url,
           sg.name_en, sg.fachbereich
    FROM studiengang sg
    LEFT JOIN zulassung z ON z.studiengang_id = sg.id
    ORDER BY sg.name_de
`).all();

// Fachbereichs-Filter. Das DB-Feld fachbereich taugt dafür nicht direkt: DAAD
// liefert 155 englische Feinkategorien ("Geophysics", "Applied Mathematics"),
// die LMU nur 7 deutsche Sammeltitel, TUM gar nichts. Also aus dem Namen
// ableiten. Reihenfolge = Priorität, der erste Treffer gewinnt.
const FACH_CATS = [
    ['lehramt', /lehramt|lehrer|teaching degree|teacher|didaktik|didaktikfach|pädagog|pedagog|bildungswiss|educat|erziehung|sonderpädagog|frühpädagog|elementarbildung|schulpsycholog|berufliche bildung/i],
    ['sport', /sport|exercise scien|human movement|high performance sport/i],
    ['medizin', /medizin|medicine|medical|zahn|dental|pharma|pharmacy|pflege|nursing|health|gesundheit|therapie|therapy|hebamm|midwif|veterinär|veterinary|tiermedizin|epidemiolog|neurosci|neurowissen|onkolog|oncolog|mental function|immunolog|immunoscience|infection|gerontolog|radiation biolog/i],
    // "Computational X" ist meistens X mit Rechnereinsatz, nicht Informatik.
    // Ohne diese Vorabregeln landen Computational Mechanics und Digital
    // Archaeology in der Informatik, weil dort das breite "comput" greift.
    ['ingenieur', /computational (?:engineering|mechanic|method|modelling|modeling|sciences? (?:in|and) engineering)|advanced computational/i],
    ['mathematik', /computational and applied mathematic/i],
    ['naturwiss', /computational (?:molecular|biolog|geolog)|molecular and computational/i],
    ['sozialwiss', /computational social/i],
    ['sprachen', /computational linguist|computerlinguistik|computational archaeolog|manuscript|written artefact/i],
    ['informatik', /informatik|geoinformat|computer sci|comput|software|data scien|data ?& ?society|künstliche intell|artificial intell|machine learn|robotic|cyber|information system|bioinformati|games engineer|quantum (?:scien|comput|tech)|digital humanities/i],
    ['ingenieur', /ingenieur|engineering|maschinenbau|maschinenwesen|mechanical|elektrotech|electric|electronic|microelectronic|integrated circuit|circuit design|bau(?:ingenieur|wesen|technik)|civil eng|verfahrenstech|chemical eng|prozesstechnik|luft|raumfahrt|aerospace|aeronaut|fahrzeug|automotive|mechatron|energietech|energy eng|werkstoff|materials? sci|science and technology of materials|produktionstech|manufacturing|nanotech|verkehr|logistik|logistics|schiffbau|naval|mining|bergbau|geodes|geodät|geomatic|vermessung|mikrosystem|microsystem|automation|photonic|photonik|laser|optical technolog|brauwesen|getränketech|rail and urban|transportation system|risk and safety|biomass|bioeconom|bioökonom|biogen|biotechnolog|hydrogeolog/i],
    ['mathematik', /mathemat|statisti|actuar|versicherungsmath|stochast|operations research/i],
    ['naturwiss', /geograph|geospatial|physik|physics|chemie|chemistry|biologie|biology|biochem|biophys|molekular|molecular|mikrobiolog|microbiolog|geowissen|geoscien|geolog|geophys|geotherm|geoenergie|meteorolog|astronom|astrophys|ozeanograph|oceanograph|mineralog|paläont|paleo|life scien|pharmaceutical scien|earth system/i],
    ['agrar', /agrar|agricultur|forst|forest|umwelt|environment|ökolog|ecolog|ecosystem|nachhaltig|sustainab|naturschutz|nature conservation|landschaft|landscape|garten|horticult|ernährung|nutrition|lebensmittel|food|klima|climate|wasser\b|water|resource manage|holz|wood|consumer scien|urbanistik/i],
    ['recht', /jura|\brecht\b|rechtswissen|kirchenrecht|kanonisch|\blaw\b|\blaws\b|legal|jurist|kriminolog|criminolog/i],
    ['wirtschaft', /wirtschaft|betriebswirt|business|management|economic|volkswirt|finance|finanz|accounting|controlling|marketing|handel|trade|banking|insurance|versicherung|tourism|tourismus|immobilien|real estate|supply chain|entrepreneur|human resource|steuer|taxation|MBA/i],
    ['sozialwiss', /soziolog|sociolog|politik|political|politics|sozialwiss|social scien|sozialarbeit|social work|internationale bezieh|international relation|verwaltung|public administration|governance|friedens|peace|entwicklung|development stud|kommunikation|communication|medien|media|journalis|ethnolog|anthropolog|psycholog|demograph|buchwissenschaft|global market|ai in society|transregional/i],
    ['kunst', /kunst|design|musik|music|theater|theatre|tanz\b|dance|film|schauspiel|acting|architekt|architecture|interior|mode\b|fashion|fotograf|photograph|bildende|fine art|restaurier|conservation|stadtplan|urban plan|raumplan|spatial plan|denkmal|curat|kurator|cartograph|kartograph/i],
    ['sprachen', /anglist|german|deutsch|romanist|slavist|sinolog|japanolog|arabist|indolog|iranist|turkolog|philolog|linguist|sprachwiss|literatur|literature|übersetz|translat|dolmetsch|interpret|studies|latein|latin|griechisch|greek|hebrä|hebrew|ägypt|egypt|koptolog|orient|afrikan|african|amerikan|american|europäisch|kulturwiss|cultural|geschichte|history|archäolog|archaeolog|philosoph|theolog|religion|religionslehre|klassisch|classic|byzant|assyriolog|albanolog|skandinav|nordi|finn|ungar|balt|keltolog|polnisch|persianate|ethnograf|ethnograph/i],
];

// Der Programmname zuerst, fachbereich nur als Rückfall: der LMU-Sammeltitel
// "Mathematik und Naturwissenschaften" würde Physik sonst zu Mathematik machen.
function fachCat(p) {
    for (const src of [[p.name_de, p.name_en].filter(Boolean).join(' | '), p.fachbereich]) {
        if (!src) continue;
        const hit = FACH_CATS.find(([, re]) => re.test(src));
        if (hit) return hit[0];
    }
    return null;
}

for (const p of programs) {
    p.fach = fachCat(p);
    delete p.name_en;
    delete p.fachbereich;
}

// Nur http(s) in href. In der DB steht real ein 'javascript:void(0);'
// (LMU-Scraper hat einen JS-Link erwischt) — escapeHtml fängt das nicht ab,
// weil HTML-Escaping kein Schema validiert.
function safeUrl(u) {
    if (!u) return null;
    try {
        const parsed = new URL(u);
        return /^https?:$/.test(parsed.protocol) ? u : null;
    } catch {
        return null;
    }
}
for (const p of programs) {
    p.url = safeUrl(p.url);
    p.bewerbungs_url = safeUrl(p.bewerbungs_url);
}
for (const u of unis) {
    u.website = safeUrl(u.website);
}

// JSON.stringify escapt '/' nicht, ein name_de mit '</script>' würde also den
// Script-Block schliessen und Markup injizieren, bevor eigener JS-Code läuft.
// U+2028/2029 sind in JS-Strings Zeilenterminatoren, in JSON aber erlaubt.
function embedJson(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

// ---- Kennzahlen aus den Daten ableiten, nicht hart schreiben ----
const SUBUNIT_RE = /\b(Fakultät|Fachbereich|Institut|Lehrstuhl|Department|Zentrum|Klinik|Abteilung|Fachrichtung)\b/i;
// Eine gerankte Hochschule ist nie ein Unterinstitut. Ohne diese Ausnahme
// verschwindet das "Karlsruher Institut für Technologie" (TU9, Exzellenz, QS 119)
// aus der Standardansicht und die TU9-Zählung stimmt nicht mehr.
const isSubunit = (u) =>
    SUBUNIT_RE.test(u.name_de || '') &&
    !u.qs_2025 && !u.tu9 && !u.exzellenz && !u.u15;

const stats = {
    unisTotal: unis.length,
    unisReal: unis.filter(u => !isSubunit(u)).length,
    unisWithCoords: unis.filter(u => u.latitude != null).length,
    unisWithPrograms: unis.filter(u => u.studiengang_count > 0).length,
    unisWithZulassung: unis.filter(u => u.zulassung_count > 0).length,
    tu9: unis.filter(u => u.tu9 === 1).length,
    exzellenz: unis.filter(u => u.exzellenz === 1).length,
    u15: unis.filter(u => u.u15 === 1).length,
    ranked: unis.filter(u => u.qs_2025 != null).length,
    programsTotal: programs.length,
    programsWithDeadline: programs.filter(p => p.deadline_ws_start || p.deadline_ss_start).length,
    programsWithFee: programs.filter(p => p.studiengebuehr_non_eu != null).length,
    programsWithZulassungsart: programs.filter(p => p.zulassungsart != null).length,
};

const coveredUnis = unis
    .filter(u => u.studiengang_count > 0)
    .map(u => ({
        name: u.name_kurz || u.name_de,
        programs: u.studiengang_count,
        withZulassung: u.zulassung_count,
    }));

console.log(`Hochschulen: ${stats.unisTotal} (${stats.unisReal} nach Subunit-Filter, ${stats.unisWithCoords} mit Koordinaten)`);
console.log(`Studiengänge: ${stats.programsTotal}, davon ${stats.programsWithDeadline} mit Frist`);
console.log(`Programmdaten vorhanden bei: ${coveredUnis.map(u => `${u.name} (${u.programs}, Zulassung: ${u.withZulassung})`).join(', ')}`);

const CSS = String.raw`
* { box-sizing: border-box; }
html, body {
    margin: 0; padding: 0;
    font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    background: #0f1115; color: #e6e7ea;
}
body { display: grid; grid-template-rows: auto auto 1fr; min-height: 100vh; }

/* App-Shell nur bei breiten Fenstern: Spalten scrollen einzeln, Karte füllt die
   Höhe. Bei schmal/gezoomt (< 1151px) fällt alles in den Dokumentfluss zurück,
   damit bei 400% Zoom nichts abgeschnitten wird. */
@media (min-width: 1151px) {
    body { height: 100vh; overflow: hidden; }
    main { min-height: 0; }
}

.visually-hidden {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* Sichtbarer Fokus: das alte #005ea8 lag bei 2.85:1 gegen das Eingabefeld */
:focus-visible { outline: 2px solid #8ec5ff; outline-offset: 2px; }

/* Ohne Skip-Link muss man 28 Filter-Chips durchtabben, um zur Liste zu kommen. */
.skip-link {
    position: absolute; left: 8px; top: -40px; z-index: 2000;
    background: #8ec5ff; color: #0f1115; padding: 8px 14px;
    border-radius: 0 0 6px 6px; font-weight: 600; text-decoration: none;
}
.skip-link:focus { top: 0; }

header {
    padding: 14px 22px;
    background: linear-gradient(90deg, #003781 0%, #005ea8 100%);
    color: white;
    display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
    box-shadow: 0 2px 10px rgba(0,0,0,0.4);
}
header h1 { font-size: 18px; margin: 0; font-weight: 600; letter-spacing: 0.3px; }
header .subtitle { font-size: 12px; opacity: 0.85; }
header .stats { margin-left: auto; font-size: 12px; display: flex; gap: 18px; flex-wrap: wrap; }
header .stats b { font-size: 15px; font-weight: 700; display: block; }
header .stats .unit { opacity: 0.85; }

.coverage-note {
    background: #3a2f0a; border-bottom: 1px solid #5c4a10;
    padding: 8px 22px; font-size: 12px; color: #ffe9b0;
}
.coverage-note b { color: #fff6dd; }

main {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr) 460px;
    min-height: 0;
}

aside.filters {
    background: #1a1d24;
    border-right: 1px solid #2a2e38;
    padding: 18px;
    overflow-y: auto;
}
aside.filters h2 {
    font-size: 13px; text-transform: uppercase; letter-spacing: 1px;
    color: #8d95a6; margin: 0 0 10px 0; font-weight: 600;
}
aside.filters .group { margin-bottom: 22px; }
aside.filters input[type="search"], aside.filters input[type="number"], aside.filters select {
    width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid #4a5162;
    background: #0f1115; color: #e6e7ea; font-size: 13px; font-family: inherit;
}
aside.filters label.field { display: block; font-size: 12px; color: #a8b0c0; margin-bottom: 6px; }
.chip-group { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
    padding: 5px 10px; border-radius: 14px; background: #262b36;
    border: 1px solid #4a5162; font-size: 12px; cursor: pointer;
    color: #c7ccd8; font-family: inherit; min-height: 26px;
}
.chip:hover { background: #303645; }
.chip[aria-pressed="true"] { background: #005ea8; border-color: #8ec5ff; color: white; font-weight: 600; }
@media (forced-colors: active) {
    .chip[aria-pressed="true"] { border: 3px solid Highlight; }
}
.checkbox-row {
    display: flex; align-items: center; gap: 8px; font-size: 13px;
    color: #c7ccd8; cursor: pointer; padding: 4px 0;
}
.checkbox-row input { accent-color: #005ea8; }
.checkbox-row .count { color: #8d95a6; font-size: 12px; }

button.reset {
    width: 100%; padding: 9px; background: #262b36; border: 1px solid #4a5162;
    color: #c7ccd8; border-radius: 6px; cursor: pointer; font-size: 13px; font-family: inherit;
}
button.reset:hover { background: #303645; }

.data-note { margin-top: 20px; font-size: 11px; color: #8d95a6; line-height: 1.6; }
.data-note b { color: #a8b0c0; }

/* ---- Ergebnis-Panel ---- */
section.results { background: #1a1d24; overflow-y: auto; min-width: 0; }
.results-head {
    position: sticky; top: 0; background: #1a1d24; z-index: 5;
    padding: 14px 20px 12px 20px; border-bottom: 1px solid #2a2e38;
    display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap;
}
.results-head h2 {
    margin: 0; font-size: 13px; text-transform: uppercase;
    letter-spacing: 1px; color: #8d95a6; font-weight: 600;
}
.results-head .result-count { font-size: 13px; color: #e6e7ea; font-weight: 600; }
.results-head .sort-wrap { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.results-head select {
    padding: 5px 8px; border-radius: 6px; border: 1px solid #4a5162;
    background: #0f1115; color: #e6e7ea; font-size: 12px; font-family: inherit;
}
.results-head label { font-size: 12px; color: #a8b0c0; }

.prog-row {
    display: block; width: 100%; text-align: left;
    padding: 13px 20px; border: 0; border-bottom: 1px solid #22252d;
    background: none; color: inherit; font: inherit; cursor: pointer;
}
.prog-row:hover { background: #22252d; }
.prog-row[aria-expanded="true"] { background: #1e2530; }
.prog-row .prog-name { font-size: 14px; font-weight: 500; color: #e6e7ea; margin-bottom: 5px; }
.prog-row .prog-variante { color: #a8b0c0; font-weight: 400; font-size: 13px; }
.prog-row .prog-meta {
    font-size: 12px; color: #a8b0c0; display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
}
.prog-row .uni-name { color: #cfd6e4; }

.pill {
    display: inline-flex; align-items: center; min-height: 24px;
    padding: 2px 9px; border-radius: 3px; font-size: 11px; font-weight: 600;
}
.pill-stufe-Bachelor { background: #1e4d8b; color: #cfe2ff; }
.pill-stufe-Master   { background: #6b3410; color: #ffe0bd; }
.pill-stufe-PhD      { background: #5a2d4d; color: #ffcdee; }
.pill-stufe-none     { background: #333844; color: #a8b0c0; }
.pill-lang-en { background: #123f36; color: #9ff0da; }
.pill-lang-de { background: #2c2f57; color: #c3c8ff; }
.pill-lang-mix { background: #143a4d; color: #a5e0f5; }
.pill-fee-free { background: #1d4632; color: #b6f2ce; }
.pill-fee-paid { background: #4a2c10; color: #ffd9a8; }
.pill-fee-unknown { background: #333844; color: #a8b0c0; }

.dl-open    { background: #1d4632; color: #b6f2ce; }
.dl-closed  { background: #4a1f26; color: #ffc2cb; }
.dl-unknown { background: #333844; color: #a8b0c0; }

.label {
    display: inline-block; padding: 1px 7px; border-radius: 3px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.5px; vertical-align: middle;
}
.label-tu9 { background: #ffb703; color: #3a2500; }
.label-exz { background: #c1121f; color: #fff5f5; }
.label-u15 { background: #7c9eff; color: #0a1030; }
.qs-rank { color: #8ec5ff; font-weight: 600; }

/* Detail-Karte unter der Zeile */
.prog-detail {
    padding: 0 20px 16px 20px; background: #14181f;
    border-bottom: 1px solid #22252d; font-size: 12px; line-height: 1.6;
}
.prog-detail[hidden] { display: none; }
.fact-grid { display: grid; grid-template-columns: 110px 1fr; gap: 4px 12px; padding-top: 12px; }
.fact-label { color: #8d95a6; }
.fact-value { color: #e6e7ea; }
.eig-warn {
    display: inline-block; padding: 2px 8px; background: #6b3410;
    color: #ffd9a8; border-radius: 3px; font-size: 10px; font-weight: 700; margin-left: 6px;
}
.cta-row { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.cta {
    display: inline-flex; align-items: center; min-height: 30px;
    padding: 6px 14px; background: #005ea8; color: white;
    text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 12px;
}
.cta:hover { background: #0072cc; }
.cta-secondary { background: #262b36; border: 1px solid #4a5162; }
.cta-secondary:hover { background: #303645; }
.missing-note { color: #8d95a6; font-style: italic; padding-top: 12px; }

.empty-state { padding: 48px 24px; text-align: center; color: #a8b0c0; font-size: 13px; line-height: 1.7; }
.empty-state b { color: #e6e7ea; display: block; margin-bottom: 8px; font-size: 15px; }

/* ---- Uni-Ansicht ---- */
.uni-row {
    display: block; width: 100%; text-align: left;
    padding: 12px 20px; border: 0; border-bottom: 1px solid #22252d;
    background: none; color: inherit; font: inherit; cursor: pointer;
}
.uni-row:hover { background: #22252d; }
.uni-row.no-data { cursor: default; }
.uni-row.no-data:hover { background: none; }
.uni-row .name { font-size: 14px; font-weight: 500; color: #e6e7ea; margin-bottom: 4px; }
.uni-row .meta { font-size: 12px; color: #a8b0c0; display: flex; gap: 9px; flex-wrap: wrap; align-items: center; }
.badge {
    padding: 1px 7px; border-radius: 3px; font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px;
}
.badge-Universität { background: #1e4d8b; color: #cfe2ff; }
.badge-TU { background: #6b3410; color: #ffe0bd; }
.badge-FH, .badge-HAW { background: #2d5a3d; color: #cbffdd; }
.badge-Musik { background: #5a2d4d; color: #ffcdee; }
.badge-Kunst { background: #4d2d5a; color: #e0ccff; }
.badge-PH { background: #5a4d2d; color: #fff0c4; }
.badge-Sonstige { background: #333844; color: #a8b0c0; }
.unknown-val { color: #8d95a6; font-style: italic; }
.no-data-tag { background: #333844; color: #a8b0c0; padding: 1px 7px; border-radius: 3px; font-size: 10px; font-weight: 600; }

/* ---- Karte: eigene Spalte rechts, volle Höhe ---- */
.map-section {
    border-left: 1px solid #2a2e38; background: #1a1d24;
    display: grid; grid-template-rows: auto 1fr; min-height: 0;
}
.map-head {
    padding: 12px 16px; border-bottom: 1px solid #2a2e38;
    display: flex; align-items: baseline; gap: 10px;
}
.map-head h2 {
    font-size: 13px; text-transform: uppercase; letter-spacing: 1px;
    color: #8d95a6; margin: 0; font-weight: 600;
}
.map-head .count { font-size: 12px; color: #a8b0c0; }
.map-wrap { position: relative; min-height: 0; }
#map { height: 100%; width: 100%; background: #1a1d24; }
.leaflet-container { background: #1a1d24; }
.map-legend {
    position: absolute; bottom: 10px; left: 10px; z-index: 500;
    background: rgba(15,17,21,0.92); border: 1px solid #4a5162; border-radius: 6px;
    padding: 8px 10px; font-size: 11px; color: #c7ccd8;
}
.map-legend .row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.map-legend .dot { width: 9px; height: 9px; border-radius: 50%; border: 1px solid #fff; }
#mapErr {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
    background: rgba(26,29,36,0.97); padding: 20px; border-radius: 8px;
    max-width: 360px; text-align: center; color: #c7ccd8; font-size: 13px;
    z-index: 1000; border: 1px solid #4a5162;
}
#mapErr[hidden] { display: none; }
#mapErr b { color: #e6e7ea; }

.leaflet-popup-content-wrapper { background: #1a1d24; color: #e6e7ea; border-radius: 8px; }
.leaflet-popup-tip { background: #1a1d24; }
.leaflet-popup-content { margin: 12px 14px; font-size: 13px; }
.leaflet-popup-content h3 { margin: 0 0 6px 0; font-size: 14px; }
.leaflet-popup-content a { color: #8ec5ff; }

.tab-bar { display: flex; gap: 4px; padding: 0 20px; background: #14181f; border-bottom: 1px solid #2a2e38; }
.tab {
    padding: 11px 16px; background: none; border: 0; border-bottom: 2px solid transparent;
    color: #a8b0c0; font: inherit; font-size: 13px; cursor: pointer;
}
.tab:hover { color: #e6e7ea; }
.tab[aria-selected="true"] { color: #8ec5ff; border-bottom-color: #8ec5ff; font-weight: 600; }

@media (max-width: 1400px) {
    main { grid-template-columns: 280px minmax(0, 1fr) 360px; }
}
/* Unter 1150px hat die Karte als Spalte keinen Platz mehr — dann unter die Liste. */
@media (max-width: 1150px) {
    main { grid-template-columns: 280px minmax(0, 1fr); }
    .map-section {
        grid-column: 1 / -1; border-left: 0; border-top: 1px solid #2a2e38;
        grid-template-rows: auto 380px;
    }
}
@media (max-width: 800px) {
    main { grid-template-columns: 1fr; }
    aside.filters {
        border-right: 0; border-bottom: 1px solid #2a2e38;
        position: static; max-height: none;
    }
}
@media (prefers-reduced-motion: reduce) {
    * { transition: none !important; animation: none !important; }
}
`;

const HTML_BODY = String.raw`
<a class="skip-link" href="#programPanel">跳到专业列表</a>
<header>
    <div>
        <h1><span aria-hidden="true">🎓</span> 德国大学申请数据库</h1>
        <div class="subtitle">DT-Uni-App · MVP · Wikidata + TUM/LMU Scrape</div>
    </div>
    <div class="stats">
        <div><b id="statPrograms">–</b><span class="unit">当前专业</span></div>
        <div><b id="statUnisShown">–</b><span class="unit">涉及学校</span></div>
        <div><b>${stats.programsWithDeadline}</b><span class="unit">有申请截止日期</span></div>
    </div>
</header>

<div class="coverage-note">
    <b>数据覆盖率提醒：</b>
    ${stats.unisTotal} 所学校在库，但只有 <b>${stats.unisWithPrograms} 所</b>有专业数据
    （${coveredUnis.map(u => `${u.name} ${u.programs} 个`).join('、')}），
    只有 <b>${stats.unisWithZulassung} 所</b>有申请截止日期和学费。
    其余学校的专业列表还没爬取 — 不是"没有专业"。
</div>

<main>
    <aside class="filters">
        <div class="group">
            <h2><span aria-hidden="true">🔍</span> 搜索专业</h2>
            <input type="search" id="q" placeholder="专业名 / 学校 / 城市…" autocomplete="off"
                   aria-label="搜索专业、学校或城市">
        </div>

        <div class="group">
            <h2>专业大类</h2>
            <div class="chip-group" id="fachChips" role="group" aria-label="专业大类筛选"></div>
        </div>

        <div class="group">
            <h2>学位层级</h2>
            <div class="chip-group" id="stufeChips" role="group" aria-label="学位层级筛选"></div>
        </div>

        <div class="group">
            <h2>授课语言</h2>
            <div class="chip-group" id="langChips" role="group" aria-label="授课语言筛选"></div>
        </div>

        <div class="group">
            <h2>学费（非欧盟）</h2>
            <div class="chip-group" id="feeChips" role="group" aria-label="学费筛选"></div>
        </div>

        <div class="group">
            <h2>录取方式</h2>
            <div class="chip-group" id="zulChips" role="group" aria-label="录取方式筛选"></div>
        </div>

        <div class="group">
            <h2>申请窗口</h2>
            <div class="chip-group" id="dlChips" role="group" aria-label="申请窗口筛选"></div>
            <div class="data-note" style="margin-top: 8px;">
                按今天 <span id="todayLabel"></span> 判断。仅
                ${stats.programsWithDeadline} 个专业有截止日期数据。
            </div>
        </div>

        <div class="group">
            <h2>学校类型</h2>
            <div class="chip-group" id="typChips" role="group" aria-label="学校类型筛选"></div>
        </div>

        <div class="group">
            <h2><span aria-hidden="true">⭐</span> 学校声誉</h2>
            <label class="checkbox-row">
                <input type="checkbox" id="onlyTU9"> 只看 TU9 <span class="count">(${stats.tu9} 所)</span>
            </label>
            <label class="checkbox-row">
                <input type="checkbox" id="onlyExz"> 只看精英大学 <span class="count">(${stats.exzellenz} 所)</span>
            </label>
            <label class="checkbox-row">
                <input type="checkbox" id="onlyU15"> 只看 U15 <span class="count">(${stats.u15} 所)</span>
            </label>
            <label class="checkbox-row">
                <input type="checkbox" id="onlyRanked"> 只看有 QS 排名 <span class="count">(${stats.ranked} 所)</span>
            </label>
            <div style="margin-top: 10px;">
                <label class="field" for="qsMax">QS 排名不低于（≤）</label>
                <input type="number" id="qsMax" placeholder="例：200" min="1" max="1500" step="1">
                <div id="qsMaxErr" class="data-note" role="status" style="min-height: 1em;"></div>
            </div>
        </div>

        <button class="reset" id="reset">重置全部筛选</button>

        <div class="data-note">
            <b>数据说明</b><br>
            学校身份与坐标来自 Wikidata SPARQL（${stats.unisTotal} 条，含院系子机构）。
            专业、学费、截止日期来自 TUM/LMU 官网爬取。<br>
            HRK Hochschulkompass 交叉验证前，请以学校官网为准。
        </div>
    </aside>

    <section class="results">
        <div class="tab-bar" role="tablist" aria-label="视图切换">
            <button class="tab" id="tabPrograms" role="tab" aria-selected="true"
                    aria-controls="programPanel">专业列表</button>
            <button class="tab" id="tabUnis" role="tab" aria-selected="false"
                    aria-controls="uniPanel">学校列表</button>
        </div>

        <div id="programPanel" role="tabpanel" aria-labelledby="tabPrograms" tabindex="-1">
            <div class="results-head">
                <h2>专业</h2>
                <span class="result-count" id="progCount" role="status"></span>
                <div class="sort-wrap">
                    <label for="progSort">排序</label>
                    <select id="progSort">
                        <option value="deadline">按申请窗口（开放优先）</option>
                        <option value="name">按专业名</option>
                        <option value="uni">按学校</option>
                        <option value="fee">按学费（低→高）</option>
                    </select>
                </div>
            </div>
            <div id="progList"></div>
        </div>

        <div id="uniPanel" role="tabpanel" aria-labelledby="tabUnis" hidden>
            <div class="results-head">
                <h2>学校</h2>
                <span class="result-count" id="uniCount" role="status"></span>
                <div class="sort-wrap">
                    <label for="uniSort">排序</label>
                    <select id="uniSort">
                        <option value="programs">按专业数据量</option>
                        <option value="qs">按 QS 排名</option>
                        <option value="name">按名称</option>
                        <option value="students">按学生数</option>
                        <option value="city">按城市</option>
                    </select>
                </div>
            </div>
            <label class="checkbox-row" style="padding: 10px 20px; border-bottom: 1px solid #22252d;">
                <input type="checkbox" id="hideSubunits" checked>
                隐藏院系子机构 <span class="count" id="subunitCount"></span>
            </label>
            <div id="uniList"></div>
        </div>

    </section>

    <div class="map-section">
        <div class="map-head">
            <h2><span aria-hidden="true">🗺️</span> 地图</h2>
            <span class="count"><span id="mapCount">0</span> 所学校有坐标</span>
        </div>
        <div class="map-wrap" id="mapWrap">
            <div id="map" aria-hidden="true"></div>
            <div class="map-legend" id="mapLegend" aria-hidden="true"></div>
            <div id="mapErr" hidden>
                <b>地图未加载</b><br><br>
                Leaflet CDN 被公司代理拦截了。<br>
                专业和学校列表不受影响。
            </div>
        </div>
        <p class="visually-hidden">地图只是辅助定位，所有数据都在左边的列表里。</p>
    </div>
</main>
`;

const APP_JS = String.raw`
const UNIS = window.__UNIS__;
const PROGRAMS = window.__PROGRAMS__;
const STATS = window.__STATS__;
const UNI_BY_ID = new Map(UNIS.map(u => [u.id, u]));

// 'MM-DD' des heutigen Tages — Fristen sind jahrlos gespeichert
const TODAY = (() => {
    const d = new Date();
    return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
})();

const SUBUNIT_RE = /\b(Fakultät|Fachbereich|Institut|Lehrstuhl|Department|Zentrum|Klinik|Abteilung|Fachrichtung)\b/i;
// Gerankte Hochschulen sind nie Unterinstitute — sonst fällt das KIT raus.
function isSubunit(u) {
    return SUBUNIT_RE.test(u.name_de || '') && !u.qs_2025 && !u.tu9 && !u.exzellenz && !u.u15;
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// SS-Fenster laufen über den Jahreswechsel (01.10. – 15.01.), deshalb
// braucht der Vergleich einen Wrap-Zweig statt nur start <= heute <= end.
//
// 69 Programme nennen nur ein Ende ("bis 1. März") ohne Öffnungsdatum. Ohne
// Startwert galten sie als "keine Fristdaten", obwohl das Datum bekannt ist.
// Da es ohne Startdatum kein Fenster gibt, das schließen könnte, zählt so ein
// Eintrag als offen — nur so kommt der Bewerber überhaupt an die Frist.
function windowOpen(start, end) {
    if (!end) return null;
    if (!start) return true;
    return start <= end
        ? (start <= TODAY && TODAY <= end)
        : (TODAY >= start || TODAY <= end);
}

function deadlineStatus(p) {
    const ws = windowOpen(p.deadline_ws_start, p.deadline_ws_end);
    const ss = windowOpen(p.deadline_ss_start, p.deadline_ss_end);
    if (ws === null && ss === null) return 'unknown';
    return (ws || ss) ? 'open' : 'closed';
}

const DL_LABEL = { open: '申请开放中', closed: '当前已关闭', unknown: '无截止日期数据' };

function feeBand(p) {
    const f = p.studiengebuehr_non_eu;
    if (f == null) return 'unknown';
    if (f === 0) return 'free';
    if (f <= 2000) return 'low';
    if (f <= 4000) return 'mid';
    return 'high';
}
const FEE_LABEL = { free: '免学费', low: '≤2000 €', mid: '≤4000 €', high: '>4000 €', unknown: '学费未知' };

const LANG_LABEL = { de: '德语', en: '英语', 'de/en': '德/英', unknown: '语言未知' };
function langKey(p) {
    return (p.sprache === 'de' || p.sprache === 'en' || p.sprache === 'de/en') ? p.sprache : 'unknown';
}

const ZUL_LABEL = {
    zulassungsfrei: '免筛选（直接注册）',
    NC: 'NC 分数线',
    Eignung: 'Eignungsverfahren（适性检核）',
    Portfolio: '作品集',
    Test: '入学考试',
    Sonstige: '其他',
    unknown: '录取方式未知',
};

const FACH_LABEL = {
    informatik: '计算机 / IT', ingenieur: '工程技术', mathematik: '数学 / 统计',
    naturwiss: '自然科学', medizin: '医学 / 健康', wirtschaft: '经济 / 管理',
    recht: '法学', sozialwiss: '社会科学 / 传媒', sprachen: '语言 / 人文',
    kunst: '艺术 / 建筑', agrar: '农林 / 环境', lehramt: '师范 / 教育',
    sport: '体育', unknown: '未分类',
};
const FACH_ORDER = ['informatik', 'ingenieur', 'mathematik', 'naturwiss', 'medizin',
    'wirtschaft', 'recht', 'sozialwiss', 'sprachen', 'kunst', 'agrar', 'lehramt',
    'sport', 'unknown'];

const STUFE_LABEL = {
    Bachelor: '本科', Master: '硕士', PhD: '博士',
    Staatsexamen: '国考', Diplom: 'Diplom', Zertifikat: '证书', unknown: '层级未知',
};
function stufeKey(p) { return p.stufe || 'unknown'; }

const state = {
    q: '', fach: null, stufe: null, lang: null, fee: null, zul: null, dl: null, typ: null,
    onlyTU9: false, onlyExz: false, onlyU15: false, onlyRanked: false, qsMax: null,
    progSort: 'deadline', uniSort: 'programs', hideSubunits: true,
    view: 'programs',
};
const openPrograms = new Set();

// ---- Karte ----
let map, markerLayer, mapInitialized = false;
const TYP_COLOR = {
    'Universität': '#5aa9ff', 'TU': '#ff9d5a', 'FH': '#5affac', 'HAW': '#5affac',
    'Musik': '#ff7ecd', 'Kunst': '#c88fff', 'PH': '#ffd766', 'Sonstige': '#8a92a3',
};
function typColor(t) { return TYP_COLOR[t] || '#8a92a3'; }

function initMap() {
    if (mapInitialized) return;
    mapInitialized = true;
    try {
        if (typeof L === 'undefined') throw new Error('Leaflet not loaded');
        map = L.map('map', { center: [51.1, 10.3], zoom: 5, zoomControl: true, preferCanvas: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap', maxZoom: 18,
        }).addTo(map);
        markerLayer = L.layerGroup().addTo(map);
        document.getElementById('mapLegend').innerHTML = Object.entries(TYP_COLOR)
            .filter(([k]) => k !== 'HAW')
            .map(([k, v]) => '<div class="row"><span class="dot" style="background:' + v + '"></span>' + escapeHtml(k) + '</div>')
            .join('');
        renderMarkers(lastUniList);
    } catch (e) {
        console.error(e);
        document.getElementById('mapErr').hidden = false;
    }
}

function renderMarkers(unis) {
    if (!markerLayer) return;
    markerLayer.clearLayers();
    for (const u of unis) {
        if (u.latitude == null || u.longitude == null) continue;
        const m = L.circleMarker([u.latitude, u.longitude], {
            radius: 6, fillColor: typColor(u.typ), color: '#fff',
            weight: 1.5, opacity: 1, fillOpacity: 0.85,
        });
        // Popup-Inhalt lazy: Leaflet akzeptiert eine Funktion und baut erst beim Öffnen.
        m.bindPopup(() => popupHtml(u));
        m.addTo(markerLayer);
    }
}

function popupHtml(u) {
    const rankings = [];
    if (u.qs_2025) rankings.push('QS #' + u.qs_2025);
    if (u.the_2025) rankings.push('THE #' + u.the_2025);
    if (u.arwu_2024) rankings.push('ARWU #' + u.arwu_2024);
    const lines = [];
    lines.push('<h3 lang="de">' + escapeHtml(u.name_de) + '</h3>');
    lines.push('<div><span class="badge badge-' + escapeHtml(u.typ) + '">' + escapeHtml(u.typ) + '</span></div>');
    if (rankings.length) lines.push('<div style="color:#8ec5ff;margin:6px 0;">排名：' + escapeHtml(rankings.join(' · ')) + '</div>');
    if (u.stadt) lines.push('<div>城市：<span lang="de">' + escapeHtml(u.stadt) + '</span></div>');
    if (u.studenten_anzahl) lines.push('<div>学生数：' + u.studenten_anzahl.toLocaleString('de-DE') + '</div>');
    if (u.gruendungsjahr) lines.push('<div>建校：' + u.gruendungsjahr + '</div>');
    if (u.studiengang_count > 0) lines.push('<div>本库收录专业：' + u.studiengang_count + ' 个</div>');
    if (u.website) lines.push('<div><a href="' + escapeHtml(u.website) + '" target="_blank" rel="noopener">官网 <span aria-hidden="true">↗</span></a></div>');
    return lines.join('');
}

// ---- Filter ----
function uniMatchesUniFilters(u) {
    if (state.typ && u.typ !== state.typ) return false;
    if (state.onlyTU9 && u.tu9 !== 1) return false;
    if (state.onlyExz && u.exzellenz !== 1) return false;
    if (state.onlyU15 && u.u15 !== 1) return false;
    if (state.onlyRanked && u.qs_2025 == null) return false;
    if (state.qsMax != null && !(u.qs_2025 != null && u.qs_2025 <= state.qsMax)) return false;
    return true;
}

function filterPrograms() {
    const q = state.q.toLowerCase();
    return PROGRAMS.filter(p => {
        const u = UNI_BY_ID.get(p.hochschule_id);
        if (!u || !uniMatchesUniFilters(u)) return false;
        if (state.fach && (p.fach || 'unknown') !== state.fach) return false;
        if (state.stufe && stufeKey(p) !== state.stufe) return false;
        if (state.lang && langKey(p) !== state.lang) return false;
        if (state.fee && feeBand(p) !== state.fee) return false;
        if (state.zul && (p.zulassungsart || 'unknown') !== state.zul) return false;
        if (state.dl && deadlineStatus(p) !== state.dl) return false;
        if (q) {
            const hay = [p.name_de, p.variante, u.name_de, u.name_kurz, u.stadt]
                .filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

function filterUnis() {
    return UNIS.filter(u => {
        if (state.hideSubunits && isSubunit(u)) return false;
        if (!uniMatchesUniFilters(u)) return false;
        if (state.q) {
            const q = state.q.toLowerCase();
            const hay = [u.name_de, u.name_en, u.name_kurz, u.stadt].filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

const DL_ORDER = { open: 0, unknown: 1, closed: 2 };

function sortPrograms(list) {
    const byName = (a, b) => a.name_de.localeCompare(b.name_de, 'de');
    return list.sort((a, b) => {
        switch (state.progSort) {
            case 'name': return byName(a, b);
            case 'uni': {
                const ua = UNI_BY_ID.get(a.hochschule_id).name_de;
                const ub = UNI_BY_ID.get(b.hochschule_id).name_de;
                return ua.localeCompare(ub, 'de') || byName(a, b);
            }
            case 'fee': {
                const fa = a.studiengebuehr_non_eu ?? Number.MAX_SAFE_INTEGER;
                const fb = b.studiengebuehr_non_eu ?? Number.MAX_SAFE_INTEGER;
                return fa - fb || byName(a, b);
            }
            default:
                return DL_ORDER[deadlineStatus(a)] - DL_ORDER[deadlineStatus(b)] || byName(a, b);
        }
    });
}

function sortUnis(list) {
    return list.sort((a, b) => {
        switch (state.uniSort) {
            case 'qs': return (a.qs_2025 ?? 99999) - (b.qs_2025 ?? 99999);
            case 'name': return a.name_de.localeCompare(b.name_de, 'de');
            case 'students': return (b.studenten_anzahl ?? 0) - (a.studenten_anzahl ?? 0);
            case 'city': return (a.stadt ?? 'zzz').localeCompare(b.stadt ?? 'zzz', 'de');
            default:
                return (b.studiengang_count - a.studiengang_count)
                    || (b.zulassung_count - a.zulassung_count)
                    || a.name_de.localeCompare(b.name_de, 'de');
        }
    });
}

// ---- Render ----
let lastUniList = [];

function programRowHtml(p) {
    const u = UNI_BY_ID.get(p.hochschule_id);
    const st = stufeKey(p);
    const dl = deadlineStatus(p);
    const fb = feeBand(p);
    const isOpen = openPrograms.has(p.id);

    const pills = [];
    pills.push('<span class="pill pill-stufe-' + (STUFE_LABEL[st] ? st : 'none') + '">' + STUFE_LABEL[st] + '</span>');
    const lk = langKey(p);
    const langClass = lk === 'en' ? 'pill-lang-en' : lk === 'de' ? 'pill-lang-de' : lk === 'de/en' ? 'pill-lang-mix' : 'pill-fee-unknown';
    pills.push('<span class="pill ' + langClass + '">' + LANG_LABEL[lk] + '</span>');
    const feeClass = fb === 'free' ? 'pill-fee-free' : fb === 'unknown' ? 'pill-fee-unknown' : 'pill-fee-paid';
    const feeText = p.studiengebuehr_non_eu != null
        ? p.studiengebuehr_non_eu.toLocaleString('de-DE') + ' €/学期'
        : FEE_LABEL.unknown;
    pills.push('<span class="pill ' + feeClass + '">' + feeText + '</span>');
    pills.push('<span class="pill dl-' + dl + '">' + DL_LABEL[dl] + '</span>');

    // "Management (am Campus Heilbronn) · Campus Heilbronn" — Varianten-Teile, die
    // schon im Namen stehen, weglassen statt doppelt anzeigen.
    const vParts = (p.variante || '').split(' · ')
        .filter(v => v && !p.name_de.toLowerCase().includes(v.toLowerCase()));
    const variante = vParts.length
        ? ' <span class="prog-variante" lang="de">· ' + escapeHtml(vParts.join(' · ')) + '</span>'
        : '';
    const uniLabel = u.name_kurz || u.name_de;

    return '<button type="button" class="prog-row" data-id="' + p.id + '"' +
        ' aria-expanded="' + isOpen + '" aria-controls="detail-' + p.id + '">' +
        '<div class="prog-name"><span lang="de">' + escapeHtml(p.name_de) + '</span>' + variante + '</div>' +
        '<div class="prog-meta">' +
            '<span class="uni-name" lang="de">' + escapeHtml(uniLabel) + '</span>' +
            (u.stadt ? '<span lang="de">' + escapeHtml(u.stadt) + '</span>' : '') +
            pills.join('') +
        '</div>' +
    '</button>' +
    '<div class="prog-detail" id="detail-' + p.id + '"' + (isOpen ? '' : ' hidden') + '>' +
        (isOpen ? programDetailHtml(p, u) : '') +
    '</div>';
}

function programDetailHtml(p, u) {
    const facts = [];
    const lk = langKey(p);
    if (lk !== 'unknown') facts.push(['授课语言', LANG_LABEL[lk]]);
    if (p.regelstudienzeit) facts.push(['学制', p.regelstudienzeit + ' 学期']);
    if (p.ects) facts.push(['ECTS', String(p.ects)]);
    facts.push(['学费（非欧盟）', p.studiengebuehr_non_eu != null
        ? p.studiengebuehr_non_eu.toLocaleString('de-DE') + ' € / 学期'
        : '<span class="unknown-val">未知（学校官网未爬取到）</span>']);
    if (p.zulassungsart) {
        facts.push(['录取方式', escapeHtml(ZUL_LABEL[p.zulassungsart] || p.zulassungsart) +
            (p.eignungsverfahren ? '<span class="eig-warn">需要 Eignung</span>' : '')]);
    }
    if (p.deadline_ws) {
        const open = windowOpen(p.deadline_ws_start, p.deadline_ws_end);
        facts.push(['冬季学期申请', '<span lang="de">' + escapeHtml(p.deadline_ws) + '</span> ' +
            '<span class="pill dl-' + (open ? 'open' : 'closed') + '">' + (open ? '开放中' : '已关闭') + '</span>']);
    }
    if (p.deadline_ss) {
        const open = windowOpen(p.deadline_ss_start, p.deadline_ss_end);
        facts.push(['夏季学期申请', '<span lang="de">' + escapeHtml(p.deadline_ss) + '</span> ' +
            '<span class="pill dl-' + (open ? 'open' : 'closed') + '">' + (open ? '开放中' : '已关闭') + '</span>']);
    }
    if (!p.deadline_ws && !p.deadline_ss) {
        facts.push(['申请截止日期', '<span class="unknown-val">未爬取 — 请查学校官网</span>']);
    }
    if (p.sprachnachweis_details) {
        const t = p.sprachnachweis_details;
        facts.push(['语言证书', '<span lang="de">' + escapeHtml(t.slice(0, 260)) + (t.length > 260 ? '…' : '') + '</span>']);
    }
    facts.push(['学校', '<span lang="de">' + escapeHtml(u.name_de) + '</span>' +
        (u.qs_2025 ? ' <span class="qs-rank">QS #' + u.qs_2025 + '</span>' : '')]);

    const ctas = [];
    if (p.url) ctas.push('<a class="cta cta-secondary" href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener">专业介绍 <span aria-hidden="true">↗</span></a>');
    if (p.bewerbungs_url) ctas.push('<a class="cta" href="' + escapeHtml(p.bewerbungs_url) + '" target="_blank" rel="noopener">去申请 <span aria-hidden="true">↗</span></a>');
    if (!p.url && u.website) ctas.push('<a class="cta cta-secondary" href="' + escapeHtml(u.website) + '" target="_blank" rel="noopener">学校官网 <span aria-hidden="true">↗</span></a>');

    return '<div class="fact-grid">' +
        facts.map(([k, v]) => '<span class="fact-label">' + k + '</span><span class="fact-value">' + v + '</span>').join('') +
        '</div>' +
        (ctas.length ? '<div class="cta-row">' + ctas.join('') + '</div>' : '');
}

function uniRowHtml(u) {
    const labels = [];
    if (u.tu9) labels.push('<span class="label label-tu9">TU9</span>');
    if (u.exzellenz) labels.push('<span class="label label-exz">精英</span>');
    if (u.u15 && !u.exzellenz && !u.tu9) labels.push('<span class="label label-u15">U15</span>');

    const hasData = u.studiengang_count > 0;
    const dataTag = hasData
        ? '<span class="pill pill-fee-free">' + u.studiengang_count + ' 个专业' +
          (u.zulassung_count > 0 ? ' · ' + u.zulassung_count + ' 有截止日期' : ' · 无截止日期数据') + '</span>'
        : '<span class="no-data-tag">专业数据待爬取</span>';

    const meta = [
        '<span class="badge badge-' + escapeHtml(u.typ) + '">' + escapeHtml(u.typ) + '</span>',
        u.stadt ? '<span lang="de">' + escapeHtml(u.stadt) + '</span>' : '<span class="unknown-val">城市未知</span>',
        u.qs_2025 ? '<span class="qs-rank">QS #' + u.qs_2025 + '</span>' : '',
        u.studenten_anzahl ? '<span>' + u.studenten_anzahl.toLocaleString('de-DE') + ' 学生</span>' : '',
        u.latitude == null ? '<span class="unknown-val">无坐标</span>' : '',
        dataTag,
    ].filter(Boolean).join('');

    const tag = hasData ? 'button' : 'div';
    const attrs = hasData ? ' type="button" data-uni-id="' + u.id + '"' : '';
    return '<' + tag + ' class="uni-row' + (hasData ? '' : ' no-data') + '"' + attrs + '>' +
        '<div class="name"><span lang="de">' + escapeHtml(u.name_de) + '</span> ' + labels.join('') + '</div>' +
        '<div class="meta">' + meta + '</div>' +
    '</' + tag + '>';
}

function render() {
    const progs = sortPrograms(filterPrograms());
    const unis = sortUnis(filterUnis());
    lastUniList = unis;

    const unisInResults = new Set(progs.map(p => p.hochschule_id));
    document.getElementById('statPrograms').textContent = progs.length;
    document.getElementById('statUnisShown').textContent = unisInResults.size;
    document.getElementById('progCount').textContent = progs.length + ' / ' + STATS.programsTotal + ' 个专业';
    document.getElementById('uniCount').textContent = unis.length + ' / ' + STATS.unisTotal + ' 所学校';
    document.getElementById('subunitCount').textContent =
        '(' + (STATS.unisTotal - STATS.unisReal) + ' 条，已排除有排名的学校)';
    document.getElementById('mapCount').textContent = unis.filter(u => u.latitude != null).length;

    const progList = document.getElementById('progList');
    progList.innerHTML = progs.length
        ? progs.map(programRowHtml).join('')
        : '<div class="empty-state"><b>没有匹配的专业</b>' + emptyHint() + '</div>';

    const uniList = document.getElementById('uniList');
    uniList.innerHTML = unis.length
        ? unis.map(uniRowHtml).join('')
        : '<div class="empty-state"><b>没有匹配的学校</b>换个筛选条件试试。</div>';

    if (markerLayer) renderMarkers(unis);
}

function emptyHint() {
    // Bei Programm-Filtern ist "keine Treffer" meist eine Abdeckungslücke,
    // keine Aussage über das deutsche Hochschulsystem.
    const active = [];
    if (state.stufe) active.push(STUFE_LABEL[state.stufe]);
    if (state.lang) active.push(LANG_LABEL[state.lang]);
    if (state.fee) active.push(FEE_LABEL[state.fee]);
    if (state.zul) active.push(ZUL_LABEL[state.zul]);
    if (state.dl) active.push(DL_LABEL[state.dl]);
    const filterPart = active.length ? '当前条件：' + active.join(' + ') + '。<br>' : '';
    return filterPart +
        '注意：本库只有 ' + STATS.unisWithPrograms + ' 所学校有专业数据，' +
        STATS.unisWithZulassung + ' 所有截止日期。<br>' +
        '"没有结果" 更可能是数据没爬到，而不是德国没有这样的专业。';
}

// ---- Chips ----
function buildChips(containerId, items, stateKey) {
    const el = document.getElementById(containerId);
    el.innerHTML = items.map(it =>
        '<button type="button" class="chip" data-val="' + escapeHtml(it.key) + '" aria-pressed="false">' +
        escapeHtml(it.label) + (it.count != null ? ' (' + it.count + ')' : '') + '</button>'
    ).join('');
    el.addEventListener('click', e => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        const val = btn.dataset.val;
        const wasActive = state[stateKey] === val;
        state[stateKey] = wasActive ? null : val;
        for (const b of el.querySelectorAll('.chip')) {
            b.setAttribute('aria-pressed', String(!wasActive && b === btn));
        }
        render();
    });
}

function countBy(fn, keys) {
    const c = {};
    for (const p of PROGRAMS) { const k = fn(p); c[k] = (c[k] || 0) + 1; }
    return keys.filter(k => c[k]).map(k => ({ key: k, count: c[k] }));
}

buildChips('fachChips',
    countBy(p => p.fach || 'unknown', FACH_ORDER)
        .map(x => ({ ...x, label: FACH_LABEL[x.key] })),
    'fach');

buildChips('stufeChips',
    countBy(stufeKey, ['Bachelor', 'Master', 'PhD', 'Staatsexamen', 'Diplom', 'Zertifikat', 'unknown'])
        .map(x => ({ ...x, label: STUFE_LABEL[x.key] })),
    'stufe');

buildChips('langChips',
    countBy(langKey, ['en', 'de/en', 'de', 'unknown'])
        .map(x => ({ ...x, label: LANG_LABEL[x.key] })),
    'lang');

buildChips('feeChips',
    countBy(feeBand, ['free', 'low', 'mid', 'high', 'unknown'])
        .map(x => ({ ...x, label: FEE_LABEL[x.key] })),
    'fee');

buildChips('zulChips',
    countBy(p => p.zulassungsart || 'unknown', ['zulassungsfrei', 'NC', 'Eignung', 'Portfolio', 'Test', 'Sonstige', 'unknown'])
        .map(x => ({ ...x, label: ZUL_LABEL[x.key] })),
    'zul');

buildChips('dlChips',
    countBy(deadlineStatus, ['open', 'closed', 'unknown'])
        .map(x => ({ ...x, label: DL_LABEL[x.key] })),
    'dl');

{
    const typCounts = {};
    for (const u of UNIS) if (!isSubunit(u)) typCounts[u.typ] = (typCounts[u.typ] || 0) + 1;
    buildChips('typChips',
        ['Universität', 'TU', 'FH', 'HAW', 'Musik', 'Kunst', 'PH', 'Sonstige']
            .filter(t => typCounts[t])
            .map(t => ({ key: t, label: t, count: typCounts[t] })),
        'typ');
}

// ---- Programm-Zeilen: ein delegierter Listener statt einer pro Zeile ----
document.getElementById('progList').addEventListener('click', e => {
    const btn = e.target.closest('.prog-row');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const detail = document.getElementById('detail-' + id);
    const nowOpen = !openPrograms.has(id);
    if (nowOpen) {
        openPrograms.add(id);
        const p = PROGRAMS.find(x => x.id === id);
        detail.innerHTML = programDetailHtml(p, UNI_BY_ID.get(p.hochschule_id));
    } else {
        openPrograms.delete(id);
        detail.innerHTML = '';
    }
    detail.hidden = !nowOpen;
    btn.setAttribute('aria-expanded', String(nowOpen));
});

// Uni-Zeile → auf diese Uni gefilterte Programmliste
document.getElementById('uniList').addEventListener('click', e => {
    const btn = e.target.closest('.uni-row[data-uni-id]');
    if (!btn) return;
    const u = UNI_BY_ID.get(Number(btn.dataset.uniId));
    document.getElementById('q').value = u.name_kurz || u.name_de;
    state.q = u.name_kurz || u.name_de;
    switchView('programs');
    render();
    document.getElementById('progCount').focus?.();
});

// ---- Tabs ----
function switchView(view) {
    state.view = view;
    const isProg = view === 'programs';
    document.getElementById('programPanel').hidden = !isProg;
    document.getElementById('uniPanel').hidden = isProg;
    document.getElementById('tabPrograms').setAttribute('aria-selected', String(isProg));
    document.getElementById('tabUnis').setAttribute('aria-selected', String(!isProg));
}
document.getElementById('tabPrograms').addEventListener('click', () => switchView('programs'));
document.getElementById('tabUnis').addEventListener('click', () => switchView('unis'));

// ---- Suche mit Debounce ----
// Ohne Debounce kostet jeder Tastendruck ~100 ms, weil das Layout der Liste
// dominiert (nicht Filtern oder innerHTML).
let searchTimer;
document.getElementById('q').addEventListener('input', e => {
    const v = e.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = v; render(); }, 150);
});

// ---- Checkboxen ----
for (const id of ['onlyTU9', 'onlyExz', 'onlyU15', 'onlyRanked']) {
    document.getElementById(id).addEventListener('change', e => {
        state[id] = e.target.checked;
        render();
    });
}
document.getElementById('hideSubunits').addEventListener('change', e => {
    state.hideSubunits = e.target.checked;
    render();
});

// QS-Eingabe: parseInt('1e3') ergibt 1 und filtert dann alles weg. Deshalb
// nur akzeptieren, was vollständig eine Ganzzahl im erlaubten Bereich ist.
const qsInput = document.getElementById('qsMax');
const qsErr = document.getElementById('qsMaxErr');
qsInput.addEventListener('input', e => {
    const raw = e.target.value.trim();
    if (raw === '') {
        state.qsMax = null; qsErr.textContent = '';
    } else if (!/^\d+$/.test(raw)) {
        state.qsMax = null; qsErr.textContent = '只能填整数，已忽略。';
    } else {
        const v = Number(raw);
        if (v < 1 || v > 1500) {
            state.qsMax = null; qsErr.textContent = '范围 1–1500，已忽略。';
        } else {
            state.qsMax = v; qsErr.textContent = '';
        }
    }
    render();
});

document.getElementById('progSort').addEventListener('change', e => { state.progSort = e.target.value; render(); });
document.getElementById('uniSort').addEventListener('change', e => { state.uniSort = e.target.value; render(); });


// ---- Reset ----
document.getElementById('reset').addEventListener('click', () => {
    Object.assign(state, {
        q: '', fach: null, stufe: null, lang: null, fee: null, zul: null, dl: null, typ: null,
        onlyTU9: false, onlyExz: false, onlyU15: false, onlyRanked: false, qsMax: null,
        progSort: 'deadline', uniSort: 'programs', hideSubunits: true,
    });
    openPrograms.clear();
    document.getElementById('q').value = '';
    for (const id of ['onlyTU9', 'onlyExz', 'onlyU15', 'onlyRanked']) {
        document.getElementById(id).checked = false;
    }
    document.getElementById('hideSubunits').checked = true;
    qsInput.value = '';
    qsErr.textContent = '';
    document.getElementById('progSort').value = 'deadline';
    document.getElementById('uniSort').value = 'programs';
    for (const chip of document.querySelectorAll('.chip')) chip.setAttribute('aria-pressed', 'false');
    switchView('programs');
    render();
});

document.getElementById('todayLabel').textContent = TODAY.replace('-', '月') + '日';
render();
// Nach render(), weil initMap die gefilterte Liste aus lastUniList zeichnet.
initMap();
`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>德国大学申请数据库 · DT-Uni-App</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
      crossorigin=""/>
<style>${CSS}</style>
</head>
<body>
${HTML_BODY}

<script>
window.__UNIS__ = ${embedJson(unis)};
window.__PROGRAMS__ = ${embedJson(programs)};
window.__STATS__ = ${embedJson(stats)};
</script>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
        crossorigin=""></script>

<script>
${APP_JS}
</script>

</body>
</html>`;

writeFileSync(OUT, html, 'utf8');
console.log(`Fertig: ${OUT}`);
console.log(`Datei-Größe: ${(html.length / 1024).toFixed(1)} KB`);

db.close();
