import { describe, it, expect } from 'vitest';
import { DownvoteReason, NotificationType, FeedbackTags } from '@shared/constants';

describe('DownvoteReason', () => {
  it('has all expected reasons', () => {
    expect(DownvoteReason.TOO_FAR).toBe('TOO_FAR');
    expect(DownvoteReason.TOO_EXPENSIVE).toBe('TOO_EXPENSIVE');
    expect(DownvoteReason.BAD_TIMING).toBe('BAD_TIMING');
    expect(DownvoteReason.NOT_MY_VIBE).toBe('NOT_MY_VIBE');
    expect(DownvoteReason.NOT_MY_TASTE).toBe('NOT_MY_TASTE');
    expect(DownvoteReason.DOESNT_FIT_GROUP).toBe('DOESNT_FIT_GROUP');
    expect(DownvoteReason.WRONG_NEIGHBORHOOD).toBe('WRONG_NEIGHBORHOOD');
    expect(DownvoteReason.OTHER).toBe('OTHER');
  });

  it('has exactly 8 reasons', () => {
    expect(Object.keys(DownvoteReason)).toHaveLength(8);
  });
});

describe('NotificationType', () => {
  it('has expected notification types', () => {
    expect(NotificationType.INVITE).toBe('INVITE');
    expect(NotificationType.AVAILABILITY_NUDGE).toBe('AVAILABILITY_NUDGE');
    expect(NotificationType.VOTE_OPEN).toBe('VOTE_OPEN');
    expect(NotificationType.PLAN_LOCKED).toBe('PLAN_LOCKED');
    expect(NotificationType.PLAN_UPDATED).toBe('PLAN_UPDATED');
  });
});

describe('FeedbackTags', () => {
  it('has positive and negative tags', () => {
    expect(FeedbackTags.GREAT_VIBE).toBe('great_vibe');
    expect(FeedbackTags.TOO_CROWDED).toBe('too_crowded');
    expect(FeedbackTags.WOULD_RETURN).toBe('would_return');
    expect(FeedbackTags.WOULD_NOT_RETURN).toBe('would_not_return');
  });

  it('has exactly 12 tags', () => {
    expect(Object.keys(FeedbackTags)).toHaveLength(12);
  });
});
