# dt-uni-app

工具目标：让中国学生（和其他国际学生）不用中介，也能高效申请任何德国大学、任何专业。

## Warum

传统中介收 5 位数人民币，做的很多事情本质是**数据整合 + 流程模板化**。这个项目把这两件事自动化。

## Aktueller Stand (MVP)

- SQLite 本地数据库，schema 从"申请流程"倒推设计（不是学校目录）
- 数据源：Wikidata SPARQL（覆盖全德高校 + 坐标）
- Multi-User schema 已就位，MVP 阶段只填学校层

## Struktur

```
docs/          Projektdokumentation und Statusberichte
sql/           SQL migrations (001_schema.sql = 骨架)
scripts/       Node ETL-, Scraper- und Diagnose-Skripte
data/          Aktuelle SQLite-Datenbank
data/backups/  Historische Datenbank- und Viewer-Stände
data/raw/      Rohdaten-Snapshots der Importe
viewer.html    Generierte Offline-Anwendung
```

## Setup

```bash
npm install
npm run init-db          # legt data/dt-uni.db an
npm run ingest:wikidata  # zieht ~400 Unis
npm run report           # zeigt was drin ist
```

## Datenquellen — Priorität

1. **Wikidata** (SPARQL) — Kernidentität + Koordinaten. Reproduzierbar, versioniert.
2. **HRK Hochschulkompass** (später) — offizielle Studiengang-Liste (~21k)
3. **DAAD** (später) — internationale Bewerbungsinfos
4. **Uni-Websites** (später, gezielt) — Zulassungsanforderungen verifizieren

## Roadmap

- [x] MVP: Hochschulen + Koordinaten aus Wikidata
- [ ] Studiengänge aus HRK ziehen
- [ ] APS/uni-assist Flags manuell/scripted
- [ ] Kartenansicht (Leaflet)
- [ ] Nutzer-Konto + persönliche Bewerbungsverfolgung
- [ ] Materialgenerator (Lebenslauf, Motivation-Templates)
