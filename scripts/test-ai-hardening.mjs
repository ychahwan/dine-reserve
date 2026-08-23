import assert from "node:assert/strict";

import {
  AI_SECURITY_POLICY,
  DEFAULT_AI_KNOWLEDGE,
  DEFAULT_AI_SEMANTIC_RULES,
  sanitizeUntrustedText,
  selectRelevantEntries,
  validateRecommendations,
} from "../src/convex/aiPolicy.ts";

assert.match(AI_SECURITY_POLICY, /instruction hierarchy/i);
assert.match(AI_SECURITY_POLICY, /untrusted/i);
assert.match(AI_SECURITY_POLICY, /never reveal/i);
assert.match(AI_SECURITY_POLICY, /authorization/i);

assert.ok(DEFAULT_AI_KNOWLEDGE.length >= 6, "seed should contain useful domain knowledge");
assert.ok(DEFAULT_AI_KNOWLEDGE.some((entry) => /booking/i.test(entry.title + entry.content)));
assert.ok(DEFAULT_AI_KNOWLEDGE.some((entry) => /minor units|cents/i.test(entry.content)));
assert.ok(DEFAULT_AI_KNOWLEDGE.some((entry) => /privacy|cross-user/i.test(entry.title + entry.content)));

assert.ok(DEFAULT_AI_SEMANTIC_RULES.length >= 6, "seed should contain semantic rules");
assert.ok(DEFAULT_AI_SEMANTIC_RULES.some((entry) => /availability/i.test(entry.name + entry.instruction)));
assert.ok(DEFAULT_AI_SEMANTIC_RULES.some((entry) => /revenue/i.test(entry.name + entry.instruction)));

assert.equal(sanitizeUntrustedText("  hello\u0000\u0007 world  ", 100), "hello world");
assert.equal(sanitizeUntrustedText("x".repeat(200), 25).length, 25);

const entries = [
  { title: "Allergens", category: "safety", content: "Never guarantee allergy safety", priority: 100 },
  { title: "Parking", category: "venue", content: "Parking comes from restaurant features", priority: 10 },
  { title: "Revenue", category: "owner", content: "Revenue is completed order total", priority: 50 },
];
const relevant = selectRelevantEntries("Does this restaurant have parking?", entries, 1);
assert.equal(relevant[0]?.title, "Parking");

const restaurants = [
  { _id: "r1", name: "Trusted Name", cuisine: "Lebanese" },
  { _id: "r2", name: "Second", cuisine: "Italian" },
];
const recommendations = validateRecommendations(
  [
    { restaurantId: "r1", name: "Injected Name", cuisine: "Fake", suggestedTime: "19:30", reason: "A grounded choice", matchScore: 94 },
    { restaurantId: "unknown", suggestedTime: "20:00", reason: "Fake", matchScore: 100 },
    { restaurantId: "r2", suggestedTime: "tomorrow", reason: "Bad time", matchScore: 90 },
  ],
  restaurants,
);
assert.deepEqual(recommendations, [
  { restaurantId: "r1", name: "Trusted Name", cuisine: "Lebanese", suggestedTime: "19:30", reason: "A grounded choice", matchScore: 94 },
]);

console.log("AI hardening tests passed");
