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
| 743 & Cocoa | `cocoa-743-then.jpg` | `cocoa-743-now.jpg` |
| State Police Academy | `police-academy-then.jpg` | `police-academy-now.jpg` |
| Hocker House | `hocker-house-then.jpg` | *missing* |

The Hotel Hershey pair is **registered**: the historic photo is cropped to exactly
the area the present-day aerial covers, so the two line up in the slider at any
screen size. Replacing either photo means redoing that crop.

**Yellow circles.** When the Historical Society marks what to look for with a
yellow ring (743 & Cocoa's historic aerial), `tools/text_to_landmarks.py` finds
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

- **A present-day photo of the Hocker House.** The photo supplied on 2026-09-29
  shows the Masonic Temple across the intersection, not the house. The house is
  on the southeast corner of Hockersville and Governor roads; the Street View
  link supplied with it faces north-northeast, away from it.
- **Which spot is the answer for 743 & Cocoa?** The game scores guesses against
  the intersection (40.267189, -76.647889). The Google Maps link supplied on
  2026-09-29 pins 232 Peach Ave, 0.22 miles away. If that is the house in the
  yellow circle, the coordinates should move there.
- **`nowYear`** for 743 & Cocoa, the Police Academy and the Hocker House. The
  Police Academy's Street View capture is stamped "Image capture: Nov 2018".

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
