import os
from PIL import Image

OUT_DIR = os.path.normpath(os.path.join(
    os.path.dirname(__file__),
    "../../apps/web/public/assets/custom",
))


def canvas(w, h):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def rect(img, x0, y0, x1, y1, color):
    """Fill inclusive rect, clipped to the canvas."""
    px = img.load()
    w, h = img.size
    c = color if len(color) == 4 else (*color, 255)
    for y in range(max(0, y0), min(h, y1 + 1)):
        for x in range(max(0, x0), min(w, x1 + 1)):
            px[x, y] = c


def hline(img, x0, x1, y, color):
    rect(img, x0, y, x1, y, color)


def vline(img, x, y0, y1, color):
    rect(img, x, y0, x, y1, color)


def dot(img, x, y, color):
    rect(img, x, y, x, y, color)


def outline_shape(img, color):
    """Draw a 1px outline around every opaque region (4-neighbour edge)."""
    px = img.load()
    w, h = img.size
    edges = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 0:
                continue
            for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] > 0:
                    edges.append((x, y))
                    break
    c = (*color, 255)
    for x, y in edges:
        px[x, y] = c


def save(img, name):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name + ".png")
    img.save(path)
    print(f"wrote {name}.png {img.size[0]}x{img.size[1]}")
    return path
