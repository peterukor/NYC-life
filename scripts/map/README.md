# The 2D map, built in layers

Peter's plan (2026-10-12): no more 3D. The map is built in layers, each
checked before the next:

1. **Land** — the real borough outline (`scripts/geo-src`, NYC Open Data).
2. **Roads** — `build-borough.py <borough>`: a smooth shore road plus a
   hand-picked list of major real roads (`boroughs.py`), with their shape
   taken from the real street centre lines. Blocks are whatever land is left
   between roads (so shore blocks follow the water); small and odd-shaped
   ones are merged into a neighbour. Parks are traced and get a drive round
   them. Manhattan: 43 blocks. Brooklyn: 71.
3. **Buildings, lawns, trees, lamps, crossings** — `build-city.py <borough>`:
   a 16 m lot grid inside each block's sidewalk; a building is made only of
   whole cells that sit completely inside the block (nothing over a road
   or the water), smaller where a big one doesn't fit, lawn and trees in
   everything left over. Styles by neighbourhood (towers, apartments,
   brownstone rows). Drawn by `src/map2d/render.ts` (cartoon 2D, three-
   quarter view); look around with `map2d.html`:
   `npx vite build --config vite.map2d.config.ts && node scripts/qa-map2d.mjs`.
4. Player and NPCs (later)

Files:
- `extract-streets.py` — real street centre lines (NYC Open Data
  "Centerline", packaged by github.com/kjhealy/nycstreets, MIT) → game
  metres → `src/streets-all.json` (Manhattan) / `src/streets-<borough>.json`.
  Only needed to refresh those files.
- `boroughs.py` — per borough: roads to keep, parks, roads never merged away.
- `build-borough.py` — land + roads + blocks → `src/data/map/<borough>.json`.
- `preview-borough.py` — pictures for checking → `test-results/map/`.

```
pip install shapely pillow
python3 scripts/map/build-borough.py brooklyn && python3 scripts/map/preview-borough.py brooklyn
```

To add, drop or bend a road, edit the borough's list in `boroughs.py`.
