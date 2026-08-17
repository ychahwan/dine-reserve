import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve("node_modules/convex/bin/main.js");
const RID = "kh7f55c9zns93c39k4cf8jej5x8cj6tf";

// Business error from the handler (Zod party-size rejection) — signed in.
const r1 = spawnSync(
  "node",
  [CLI, "run", "bookings:createBooking",
    JSON.stringify({ restaurantId: RID, date: "2026-08-17", time: "19:00", partySize: 0, name: "Nope" }),
    "--identity", JSON.stringify({ subject: "test-diner-1" }),
    "--typecheck", "disable", "--codegen", "disable"],
  { encoding: "utf8", timeout: 90000 },
);
console.log("A) handler error: status", r1.status);
console.log("   stdout:", JSON.stringify(r1.stdout));
console.log("   stderr:", JSON.stringify(r1.stderr));

// Signed-out (auth rejection in handler).
const r2 = spawnSync(
  "node",
  [CLI, "run", "bookings:createBooking",
    JSON.stringify({ restaurantId: RID, date: "2026-08-17", time: "19:00", partySize: 2, name: "Nope" }),
    "--typecheck", "disable", "--codegen", "disable"],
  { encoding: "utf8", timeout: 90000 },
);
console.log("B) signed-out: status", r2.status);
console.log("   stdout:", JSON.stringify(r2.stdout));
console.log("   stderr:", JSON.stringify(r2.stderr));

// Inline query with a value.
const r3 = spawnSync(
  "node",
  [CLI, "run", "--inline-query",
    "const r = await ctx.db.query('restaurants').filter((q) => q.eq(q.field('name'), 'Trullo')).first(); return r?._id;",
    "--typecheck", "disable", "--codegen", "disable"],
  { encoding: "utf8", timeout: 90000 },
);
console.log("C) inline query: status", r3.status);
console.log("   stdout:", JSON.stringify(r3.stdout));
console.log("   stderr:", JSON.stringify(r3.stderr));
