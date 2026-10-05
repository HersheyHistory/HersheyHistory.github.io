/**
 * Then & Now comparison: the historic photo on top, clipped by an invisible
 * full-bleed range input, over the present-day photo.
 *
 * The frame takes the historic photo's own shape, so the whole picture shows
 * and nothing is cut off top or bottom; on a long photo the page simply
 * scrolls. The present-day photo is fitted into that frame:
 *
 *  - If both photos carry a yellow circle (site.thenFocus / site.nowFocus,
 *    found by tools/yellow_ring.py), the modern photo is scaled and shifted so
 *    its circle lands exactly on the historic one.
 *  - If only the modern photo has one, it is cropped around its circle so the
 *    circle stays in view.
 *  - Otherwise it is centred.
 *
 * Falls back to whichever single photo exists when a landmark has only one.
 */
import { useEffect, useRef, useState } from "react";
import { assetUrl } from "./assetUrl.js";

// Past this much zoom, lining the circles up costs too much sharpness; settle
// for keeping the modern circle in view instead.
const MAX_ALIGN_ZOOM = 2.5;

const clampFocus = (f) => ({
  x: Math.min(0.99, Math.max(0.01, f.x)),
  y: Math.min(0.99, Math.max(0.01, f.y)),
});

/**
 * Size and position for the modern photo, as percentages of the frame.
 * Works in units of the frame's width, so the answer holds at any screen size.
 *   frameAspect, nowAspect: width / height
 *   thenFocus, nowFocus: optional {x, y} circle centres as image fractions
 */
export function placeModern(frameAspect, nowAspect, thenFocus, nowFocus) {
  const fh = 1 / frameAspect; // frame height, in frame widths
  const cover = Math.max(1, nowAspect * fh); // narrowest width that fills the frame

  const layout = (width, left, top) => ({
    position: "absolute",
    maxWidth: "none",
    height: "auto",
    width: `${width * 100}%`,
    left: `${left * 100}%`,
    top: `${(top / fh) * 100}%`, // CSS top % is relative to frame height
  });

  if (thenFocus && nowFocus) {
    const t = clampFocus(thenFocus);
    const u = clampFocus(nowFocus);
    const tx = t.x;
    const ty = t.y * fh;
    // Smallest width that puts the modern circle on the historic one while
    // still covering every edge of the frame.
    const width = Math.max(
      cover,
      tx / u.x,
      (1 - tx) / (1 - u.x),
      (ty * nowAspect) / u.y,
      ((fh - ty) * nowAspect) / (1 - u.y),
    );
    if (width <= cover * MAX_ALIGN_ZOOM) {
      return layout(width, tx - u.x * width, ty - u.y * (width / nowAspect));
    }
  }

  const focus = nowFocus ? clampFocus(nowFocus) : { x: 0.5, y: 0.5 };
  return layout(
    cover,
    (1 - cover) * focus.x,
    (fh - cover / nowAspect) * focus.y,
  );
}

export default function ThenNowSlider({
  site,
  value,
  onChange,
  className = "",
  hint,
  label = "Reveal historic and current photos",
}) {
  const hasBoth = Boolean(site.thenImage && site.nowImage);
  const thenSrc = site.thenImage && assetUrl(site.thenImage);
  const nowSrc = site.nowImage && assetUrl(site.nowImage);

  // Natural aspect ratios, keyed by image URL so a new site never inherits
  // the last one's numbers.
  const [aspects, setAspects] = useState({});
  const thenRef = useRef(null);
  const nowRef = useRef(null);
  const record = (img) => {
    if (img && img.naturalWidth) {
      const src = img.getAttribute("src");
      const ratio = img.naturalWidth / img.naturalHeight;
      setAspects((prev) => (prev[src] === ratio ? prev : { ...prev, [src]: ratio }));
    }
  };
  // A cached image can finish loading before onLoad is attached.
  useEffect(() => {
    record(thenRef.current);
    record(nowRef.current);
  }, [thenSrc, nowSrc]);

  const modernStyle =
    hasBoth && aspects[thenSrc] && aspects[nowSrc]
      ? placeModern(aspects[thenSrc], aspects[nowSrc], site.thenFocus, site.nowFocus)
      : { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };

  // The frame image sits in normal flow and sets the frame's height.
  const frameIsThen = Boolean(site.thenImage);

  return (
    <div
      className={`hhh-comparison relative ${className}`}
      style={site.thenImage || site.nowImage ? undefined : { minHeight: 220 }}
    >
      {site.nowImage && (
        <img
          ref={nowRef}
          src={nowSrc}
          alt={`Current image of ${site.modernLabel}`}
          onLoad={(e) => record(e.currentTarget)}
          className={frameIsThen ? "" : "block w-full h-auto"}
          style={frameIsThen ? modernStyle : undefined}
        />
      )}
      {site.thenImage && (
        <img
          ref={thenRef}
          src={thenSrc}
          alt={`Historic image of ${site.historicLabel}`}
          onLoad={(e) => record(e.currentTarget)}
          className={`hhh-comparison-then relative block w-full h-auto ${
            // sepia turns a yellow circle pale cream, so spare marked photos
            site.thenFocus ? "" : "sepia"
          }`}
          style={hasBoth ? { clipPath: `inset(0 ${100 - value}% 0 0)` } : undefined}
        />
      )}

      {hasBoth && (
        <>
          <div className="hhh-comparison-divider" style={{ left: `${value}%` }}>
            <span className="hhh-comparison-handle">{"<>"}</span>
          </div>
          {hint && <span className="hhh-comparison-hint">{hint}</span>}
          <input
            type="range"
            min={0}
            max={100}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            aria-label={label}
            className="hhh-comparison-range"
          />
        </>
      )}
    </div>
  );
}
