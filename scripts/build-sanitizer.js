import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
await build({
  entryPoints: [require.resolve("sanitize-html")],
  outfile: fileURLToPath(
    new URL("../.generated/sanitize-html.cjs", import.meta.url),
  ),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  legalComments: "eof",
  logLevel: "info",
});
