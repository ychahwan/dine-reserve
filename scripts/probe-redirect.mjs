import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const CLI = resolve("node_modules/convex/bin/main.js");
const RID = "kh7f55c9zns93c39k4cf8jej5x8cj6tf";
const id = (s) => "'" + JSON.stringify({ subject: s }) + "'";
const args = "'" + JSON.stringify({ restaurantId: RID, date: "2026-08-18", time: "19:00", partySize: 0, name: "Nope" }) + "'";
const errFile = `/tmp/kamix-err-${Date.now()}.log`;

const cmd = `node "${CLI}" run bookings:createBooking ${args} --identity ${id("probe-diner-x")} --typecheck disable --codegen disable 2>"${errFile}"`;
console.log("cmd:", cmd.slice(0, 180));

const r = spawnSync("sh", ["-c", cmd], { encoding: "utf8", timeout: 90000 });
console.log("status:", r.status);
console.log("stdout:", JSON.stringify((r.stdout || "").slice(0, 200)));
console.log("errfile:", readFileSync(errFile, "utf8").match(/Uncaught Error: ([^\n]*)/)?.[1] ?? "no match");
unlinkSync(errFile);
