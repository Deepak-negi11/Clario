
from pathlib import Path
from PIL import Image, ImageDraw

S = 3
OUT = Path(__file__).resolve().parents[2] / "apps/web/public/assets/custom"
OUT.mkdir(parents=True, exist_ok=True)

COLORS = {
    "green": (57, 112, 72), "green_l": (85, 143, 91), "green_d": (35, 74, 49),
    "teal": (54, 151, 132), "teal_l": (91, 190, 167), "teal_d": (35, 102, 92),
    "cream": (216, 179, 126), "cream_l": (238, 211, 166), "cream_d": (167, 126, 82),
    "caramel": (174, 104, 72), "caramel_l": (206, 138, 99), "caramel_d": (124, 70, 53),
    "red": (191, 72, 79), "red_l": (224, 108, 111), "red_d": (137, 45, 56),
    "purple": (119, 91, 166), "purple_l": (157, 126, 204), "purple_d": (79, 59, 119),
    "wood": (145, 99, 61), "wood_l": (199, 150, 98), "wood_d": (94, 63, 43),
    "slate": (62, 72, 88), "slate_l": (104, 118, 137), "slate_d": (38, 45, 58),
    "outline": (38, 40, 47), "shadow": (28, 34, 40, 75), "white": (239, 237, 226),
}

def sc(v): return round(v * S)
def rgba(c): return c if len(c) == 4 else (*c, 255)
def canvas(w, h): return Image.new("RGBA", (sc(w), sc(h)), (0, 0, 0, 0))
def draw(img): return ImageDraw.Draw(img, "RGBA")
def box(d, xy, fill, outline=None, width=1, radius=0):
    xy = tuple(sc(v) for v in xy)
    if radius:
        d.rounded_rectangle(xy, radius=sc(radius), fill=rgba(fill), outline=rgba(outline) if outline else None, width=sc(width))
    else:
        d.rectangle(xy, fill=rgba(fill), outline=rgba(outline) if outline else None, width=sc(width))
def ellipse(d, xy, fill, outline=None, width=1):
    d.ellipse(tuple(sc(v) for v in xy), fill=rgba(fill), outline=rgba(outline) if outline else None, width=sc(width))
def line(d, xy, fill, width=1): d.line(tuple(sc(v) for v in xy), fill=rgba(fill), width=sc(width))
def polygon(d, pts, fill, outline=None, width=1):
    pts = [(sc(x), sc(y)) for x, y in pts]
    d.polygon(pts, fill=rgba(fill))
    if outline: d.line(pts + [pts[0]], fill=rgba(outline), width=sc(width), joint="curve")
def save(img, name):
    img.resize((img.width // S, img.height // S), Image.Resampling.LANCZOS).save(OUT / f"{name}.png")
    print(f"wrote {name}.png {img.width // S}x{img.height // S}")


def sofa(name, base, light, dark, seats=3):
    w = 92 if seats == 3 else 66
    img = canvas(w, 48); d = draw(img); o = COLORS["outline"]
    ellipse(d, (5, 35, w-4, 47), COLORS["shadow"])
    box(d, (3, 6, w-4, 36), dark, o, 1, 6)
    box(d, (5, 4, w-6, 21), base, o, 1, 6)

    inner = w - 18; cw = inner / seats
    for i in range(seats):
        x = 9 + i*cw
        box(d, (x, 7, x+cw-2, 21), base, dark, 1, 4)
        line(d, (x+3, 9, x+cw-5, 9), light, 2)
        ellipse(d, (x+cw/2-1, 14, x+cw/2+1, 16), dark)

    box(d, (1, 10, 12, 36), base, o, 1, 5)
    box(d, (w-13, 10, w-2, 36), base, o, 1, 5)
    for i in range(seats):
        x = 12 + i*((w-24)/seats)
        box(d, (x, 22, x+(w-24)/seats-1, 35), base, dark, 1, 4)
        line(d, (x+3, 24, x+(w-24)/seats-4, 24), light, 1)
    box(d, (11, 35, w-12, 40), dark, o, 1, 2)
    box(d, (12, 40, 18, 44), COLORS["wood_d"], o, 1, 1)
    box(d, (w-19, 40, w-13, 44), COLORS["wood_d"], o, 1, 1)
    save(img, name)


def tufted_chair(name, base, light, dark, direction="down"):
    w, h = (52, 58) if direction in ("up", "down") else (58, 52)
    img = canvas(w, h); d = draw(img); o = COLORS["outline"]
    ellipse(d, (6, h-15, w-5, h-3), COLORS["shadow"])
    if direction in ("down", "up"):

        polygon(d, [(8,25),(5,13),(11,5),(19,2),(26,5),(33,2),(41,5),(47,13),(44,35),(38,45),(13,45)], dark, o)
        box(d, (10, 9, 42, 35), base, o, 1, 10)
        polygon(d, [(13,10),(20,7),(26,11),(32,7),(39,10),(37,25),(15,25)], light, dark)
        for x,y in ((18,14),(26,17),(34,14),(21,23),(31,23)):
            ellipse(d, (x-1,y-1,x+1,y+1), dark)
        box(d, (2, 20, 13, 45), base, o, 1, 5); box(d, (39, 20, 50, 45), base, o, 1, 5)
        box(d, (12, 30, 40, 48), base, o, 1, 5); line(d, (15,33,37,33), light, 2)
        box(d, (10, 47, 16, 53), COLORS["wood_d"], o, 1, 1); box(d, (36,47,42,53), COLORS["wood_d"], o, 1, 1)
        if direction == "up": img = img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    else:

        back_x = 4 if direction == "right" else 37
        box(d, (back_x, 5, back_x+16, 43), base, o, 1, 7)
        sx = 15 if direction == "right" else 8
        box(d, (sx, 23, sx+36, 44), base, o, 1, 6)
        line(d, (sx+4,26,sx+31,26), light, 2)
        ax = 42 if direction == "right" else 6
        box(d, (ax, 18, ax+10, 45), dark, o, 1, 4)
        box(d, (sx+4, 44, sx+9, 49), COLORS["wood_d"], o, 1, 1)
        box(d, (sx+29, 44, sx+34, 49), COLORS["wood_d"], o, 1, 1)
    save(img, name)


def task_chair(name, base, light, dark, direction):
    img = canvas(34, 44); d = draw(img); o = COLORS["outline"]
    metal = COLORS["slate_d"]

    ellipse(d, (4, 35, 30, 42), COLORS["shadow"])
    if direction == "down":
        box(d, (7, 3, 27, 23), base, o, 1, 6)
        for x in (11, 15, 19, 23): line(d, (x, 7, x, 18), light, 1)
        box(d, (5, 20, 29, 31), dark, o, 1, 5)
        line(d, (9, 23, 25, 23), light, 1)
        box(d, (1, 18, 6, 29), dark, o, 1, 2)
        box(d, (28, 18, 33, 29), dark, o, 1, 2)
    elif direction == "up":
        box(d, (5, 5, 29, 17), dark, o, 1, 5)
        line(d, (9, 8, 25, 8), light, 1)
        box(d, (1, 7, 6, 20), dark, o, 1, 2)
        box(d, (28, 7, 33, 20), dark, o, 1, 2)
        box(d, (7, 14, 27, 33), base, o, 1, 6)
        for x in (11, 15, 19, 23): line(d, (x, 19, x, 29), light, 1)
    else:
        back_x = 4 if direction == "right" else 20
        seat_x = 11 if direction == "right" else 3
        box(d, (back_x, 4, back_x + 10, 28), base, o, 1, 4)
        line(d, (back_x + 4, 8, back_x + 4, 23), light, 1)
        box(d, (seat_x, 21, seat_x + 20, 32), dark, o, 1, 4)
        line(d, (seat_x + 4, 24, seat_x + 16, 24), light, 1)
    line(d, (17, 31, 17, 36), metal, 2)
    line(d, (7, 38, 27, 38), metal, 2)
    line(d, (17, 35, 6, 42), metal, 2)
    line(d, (17, 35, 28, 42), metal, 2)
    save(img, name)


def wooden_chair(name, direction):


    img = canvas(44, 48); d = draw(img); o = COLORS["outline"]
    wood, wood_l, wood_d = COLORS["wood"], COLORS["wood_l"], COLORS["wood_d"]
    cream, cream_l, cream_d = COLORS["cream"], COLORS["cream_l"], COLORS["cream_d"]
    ellipse(d, (5, 38, 39, 47), COLORS["shadow"])
    if direction == "down":
        box(d, (7, 3, 37, 13), wood_l, o, 1, 4)
        for x in (10, 17, 24, 31): box(d, (x, 11, x + 2, 24), wood, o, 1, 1)
        box(d, (5, 11, 10, 35), wood, o, 1, 2)
        box(d, (34, 11, 39, 35), wood_d, o, 1, 2)
        box(d, (9, 19, 35, 36), cream, o, 1, 5)
        line(d, (13, 22, 31, 22), cream_l, 2)
        box(d, (8, 34, 13, 43), wood_d, o, 1, 1)
        box(d, (31, 34, 36, 43), wood_d, o, 1, 1)
    elif direction == "up":
        box(d, (9, 8, 35, 25), cream, o, 1, 5)
        line(d, (13, 11, 31, 11), cream_l, 2)
        box(d, (5, 9, 10, 32), wood_l, o, 1, 2)
        box(d, (34, 9, 39, 32), wood_d, o, 1, 2)
        box(d, (7, 25, 37, 39), wood_l, o, 1, 4)
        for x in (11, 18, 25, 32): box(d, (x, 24, x + 2, 36), wood, o, 1, 1)
        box(d, (10, 27, 34, 36), cream_d, o, 1, 3)
        line(d, (13, 29, 31, 29), cream, 1)
        box(d, (8, 37, 13, 44), wood_d, o, 1, 1)
        box(d, (31, 37, 36, 44), wood_d, o, 1, 1)
    elif direction == "right":
        box(d, (5, 5, 15, 39), wood, o, 1, 4)
        box(d, (7, 8, 13, 35), wood_l, o, 1, 3)
        box(d, (13, 11, 37, 17), wood_l, o, 1, 2)
        box(d, (13, 33, 37, 39), wood_d, o, 1, 2)
        box(d, (14, 15, 36, 35), cream, o, 1, 5)
        line(d, (17, 18, 32, 18), cream_l, 2)
        box(d, (11, 36, 16, 44), wood_d, o, 1, 1)
        box(d, (33, 35, 38, 42), wood_d, o, 1, 1)
    else:
        box(d, (29, 5, 39, 39), wood_d, o, 1, 4)
        box(d, (31, 8, 37, 35), wood, o, 1, 3)
        box(d, (7, 11, 31, 17), wood_l, o, 1, 2)
        box(d, (7, 33, 31, 39), wood, o, 1, 2)
        box(d, (8, 15, 30, 35), cream, o, 1, 5)
        line(d, (12, 18, 27, 18), cream_l, 2)
        box(d, (6, 35, 11, 42), wood_d, o, 1, 1)
        box(d, (28, 36, 33, 44), wood_d, o, 1, 1)
    save(img, name)


def pouf(name, base, light, dark):
    img=canvas(34,28); d=draw(img); o=COLORS["outline"]
    ellipse(d,(3,16,31,27),COLORS["shadow"]); ellipse(d,(2,3,32,24),dark,o)
    ellipse(d,(4,2,30,20),base,o); line(d,(9,7,24,5),light,2); line(d,(17,4,17,20),dark,1)
    save(img,name)


def side_table():
    img=canvas(38,38); d=draw(img); o=COLORS["outline"]
    ellipse(d,(3,27,35,36),COLORS["shadow"]); ellipse(d,(2,3,36,23),COLORS["cream_d"],o)
    ellipse(d,(3,1,35,20),COLORS["cream"],o); ellipse(d,(7,4,31,16),COLORS["cream_l"])
    box(d,(16,20,22,31),COLORS["wood"],o,1,1); box(d,(10,30,28,34),COLORS["wood_d"],o,1,2)
    save(img,"campus-side-table")


def reception_bench():
    img=canvas(96,46); d=draw(img); o=COLORS["outline"]
    ellipse(d,(3,34,93,44),COLORS["shadow"])
    box(d,(2,6,93,18),COLORS["cream_l"],o,1,2); line(d,(8,10,87,10),COLORS["white"],2)
    box(d,(5,18,91,36),COLORS["cream"],o,1,1)
    line(d,(32,19,32,35),COLORS["wood_d"],2); line(d,(63,19,63,35),COLORS["wood_d"],2)
    box(d,(5,35,12,41),COLORS["wood_d"],o,1,1); box(d,(84,35,91,41),COLORS["wood_d"],o,1,1)
    save(img,"campus-reception-bench")


sofa("campus-sofa-green", COLORS["green"], COLORS["green_l"], COLORS["green_d"])
sofa("campus-sofa-cream", COLORS["cream"], COLORS["cream_l"], COLORS["cream_d"])
sofa("campus-sofa-caramel", COLORS["caramel"], COLORS["caramel_l"], COLORS["caramel_d"])
sofa("campus-loveseat-green", COLORS["green"], COLORS["green_l"], COLORS["green_d"], 2)
for direction in ("up","down","left","right"):
    tufted_chair(f"campus-tufted-green-{direction}",COLORS["green"],COLORS["green_l"],COLORS["green_d"],direction)
    tufted_chair(f"campus-club-teal-{direction}",COLORS["teal"],COLORS["teal_l"],COLORS["teal_d"],direction)
    task_chair(f"campus-task-teal-{direction}",COLORS["teal"],COLORS["teal_l"],COLORS["teal_d"],direction)
    task_chair(f"campus-conf-red-{direction}",COLORS["red"],COLORS["red_l"],COLORS["red_d"],direction)
    wooden_chair(f"campus-wood-chair-{direction}",direction)
pouf("campus-pouf-purple",COLORS["purple"],COLORS["purple_l"],COLORS["purple_d"])
pouf("campus-pouf-blue",COLORS["teal"],COLORS["teal_l"],COLORS["teal_d"])
side_table()
reception_bench()
