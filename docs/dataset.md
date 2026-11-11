# Dataset: Olist Brazilian E-Commerce

Checked 2026-11-11.

## Source
- Kaggle: `olistbr/brazilian-ecommerce` ("Brazilian E-Commerce Public Dataset by Olist")
- Owner: Olist. About 100k orders from 2016 to 2018 across Brazilian marketplaces.
- Download size reported by the Kaggle API: about 126 MB (compressed CSVs).
- Data is anonymised. Store and partner names in review text were replaced with Game of Thrones house names.

## License
- **CC BY-NC-SA 4.0** (non-commercial, share-alike, attribution). Confirmed from the Kaggle API `licenseName` field. The rendered dataset page did not show the license, so the API is the only primary source.
- The Kaggle description requires no specific attribution text. Its only credit line is "Thanks to Olist for releasing this dataset."
- The Kaggle page does not spell out what NC/SA mean in practice. See https://creativecommons.org/licenses/by-nc-sa/4.0/ for the terms.

### How this project complies
- **Non-commercial:** the demo is a free portfolio project with no revenue. If it is ever monetised, revisit this.
- **Attribution:** credit Olist and link the Kaggle dataset in the README and the app footer.
- **Share-alike:** the raw CSVs and any derived database dump are **not committed** to the repo. `npm run db:seed` loads a locally downloaded copy. Anything derived from the data that is published should carry the same license.

## Loaded tables (verified 2026-11-12)
Loaded by `npm run db:seed` (idempotent: drops and recreates, run twice with identical counts).

| Table | Rows |
|---|---|
| customers | 99,441 |
| orders | 99,441 |
| order_items | 112,650 |
| order_payments | 103,886 |
| order_reviews | 99,224 |
| products | 32,951 |
| sellers | 3,095 |
| product_category_name_translation | 71 |

- **Skipped:** `olist_geolocation_dataset.csv` (about 1M rows, 61 MB, a zip-to-coordinates lookup no planned question needs).
- **Renamed:** `product_name_lenght` -> `product_name_length`, `product_description_lenght` -> `product_description_length` (source typos).
- **No primary key** on `order_reviews`: `review_id` is not unique in the source.
- Empty CSV fields load as NULL. No foreign keys; indexes on join and filter columns.
- **Measured size: 136 MB** including indexes, so it fits either possible free-tier quota (0.5 GB or 1 GB) with headroom.

## Neon free plan (checked 2026-11-11)
- Per the Neon docs page (updated 2026-10-01): 1 GB storage per project, 100 CU-hours of compute per project per month, scale to zero after 5 minutes idle, no overage billing. Writes fail once storage is full.
- Some third-party pages still say 0.5 GB. Confirm the real quota in the Neon console after creating the project.
- Estimate: well under 200 MB loaded with indexes. This is unverified until the seed runs. If it doesn't fit, sample rows instead of changing dataset.

## Open items for T2
- [x] CSVs downloaded; Neon project created; connection strings in `.env.local`.
- [x] Table list verified against the download; loaded size measured (136 MB).
- [ ] Confirm the quota shown in the Neon console (sources disagree: 0.5 GB vs 1 GB).
- [ ] Create the read-only role and point the app's `DATABASE_URL` at it.
