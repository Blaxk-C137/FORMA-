import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { apiPlugin } from "./server/apiPlugin";

/**
 * Two `?raw` imports referenced by the registered `NeuformIsolatedEffects.tsx`
 * (`recursive-erosion.html`, `synthesis-orb.html`) are NOT part of the
 * registered source bundle (revision fa86582fc870) and are not shipped in the
 * `@designcodeio/threeui` npm package. Their effects are never rendered by the
 * configured `predictive` variant. Rather than fabricating shader content,
 * this plugin resolves those two ids — and only those two — to an empty
 * string so the authored registry source stays byte-identical.
 */
const UNREGISTERED_RAW = new Set(["recursive-erosion.html", "synthesis-orb.html"]);

function unregisteredRawEmpty(): Plugin {
  return {
    name: "threeui-unregistered-raw-empty",
    enforce: "pre",
    resolveId(source) {
      const m = source.match(/^\.\/sources\/([^?]+)\?raw$/);
      if (m && UNREGISTERED_RAW.has(m[1])) return "\0threeui-empty:" + source;
      return null;
    },
    load(id) {
      if (id.startsWith("\0threeui-empty:")) return 'export default "";';
      return null;
    },
  };
}

const previewMode = process.env.FORMA_PREVIEW_MODE === "1";
const devHost = previewMode ? "0.0.0.0" : "127.0.0.1";
const allowedHosts = previewMode ? [".e2b.app"] : [];

export default defineConfig({
  plugins: [react(), tailwindcss(), unregisteredRawEmpty(), ...apiPlugin()],
  resolve: {
    alias: [
      // The configured usage imports the package name; alias it to the
      // registered source files vendored in this project.
      {
        find: /^@designcodeio\/threeui\/style\.css$/,
        replacement: new URL("./src/shaders/threeui.css", import.meta.url).pathname,
      },
      {
        find: /^@designcodeio\/threeui$/,
        replacement: new URL(
          "./src/shaders/predictive-arc/PredictiveArcCollection.tsx",
          import.meta.url,
        ).pathname,
      },
      { find: "@", replacement: new URL("./src", import.meta.url).pathname },
    ],
  },
  // Keep the key-bearing local UI loopback-only by default. Arena's preview
  // runs opt in to the public proxy host explicitly via FORMA_PREVIEW_MODE.
  server: { host: devHost, port: 5173, allowedHosts },
  preview: { host: devHost, port: 4173, allowedHosts },
});
