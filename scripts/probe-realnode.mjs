import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve("node_modules/convex/bin/main.js");
const RID = "kh7f55c9zns93c39k4cf8jej5x8cj6tf";
const id = (s) => "'" + JSON.stringify({ subject: s }) + "'";

for (const nodeBin of [process.execPath, "/usr/local/bin/node"]) {
  const r = spawnSync(
    nodeBin,
    [
      CLI, "run", "bookings:createBooking",
      "'" + JSON.stringify({ restaurantId: RID, date: "2026-08-18", time: "19:00", partySize: 0, name: "Nope" }) + "'",
      "--identity", id("probe-diner-x"),
      "--typecheck", "disable", "--codegen", "disable",
    ],
    { encoding: "utf8", timeout: 90000, stdio: ["ignore", "pipe", "pipe"] },
  );
  console.log(nodeBin, "-> status:", r.status);
  console.log("   stdout:", JSON.stringify((r.stdout || "").slice(0, 200)));
  console.log("   stderr:", JSON.stringify((r.stderr || "").slice(0, 200)));
}
