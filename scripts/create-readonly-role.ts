/**
 * Creates (or updates) the `readonly` Postgres role used by the running app,
 * grants SELECT on the dataset tables only, then verifies the role by
 * connecting as it and attempting forbidden operations.
 *
 * Usage: npm run db:role   (run after db:seed; re-run after re-seeding)
 * Requires DATABASE_URL_ADMIN and READONLY_PASSWORD.
 */
import { Pool } from "@neondatabase/serverless";

const ROLE = "readonly";
const DATASET_TABLES = [
  "customers",
  "orders",
  "order_items",
  "order_payments",
  "order_reviews",
  "products",
  "sellers",
  "product_category_name_translation",
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see .env.example)`);
  return v;
}

async function main() {
  const adminUrl = requireEnv("DATABASE_URL_ADMIN");
  const password = requireEnv("READONLY_PASSWORD");
  // DDL cannot take bind parameters, so the password is inlined as a literal.
  // Restricting the charset makes that safe and keeps it URL-safe.
  if (!/^[A-Za-z0-9_-]{16,}$/.test(password)) {
    throw new Error("READONLY_PASSWORD must be 16+ chars of letters, digits, _ or -");
  }

  const admin = new Pool({ connectionString: adminUrl });
  try {
    const exists = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [ROLE]);
    await admin.query(
      `${exists.rowCount ? "ALTER" : "CREATE"} ROLE ${ROLE} LOGIN PASSWORD '${password}'`,
    );

    // Defense in depth: role-level defaults. The app also uses BEGIN READ ONLY
    // and the SQL validator rejects SET, so these are a third layer.
    await admin.query(`ALTER ROLE ${ROLE} SET default_transaction_read_only = on`);
    await admin.query(`ALTER ROLE ${ROLE} SET statement_timeout = '5s'`);

    await admin.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE}`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
    for (const t of DATASET_TABLES) {
      await admin.query(`GRANT SELECT ON "${t}" TO ${ROLE}`);
    }
    console.log(`Role "${ROLE}" ready with SELECT on ${DATASET_TABLES.length} tables.`);
  } finally {
    await admin.end();
  }

  // Verify by connecting as the role itself.
  const u = new URL(adminUrl);
  u.username = ROLE;
  u.password = password;
  const ro = new Pool({ connectionString: u.toString() });
  const failures: string[] = [];

  const mustSucceed = async (label: string, sql: string) => {
    try {
      await ro.query(sql);
      console.log(`  ok    ${label}`);
    } catch (e) {
      failures.push(label);
      console.log(`  FAIL  ${label}: ${e instanceof Error ? e.message : e}`);
    }
  };
  const mustBeDenied = async (label: string, sql: string) => {
    try {
      await ro.query(sql);
      failures.push(label);
      console.log(`  FAIL  ${label}: unexpectedly allowed`);
    } catch (e) {
      console.log(`  ok    ${label} -> denied (${e instanceof Error ? e.message : e})`);
    }
  };

  try {
    console.log("Verifying as readonly:");
    await mustSucceed("SELECT from orders", "SELECT count(*) FROM orders");
    await mustSucceed("JOIN across tables", "SELECT count(*) FROM orders o JOIN customers c USING (customer_id)");
    await mustBeDenied("INSERT", "INSERT INTO sellers (seller_id) VALUES ('x')");
    await mustBeDenied("UPDATE", "UPDATE orders SET order_status = 'x'");
    await mustBeDenied("DELETE", "DELETE FROM orders");
    await mustBeDenied("TRUNCATE", "TRUNCATE orders");
    await mustBeDenied("DROP TABLE", "DROP TABLE orders");
    await mustBeDenied("CREATE TABLE", "CREATE TABLE public.evil (id int)");
    await mustBeDenied("read neon_auth.\"user\"", 'SELECT * FROM neon_auth."user"');
    await mustBeDenied("CREATE ROLE", "CREATE ROLE evil");

    // The role's read-only default can be switched off by a session. Prove the
    // GRANTs alone still deny writes (layer 1 independent of layer 2).
    console.log("Verifying grants alone (read-only default switched off):");
    const client = await ro.connect();
    try {
      await client.query("SET default_transaction_read_only = off");
      for (const [label, sql] of [
        ["INSERT", "INSERT INTO sellers (seller_id) VALUES ('x')"],
        ["UPDATE", "UPDATE orders SET order_status = 'x'"],
        ["DELETE", "DELETE FROM orders"],
        ["TRUNCATE", "TRUNCATE orders"],
        ["DROP TABLE", "DROP TABLE orders"],
        ["CREATE TABLE", "CREATE TABLE public.evil (id int)"],
      ] as const) {
        try {
          await client.query(sql);
          failures.push(`${label} (grants only)`);
          console.log(`  FAIL  ${label}: unexpectedly allowed`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/permission denied|must be owner/.test(msg)) {
            console.log(`  ok    ${label} -> ${msg}`);
          } else {
            failures.push(`${label} (grants only)`);
            console.log(`  FAIL  ${label}: denied for the wrong reason: ${msg}`);
          }
        }
      }
    } finally {
      client.release();
    }
  } finally {
    await ro.end();
  }

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
  const host = new URL(requireEnv("DATABASE_URL")).host;
  console.log(
    `\nSet DATABASE_URL (locally and in Vercel) to:\n  postgresql://${ROLE}:<READONLY_PASSWORD>@${host}${new URL(adminUrl).pathname}?sslmode=require`,
  );
}

main().catch((err) => {
  console.error("Role setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
