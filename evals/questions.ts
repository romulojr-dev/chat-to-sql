/**
 * Eval question set. Each question has hand-written reference SQL that is the
 * ground truth for execution accuracy (see evals/check-references.ts).
 *
 * Conventions, matching the schema description given to the model:
 *  - "revenue" / "sales" = sum of order_items.price, excluding canceled and
 *    unavailable orders unless the question names a status.
 *  - "customers" = distinct customer_unique_id.
 *  - Categories are shown by English name (translation table, COALESCE to Portuguese).
 *
 * `ordered` is true when the answer's row order matters (ranked top-N, time series).
 * `split: "holdout"` questions must NOT be used when tuning the prompt (T13).
 */

export type Tier = "easy" | "medium" | "hard";
export type ExpectedChart = "bar" | "line" | "number" | "none";

export type EvalQuestion = {
  id: string;
  tier: Tier;
  split: "dev" | "holdout";
  question: string;
  sql: string;
  expectedChart: ExpectedChart;
  ordered: boolean;
};

const ACTIVE = `o.order_status NOT IN ('canceled', 'unavailable')`;
const CATEGORY = `COALESCE(t.product_category_name_english, p.product_category_name)`;
const TRANSLATE = `LEFT JOIN product_category_name_translation t ON t.product_category_name = p.product_category_name`;

const HOLDOUT = new Set([
  "e03", "e06", "e09", "e12", "e16", "e19",
  "m02", "m05", "m08", "m11", "m14", "m17", "m20", "m23",
  "h02", "h05", "h08", "h11", "h14",
]);

function q(
  id: string,
  tier: Tier,
  question: string,
  sql: string,
  expectedChart: ExpectedChart,
  ordered = false,
): EvalQuestion {
  return { id, tier, split: HOLDOUT.has(id) ? "holdout" : "dev", question, sql: sql.trim(), expectedChart, ordered };
}

export const QUESTIONS: EvalQuestion[] = [
  // ---------------------------------------------------------------- easy
  q("e01", "easy", "How many orders are in the data?", `SELECT count(*) FROM orders`, "number"),
  q("e02", "easy", "How many unique customers are there?", `SELECT count(DISTINCT customer_unique_id) FROM customers`, "number"),
  q("e03", "easy", "How many sellers are there?", `SELECT count(*) FROM sellers`, "number"),
  q("e04", "easy", "How many products are in the catalog?", `SELECT count(*) FROM products`, "number"),
  q("e05", "easy", "How many orders were delivered?", `SELECT count(*) FROM orders WHERE order_status = 'delivered'`, "number"),
  q("e06", "easy", "How many orders were canceled?", `SELECT count(*) FROM orders WHERE order_status = 'canceled'`, "number"),
  q("e07", "easy", "What is the average review score?", `SELECT avg(review_score) FROM order_reviews`, "number"),
  q("e08", "easy", "How many orders were placed in 2018?", `SELECT count(*) FROM orders WHERE order_purchase_timestamp >= '2018-01-01' AND order_purchase_timestamp < '2019-01-01'`, "number"),
  q("e09", "easy", "How many orders are there in each order status?", `SELECT order_status, count(*) AS orders FROM orders GROUP BY 1 ORDER BY 2 DESC`, "bar"),
  q("e10", "easy", "Which 5 states have the most customers?", `SELECT customer_state, count(DISTINCT customer_unique_id) AS customers FROM customers GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, "bar", true),
  q("e11", "easy", "How many reviews gave a score of 5?", `SELECT count(*) FROM order_reviews WHERE review_score = 5`, "number"),
  q("e12", "easy", "What is the highest price any item was sold for?", `SELECT max(price) FROM order_items`, "number"),
  q("e13", "easy", "What is the average price of an item sold?", `SELECT avg(price) FROM order_items`, "number"),
  q("e14", "easy", "How many orders were paid with a credit card?", `SELECT count(DISTINCT order_id) FROM order_payments WHERE payment_type = 'credit_card'`, "number"),
  q("e15", "easy", "What payment types do customers use?", `SELECT DISTINCT payment_type FROM order_payments ORDER BY 1`, "none"),
  q("e16", "easy", "How many different product categories are there?", `SELECT count(DISTINCT product_category_name) FROM products`, "number"),
  q("e17", "easy", "When was the first order placed?", `SELECT min(order_purchase_timestamp) FROM orders`, "none"),
  q("e18", "easy", "When was the most recent order placed?", `SELECT max(order_purchase_timestamp) FROM orders`, "none"),
  q("e19", "easy", "How many sellers are in the state of SP?", `SELECT count(*) FROM sellers WHERE seller_state = 'SP'`, "number"),
  q("e20", "easy", "What is the total shipping (freight) cost charged across all items?", `SELECT sum(freight_value) FROM order_items`, "number"),

  // -------------------------------------------------------------- medium
  q("m01", "medium", "How many orders were placed in each month of 2017?", `SELECT date_trunc('month', order_purchase_timestamp) AS month, count(*) AS orders FROM orders WHERE order_purchase_timestamp >= '2017-01-01' AND order_purchase_timestamp < '2018-01-01' GROUP BY 1 ORDER BY 1`, "line", true),
  q("m02", "medium", "What are the top 5 product categories by revenue?", `SELECT ${CATEGORY} AS category, sum(oi.price) AS revenue FROM order_items oi JOIN orders o ON o.order_id = oi.order_id JOIN products p ON p.product_id = oi.product_id ${TRANSLATE} WHERE ${ACTIVE} GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, "bar", true),
  q("m03", "medium", "What was the total revenue in each year?", `SELECT extract(year FROM o.order_purchase_timestamp)::int AS year, sum(oi.price) AS revenue FROM order_items oi JOIN orders o ON o.order_id = oi.order_id WHERE ${ACTIVE} GROUP BY 1 ORDER BY 1`, "bar", true),
  q("m04", "medium", "Which payment type is used for the most orders, and how many orders used it?", `SELECT payment_type, count(DISTINCT order_id) AS orders FROM order_payments GROUP BY 1 ORDER BY 2 DESC LIMIT 1`, "none"),
  q("m05", "medium", "What is the average review score for each customer state?", `SELECT c.customer_state, avg(r.review_score) AS avg_score FROM order_reviews r JOIN orders o ON o.order_id = r.order_id JOIN customers c ON c.customer_id = o.customer_id GROUP BY 1`, "none"),
  q("m06", "medium", "Which 10 sellers have handled the most orders?", `SELECT seller_id, count(DISTINCT order_id) AS orders FROM order_items GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, "bar", true),
  q("m07", "medium", "What percentage of orders were delivered?", `SELECT round(100.0 * count(*) FILTER (WHERE order_status = 'delivered') / count(*), 2) AS pct_delivered FROM orders`, "number"),
  q("m08", "medium", "How many delivered orders arrived later than their estimated delivery date?", `SELECT count(*) FROM orders WHERE order_status = 'delivered' AND order_delivered_customer_date > order_estimated_delivery_date`, "number"),
  q("m09", "medium", "What is the average number of days between purchase and delivery for delivered orders?", `SELECT avg(extract(epoch FROM (order_delivered_customer_date - order_purchase_timestamp)) / 86400) AS avg_days FROM orders WHERE order_status = 'delivered' AND order_delivered_customer_date IS NOT NULL`, "number"),
  q("m10", "medium", "What is the average review score for orders that include a health_beauty product?", `SELECT avg(r.review_score) FROM order_reviews r WHERE r.order_id IN (SELECT oi.order_id FROM order_items oi JOIN products p ON p.product_id = oi.product_id JOIN product_category_name_translation t ON t.product_category_name = p.product_category_name WHERE t.product_category_name_english = 'health_beauty')`, "number"),
  q("m11", "medium", "How much money was paid with each payment type?", `SELECT payment_type, sum(payment_value) AS total_paid FROM order_payments GROUP BY 1 ORDER BY 2 DESC`, "bar"),
  q("m12", "medium", "Which 5 customer states placed the most orders?", `SELECT c.customer_state, count(*) AS orders FROM orders o JOIN customers c ON c.customer_id = o.customer_id GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, "bar", true),
  q("m13", "medium", "What was the revenue in each month of 2018?", `SELECT date_trunc('month', o.order_purchase_timestamp) AS month, sum(oi.price) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE ${ACTIVE} AND o.order_purchase_timestamp >= '2018-01-01' AND o.order_purchase_timestamp < '2019-01-01' GROUP BY 1 ORDER BY 1`, "line", true),
  q("m14", "medium", "How many items does an order contain on average?", `SELECT count(*)::numeric / count(DISTINCT order_id) AS avg_items FROM order_items`, "number"),
  q("m15", "medium", "How many orders were paid using more than one payment type?", `SELECT count(*) FROM (SELECT order_id FROM order_payments GROUP BY order_id HAVING count(DISTINCT payment_type) > 1) x`, "number"),
  q("m16", "medium", "Which state has the most sellers, and how many does it have?", `SELECT seller_state, count(*) AS sellers FROM sellers GROUP BY 1 ORDER BY 2 DESC LIMIT 1`, "none"),
  q("m17", "medium", "How many orders were placed in November 2017?", `SELECT count(*) FROM orders WHERE order_purchase_timestamp >= '2017-11-01' AND order_purchase_timestamp < '2017-12-01'`, "number"),
  q("m18", "medium", "What was the total revenue from delivered orders placed in 2017?", `SELECT sum(oi.price) FROM order_items oi JOIN orders o ON o.order_id = oi.order_id WHERE o.order_status = 'delivered' AND o.order_purchase_timestamp >= '2017-01-01' AND o.order_purchase_timestamp < '2018-01-01'`, "number"),
  q("m19", "medium", "What is the average shipping (freight) cost per order?", `SELECT sum(freight_value) / count(DISTINCT order_id) FROM order_items`, "number"),
  q("m20", "medium", "How many products have been sold exactly once?", `SELECT count(*) FROM (SELECT product_id FROM order_items GROUP BY product_id HAVING count(*) = 1) x`, "number"),
  q("m21", "medium", "How many orders have a review with a written comment?", `SELECT count(DISTINCT order_id) FROM order_reviews WHERE review_comment_message IS NOT NULL`, "number"),
  q("m22", "medium", "How many sellers have sold more than 100 items?", `SELECT count(*) FROM (SELECT seller_id FROM order_items GROUP BY seller_id HAVING count(*) > 100) x`, "number"),
  q("m23", "medium", "Which 3 product categories contain the most products?", `SELECT ${CATEGORY} AS category, count(*) AS products FROM products p ${TRANSLATE} WHERE p.product_category_name IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 3`, "bar", true),
  q("m24", "medium", "How many delivered orders arrived in under 7 days after purchase?", `SELECT count(*) FROM orders WHERE order_status = 'delivered' AND order_delivered_customer_date - order_purchase_timestamp < interval '7 days'`, "number"),

  // ---------------------------------------------------------------- hard
  q("h01", "hard", "How many customers have placed more than one order?", `SELECT count(*) FROM (SELECT c.customer_unique_id FROM orders o JOIN customers c ON c.customer_id = o.customer_id GROUP BY 1 HAVING count(*) > 1) x`, "number"),
  q("h02", "hard", "What percentage of customers have placed more than one order?", `SELECT round(100.0 * count(*) FILTER (WHERE n > 1) / count(*), 2) FROM (SELECT c.customer_unique_id, count(*) AS n FROM orders o JOIN customers c ON c.customer_id = o.customer_id GROUP BY 1) x`, "number"),
  q("h03", "hard", "For each month from February to December 2017, what was the percentage revenue growth compared with the previous month?", `WITH m AS (SELECT date_trunc('month', o.order_purchase_timestamp) AS month, sum(oi.price) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.order_id WHERE ${ACTIVE} AND o.order_purchase_timestamp >= '2017-01-01' AND o.order_purchase_timestamp < '2018-01-01' GROUP BY 1) SELECT month, 100.0 * (revenue - lag(revenue) OVER (ORDER BY month)) / lag(revenue) OVER (ORDER BY month) AS growth_pct FROM m ORDER BY month OFFSET 1`, "line", true),
  q("h04", "hard", "What were the top 3 product categories by revenue in each year?", `WITH r AS (SELECT extract(year FROM o.order_purchase_timestamp)::int AS year, ${CATEGORY} AS category, sum(oi.price) AS revenue FROM order_items oi JOIN orders o ON o.order_id = oi.order_id JOIN products p ON p.product_id = oi.product_id ${TRANSLATE} WHERE ${ACTIVE} GROUP BY 1, 2), ranked AS (SELECT *, rank() OVER (PARTITION BY year ORDER BY revenue DESC) AS rk FROM r) SELECT year, category, revenue FROM ranked WHERE rk <= 3 ORDER BY year, rk`, "none", true),
  q("h05", "hard", "What percentage of total revenue comes from the top 10 sellers?", `WITH s AS (SELECT oi.seller_id, sum(oi.price) AS rev FROM order_items oi JOIN orders o ON o.order_id = oi.order_id WHERE ${ACTIVE} GROUP BY 1) SELECT round(100.0 * (SELECT sum(rev) FROM (SELECT rev FROM s ORDER BY rev DESC LIMIT 10) top10) / sum(rev), 2) FROM s`, "number"),
  q("h06", "hard", "By how many points is the average review score lower for late deliveries than for on-time deliveries (delivered orders only)?", `SELECT (SELECT avg(r.review_score) FROM orders o JOIN order_reviews r ON r.order_id = o.order_id WHERE o.order_status = 'delivered' AND o.order_delivered_customer_date <= o.order_estimated_delivery_date) - (SELECT avg(r.review_score) FROM orders o JOIN order_reviews r ON r.order_id = o.order_id WHERE o.order_status = 'delivered' AND o.order_delivered_customer_date > o.order_estimated_delivery_date) AS score_gap`, "number"),
  q("h07", "hard", "Across all categories, which one has the highest average freight cost per item, and what is it?", `SELECT ${CATEGORY} AS category, avg(oi.freight_value) AS avg_freight FROM order_items oi JOIN products p ON p.product_id = oi.product_id ${TRANSLATE} WHERE p.product_category_name IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1`, "none"),
  q("h08", "hard", "How many orders contained items from more than one seller?", `SELECT count(*) FROM (SELECT order_id FROM order_items GROUP BY order_id HAVING count(DISTINCT seller_id) > 1) x`, "number"),
  q("h09", "hard", "What is the average order value, including shipping, for delivered orders?", `SELECT sum(oi.price + oi.freight_value) / count(DISTINCT oi.order_id) FROM order_items oi JOIN orders o ON o.order_id = oi.order_id WHERE o.order_status = 'delivered'`, "number"),
  q("h10", "hard", "What was the average delivery time in days for delivered orders, for each purchase year?", `SELECT extract(year FROM order_purchase_timestamp)::int AS year, avg(extract(epoch FROM (order_delivered_customer_date - order_purchase_timestamp)) / 86400) AS avg_days FROM orders WHERE order_status = 'delivered' AND order_delivered_customer_date IS NOT NULL GROUP BY 1 ORDER BY 1`, "bar", true),
  q("h11", "hard", "How many sellers earned more revenue than the average seller?", `WITH s AS (SELECT oi.seller_id, sum(oi.price) AS rev FROM order_items oi JOIN orders o ON o.order_id = oi.order_id WHERE ${ACTIVE} GROUP BY 1) SELECT count(*) FROM s WHERE rev > (SELECT avg(rev) FROM s)`, "number"),
  q("h12", "hard", "Which 5 customer states have the highest average order value (item prices only)?", `WITH ov AS (SELECT o.order_id, c.customer_state, sum(oi.price) AS v FROM orders o JOIN customers c ON c.customer_id = o.customer_id JOIN order_items oi ON oi.order_id = o.order_id WHERE ${ACTIVE} GROUP BY 1, 2) SELECT customer_state, avg(v) AS avg_order_value FROM ov GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, "bar", true),
  q("h13", "hard", "What is the median order value (item prices only)?", `WITH ov AS (SELECT oi.order_id, sum(oi.price) AS v FROM order_items oi JOIN orders o ON o.order_id = oi.order_id WHERE ${ACTIVE} GROUP BY 1) SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY v) FROM ov`, "number"),
  q("h14", "hard", "How many orders from customers in the state of SP included a health_beauty product?", `SELECT count(DISTINCT o.order_id) FROM orders o JOIN customers c ON c.customer_id = o.customer_id JOIN order_items oi ON oi.order_id = o.order_id JOIN products p ON p.product_id = oi.product_id JOIN product_category_name_translation t ON t.product_category_name = p.product_category_name WHERE c.customer_state = 'SP' AND t.product_category_name_english = 'health_beauty'`, "number"),
  q("h15", "hard", "Among delivered orders, what percentage were paid in more than one installment?", `SELECT round(100.0 * count(DISTINCT p.order_id) FILTER (WHERE p.payment_installments > 1) / count(DISTINCT p.order_id), 2) FROM order_payments p JOIN orders o ON o.order_id = p.order_id WHERE o.order_status = 'delivered'`, "number"),
  q("h16", "hard", "What was the total revenue of the seller who handled the most orders?", `SELECT sum(oi.price) FROM order_items oi JOIN orders o ON o.order_id = oi.order_id WHERE ${ACTIVE} AND oi.seller_id = (SELECT seller_id FROM order_items GROUP BY seller_id ORDER BY count(DISTINCT order_id) DESC LIMIT 1)`, "number"),
];
