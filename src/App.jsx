import { useEffect, useLayoutEffect, useRef, useState } from "react";
import L from "leaflet";
import ThenNowSlider from "./ThenNowSlider.jsx";
import { assetUrl } from "./assetUrl.js";
import {
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  Camera,
  Clock,
  Images,
  Info,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  RotateCcw,
  X,
} from "lucide-react";

const HERSHEY_CENTER = [40.2859, -76.6503];
const DEFAULT_ZOOM = 14;

// Derry Township, Dauphin County PA — the whole township is framed when the
// map is expanded. Bounds from OpenStreetMap's administrative boundary.
const DERRY_TOWNSHIP_BOUNDS = [
  [40.2286, -76.7372], // south-west
  [40.3396, -76.592], // north-east
];

// --- Scoring -----------------------------------------------------------
// Standard rules, used unless a site sets its own in landmarks.json:
//   Location: 1000 points, less 100 for every tenth of a mile off.
//   Year:      100 points, less 1 for every year off.
// A site can instead set pointsPerMile (for far-off places such as Hershey,
// Cuba) and/or yearScoring "circa 1925" (25 points off per decade).
const METERS_PER_MILE = 1609.344;
const MAX_LOCATION_POINTS = 1000;
const MAX_YEAR_POINTS = 100;
const POINTS_PER_TENTH_MILE = 100;
const POINTS_PER_DECADE = 25;
const MAX_POINTS_PER_SITE = MAX_LOCATION_POINTS + MAX_YEAR_POINTS;

/** Tenths of a mile, rounded down so a partial tenth is never charged. */
function tenthsOfAMile(meters) {
  return Math.floor((meters / METERS_PER_MILE) * 10);
}

function locationPointsFor(meters, site) {
  if (site.pointsPerMile != null) {
    // Round the penalty down, so a fraction of a point is never charged.
    const penalty = Math.floor((site.pointsPerMile * meters) / METERS_PER_MILE);
    return Math.max(0, MAX_LOCATION_POINTS - penalty);
  }
  return Math.max(
    0,
    MAX_LOCATION_POINTS - tenthsOfAMile(meters) * POINTS_PER_TENTH_MILE,
  );
}

/** The year guesses are scored against: YEAR SCORING's year, else PHOTO YEAR. */
function scoringYear(site) {
  const m = site.yearScoring && site.yearScoring.match(/\b(\d{4})\b/);
  if (m) return Number(m[1]);
  return site.photoYear ?? null;
}

/** "circa 1925" (or "ca." / "c.") means the date is approximate to the decade. */
function isCirca(site) {
  return Boolean(site.yearScoring && /\b(circa|ca\.|c\.)/i.test(site.yearScoring));
}

/** The date as the Historical Society wrote it, words and all. */
function dateLabel(site) {
  if (site.yearScoring) return site.yearScoring;
  return site.photoYear == null ? "Date unknown" : String(site.photoYear);
}

/** Decades between two years, counting the decades themselves (1920s vs 1930s). */
function decadesApart(a, b) {
  return Math.abs(Math.floor(a / 10) - Math.floor(b / 10));
}

/** Full credit when the archive has no date on file for the photo. */
function yearPointsFor(guessYear, site) {
  const year = scoringYear(site);
  if (year == null) return MAX_YEAR_POINTS;
  if (guessYear == null) return 0;
  if (isCirca(site)) {
    return Math.max(0, MAX_YEAR_POINTS - POINTS_PER_DECADE * decadesApart(guessYear, year));
  }
  return Math.max(0, MAX_YEAR_POINTS - Math.abs(guessYear - year));
}

function formatNumber(n) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** Plain-English scoring rules for one site. Never mentions the answer. */
function locationRule(site) {
  if (site.pointsPerMile != null) {
    const n = site.pointsPerMile;
    return `Up to ${formatNumber(MAX_LOCATION_POINTS)} points, minus ${formatNumber(n)} point${n === 1 ? "" : "s"} for every mile you are off.`;
  }
  return `Up to ${formatNumber(MAX_LOCATION_POINTS)} points, minus 100 for every tenth of a mile you are off.`;
}

function yearRule(site) {
  if (scoringYear(site) == null) {
    return `Up to ${MAX_YEAR_POINTS} points. The archive has no date for this photo, so every guess scores full marks.`;
  }
  if (isCirca(site)) {
    return `Up to ${MAX_YEAR_POINTS} points. This photo's date is approximate: a guess in the right decade scores full marks, and you lose ${POINTS_PER_DECADE} for each decade you are off.`;
  }
  return `Up to ${MAX_YEAR_POINTS} points, minus 1 for every year you are off.`;
}

/** Great-circle distance between two lat/lng pairs, in meters. */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 6371000 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const guessIcon = () =>
  L.divIcon({
    className: "hhh-guess",
    html: '<div style="background:#3c2415;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff8e7;box-shadow:0 3px 10px rgba(60,36,21,0.4);display:flex;align-items:center;justify-content:center"><div style="width:10px;height:10px;background:#d4a574;border-radius:50%;transform:rotate(45deg)"></div></div>',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });

const actualIcon = () =>
  L.divIcon({
    className: "hhh-actual",
    html: '<div style="background:#d4a574;width:36px;height:36px;border-radius:50%;border:3px solid #3c2415;box-shadow:0 3px 12px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-weight:900;color:#3c2415;font-size:16px;">★</div>',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

function ratingFor(distanceMeters) {
  if (distanceMeters < 100) return "INCREDIBLE! CHOCOLATE HISTORIAN!";
  if (distanceMeters < 300) return "GREAT EYE! LOCAL EXPERT";
  if (distanceMeters < 600) return "CLOSE! GOOD SENSE OF TOWN";
  return "KEEP EXPLORING!";
}

function summaryFor(totalScore) {
  if (totalScore > 3000)
    return "Outstanding! You're a true Chocolate Town historian. Your knowledge would make Milton Hershey proud.";
  if (totalScore > 2000)
    return "Great work! You know your Hershey streets. Bring a volunteer friend and beat your score.";
  return "Nice start! Hershey's history hides in plain sight. Walk the town and you'll spot clues everywhere.";
}

const ARCHIVE_URL = "https://hersheyhistory.pastperfectonline.com/";

/**
 * Split authored text into display lines. The text is written in a plain-text
 * form (tools/landmarks_to_text.py) where each hint or paragraph is one long
 * line, so any line break — single or double — starts a new one.
 */
function toLines(text) {
  return (text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const INTRO_STEPS = [
  { n: "1", t: "Study the Photo", d: "Note buildings, hills, and year." },
  { n: "2", t: "Drop Your Pin", d: "Click the map to place your guess." },
  { n: "3", t: "Guess the Year", d: "Type the year you think it was taken." },
  { n: "4", t: "Learn the Story", d: "See Then & Now and the history." },
];

export default function App() {
  // "intro" -> "playing" -> "result" -> ... -> "finished"
  const [phase, setPhase] = useState("intro");
  const [roundIndex, setRoundIndex] = useState(0);
  const [guess, setGuess] = useState(null);
  const [yearGuess, setYearGuess] = useState("");
  const [scores, setScores] = useState([]);
  const [distances, setDistances] = useState([]);
  const [lastDistance, setLastDistance] = useState(0);
  const [lastLocationPoints, setLastLocationPoints] = useState(0);
  const [lastYearPoints, setLastYearPoints] = useState(0);
  const [lastYearGuess, setLastYearGuess] = useState(null);
  const [landmarks, setLandmarks] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [sliderValue, setSliderValue] = useState(50);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [isStoryExpanded, setIsStoryExpanded] = useState(false);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const guessMarkerRef = useRef(null);
  const actualMarkerRef = useRef(null);
  const errorLineRef = useRef(null);
  // Where the map was looking before it went fullscreen, so collapsing restores it.
  const collapsedViewRef = useRef(null);
  const wasMapExpandedRef = useRef(false);

  const site = landmarks && landmarks[roundIndex];
  const totalScore = scores.reduce((sum, points) => sum + points, 0);

  // Load the landmark data.
  useEffect(() => {
    let cancelled = false;
    fetch(assetUrl("landmarks.json"))
      .then((res) => {
        if (!res.ok) throw Error("Unable to load landmark data");
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0)
          throw Error("Landmark data is empty");
        if (cancelled) return;
        setLandmarks(data);
        setLoadError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(
          "Unable to load landmark data. Serve this folder over HTTP and try again.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build a fresh map for each round, and again when the phase swaps the map
  // between the guess layout and the answer layout.
  useEffect(() => {
    if (!mapContainerRef.current || phase === "intro" || phase === "finished")
      return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: HERSHEY_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (event) => {
      if (phase !== "playing") return;
      setGuess({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 250);
  }, [phase, roundIndex]);

  // Keep the guess pin in sync with the last map click.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (guessMarkerRef.current) {
      map.removeLayer(guessMarkerRef.current);
      guessMarkerRef.current = null;
    }
    if (guess && phase === "playing") {
      guessMarkerRef.current = L.marker([guess.lat, guess.lng], {
        icon: guessIcon(),
      }).addTo(map);
    }
  }, [guess, phase]);

  // On reveal: drop the true location, draw the error line, frame both.
  useEffect(() => {
    if (phase !== "result" || !guess) return;
    const map = mapRef.current;
    if (!map) return;

    if (actualMarkerRef.current) map.removeLayer(actualMarkerRef.current);
    if (errorLineRef.current) map.removeLayer(errorLineRef.current);

    actualMarkerRef.current = L.marker([site.lat, site.lng], {
      icon: actualIcon(),
    }).addTo(map);

    errorLineRef.current = L.polyline(
      [
        [guess.lat, guess.lng],
        [site.lat, site.lng],
      ],
      { color: "#3c2415", weight: 3, dashArray: "8 8", opacity: 0.8 },
    ).addTo(map);

    const bounds = L.latLngBounds([
      [guess.lat, guess.lng],
      [site.lat, site.lng],
    ]).pad(0.3);
    map.fitBounds(bounds, { animate: true, maxZoom: 16 });
  }, [phase, guess, site]);

  // Re-measure Leaflet when the map card enters or leaves fullscreen. Expanding
  // frames all of Derry Township; collapsing returns to the previous view.
  useEffect(() => {
    const wasExpanded = wasMapExpandedRef.current;
    wasMapExpandedRef.current = isMapExpanded;

    const map = mapRef.current;
    if (!map || (!isMapExpanded && !wasExpanded)) return;

    const timer = setTimeout(() => {
      map.invalidateSize();
      if (isMapExpanded) {
        map.fitBounds(DERRY_TOWNSHIP_BOUNDS, { animate: false });
      } else if (collapsedViewRef.current) {
        const { center, zoom } = collapsedViewRef.current;
        map.setView(center, zoom, { animate: false });
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [isMapExpanded]);

  // Never leave an overlay open across a round or phase change.
  useEffect(() => {
    setIsMapExpanded(false);
    setIsStoryExpanded(false);
  }, [phase, roundIndex]);

  // Start every screen at the top. React swaps the content without touching the
  // window's scroll position, so on a phone — where the buttons sit far down a
  // long page — the next screen opened halfway down, showing the map instead of
  // the photograph. useLayoutEffect so this lands before the browser paints.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [phase, roundIndex]);

  // Escape closes whichever overlay is open.
  useEffect(() => {
    if (!isMapExpanded && !isStoryExpanded) return;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setIsMapExpanded(false);
      setIsStoryExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMapExpanded, isStoryExpanded]);

  // Stop the page scrolling behind a fullscreen overlay.
  useEffect(() => {
    if (!isMapExpanded && !isStoryExpanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isMapExpanded, isStoryExpanded]);

  if (loadError || !landmarks) {
    return (
      <div className="min-h-screen bg-[#fff8e7] text-[#3c2415] flex items-center justify-center p-6">
        <div className="max-w-md bg-white border border-[#d4a574]/40 rounded-2xl p-8 text-center shadow-[0_20px_60px_rgba(60,36,21,0.12)]">
          <h1 className="font-black text-2xl">
            {loadError ? "Landmarks unavailable" : "Loading landmarks..."}
          </h1>
          {loadError && (
            <p className="mt-3 text-sm leading-relaxed text-[#3c2415]/70">
              {loadError}
            </p>
          )}
        </div>
      </div>
    );
  }

  // The archive often has no date for a photo; that reads as "Date unknown"
  // everywhere and scores full year credit.
  const displayYear = dateLabel(site);
  const yearScored = scoringYear(site);
  let yearOutcome;
  if (yearScored == null) yearOutcome = "No date on file";
  else if (lastYearGuess == null) yearOutcome = "No year entered";
  else if (isCirca(site)) {
    const d = decadesApart(lastYearGuess, yearScored);
    yearOutcome = d === 0 ? "Right decade" : `${d} decade${d === 1 ? "" : "s"} off`;
  } else yearOutcome = `${Math.abs(lastYearGuess - yearScored)} yr off`;
  const archiveLinks = site.archiveLinks || [];
  const hints = toLines(site.hint);
  const historyParagraphs = toLines(site.history);
  const fullParagraphs = toLines(site.fullHistory);
  const storyParagraphs = fullParagraphs.length
    ? fullParagraphs
    : historyParagraphs;
  // Only offer "Read full story" when it says more than the section already
  // shows; several sites carry a full history identical to the short one.
  const hasFullerStory =
    fullParagraphs.length > 0 &&
    fullParagraphs.join(" ") !== historyParagraphs.join(" ");

  const milesOff = tenthsOfAMile(lastDistance) / 10;
  const lastTotal = lastLocationPoints + lastYearPoints;

  const startHunt = () => {
    setSliderValue(50);
    setPhase("playing");
  };

  const toggleMapExpanded = () => {
    const map = mapRef.current;
    if (map && !isMapExpanded) {
      collapsedViewRef.current = {
        center: map.getCenter(),
        zoom: map.getZoom(),
      };
    }
    setIsMapExpanded((expanded) => !expanded);
  };

  const lockInGuess = () => {
    if (!guess) return;
    const distance = haversineMeters(guess.lat, guess.lng, site.lat, site.lng);
    const parsedYear = /^\d{4}$/.test(yearGuess) ? Number(yearGuess) : null;
    const locationPoints = locationPointsFor(distance, site);
    const yearPoints = yearPointsFor(parsedYear, site);

    setLastDistance(distance);
    setLastLocationPoints(locationPoints);
    setLastYearPoints(yearPoints);
    setLastYearGuess(parsedYear);
    setDistances((prev) => [...prev, distance]);
    setScores((prev) => [...prev, locationPoints + yearPoints]);
    setSliderValue(50);
    setPhase("result");
  };

  // Shrink the map back down first, so the reveal frames both pins against the
  // inline map size rather than the fullscreen one.
  const lockInFromExpandedMap = () => {
    if (!guess) return;
    setIsMapExpanded(false);
    setTimeout(lockInGuess, 120);
  };

  const nextSite = () => {
    const map = mapRef.current;
    if (map) {
      for (const ref of [guessMarkerRef, actualMarkerRef, errorLineRef]) {
        if (ref.current) {
          map.removeLayer(ref.current);
          ref.current = null;
        }
      }
    }
    setGuess(null);
    setYearGuess("");
    setSliderValue(50);

    if (roundIndex < landmarks.length - 1) {
      setRoundIndex((i) => i + 1);
      setPhase("playing");
      setTimeout(() => {
        if (!mapRef.current) return;
        mapRef.current.setView(HERSHEY_CENTER, DEFAULT_ZOOM);
        mapRef.current.invalidateSize();
      }, 100);
    } else {
      setPhase("finished");
    }
  };

  const restart = () => {
    setRoundIndex(0);
    setScores([]);
    setDistances([]);
    setGuess(null);
    setYearGuess("");
    setSliderValue(50);
    setPhase("intro");
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  };

  // The map card is shared by the guess and answer pages; only the header
  // wording and the lock-in footer differ.
  const mapCard = (
    <div
      className={`hhh-map-card rounded-[20px] overflow-hidden border-[6px] border-white shadow-[0_12px_32px_rgba(60,36,21,0.15)] bg-[#e9dfc8] ${
        isMapExpanded ? "hhh-map-expanded" : ""
      }`}
    >
      <div className="bg-[#3c2415] text-[#fff8e7] px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-black tracking-[0.18em]">
          <MapPin className="w-4 h-4 text-[#d4a574]" /> HERSHEY, PA •
          INTERACTIVE MAP
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-[10px] tracking-widest text-[#d4a574] font-bold whitespace-nowrap">
            {isMapExpanded
              ? "DERRY TOWNSHIP • ESC TO CLOSE"
              : phase === "playing"
                ? "ZOOM 14 • CLICK TO GUESS"
                : "PAN & ZOOM TO EXPLORE"}
          </div>
          <button
            onClick={toggleMapExpanded}
            aria-pressed={isMapExpanded}
            aria-label={
              isMapExpanded
                ? "Shrink map back into the page"
                : "Expand map to fill the screen"
            }
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#d4a574] px-3 py-1 text-[10px] font-black tracking-widest text-[#3c2415] transition hover:bg-[#e6c89a]"
          >
            {isMapExpanded ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" /> CLOSE
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" /> EXPAND
              </>
            )}
          </button>
        </div>
      </div>

      <div
        ref={mapContainerRef}
        className="hhh-map-canvas w-full bg-[#d8cfb3]"
        style={{ height: "clamp(240px, 40vh, 500px)" }}
      />

      {/* Fullscreen hides the sidebar, so the guess can be locked in from here
          rather than shrinking the map first. */}
      {isMapExpanded && phase === "playing" && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t-2 border-[#d4a574] bg-[#3c2415] px-4 py-3">
          <div className="flex items-center gap-2 text-[12px] font-bold text-[#fff8e7]">
            {guess ? (
              <>
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[#d4a574]" />
                Pin at {guess.lat.toFixed(4)}, {guess.lng.toFixed(4)}
                <span className="hidden md:inline text-[#fff8e7]/50">
                  — click again to move it
                </span>
              </>
            ) : (
              <>
                <Info className="h-4 w-4 shrink-0 text-[#d4a574]" />
                Tap anywhere on the map to drop your pin
              </>
            )}
          </div>
          <button
            onClick={lockInFromExpandedMap}
            disabled={!guess}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-[13px] font-black tracking-widest transition ${
              guess
                ? "bg-[#d4a574] text-[#3c2415] hover:bg-[#e6c89a]"
                : "cursor-not-allowed border border-[#fff8e7]/20 bg-[#fff8e7]/10 text-[#fff8e7]/30"
            }`}
          >
            LOCK IN GUESS <MapPin className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fff8e7] text-[#3c2415] selection:bg-[#d4a574]/40">
      {/* Paper-grain overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03] mix-blend-multiply"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <header className="relative z-10 bg-[#3c2415] text-[#fff8e7] border-b-[6px] border-[#d4a574] shadow-lg">
        <div className="hhh-header-inner mx-auto max-w-[1280px] px-4 md:px-8 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#d4a574] flex items-center justify-center text-[#3c2415] font-black text-[18px] tracking-tight">
              H
            </div>
            <div>
              <h1 className="font-black tracking-[0.12em] text-[16px] md:text-[20px] leading-none">
                HERSHEY HISTORY HUNT
              </h1>
              <p className="text-[11px] md:text-[12px] tracking-[0.22em] text-[#d4a574] font-bold -mt-0.5">
                WHERE AND WHEN WAS THIS?
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="bg-[#fff8e7]/10 border border-[#d4a574]/30 rounded-full px-3 md:px-4 py-1.5 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#d4a574]" />
              <span className="text-[12px] md:text-[13px] font-bold tracking-widest">
                {phase === "intro" || phase === "finished"
                  ? "READY"
                  : `${roundIndex + 1} / ${landmarks.length}`}
              </span>
            </div>
            <div className="bg-[#d4a574] text-[#3c2415] rounded-full px-3 md:px-5 py-1.5 flex items-center gap-2 font-black">
              <Award className="w-4 h-4" />
              <span className="text-[13px] md:text-[15px]">
                {phase === "intro" ? 0 : totalScore} PTS
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="hhh-main relative z-10 mx-auto max-w-[1280px] px-4 md:px-6 py-6 md:py-8">
        {/* ---------------------------------------------------------- LAUNCH */}
        {phase === "intro" && (
          <div className="hhh-intro max-w-[760px] mx-auto">
            <div className="bg-white rounded-[24px] border border-[#d4a574]/40 shadow-[0_20px_60px_rgba(60,36,21,0.12)] overflow-hidden">
              <div className="h-2 w-full bg-gradient-to-r from-[#3c2415] via-[#d4a574] to-[#3c2415]" />
              <div className="hhh-intro-content p-7 md:p-10">
                <div className="inline-flex items-center gap-2 bg-[#fff8e7] border border-[#d4a574]/40 rounded-full px-4 py-1.5 mb-5">
                  <Camera className="w-4 h-4 text-[#3c2415]" />
                  <span className="text-[11px] font-bold tracking-[0.18em]">
                    HERSHEY HISTORY CENTER
                  </span>
                </div>

                <h2 className="hhh-intro-title text-[32px] md:text-[44px] font-black leading-[1.02] tracking-tight">
                  When and where is this in Hershey History?
                </h2>

                <p className="mt-5 text-[17px] md:text-[18px] leading-relaxed text-[#3c2415]/80 max-w-[58ch]">
                  Test your Hershey history knowledge! Guess the date and
                  location of{" "}
                  <a
                    href={ARCHIVE_URL}
                    className="font-bold text-[#8b5a2b] underline decoration-[#d4a574] decoration-2 underline-offset-2 hover:text-[#3c2415]"
                  >
                    Hershey History Center's
                  </a>{" "}
                  archive photo to score points and unlock present-day views.
                </p>

                <div className="hhh-intro-steps mt-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {INTRO_STEPS.map((step) => (
                    <div
                      key={step.n}
                      className="bg-[#fff8e7] rounded-2xl p-4 border border-[#d4a574]/30"
                    >
                      <div className="w-7 h-7 rounded-full bg-[#3c2415] text-[#fff8e7] flex items-center justify-center font-black text-[12px]">
                        {step.n}
                      </div>
                      <div className="mt-2 font-bold text-[14px] tracking-wide">
                        {step.t}
                      </div>
                      <div className="text-[13px] leading-snug text-[#3c2415]/70 mt-1">
                        {step.d}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hhh-intro-actions mt-8 flex flex-wrap items-center gap-4">
                  <button
                    onClick={startHunt}
                    className="inline-flex items-center gap-2 bg-[#3c2415] text-[#fff8e7] hover:bg-[#2a190e] transition rounded-full px-7 py-3.5 font-black tracking-widest text-[13px] shadow-[0_8px_20px_rgba(60,36,21,0.25)]"
                  >
                    START HUNT <ArrowRight className="w-4 h-4" />
                  </button>
                  <div className="inline-flex items-center gap-2 text-[15px] text-[#3c2415]/70">
                    <Info className="w-5 h-5 shrink-0" /> {landmarks.length}{" "}
                    historic sites • No login needed
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-[#d4a574]/30 bg-[#fff8e7] px-5 py-4">
                  <div className="text-[11px] font-black tracking-[0.18em] text-[#8b5a2b]">
                    HOW SCORING WORKS
                  </div>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-[#3c2415]/80">
                    Unless stated at the bottom of the guess page, the scoring
                    is: each site is worth {formatNumber(MAX_POINTS_PER_SITE)}{" "}
                    points — up to{" "}
                    <b>{formatNumber(MAX_LOCATION_POINTS)} for the location</b>,
                    losing 100 for every tenth of a mile you are off, and up to{" "}
                    <b>{MAX_YEAR_POINTS} for the year</b>, losing 1 point per
                    year. When the archive has no date on file, the year scores
                    full marks.
                  </p>
                </div>
              </div>
            </div>
            <div className="hhh-intro-attribution text-center mt-4 text-[11px] tracking-widest text-[#3c2415]/40 font-bold">
              THE HERSHEY-DERRY TOWNSHIP HISTORICAL SOCIETY, 40 NORTHEAST DRIVE,
              HERSHEY, PA 17033
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------- GUESS */}
        {phase === "playing" && (
          <>
            <div className="hhh-game-header flex items-center justify-between mb-4">
              <span className="inline-flex items-center gap-1.5 bg-[#3c2415] text-[#fff8e7] rounded-full px-3 py-1 text-[11px] font-black tracking-widest">
                <span className="w-5 h-5 rounded-full bg-[#d4a574] text-[#3c2415] grid place-items-center text-[11px]">
                  {roundIndex + 1}
                </span>
                SITE {roundIndex + 1} OF {landmarks.length}
              </span>
              <div className="hidden md:flex items-center gap-2 text-[11px] font-bold tracking-widest text-[#3c2415]/60">
                <Navigation className="w-4 h-4" /> CLICK MAP TO PLACE PIN
              </div>
            </div>

            <div className="hhh-game-layout grid grid-cols-1 gap-5 items-start md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="rounded-[20px] overflow-hidden border-[6px] border-white shadow-[0_12px_32px_rgba(60,36,21,0.15)] bg-[#efe0c6]">
                  {/* The photo sets its own height, so nothing — least of all a
                      yellow circle marking what to find — is cropped away. */}
                  <div
                    className="relative w-full bg-gradient-to-br from-[#d4a574] via-[#b88a5a] to-[#8b5a2b]"
                    style={site.thenImage ? undefined : { height: "clamp(240px, 40vh, 460px)" }}
                  >
                    {site.thenImage && (
                      <img
                        src={assetUrl(site.thenImage)}
                        alt="Historic photograph of the site you are trying to place"
                        // sepia would turn a yellow circle pale cream
                        className={`block w-full h-auto ${site.thenFocus ? "" : "sepia"}`}
                      />
                    )}
                    <div
                      className="absolute inset-0 opacity-20 mix-blend-multiply"
                      style={{
                        backgroundImage:
                          "radial-gradient(circle at 30% 20%, #fff8e7 0%, transparent 40%), radial-gradient(circle at 80% 80%, #3c2415 0%, transparent 30%)",
                      }}
                    />
                    <div
                      className="absolute inset-0 bg-[#fff8e7]/10"
                      style={{ filter: "sepia(0.7) contrast(1.1)" }}
                    />
                    <div className="pointer-events-none absolute inset-0 rounded-[14px] shadow-[inset_0_0_120px_rgba(60,36,21,0.5)]" />
                  </div>

                  <div className="bg-[#fff8e7] p-5 md:p-6 text-center">
                    <div className="inline-block bg-[#3c2415] text-[#fff8e7] text-[10px] font-black tracking-[0.2em] px-3 py-1 rounded-full mb-3">
                      {hints.length > 1 ? "HINTS" : "HINT"}
                    </div>
                    {hints.length > 1 ? (
                      <ul className="hhh-hints mx-auto max-w-[52ch] space-y-2.5 text-left">
                        {hints.map((hint, i) => (
                          <li
                            key={i}
                            className="flex gap-3 text-[16px] md:text-[17px] font-bold leading-snug text-[#3c2415]"
                          >
                            <span className="mt-[0.45em] h-2 w-2 shrink-0 rounded-full bg-[#d4a574]" />
                            <span>{hint}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="font-black text-[20px] md:text-[22px] leading-snug text-[#3c2415] max-w-[46ch] mx-auto">
                        {hints[0] || "No hint for this one."}
                      </p>
                    )}
                    <div className="mt-4 pt-3 border-t border-[#d4a574]/30 flex justify-between text-[10px] font-bold tracking-widest text-[#3c2415]/60">
                      <span>© HERSHEY ARCHIVES</span>
                      <span>PLATE #{String(site.id).padStart(3, "0")}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hhh-game-sidebar space-y-4">
                {mapCard}

                <div className="bg-white rounded-[16px] border border-[#d4a574]/30 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-black tracking-[0.18em] text-[#3c2415]/60">
                      YOUR GUESS
                    </div>
                    <div className="text-[11px] font-bold text-[#8b5a2b]">
                      {guess
                        ? `${guess.lat.toFixed(4)}, ${guess.lng.toFixed(4)}`
                        : "No pin placed yet"}
                    </div>
                  </div>

                  {guess ? (
                    <div className="flex items-center gap-2 text-[12px] bg-[#fff8e7] border border-[#d4a574]/30 rounded-full px-3 py-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-[#3c2415]" /> Pin
                      placed — you can click again to move it
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[12px] bg-[#fff8e7]/70 border border-dashed border-[#d4a574]/50 rounded-full px-3 py-2 mb-3 text-[#3c2415]/60">
                      <Info className="w-4 h-4" /> Tap anywhere on the map to
                      drop your chocolate pin
                    </div>
                  )}

                  <label
                    htmlFor="year-guess"
                    className="flex items-center gap-2 text-[11px] font-black tracking-[0.18em] text-[#3c2415]/60 mb-2"
                  >
                    <Calendar className="w-4 h-4" /> WHAT YEAR WAS IT TAKEN?
                  </label>
                  <input
                    id="year-guess"
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="YYYY"
                    value={yearGuess}
                    onChange={(event) =>
                      setYearGuess(
                        event.target.value.replace(/\D/g, "").slice(0, 4),
                      )
                    }
                    className="mb-3 w-full rounded-2xl border-2 border-[#d4a574]/50 bg-[#fff8e7] px-4 py-3 text-center text-[24px] font-black tracking-[0.18em] text-[#3c2415] placeholder:text-[#3c2415]/25 focus:border-[#3c2415] focus:outline-none"
                  />

                  <button
                    onClick={lockInGuess}
                    disabled={!guess}
                    className={`w-full rounded-full py-3.5 font-black tracking-widest text-[13px] transition flex items-center justify-center gap-2 ${
                      guess
                        ? "bg-[#3c2415] text-[#fff8e7] hover:bg-[#2a190e] shadow-[0_8px_18px_rgba(60,36,21,0.25)]"
                        : "bg-[#efe0c6] text-[#3c2415]/30 cursor-not-allowed border border-[#d4a574]/20"
                    }`}
                  >
                    LOCK IN GUESS <MapPin className="w-4 h-4" />
                  </button>

                  <div className="mt-3 flex items-center gap-2 text-[10px] font-bold tracking-widest text-[#3c2415]/40 justify-center">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-[#3c2415] border-2 border-[#fff8e7] inline-block" />{" "}
                      Your Guess
                    </span>
                    <span className="opacity-40">•</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-[#d4a574] border-2 border-[#3c2415] inline-block" />{" "}
                      Actual Site
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* The launch page refers players here: "Unless stated at the
                bottom of the guess page…". Worded so it never gives away the
                date or the place. */}
            <section
              aria-label="How this site is scored"
              className="hhh-site-scoring mt-5 rounded-2xl border border-[#d4a574]/40 bg-white px-5 py-4 shadow-sm"
            >
              <div className="text-[11px] font-black tracking-[0.18em] text-[#8b5a2b]">
                HOW THIS SITE IS SCORED
              </div>
              <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-[15px] leading-snug text-[#3c2415]/85 sm:grid-cols-[auto_1fr]">
                <dt className="font-black text-[#3c2415]">Location</dt>
                <dd>{locationRule(site)}</dd>
                <dt className="font-black text-[#3c2415]">Year</dt>
                <dd>{yearRule(site)}</dd>
              </dl>
            </section>
          </>
        )}

        {/* ---------------------------------------------------------- ANSWER */}
        {phase === "result" && (
          <div className="hhh-answer mx-auto max-w-[900px] space-y-5">
            <div className="rounded-[20px] border border-[#d4a574]/40 bg-white p-5 md:p-6 shadow-[0_12px_32px_rgba(60,36,21,0.12)]">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[11px] font-black tracking-[0.2em] text-[#8b5a2b]">
                  SITE {roundIndex + 1} OF {landmarks.length} •{" "}
                  {displayYear.toUpperCase()}
                </span>
              </div>
              <h2 className="mt-1 font-black text-[26px] md:text-[34px] leading-tight tracking-tight">
                {site.title}
              </h2>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-[#fff8e7] border border-[#d4a574]/30 p-3">
                  <div className="text-[10px] font-black tracking-widest text-[#3c2415]/50">
                    LOCATION
                  </div>
                  <div className="mt-1 font-black text-[20px] leading-none">
                    {milesOff.toFixed(1)} mi off
                  </div>
                  <div className="mt-1 text-[13px] font-bold text-[#8b5a2b]">
                    +{lastLocationPoints} of {MAX_LOCATION_POINTS}
                  </div>
                </div>
                <div className="rounded-2xl bg-[#fff8e7] border border-[#d4a574]/30 p-3">
                  <div className="text-[10px] font-black tracking-widest text-[#3c2415]/50">
                    YEAR
                  </div>
                  <div className="mt-1 font-black text-[20px] leading-none">
                    {yearOutcome}
                  </div>
                  <div className="mt-1 text-[13px] font-bold text-[#8b5a2b]">
                    +{lastYearPoints} of {MAX_YEAR_POINTS}
                  </div>
                  {yearScored != null && (
                    <div className="mt-1.5 text-[12px] leading-snug text-[#3c2415]/70">
                      {/* Not "photo dated": some sites score a build year. */}
                      The answer: <b className="text-[#3c2415]">{displayYear}</b>
                      {lastYearGuess != null && <> · you said {lastYearGuess}</>}
                    </div>
                  )}
                </div>
                <div className="rounded-2xl bg-[#3c2415] text-[#fff8e7] p-3">
                  <div className="text-[10px] font-black tracking-widest text-[#d4a574]">
                    THIS SITE
                  </div>
                  <div className="mt-1 font-black text-[26px] leading-none">
                    {lastTotal}
                  </div>
                  <div className="mt-1 text-[13px] font-bold text-[#d4a574]">
                    {ratingFor(lastDistance)}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 1 — Then & Now */}
            <section className="rounded-[20px] overflow-hidden border border-[#d4a574]/40 bg-white shadow-[0_12px_32px_rgba(60,36,21,0.12)]">
              <h3 className="flex items-center gap-2 bg-[#fff8e7] border-b border-[#d4a574]/30 px-5 py-3 text-[11px] font-black tracking-[0.18em] text-[#3c2415]/70">
                <Camera className="w-4 h-4" /> THEN &amp; NOW
              </h3>
              <ThenNowSlider
                site={site}
                value={sliderValue}
                onChange={setSliderValue}
                className="bg-gradient-to-br from-[#a8c686] via-[#d4a574] to-[#fff8e7]"
              />
              <div className="grid grid-cols-2 border-t border-[#d4a574]/30">
                <div className="hhh-result-caption bg-[#fff8e7] text-center flex flex-col items-center justify-center">
                  <div className="bg-[#3c2415] text-[#fff8e7] text-[9px] font-black tracking-[0.12em] px-2 py-0.5 rounded-full mb-1.5">
                    THEN • {displayYear}
                  </div>
                  <div className="font-black text-[15px] leading-tight text-[#3c2415]">
                    {site.historicLabel}
                  </div>
                </div>
                <div className="hhh-result-caption bg-white border-l border-[#d4a574]/30 text-center flex flex-col items-center justify-center">
                  <div className="bg-[#d4a574] text-[#3c2415] text-[9px] font-black tracking-[0.12em] px-2 py-0.5 rounded-full mb-1.5">
                    NOW • {site.nowYear ?? "TODAY"}
                  </div>
                  <div className="font-black text-[15px] leading-tight text-[#3c2415]">
                    {site.modernLabel}
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2 — Map and location answer */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              {mapCard}
              <div className="bg-white rounded-[16px] border border-[#d4a574]/30 p-4 shadow-sm">
                <div className="text-[11px] font-black tracking-[0.18em] text-[#3c2415]/60 mb-2">
                  RESULT REVEAL
                </div>
                <div className="mb-3 rounded-2xl bg-[#fff8e7] border border-[#d4a574]/30 px-4 py-3 text-center">
                  <div className="font-black text-[28px] leading-none">
                    {milesOff.toFixed(1)} mi
                  </div>
                  <div className="mt-1 text-[11px] font-bold tracking-widest text-[#3c2415]/60">
                    FROM THE TRUE LOCATION
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-[#fff8e7] rounded-xl border border-[#d4a574]/30 p-3">
                    <div className="text-[10px] font-bold tracking-widest text-[#3c2415]/50">
                      YOUR PIN
                    </div>
                    <div className="font-mono text-[11px] font-bold mt-1">
                      {guess?.lat.toFixed(5)}, {guess?.lng.toFixed(5)}
                    </div>
                  </div>
                  <div className="bg-[#3c2415] text-[#fff8e7] rounded-xl p-3">
                    <div className="text-[10px] font-bold tracking-widest text-[#d4a574]">
                      ACTUAL
                    </div>
                    <div className="font-mono text-[11px] font-bold mt-1">
                      {site.lat.toFixed(5)}, {site.lng.toFixed(5)}
                    </div>
                  </div>
                </div>
                <div className="h-[2px] w-full bg-gradient-to-r from-[#3c2415] via-[#d4a574] to-[#3c2415] rounded-full mb-3" />
                <div className="text-[12px] leading-snug text-[#3c2415]/70">
                  Gold star = true location. Dashed line = your error.
                </div>
                {/* Answer page only: on the guess page this would give the
                    location away. */}
                {site.googleMapUrl && (
                  <a
                    href={site.googleMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex w-full items-center justify-between gap-3 rounded-2xl border border-[#d4a574]/40 bg-[#fff8e7] px-4 py-3 text-[14px] font-bold text-[#3c2415] transition hover:bg-[#f2e3c4]"
                  >
                    <span className="inline-flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[#8b5a2b]" /> View on Google Maps
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[#8b5a2b]" />
                  </a>
                )}
              </div>
            </section>

            {/* Section 3 — More historical images */}
            {archiveLinks.length > 0 && (
              <section className="rounded-[20px] border border-[#d4a574]/40 bg-white shadow-sm overflow-hidden">
                <h3 className="flex items-center gap-2 bg-[#fff8e7] border-b border-[#d4a574]/30 px-5 py-3 text-[11px] font-black tracking-[0.18em] text-[#3c2415]/70">
                  <Images className="w-4 h-4" /> MORE HISTORICAL IMAGES
                </h3>
                <div className="p-5 flex flex-col gap-2">
                  {archiveLinks.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-between gap-3 rounded-2xl border border-[#d4a574]/40 bg-[#fff8e7] px-4 py-3 text-[15px] font-bold text-[#3c2415] transition hover:bg-[#f2e3c4]"
                    >
                      {link.label}
                      <ArrowRight className="w-4 h-4 shrink-0 text-[#8b5a2b]" />
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* Section 4 — Historical Insight */}
            <section className="rounded-[20px] border border-[#d4a574]/40 bg-white shadow-sm overflow-hidden">
              <h3 className="flex items-center justify-between gap-3 bg-[#fff8e7] border-b border-[#d4a574]/30 px-5 py-3 text-[11px] font-black tracking-[0.18em] text-[#3c2415]/70">
                <span className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> HISTORICAL INSIGHT
                </span>
                {hasFullerStory && (
                  <button
                    onClick={() => setIsStoryExpanded(true)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#d4a574]/50 bg-white px-3 py-1 text-[10px] font-black tracking-widest text-[#3c2415] transition hover:bg-[#f2e3c4]"
                  >
                    READ FULL STORY
                  </button>
                )}
              </h3>
              <div className="p-5 space-y-3 text-[16px] leading-relaxed text-[#3c2415]/85">
                {historyParagraphs.length ? (
                  historyParagraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)
                ) : (
                  <p>No history provided.</p>
                )}
              </div>
            </section>

            <div className="flex justify-center pt-1 pb-2">
              <button
                onClick={nextSite}
                className="w-full md:w-auto inline-flex items-center justify-center gap-2 bg-[#3c2415] text-[#fff8e7] hover:bg-[#2a190e] transition rounded-full px-9 py-4 font-black tracking-widest text-[14px]"
              >
                {roundIndex < landmarks.length - 1
                  ? "NEXT SITE"
                  : "SEE FINAL SCORE"}{" "}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------- FINISHED */}
        {phase === "finished" && (
          <div className="hhh-finished max-w-[720px] mx-auto">
            <div className="bg-white rounded-[24px] border border-[#d4a574]/40 shadow-[0_20px_60px_rgba(60,36,21,0.14)] overflow-hidden">
              <div className="h-2 w-full bg-gradient-to-r from-[#3c2415] via-[#d4a574] to-[#3c2415]" />
              <div className="hhh-finished-content p-7 md:p-10 text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-[#d4a574] text-[#3c2415] grid place-items-center mb-4">
                  <Award className="w-7 h-7" />
                </div>
                <h2 className="text-[28px] md:text-[36px] font-black tracking-tight leading-none">
                  Hunt Complete!
                </h2>
                <p className="mt-2 text-[13px] font-bold tracking-[0.18em] text-[#8b5a2b]">
                  YOU EXPLORED {landmarks.length} HISTORIC SITES
                </p>

                <div className="hhh-finished-score mt-7 bg-[#fff8e7] rounded-2xl border border-[#d4a574]/30 p-5">
                  <div className="text-[48px] font-black leading-none tracking-tight">
                    {totalScore}
                  </div>
                  <div className="text-[12px] font-black tracking-[0.2em] text-[#3c2415]/60 mt-1">
                    TOTAL POINTS / {landmarks.length * MAX_POINTS_PER_SITE} MAX
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-2 text-left">
                    {landmarks.map((landmark, i) => (
                      <div
                        key={landmark.id}
                        className="bg-white rounded-xl border border-[#d4a574]/30 p-3"
                      >
                        <div className="text-[10px] font-bold tracking-widest text-[#8b5a2b]">
                          {dateLabel(landmark)} • SITE {i + 1}
                        </div>
                        <div className="text-[12px] font-bold leading-tight mt-1 line-clamp-2">
                          {landmark.shortTitle}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[11px] font-mono font-bold bg-[#3c2415] text-[#fff8e7] rounded-full px-2 py-0.5">
                            {(tenthsOfAMile(distances[i] || 0) / 10).toFixed(1)}{" "}
                            mi
                          </span>
                          <span className="text-[11px] font-black text-[#8b5a2b]">
                            +{scores[i] || 0}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hhh-finished-summary mt-6 text-[14px] leading-relaxed text-[#3c2415]/70 max-w-[52ch] mx-auto">
                  {summaryFor(totalScore)}
                </div>

                <div className="hhh-finished-actions mt-7 flex justify-center">
                  <button
                    onClick={restart}
                    className="inline-flex items-center justify-center gap-2 bg-[#3c2415] text-[#fff8e7] rounded-full px-7 py-3.5 font-black tracking-widest text-[13px] hover:bg-[#2a190e] transition"
                  >
                    <RotateCcw className="w-4 h-4" /> PLAY AGAIN
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {isStoryExpanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Full story: ${site.title}`}
          onClick={() => setIsStoryExpanded(false)}
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-[#3c2415]/70 p-4 md:p-8"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="relative flex max-h-full w-full max-w-[820px] flex-col overflow-hidden rounded-[24px] bg-[#fff8e7] shadow-[0_30px_80px_rgba(60,36,21,0.45)]"
          >
            <div className="h-2 w-full shrink-0 bg-gradient-to-r from-[#3c2415] via-[#d4a574] to-[#3c2415]" />

            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#d4a574]/30 px-6 py-4 md:px-9 md:py-5">
              <div>
                <div className="text-[11px] font-black tracking-[0.2em] text-[#8b5a2b]">
                  {displayYear.toUpperCase()} • THE STORY
                </div>
                <h3 className="mt-1 text-[22px] md:text-[28px] font-black leading-tight tracking-tight">
                  {site.title}
                </h3>
              </div>
              <button
                onClick={() => setIsStoryExpanded(false)}
                aria-label="Close the full story"
                className="shrink-0 rounded-full bg-[#3c2415] p-2 text-[#fff8e7] transition hover:bg-[#2a190e]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-6 md:px-9 md:py-8">
              {storyParagraphs.map((paragraph, i) => (
                <p
                  key={i}
                  className="mb-4 text-[16px] md:text-[17px] leading-relaxed text-[#3c2415]/85 last:mb-0"
                >
                  {paragraph}
                </p>
              ))}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#d4a574]/30 bg-white px-6 py-3 md:px-9 text-[11px] font-bold tracking-widest text-[#3c2415]/50">
              <span>HERSHEY HISTORY CENTER</span>
              <span className="hidden sm:inline">ESC TO CLOSE</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
