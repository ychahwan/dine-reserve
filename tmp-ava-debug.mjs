import { execSync } from "node:child_process";
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
function runfn(...args) {
  const cmd = ["node", "node_modules/convex/bin/main.js", "run", ...args, ...["--typecheck", "disable", "--codegen", "disable"]].map(shq).join(" ") + " 2>&1";
  console.log("CMD:", cmd);
  try {
    const out = execSync(cmd, { encoding: "utf8" });
    return { out, status: 0 };
  } catch (e) {
    return { out: `${e.stdout || ""}${e.stderr || ""}`, status: e.status ?? 1 };
  }
}
const q = `const u = await ctx.db.query("users").filter((q) => q.eq(q.field("email"), "ava@seatly.demo")).first(); return u?._id;`;
const r = runfn("--inline-query", q);
console.log("OUT:", JSON.stringify(r.out.slice(0, 300)));
console.log("STATUS:", r.status);
