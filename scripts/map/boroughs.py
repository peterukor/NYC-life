"""
boroughs.py — what build-borough.py builds for each borough: which real
roads to keep, which parks, which roads may never be merged away.

ROAD fields: `names` = real street names to take the shape from (as in the
NYC street centre line data); `axis` = which way the road runs: 'z'
north–south, 'x' east–west, or 'auto' (its own main direction); `w` = width
(m); optional `range` = keep only this stretch along the axis (game metres;
'auto' roads measure from the middle of the road), `extend` = how far an
end may be carried on to reach the next road (default 90 m).
"""

MANHATTAN_ROADS = [
    # ---- north–south
    {'id': 'broadway', 'name': 'Broadway', 'names': ['BROADWAY'], 'axis': 'z', 'w': 13, 'kind': 'avenue'},
    # 10th Ave only below 59th: further north it runs right beside Broadway
    # and would leave thin strips of blocks.
    {'id': 'tenth', 'name': '10th Ave', 'names': ['10 AVE'], 'axis': 'z', 'w': 12, 'kind': 'avenue', 'range': (-240, 480)},
    {'id': 'cpw', 'name': 'Central Park West', 'names': ['8 AVE', 'CENTRAL PARK W', 'FREDERICK DOUGLASS BLVD'], 'axis': 'z', 'w': 12, 'kind': 'avenue', 'range': (-1720, 470)},
    {'id': 'fifth', 'name': '5th Ave', 'names': ['5 AVE'], 'axis': 'z', 'w': 13, 'kind': 'avenue'},
    # The Bowery carries on south to the shore road (it really runs on to the Brooklyn Bridge).
    {'id': 'third', 'name': '3rd Ave', 'names': ['BOWERY', '3 AVE'], 'axis': 'z', 'w': 12, 'kind': 'avenue', 'extend': 260.0},
    {'id': 'stnicholas', 'name': 'St Nicholas Ave', 'names': ['ST NICHOLAS AVE'], 'axis': 'z', 'w': 11, 'kind': 'avenue', 'range': (-2300, -1100)},
    # ---- east–west
    {'id': 'dyckman', 'name': 'Dyckman St', 'names': ['DYCKMAN ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
    {'id': 's181', 'name': 'W 181st St', 'names': ['W 181 ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
    {'id': 's155', 'name': 'W 155th St', 'names': ['W 155 ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
    {'id': 's125', 'name': '125th St', 'names': ['W 125 ST', 'E 125 ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 's110', 'name': '110th St', 'names': ['CATHEDRAL PKWY', 'CENTRAL PARK N', 'E 110 ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 'w86', 'name': 'W 86th St', 'names': ['W 86 ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
    {'id': 'e86', 'name': 'E 86th St', 'names': ['E 86 ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
    {'id': 's59', 'name': '59th St', 'names': ['W 59 ST', 'CENTRAL PARK S', 'E 59 ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 's42', 'name': '42nd St', 'names': ['W 42 ST', 'E 42 ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 's23', 'name': '23rd St', 'names': ['W 23 ST', 'E 23 ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
    {'id': 's14', 'name': '14th St', 'names': ['W 14 ST', 'E 14 ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 'houston', 'name': 'Houston St', 'names': ['W HOUSTON ST', 'E HOUSTON ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 'delancey', 'name': 'Delancey St', 'names': ['DELANCEY ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 'canal', 'name': 'Canal St', 'names': ['CANAL ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 'chambers', 'name': 'Chambers St', 'names': ['CHAMBERS ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
    {'id': 'fulton', 'name': 'Fulton St', 'names': ['FULTON ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
]


BROOKLYN_ROADS = [
    # ---- the long diagonals and avenues
    {'id': 'flatbush', 'name': 'Flatbush Ave', 'names': ['FLATBUSH AVE', 'FLATBUSH AVE EXT'], 'w': 13, 'kind': 'avenue'},
    {'id': 'ocean', 'name': 'Ocean Pkwy', 'names': ['OCEAN PKWY'], 'w': 13, 'kind': 'avenue'},
    {'id': 'fourth', 'name': '4th Ave', 'names': ['4 AVE'], 'w': 12, 'kind': 'avenue'},
    {'id': 'bedford', 'name': 'Bedford Ave', 'names': ['BEDFORD AVE'], 'w': 12, 'kind': 'avenue'},
    {'id': 'nostrand', 'name': 'Nostrand Ave', 'names': ['NOSTRAND AVE'], 'w': 12, 'kind': 'avenue'},
    {'id': 'utica', 'name': 'Utica Ave', 'names': ['UTICA AVE'], 'w': 12, 'kind': 'avenue'},
    {'id': 'ralph', 'name': 'Ralph Ave', 'names': ['RALPH AVE'], 'w': 11, 'kind': 'avenue'},
    {'id': 'penn', 'name': 'Pennsylvania Ave', 'names': ['PENNSYLVANIA AVE'], 'w': 12, 'kind': 'avenue'},
    {'id': 'fthamilton', 'name': 'Fort Hamilton Pkwy', 'names': ['FORT HAMILTON PKWY', 'FORT HAMILTON PARKWAY'], 'w': 12, 'kind': 'avenue', 'extend': 320.0},
    {'id': 'newutrecht', 'name': 'New Utrecht Ave', 'names': ['NEW UTRECHT AVE'], 'w': 11, 'kind': 'avenue', 'extend': 320.0},
    {'id': 'bayparkway', 'name': 'Bay Pkwy', 'names': ['BAY PKWY'], 'w': 11, 'kind': 'avenue'},
    {'id': 'court', 'name': 'Court St', 'names': ['COURT ST'], 'w': 11, 'kind': 'avenue', 'extend': 200.0},
    {'id': 'manhattanave', 'name': 'Manhattan Ave', 'names': ['MANHATTAN AVE'], 'w': 11, 'kind': 'avenue', 'box': (0, 0, 2000, 600)},
    {'id': 'bushwick', 'name': 'Bushwick Ave', 'names': ['BUSHWICK AVE'], 'w': 11, 'kind': 'avenue', 'box': (0, 0, 1750, 4000)},
    {'id': 'rockaway', 'name': 'Rockaway Pkwy', 'names': ['ROCKAWAY PKWY'], 'w': 12, 'kind': 'avenue', 'extend': 300.0},
    {'id': 'seaview', 'name': 'Seaview Ave', 'names': ['SEAVIEW AVE'], 'w': 11, 'kind': 'street'},
    {'id': 'bergen', 'name': 'Bergen Ave', 'names': ['BERGEN AVE'], 'w': 11, 'kind': 'avenue', 'extend': 200.0},
    {'id': 'avn', 'name': 'Ave N', 'names': ['AVE N'], 'w': 11, 'kind': 'street', 'box': (2100, 0, 4000, 4000)},
    {'id': 'stillwell', 'name': 'Stillwell Ave', 'names': ['STILLWELL AVE'], 'w': 11, 'kind': 'avenue'},
    {'id': 'kings', 'name': 'Kings Hwy', 'names': ['KINGS HWY'], 'w': 12, 'kind': 'street', 'smooth': 12},
    # ---- the cross streets
    {'id': 'nassau', 'name': 'Nassau Ave', 'names': ['NASSAU AVE'], 'w': 11, 'kind': 'street'},
    {'id': 'metropolitan', 'name': 'Metropolitan Ave', 'names': ['METROPOLITAN AVE'], 'w': 11, 'kind': 'street'},
    {'id': 'broadwaybk', 'name': 'Broadway', 'names': ['BROADWAY'], 'w': 12, 'kind': 'street'},
    {'id': 'myrtle', 'name': 'Myrtle Ave', 'names': ['MYRTLE AVE'], 'w': 11, 'kind': 'street'},
    {'id': 'atlantic', 'name': 'Atlantic Ave', 'names': ['ATLANTIC AVE'], 'w': 13, 'kind': 'street', 'box': (0, 0, 4000, 1600)},
    {'id': 'eastern', 'name': 'Eastern Pkwy', 'names': ['EASTERN PKWY'], 'w': 13, 'kind': 'street'},
    {'id': 'hamilton', 'name': 'Hamilton Ave', 'names': ['HAMILTON AVE'], 'w': 11, 'kind': 'street'},
    {'id': 'church', 'name': 'Church Ave', 'names': ['CHURCH AVE'], 'w': 11, 'kind': 'street'},
    {'id': 'linden', 'name': 'Linden Blvd', 'names': ['LINDEN BLVD'], 'w': 12, 'kind': 'street'},
    {'id': 'bk65', 'name': '65th St', 'names': ['65 ST'], 'w': 11, 'kind': 'street'},
    {'id': 'avej', 'name': 'Ave J', 'names': ['AVE J'], 'w': 11, 'kind': 'street'},
    {'id': 'bk86', 'name': '86th St', 'names': ['86 ST'], 'w': 11, 'kind': 'street'},
    {'id': 'avu', 'name': 'Ave U', 'names': ['AVE U'], 'w': 11, 'kind': 'street'},
    {'id': 'flatlands', 'name': 'Flatlands Ave', 'names': ['FLATLANDS AVE'], 'w': 11, 'kind': 'street'},
    {'id': 'neptune', 'name': 'Neptune Ave', 'names': ['NEPTUNE AVE'], 'w': 11, 'kind': 'street'},
]


BOROUGHS = {
    'manhattan': {
        'name': 'Manhattan',
        'geoName': 'manhattan',
        'prefix': 'm',
        'streets': 'streets-all.json',
        'roads': MANHATTAN_ROADS,
        'islands': [('Randall’s Island', 1), ('Governors Island', 2), ('Roosevelt Island', 3)],
        'parks': [('Central Park', 40.7812, -73.9665)],
        'riversideStrips': True,
        # Never cut by a merge (they're what makes it Manhattan).
        'keep': ['broadway', 'fifth', 'cpw', 's59', 's42', 's14', 's110', 's125', 'houston', 'canal'],
    },
    'brooklyn': {
        'name': 'Brooklyn',
        'geoName': 'brooklyn',
        'prefix': 'b',
        'streets': 'streets-brooklyn.json',
        'roads': BROOKLYN_ROADS,
        # Real parks, roughly traced (lat, lon): a drive runs round each and
        # the inside is one park block.
        'parkAreas': [
            ('Prospect Park', [(40.6729, -73.9702), (40.6612, -73.9797), (40.6513, -73.9726), (40.6545, -73.9616), (40.6620, -73.9620)]),
            ('Green-Wood Cemetery', [(40.6585, -73.9955), (40.6610, -73.9890), (40.6525, -73.9780), (40.6450, -73.9830), (40.6470, -73.9950)]),
            ('Marine Park', [(40.6120, -73.9330), (40.6100, -73.9150), (40.5920, -73.9200), (40.5970, -73.9350)]),
            ('Floyd Bennett Field', [(40.5985, -73.8980), (40.5960, -73.8800), (40.5790, -73.8850), (40.5820, -73.9020)]),
            ('Dyker Beach Park', [(40.6155, -74.0230), (40.6150, -74.0140), (40.6050, -74.0130), (40.6060, -74.0230)]),
        ],
        # Brooklyn is bigger and lower: bigger blocks.
        'mergeSmall': 30000.0,
        'mergeThinMax': 50000.0,
        'mergedMax': 180000.0,
        # Brooklyn's roads are already few and far between: only the minor
        # ones may be merged away.
        'keep': ['flatbush', 'ocean', 'atlantic', 'eastern', 'fourth', 'kings', 'broadwaybk', 'linden', 'flatlands', 'rockaway', 'bedford', 'nostrand', 'utica',
                 'court', 'fthamilton', 'newutrecht', 'bayparkway', 'bk65', 'bk86', 'church', 'penn', 'seaview', 'avn', 'manhattanave'],
    },
}
