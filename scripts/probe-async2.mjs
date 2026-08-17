import { spawn } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve("node_modules/convex/bin/main.js");
const RID = "kh7f55c9zns93c39k4cf8jej5x8cj6tf";

function run(fn, args, extra = []) {
  return new Promise((resolveP) => {
    const child = spawn("node", [CLI, "run", fn, args, ...extra, "--typecheck", "disable", "--codegen", "disable"], { timeout: 90000 });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolveP({ code, out, err }));
  });
}

// 1) Handler error (party size 0) with identity — expect the Zod message.
const r1 = await run(
  "bookings:createBooking",
  JSON.stringify({ restaurantId: RID, date: "2026-08-18", time: "19:00", partySize: 0, name: "Nope" }),
  ["--identity", JSON.stringify({ subject: "probe-diner-x" })],
);
console.log("1) code:", r1.code);
console.log("   out:", JSON.stringify(r1.out.slice(0, 200)));
console.log("   err:", JSON.stringify(r1.err.slice(0, 300)));

// 2) Signed-out booking — expect "Please sign in to book".
const r2 = await run(
  "bookings:createBooking",
  JSON.stringify({ restaurantId: RID, date: "2026-08-18", time: "19:00", partySize: 2, name: "Nope" }),
);
console.log("2) code:", r2.code);
console.log("   err:", JSON.stringify(r2.err.slice(0, 300)));
