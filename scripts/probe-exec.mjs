import { exec, execFile } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve("node_modules/convex/bin/main.js");
const RID = "kh7f55c9zns93c39k4cf8jej5x8cj6tf";
const id = (s) => "'" + JSON.stringify({ subject: s }) + "'";
const args = "'" + JSON.stringify({ restaurantId: RID, date: "2026-08-18", time: "19:00", partySize: 0, name: "Nope" }) + "'";

execFile(
  "node",
  [CLI, "run", "bookings:createBooking", args, "--identity", id("probe-diner-x"), "--typecheck", "disable", "--codegen", "disable"],
  { encoding: "utf8", timeout: 90000, maxBuffer: 10 * 1024 * 1024 },
  (err, stdout, stderr) => {
    console.log("execFile -> err:", err ? "code=" + err.code : null);
    console.log("   stdout:", JSON.stringify((stdout || "").slice(0, 200)));
    console.log("   stderr:", JSON.stringify((stderr || "").slice(0, 200)));
  },
);
