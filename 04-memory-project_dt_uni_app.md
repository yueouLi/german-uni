---
name: DT-Uni-App — 德国大学申请工具
description: Leonies Nebenprojekt, ein Tool das traditionelle Studienberater/Agenturen ersetzt für Bewerbungen an deutschen Unis
type: project
originSessionId: d2cc881c-035c-4b43-858d-4d9a615ada9d
modified: 2026-08-21T14:35:01.638Z
---
# DT-Uni-App

**Was:** Tool zum schnellen Bewerben an beliebiger deutscher Uni in beliebigem Studienfach — Ziel: die traditionellen chinesischen Bewerbungsagenturen (中介) überflüssig machen.

**Why:** Chinesische Studenten zahlen Agenturen 5-stellige RMB-Beträge für Uni-Bewerbungen, obwohl der Prozess durch bessere Datenaggregation self-service machbar wäre.

**How to apply:**
- Karte ist nur Entry Point — Kernwert ist bewerbungsorientierte Datenbank
- Multi-User-Schema von Anfang an (später Freunde/Community/Produkt)

## Stand: 2026-07-01 (Session 1)

**Location:** `C:\Users\wfxndvg\OneDrive - Allianz\Dokumente\AI-Test\dt-uni-app\`
⚠️ Auf OneDrive Allianz. IP-Risiko wenn kommerzielles Produkt. Später umziehen.

**Tech-Stack (verifiziert):**
- Node.js 25 mit `node:sqlite` (kein npm install nötig, kein Python-Zwang)
- Nicht `better-sqlite3` (braucht Python → geht nicht in Allianz-Env)
- Corporate SSL: `NODE_EXTRA_CA_CERTS=C:\Users\wfxndvg\OneDrive - Allianz\Dokumente\AI-Test\corporate-ca-bundle.pem` (Zscaler+Allianz, 148 certs, exportiert aus Windows Cert Store)

**Was funktioniert:**
- SQLite Schema: `sql/001_schema.sql` — 8 Tabellen (hochschule, studiengang, zulassung, dokument_typ, studiengang_dokument, nutzer, bewerbung, sync_run)
- Wikidata SPARQL Ingest → 1521 Zeilen, alle TU9/Top-Unis mit Koordinaten
- Report-Script funktioniert

**Datenprobleme (bekannt, ungelöst):**
- Wikidata `wdt:P31/wdt:P279* wd:Q38723` zu weit → zieht Subunits (TUM Department X, Fakultäten), historische Institutionen, Militärschulen mit
- Bei Duplikat-Namen matcht LIKE zuerst falsche Subunit statt Hauptentität
- 46% haben Koordinaten (Rest: Subunits ohne)
- **Entschieden:** Doppel-Quelle HRK + Wikidata cross-match als nächster Schritt

**Nächste Session soll:**
1. HRK Hochschulkompass Scraper (~423 kanonische Unis)
2. Fuzzy-Match HRK ↔ Wikidata via Name+Stadt → wikidata_qid dranheften
3. `is_main_entity` Flag → Subunits filtern

## Doku-Ort (2026-08-21 angelegt)

**`PROJEKT-KONTEXT.md` im Projektordner ist die einzige Hintergrund-Doku.**
Bewusst NICHT im Obsidian Vault — der liegt auf Allianz OneDrive, Privatprojekt
gehört nicht rein. README.md deckt nur „wie starten" ab und ist veraltet
(Roadmap-Haken für Leaflet-Karte fehlt, obwohl viewer.html existiert).
Bei neuen Erkenntnissen dort weiterschreiben, nicht im Vault.

## Stand: 2026-08-21 (verifiziert gegen DB und Dateisystem)

**Der HRK-Plan wurde nicht umgesetzt** — stattdessen DAAD-Route gegangen.
`hochschule.hrk_id` existiert als Spalte, ist aber in allen 1521 Zeilen NULL.
Subunit-Verschmutzung aus Wikidata ist damit weiter ungelöst (Koordinaten
705/1521 = 46%, praktisch unverändert seit Juli).

**Datenbestand:** hochschule 1521, studiengang 2436, zulassung 2202, ranking 44.
`nutzer`/`bewerbung`/`dokument_typ` leer — Multi-User-Layer nur Schema.
Studiengänge extrem ungleich: LMU 651, TUM 183, alle anderen ≤ 55. Nur diese
zwei sind tief gescraped.

**Neu gebaut:** `viewer.html` (1.8 MB, Leaflet + chinesisches UI, Dark Theme,
a11y-getestet bis 400% Zoom) — generiert aus `scripts/build-html.mjs` (57 KB).
Viewer nie direkt editieren, immer Generator. Scraper: `scrape-daad-elite.mjs`
(30 KB), `scrape-lmu-details.mjs`, `scrape-tum-details.mjs`. Migrations bis
`005_deadline_parsed.sql`.

**Zwei offene Risiken:**
- **Kein Git.** Nur `.gitignore`, kein `.git`. Versionierung läuft über manuelle
  `.BACKUP-<datum>`-Dateinamen (db 6×, viewer.html 2×).
- **Noch auf OneDrive Allianz.** IP-Risiko seit Juli bekannt, nicht umgezogen.

`package.json` scripts deckt nur init-db/ingest:wikidata/report ab — die fünf
Scraper und build-html müssen per `node scripts/<x>.mjs` gestartet werden.
