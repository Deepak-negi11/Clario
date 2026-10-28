
from pathlib import Path
from PIL import Image, ImageDraw

S=2
OUT=Path(__file__).resolve().parents[2]/"apps/web/public/assets/custom"
OUT.mkdir(parents=True,exist_ok=True)
C={
"outline":(45,48,59),"shadow":(39,48,61,70),"wood":(145,89,58),"wood_l":(197,132,82),"wood_d":(94,57,43),
"blue":(45,139,213),"blue_l":(75,169,232),"blue_d":(29,91,159),"natural":(222,174,112),"natural_l":(244,207,153),"natural_d":(166,111,72),
"teal":(35,167,189),"teal_l":(72,208,214),"teal_d":(24,105,139),"red":(210,66,77),"red_l":(239,101,107),"red_d":(148,42,54),
"dark":(55,62,82),"dark_l":(90,101,128),"dark_d":(34,40,57),"grey":(164,178,196),"grey_l":(207,216,228),"grey_d":(104,119,143),
"cream":(224,180,121),"cream_l":(246,215,170),"cream_d":(168,116,76),"green":(74,143,82),"green_l":(112,184,105),"green_d":(43,92,57),
"caramel":(180,105,72),"caramel_l":(215,145,103),"caramel_d":(126,68,51),"white":(241,240,235),"screen":(99,205,209),
}
def q(v):return round(v*S)
def rgba(c):return c if len(c)==4 else (*c,255)
def cv(w,h):return Image.new("RGBA",(q(w),q(h)),(0,0,0,0))
def dr(im):return ImageDraw.Draw(im,"RGBA")
def rr(d,xy,f,o=None,r=0,w=1):d.rounded_rectangle(tuple(q(v) for v in xy),radius=q(r),fill=rgba(f),outline=rgba(o) if o else None,width=q(w))
def el(d,xy,f,o=None,w=1):d.ellipse(tuple(q(v) for v in xy),fill=rgba(f),outline=rgba(o) if o else None,width=q(w))
def ln(d,xy,f,w=1):d.line(tuple(q(v) for v in xy),fill=rgba(f),width=q(w),joint="curve")
def poly(d,p,f,o=None,w=1):
 p=[(q(x),q(y)) for x,y in p];d.polygon(p,fill=rgba(f))
 if o:d.line(p+[p[0]],fill=rgba(o),width=q(w),joint="curve")
def save(im,n):im.resize((im.width//S,im.height//S),Image.Resampling.LANCZOS).save(OUT/f"{n}.png");print("wrote",n)

def chair(family, direction, frame, frame_l, frame_d, cushion, cushion_l, cushion_d, modern=False):
 im=cv(44,48);d=dr(im);o=C["outline"]

 el(d,(5,38,39,47),C["shadow"])
 if direction=="down":
  rr(d,(7,3,37,13),frame,o,4); rr(d,(10,5,34,11),cushion,o,3);ln(d,(13,7,31,7),cushion_l,1)
  rr(d,(5,11,10,35),frame,o,2);rr(d,(34,11,39,35),frame_d,o,2)
  rr(d,(9,19,35,36),cushion,o,5);ln(d,(13,22,31,22),cushion_l,2)
  rr(d,(8,34,13,43),frame_d,o,1);rr(d,(31,34,36,43),frame_d,o,1)
 elif direction=="up":
  rr(d,(9,8,35,25),cushion,o,5);ln(d,(13,11,31,11),cushion_l,2)
  rr(d,(5,9,10,32),frame_l,o,2);rr(d,(34,9,39,32),frame_d,o,2)
  rr(d,(7,25,37,39),frame,o,4);rr(d,(10,27,34,36),cushion_d,o,3);ln(d,(13,29,31,29),cushion,1)
  rr(d,(8,37,13,44),frame_d,o,1);rr(d,(31,37,36,44),frame_d,o,1)
 elif direction=="right":
  rr(d,(5,5,15,39),frame,o,4);rr(d,(7,8,13,35),cushion_d,o,3)
  rr(d,(13,11,37,17),frame_l,o,2);rr(d,(13,33,37,39),frame_d,o,2)
  rr(d,(14,15,36,35),cushion,o,5);ln(d,(17,18,32,18),cushion_l,2)
  rr(d,(11,36,16,44),frame_d,o,1);rr(d,(33,35,38,42),frame_d,o,1)
 else:
  rr(d,(29,5,39,39),frame_d,o,4);rr(d,(31,8,37,35),cushion_d,o,3)
  rr(d,(7,11,31,17),frame_l,o,2);rr(d,(7,33,31,39),frame,o,2)
  rr(d,(8,15,30,35),cushion,o,5);ln(d,(12,18,27,18),cushion_l,2)
  rr(d,(6,35,11,42),frame_d,o,1);rr(d,(28,36,33,44),frame_d,o,1)
 if modern:

  ln(d,(11,42,33,42),C["dark_d"],2);rr(d,(9,41,13,45),C["grey_d"],o,1);rr(d,(31,41,35,45),C["grey_d"],o,1)
 save(im,f"ref-{family}-{direction}")

families={
"blue-wood":(C["wood"],C["wood_l"],C["wood_d"],C["blue"],C["blue_l"],C["blue_d"],False),
"natural":(C["natural"],C["natural_l"],C["natural_d"],C["cream"],C["cream_l"],C["cream_d"],False),
"woven-teal":(C["dark"],C["grey_l"],C["dark_d"],C["teal"],C["teal_l"],C["teal_d"],True),
"conference-red":(C["red"],C["red_l"],C["red_d"],C["red"],C["red_l"],C["red_d"],True),
"task-dark":(C["dark"],C["dark_l"],C["dark_d"],C["dark_l"],C["grey_l"],C["dark"],True),
}
for fam,args in families.items():
 for direction in ("up","down","left","right"):chair(fam,direction,*args)

def round_table(name,top,front,props):
 im=cv(66,54);d=dr(im);o=C["outline"];el(d,(6,40,60,52),C["shadow"]);el(d,(3,5,63,39),front,o);el(d,(3,2,63,34),top,o);el(d,(8,5,58,29),C["grey_l"] if top==C["grey"] else C["cream_l"])
 rr(d,(28,34,38,45),front,o,2);rr(d,(18,43,48,48),C["dark_d"],o,2)
 if "papers" in props:rr(d,(17,10,38,24),C["white"],C["grey_d"],1);ln(d,(21,14,34,14),C["blue"],1);rr(d,(40,13,46,29),C["blue_d"],o,2)
 if "books" in props:rr(d,(31,8,49,22),C["green"],o,1);rr(d,(16,13,36,27),C["white"],C["grey_d"],1)
 if "coffee" in props:rr(d,(24,9,35,21),C["blue"],o,3);rr(d,(39,12,48,25),C["dark"],o,2)
 save(im,name)
round_table("ref-table-data",C["grey"],C["grey_d"],"papers")
round_table("ref-table-books",C["grey"],C["grey_d"],"books")
round_table("ref-table-coffee",C["grey"],C["grey_d"],"coffee")
round_table("ref-table-lounge",C["cream"],C["cream_d"],"coffee")

def wall_unit(name,kind):
 im=cv(96,70);d=dr(im);o=C["outline"]
 if kind=="coffee":
  rr(d,(1,21,94,66),C["grey"],o,2);rr(d,(3,23,92,35),C["white"],o,1);rr(d,(12,2,50,31),C["dark"],o,3);rr(d,(17,7,45,20),C["grey_d"],o,2);el(d,(27,8,39,18),C["white"],o);ln(d,(17,24,43,24),C["dark_d"],2)
  for x in (7,37,67):rr(d,(x,39,x+22,61),C["grey_d"],o,1);rr(d,(x+8,45,x+14,49),C["grey_l"],o,1)
 elif kind=="aquarium":
  rr(d,(2,18,94,62),C["dark"],o,3);rr(d,(7,22,89,48),C["screen"],o,2);poly(d,[(9,43),(28,32),(43,39),(63,28),(87,42),(87,47),(9,47)],C["teal_d"])
  for x,y in ((20,29),(53,35),(74,27)):el(d,(x,y,x+5,y+3),C["cream_l"])
  rr(d,(8,62,16,68),C["dark_d"],o,1);rr(d,(80,62,88,68),C["dark_d"],o,1)
 elif kind=="books":
  rr(d,(1,2,94,67),C["dark"],o,2)
  colors=[C["blue"],C["red"],C["natural"],C["teal"],C["grey_l"]]
  for row in range(3):
   y=8+row*18;rr(d,(6,y,89,y+13),C["dark_d"],o,1)
   for i,x in enumerate(range(9,85,9)):rr(d,(x,y+2,x+5,y+12),colors[(i+row)%len(colors)],None,1)
 save(im,name)
wall_unit("ref-coffee-station","coffee");wall_unit("ref-aquarium-console","aquarium");wall_unit("ref-wall-books","books")

def lounge_sofa():
 im=cv(102,52);d=dr(im);o=C["outline"];el(d,(4,40,98,50),C["shadow"]);rr(d,(3,5,99,40),C["caramel_d"],o,6);rr(d,(6,4,96,24),C["caramel"],o,6)
 for x in (10,38,66):rr(d,(x,7,x+24,24),C["caramel"],C["caramel_d"],4);ln(d,(x+4,10,x+20,10),C["caramel_l"],2)
 rr(d,(1,10,12,42),C["caramel"],o,5);rr(d,(90,10,101,42),C["caramel_d"],o,5)
 for x in (12,39,66):rr(d,(x,25,x+26,40),C["caramel"],C["caramel_d"],4);ln(d,(x+4,28,x+22,28),C["caramel_l"],2)
 rr(d,(14,40,21,47),C["wood_d"],o,1);rr(d,(81,40,88,47),C["wood_d"],o,1);save(im,"ref-lounge-sofa")
lounge_sofa()


sheet=Image.new("RGBA",(5*120,4*100),(232,223,204,255));sd=ImageDraw.Draw(sheet)
for col,fam in enumerate(families):
 for row,direction in enumerate(("down","right","up","left")):
  asset=Image.open(OUT/f"ref-{fam}-{direction}.png")
  sheet.alpha_composite(asset,(col*120+38,row*100+24));sd.text((col*120+5,row*100+5),f"{fam} {direction}",fill=(35,38,48,255))
sheet.save(OUT/"ref-chair-contact-sheet.png")
print("wrote contact sheet")
