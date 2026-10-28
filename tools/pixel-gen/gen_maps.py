import os
from PIL import Image, ImageDraw

OUT = os.path.normpath(os.path.join(os.path.dirname(__file__), "../../apps/web/public/assets/maps"))
os.makedirs(OUT, exist_ok=True)


def preview(name, campus=False):
    scale = 4
    img = Image.new("RGB", (160, 90), (128, 194, 104))
    d = ImageDraw.Draw(img)
    wood = (233, 220, 192)
    wall = (83, 91, 105)
    office = (185, 193, 222)
    cafe = (234, 230, 219)
    lounge = (222, 205, 176)
    if campus:
        d.rectangle((10, 19, 149, 82), fill=wood, outline=wall, width=2)
        d.rectangle((12, 21, 43, 39), fill=(198, 218, 205))
        d.rectangle((116, 21, 147, 39), fill=office)
        d.rectangle((46, 21, 113, 39), fill=cafe)
        d.rectangle((12, 42, 57, 67), fill=office)
        d.rectangle((61, 42, 98, 67), fill=lounge)
        d.rectangle((102, 42, 147, 67), fill=(182, 178, 222))
        d.ellipse((65, 1, 94, 18), fill=(82, 166, 190), outline=(101, 111, 113), width=2)
        for x in (17, 34, 107, 124):
            d.rectangle((x, 47, x + 16, 52), fill=(219, 194, 152), outline=(70, 73, 88))
            d.rectangle((x, 57, x + 16, 62), fill=(219, 194, 152), outline=(70, 73, 88))
        d.rectangle((66, 46, 82, 51), fill=(72, 150, 112), outline=(43, 43, 60))
        d.rectangle((78, 58, 94, 63), fill=(220, 188, 142), outline=(43, 43, 60))
        d.ellipse((77, 52, 84, 57), fill=(184, 137, 88))
        for x, y in ((4, 3), (20, 5), (135, 3), (151, 14), (3, 74), (151, 72)):
            d.ellipse((x, y, x + 9, y + 12), fill=(55, 134, 75))
    else:
        d.rectangle((14, 8, 146, 80), fill=wood, outline=wall, width=2)
        for y in (10, 29, 48):
            d.rectangle((16, y, 34, y + 16), fill=office)
            d.rectangle((126, y, 144, y + 16), fill=office)
            d.rectangle((20, y + 4, 30, y + 7), fill=(219, 194, 152))
            d.rectangle((130, y + 4, 140, y + 7), fill=(219, 194, 152))
        d.rectangle((42, 31, 69, 55), fill=(198, 218, 205))
        d.rectangle((78, 29, 116, 55), fill=lounge)
        d.rectangle((83, 34, 97, 39), fill=(191, 78, 78), outline=(43, 43, 60))
        d.rectangle((99, 45, 113, 50), fill=(94, 122, 173), outline=(43, 43, 60))
        d.rectangle((51, 40, 63, 46), fill=(219, 194, 152), outline=(43, 43, 60))
        for x, y in ((2, 3), (150, 4), (3, 70), (149, 69)):
            d.ellipse((x, y, x + 8, y + 13), fill=(55, 134, 75))
    img.resize((160 * scale, 90 * scale), Image.Resampling.NEAREST).save(os.path.join(OUT, name + ".png"))


preview("classic-office")
preview("coworking-campus", campus=True)
print("wrote map template previews")
