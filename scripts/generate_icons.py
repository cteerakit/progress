#!/usr/bin/env python3
"""Generate extension icons at 16, 48, and 128 pixels from public/logo.png."""

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'public' / 'logo.png'
OUT_DIR = ROOT / 'public' / 'icons'
SIZES = (16, 48, 128)
BACKGROUND_THRESHOLD = 25


def remove_background(image: Image.Image) -> Image.Image:
    """Make edge-connected near-black pixels transparent."""
    result = image.convert('RGBA')
    width, height = result.size
    pixels = result.load()

    def is_background(x: int, y: int) -> bool:
        red, green, blue, alpha = pixels[x, y]
        return (
            alpha > 0
            and red <= BACKGROUND_THRESHOLD
            and green <= BACKGROUND_THRESHOLD
            and blue <= BACKGROUND_THRESHOLD
        )

    queue = deque()
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    visited: set[tuple[int, int]] = set()
    while queue:
        x, y = queue.popleft()
        if (x, y) in visited:
            continue
        if not (0 <= x < width and 0 <= y < height):
            continue
        if not is_background(x, y):
            continue

        visited.add((x, y))
        pixels[x, y] = (0, 0, 0, 0)
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    return result


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f'Source logo not found: {SOURCE}')

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with Image.open(SOURCE) as source:
        logo = remove_background(source)
        logo.save(SOURCE, format='PNG', optimize=True)
        print(f'Updated {SOURCE} with transparent background')

        for size in SIZES:
            icon = logo.resize((size, size), Image.Resampling.LANCZOS)
            path = OUT_DIR / f'icon-{size}.png'
            icon.save(path, format='PNG', optimize=True)
            print(f'Created {path} ({size}x{size})')


if __name__ == '__main__':
    main()
