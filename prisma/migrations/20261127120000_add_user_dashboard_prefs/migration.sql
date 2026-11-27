-- Preference Přehledu u uživatele (#681, spec #677). Aditivní: nullable sloupec bez backfillu,
-- existující uživatelé mají NULL = výchozí Přehled.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "dashboard_prefs" JSONB;
