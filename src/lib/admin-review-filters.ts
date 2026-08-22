export type AdminReviewFilters = {
  restaurantId: string;
  userId: string;
  rating: number;
};

type FilterableReview = {
  restaurantId: string;
  userId: string;
  rating: number;
};

export function filterAdminReviews<T extends FilterableReview>(
  reviews: readonly T[],
  filters: AdminReviewFilters,
) {
  return reviews.filter(
    (review) =>
      (filters.restaurantId === "all" || review.restaurantId === filters.restaurantId) &&
      (filters.userId === "all" || review.userId === filters.userId) &&
      (filters.rating === 0 || review.rating === filters.rating),
  );
}
