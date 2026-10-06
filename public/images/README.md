# Site Photos

Photos are referenced from `public/landmarks.json` by the `thenImage` and
`nowImage` fields, as paths like `images/hocker-house-then.jpg`.

A site needs **both** a `thenImage` and a `nowImage` to show the Then & Now
slider. With only one photo it displays that photo alone; with none it falls
back to a decorative gradient.

## Currently in the game

| Site | then | now |
|---|---|---|
| Hotel Hershey | `hotel-hershey-then.jpg` | `hotel-hershey-now.jpg` |
| Giant field (743 & Cocoa) | `giant-field-then.jpg` | `giant-field-now.jpg` |
| State Police Academy | `police-academy-then.jpg` | `police-academy-now.jpg` |
| Hocker House | `hocker-house-then.jpg` | `hocker-house-now.jpg` |

The Hocker House historic print is cropped to the photograph itself; the scan
showed it on a grey mounting card, which looked wrong beside a full-frame
present-day photo in the slider.

The Hotel Hershey pair is **registered**: the historic photo is cropped to exactly
the area the present-day aerial covers, so the two line up in the slider at any
screen size. Replacing either photo means redoing that crop.

**Yellow circles.** When the Historical Society marks what to look for with a
yellow ring (both Giant field photos), `tools/text_to_landmarks.py` finds
it automatically and records where it sits (`thenFocus` / `nowFocus` in
`landmarks.json`). The game then keeps it in view, and if both photos of a pair
are circled it lines the circles up in the slider. Circled photos also skip the
app's sepia tint, which would otherwise turn the yellow pale cream.

## Staged but not yet in the game

These files are in this folder and referenced by nothing. They are waiting on
the missing pieces listed below.

- `round-barn-then.jpg` — needs latitude/longitude and a present-day photo.
- `decarlos-then.jpg` — needs latitude/longitude, a present-day photo, and its
  own descriptive text. The `DeCarlos.docx` supplied with it was a byte-for-byte
  duplicate of `Hocker House.docx`, so no DeCarlo's text exists yet.

## PastPerfect links not yet used

Art supplied search links for two sites that are staged rather than in the game.
Keep them here so they are not lost:

- **Round Barn** — `https://hersheyhistory.pastperfectonline.com/AdvancedSearch?advanceSearchActivated=False&firstTimeSearch=False&search_include_photos=true&search_include_creators=true&search_include_people=true&search_include_containers=true&searchcat_1=&searchcat_2=&searchcat_3=&searchcat_4=%22round+barn%22&searchcat_5=&searchcat_6=&searchcat_7=&searchcat_8=&searchcat_9=&searchcat_10=&searchcat_11=&searchcat_12=&actionType=Search`
- **DeCarlo's** — `https://hersheyhistory.pastperfectonline.com/advancedsearch?utf8=%E2%9C%93&advanceSearchActivated=true&firstTimeSearch=true&search_include_objects=true&search_include_archives=true&search_include_library=true&search_include_photos=true&search_include_creators=true&search_include_people=true&search_include_containers=true&searchcat_1=&searchcat_2=&searchcat_3=&searchcat_4=&searchcat_5=&searchcat_6=&searchcat_7=&searchcat_8=&searchcat_9=&searchcat_10=&searchcat_11=&searchcat_12=%22BUSINESS+%2F+DECARLO%27S+RESTAURANT%22&searchButton=Search`

## Still needed

- **Which spot is the answer for Giant field?** The game scores guesses against
  the 743 & Cocoa intersection (40.267189, -76.647889), from the Historical
  Society's original document. The historic photo now says "Find this house for
  a perfect score", and the Google Maps link pins 232 Peach Ave, 0.22 miles
  away — so a player who finds the circled house exactly scores 800, not 1,000.
- **Hocker House: 1806 or 1809?** It is scored against 1809 (the build year),
  but its own history text says "Built in 1806".

## A note on the present-day photos

The `now` images for 743 & Cocoa and the State Police Academy are annotated
screen captures of Google Earth and Google Street View. Two problems:

1. Google's imagery is licensed, and this site is published publicly.
2. The annotations name the answer ("State Police Academy", "Cocoa Avenue",
   "Giant Foods"), which gives the puzzle away — and now that the Then & Now
   slider appears on the clue page too, a player can reveal them *before*
   guessing.

Photographs taken by volunteers standing at each site would solve both at once,
and would match the framing of the historic shots more closely.
