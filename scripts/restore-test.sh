#!/usr/bin/env bash
# Restore-test af backup (M17): tager et logisk dump af kildedatabasen, lægger det ind i en
# tom måldatabase og sammenligner antal rækker i alle tabeller. Bruges før launch og derefter
# hvert kvartal. Måldatabasen skal være tom og må ALDRIG være production.
#
#   SOURCE_DATABASE_URL=postgres://… TARGET_DATABASE_URL=postgres://… scripts/restore-test.sh
#
# Med en Neon-backup: opret en gren fra et tidspunkt (point-in-time) og brug den som kilde.
set -euo pipefail

: "${SOURCE_DATABASE_URL:?Sæt SOURCE_DATABASE_URL}"
: "${TARGET_DATABASE_URL:?Sæt TARGET_DATABASE_URL}"
if [ "$SOURCE_DATABASE_URL" = "$TARGET_DATABASE_URL" ]; then
  echo "Kilde og mål er den samme database." >&2
  exit 1
fi

dump="$(mktemp -t restore-test.XXXXXX.dump)"
trap 'rm -f "$dump"' EXIT

existing=$(psql "$TARGET_DATABASE_URL" -Atc "select count(*) from pg_tables where schemaname = 'public'")
if [ "$existing" != "0" ]; then
  echo "Måldatabasen er ikke tom ($existing tabeller). Brug en ny, tom database." >&2
  exit 1
fi

echo "1/3 Dump af kilden"
pg_dump --format=custom --no-owner --no-privileges --file="$dump" "$SOURCE_DATABASE_URL"
echo "2/3 Restore i målet"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET_DATABASE_URL" "$dump"

echo "3/3 Sammenligner rækker pr. tabel"
tables=$(psql "$SOURCE_DATABASE_URL" -Atc "select tablename from pg_tables where schemaname = 'public' order by tablename")
failed=0
for table in $tables; do
  source_rows=$(psql "$SOURCE_DATABASE_URL" -Atc "select count(*) from public.\"$table\"")
  target_rows=$(psql "$TARGET_DATABASE_URL" -Atc "select count(*) from public.\"$table\"")
  if [ "$source_rows" != "$target_rows" ]; then
    echo "  FORSKEL $table: kilde $source_rows, mål $target_rows"
    failed=1
  fi
done
# Constraints mod dobbeltbooking skal også være med.
constraints=$(psql "$TARGET_DATABASE_URL" -Atc "select count(*) from pg_constraint where contype = 'x'")
echo "  Tabeller: $(echo "$tables" | wc -w), exclusion-constraints: $constraints"
if [ "$failed" = "1" ] || [ "$constraints" = "0" ]; then
  echo "Restore-test FEJLEDE." >&2
  exit 1
fi
echo "Restore-test OK."
