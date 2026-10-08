"""
Write public/landmarks.json out as a plain-English form that someone who
doesn't read code can mark up. Turn the result back into JSON with
text_to_landmarks.py.

    python tools/landmarks_to_text.py            -> landmarks-review.txt
    python tools/landmarks_to_text.py out.txt    -> out.txt

Sites that are staged but not yet in the game (no coordinates) are appended
as blank forms, so they can be filled in on the same sheet.
"""
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "landmarks.json"
DEFAULT_OUT = ROOT / "landmarks-review.txt"

RULE = "#" * 78

# Sites we hold photos and links for, but which cannot enter the game until
# they have coordinates. Text here came from the Historical Society's own
# documents; nothing has been invented.
STAGED = [
    {
        "title": "The Round Barn",
        "shortTitle": "Round Barn",
        "historicLabel": "The Round Barn",
        "modernLabel": "The Site",
        "thenImage": "images/round-barn-then.jpg",
        "hint": (
            "The area behind the barn is now all parking lots.\n\n"
            "The many-windowed building was once cold, then held old things, "
            "now is empty."
        ),
        "history": (
            "Hershey’s famous Round Barn is something the older folks of "
            "Hershey still talk about, but it has been gone for well over 50 "
            "years. Only one thing in this image remains—the white building "
            "with a lot of windows in the background, and it was a key part of "
            "the community for decades. The road in front of the round barn has "
            "been gone for years too. There were Milton Hershey School student "
            "homes here too. There is one in this image but it was replaced by a "
            "large brick one that stood into the early 2000s."
        ),
        "fullHistory": (
            "Hershey’s famous Round Barn is something the older folks of "
            "Hershey still talk about, but it has been gone for well over 50 "
            "years. Only one thing in this image remains—the white building "
            "with a lot of windows in the background, and it was a key part of "
            "the community for decades. The road in front of the round barn has "
            "been gone for years too.\n\n"
            "There were Milton Hershey School student homes here too. There is "
            "one in this image but it was replaced by a large brick one that "
            "stood into the early 2000s."
        ),
        "archiveLinks": [
            {
                "label": "Search the Historical Society archive",
                "url": "https://hersheyhistory.pastperfectonline.com/AdvancedSearch?advanceSearchActivated=False&firstTimeSearch=False&search_include_photos=true&search_include_creators=true&search_include_people=true&search_include_containers=true&searchcat_1=&searchcat_2=&searchcat_3=&searchcat_4=%22round+barn%22&searchcat_5=&searchcat_6=&searchcat_7=&searchcat_8=&searchcat_9=&searchcat_10=&searchcat_11=&searchcat_12=&actionType=Search",
            }
        ],
    },
    {
        "title": "DeCarlo’s Restaurant",
        "shortTitle": "DeCarlo’s",
        "historicLabel": "DeCarlo’s Restaurant",
        "modernLabel": "The Site",
        "thenImage": "images/decarlos-then.jpg",
        "archiveLinks": [
            {
                "label": "Search the Historical Society archive",
                "url": "https://hersheyhistory.pastperfectonline.com/advancedsearch?utf8=%E2%9C%93&advanceSearchActivated=true&firstTimeSearch=true&search_include_objects=true&search_include_archives=true&search_include_library=true&search_include_photos=true&search_include_creators=true&search_include_people=true&search_include_containers=true&searchcat_1=&searchcat_2=&searchcat_3=&searchcat_4=&searchcat_5=&searchcat_6=&searchcat_7=&searchcat_8=&searchcat_9=&searchcat_10=&searchcat_11=&searchcat_12=%22BUSINESS+%2F+DECARLO%27S+RESTAURANT%22&searchButton=Search",
            }
        ],
    },
]

HEADER = f"""\
HERSHEY HISTORY HUNT - SITE INFORMATION
=======================================

HOW TO USE THIS FILE

  * Each site is a block between the {RULE[:8]}... lines. One block per site.
  * Every line is a LABEL, a colon, and the value. Type your answer after
    the colon. Where it is blank, we don't have that information yet.
  * HINT, HISTORY and FULL HISTORY can run to several lines. Put each hint
    or paragraph on its own line. They continue until the next LABEL.
  * Please leave the LABELS themselves alone. Change the LATITUDE,
    LONGITUDE and photo file lines only if you mean to.
  * Save as plain text (.txt) when you are done.

WHAT EACH LABEL MEANS

  TITLE               Full name, shown on the answer page.
  SHORT TITLE         Short name for the final score screen.
  HINT                Shown to players BEFORE they guess. One hint per
                      line; add as many as you like. Do not give away the
                      name of the place.
  HISTORIC LABEL      Caption under the old photo on the answer page.
  MODERN LABEL        Caption under the present-day photo.
  LATITUDE/LONGITUDE  The exact spot players are scored against. A site
                      with these blank stays out of the game.
  THEN PHOTO          File name of the old photo.
  PHOTO YEAR          The year players guess (when the photo was taken,
                      or when the place was built - say which in a hint).
                      Write "Circa 1925" when it is approximate: a guess
                      in the right decade scores full marks, and each
                      decade off costs 25. Any words are shown with the
                      date. Leave blank if unknown: everyone then gets
                      full marks for the year.
  NOW PHOTO           File name of the present-day photo.
  NOW PHOTO YEAR      Year the present-day photo was taken.
  LOCATION SCORING    Optional. Leave blank for the usual rule (100 points
                      off per tenth of a mile). For a far-off site, write
                      e.g. "1 point per mile" or "0.01 points per mile".
  GOOGLE MAP          Link shown on the answer page as "View on Google
                      Maps". Should point at the same spot as LATITUDE
                      and LONGITUDE.
  ARCHIVE LINK        Text and web address of the PastPerfect search shown
                      under "More historical images". Add another pair of
                      lines for a second link.
  HISTORY             The story shown on the answer page.
  FULL HISTORY        Longer version behind the "Read full story" button.
                      Optional.

"""


def fmt(value):
    return "" if value is None else str(value)


def per_mile(n):
    if n is None:
        return ""
    return f"{n} point{'' if n == 1 else 's'} per mile"


def block(number, site, note=None):
    lines = [RULE, f"SITE {number}", RULE]
    if note:
        lines.append(f"({note})")
    # Laid out the way the form comes back from the Historical Society: each
    # year beside its photo, and "Circa 1925" written straight into PHOTO YEAR
    # (text_to_landmarks.py also still accepts a separate YEAR SCORING line).
    lines += [
        f"TITLE: {fmt(site.get('title'))}",
        f"SHORT TITLE: {fmt(site.get('shortTitle'))}",
        f"HINT: {fmt(site.get('hint'))}",
        "",
        f"HISTORIC LABEL: {fmt(site.get('historicLabel'))}",
        f"MODERN LABEL: {fmt(site.get('modernLabel'))}",
        f"LATITUDE: {fmt(site.get('lat'))}",
        f"LONGITUDE: {fmt(site.get('lng'))}",
        f"THEN PHOTO: {fmt(site.get('thenImage'))}",
        f"PHOTO YEAR: {fmt(site.get('yearScoring') or site.get('photoYear'))}",
        f"NOW PHOTO: {fmt(site.get('nowImage'))}",
        f"NOW PHOTO YEAR: {fmt(site.get('nowYear'))}",
        f"LOCATION SCORING: {per_mile(site.get('pointsPerMile'))}",
        f"GOOGLE MAP: {fmt(site.get('googleMapUrl'))}",
    ]
    links = site.get("archiveLinks") or [{"label": "", "url": ""}]
    for link in links:
        lines.append(f"ARCHIVE LINK LABEL: {fmt(link.get('label'))}")
        lines.append(f"ARCHIVE LINK URL: {fmt(link.get('url'))}")
    lines += [
        "",
        "HISTORY:",
        fmt(site.get("history")),
        "",
        "FULL HISTORY:",
        fmt(site.get("fullHistory")),
        "",
        "",
    ]
    return "\n".join(lines)


def main():
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    sites = json.load(io.open(SOURCE, encoding="utf-8"))

    parts = [HEADER]
    for i, site in enumerate(sites, 1):
        parts.append(block(i, site))
    for j, site in enumerate(STAGED, len(sites) + 1):
        parts.append(
            block(j, site, note="Not in the game yet - needs LATITUDE and LONGITUDE")
        )

    io.open(out_path, "w", encoding="utf-8", newline="\n").write("\n".join(parts))
    print(f"wrote {out_path}  ({len(sites)} live sites + {len(STAGED)} staged)")


if __name__ == "__main__":
    main()
