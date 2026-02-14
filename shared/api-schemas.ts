import { z } from 'zod';
import { DownvoteReason } from './schema';

export const LoginRequestSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RegisterRequestSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().nullable(),
  city: z.enum(['NYC', 'Chicago']),
  budget: z.array(z.enum(['$', '$$', '$$$', '$$$$'])).min(1, 'Select at least one budget'),
  energy: z.enum(['Chill', 'Vibey', 'Going out', 'Full send']),
  categories: z.array(z.string()).min(1, 'Select at least one category'),
  hardNos: z.array(z.string()).default([]),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const ReferenceVenueSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
});

export const SuggestRequestSchema = z.object({
  city: z.string().min(1),
  neighborhood: z.string().optional(),
  userLat: z.number().optional(),
  userLng: z.number().optional(),
  categories: z.array(z.string()),
  budget: z.string().optional(),
  energy: z.string().optional(),
  timeWindow: z.string().optional(),
  specificDate: z.string().optional(),
  specificTime: z.string().optional(),
  referenceVenues: z.array(ReferenceVenueSchema).optional(),
  vibeDescription: z.string().max(500).optional(),
  locationMode: z.enum(['near_me', 'explore_anywhere', 'meet_in_the_middle']).optional(),
  midpointLat: z.number().optional(),
  midpointLng: z.number().optional(),
  discoveryStyle: z.enum(['hidden_gems', 'popular', 'mixed']).optional(),
  crowdPreference: z.enum(['quiet', 'buzzing', 'no_preference']).optional(),
  favoriteNeighborhoods: z.array(z.string()).optional(),
});
export type SuggestRequest = z.infer<typeof SuggestRequestSchema>;

export const CreateGroupRequestSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(100),
});
export type CreateGroupRequest = z.infer<typeof CreateGroupRequestSchema>;

export const CreateSessionRequestSchema = z.object({
  groupId: z.string().uuid(),
  name: z.string().optional().nullable(),
  filters: z.object({
    budget: z.string().optional(),
    energy: z.string().optional(),
    category: z.array(z.string()).optional(),
    timeWindow: z.string().optional(),
    specificDate: z.string().optional(),
    specificTime: z.string().optional(),
    locationScope: z.string().optional(),
    inviteCode: z.string().optional(),
    vibeDescription: z.string().max(500).optional(),
    locationMode: z.enum(['near_me', 'explore_anywhere', 'meet_in_the_middle']).optional(),
    midpointLat: z.number().optional(),
    midpointLng: z.number().optional(),
  }),
  guardrails: z.object({
    priority: z.string().optional(),
    minTurnout: z.string().optional(),
  }).optional().default({ priority: 'turnout', minTurnout: 'balanced' }),
  neighborhood: z.string().optional().nullable(),
  referenceVenues: z.array(ReferenceVenueSchema).optional().nullable(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const UpdateSessionRequestSchema = z.object({
  name: z.string().optional().nullable(),
  status: z.enum(['draft', 'voting', 'locked']).optional(),
  filters: z.record(z.any()).optional(),
  guardrails: z.record(z.any()).optional(),
  neighborhood: z.string().optional().nullable(),
  winningOptionId: z.string().optional().nullable(),
  lockedByUserId: z.string().optional().nullable(),
  lockedAt: z.string().datetime().optional().nullable(),
});
export type UpdateSessionRequest = z.infer<typeof UpdateSessionRequestSchema>;

export const CreateSuggestionRequestSchema = z.object({
  sessionId: z.string().uuid(),
  name: z.string().min(1),
  city: z.string().default('NYC'),
  source: z.string(),
  kind: z.enum(['venue', 'event']).default('venue'),
  rating: z.string(),
  turnout: z.string(),
  distance: z.string(),
  budget: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  detailUrl: z.string().url().optional().nullable(),
  reservationUrl: z.string().url().optional().nullable(),
  ticketUrl: z.string().url().optional().nullable(),
  eventUrl: z.string().url().optional().nullable(),
  venueName: z.string().optional().nullable(),
  startTime: z.string().optional().nullable(),
});
export type CreateSuggestionRequest = z.infer<typeof CreateSuggestionRequestSchema>;

export const VoteRequestSchema = z.object({
  voteType: z.enum(['up', 'down']),
  reasons: z.array(z.nativeEnum(DownvoteReason)).optional(),
  note: z.string().max(500).optional(),
}).refine(
  (data) => {
    if (data.voteType === 'down') {
      const hasReasons = data.reasons && data.reasons.length > 0;
      const hasNote = data.note && data.note.trim().length >= 3;
      return hasReasons || hasNote;
    }
    return true;
  },
  { message: 'Downvote requires at least one reason or a note (3+ characters)' }
);
export type VoteRequest = z.infer<typeof VoteRequestSchema>;

export const CreateMessageRequestSchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string().min(1).max(2000),
  senderName: z.string().optional().nullable(),
});
export type CreateMessageRequest = z.infer<typeof CreateMessageRequestSchema>;

export const ProposeTimeRequestSchema = z.object({
  proposedDate: z.string().datetime(),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
  note: z.string().max(200).optional().nullable(),
});
export type ProposeTimeRequest = z.infer<typeof ProposeTimeRequestSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const IdParamSchema = z.object({
  id: z.string().uuid(),
});

export const InviteCodeParamSchema = z.object({
  code: z.string().min(1).max(20),
});

export interface ApiErrorResponse {
  message: string;
  code?: string;
  details?: Record<string, any>;
  requestId?: string;
}

export interface ApiSuccessResponse<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}
