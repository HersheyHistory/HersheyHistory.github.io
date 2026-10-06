"""
Turn a marked-up landmarks-review.txt (made by landmarks_to_text.py) back
into public/landmarks.json.

    python tools/text_to_landmarks.py                    -> reads landmarks-review.txt
    python tools/text_to_landmarks.py edited.txt         -> reads edited.txt
    python tools/text_to_landmarks.py edited.txt --check -> report only, write nothing

A site with no LATITUDE or LONGITUDE is reported and left out, since the
game cannot score a guess against it. Everything else is written in the
order it appears in the file.
"""
import io
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote

from yellow_ring import find_ring

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
TARGET = ROOT / "public" / "landmarks.json"
DEFAULT_IN = ROOT / "landmarks-review.txt"

RULE_RE = re.compile(r"^#{8,}\s*$")
LABEL_RE = re.compile(r"^([A-Z][A-Z /]+?):\s?(.*)$")

# label in the text file -> (json field, kind)
SINGLE = {
    "TITLE": "title",
    "SHORT TITLE": "shortTitle",
    "PHOTO YEAR": "photoYear",
    "NOW PHOTO YEAR": "nowYear",
    # Optional per-site scoring; without them the game's standard rules apply.
    "YEAR SCORING": "yearScoring",
    "LOCATION SCORING": "locationScoring",
    "HISTORIC LABEL": "historicLabel",
    "MODERN LABEL": "modernLabel",
    "LATITUDE": "lat",
    "LONGITUDE": "lng",
    "THEN PHOTO": "thenImage",
    "NOW PHOTO": "nowImage",
    "ARCHIVE LINK LABEL": "_linkLabel",
    "ARCHIVE LINK URL": "_linkUrl",
}
# A site can have several hints, one per line, so HINT reads like the history
# fields and runs until the next label.
MULTI = {
    "HINT": "hint",
    "HISTORY": "history",
    "FULL HISTORY": "fullHistory",
    # The link tends to go on the line after the label, so read it like text.
    "GOOGLE MAP": "googleMapUrl",
}
INTEGER = {"photoYear", "nowYear"}
FLOAT = {"lat", "lng"}

NOTES = []


def read_text(path):
    """Read the form in whatever encoding it was saved in.

    Modern editors save UTF-8. Older Mac editors save Mac Roman with classic
    lone-CR line endings, and older Windows ones save cp1252; both decode any
    byte, so pick whichever turns the high bytes into typographic punctuation
    (curly quotes, dashes, degree signs) rather than accented capitals."""
    raw = Path(path).read_bytes()
    try:
        return raw.decode("utf-8-sig"), "UTF-8"
    except UnicodeDecodeError:
        pass
    good, bad = set("“”‘’–—…°"), set("ÒÓÔÕÐ¡ìî")
    best = None
    for enc, label in (("mac_roman", "Mac Roman"), ("cp1252", "Windows-1252")):
        text = raw.decode(enc, errors="replace")
        score = sum(ch in good for ch in text) - sum(ch in bad for ch in text)
        if best is None or score > best[0]:
            best = (score, text, label)
    return best[1], best[2]


def normalise_photo(path):
    """Web servers treat file names as case-sensitive, and every photo in the
    project is kept as a lower-case .jpg, so "Hotel-Hershey-now.png" means
    images/hotel-hershey-now.jpg. A bare file name gets the images/ folder."""
    p = path.strip().replace("\\", "/")
    stem, dot, ext = p.rpartition(".")
    if dot and ext.lower() in ("png", "jpeg", "jpg", "webp"):
        p = stem + ".jpg"
    if "/" not in p:
        p = "images/" + p
    return p.lower()


def clean(text, where=""):
    """Normalise a multi-paragraph field: trim, collapse runs of blank lines,
    and drop a paragraph that exactly repeats an earlier one in the same field
    (reported, not silent). Single line breaks inside a paragraph are kept."""
    seen, out = set(), []
    for p in (p.strip() for p in re.split(r"\n\s*\n", text.strip())):
        if not p:
            continue
        if p in seen:
            NOTES.append(f"{where}: dropped a repeated paragraph: {p[:60]!r}")
            continue
        seen.add(p)
        out.append(p)
    return "\n\n".join(out)


def parse_block(lines, where):
    site = {}
    links = []
    pending_link = {}
    current_multi = None
    buffer = []

    def name():
        return site.get("shortTitle") or site.get("title") or "a site"

    def put(field, value, label):
        """Store a value. The same label can appear twice when someone types a
        new value lower down instead of filling in the original blank line, so
        a blank never wipes out a filled value, and two different filled
        values stop the conversion rather than silently picking one."""
        prior = site.get(field)
        if not value and prior:
            return
        if prior and value and prior != value:
            raise SystemExit(
                f"{name()}: {label} appears twice with different values "
                f"({prior!r} and {value!r}). Keep one and run again."
            )
        site[field] = value

    def flush_multi():
        nonlocal current_multi, buffer
        if current_multi:
            put(current_multi, clean("\n".join(buffer), f"{where} {current_multi}"), current_multi)
        current_multi, buffer = None, []

    for raw in lines:
        line = raw.rstrip("\r\n")
        m = LABEL_RE.match(line)
        label = m.group(1).strip() if m else None

        if label and label not in MULTI and label not in SINGLE and current_multi is None:
            NOTES.append(f": ignored unrecognised label {label!r}")
            continue

        if label in MULTI:
            flush_multi()
            current_multi = MULTI[label]
            # anything typed on the same line as the label counts too
            if m.group(2).strip():
                buffer.append(m.group(2))
            continue

        if label in SINGLE:
            flush_multi()
            field, value = SINGLE[label], m.group(2).strip()
            if field == "_linkLabel":
                if pending_link:
                    links.append(pending_link)
                pending_link = {"label": value}
            elif field == "_linkUrl":
                pending_link["url"] = value
                links.append(pending_link)
                pending_link = {}
            else:
                put(field, value, label)
            continue

        if current_multi is not None:
            buffer.append(line)
        # otherwise: the "SITE n" line, a parenthesised note, or blank filler

    flush_multi()
    if pending_link:
        links.append(pending_link)
    site["archiveLinks"] = [
        l for l in links if l.get("label", "").strip() and l.get("url", "").strip()
    ]

    # A map link is one URL; browsers need the https:// that copies often lose,
    # and characters like ° and " pasted from the address bar get escaped.
    url = (site.get("googleMapUrl") or "").split()
    if url:
        url = url[0]
        url = url if re.match(r"https?://", url) else "https://" + url
        site["googleMapUrl"] = quote(url, safe=":/?&=%#@!$'()*+,;~[]-._")

    # Photo names, as the website will look them up.
    for field in ("thenImage", "nowImage"):
        given = (site.get(field) or "").strip()
        if given:
            site[field] = normalise_photo(given)
            if site[field] != given:
                NOTES.append(f": photo {given!r} read as {site[field]!r}")

    # PHOTO YEAR may carry the date as the Society writes it ("Circa 1962").
    # That says the same thing as YEAR SCORING, so treat it that way.
    py = site.get("photoYear")
    if isinstance(py, str) and py.strip() and not py.strip().isdigit():
        m = re.search(r"\b(\d{4})\b", py)
        if not m:
            raise SystemExit(f"{name()}: PHOTO YEAR needs a four-digit year, got {py!r}")
        if not (site.get("yearScoring") or "").strip():
            site["yearScoring"] = py.strip()
        site["photoYear"] = m.group(1)

    # YEAR SCORING: the photo's date as the Society writes it ("circa 1925").
    # It must contain a year to score against; any words are shown to players
    # alongside the date on the answer page.
    ys = (site.get("yearScoring") or "").strip()
    if ys:
        if not re.search(r"\b\d{4}\b", ys):
            raise SystemExit(f"{name()}: YEAR SCORING needs a four-digit year, got {ys!r}")
        py = site.get("photoYear")
        year = re.search(r"\b\d{4}\b", ys).group(0)
        if py and str(py).strip() and str(py).strip() != year:
            NOTES.append(f": YEAR SCORING ({ys}) overrides PHOTO YEAR ({py}) for scoring")
        site["yearScoring"] = ys

    # LOCATION SCORING: points lost per mile, e.g. "1 point per mile".
    ls = (site.get("locationScoring") or "").strip()
    if ls:
        m = re.search(r"\d*\.?\d+", ls)
        if not m:
            raise SystemExit(
                f"{name()}: LOCATION SCORING needs a number of points per mile, "
                f"like '1 point per mile'; got {ls!r}"
            )
        site["pointsPerMile"] = float(m.group(0))
    site.pop("locationScoring", None)

    # Blank means "unknown"; numbers become numbers.
    site_name = name()
    for field in list(site):
        value = site[field]
        if isinstance(value, str) and value.strip() == "":
            site[field] = None
        if field in INTEGER and site[field] is not None:
            try:
                site[field] = int(str(site[field]).strip())
            except ValueError:
                raise SystemExit(f"{site_name}: {field} must be a whole year, got {value!r}")
        if field in FLOAT and site[field] is not None:
            try:
                site[field] = float(str(site[field]).strip())
            except ValueError:
                raise SystemExit(f"{site_name}: {field} must be a number, got {value!r}")
    return site


def to_json_site(site, ident):
    """Reproduce the field order the app has always used, dropping empties."""
    out = {
        "id": ident,
        "title": site.get("title") or "",
        "shortTitle": site.get("shortTitle") or site.get("title") or "",
        "photoYear": site.get("photoYear"),
        "nowYear": site.get("nowYear"),
    }
    if site.get("yearScoring"):
        out["yearScoring"] = site["yearScoring"]
    if site.get("pointsPerMile") is not None:
        n = site["pointsPerMile"]
        out["pointsPerMile"] = int(n) if n == int(n) else n
    out |= {
        "lat": site["lat"],
        "lng": site["lng"],
        "hint": site.get("hint") or "",
        "history": site.get("history") or "",
        "historicLabel": site.get("historicLabel") or site.get("title") or "",
        "modernLabel": site.get("modernLabel") or "",
        "thenImage": site.get("thenImage"),
    }
    if site.get("nowImage"):
        out["nowImage"] = site["nowImage"]
    if site.get("fullHistory"):
        out["fullHistory"] = site["fullHistory"]
    out["archiveLinks"] = site.get("archiveLinks", [])
    if site.get("googleMapUrl"):
        out["googleMapUrl"] = site["googleMapUrl"]
    if not out["thenImage"]:
        del out["thenImage"]

    # Where a yellow circle sits in each photo, so the game keeps it in view.
    # Worked out from the image files each run, never typed by hand.
    for key, focus_key in (("thenImage", "thenFocus"), ("nowImage", "nowFocus")):
        if out.get(key):
            path = PUBLIC / out[key]
            if not path.exists():
                NOTES.append(f"{out['shortTitle']}: photo file not found: {out[key]}")
                continue
            ring = find_ring(path)
            if ring:
                out[focus_key] = ring
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check_only = "--check" in sys.argv
    in_path = Path(args[0]) if args else DEFAULT_IN

    text, encoding = read_text(in_path)
    lines = text.splitlines()  # copes with Windows, Unix and old-Mac line endings

    # Split into blocks on the ##### rules; the header before the first rule is dropped.
    blocks, current = [], None
    for line in lines:
        if RULE_RE.match(line):
            if current is not None and any(l.strip() for l in current):
                blocks.append(current)
            current = []
        elif current is not None:
            current.append(line)
    if current is not None and any(l.strip() for l in current):
        blocks.append(current)

    live, skipped = [], []
    for n, blk in enumerate(blocks, 1):
        notes_before = len(NOTES)
        site = parse_block(blk, "")
        label = site.get("shortTitle") or site.get("title") or f"block {n}"
        NOTES[notes_before:] = [f"{label}{note}" for note in NOTES[notes_before:]]
        if not any(k for k in site if k != "archiveLinks") and not site["archiveLinks"]:
            continue  # just a "SITE n" banner between two rules
        name = site.get("title") or site.get("shortTitle") or f"site {n}"
        if site.get("lat") is None or site.get("lng") is None:
            skipped.append(name)
            continue
        live.append(to_json_site(site, len(live) + 1))

    print(f"read {in_path.name} ({encoding}): {len(live) + len(skipped)} sites in file")
    for s in live:
        flags = []
        if s.get("yearScoring"):
            flags.append(f"year: {s['yearScoring']}")
        elif s["photoYear"] is None:
            flags.append("no photo year")
        if s.get("pointsPerMile") is not None:
            flags.append(f"location: {s['pointsPerMile']} pts/mile")
        for k, what in (("thenFocus", "then"), ("nowFocus", "now")):
            if s.get(k):
                flags.append(f"yellow circle in {what} photo")
        if not s["hint"]:
            flags.append("no hint")
        else:
            n = len([h for h in s["hint"].split("\n") if h.strip()])
            flags.append(f"{n} hint{'' if n == 1 else 's'}")
        if not s["history"]: flags.append("no history")
        if "nowImage" not in s: flags.append("no now photo")
        print(f"  in game : {s['shortTitle']:<18} {', '.join(flags) or 'complete'}")
    for name in skipped:
        print(f"  left out: {name:<18} no coordinates")

    for note in NOTES:
        print(f"  note    : {note}")

    if check_only:
        print("(--check: nothing written)")
        return
    io.open(TARGET, "w", encoding="utf-8").write(
        json.dumps(live, ensure_ascii=False, indent=2) + "\n"
    )
    print(f"wrote {TARGET.relative_to(ROOT)} with {len(live)} sites")


if __name__ == "__main__":
    main()
