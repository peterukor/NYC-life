#!/usr/bin/env bash
# =====================================================================
# bake-all.sh — rebuild every AI model in public/models/ai/ from Peter's
# Tripo originals. Near: baked at 4K/2K, shipped at 2K (blocks) or 1K
# (houses). Far: fewer triangles, shipped at 1K / 512.
#   SRC=<folder with the original .glb files> bash scripts/bake-all.sh [name ...]
# =====================================================================
cd "$(dirname "$0")/.."
SRC=${SRC:-/mnt/user-data/uploads}
TMP=${TMP:-/tmp/bake}
mkdir -p "$TMP"
OUT=public/models/ai
# name | source file | near tris | far tris | bake tex | ship tex (near) | ship tex (far)
LIST="
block-walkups-a|isometric_city_block_3d_model.glb|30000|7000|4096|2048|1024
block-rowhouses-a|greenwhich-village-row-houses-model.glb|30000|7000|4096|2048|1024
block-harlem-a|harlem-block-model.glb|30000|7000|4096|2048|1024
block-fidi-a|financial-district-city-block-model.glb|30000|7000|4096|2048|1024
block-midtown-a|midtown-glass-houses-model.glb|30000|7000|4096|2048|1024
block-mixed-a|mixed-block-model.glb|30000|7000|4096|2048|1024
block-soho-a|soho-city-block.glb|30000|7000|4096|2048|1024
house-tiny|stylized_house_3d_model.glb|8000|2000|2048|1024|512
house-townhouse|townhouse-model.glb|8000|2000|2048|1024|512
house-villa|villa-model.glb|10000|2500|2048|1024|512
house-mansion|mansion-model.glb|14000|3500|2048|1024|512
"
one() {
  IFS='|' read -r name file near far bake tn tf <<< "$1"
  [ -f "$SRC/$file" ] || { echo "skip $name (no $file)"; return; }
  python3 scripts/bake-model.py "$SRC/$file" "$TMP/$name.raw.glb" "$near" "$bake" > "$TMP/$name.log" 2>&1 \
    || python3 scripts/bake-model.py "$SRC/$file" "$TMP/$name.raw.glb" "$near" "$((bake / 2))" > "$TMP/$name.log" 2>&1 \
    || { echo "FAILED $name"; return; }
  TEX=$tn node scripts/slim-model.mjs "$TMP/$name.raw.glb" "$OUT/$name.glb" 0 > /dev/null 2>&1
  python3 scripts/bake-model.py "$SRC/$file" "$TMP/$name.far.raw.glb" "$far" "$((bake / 2))" > "$TMP/$name.far.log" 2>&1 || { echo "FAILED far $name"; return; }
  TEX=$tf node scripts/slim-model.mjs "$TMP/$name.far.raw.glb" "$OUT/$name.far.glb" 0 > /dev/null 2>&1
  echo "ok $name $(du -k "$OUT/$name.glb" | cut -f1)K + far $(du -k "$OUT/$name.far.glb" | cut -f1)K"
}
for line in $LIST; do
  name=${line%%|*}
  if [ $# -gt 0 ] && [[ ! " $* " =~ " $name " ]]; then continue; fi
  one "$line"
done
