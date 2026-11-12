/**
 * Headline facts about the dataset, shown on the landing page. They must agree with
 * SCHEMA_DESCRIPTION (checked by tests/about-facts.test.ts), whose facts were verified against the DB.
 */
export const DATASET_FACTS = {
  orders: "99,441",
  customers: "96,096",
  sellers: "3,095",
  products: "32,951",
} as const;

export const DATASET_TABLES = [
  "customers",
  "orders",
  "order_items",
  "order_payments",
  "order_reviews",
  "products",
  "sellers",
  "product_category_name_translation",
] as const;
