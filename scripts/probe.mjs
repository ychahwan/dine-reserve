import { execSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const LOG = "/tmp/kamix-probe.log";
const log = (s) => {
  appendFileSync(LOG, s + "\n");
  console.log(s);
};

const shq = (s) => `'${String(s).replace(/'/g, `'\\\\''`)}'`;
const FLAGS = ["--typecheck", "disable", "--codegen", "disable"];

function runOnce(...args) {
  const cmd = ["node", "node_modules/convex/bin/main.js", "run", ...args, ...FLAGS].map(shq).join(" ") + " 2>&1";
  const t0 = Date.now();
  try {
    const out = execSync(cmd, { encoding: "utf8", timeout: 40000 });
    log(`OK   (${Date.now() - t0}ms) ${args[0]} ${String(args[1] ?? "").slice(0, 60)}`);
  } catch (e) {
    log(`ERR  (${Date.now() - t0}ms) ${args[0]} ${String(args[1] ?? "").slice(0, 60)} :: ${String(e.stderr ?? e).slice(0, 100)}`);
  }
}

log("probe start");
runOnce("--inline-query", `const r = await ctx.db.query("restaurants").first(); return r?.name;`);
runOnce("--inline-query", `const r = await ctx.db.query("restaurants").filter((q) => q.eq(q.field("name"), "Trullo")).first(); return r?._id;`);
runOnce("--inline-query", `const u = await ctx.db.query("users").filter((q) => q.eq(q.field("email"), "marco@seatly.demo")).first(); return u?._id;`);
log("probe done");
