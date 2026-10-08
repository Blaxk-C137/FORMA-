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

function unregisteredRawStub(): Plugin {
  return {
    name: "threeui-unregistered-raw-stub",
    enforce: "pre",
    resolveId(source) {
      const m = source.match(/^\.\/sources\/([^?]+)\?raw$/);
      if (m && UNREGISTERED_RAW.has(m[1])) return "\0threeui-stub:" + source;
      return null;
    },
    load(id) {
      if (id.startsWith("\0threeui-stub:")) return 'export default "";';
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), unregisteredRawStub(), ...apiPlugin()],
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
  server: { host: "0.0.0.0", port: 5173, allowedHosts: true },
  preview: { host: "0.0.0.0", port: 4173, allowedHosts: true },
});
