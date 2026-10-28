
from palette import *
from draw import canvas, rect, hline, vline, dot, outline_shape, save


def desk_monitor():
    """Private-office desk with a monitor, sat from below (avatar faces up)."""
    img = canvas(64, 52)

    rect(img, 1, 18, 62, 40, WOOD_PALE)
    hline(img, 1, 62, 18, (232, 210, 170))
    rect(img, 1, 41, 62, 47, WOOD)
    hline(img, 1, 62, 47, WOOD_D)

    rect(img, 3, 48, 7, 51, WOOD_D)
    rect(img, 56, 48, 60, 51, WOOD_D)

    rect(img, 28, 14, 35, 17, SLATE_D)
    rect(img, 30, 10, 33, 14, SLATE_D)
    rect(img, 18, 0, 45, 12, SLATE)
    rect(img, 20, 1, 43, 10, SCREEN)
    rect(img, 20, 1, 43, 3, (198, 232, 238))
    rect(img, 21, 6, 34, 7, SCREEN_D)
    rect(img, 21, 8, 29, 9, SCREEN_D)

    rect(img, 24, 22, 39, 27, GREY_L)
    rect(img, 25, 23, 38, 26, GREY)
    rect(img, 44, 23, 47, 26, GREY_L)

    rect(img, 10, 22, 14, 27, RED)
    rect(img, 11, 23, 13, 24, RED_L)
    outline_shape(img, OUTLINE)
    return img


def _office_chair(main, light, dark):
    """Task chair seen from behind (back toward camera) — for desks faced 'up'."""
    img = canvas(28, 36)

    rect(img, 8, 0, 19, 4, dark)

    rect(img, 4, 5, 23, 22, main)
    rect(img, 5, 6, 22, 8, light)
    vline(img, 4, 5, 22, light)
    rect(img, 9, 11, 18, 17, dark)

    rect(img, 0, 12, 3, 21, dark)
    rect(img, 24, 12, 27, 21, dark)

    rect(img, 6, 23, 21, 26, dark)

    rect(img, 12, 27, 15, 30, SLATE_D)
    hline(img, 4, 23, 31, SLATE_D)
    rect(img, 3, 32, 6, 33, SLATE_D)
    rect(img, 12, 32, 15, 33, SLATE_D)
    rect(img, 21, 32, 24, 33, SLATE_D)
    outline_shape(img, OUTLINE)
    return img


def office_chair():
    return _office_chair(SLATE, SLATE_L, SLATE_D)


def office_chair_red():
    return _office_chair(RED, RED_L, RED_D)


def cabinet():
    img = canvas(64, 44)
    rect(img, 1, 8, 62, 12, SLATE_L)
    rect(img, 1, 13, 62, 41, SLATE)
    for y0 in (15, 28):
        rect(img, 4, y0, 59, y0 + 10, SLATE_L)
        rect(img, 4, y0 + 8, 59, y0 + 10, SLATE_D)
        rect(img, 26, y0 + 3, 37, y0 + 5, GREY_L)
    rect(img, 2, 42, 6, 43, SLATE_D)
    rect(img, 57, 42, 61, 43, SLATE_D)
    outline_shape(img, OUTLINE)
    return img


def whiteboard():
    img = canvas(64, 34)
    rect(img, 0, 0, 63, 27, GREY)
    rect(img, 2, 2, 61, 25, WHITE)

    hline(img, 6, 30, 7, BLUE)
    hline(img, 6, 24, 11, BLUE)
    hline(img, 6, 34, 15, RED_D)
    rect(img, 42, 8, 56, 18, LEAF_D)
    hline(img, 44, 54, 13, WHITE)
    rect(img, 4, 28, 59, 30, GREY_D)
    rect(img, 10, 26, 16, 27, RED)
    outline_shape(img, OUTLINE)
    return img


def water_cooler():
    img = canvas(20, 38)
    rect(img, 4, 0, 15, 9, SCREEN)
    rect(img, 5, 1, 9, 8, (198, 232, 238))
    rect(img, 2, 10, 17, 32, WHITE)
    rect(img, 2, 10, 17, 12, GREY_L)
    rect(img, 5, 16, 8, 19, BLUE)
    rect(img, 11, 16, 14, 19, RED)
    rect(img, 2, 33, 17, 35, GREY)
    outline_shape(img, OUTLINE)
    return img




def conf_table():
    img = canvas(128, 76)
    rect(img, 2, 10, 125, 58, WOOD_PALE)
    hline(img, 2, 125, 10, (232, 210, 170))
    rect(img, 6, 14, 121, 15, (232, 210, 170))
    rect(img, 2, 59, 125, 69, WOOD)
    hline(img, 2, 125, 69, WOOD_D)
    rect(img, 6, 70, 12, 75, WOOD_D)
    rect(img, 115, 70, 121, 75, WOOD_D)

    rect(img, 20, 24, 33, 34, WHITE)
    hline(img, 22, 30, 27, GREY)
    hline(img, 22, 31, 30, GREY)
    rect(img, 56, 22, 75, 36, SLATE)
    rect(img, 58, 24, 73, 34, SCREEN)
    rect(img, 94, 26, 103, 35, WHITE)
    outline_shape(img, OUTLINE)
    return img


def tv_wall():
    img = canvas(72, 40)
    rect(img, 0, 0, 71, 35, SLATE_D)
    rect(img, 3, 3, 68, 32, SCREEN)
    rect(img, 3, 3, 68, 8, (198, 232, 238))
    rect(img, 8, 14, 34, 27, SCREEN_D)
    rect(img, 40, 14, 63, 27, (140, 190, 200))
    rect(img, 30, 36, 41, 39, SLATE_D)
    outline_shape(img, OUTLINE)
    return img




def _sofa(base, light, dark):
    """3-seat wide sofa, front-facing."""
    img = canvas(84, 34)
    rect(img, 2, 0, 81, 8, base)
    rect(img, 2, 0, 81, 2, light)
    rect(img, 0, 2, 7, 29, base)
    rect(img, 76, 2, 83, 29, base)
    rect(img, 0, 2, 2, 29, light)
    rect(img, 81, 2, 83, 29, dark)
    rect(img, 8, 9, 75, 27, dark)
    for i, cx in enumerate((8, 31, 54)):
        rect(img, cx + (0 if i == 0 else 1), 10, cx + 21, 25, base)
        rect(img, cx + (0 if i == 0 else 1), 10, cx + 21, 12, light)
    rect(img, 8, 28, 75, 30, dark)
    rect(img, 8, 31, 12, 33, WOOD_D)
    rect(img, 70, 31, 74, 33, WOOD_D)
    outline_shape(img, OUTLINE)
    return img


def sofa_red():
    return _sofa(RED, RED_L, RED_D)


def sofa_blue():
    return _sofa(BLUE, BLUE_L, BLUE_D)


def coffee_round():
    img = canvas(40, 34)

    px_rows = [(12, 27, 4), (8, 31, 5), (5, 34, 6), (3, 36, 7), (2, 37, 8),
               (2, 37, 15), (3, 36, 16), (5, 34, 17), (8, 31, 18), (12, 27, 19)]
    for x0, x1, y in px_rows:
        hline(img, x0, x1, y, WOOD_PALE)
    rect(img, 2, 8, 37, 14, WOOD_PALE)
    hline(img, 5, 34, 5, (232, 210, 170))
    rect(img, 2, 20, 37, 21, WOOD)
    rect(img, 17, 22, 22, 29, WOOD)
    rect(img, 11, 30, 28, 32, WOOD_D)

    rect(img, 15, 9, 24, 15, RED)
    rect(img, 16, 10, 23, 11, RED_L)
    outline_shape(img, OUTLINE)
    return img


def coffee_rect():
    img = canvas(56, 30)
    rect(img, 1, 4, 54, 19, WOOD_PALE)
    hline(img, 1, 54, 4, (232, 210, 170))
    rect(img, 1, 20, 54, 25, WOOD)
    rect(img, 3, 26, 7, 29, WOOD_D)
    rect(img, 48, 26, 52, 29, WOOD_D)
    rect(img, 12, 8, 22, 15, LEAF)
    rect(img, 34, 9, 43, 16, WHITE)
    outline_shape(img, OUTLINE)
    return img


def beanbag():
    img = canvas(28, 24)
    rect(img, 6, 0, 21, 3, BLUE_L)
    rect(img, 3, 4, 24, 9, BLUE)
    rect(img, 1, 10, 26, 18, BLUE)
    rect(img, 3, 19, 24, 21, BLUE_D)
    rect(img, 6, 22, 21, 22, BLUE_D)
    rect(img, 4, 4, 9, 12, BLUE_L)
    rect(img, 8, 8, 19, 14, BLUE_D)
    outline_shape(img, OUTLINE)
    return img


def bookshelf():
    img = canvas(64, 58)
    rect(img, 0, 0, 63, 53, WOOD)
    rect(img, 0, 0, 63, 3, WOOD_L)
    book_colors = [RED, BLUE, LEAF, YELLOW, GREY_L, POT]
    for row, y0 in enumerate((6, 22, 38)):
        rect(img, 3, y0, 60, y0 + 12, WOOD_D)
        x = 5
        i = row
        while x < 56:
            w = 3 + (i % 3)
            c = book_colors[i % len(book_colors)]
            rect(img, x, y0 + 2 + (i % 2), x + w, y0 + 12, c)
            x += w + 2
            i += 1
        hline(img, 3, 60, y0 + 13, WOOD_L)
    rect(img, 1, 54, 5, 57, WOOD_D)
    rect(img, 58, 54, 62, 57, WOOD_D)
    outline_shape(img, OUTLINE)
    return img


def plant_tall():
    img = canvas(26, 44)

    rect(img, 10, 0, 15, 10, LEAF)
    rect(img, 3, 4, 9, 14, LEAF_L)
    rect(img, 16, 3, 22, 13, LEAF_D)
    rect(img, 6, 12, 19, 22, LEAF)
    rect(img, 6, 12, 11, 16, LEAF_L)
    vline(img, 12, 8, 24, LEAF_D)

    rect(img, 6, 24, 19, 27, POT_L)
    rect(img, 7, 28, 18, 38, POT)
    rect(img, 7, 36, 18, 38, POT_D)
    rect(img, 9, 39, 16, 41, POT_D)
    outline_shape(img, OUTLINE)
    return img


def plant_fern():
    img = canvas(24, 28)
    rect(img, 8, 0, 15, 6, LEAF_L)
    rect(img, 2, 3, 8, 10, LEAF)
    rect(img, 15, 3, 21, 10, LEAF_D)
    rect(img, 5, 8, 18, 13, LEAF)
    rect(img, 7, 14, 16, 16, POT_L)
    rect(img, 8, 17, 15, 24, POT)
    rect(img, 8, 22, 15, 24, POT_D)
    outline_shape(img, OUTLINE)
    return img




def ping_pong():
    img = canvas(96, 68)
    rect(img, 2, 8, 93, 50, PP_GREEN)
    hline(img, 2, 93, 8, (128, 192, 142))
    rect(img, 2, 28, 93, 29, WHITE)
    rect(img, 46, 4, 49, 33, WHITE)
    rect(img, 46, 4, 49, 5, GREY_L)
    rect(img, 2, 51, 93, 58, PP_GREEN_D)
    rect(img, 8, 59, 13, 66, SLATE_D)
    rect(img, 82, 59, 87, 66, SLATE_D)

    rect(img, 16, 16, 23, 22, RED)
    rect(img, 19, 23, 21, 26, WOOD)
    rect(img, 70, 36, 77, 42, SLATE)
    rect(img, 73, 33, 75, 35, WOOD)
    dot(img, 58, 20, WHITE); dot(img, 59, 20, WHITE)
    outline_shape(img, OUTLINE)
    return img


def foosball():
    img = canvas(80, 60)
    rect(img, 2, 6, 77, 42, WOOD)
    rect(img, 6, 10, 73, 38, PP_GREEN)
    rect(img, 6, 10, 73, 11, (128, 192, 142))
    vline(img, 39, 10, 38, WHITE)

    for i, x in enumerate((14, 28, 50, 64)):
        vline(img, x, 4, 44, GREY_L)
        c = RED if i % 2 == 0 else BLUE
        for y in (14, 24, 34):
            rect(img, x - 2, y, x + 2, y + 4, c)
    rect(img, 2, 43, 77, 50, WOOD_D)
    rect(img, 6, 51, 12, 58, WOOD_D)
    rect(img, 67, 51, 73, 58, WOOD_D)
    outline_shape(img, OUTLINE)
    return img


def arcade():
    img = canvas(36, 54)
    rect(img, 2, 0, 33, 6, RED_D)
    rect(img, 5, 1, 30, 4, YELLOW)
    rect(img, 2, 7, 33, 30, SLATE)
    rect(img, 5, 9, 30, 24, SCREEN)
    rect(img, 8, 12, 13, 15, RED)
    rect(img, 20, 17, 25, 20, YELLOW)
    rect(img, 2, 31, 33, 36, SLATE_L)
    dot(img, 10, 33, RED); dot(img, 14, 33, YELLOW); dot(img, 18, 33, BLUE)
    rect(img, 25, 32, 27, 34, GREY_L)
    rect(img, 2, 37, 33, 50, SLATE_D)
    rect(img, 4, 51, 31, 53, OUTLINE)
    outline_shape(img, OUTLINE)
    return img




def sofa_green():
    return _sofa(GREEN, GREEN_L, GREEN_D)


def sofa_cream():
    return _sofa(CREAM, CREAM_L, CREAM_D)


def _armchair(main, light, dark):
    img = canvas(42, 42)
    rect(img, 5, 2, 36, 12, main)
    rect(img, 6, 3, 35, 5, light)
    rect(img, 1, 7, 9, 34, main)
    rect(img, 32, 7, 40, 34, dark)
    rect(img, 9, 13, 32, 34, dark)
    rect(img, 10, 14, 31, 31, main)
    rect(img, 11, 15, 30, 18, light)
    rect(img, 8, 35, 33, 38, dark)
    rect(img, 8, 39, 12, 41, WOOD_D)
    rect(img, 29, 39, 33, 41, WOOD_D)
    outline_shape(img, OUTLINE)
    return img


def armchair_green():
    return _armchair(GREEN, GREEN_L, GREEN_D)


def armchair_purple():
    return _armchair(PURPLE, PURPLE_L, PURPLE_D)


def task_chair_teal():
    return _office_chair(GREEN, GREEN_L, GREEN_D)


def team_desk():
    img = canvas(128, 70)
    rect(img, 2, 12, 125, 50, WOOD_PALE)
    hline(img, 2, 125, 12, CREAM_L)
    vline(img, 63, 13, 49, WOOD_D)
    rect(img, 2, 51, 125, 58, WOOD)
    rect(img, 8, 59, 13, 68, WOOD_D)
    rect(img, 114, 59, 119, 68, WOOD_D)
    for x in (18, 74):
        rect(img, x, 1, x + 31, 16, SLATE)
        rect(img, x + 3, 3, x + 28, 13, SCREEN)
        rect(img, x + 14, 17, x + 18, 21, SLATE_D)
        rect(img, x + 7, 27, x + 34, 32, GREY_L)
    rect(img, 56, 22, 70, 36, WHITE)
    hline(img, 58, 67, 26, BLUE)
    outline_shape(img, OUTLINE)
    return img


def cafe_counter():
    img = canvas(128, 64)
    rect(img, 1, 8, 126, 19, SLATE_L)
    hline(img, 1, 126, 8, GREY_L)
    rect(img, 1, 20, 126, 56, SLATE)
    for x in (8, 40, 72, 104):
        rect(img, x, 26, x + 15, 47, SLATE_D)
        rect(img, x + 3, 29, x + 12, 44, GREY)
    rect(img, 14, 0, 35, 12, SLATE_D)
    rect(img, 17, 2, 32, 9, SCREEN_D)
    rect(img, 50, 2, 60, 11, POT)
    rect(img, 82, 2, 91, 10, WHITE)
    rect(img, 108, 1, 117, 11, GREEN)
    rect(img, 4, 57, 11, 63, SLATE_D)
    rect(img, 116, 57, 123, 63, SLATE_D)
    outline_shape(img, OUTLINE)
    return img


def reception_desk():
    img = canvas(96, 62)
    rect(img, 2, 10, 93, 24, WOOD_PALE)
    hline(img, 2, 93, 10, CREAM_L)
    rect(img, 2, 25, 93, 53, WOOD)
    rect(img, 10, 29, 85, 47, WOOD_L)
    rect(img, 42, 0, 67, 15, SLATE)
    rect(img, 45, 2, 64, 12, SCREEN)
    rect(img, 52, 16, 57, 22, SLATE_D)
    rect(img, 6, 54, 13, 61, WOOD_D)
    rect(img, 82, 54, 89, 61, WOOD_D)
    outline_shape(img, OUTLINE)
    return img


def pond():
    img = canvas(160, 112)
    px = img.load()
    cx, cy = 80, 54
    for y in range(8, 101):
        for x in range(6, 154):
            d = ((x - cx) / 73) ** 2 + ((y - cy) / 46) ** 2
            if d <= 1:
                px[x, y] = (*STONE, 255)
            if d <= .82:
                px[x, y] = (*WATER_D, 255)
            if d <= .68:
                px[x, y] = (*WATER, 255)
    for x, y, w in ((26, 28, 28), (90, 74, 34), (55, 50, 20)):
        hline(img, x, x + w, y, WATER_L)
    for x, y in ((46, 42), (104, 55), (76, 78)):
        rect(img, x, y, x + 12, y + 5, LEAF_D)
        rect(img, x + 3, y - 2, x + 8, y + 3, LEAF)
        dot(img, x + 7, y, RED_L)
    for x, y in ((8, 42), (28, 8), (124, 15), (144, 62), (111, 93), (43, 96)):
        rect(img, x, y, x + 13, y + 9, STONE_L)
        hline(img, x + 2, x + 10, y + 1, WHITE)
    outline_shape(img, OUTLINE)
    return img


def window_planter():
    img = canvas(64, 38)
    rect(img, 1, 18, 62, 28, POT)
    rect(img, 1, 18, 62, 21, POT_L)
    rect(img, 5, 29, 58, 35, POT_D)
    for x in (7, 17, 27, 37, 47, 55):
        rect(img, x, 7, x + 3, 18, LEAF)
        rect(img, x - 3, 4, x + 1, 10, LEAF_L)
        rect(img, x + 2, 1, x + 6, 9, LEAF_D)
    outline_shape(img, OUTLINE)
    return img


ALL = {
    "desk-monitor": desk_monitor,
    "office-chair": office_chair,
    "office-chair-red": office_chair_red,
    "cabinet": cabinet,
    "whiteboard": whiteboard,
    "water-cooler": water_cooler,
    "conf-table": conf_table,
    "tv-wall": tv_wall,
    "sofa-red-wide": sofa_red,
    "sofa-blue-wide": sofa_blue,
    "coffee-round": coffee_round,
    "coffee-rect": coffee_rect,
    "beanbag": beanbag,
    "bookshelf-big": bookshelf,
    "plant-tall": plant_tall,
    "plant-fern": plant_fern,
    "ping-pong": ping_pong,
    "foosball": foosball,
    "arcade": arcade,
    "sofa-green-wide": sofa_green,
    "sofa-cream-wide": sofa_cream,
    "armchair-green": armchair_green,
    "armchair-purple": armchair_purple,
    "office-chair-teal": task_chair_teal,
    "team-desk": team_desk,
    "cafe-counter": cafe_counter,
    "reception-desk": reception_desk,
    "campus-pond": pond,
    "window-planter": window_planter,
}

if __name__ == "__main__":
    for name, fn in ALL.items():
        save(fn(), name)
