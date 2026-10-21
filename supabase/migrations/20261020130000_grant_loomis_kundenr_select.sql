-- Column-level SELECT on Loomis kundenummer.
-- Already applied in production. This file records that grant so a fresh
-- database matches production. Re-running GRANT SELECT (columns) is safe.

grant select (team1_loomis_kundenr, team2_loomis_kundenr, team3_loomis_kundenr, team4_loomis_kundenr, team5_loomis_kundenr, team6_loomis_kundenr, team7_loomis_kundenr, team8_loomis_kundenr, team9_loomis_kundenr, team10_loomis_kundenr) on public.workplace_settings to anon, authenticated;
