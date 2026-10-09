/**
 * Resolve a path out of landmarks.json against wherever the app is deployed.
 *
 * Vite fills in import.meta.env.BASE_URL at build time: "/" for local dev and
 * Netlify, the Pages site's subfolder (if any) when the workflow builds. Without this,
 * "images/foo.jpg" resolves against the current page URL, which breaks as soon
 * as the app is served from a subfolder.
 */
export function assetUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${import.meta.env.BASE_URL}${path.replace(/^\.?\/+/, "")}`;
}
