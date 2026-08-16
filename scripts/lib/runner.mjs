#!/usr/bin/env node
/**
 * Shared runner for the Kamix test suites (test-backend.mjs, test-ui-flows.mjs).
 *
 * Drives the exact Convex functions the UI calls using `convex run` with
 * `--identity` to simulate signed-in diners/owners.
 *
 * Robustness notes (this container):
 * - `convex run` occasionally returns empty output, hangs (broken WebSocket
 *   transport), or fails; every call is retried, and every call is bounded by
 *   a 25s timeout so a hung CLI can never block the suite for long.
 * - The CLI prints NOTHING for `null`/void results — a clean exit with empty
 *   output is a valid result, so it is NOT retried at the transport level.
 * - The CLI occasionally prints nothing (or stale output) for a call that
 *   should have returned a value (transient, seen twice in a row on the same
 *   read). `iq`/`iqRaw`/`iqPairs`/`checkRead` retry on empty output, `check`
 *   retries once, and `runfnV` re-runs a mutation only when a verify query
 *   proves the effect did NOT happen (so retrying can never duplicate rows).
 * - Every PASS/FAIL line is appended to /tmp/kamix-results.log so a platform
 *   runner-kill mid-run does not lose the results gathered so far.
 */
import { execSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const FLAGS = ["--typecheck", "disable", "--codegen", "disable"];
const RESULTS_LOG = "/tmp/kamix-results.log";

let PASS = 0;
let FAIL = 0;
const FAILED = [];

/** Print a line to stdout AND checkpoint it to the results log. */
export function logLine(s) {
  console.log(s);
  try {
    appendFileSync(RESULTS_LOG, s + "\n");
  } catch {
    /* log file unavailable — stdout only */
  }
}

/** Shell-quote a single argument (single quotes, escapes embedded ones). */
export const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Run `convex run` once, bounded by 25s; returns { out, status }. */
export function runOnce(...args) {
  const cmd = ["node", "node_modules/convex/bin/main.js", "run", ...args, ...FLAGS].map(shq).join(" ") + " 2>&1";
  try {
    return { out: execSync(cmd, { encoding: "utf8", timeout: 25000 }), status: 0 };
  } catch (e) {
    // A killed/timeout call means the CLI hung — return empty so runfn retries.
    if (e.killed || e.signal) return { out: "", status: 1 };
    return { out: `${e.stdout || ""}${e.stderr || ""}`, status: e.status ?? 1 };
  }
}

/**
 * Retry on transport noise; a clean exit with empty output is treated as a
 * valid `null`/void result (never retried here — use `runfnV` when the call
 * MUST return a value and the effect is verifiable).
 */
export function runfn(...args) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = runOnce(...args);
    const noisy = r.out.includes("webSocketConstructor") || r.out.includes("ProcessExitSentinel");
    if ((r.out.trim().length > 0 || r.status === 0) && !noisy) return r;
    sleepSync(1500 * (attempt + 1));
  }
  return runOnce(...args);
}

/**
 * Mutation that must have an effect: if the CLI returns empty output (a
 * dropped/glitched call), run `verifyQuery` (an inline-query string that
 * returns "OK" when the effect happened, anything else when not) and only
 * re-run the mutation when the effect is proven absent. Retrying is therefore
 * safe — it can never duplicate rows created by a lost-but-executed call.
 */
export function runfnV(fn, argsJson, verifyQuery, ...extra) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = runfn(fn, argsJson, ...extra);
    if (r.out.trim().length > 0 && !r.out.includes("webSocketConstructor")) return r;
    const verified = iqRaw(verifyQuery);
    if (/['"]?OK['"]?/.test(verified.trim())) return r; // effect present — call succeeded
    sleepSync(1500 * (attempt + 1));
  }
  return runfn(fn, argsJson, ...extra);
}

/** Read-only inline query -> extracted id/value (retries on transient empties). */
export function iq(query) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { out } = runfn("--inline-query", query);
    const quoted = out.match(/'(?:[a-z0-9]{24,})'|"(?:[a-z0-9]{24,})"/g);
    const matches = quoted && quoted.length ? quoted : out.match(/\b\d+\b/g);
    if (matches && matches.length > 0) {
      return matches[matches.length - 1].replace(/['"]/g, "");
    }
    sleepSync(1500);
  }
  return "";
}

/** Read-only inline query -> raw CLI output (retries on transient empties). */
export function iqRaw(query) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { out } = runfn("--inline-query", query);
    if (out.trim().length > 0) return out;
    sleepSync(1500);
  }
  return "";
}

/** Read-only inline query -> ALL extracted quoted doc ids (for cleanups). */
export function iqAll(query) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { out } = runfn("--inline-query", query);
    const quoted = out.match(/'(?:[a-z0-9]{24,})'|"(?:[a-z0-9]{24,})"/g);
    if (quoted && quoted.length > 0) {
      return quoted.map((s) => s.replace(/['"]/g, ""));
    }
    sleepSync(1500);
  }
  return [];
}

/**
 * Read-only inline query that returns an array of `{ _id, ownerId }` objects
 * (the shape the CLI prints with single quotes) -> [{ id, owner }, ...].
 * Retries on empty output so a glitched call can never silently no-op a
 * cleanup pass.
 */
export function iqPairs(query) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { out } = runfn("--inline-query", query);
    const ids = [...out.matchAll(/_id: '([a-z0-9]{24,})'/g)].map((m) => m[1]);
    const owners = [...out.matchAll(/ownerId: '([^']*)'/g)].map((m) => m[1]);
    if (ids.length > 0) return ids.map((idVal, i) => ({ id: idVal, owner: owners[i] ?? "" }));
    sleepSync(1500);
  }
  return [];
}

export function check(name, expect, ...args) {
  // The CLI occasionally prints nothing for a call that should have returned a
  // value (transient). No scenario here expects a literal empty output, so
  // retry once when the result comes back empty before declaring a failure.
  let { out } = runfn(...args);
  if (out.trim().length === 0) {
    sleepSync(1500);
    ({ out } = runfn(...args));
  }
  if (out.includes(expect)) {
    PASS += 1;
    logLine(`PASS  | ${name}`);
  } else {
    FAIL += 1;
    FAILED.push(name);
    logLine(`FAIL  | ${name} | expected '${expect}'`);
    logLine(`       out: ${out.replace(/\s+/g, " ").slice(0, 420)}`);
  }
}

/**
 * Assert on a READ-ONLY inline query. The CLI in this container occasionally
 * returns empty or stale output for value reads (observed twice in a row on
 * the same query), so this retries up to 5 times until the expected token
 * appears. Retrying is always safe here: the queries are pure reads of state
 * that was already written (and verified) by setup steps.
 */
export function checkRead(name, expect, query) {
  let out = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    ({ out } = runfn("--inline-query", query));
    if (out.includes(expect)) {
      PASS += 1;
      logLine(`PASS  | ${name}`);
      return;
    }
    sleepSync(1200);
  }
  FAIL += 1;
  FAILED.push(name);
  logLine(`FAIL  | ${name} | expected '${expect}'`);
  logLine(`       out: ${out.replace(/\s+/g, " ").slice(0, 420)}`);
}

export function checkAbsent(name, absent, ...args) {
  const { out } = runfn(...args);
  if (out.includes(absent)) {
    FAIL += 1;
    FAILED.push(name);
    logLine(`FAIL  | ${name} | must NOT contain '${absent}'`);
    logLine(`       out: ${out.replace(/\s+/g, " ").slice(0, 420)}`);
  } else {
    PASS += 1;
    logLine(`PASS  | ${name}`);
  }
}

/** Pass when the output matches ANY of the acceptable outcomes. */
export function checkAny(name, accepts, ...args) {
  let { out } = runfn(...args);
  if (out.trim().length === 0) {
    sleepSync(1500);
    ({ out } = runfn(...args));
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
