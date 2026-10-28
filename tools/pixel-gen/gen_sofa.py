
from PIL import Image


BASE   = (191, 78, 78)
LIGHT  = (214, 108, 104)
DARK   = (150, 54, 58)
DARKER = (110, 38, 44)
CUSH_H = (224, 132, 128)
LEG    = (74, 54, 44)
_T = (0, 0, 0, 0)

W, H = 40, 30
img = Image.new("RGBA", (W, H), _T)
px = img.load()

def rect(x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < W and 0 <= y < H:
                px[x, y] = c if len(c) == 4 else (c[0], c[1], c[2], 255)


rect(3, 2, 36, 6, DARKER)
rect(4, 3, 35, 6, BASE)
rect(4, 3, 35, 3, LIGHT)

rect(3, 3, 8, 26, DARKER)
rect(4, 4, 7, 25, BASE)
rect(4, 4, 4, 25, LIGHT)
rect(31, 3, 36, 26, DARKER)
rect(32, 4, 35, 25, BASE)
rect(35, 4, 35, 25, DARK)

rect(8, 7, 31, 27, DARKER)
rect(9, 8, 30, 26, DARK)

for cx in (9, 20):
    rect(cx, 9, cx + 10, 24, DARKER)
    rect(cx + 1, 10, cx + 10, 24, BASE)
    rect(cx + 1, 10, cx + 10, 11, CUSH_H)
    rect(cx + 1, 10, cx + 1, 24, CUSH_H)

rect(20, 9, 20, 24, DARKER)

rect(9, 27, 11, 29, LEG)
rect(28, 27, 30, 29, LEG)

img.save("/Users/deepak/Documents/Project/2d-metaverse/apps/web/public/assets/custom/sofa-red.png")
print("wrote sofa-red.png", img.size)
