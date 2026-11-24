-- Verze tokenu pro zneplatnění přihlášení (#471, spec #470). Aditivní: sloupec s defaultem,
-- existující řádky dostanou 0. Zatím ho žádný kód nečte (čtení a zápis přidá #485).
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;
