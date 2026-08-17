import { spawn } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve("node_modules/convex/bin/main.js");
const RID = "kh7f55c9zns93c39k4cf8jej5x8cj6tf";
const id = (s) => "'" + JSON.stringify({ subject: s }) + "'";
const args = "'" + JSON.stringify({ restaurantId: RID, date: "2026-08-18", time: "19:00", partySize: 0, name: "Nope" }) + "'";

const child = spawn(
  "node",
  [CLI, "run", "bookings:createBooking", args, "--identity", id("probe-diner-x"), "--typecheck", "disable", "--codegen", "disable"],
  { timeout: 90000 },
);
let out = "";
let err = "";
child.stdout.on("data", (d) => (out += d));
child.stderr.on("data", (d) => (err += d));
child.on("close", (code) => {
  console.log("close code:", code);
  console.log("stdout:", JSON.stringify(out.slice(0, 200)));
  console.log("stderr:", JSON.stringify(err.slice(0, 300)));
});
