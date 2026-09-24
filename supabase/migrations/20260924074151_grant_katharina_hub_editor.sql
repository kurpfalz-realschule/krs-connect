-- Katharina Scharmann erhält dieselben gezielten Hub-Board-Schreibrechte
-- wie Daniel Schmitt. Die globale Benutzerrolle bleibt unverändert.
DO $$
BEGIN
  UPDATE public.users
  SET hub_editor = true
  WHERE kuerzel = 'Sca'
    AND display_name = 'Katharina Scharmann'
    AND hub_editor IS DISTINCT FROM true;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE kuerzel = 'Sca'
      AND display_name = 'Katharina Scharmann'
      AND hub_editor = true
  ) THEN
    RAISE EXCEPTION 'Katharina Scharmann (Kürzel Sca) wurde nicht gefunden';
  END IF;
END
$$;
