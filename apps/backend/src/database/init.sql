-- Extensiones requeridas para PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- para búsqueda de texto eficiente
CREATE EXTENSION IF NOT EXISTS "unaccent"; -- para búsqueda sin acentos

-- Configuración de búsqueda de texto en español
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_ts_config WHERE cfgname = 'spanish_unaccent'
  ) THEN
    CREATE TEXT SEARCH CONFIGURATION spanish_unaccent (COPY = spanish);
    ALTER TEXT SEARCH CONFIGURATION spanish_unaccent
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, spanish_stem;
  END IF;
END
$$;
