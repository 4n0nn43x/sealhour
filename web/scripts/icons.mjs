// Extract the solar duotone icons the app uses from @iconify-json/solar into components/icon-data.json,
// so @iconify/react renders them offline (no Iconify API call). To add an icon: add its name here and run
// `node scripts/icons.mjs`. Names: https://icon-sets.iconify.design/solar/ (use the *-bold-duotone ones).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const NAMES = [
  "buildings-2-bold-duotone",
  "users-group-rounded-bold-duotone",
  "square-academic-cap-bold-duotone",
  "global-bold-duotone",
  "shield-check-bold-duotone",
  "lock-keyhole-bold-duotone",
  "lock-keyhole-unlocked-bold-duotone",
  "hourglass-bold-duotone",
  "inbox-line-bold-duotone",
  "info-circle-bold-duotone",
];

const require = createRequire(import.meta.url);
const src = JSON.parse(readFileSync(require.resolve("@iconify-json/solar/icons.json"), "utf8"));
const icons = {};
for (const n of NAMES) {
  if (!src.icons[n]) throw new Error(`unknown solar icon: ${n}`);
  icons[n] = src.icons[n];
}
const out = { prefix: "solar", width: src.width, height: src.height, icons };
const file = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "components", "icon-data.json");
writeFileSync(file, JSON.stringify(out) + "\n");
console.log(`${NAMES.length} icons written to ${file}`);
