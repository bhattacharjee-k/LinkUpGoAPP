import { DownvoteReason } from "./schema";

export const REASON_PENALTIES: Record<string, number> = {
  [DownvoteReason.TOO_FAR]: 2,
  [DownvoteReason.TOO_EXPENSIVE]: 2,
  [DownvoteReason.BAD_TIMING]: 3,
  [DownvoteReason.NOT_MY_VIBE]: 1,
  [DownvoteReason.NOT_MY_TASTE]: 1,
  [DownvoteReason.DOESNT_FIT_GROUP]: 2,
  [DownvoteReason.WRONG_NEIGHBORHOOD]: 2,
  [DownvoteReason.OTHER]: 1,
};

export interface VoteData {
  userId: string;
  voteType: 'up' | 'down';
  reasons?: string[] | null;
  note?: string | null;
}

export interface SuggestionWithVotes {
  id: string;
  name: string;
  votes: VoteData[];
  [key: string]: any;
}

export function calculateScore(votes: VoteData[]): number {
  let score = 0;
  
  for (const vote of votes) {
    if (vote.voteType === 'up') {
      score += 1;
    } else if (vote.voteType === 'down') {
      let penalty = 1;
      if (vote.reasons && vote.reasons.length > 0) {
        for (const reason of vote.reasons) {
          penalty += REASON_PENALTIES[reason] || 0;
        }
      }
      score -= penalty;
    }
  }
  
  return score;
}

export function rankSuggestions<T extends SuggestionWithVotes>(suggestions: T[]): T[] {
  return [...suggestions].sort((a, b) => {
    const scoreA = calculateScore(a.votes);
    const scoreB = calculateScore(b.votes);
    return scoreB - scoreA;
  });
}

export function getVoteSummary(votes: VoteData[]): { upvotes: number; downvotes: number; score: number } {
  const upvotes = votes.filter(v => v.voteType === 'up').length;
  const downvotes = votes.filter(v => v.voteType === 'down').length;
  const score = calculateScore(votes);
  return { upvotes, downvotes, score };
}
