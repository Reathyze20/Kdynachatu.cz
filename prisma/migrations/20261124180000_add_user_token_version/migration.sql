-- Verze tokenu pro zneplatnění přihlášení (#471, spec #470). Aditivní: sloupec s defaultem,
-- existující řádky dostanou 0. Čtení a zápis v kódu přidává #485.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;
