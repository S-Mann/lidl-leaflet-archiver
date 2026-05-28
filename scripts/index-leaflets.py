#!/usr/bin/env python3
"""Build a searchable index from PDF leaflets in ./leaflets/."""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import fitz
except ImportError:
    print(
        "Install pymupdf: python3 -m pip install -r scripts/requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
LEAFLETS_DIR = ROOT / "leaflets"
LOOKUP_DIR = ROOT / "lookup"
PRODUCTS_JS = LOOKUP_DIR / "products.js"

EURO_GLYPH = {
    "·": "4",
    "´": "1",
    "µ": "0",
    "¶": "1",
    "¸": "8",
    "º": "0",
    "¼": "1",
    "»": "2",
}
SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")


def number_cleanup(number: str) -> int:
    return int(re.sub("[^0-9]", "", number))


def is_noise_word(text: str) -> bool:
    text = text.strip()
    if len(text) < 2 and not text.isalpha():
        return True
    if re.match(r"^[!\"#$%&\'()*+,\-./0-9:;<=>?@\\^_{|}~]+$", text):
        return True
    if re.search(r"[&;<>@%]{2}", text):
        return True
    if re.match(r"^-?\d+﹪?$", text):
        return True
    if "/C." in text or "DC16" in text:
        return True
    return False


def is_price_text(text: str) -> bool:
    text = text.strip()
    if re.match(r"^\d+c$", text, re.I):
        return True
    return text.startswith("€")


def normalize_price(text: str) -> str:
    text = text.strip().translate(SUP)
    m = re.match(r"^(\d+)c$", text, re.I)
    if m:
        return f"€{number_cleanup(m.group(1)) / 100:.2f}"
    if not text.startswith("€"):
        return text
    body = text[1:]
    if "." in body:
        euros_part, cents_part = body.split(".", 1)
    else:
        euros_part, cents_part = body, "00"

    def conv(segment: str) -> str:
        digits = "".join(
            EURO_GLYPH.get(ch, ch)
            for ch in segment
            if EURO_GLYPH.get(ch, ch) or ch.isdigit()
        )
        return digits or "0"

    euros = conv(euros_part)
    cents = conv(cents_part)[:2].ljust(2, "0")
    return f"€{number_cleanup(euros)}.{cents}"


def clean_name(name: str) -> str:
    name = re.sub(r"\s+", " ", name).strip()
    name = re.sub(r"/C\.[^ ]+\s*", "", name)
    name = re.sub(r"\s*-\d+﹪!?\S*\s*", " ", name)
    return name.strip()


def get_words(page: fitz.Page) -> list[dict]:
    words = []
    for x0, y0, x1, y1, word, *_ in page.get_text("words"):
        words.append(
            {
                "text": word,
                "x0": x0,
                "y0": y0,
                "x1": x1,
                "y1": y1,
                "cx": (x0 + x1) / 2,
                "cy": (y0 + y1) / 2,
            }
        )
    return words


def extract_page(page: fitz.Page, page_num: int) -> list[dict]:
    words = get_words(page)
    prices = [w for w in words if is_price_text(w["text"])]
    items: list[dict] = []
    used: set[tuple[int, int]] = set()

    for price_word in prices:
        key = (round(price_word["cx"]), round(price_word["cy"]))
        if key in used:
            continue
        used.add(key)

        col_x = price_word["cx"]
        above = [
            w
            for w in words
            if w["cy"] < price_word["cy"] - 2
            and abs(w["cx"] - col_x) < 100
            and w["cy"] > price_word["cy"] - 200
            and not is_price_text(w["text"])
            and not is_noise_word(w["text"])
        ]
        above.sort(key=lambda w: (-w["cy"], w["x0"]))

        lines: list[list[dict]] = []
        for w in above:
            for line in lines:
                if abs(line[0]["cy"] - w["cy"]) < 8:
                    line.append(w)
                    break
            else:
                lines.append([w])

        lines.sort(key=lambda ln: -ln[0]["cy"])
        name_parts: list[str] = []
        for line in lines[:5]:
            txt = " ".join(w["text"] for w in sorted(line, key=lambda w: w["x0"]))
            if txt and not is_noise_word(txt):
                name_parts.append(txt)

        name = clean_name(" ".join(name_parts))
        if len(name) < 3:
            continue

        items.append(
            {
                "name": name,
                "price": normalize_price(price_word["text"]),
                "page": page_num,
            }
        )

    return items


def index_pdf(path: Path) -> dict:
    doc = fitz.open(path)
    page_count = doc.page_count
    items: list[dict] = []
    for page_idx in range(page_count):
        items.extend(extract_page(doc[page_idx], page_idx + 1))
    doc.close()

    relative = path.relative_to(LEAFLETS_DIR)
    return {
        "file": relative.name,
        "pageCount": page_count,
        "items": items,
        "tags": list(relative.parent.parts),
    }


def main() -> None:
    pdfs = sorted(LEAFLETS_DIR.glob("**/*.pdf"))
    if not pdfs:
        print(f"No PDFs in {LEAFLETS_DIR}")
        sys.exit(1)

    leaflets = []
    total_items = 0
    for pdf in pdfs:
        print(f"Indexing {pdf.name}…")
        entry = index_pdf(pdf)
        total_items += len(entry["items"])
        leaflets.append(entry)
        print(f"  {len(entry['items'])} products")

    payload = {
        "indexedAt": datetime.now(timezone.utc).isoformat(),
        "leaflets": leaflets,
    }
    LOOKUP_DIR.mkdir(parents=True, exist_ok=True)
    js = (
        "window.LEAFLET_INDEX = "
        + json.dumps(payload, ensure_ascii=False, indent=2)
        + ";\n"
    )
    PRODUCTS_JS.write_text(js, encoding="utf-8")
    print(f"Wrote {total_items} items to {PRODUCTS_JS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
