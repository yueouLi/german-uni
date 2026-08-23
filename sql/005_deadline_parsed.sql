-- deadline_ws/deadline_ss sind Anzeige-Strings ("01.04. – 31.05.", "15.05 - 15.07.")
-- mit uneinheitlichem Trenner und ohne Jahr. Damit ist "kann ich noch bewerben?"
-- nicht beantwortbar — genau die Frage, für die das Tool existiert.
--
-- Geparst als MM-DD, jahrlos, weil die Fristen jährlich wiederkehren.
-- SS-Fenster laufen über den Jahreswechsel (01.10. – 15.01.), daher braucht
-- der Vergleich eine Wrap-Behandlung, nicht nur start <= heute <= end.

ALTER TABLE zulassung ADD COLUMN deadline_ws_start TEXT;   -- 'MM-DD'
ALTER TABLE zulassung ADD COLUMN deadline_ws_end   TEXT;   -- 'MM-DD'
ALTER TABLE zulassung ADD COLUMN deadline_ss_start TEXT;
ALTER TABLE zulassung ADD COLUMN deadline_ss_end   TEXT;
