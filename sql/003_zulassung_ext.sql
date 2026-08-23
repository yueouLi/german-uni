-- Erweiterung: zulassung-Tabelle ist schon da, aber wir brauchen noch:
-- - deutlichere Felder für "wie bewerben"
-- - Speicherung der Bewerbungs-URL
-- - Studiengebühr für Nicht-EU
-- - Studienstart-Info

-- Prüfe existierende Spalten und fügt fehlende hinzu.
-- SQLite: ALTER TABLE ADD COLUMN — einzeln.

ALTER TABLE studiengang ADD COLUMN studiengebuehr_non_eu INTEGER;      -- EUR/Semester Nicht-EU
ALTER TABLE zulassung   ADD COLUMN bewerbungs_url        TEXT;         -- Direkter Link zur Bewerbung
ALTER TABLE zulassung   ADD COLUMN eignungsverfahren     INTEGER DEFAULT 0;   -- 1 = Eignungsverfahren nötig
ALTER TABLE zulassung   ADD COLUMN erforderliche_dokumente TEXT;       -- newline-separated list
ALTER TABLE zulassung   ADD COLUMN sprachnachweis_details TEXT;        -- Freitext
