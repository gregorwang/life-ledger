-- Retire the cyber-collectible catalog; the 3D figure showcase was removed.
DROP INDEX IF EXISTS ix_collectible_catalog;
DROP TABLE IF EXISTS collectible_items;
