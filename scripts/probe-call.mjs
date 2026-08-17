import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve("node_modules/convex/bin/main.js");
const RID = "kh7f55c9zns93c39k4cf8jej5x8cj6tf";

function runfn(fn, args, ...extra) {
  const argv = [CLI, "run", fn, args, ...extra, "--typecheck", "disable", "--codegen", "disable"];
  console.log("argv:", JSON.stringify(argv));
  const r = spawnSync("node", argv, { encoding: "utf8", timeout: 90000 });
  console.log("status", r.status);
  console.log("stdout:", JSON.stringify((r.stdout || "").slice(0, 500)));
  console.log("stderr:", JSON.stringify((r.stderr || "").slice(0, 200)));
}

const id = (subject) => JSON.stringify({ subject });

// Value-returning mutation with identity — the exact shape the suite uses.
runfn(
  "bookings:createBooking",
  JSON.stringify({ restaurantId: RID, date: "2026-08-18", time: "19:00", partySize: 2, name: "Probe Call" }),
  "--identity",
  id("probe-diner-x"),
);
