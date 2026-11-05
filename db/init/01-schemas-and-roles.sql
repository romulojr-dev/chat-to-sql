-- Olist data lives in its own schema; the app's tables in another
CREATE SCHEMA IF NOT EXISTS olist;
CREATE SCHEMA IF NOT EXISTS app;

-- Read-only role used ONLY for AI-generated queries
CREATE ROLE cts_readonly LOGIN PASSWORD 'readonly_dev_pw';
GRANT CONNECT ON DATABASE chattosql TO cts_readonly;
GRANT USAGE ON SCHEMA olist TO cts_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA olist GRANT SELECT ON TABLES TO cts_readonly;

-- Safety nets enforced by the database itself
ALTER ROLE cts_readonly SET default_transaction_read_only = on;
ALTER ROLE cts_readonly SET statement_timeout = '5s';

