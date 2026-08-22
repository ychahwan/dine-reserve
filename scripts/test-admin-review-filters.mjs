import assert from "node:assert/strict";
import { filterAdminReviews } from "../src/lib/admin-review-filters.ts";

const reviews = [
  { _id: "review-1", restaurantId: "restaurant-a", userId: "user-a", rating: 5 },
  { _id: "review-2", restaurantId: "restaurant-a", userId: "user-b", rating: 3 },
  { _id: "review-3", restaurantId: "restaurant-b", userId: "user-a", rating: 5 },
];

assert.deepEqual(
  filterAdminReviews(reviews, {
    restaurantId: "restaurant-a",
    userId: "user-a",
    rating: 5,
  }).map((review) => review._id),
  ["review-1"],
  "restaurant, diner, and rating filters must combine",
);

assert.deepEqual(
  filterAdminReviews(reviews, {
    restaurantId: "all",
    userId: "user-a",
    rating: 0,
  }).map((review) => review._id),
  ["review-1", "review-3"],
  "all sentinel values must leave that dimension unfiltered",
);

console.log("admin review filters combine correctly");
