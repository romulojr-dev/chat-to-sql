"""Load the Olist CSV data into PostgreSQL.

Run from the repository root with DATABASE_URL set, for example:
    python api/scripts/seed_olist.py
"""

from __future__ import annotations

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "db" / "raw"
load_dotenv(ROOT / "api" / ".env")

CSV_FILES = {
    "customers": "olist_customers_dataset.csv",
    "geolocation": "olist_geolocation_dataset.csv",
    "orders": "olist_orders_dataset.csv",
    "order_items": "olist_order_items_dataset.csv",
    "order_payments": "olist_order_payments_dataset.csv",
    "order_reviews": "olist_order_reviews_dataset.csv",
    "products": "olist_products_dataset.csv",
    "sellers": "olist_sellers_dataset.csv",
    "category_translation": "product_category_name_translation.csv",
}

TABLE_DDL = """
CREATE TABLE olist.customers (
    customer_id text PRIMARY KEY,
    customer_unique_id text NOT NULL,
    customer_zip_code_prefix integer NOT NULL,
    customer_city text NOT NULL,
    customer_state text NOT NULL
);

CREATE TABLE olist.geolocation (
    geolocation_zip_code_prefix integer NOT NULL,
    geolocation_lat numeric(9, 6),
    geolocation_lng numeric(9, 6),
    geolocation_city text NOT NULL,
    geolocation_state text NOT NULL
);

CREATE TABLE olist.sellers (
    seller_id text PRIMARY KEY,
    seller_zip_code_prefix integer NOT NULL,
    seller_city text NOT NULL,
    seller_state text NOT NULL
);

CREATE TABLE olist.category_translation (
    product_category_name text PRIMARY KEY,
    product_category_name_english text NOT NULL
);

CREATE TABLE olist.products (
    product_id text PRIMARY KEY,
    product_category_name text,
    product_category_name_english text,
    product_name_length integer,
    product_description_length integer,
    product_photos_qty integer,
    product_weight_g numeric(10, 2),
    product_length_cm numeric(10, 2),
    product_height_cm numeric(10, 2),
    product_width_cm numeric(10, 2)
);

CREATE TABLE olist.orders (
    order_id text PRIMARY KEY,
    customer_id text NOT NULL REFERENCES olist.customers (customer_id),
    order_status text NOT NULL,
    order_purchase_timestamp timestamptz NOT NULL,
    order_approved_at timestamptz,
    order_delivered_carrier_date timestamptz,
    order_delivered_customer_date timestamptz,
    order_estimated_delivery_date timestamptz NOT NULL
);

CREATE TABLE olist.order_items (
    order_id text NOT NULL REFERENCES olist.orders (order_id),
    order_item_id integer NOT NULL,
    product_id text NOT NULL REFERENCES olist.products (product_id),
    seller_id text NOT NULL REFERENCES olist.sellers (seller_id),
    shipping_limit_date timestamptz NOT NULL,
    price numeric(10, 2) NOT NULL,
    freight_value numeric(10, 2) NOT NULL,
    PRIMARY KEY (order_id, order_item_id)
);

CREATE TABLE olist.order_payments (
    order_id text NOT NULL REFERENCES olist.orders (order_id),
    payment_sequential integer NOT NULL,
    payment_type text NOT NULL,
    payment_installments integer NOT NULL,
    payment_value numeric(10, 2) NOT NULL,
    PRIMARY KEY (order_id, payment_sequential)
);

CREATE TABLE olist.order_reviews (
    review_id text NOT NULL,
    order_id text NOT NULL REFERENCES olist.orders (order_id),
    review_score integer NOT NULL,
    review_comment_title text,
    review_comment_message text,
    review_creation_date timestamptz NOT NULL,
    review_answer_timestamp timestamptz NOT NULL,
    PRIMARY KEY (review_id, order_id)
);

CREATE INDEX customers_zip_code_idx
    ON olist.customers (customer_zip_code_prefix);
CREATE INDEX geolocation_zip_code_idx
    ON olist.geolocation (geolocation_zip_code_prefix);
CREATE INDEX sellers_zip_code_idx
    ON olist.sellers (seller_zip_code_prefix);
CREATE INDEX products_category_idx
    ON olist.products (product_category_name);
CREATE INDEX orders_customer_idx
    ON olist.orders (customer_id);
CREATE INDEX orders_purchase_date_idx
    ON olist.orders (order_purchase_timestamp);
CREATE INDEX orders_estimated_delivery_date_idx
    ON olist.orders (order_estimated_delivery_date);
CREATE INDEX order_items_product_idx
    ON olist.order_items (product_id);
CREATE INDEX order_items_seller_idx
    ON olist.order_items (seller_id);
CREATE INDEX order_items_shipping_limit_idx
    ON olist.order_items (shipping_limit_date);
CREATE INDEX order_payments_order_idx
    ON olist.order_payments (order_id);
CREATE INDEX order_reviews_order_idx
    ON olist.order_reviews (order_id);
CREATE INDEX order_reviews_creation_date_idx
    ON olist.order_reviews (review_creation_date);
"""

COPY_COLUMNS = {
    "customers": (
        "customer_id",
        "customer_unique_id",
        "customer_zip_code_prefix",
        "customer_city",
        "customer_state",
    ),
    "geolocation": (
        "geolocation_zip_code_prefix",
        "geolocation_lat",
        "geolocation_lng",
        "geolocation_city",
        "geolocation_state",
    ),
    "sellers": ("seller_id", "seller_zip_code_prefix", "seller_city", "seller_state"),
    "category_translation": (
        "product_category_name",
        "product_category_name_english",
    ),
    "products": (
        "product_id",
        "product_category_name",
        "product_name_length",
        "product_description_length",
        "product_photos_qty",
        "product_weight_g",
        "product_length_cm",
        "product_height_cm",
        "product_width_cm",
    ),
    "orders": (
        "order_id",
        "customer_id",
        "order_status",
        "order_purchase_timestamp",
        "order_approved_at",
        "order_delivered_carrier_date",
        "order_delivered_customer_date",
        "order_estimated_delivery_date",
    ),
    "order_items": (
        "order_id",
        "order_item_id",
        "product_id",
        "seller_id",
        "shipping_limit_date",
        "price",
        "freight_value",
    ),
    "order_payments": (
        "order_id",
        "payment_sequential",
        "payment_type",
        "payment_installments",
        "payment_value",
    ),
    "order_reviews": (
        "review_id",
        "order_id",
        "review_score",
        "review_comment_title",
        "review_comment_message",
        "review_creation_date",
        "review_answer_timestamp",
    ),
}

TABLES_IN_LOAD_ORDER = (
    "customers",
    "geolocation",
    "sellers",
    "category_translation",
    "products",
    "orders",
    "order_items",
    "order_payments",
    "order_reviews",
)


def copy_csv(cursor: psycopg.Cursor, table: str) -> None:
    """Copy one CSV into its matching table, treating empty fields as NULL."""
    columns = ", ".join(COPY_COLUMNS[table])
    copy_sql = (
        f"COPY olist.{table} ({columns}) "
        "FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')"
    )
    path = RAW_DIR / CSV_FILES[table]
    with (
        path.open("r", encoding="utf-8-sig", newline="") as csv_file,
        cursor.copy(copy_sql) as copy,
    ):
        while chunk := csv_file.read(1024 * 1024):
            copy.write(chunk)


def create_views(cursor: psycopg.Cursor) -> None:
    cursor.execute(
        """
        CREATE VIEW olist.v_order_revenue AS
        SELECT
            oi.order_id,
            SUM(oi.price)::numeric(10, 2) AS item_revenue,
            SUM(oi.freight_value)::numeric(10, 2) AS freight_revenue,
            SUM(oi.price + oi.freight_value)::numeric(10, 2) AS total_revenue
        FROM olist.order_items AS oi
        GROUP BY oi.order_id
        """
    )
    cursor.execute(
        """
        CREATE VIEW olist.v_deliveries AS
        SELECT
            o.order_id,
            o.customer_id,
            o.order_status,
            o.order_purchase_timestamp,
            o.order_delivered_customer_date,
            o.order_estimated_delivery_date,
            (
                o.order_delivered_customer_date IS NOT NULL
                AND o.order_delivered_customer_date
                    > o.order_estimated_delivery_date
            ) AS is_late
        FROM olist.orders AS o
        """
    )


def seed() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL must be set")
    if database_url.startswith("postgresql+psycopg://"):
        database_url = database_url.removeprefix("postgresql+psycopg://")
        database_url = f"postgresql://{database_url}"

    with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
        cursor.execute("DROP SCHEMA IF EXISTS olist CASCADE")
        cursor.execute("CREATE SCHEMA olist")
        cursor.execute(TABLE_DDL)

        for table in TABLES_IN_LOAD_ORDER:
            copy_csv(cursor, table)

        cursor.execute(
            """
            UPDATE olist.products AS p
            SET product_category_name_english = t.product_category_name_english
            FROM olist.category_translation AS t
            WHERE p.product_category_name = t.product_category_name
            """
        )
        create_views(cursor)
        cursor.execute("GRANT USAGE ON SCHEMA olist TO cts_readonly")
        cursor.execute("GRANT SELECT ON ALL TABLES IN SCHEMA olist TO cts_readonly")

        for table in TABLES_IN_LOAD_ORDER:
            cursor.execute(f"SELECT COUNT(*) FROM olist.{table}")
            count = cursor.fetchone()[0]
            print(f"{table}: {count:,}")


if __name__ == "__main__":
    seed()
