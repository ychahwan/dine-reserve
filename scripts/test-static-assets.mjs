import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(path.join(root, "public/manifest.webmanifest"), "utf8"),
);

for (const icon of manifest.icons ?? []) {
  const relativePath = icon.src.replace(/^\//, "");
  await access(path.join(root, "public", relativePath));
}

console.log("manifest icon assets exist");
