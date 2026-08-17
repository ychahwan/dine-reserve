import { spawnSync } from "node:child_process";

const candidates = ["/usr/bin/node", "/bin/node", "/usr/local/bin/node", process.execPath];
for (const p of candidates) {
  const r = spawnSync(p, ["-v"], { encoding: "utf8", timeout: 15000 });
  console.log(p, "->", r.status, JSON.stringify((r.stdout || "").trim()), JSON.stringify((r.stderr || "").trim()));
}
console.log("which:", spawnSync("which", ["-a", "node"], { encoding: "utf8" }).stdout);
