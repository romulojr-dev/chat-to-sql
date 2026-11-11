/**
 * Loads the Olist dataset from ./data into Neon. Idempotent: drops and
 * recreates the dataset tables on every run.
 *
 * Usage: npm run db:seed
 * Requires DATABASE_URL_ADMIN (owner credential, direct connection).
 *
 * Skipped on purpose: olist_geolocation_dataset.csv (~1M rows, not needed
 * for any planned question, would use a large share of the free tier).
 */
import { createReadStream } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import { Pool } from "@neondatabase/serverless";

type Col = { name: string; type: string; src?: string };
type TableSpec = {
  table: string;
  file: string;
  columns: Col[];
  primaryKey?: string[];
  indexes: string[][];
};

const DATA_DIR = path.resolve(process.cwd(), "data");
const BATCH_SIZE = 5000;

const TABLES: TableSpec[] = [
  {
    table: "customers",
    file: "olist_customers_dataset.csv",
    columns: [
      { name: "customer_id", type: "text" },
      { name: "customer_unique_id", type: "text" },
      { name: "customer_zip_code_prefix", type: "text" },
      { name: "customer_city", type: "text" },
      { name: "customer_state", type: "text" },
    ],
    primaryKey: ["customer_id"],
    indexes: [["customer_unique_id"], ["customer_state"]],
  },
  {
    table: "orders",
    file: "olist_orders_dataset.csv",
    columns: [
      { name: "order_id", type: "text" },
      { name: "customer_id", type: "text" },
      { name: "order_status", type: "text" },
      { name: "order_purchase_timestamp", type: "timestamp" },
      { name: "order_approved_at", type: "timestamp" },
      { name: "order_delivered_carrier_date", type: "timestamp" },
      { name: "order_delivered_customer_date", type: "timestamp" },
      { name: "order_estimated_delivery_date", type: "timestamp" },
    ],
    primaryKey: ["order_id"],
    indexes: [["customer_id"], ["order_status"], ["order_purchase_timestamp"]],
  },
  {
    table: "order_items",
    file: "olist_order_items_dataset.csv",
    columns: [
      { name: "order_id", type: "text" },
      { name: "order_item_id", type: "integer" },
      { name: "product_id", type: "text" },
      { name: "seller_id", type: "text" },
      { name: "shipping_limit_date", type: "timestamp" },
      { name: "price", type: "numeric(10,2)" },
      { name: "freight_value", type: "numeric(10,2)" },
    ],
    primaryKey: ["order_id", "order_item_id"],
    indexes: [["product_id"], ["seller_id"]],
  },
  {
    table: "order_payments",
    file: "olist_order_payments_dataset.csv",
    columns: [
      { name: "order_id", type: "text" },
      { name: "payment_sequential", type: "integer" },
      { name: "payment_type", type: "text" },
      { name: "payment_installments", type: "integer" },
      { name: "payment_value", type: "numeric(10,2)" },
    ],
    primaryKey: ["order_id", "payment_sequential"],
    indexes: [["payment_type"]],
  },
  {
    // review_id is NOT unique in the source data, so no primary key.
    table: "order_reviews",
    file: "olist_order_reviews_dataset.csv",
    columns: [
      { name: "review_id", type: "text" },
      { name: "order_id", type: "text" },
      { name: "review_score", type: "smallint" },
      { name: "review_comment_title", type: "text" },
      { name: "review_comment_message", type: "text" },
      { name: "review_creation_date", type: "timestamp" },
      { name: "review_answer_timestamp", type: "timestamp" },
    ],
    indexes: [["order_id"], ["review_score"]],
  },
  {
    // Source columns misspell "length" as "lenght"; fixed here.
    table: "products",
    file: "olist_products_dataset.csv",
    columns: [
      { name: "product_id", type: "text" },
      { name: "product_category_name", type: "text" },
      { name: "product_name_length", type: "integer", src: "product_name_lenght" },
      { name: "product_description_length", type: "integer", src: "product_description_lenght" },
      { name: "product_photos_qty", type: "integer" },
      { name: "product_weight_g", type: "integer" },
      { name: "product_length_cm", type: "integer" },
      { name: "product_height_cm", type: "integer" },
      { name: "product_width_cm", type: "integer" },
    ],
    primaryKey: ["product_id"],
    indexes: [["product_category_name"]],
  },
  {
    table: "sellers",
    file: "olist_sellers_dataset.csv",
    columns: [
      { name: "seller_id", type: "text" },
      { name: "seller_zip_code_prefix", type: "text" },
      { name: "seller_city", type: "text" },
      { name: "seller_state", type: "text" },
    ],
    primaryKey: ["seller_id"],
    indexes: [["seller_state"]],
  },
  {
    table: "product_category_name_translation",
    file: "product_category_name_translation.csv",
    columns: [
      { name: "product_category_name", type: "text" },
      { name: "product_category_name_english", type: "text" },
    ],
    primaryKey: ["product_category_name"],
    indexes: [],
  },
];

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

function createTableSql(t: TableSpec): string {
  const cols = t.columns.map((c) => `${q(c.name)} ${c.type}`);
  if (t.primaryKey) cols.push(`PRIMARY KEY (${t.primaryKey.map(q).join(", ")})`);
  return `CREATE TABLE ${q(t.table)} (${cols.join(", ")})`;
}

/** One statement per batch: unnest() takes one array parameter per column. */
function insertSql(t: TableSpec): string {
  const names = t.columns.map((c) => q(c.name)).join(", ");
  const arrays = t.columns.map((c, i) => `$${i + 1}::${c.type}[]`).join(", ");
  return `INSERT INTO ${q(t.table)} (${names}) SELECT * FROM unnest(${arrays})`;
}

async function loadTable(pool: Pool, t: TableSpec): Promise<number> {
  const sql = insertSql(t);
  const parser = createReadStream(path.join(DATA_DIR, t.file)).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true }),
  );

  let batch: (string | null)[][] = t.columns.map(() => []);
  let size = 0;
  let total = 0;

  const flush = async () => {
    if (size === 0) return;
    await pool.query(sql, batch);
    total += size;
    batch = t.columns.map(() => []);
    size = 0;
  };

  for await (const record of parser as AsyncIterable<Record<string, string>>) {
    t.columns.forEach((c, i) => {
      const v = record[c.src ?? c.name];
      batch[i].push(v === undefined || v === "" ? null : v);
    });
    size++;
    if (size >= BATCH_SIZE) await flush();
  }
  await flush();
  return total;
}

async function main() {
  const url = process.env.DATABASE_URL_ADMIN;
  if (!url) throw new Error("DATABASE_URL_ADMIN is not set (see .env.example)");

  const pool = new Pool({ connectionString: url });
  try {
    console.log("Dropping and recreating tables...");
    for (const t of [...TABLES].reverse()) {
      await pool.query(`DROP TABLE IF EXISTS ${q(t.table)}`);
    }
    for (const t of TABLES) await pool.query(createTableSql(t));

    for (const t of TABLES) {
      const started = Date.now();
      const n = await loadTable(pool, t);
      console.log(`  ${t.table}: ${n} rows (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    }

    console.log("Creating indexes...");
    for (const t of TABLES) {
      for (const cols of t.indexes) {
        await pool.query(
          `CREATE INDEX ${q(`idx_${t.table}_${cols.join("_")}`)} ON ${q(t.table)} (${cols.map(q).join(", ")})`,
        );
      }
    }

    console.log("Analyzing...");
    for (const t of TABLES) await pool.query(`ANALYZE ${q(t.table)}`);

    const { rows } = await pool.query(
      `SELECT relname AS table, pg_size_pretty(pg_total_relation_size(c.oid)) AS size
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY pg_total_relation_size(c.oid) DESC`,
    );
    const db = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`);
    console.log("\nTable sizes (data + indexes):");
    for (const r of rows) console.log(`  ${r.table}: ${r.size}`);
    console.log(`Database total: ${db.rows[0].size}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
