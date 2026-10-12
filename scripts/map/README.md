# The 2D map, built in layers

Peter's plan (2026-10-12): no more 3D. The map is built in layers, each
checked before the next:

1. **Land** — the real borough outline (`scripts/geo-src`, NYC Open Data).
2. **Roads** — `build-manhattan.py`: a smooth shore road plus a hand-picked
   list of major real roads, with their shape taken from the real street
   centre lines. Blocks are whatever land is left between roads (so shore
   blocks follow the water). About 50 big blocks for all of Manhattan.
3. Houses, trees, street lights… (next)
4. Player and NPCs (later)

Files:
- `extract-streets.py` — real street centre lines (NYC Open Data
  "Centerline", packaged by github.com/kjhealy/nycstreets, MIT) → game
  metres → `src/streets-all.json`. Only needed to refresh that file.
- `build-manhattan.py` — land + roads + blocks → `src/data/map/manhattan.json`.
- `preview-manhattan.py` — pictures for checking → `test-results/map/`.

```
pip install shapely pillow
python3 scripts/map/build-manhattan.py && python3 scripts/map/preview-manhattan.py
```

To add, drop or bend a road, edit `ROADS` in `build-manhattan.py`.
