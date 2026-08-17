import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve("node_modules/convex/bin/main.js");
const RID = "kh7f55c9zns93c39k4cf8jej5x8cj6tf";
const id = (s) => "'" + JSON.stringify({ subject: s }) + "'";

const r = spawnSync(
  "node",
  [
    CLI, "run", "bookings:createBooking",
    "'" + JSON.stringify({ restaurantId: RID, date: "2026-08-18", time: "19:00", partySize: 0, name: "Nope" }) + "'",
    "--identity", id("probe-diner-x"),
    "--typecheck", "disable", "--codegen", "disable",
  ],
  { encoding: "utf8", timeout: 90000, stdio: ["ignore", "pipe", "pipe"] },
);
console.log("status:", r.status);
console.log("STDOUT:", JSON.stringify(r.stdout));
console.log("STDERR:", JSON.stringify(r.stderr));
