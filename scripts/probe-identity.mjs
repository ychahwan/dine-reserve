import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve("node_modules/convex/bin/main.js");

function call(label, identityArg) {
  const r = spawnSync(
    "node",
    [CLI, "run", "users:currentUser", "{}", "--identity", identityArg, "--typecheck", "disable", "--codegen", "disable"],
    { encoding: "utf8", timeout: 90000 },
  );
  const err = String(r.stderr || "");
  const m = err.match(/Failed to parse identity as JSON: "([^"]*)"/);
  console.log(label, "-> status", r.status, "| parsed-as:", m ? m[1] : "OK?");
}

call("plain     ", JSON.stringify({ subject: "p1" }));
call("singlewrap", "'" + JSON.stringify({ subject: "p2" }) + "'");
call("backslash ", JSON.stringify({ subject: "p3" }).replace(/"/g, '\\"'));
call("noquotes  ", "{subject:p4}");
