/**
 * Resolve a path out of landmarks.json against wherever the app is deployed.
 *
 * Vite fills in import.meta.env.BASE_URL at build time: "/" for local dev and
 * for hersheyhistory.github.io, or the Pages site's subfolder if it ever moves
 * into one. Without this,
 * "images/foo.jpg" resolves against the current page URL, which breaks as soon
 * as the app is served from a subfolder.
 */
export function assetUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${import.meta.env.BASE_URL}${path.replace(/^\.?\/+/, "")}`;
}
