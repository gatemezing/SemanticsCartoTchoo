// Writes the licence text of every package the frontend ships to the
// browser (its production `dependencies`, transitively) into one file that
// Vite copies into dist/. MIT, BSD and ISC all require their notice to
// accompany redistributed copies, and the minified bundle drops most
// in-source headers — this file is that notice.
//
// Resolution follows Node's own lookup (nearest node_modules walking up
// from the requiring package), so hoisted and nested copies are both found
// without shelling out to npm. Usage: node scripts/third-party-licenses.mjs <out>
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const out = process.argv[2];
if (!out) throw new Error("usage: third-party-licenses.mjs <output file>");

const root = resolve(import.meta.dirname, "..");
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

function findPackageDir(name, fromDir) {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

const seen = new Map();
function visit(dir) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) return;
  seen.set(key, { pkg, dir });
  const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
  for (const name of Object.keys(deps)) {
    const depDir = findPackageDir(name, dir);
    // Uninstalled optional dependencies (other platforms) are skipped.
    if (depDir) visit(depDir);
  }
}

const own = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const name of Object.keys(own.dependencies ?? {})) {
  if (name.startsWith("@carto-rinf/")) continue; // this repository, MIT
  const dir = findPackageDir(name, root);
  if (!dir) throw new Error(`dependency not installed: ${name}`);
  visit(dir);
}

function licenseOf(pkg) {
  const l = pkg.license ?? pkg.licenses;
  if (typeof l === "string") return l;
  if (Array.isArray(l)) return l.map((x) => x.type).join(" OR ");
  return l?.type ?? "UNKNOWN";
}

const entries = [...seen.values()].sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));
const sections = entries.map(({ pkg, dir }) => {
  const files = readdirSync(dir).filter((f) => LICENSE_FILE.test(f)).sort();
  const texts = files.map((f) => readFileSync(join(dir, f), "utf8").trim());
  const body = texts.length
    ? texts.join("\n\n")
    : `(No licence file shipped with the package; declared licence: ${licenseOf(pkg)}.)`;
  return `${pkg.name} ${pkg.version}\nLicense: ${licenseOf(pkg)}\n${pkg.homepage ?? ""}\n\n${body}`;
});

const header = `Carto RINF — third-party software included in this web application

The application itself is MIT-licensed (see LICENSE in the source
repository). The ${entries.length} packages below are bundled into the
JavaScript and CSS served to your browser; their licences follow.
Data and map tiles are covered separately — see the About dialog.
`;
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, `${header}\n${"=".repeat(72)}\n\n${sections.join(`\n\n${"=".repeat(72)}\n\n`)}\n`);
console.log(`Wrote ${entries.length} third-party licences to ${out}`);
