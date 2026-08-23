-- =============================================================
-- Ranking + Statuslabels (TU9, Exzellenzuni)
-- 1:1 mit hochschule — nur ein Ranking-Eintrag pro Hochschule
-- =============================================================

CREATE TABLE IF NOT EXISTS ranking (
    hochschule_id       INTEGER PRIMARY KEY REFERENCES hochschule(id) ON DELETE CASCADE,

    -- Weltrankings (numerisch für Sortierung; NULL = nicht gerankt)
    qs_2025             INTEGER,
    the_2025            INTEGER,
    arwu_2024           INTEGER,

    -- Deutschland-spezifische Labels
    tu9                 INTEGER DEFAULT 0,          -- 1 = TU9-Mitglied
    exzellenz           INTEGER DEFAULT 0,          -- 1 = Exzellenzuniversität 2019-2026
    u15                 INTEGER DEFAULT 0,          -- 1 = U15-Verbund

    -- Meta
    stand               TEXT,                       -- z.B. "QS 2025 / THE 2025 / ARWU 2024"
    hinweis             TEXT,                       -- Sonderfälle (Berlin Alliance etc.)
    updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ranking_qs        ON ranking(qs_2025);
CREATE INDEX IF NOT EXISTS idx_ranking_tu9       ON ranking(tu9);
CREATE INDEX IF NOT EXISTS idx_ranking_exzellenz ON ranking(exzellenz);
