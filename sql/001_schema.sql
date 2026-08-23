-- =============================================================
-- DT-Uni-App Datenbank Schema
-- Zweck: Bewerbungstool für deutsche Unis (ersetzt Agenturen)
-- =============================================================
--
-- Design-Prinzipien:
--   1. Bewerbungsorientiert, nicht katalogorientiert
--   2. Multi-User-ready ab Tag 1 (users + bewerbung tables)
--   3. Trennung: Fakten (uni, studiengang) vs. Anforderungen (zulassung)
--   4. Chinesische Bewerber-spezifika: APS, uni-assist, TestDaF
--
-- Konvention:
--   - snake_case Tabellen und Spalten
--   - Alle IDs: INTEGER PRIMARY KEY AUTOINCREMENT
--   - Zeitstempel: TEXT ISO-8601 (SQLite has no native DATETIME)
--   - Bool: INTEGER 0/1
-- =============================================================

PRAGMA foreign_keys = ON;

-- -------------------------------------------------------------
-- KERN: Hochschulen
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hochschule (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Identität
    name_de             TEXT NOT NULL,
    name_kurz           TEXT,                       -- "TUM", "LMU", "RWTH"
    name_en             TEXT,
    wikidata_qid        TEXT UNIQUE,                -- Q158744 = TUM
    hrk_id              TEXT UNIQUE,                -- HRK Hochschulkompass id
    website             TEXT,

    -- Geografie (nullable — Wikidata MVP hat nicht immer beides)
    stadt               TEXT,
    bundesland          TEXT,
    latitude            REAL,
    longitude           REAL,

    -- Klassifikation
    typ                 TEXT CHECK(typ IN (
                            'Universität','TU','FH','HAW','Kunst','Musik','PH','Sonstige'
                        )),
    traegerschaft       TEXT CHECK(traegerschaft IN (
                            'staatlich','privat','kirchlich'
                        )),
    gruendungsjahr      INTEGER,

    -- Bewerber-Kontext
    uni_assist          INTEGER DEFAULT 0,          -- 1 = geht über uni-assist
    semesterbeitrag     INTEGER,                    -- EUR pro Semester
    studenten_anzahl    INTEGER,

    -- Meta
    quelle              TEXT,                       -- 'wikidata', 'hrk', 'manual'
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hs_stadt      ON hochschule(stadt);
CREATE INDEX IF NOT EXISTS idx_hs_bundesland ON hochschule(bundesland);
CREATE INDEX IF NOT EXISTS idx_hs_typ        ON hochschule(typ);

-- -------------------------------------------------------------
-- Studiengänge
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS studiengang (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    hochschule_id       INTEGER NOT NULL REFERENCES hochschule(id) ON DELETE CASCADE,

    name_de             TEXT NOT NULL,
    name_en             TEXT,
    abschluss           TEXT CHECK(abschluss IN (
                            'Bachelor','Master','Staatsexamen','Lehramt',
                            'Diplom','PhD','Magister','Zertifikat','Sonstige'
                        )),
    fachbereich         TEXT,                       -- "Informatik", "BWL"
    fachrichtung        TEXT,                       -- "AI", "Data Science" (feiner)

    -- Format
    sprache             TEXT,                       -- 'de', 'en', 'de/en'
    regelstudienzeit    INTEGER,                    -- Semester
    ects                INTEGER,
    vollzeit            INTEGER DEFAULT 1,

    -- Start
    start_ws            INTEGER DEFAULT 1,          -- Wintersemester möglich
    start_ss            INTEGER DEFAULT 0,          -- Sommersemester möglich

    -- Kosten (zusätzlich zu Semesterbeitrag)
    studiengebuehr      INTEGER DEFAULT 0,          -- EUR pro Semester

    beschreibung        TEXT,
    url                 TEXT,

    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sg_hs          ON studiengang(hochschule_id);
CREATE INDEX IF NOT EXISTS idx_sg_abschluss   ON studiengang(abschluss);
CREATE INDEX IF NOT EXISTS idx_sg_sprache     ON studiengang(sprache);
CREATE INDEX IF NOT EXISTS idx_sg_fachbereich ON studiengang(fachbereich);

-- -------------------------------------------------------------
-- Zulassungsanforderungen (1:1 mit Studiengang, aber optional)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zulassung (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    studiengang_id      INTEGER NOT NULL UNIQUE REFERENCES studiengang(id) ON DELETE CASCADE,

    -- NC / Auswahl
    nc                  REAL,                       -- Numerus Clausus (letzte Runde)
    zulassungsart       TEXT CHECK(zulassungsart IN (
                            'zulassungsfrei','NC','Eignung','Portfolio','Test','Sonstige'
                        )),

    -- Sprachnachweise (nur Werte falls erforderlich)
    testdaf_min         INTEGER,                    -- z.B. 4 (TDN 4)
    dsh_min             INTEGER,                    -- z.B. 2 (DSH-2)
    ielts_min           REAL,
    toefl_min           INTEGER,
    goethe_c1           INTEGER DEFAULT 0,          -- akzeptiert ja/nein

    -- Deutschland-Spezifika
    aps_erforderlich    INTEGER DEFAULT 0,          -- Chinesen: fast immer 1
    gre_erforderlich    INTEGER DEFAULT 0,
    gmat_erforderlich   INTEGER DEFAULT 0,
    motivationsschreiben INTEGER DEFAULT 0,
    empfehlungsschreiben_anzahl INTEGER DEFAULT 0,
    portfolio_erforderlich INTEGER DEFAULT 0,

    -- Deadlines (Text, weil sich Format je Uni unterscheidet)
    deadline_ws         TEXT,                       -- "15.07." oder "2026-07-15"
    deadline_ss         TEXT,

    hinweise            TEXT,                       -- Freitext für Sonderfälle
    quelle_url          TEXT,                       -- wo verifiziert
    verifiziert_am      TEXT,

    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
);

-- -------------------------------------------------------------
-- Bewerbungsmaterialien (M:N — welche Doks braucht welcher Studiengang)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dokument_typ (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    code                TEXT NOT NULL UNIQUE,       -- 'CV', 'MOT', 'APS', 'BA_ZEUGNIS'
    name_de             TEXT NOT NULL,
    name_zh             TEXT,
    beschreibung        TEXT
);

CREATE TABLE IF NOT EXISTS studiengang_dokument (
    studiengang_id      INTEGER NOT NULL REFERENCES studiengang(id) ON DELETE CASCADE,
    dokument_typ_id     INTEGER NOT NULL REFERENCES dokument_typ(id),
    pflicht             INTEGER DEFAULT 1,
    hinweis             TEXT,
    PRIMARY KEY (studiengang_id, dokument_typ_id)
);

-- -------------------------------------------------------------
-- Multi-User: Nutzer und ihre Bewerbungen
-- (leer im MVP, aber Schema steht)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nutzer (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    email               TEXT UNIQUE,
    name                TEXT,
    heimatuni           TEXT,
    aps_bestanden       INTEGER DEFAULT 0,
    aps_note            REAL,
    bachelor_note       REAL,
    testdaf             INTEGER,
    ielts               REAL,
    created_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bewerbung (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    nutzer_id           INTEGER NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
    studiengang_id      INTEGER NOT NULL REFERENCES studiengang(id),
    status              TEXT DEFAULT 'geplant' CHECK(status IN (
                            'geplant','vorbereitung','eingereicht',
                            'zugesagt','abgesagt','abgebrochen'
                        )),
    semester            TEXT,                       -- 'WS2027' etc.
    deadline            TEXT,
    notizen             TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now')),
    UNIQUE(nutzer_id, studiengang_id, semester)
);

-- -------------------------------------------------------------
-- Sync-Log: Rohdaten Provenienz
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_run (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    quelle              TEXT NOT NULL,              -- 'wikidata', 'hrk', 'daad'
    started_at          TEXT NOT NULL,
    finished_at         TEXT,
    rows_inserted       INTEGER DEFAULT 0,
    rows_updated        INTEGER DEFAULT 0,
    rows_skipped        INTEGER DEFAULT 0,
    status              TEXT,                       -- 'ok', 'error', 'partial'
    fehler              TEXT
);
