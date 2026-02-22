// Shared constants used by both web and mobile (no drizzle dependency)

// Downvote reason enum
export const DownvoteReason = {
  TOO_FAR: 'TOO_FAR',
  TOO_EXPENSIVE: 'TOO_EXPENSIVE',
  BAD_TIMING: 'BAD_TIMING',
  NOT_MY_VIBE: 'NOT_MY_VIBE',
  NOT_MY_TASTE: 'NOT_MY_TASTE',
  DOESNT_FIT_GROUP: 'DOESNT_FIT_GROUP',
  WRONG_NEIGHBORHOOD: 'WRONG_NEIGHBORHOOD',
  OTHER: 'OTHER',
} as const;
export type DownvoteReason = typeof DownvoteReason[keyof typeof DownvoteReason];

// Notification types
export const NotificationType = {
  INVITE: 'INVITE',
  AVAILABILITY_NUDGE: 'AVAILABILITY_NUDGE',
  VOTE_OPEN: 'VOTE_OPEN',
  PLAN_LOCKED: 'PLAN_LOCKED',
  PLAN_UPDATED: 'PLAN_UPDATED',
} as const;
export type NotificationType = typeof NotificationType[keyof typeof NotificationType];

// Feedback tags for quick selection
export const FeedbackTags = {
  GREAT_VIBE: 'great_vibe',
  TOO_CROWDED: 'too_crowded',
  PERFECT_PRICE: 'perfect_price',
  TOO_EXPENSIVE: 'too_expensive',
  GOOD_SERVICE: 'good_service',
  POOR_SERVICE: 'poor_service',
  GREAT_FOOD: 'great_food',
  DISAPPOINTING_FOOD: 'disappointing_food',
  EASY_TO_FIND: 'easy_to_find',
  HARD_TO_FIND: 'hard_to_find',
  WOULD_RETURN: 'would_return',
  WOULD_NOT_RETURN: 'would_not_return',
} as const;
export type FeedbackTag = typeof FeedbackTags[keyof typeof FeedbackTags];
