-- =====================================================================
-- Paket D3 — Ferientage 2026/27 für den Feierabend-Modus
-- STATUS: NICHT AUSGEFÜHRT. Erst nach Prüfung durch Norbert/Sekretariat.
-- Solange die Tabelle leer ist, gibt es keine Ferienruhe (nur Abende +
-- Wochenende). Dringend kommt immer durch.
--
-- Quelle (abgerufen 25.09.2026): https://km.baden-wuerttemberg.de/de/service/ferien
--   Herbst      26.10.–30.10.2026 (31.10. Reformationstag unterrichtsfrei)
--   Weihnachten 23.12.2026–09.01.2027
--   Ostern      laut KM-Seite 30.03.–03.04.2027 — ⚠ Drittseiten nennen
--               25.03.–03.04.2027. BITTE gegen den Schulkalender der KRS prüfen.
--   Pfingsten   18.05.–29.05.2027
--   Sommer 2027 29.07.–11.09.2027 (laut Drittseite, KM-Pressemitteilung
--               „Sommerferientermine bis 2030" prüfen)
-- NICHT enthalten: die 4 beweglichen Ferientage der KRS (legt die Schule fest)
--   und gesetzliche Feiertage außerhalb der Ferien (z. B. 01.11., 01.05.,
--   Christi Himmelfahrt, Fronleichnam). Bei Bedarf unten ergänzen.
-- Idempotent (on conflict do nothing). UNDO ganz unten.
-- =====================================================================

insert into public.school_holidays (day, label)
select d::date, x.label
  from (values
    ('2026-10-26'::date, '2026-10-31'::date, 'Herbstferien'),
    ('2026-12-23',       '2027-01-09',       'Weihnachtsferien'),
    ('2027-03-30',       '2027-04-03',       'Osterferien'),          -- ⚠ prüfen (ggf. ab 25.03.)
    ('2027-05-18',       '2027-05-29',       'Pfingstferien'),
    ('2027-07-29',       '2027-09-11',       'Sommerferien')          -- ⚠ prüfen
  ) as x(von, bis, label)
  cross join lateral generate_series(x.von, x.bis, interval '1 day') as d
on conflict (day) do nothing;

-- Beispiel bewegliche Ferientage / Feiertage (auskommentiert):
-- insert into public.school_holidays(day,label) values
--   ('2026-11-01','Allerheiligen'), ('2027-05-01','Tag der Arbeit')
-- on conflict (day) do nothing;

-- KONTROLLE:
-- select label, min(day), max(day), count(*) from public.school_holidays group by label order by 2;

-- UNDO:
-- delete from public.school_holidays where day between '2026-10-26' and '2027-09-11';
