# Search query and index strategy

Home Base search uses two bounded query bands per entity kind:

- up to 8 exact or prefix matches on the displayed title, name, or body-first value;
- up to 20 broader substring matches, ordered by the entity's useful recency field.

The bands are merged by stable entity identity and the page returns at most 40
results. This keeps database work predictable while ensuring an older exact or
prefix match is not discarded by twenty newer body matches. Queries shorter
than two characters are not executed because they are both noisy and unusually
expensive for little navigational value.

At the current personal-app data volume, the existing status, date, and foreign
key indexes plus these hard bounds are sufficient. When search latency or table
size materially grows, add PostgreSQL `pg_trgm` GIN indexes for the fields used
by substring matching and `lower(column) text_pattern_ops` indexes for the
prefix band. Measure `EXPLAIN (ANALYZE, BUFFERS)` against production-like data
before adding them; blanket trigram indexes on every prose column would impose
write and storage costs without evidence they are needed.
