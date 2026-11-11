import sys
from PIL import Image, ImageDraw
ref = Image.open(sys.argv[1]).convert('RGB')
L,R,T,B = 184,918,978,1117; w=R-L; h=B-T
def P(u,v): return (L+u*w, B+v*h)
segs=[((-0.02,0.42),(0.15,0.42),(0.35,0.42),(0.47,0.42)),
((0.47,0.42),(0.60,0.42),(0.75,0.30),(0.92,0.30)),
((0.92,0.30),(1.05,0.30),(1.17,0.40),(1.175,0.63)),
((1.175,0.63),(1.18,0.85),(1.02,1.13),(0.90,1.13)),
((0.90,1.13),(0.80,1.13),(0.77,0.95),(0.84,0.86)),
((0.84,0.86),(0.90,0.72),(0.98,0.62),(1.06,0.62)),
((1.06,0.62),(1.14,0.62),(1.22,0.78),(1.285,0.89))]
def bez(p0,c1,c2,p1,t): return tuple((1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d for a,b,c,d in zip(p0,c1,c2,p1))
pts=[P(*bez(*s,i/40)) for s in segs for i in range(41)]
ov=ref.copy(); d=ImageDraw.Draw(ov); d.line(pts,fill=(0,160,255),width=6,joint='curve')
ov.crop((120,900,1179,1320)).save(sys.argv[2])
# standalone render on new text width
