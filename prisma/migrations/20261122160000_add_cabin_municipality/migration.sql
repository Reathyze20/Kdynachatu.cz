-- Nejbližší obec chaty z číselníku RÚIAN (#279, ADR-0006). Aditivní: jen nullable sloupce.
-- AlterTable
ALTER TABLE "cabins" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "municipality_code" INTEGER,
ADD COLUMN     "municipality_district" VARCHAR(100),
ADD COLUMN     "municipality_name" VARCHAR(100),
ADD COLUMN     "municipality_region" VARCHAR(100);
