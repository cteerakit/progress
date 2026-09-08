#!/usr/bin/env python3
"""Verify compact Drive codec chunking assumptions."""

from __future__ import annotations


def byte_length(value: str) -> int:
    return len(value.encode("utf-8"))


def split_into_chunks(payload: str, max_value_bytes: int = 118) -> dict[str, str]:
    props = {"v": "1"}
    if not payload:
        return props

    chunk_index = 0
    current = ""

    for part in payload.split("|"):
        candidate = f"{current}|{part}" if current else part
        key = f"s{chunk_index}"
        would_exceed = byte_length(candidate) > max_value_bytes or (
            byte_length(key) + byte_length(candidate) > 124
        )

        if would_exceed and current:
            props[key] = current
            chunk_index += 1
            current = part
        else:
            current = candidate

    if current:
        props[f"s{chunk_index}"] = current

    return props


def main() -> None:
    entries = []
    for index in range(120):
        entries.append(f"id.p{index}:d:{1700000000 + index}")

    props = split_into_chunks("|".join(entries))
    chunk_keys = [key for key in props if key.startswith("s")]

    assert len(chunk_keys) <= 30, f"too many chunks: {len(chunk_keys)}"

    for key, value in props.items():
        assert byte_length(key) + byte_length(value) <= 124, (
            f"{key} exceeds 124 bytes"
        )

    print(f"ok: {len(entries)} slides encoded into {len(chunk_keys)} chunks")


if __name__ == "__main__":
    main()
