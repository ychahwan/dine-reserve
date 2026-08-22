import assert from "node:assert/strict";
import { filterAdminUsersByPhone } from "../src/lib/admin-user-filters.ts";

const users = [
  { _id: "user-1", phone: "+961 76 683 661" },
  { _id: "user-2", phone: "+1 (212) 555-0199" },
  { _id: "user-3", phone: undefined },
];

assert.deepEqual(
  filterAdminUsersByPhone(users, "76-683").map((user) => user._id),
  ["user-1"],
  "phone search must ignore formatting characters",
);

assert.deepEqual(
  filterAdminUsersByPhone(users, "  ").map((user) => user._id),
  ["user-1", "user-2", "user-3"],
  "blank phone search must return every user",
);

console.log("admin user phone filtering is format-insensitive");
