#!/usr/bin/env bash
# Photograph every model for the 2.5D map (scripts/render-sprite.py),
# one at a time (each render needs ~2-3 GB of memory).
#
#   bash scripts/render-sprites.sh [only-this-name]
#
# SRC: folder with Peter's original (full-detail) GLBs.
# Blocks fill a 90 x 60 m cell (long side east-west), photographed
# turned both ways for variety. Houses fit their plot (a space is
# 10.5 x 27 m): tiny 1x1, townhouse 2x1, villa 2x2, mansion 4x2 spaces.
set -u
SRC=${SRC:-/mnt/user-data/uploads}
OUT=${OUT:-public/sprites}
mkdir -p "$OUT"
only=${1:-}

# name | source file | footW | footD | rotations | px/m | stretch
JOBS=(
  "block-midtown|midtown-glass-houses-model.glb|90|60|90 270|12|1.15"
  "block-fidi|financial-district-city-block-model.glb|90|60|90 270|12|1.25"
  "block-harlem|harlem-block-model.glb|90|60|90 270|12|1.15"
  "block-mixed|mixed-block-model.glb|90|60|90 270|12|1.15"
  "block-soho|soho-city-block.glb|90|60|0 180|12|1.15"
  "block-rowhouses|greenwhich-village-row-houses-model.glb|90|60|90 270|12|1.15"
  "block-walkups|isometric_city_block_3d_model.glb|90|60|90 270|12|1.25"
  "house-tiny|stylized_house_3d_model.glb|10.5|28|0 180|12|1.1"
  "house-townhouse|townhouse-model.glb|21|28|0 180|12|1.15"
  "house-villa|villa-model.glb|21|54|0|12|1.25"
  "house-mansion|mansion-model.glb|42|54|0|12|1.25"
  # Square blocks (60 x 60 m) stand beside a 30 m plaza or subway strip.
  "square-mixed|square-mixed-model.glb|60|60|0 180|12|1.1"
  "square-soho|square-soho-model.glb|60|60|0 180|12|1.1"
  "square-midtown|square-midtown-model.glb|60|60|0 180|12|1.1"
  "gym|square-gym-and-pool.glb|60|60|0|12|1.15"
  "playground|rectangle-playground-model.glb|90|60|0 180|12|1.25"
  "subway|subway-model.glb|10|10|0 90|12|1.1"
  # Street pieces (run scripts/sprite-top.py on them afterwards).
  "road-ns|road-model.glb|16|60|0|12|1.4"
  "road-ew|road-model.glb|46|16.6|90|12|1.25"
  "intersection|intersection.glb|16|16|0|12|1.1"
  # Lots, highlights and small props.
  "lot-empty|empty-block-model.glb|90|60|90|12|1.25"
  "lot-trees|empty-block-with-trees-model.glb|90|60|90|12|1.25"
  "click-rect|rectangle-clickable.glb|90|60|90|12|1.3"
  "click-square|square-clickable-model.glb|60|60|0|12|1.1"
  "prop-tree|tree_3d_model.glb|7|7|0|16|1.0"
  "prop-cherry|樱花树3d模型.glb|7|7|0|16|1.0"
  "prop-palm|palm_tree_3d_model.glb|5|5|0|16|1.0"
  "prop-rock|rock_boulder_3d_model.glb|3.5|3.5|0|16|1.0"
  "prop-mossy-rock|mossy_rock_3d_model.glb|3.5|3.5|0|16|1.0"
  "prop-outcrop|rocky_outcrop_3d_model.glb|6|6|0|16|1.0"
)

for job in "${JOBS[@]}"; do
  IFS='|' read -r name file fw fd rots px st <<<"$job"
  [ -n "$only" ] && [ "$only" != "$name" ] && continue
  for r in $rots; do
    out="$OUT/$name-r$r"
    case $name in road-*|intersection|prop-*|click-*) out="$OUT/$name";; esac
    echo "== $out"
    python3 scripts/render-sprite.py "$SRC/$file" "$out" "$fw" "$fd" "$r" "$px" 32 "$st" 2>&1 | grep -E "footprint|done|Error|Traceback"
    case $name in road-*|intersection) python3 scripts/sprite-top.py "$out";; esac
  done
done
