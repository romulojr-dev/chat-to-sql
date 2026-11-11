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

## Files (expected, to confirm after download)
The Kaggle API returned an empty file list, so this is from the dataset's well-known layout, not verified yet: customers, orders, order_items, order_payments, order_reviews, products, sellers, geolocation, and a product category name translation table. T2 verifies against the actual download.

## Neon free plan (checked 2026-11-11)
- Per the Neon docs page (updated 2026-10-01): 1 GB storage per project, 100 CU-hours of compute per project per month, scale to zero after 5 minutes idle, no overage billing. Writes fail once storage is full.
- Some third-party pages still say 0.5 GB. Confirm the real quota in the Neon console after creating the project.
- Estimate: well under 200 MB loaded with indexes. This is unverified until the seed runs. If it doesn't fit, sample rows instead of changing dataset.

## Open items for T2
- [ ] User downloads the CSVs from Kaggle into a git-ignored folder (e.g. `data/`).
- [ ] User creates the Neon project and puts connection strings in `.env.local`.
- [ ] Verify file and table list against the download.
- [ ] Measure loaded database size and compare with the project quota.
