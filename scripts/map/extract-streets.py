"""
extract-streets.py — pull Manhattan's real street centre lines out of the
NYC street centreline dataset (NYC Open Data "Centerline"/LION, packaged as
github.com/kjhealy/nycstreets, MIT) and convert them to game metres with the
same projection as src/world/geo-proj.ts (Times Square = 0,0; rotated 29°
so avenues run up the screen; 1 game metre = 5 real metres).

Only used as REFERENCE for scripts/map/build-manhattan.py, which keeps a
handful of major roads and smooths them. Output: scripts/map/src/streets.json
(only the street names build-manhattan.py can ask for, to keep it small).

  git clone --depth 1 https://github.com/kjhealy/nycstreets /tmp/nycstreets
  pip install rdata pyproj
  python3 scripts/map/extract-streets.py /tmp/nycstreets/data/nyc_streets_sf.rda [borough]
"""
import json, math, sys, warnings, pathlib
import rdata
from pyproj import Transformer

warnings.filterwarnings('ignore')
HERE = pathlib.Path(__file__).parent
p = rdata.parser.parse_file(sys.argv[1])
d = rdata.conversion.convert(p, default_encoding='utf8')['nyc_streets_sf']
BORO = {'manhattan': '1', 'bronx': '2', 'brooklyn': '3', 'queens': '4', 'statenIsland': '5'}
which = sys.argv[2] if len(sys.argv) > 2 else 'manhattan'
m = d[d['boroughcod'].astype(str).str.strip() == BORO[which]]
t = Transformer.from_crs('EPSG:2263', 'EPSG:4326', always_xy=True)  # NY Long Island ftUS -> lat/lon

O = (40.758, -73.9855)
TH = math.radians(29)
COS_LAT = math.cos(math.radians(O[0]))


def proj(lon, lat):
    E = (lon - O[1]) * COS_LAT * 111320
    N = (lat - O[0]) * 110540
    return [round((E * math.cos(TH) - N * math.sin(TH)) * 0.2, 2), round(-(E * math.sin(TH) + N * math.cos(TH)) * 0.2, 2)]


out = {}
for _, r in m.iterrows():
    if r['rw_type'] not in (1.0, 2.0, 3.0):  # streets, highways, bridges
        continue
    name = str(r['stname_lab']).strip()
    for a in r['geometry']:
        lon, lat = t.transform(a[:, 0], a[:, 1])
        out.setdefault(name, {'rw': int(r['rw_type']), 'segs': []})['segs'].append([proj(x, y) for x, y in zip(lon, lat)])

(HERE / 'src').mkdir(exist_ok=True)
name = 'streets-all.json' if which == 'manhattan' else f'streets-{which}.json'
json.dump(out, open(HERE / 'src' / name, 'w'))
print(len(out), 'street names')
