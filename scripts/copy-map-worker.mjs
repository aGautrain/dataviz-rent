// MapLibre loads its tile worker from a separate file that the bundler does
// not emit, so we serve the package's own copy from public/.
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const source = require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs");
copyFileSync(source, new URL("../public/maplibre-gl-worker.mjs", import.meta.url));
