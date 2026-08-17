#!/usr/bin/env node
/**
 * Shared runner for the Kamix test suites (test-backend.mjs, test-ui-flows.mjs).
 *
 * Drives the exact Convex functions the UI calls using `convex run` with
 * `--identity` to simulate signed-in diners/owners.
 *
 * Container notes (this WebContainer):
 * - The terminal's `node` is a shim that re-tokenizes argv for **synchronous**
 *   spawns, destroying JSON quotes; `spawnSync` is therefore unusable. Async
 *   `spawn` passes argv through verbatim, so all CLI calls here are async and
 *   the suites `await` every runner call.
 * - The CLI occasionally returns empty output for value-returning functions
 *   (transport glitch) and can hang; every call is retried and bounded by a
 *   timeout so a hung CLI never wedges the suite.
 * - Handler errors are written to stderr; `runfn` merges stdout+stderr so
 *   `check("C-8", "Party size must be…", …)` can match rejection messages.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve("node_modules/convex/bin/main.js");
const TIMEOUT_MS = 60000;

let PASS = 0;
let FAIL = 0;
const FAILED = [];

export function logLine(msg) {
  console.log(msg);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run one convex CLI command, capturing stdout + stderr. */
export function execCli(argv, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolveP) => {
    const child = spawn("node", [CLI, ...argv], { timeout: timeoutMs });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => resolveP({ code: -1, out, err: String(e) }));
    child.on("close", (code) => resolveP({ code, out, err }));
  });
}

/**
 * Run a Convex function (or `--inline-query`). Retries transport glitches
 * (spawn error / timeout / empty result for a value call). Returns
 * `{ out, ok, code }` where `out` merges stdout + stderr so both results and
 * rejection messages are matchable.
 */
export async function runfn(fn, args, ...extra) {
  const argv = ["run", fn, args, ...extra, "--typecheck", "disable", "--codegen", "disable"];
  let last = { code: -1, out: "", err: "" };
  for (let attempt = 0; attempt < 4; attempt++) {
    last = await execCli(argv);
    if (last.code === 0) {
      return { out: `${last.out}\n${last.err}`.trim(), ok: true, code: 0 };
    }
    if (last.code === -1 || last.code === null) {
      await sleep(1200); // transport glitch — retry
      continue;
    }
    // Non-zero: the function ran and threw (or a CLI error) — surface it.
    return { out: `${last.out}\n${last.err}`.trim(), ok: false, code: last.code };
  }
  return { out: `${last.out}\n${last.err}`.trim(), ok: false, code: last.code ?? -1 };
}

/**
 * Setup-mutation helper: run the mutation, verify its effect in the DB, and
 * only re-run when the effect is proven absent — a glitched empty response can
 * never silently skip a step or duplicate a row.
 */
export async function runfnV(fn, args, verify, ...extra) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { out } = await runfn(fn, args, ...extra);
    const { out: vOut } = await runfn("--inline-query", verify);
    if (vOut.includes("OK")) return { out, ok: true };
    logLine(`     retry ${fn} (effect not verified)`);
    await sleep(1200);
  }
  FAIL += 1;
  FAILED.push(`${fn} (verify)`);
  logLine(`FAIL  | ${fn} | effect not verified after retries`);
  return { out: "", ok: false };
}

/** Read-only inline query → trimmed result text. */
export async function iq(code) {
  const { out } = await runfn("--inline-query", code);
  return out.trim();
}

/** Same as iq but keeps the raw output. */
export async function iqRaw(code) {
  const { out } = await runfn("--inline-query", code);
  return out;
}

/** Inline query returning [{ _id, ownerId }] → parsed [{ id, owner }] pairs. */
export async function iqPairs(code) {
  const { out } = await runfn("--inline-query", code);
  const pairs = [];
  const re = /_id:\s*'([^']*)'[\s\S]*?ownerId:\s*(?:'([^']*)'|undefined|null)/g;
  let m;
  while ((m = re.exec(out)) !== null) pairs.push({ id: m[1], owner: m[2] || undefined });
  return pairs;
}

/** Assert the run output contains `needle`. */
export async function check(name, needle, ...args) {
  const { out } = await runfn(...args);
  if (out.includes(needle)) {
    PASS += 1;
    logLine(`PASS  | ${name}`);
  } else {
    FAIL += 1;
    FAILED.push(name);
    logLine(`FAIL  | ${name} | expected "${needle}"`);
    logLine(`       out: ${out.replace(/\s+/g, " ").slice(0, 420)}`);
  }
}

/** Assert the run output does NOT contain `needle`. */
export async function checkAbsent(name, needle, ...args) {
  const { out } = await runfn(...args);
  if (!out.includes(needle)) {
    PASS += 1;
    logLine(`PASS  | ${name}`);
  } else {
    FAIL += 1;
    FAILED.push(name);
    logLine(`FAIL  | ${name} | must NOT contain "${needle}"`);
    logLine(`       out: ${out.replace(/\s+/g, " ").slice(0, 420)}`);
  }
}

/** Assert the run output contains ANY of the accepted needles. */
export async function checkAny(name, accepts, ...args) {
  let { out } = await runfn(...args);
  if (out.trim().length === 0) {
    await sleep(1500);
    ({ out } = await runfn(...args));
  }
  if (accepts.some((a) => out.includes(a))) {
    PASS += 1;
    logLine(`PASS  | ${name}`);
  } else {
    FAIL += 1;
    FAILED.push(name);
    logLine(`FAIL  | ${name} | expected one of ${accepts.join(" / ")}`);
    logLine(`       out: ${out.replace(/\s+/g, " ").slice(0, 420)}`);
  }
}

/** Retry a read-only inline query until `needle` shows up (CLI reads can glitch). */
export async function checkRead(name, needle, code) {
  let out = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    ({ out } = await runfn("--inline-query", code));
    if (out.includes(needle)) {
      PASS += 1;
      logLine(`PASS  | ${name}`);
      return;
    }
    await sleep(1500);
  }
  FAIL += 1;
  FAILED.push(name);
  logLine(`FAIL  | ${name} | expected "${needle}"`);
  logLine(`       out: ${out.replace(/\s+/g, " ").slice(0, 420)}`);
}

/** Convex `--identity` JSON for a subject. */
export const id = (subject) => JSON.stringify({ subject });

export function summary() {
  logLine("");
  logLine("─────────────────────────────────────────────────────────────");
  logLine(`RESULT: ${PASS} passed, ${FAIL} failed`);
  if (FAILED.length > 0) {
    logLine(`FAILED: ${FAILED.join(", ")}`);
  }
  return FAIL;
}
