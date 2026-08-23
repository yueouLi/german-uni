# dt-uni-app - Gesamtpaket

Gepackt am 2026-08-21. Enthaelt alles, was zum Projekt existiert:
Code, Daten, Historie und die Hintergrund-Dokumentation.

## Was ist wo

| Pfad | Inhalt |
|---|---|
| `docs/01-PROJEKT-KONTEXT.md` | Hintergrund: warum das Projekt, Stand, Technikentscheidungen, offene Risiken, naechste Schritte |
| `docs/02-DB-STATUS-2026-08-21.md` | Ist-Zustand der Datenbank, aus der DB ausgelesen - Zeilen pro Tabelle, Abdeckung, Schema |
| `docs/03-GERETTET-Arbeitstagebuch-2026-08-18.md` | Der Tagebuchabschnitt, der im Vault nur noch in einer BACKUP-Datei steht |
| `docs/04-memory-project_dt_uni_app.md` | Was Claude Code sich dauerhaft zum Projekt gemerkt hat |

## Projektstruktur

| Pfad | Inhalt |
|---|---|
| `sql/` | 5 Migrationen, `001_schema.sql` ist das Grundgeruest |
| `scripts/` | Node-ETL: Wikidata-Ingest, DAAD-Scraper, LMU-/TUM-Detailscraper, `build-html.mjs` |
| `data/dt-uni.db` | Aktuelle SQLite-Datenbank |
| `data/backups/` | Historische DB- und Viewer-Staende |
| `data/raw/` | Wikidata-SPARQL-Rohantwort als Snapshot |
| `viewer.html` | Das Produkt: Leaflet-Karte, Einzeldatei. **Nie direkt bearbeiten** - wird aus `scripts/build-html.mjs` erzeugt |

## Wieder zum Laufen bringen

```bash
npm install          # holt Playwright zurueck, ~18 MB
node scripts/report.mjs
```

Firmen-SSL braucht `NODE_EXTRA_CA_CERTS` auf das Zertifikatsbundle - der
Pfad steht in `docs/01-PROJEKT-KONTEXT.md`. Das Bundle selbst liegt eine
Ebene oberhalb des Projektordners und ist **nicht** im Paket.

## Was absichtlich fehlt

- `node_modules/` - 18 MB Playwright, kommt mit `npm install` zurueck
- `corporate-ca-bundle.pem` - liegt ausserhalb des Projekts, enthaelt
  Firmenzertifikate und gehoert nicht in ein Paket, das das Haus verlaesst
