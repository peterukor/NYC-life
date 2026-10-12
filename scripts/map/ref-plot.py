import json, sys
from PIL import Image, ImageDraw, ImageFont
S=json.load(open('streets.json')); coast=json.load(open('manh-coast.json'))
sc=float(sys.argv[1]) if len(sys.argv)>1 else 0.4
x0,x1,z0,z1=-520,720,-2700,1500
if len(sys.argv)>2: x0,x1,z0,z1=map(float,sys.argv[2].split(','))
W,H=int((x1-x0)*sc),int((z1-z0)*sc)
im=Image.new('RGB',(W,H),'#9cc9e6'); d=ImageDraw.Draw(im)
P=lambda p:((p[0]-x0)*sc,(p[1]-z0)*sc)
for r in coast: d.polygon([P(p) for p in r], fill='#e9e4d6', outline='#777')
for n,v in S.items():
    for s in v['segs']: d.line([P(p) for p in s], fill='#bbb' if v['rw']==1 else '#c99', width=1)
hi=sys.argv[3].split('|') if len(sys.argv)>3 else []
for n in hi:
    for s in S.get(n,{'segs':[]})['segs']: d.line([P(p) for p in s], fill='#d00', width=2)
# grid ticks every 100
for z in range(int(z0)//100*100,int(z1),100): d.text((2,(z-z0)*sc),str(z),fill='#000')
for x in range(int(x0)//100*100,int(x1),200): d.text(((x-x0)*sc,2),str(x),fill='#000')
im.save(sys.argv[4] if len(sys.argv)>4 else 'ref.png'); print(W,H)
