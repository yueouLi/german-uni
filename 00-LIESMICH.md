# dt-uni-app - Gesamtpaket

Gepackt am 2026-08-21. Enthaelt alles, was zum Projekt existiert:
Code, Daten, Historie und die Hintergrund-Dokumentation.

## Was ist wo

| Pfad | Inhalt |
|---|---|
| `doku/01-PROJEKT-KONTEXT.md` | Hintergrund: warum das Projekt, Stand, Technikentscheidungen, offene Risiken, naechste Schritte |
| `doku/02-DB-STATUS-2026-08-21.md` | Ist-Zustand der Datenbank, aus der DB ausgelesen - Zeilen pro Tabelle, Abdeckung, Schema |
| `doku/03-GERETTET-Arbeitstagebuch-2026-08-18.md` | Der Tagebuchabschnitt, der im Vault nur noch in einer BACKUP-Datei steht |
| `doku/04-memory-project_dt_uni_app.md` | Was Claude Code sich dauerhaft zum Projekt gemerkt hat |
| `projekt/` | Vollstaendige Projektkopie ohne `node_modules` |

## Projektstruktur

| Pfad | Inhalt |
|---|---|
| `projekt/sql/` | 5 Migrationen, `001_schema.sql` ist das Grundgeruest |
| `projekt/scripts/` | Node-ETL: Wikidata-Ingest, DAAD-Scraper, LMU-/TUM-Detailscraper, `build-html.mjs` |
| `projekt/data/dt-uni.db` | Aktuelle SQLite-Datenbank |
| `projekt/data/*.BACKUP-*` | 6 DB-Staende - das Projekt hat kein Git, das ist die gesamte Historie |
| `projekt/data/raw/` | Wikidata-SPARQL-Rohantwort als Snapshot |
| `projekt/viewer.html` | Das Produkt: Leaflet-Karte, Einzeldatei. **Nie direkt bearbeiten** - wird aus `scripts/build-html.mjs` erzeugt |

## Wieder zum Laufen bringen

```bash
cd projekt
npm install          # holt Playwright zurueck, ~18 MB
node scripts/report.mjs
```

Firmen-SSL braucht `NODE_EXTRA_CA_CERTS` auf das Zertifikatsbundle - der
Pfad steht in `doku/01-PROJEKT-KONTEXT.md`. Das Bundle selbst liegt eine
Ebene oberhalb des Projektordners und ist **nicht** im Paket.

## Was absichtlich fehlt

- `node_modules/` - 18 MB Playwright, kommt mit `npm install` zurueck
- `corporate-ca-bundle.pem` - liegt ausserhalb des Projekts, enthaelt
  Firmenzertifikate und gehoert nicht in ein Paket, das das Haus verlaesst
