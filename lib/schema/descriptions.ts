/**
 * Human-readable description of the dataset, fed to the LLM. Facts here were
 * checked against the loaded database (see docs/dataset.md); keep them in sync
 * with scripts/seed.ts. Improving this text is a measured lever in the eval.
 */
export const SCHEMA_DESCRIPTION = `
Database: PostgreSQL. Brazilian e-commerce marketplace data (Olist), about 100k orders from 2016-09 to 2018-10. Money is in Brazilian reais (BRL). All timestamps are "timestamp without time zone".

TABLES

customers (one row per ORDER's customer record, 99,441 rows)
  customer_id text PRIMARY KEY      -- unique per order, NOT per person
  customer_unique_id text           -- identifies a real person; use this to count customers (96,096 distinct)
  customer_zip_code_prefix text
  customer_city text                -- lowercase, no accents (e.g. 'sao paulo')
  customer_state text               -- 2-letter state code, 27 values (e.g. 'SP', 'RJ')

orders (99,441 rows)
  order_id text PRIMARY KEY
  customer_id text                  -- joins customers.customer_id
  order_status text                 -- delivered, shipped, canceled, unavailable, invoiced, processing, created, approved
  order_purchase_timestamp timestamp
  order_approved_at timestamp
  order_delivered_carrier_date timestamp
  order_delivered_customer_date timestamp   -- NULL until delivered
  order_estimated_delivery_date timestamp

order_items (112,650 rows; one row per item in an order; PRIMARY KEY (order_id, order_item_id))
  order_id text                     -- joins orders.order_id
  order_item_id integer             -- 1, 2, 3... position within the order
  product_id text                   -- joins products.product_id
  seller_id text                    -- joins sellers.seller_id
  shipping_limit_date timestamp
  price numeric(10,2)               -- item price in BRL; revenue = sum(price)
  freight_value numeric(10,2)       -- shipping cost in BRL

order_payments (103,886 rows; PRIMARY KEY (order_id, payment_sequential))
  order_id text                     -- joins orders.order_id
  payment_sequential integer        -- an order can be paid with several methods
  payment_type text                 -- credit_card, boleto, voucher, debit_card, not_defined
  payment_installments integer
  payment_value numeric(10,2)       -- BRL

order_reviews (99,224 rows; review_id is NOT unique)
  review_id text
  order_id text                     -- joins orders.order_id
  review_score smallint             -- 1 (worst) to 5 (best)
  review_comment_title text         -- mostly NULL
  review_comment_message text       -- mostly NULL; Portuguese
  review_creation_date timestamp
  review_answer_timestamp timestamp

products (32,951 rows)
  product_id text PRIMARY KEY
  product_category_name text        -- Portuguese, e.g. 'beleza_saude'; NULL for 610 products
  product_name_length integer
  product_description_length integer
  product_photos_qty integer
  product_weight_g integer
  product_length_cm integer
  product_height_cm integer
  product_width_cm integer

sellers (3,095 rows)
  seller_id text PRIMARY KEY
  seller_zip_code_prefix text
  seller_city text
  seller_state text                 -- 2-letter state code

product_category_name_translation (71 rows)
  product_category_name text PRIMARY KEY      -- Portuguese
  product_category_name_english text          -- e.g. 'health_beauty'

RELATIONSHIPS
  orders.customer_id = customers.customer_id
  order_items.order_id = orders.order_id
  order_items.product_id = products.product_id
  order_items.seller_id = sellers.seller_id
  order_payments.order_id = orders.order_id
  order_reviews.order_id = orders.order_id
  products.product_category_name = product_category_name_translation.product_category_name

DATA NOTES
  - The data covers 2016-09-04 to 2018-10-17. Late 2016 is sparse (no orders in November 2016); full months run from 2017-01 to 2018-08; September and October 2018 have only a handful of orders (16 and 4).
  - 775 orders have no rows in order_items (mostly canceled or unavailable). Use a LEFT JOIN when you must keep them.
  - Show product categories in English by joining product_category_name_translation; 2 categories have no translation, so LEFT JOIN and COALESCE to the Portuguese name if needed.
  - For "revenue" or "sales", sum order_items.price (add freight_value only if asked about total paid including shipping). Exclude canceled and unavailable orders unless the question asks about them.
  - "Customers" means distinct customer_unique_id, not customer_id.
`.trim();
