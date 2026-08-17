import { spawn } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve("node_modules/convex/bin/main.js");

const r = await new Promise((resolveP) => {
  const child = spawn("node", [CLI, "run", "--inline-query",
    "const r = await ctx.db.query('restaurants').filter((q) => q.eq(q.field('name'), 'Trullo')).first(); return r?._id;",
    "--typecheck", "disable", "--codegen", "disable"], { timeout: 90000 });
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  child.on("close", (code) => resolveP({ code, out, err }));
});
console.log("code:", r.code);
console.log("stdout:", JSON.stringify(r.out));
console.log("stderr:", JSON.stringify(r.err.slice(0, 120)));
