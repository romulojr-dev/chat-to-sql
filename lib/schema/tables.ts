/** Tables the app is allowed to query. Single source of truth for the validator and role setup. */
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
