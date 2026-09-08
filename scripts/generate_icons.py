#!/usr/bin/env python3
"""Generate extension icons at 16, 48, and 128 pixels."""

import os
import struct
import zlib


def create_png(size: int, path: str) -> None:
    """Write a minimal valid PNG without external dependencies."""
    r, g, b = 0x1A, 0x73, 0xE8  # Google blue

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)

    rows = []
    margin = max(1, size // 8)
    radius = size // 4

    for y in range(size):
        row = bytearray([0])  # filter byte
        for x in range(size):
            inside = (
                margin <= x < size - margin
                and margin <= y < size - margin
            )
            if inside:
                # Rounded corners approximation
                corners = [
                    (margin + radius, margin + radius),
                    (size - margin - radius, margin + radius),
                    (margin + radius, size - margin - radius),
                    (size - margin - radius, size - margin - radius),
                ]
                corner_cut = False
                for cx, cy in corners:
                    if (
                        (x < cx and y < cy)
                        or (x > cx and y < cy)
                        or (x < cx and y > cy)
                        or (x > cx and y > cy)
                    ):
                        dx = abs(x - cx)
                        dy = abs(y - cy)
                        if dx * dx + dy * dy > radius * radius:
                            corner_cut = True
                            break
                if not corner_cut:
                    row.extend([r, g, b, 255])
                else:
                    row.extend([0, 0, 0, 0])
            else:
                row.extend([0, 0, 0, 0])
        rows.append(bytes(row))

    raw = b''.join(rows)
    compressed = zlib.compress(raw, 9)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(
        b'IHDR',
        struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0),
    )
    png += chunk(b'IDAT', compressed)
    png += chunk(b'IEND', b'')

    with open(path, 'wb') as f:
        f.write(png)


def main() -> None:
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
    os.makedirs(out_dir, exist_ok=True)
    for size in (16, 48, 128):
        path = os.path.join(out_dir, f'icon-{size}.png')
        create_png(size, path)
        print(f'Created {path} ({size}x{size})')


if __name__ == '__main__':
    main()
