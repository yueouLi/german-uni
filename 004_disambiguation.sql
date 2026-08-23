-- Zwei Datenprobleme, die im Viewer zu falschen Bewerbungsinfos führen:
--
-- 1. 267 Zeilen sind unter identischem name_de + abschluss versteckt (LMU 260, TUM 7).
--    Die unterscheidende Information steckt nur in der URL:
--    - TUM: master-of-education vs. bachelor-of-education (gleicher Name, andere Frist)
--    - LMU: lehramt-{gymnasium|realschule|...}-{unterrichts|didaktik|erweiterungs}fach
--    Ohne Variante rendert der Viewer zwei Programme als eine Karte und zeigt
--    widersprüchliche Fristen/Gebühren nebeneinander.
--
-- 2. abschluss='Lehramt' verliert die Stufe. Bayerisches Lehramt ist Staatsexamen-
--    artig und hat kein Bachelor/Master, aber TUMs Berufliche Bildung sehr wohl.
--    stufe trennt das, ohne abschluss zu überschreiben.

ALTER TABLE studiengang ADD COLUMN variante TEXT;   -- z.B. "M.Ed.", "Gymnasium · Unterrichtsfach"
ALTER TABLE studiengang ADD COLUMN stufe    TEXT;   -- Bachelor|Master|PhD|Staatsexamen|Diplom|Zertifikat|NULL

CREATE INDEX IF NOT EXISTS idx_sg_stufe ON studiengang(stufe);
