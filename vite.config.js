import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// A GitHub Pages project site lives in a subfolder (e.g. /hershey-02/), while
// a <owner>.github.io site, Netlify and local dev serve it from the root. The
// Pages workflow sets VITE_BASE_PATH from GitHub's own answer; everything else
// falls through to "/".
const base = process.env.VITE_BASE_PATH || "/";

export default defineConfig({
  base,
  plugins: [react()],
});
