"""
Find a hand-drawn yellow circle in a photo, so the game can keep it in view.

The Historical Society marks the thing to look for with a bright yellow ring
(the 743 & Cocoa aerial is the first). Returns the ring's centre as fractions
of the image width and height, or None when there isn't one.

Plain colour matching isn't enough: aged prints have a yellow cast and roads
have yellow centre lines. A blob only counts as a ring when it is hollow,
reaches round all four sides of its own centre, and is not a long thin line.
"""
from collections import deque

from PIL import Image

# Large photos are shrunk first; position is kept as a fraction, so this only
# costs precision we don't need.
WORK_WIDTH = 900
MIN_PIXELS = 60


def _is_yellow(r, g, b):
    return r > 190 and g > 160 and b < 90 and r - b > 130 and g - b > 100


def find_ring(path):
    im = Image.open(path).convert("RGB")
    if im.width > WORK_WIDTH:
        im = im.resize((WORK_WIDTH, round(im.height * WORK_WIDTH / im.width)))
    w, h = im.size
    px = im.load()
    mask = [[_is_yellow(*px[x, y]) for x in range(w)] for y in range(h)]
    seen = [[False] * w for _ in range(h)]
    best = None

    for y in range(h):
        for x in range(w):
            if not mask[y][x] or seen[y][x]:
                continue
            # flood-fill one connected yellow blob
            queue, pts = deque([(x, y)]), []
            seen[y][x] = True
            while queue:
                a, b = queue.popleft()
                pts.append((a, b))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        u, v = a + dx, b + dy
                        if 0 <= u < w and 0 <= v < h and mask[v][u] and not seen[v][u]:
                            seen[v][u] = True
                            queue.append((u, v))
            if len(pts) < MIN_PIXELS:
                continue

            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            bw, bh = x1 - x0 + 1, y1 - y0 + 1
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            hollow = not mask[int(cy)][int(cx)]
            all_round = len({(p[0] > cx, p[1] > cy) for p in pts}) == 4
            thin_outline = len(pts) / (bw * bh) < 0.5
            not_a_line = 0.25 < bw / bh < 4
            if hollow and all_round and thin_outline and not_a_line:
                if best is None or len(pts) > best[0]:
                    best = (len(pts), cx / w, cy / h)

    if best is None:
        return None
    return {"x": round(best[1], 3), "y": round(best[2], 3)}
