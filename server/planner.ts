import OpenAI from "openai";
import type { Session, Message, User, Suggestion, InsertSuggestion } from "@shared/schema";
import { getSuggestions, getOrchestratedSuggestions, generateWhyExplanation, GroupPreferenceSummary, SuggestionOption } from "./suggestions";
import { aggregateGroupPreferences } from "./group-preferences";
import { storage } from "./storage";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openai;
}

const plannerTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "regenerate_suggestions",
      description: "Regenerate venue/event suggestions with updated filters. Use when user asks to find different types of places or change search criteria.",
      parameters: {
        type: "object",
        properties: {
          categories: {
            type: "array",
            items: { type: "string" },
            description: "Categories to search for (e.g., 'Drinks', 'Restaurant', 'Live Music', 'Club')"
          },
          budget: {
            type: "string",
            description: "Budget level: '$', '$$', '$$$', or '$$$$'"
          },
          neighborhood: {
            type: "string",
            description: "Specific neighborhood to search in (e.g., 'Williamsburg', 'Wicker Park')"
          },
          locationMode: {
            type: "string",
            enum: ["near_me", "explore_anywhere", "meet_in_the_middle"],
            description: "How to pick the search area: 'near_me' (close to user), 'explore_anywhere' (best spots city-wide), 'meet_in_the_middle' (central for the group)"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_suggestion",
      description: "Add a new venue or event suggestion to the current list. Use when user asks to include a specific place or you want to add something based on their preferences.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the venue or event"
          },
          description: {
            type: "string",
            description: "Brief description of the place or event"
          },
          kind: {
            type: "string",
            enum: ["venue", "event"],
            description: "Whether this is a venue (restaurant, bar) or an event (concert, show)"
          },
          budget: {
            type: "string",
            description: "Budget level: '$', '$$', '$$$', or '$$$$'"
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags describing the place (e.g., 'rooftop', 'cocktails', 'live music')"
          }
        },
        required: ["name", "description"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "remove_suggestion",
      description: "Remove a specific suggestion from the current list. Use when user says they don't want a place or asks to remove it.",
      parameters: {
        type: "object",
        properties: {
          suggestionName: {
            type: "string",
            description: "The name of the venue/event to remove"
          }
        },
        required: ["suggestionName"]
      }
    }
  }
];

interface PlannerContext {
  session: Session;
  user: User;
  participants: { 
    id: string; 
    userId: string;
    name: string; 
    preferences: { 
      budget: string[]; 
      energy: string; 
      categories: string[];
      hardNos?: string[];
      discoveryStyle?: string | null;
      crowdPreference?: string | null;
      favoriteNeighborhoods?: string[] | null;
    } 
  }[];
  suggestions: Suggestion[];
  recentMessages: Message[];
  userFeedback?: Array<{
    rating: number;
    review: string | null;
    tags: string[] | null;
    venueName: string;
    createdAt: Date;
  }>;
}

function buildSystemPrompt(context: PlannerContext): string {
  const { session, participants, suggestions, userFeedback } = context;
  const filters = session.filters as any;
  
  // Build detailed participant summary including discovery preferences
  const participantSummary = participants.map(p => {
    const parts = [`- ${p.name}: budget ${p.preferences.budget.join('/')}, energy "${p.preferences.energy}"`];
    if (p.preferences.categories.length > 0) {
      parts.push(`interests: ${p.preferences.categories.slice(0, 3).join(', ')}`);
    }
    if (p.preferences.discoveryStyle) {
      parts.push(`discovery: ${p.preferences.discoveryStyle}`);
    }
    if (p.preferences.crowdPreference && p.preferences.crowdPreference !== 'no_preference') {
      parts.push(`crowd: ${p.preferences.crowdPreference}`);
    }
    if (p.preferences.favoriteNeighborhoods && p.preferences.favoriteNeighborhoods.length > 0) {
      parts.push(`neighborhoods: ${p.preferences.favoriteNeighborhoods.slice(0, 2).join(', ')}`);
    }
    return parts.join(', ');
  }).join('\n');
  
  // Use proper group preference aggregation for true consensus
  const userPrefsForAggregation = participants.map(p => ({
    id: p.userId,
    name: p.name,
    city: filters?.locationScope || 'New York',
    budget: p.preferences.budget || ['$$'],
    energy: p.preferences.energy || 'Vibey',
    categories: p.preferences.categories || [],
    hardNos: p.preferences.hardNos || [],
    discoveryStyle: p.preferences.discoveryStyle,
    crowdPreference: p.preferences.crowdPreference,
    favoriteNeighborhoods: p.preferences.favoriteNeighborhoods,
  }));
  
  let discoveryConsensus = 'mixed';
  let crowdConsensus = 'no_preference';
  let favoriteNeighborhoods: string[] = [];
  let hardNos: string[] = [];
  
  if (userPrefsForAggregation.length > 0) {
    const aggregated = aggregateGroupPreferences(userPrefsForAggregation, session);
    discoveryConsensus = aggregated.discoveryStyle;
    crowdConsensus = aggregated.crowdPreference;
    favoriteNeighborhoods = aggregated.favoriteNeighborhoods;
    hardNos = aggregated.hardNos;
  }
  
  const suggestionSummary = suggestions.length > 0 
    ? suggestions.map((s, i) => `${i + 1}. ${s.name} (${s.budget}, ${s.rating}★) - ${s.description.slice(0, 50)}...`).join('\n')
    : 'No suggestions generated yet.';

  // Build user feedback history for AI memory
  const feedbackHistory = userFeedback && userFeedback.length > 0
    ? userFeedback.map(f => {
        const tagsList = f.tags && f.tags.length > 0 ? ` [${f.tags.join(', ')}]` : '';
        const reviewText = f.review ? ` - "${f.review}"` : '';
        return `- ${f.venueName}: ${f.rating}★${tagsList}${reviewText}`;
      }).join('\n')
    : '';
  
  const locationModeLabel = filters.locationMode === 'explore_anywhere' 
    ? 'Explore Anywhere (best spots city-wide, distance doesn\'t matter)' 
    : filters.locationMode === 'meet_in_the_middle' 
    ? 'Meet in the Middle (finding central spots for everyone)' 
    : 'Near Me (close to user\'s area)';

  return `You are the Planner, an AI assistant helping a group of friends plan a social outing in ${filters.locationScope || 'NYC'}. You're friendly, concise, and helpful.

CURRENT PLAN CONTEXT:
- City: ${filters.locationScope || 'NYC'}
- Date/Time: ${filters.specificDate || 'flexible'} ${filters.specificTime || ''}
- Budget: ${filters.budget || 'any'}
- Vibe: ${filters.energy || 'any'}
- Categories: ${(filters.category || []).join(', ') || 'any'}
- Location Mode: ${locationModeLabel}
${filters.vibeDescription ? `- Vibe Description: "${filters.vibeDescription}" (this is the user's own words about what they want — keep this in mind for all suggestions)` : ''}
${session.neighborhood ? `- Neighborhood: ${session.neighborhood}` : ''}
- Discovery Style: ${discoveryConsensus} (${discoveryConsensus === 'hidden_gems' ? 'prefer lesser-known spots' : discoveryConsensus === 'popular' ? 'prefer popular spots' : 'balanced mix'})
- Crowd Preference: ${crowdConsensus}
${favoriteNeighborhoods.length > 0 ? `- Favorite Neighborhoods: ${favoriteNeighborhoods.slice(0, 4).join(', ')}` : ''}
${hardNos.length > 0 ? `- Avoid (hard nos): ${hardNos.slice(0, 5).join(', ')}` : ''}

GROUP PREFERENCES:
${participantSummary || 'No participants yet.'}

CURRENT SUGGESTIONS:
${suggestionSummary}

${feedbackHistory ? `
USER'S PAST OUTING FEEDBACK (use this to personalize suggestions):
${feedbackHistory}

MEMORY INSIGHTS:
- Venues with 4-5★ ratings were great experiences - suggest similar places
- Venues with 1-2★ ratings should be avoided
- Pay attention to tags like "too_crowded", "too_expensive", "great_vibe" to learn preferences
- Comments reveal specific likes/dislikes - use these to tailor recommendations
` : ''}
YOUR ROLE:
1. Help the group refine their plan based on preferences
2. Suggest adjustments to filters if options seem limited
3. Answer questions about venues, neighborhoods, or timing
4. When asked about concerts or events, reference the LIVE CONCERTS & EVENTS section above
5. Encourage group consensus and decision-making
6. Keep responses brief (2-3 sentences) unless asked for detail

CRITICAL TOOL USAGE RULES:
- When asked to regenerate, refresh, find new, or update suggestions/options, you MUST call the regenerate_suggestions tool. NEVER list venues in your text response — the tool updates the Suggestions tab directly.
- When asked to add a specific venue, you MUST call the add_suggestion tool.
- When asked to remove a venue, you MUST call the remove_suggestion tool.
- After calling any tool, your text response should be SHORT (1-2 sentences) confirming what you did and telling the user to check the Suggestions tab. Do NOT repeat or list the new suggestions in your message.

IMPORTANT RULES:
- Only discuss venues in ${filters.locationScope || 'NYC'} - never suggest places outside this city
- Be conversational and fun - use casual language appropriate for young professionals
- When mentioning events, include the ticket URL so users can buy tickets
- Don't make up specific venue details you don't know
- For late-night plans (after 9PM) or high-energy vibes ("Going out", "Full send"), prioritize nightclubs, bars, lounges, and events over restaurants
- When regenerating suggestions for a night out, use categories like Club, Dancing, Live Music, Cocktails, Lounge - not just Dinner or Drinks`;
}

function buildConversationHistory(
  context: PlannerContext, 
  userMessage: string
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: buildSystemPrompt(context) }
  ];
  
  // Add recent message history (last 10 messages for context)
  // Filter out system messages - user messages have user UUID as sender
  const relevantMessages = context.recentMessages
    .filter(m => m.sender !== 'system')
    .slice(-10);
  
  for (const msg of relevantMessages) {
    if (msg.sender === 'planner-ai') {
      messages.push({ role: 'assistant', content: msg.text });
    } else {
      // User message - include the user's name if we have it
      const senderName = context.participants.find(p => p.id === msg.sender)?.name;
      const prefix = senderName ? `${senderName}: ` : '';
      messages.push({ role: 'user', content: `${prefix}${msg.text}` });
    }
  }
  
  // Add the current user message
  const currentUserName = context.user.name;
  messages.push({ role: 'user', content: `${currentUserName}: ${userMessage}` });
  
  return messages;
}

interface ToolResult {
  toolCalled: string;
  result: any;
  newSuggestions?: Suggestion[];
}

async function executeToolCall(
  toolName: string,
  args: any,
  context: PlannerContext
): Promise<ToolResult> {
  const sessionId = context.session.id;
  const filters = context.session.filters as any;
  const city = filters.locationScope || 'NYC';
  
  if (toolName === 'regenerate_suggestions') {
    try {
      // Delete existing suggestions
      await storage.deleteSessionSuggestions(sessionId);
      
      const userPrefsForAggregation = context.participants.map(p => ({
        id: p.userId,
        name: p.name,
        city: (context.session.filters as any)?.city || 'New York',
        budget: p.preferences.budget || ['$$'],
        energy: p.preferences.energy || 'Vibey',
        categories: p.preferences.categories || [],
        hardNos: p.preferences.hardNos || [],
        discoveryStyle: p.preferences.discoveryStyle,
        crowdPreference: p.preferences.crowdPreference,
        favoriteNeighborhoods: p.preferences.favoriteNeighborhoods,
      }));
      
      const aggregated = aggregateGroupPreferences(userPrefsForAggregation, context.session);
      
      const groupPrefs: GroupPreferenceSummary = {
        memberCount: aggregated.memberCount,
        categories: args.categories || aggregated.categories,
        commonCategories: aggregated.commonCategories,
        budget: args.budget || aggregated.preferredBudget,
        energy: aggregated.energyLevel,
        crowdPreference: aggregated.crowdPreference,
        discoveryStyle: aggregated.discoveryStyle,
        favoriteNeighborhoods: aggregated.favoriteNeighborhoods.length > 0 ? aggregated.favoriteNeighborhoods : undefined,
      };

      const effectiveLocationMode = args.locationMode || filters.locationMode || 'near_me';

      const result = await getOrchestratedSuggestions({
        city,
        categories: args.categories || filters.category || [],
        budget: args.budget,
        neighborhood: args.neighborhood || context.session.neighborhood || undefined,
        specificDate: filters.specificDate,
        specificTime: filters.specificTime,
        timeWindow: filters.timeWindow,
        energy: filters.energy,
        vibeDescription: filters.vibeDescription,
        locationMode: effectiveLocationMode as 'near_me' | 'explore_anywhere' | 'meet_in_the_middle',
        midpointLat: filters.midpointLat,
        midpointLng: filters.midpointLng,
        discoveryStyle: context.user.discoveryStyle as 'hidden_gems' | 'popular' | 'mixed' | undefined,
        crowdPreference: context.user.crowdPreference as 'quiet' | 'buzzing' | 'no_preference' | undefined,
        favoriteNeighborhoods: context.user.favoriteNeighborhoods || undefined,
      }, undefined, undefined, groupPrefs);
      
      const sourceMap: Record<string, string> = { 'Google': 'Web' };
      const newSuggestions: Suggestion[] = [];
      
      for (const opt of result.options.slice(0, 8)) {
        const whyExplanation = opt.whyExplanation || generateWhyExplanation(opt, groupPrefs);
        const suggestion = await storage.createSuggestion({
          sessionId,
          name: opt.title,
          city,
          source: sourceMap[opt.source] || 'Web',
          kind: 'venue',
          rating: opt.rating || '4.5',
          turnout: '0/0',
          distance: opt.distance || '1.0 mi',
          budget: opt.priceLevel || '$$',
          description: opt.description || `A great spot in ${city}`,
          tags: opt.tags || [],
          detailUrl: opt.detailUrl || null,
          reservationUrl: opt.reservationUrl || null,
          whyExplanation,
        });
        newSuggestions.push(suggestion);
      }
      
      // Update context for subsequent calls
      context.suggestions.length = 0;
      context.suggestions.push(...newSuggestions);
      
      return { 
        toolCalled: 'regenerate_suggestions', 
        result: { count: newSuggestions.length, categories: args.categories },
        newSuggestions 
      };
    } catch (error) {
      console.error('[Planner] Error regenerating suggestions:', error);
      return { toolCalled: 'regenerate_suggestions', result: { error: 'Failed to regenerate suggestions' } };
    }
  }
  
  if (toolName === 'add_suggestion') {
    try {
      // Build group preferences for personalized explanation
      const userPrefsForAggregation = context.participants.map(p => ({
        id: p.userId,
        name: p.name,
        city: (context.session.filters as any)?.locationScope || 'New York',
        budget: p.preferences.budget || ['$$'],
        energy: p.preferences.energy || 'Vibey',
        categories: p.preferences.categories || [],
        hardNos: p.preferences.hardNos || [],
        discoveryStyle: p.preferences.discoveryStyle,
        crowdPreference: p.preferences.crowdPreference,
        favoriteNeighborhoods: p.preferences.favoriteNeighborhoods,
      }));
      
      let groupPrefs: GroupPreferenceSummary = {
        memberCount: context.participants.length || 1,
        categories: args.tags || [],
        commonCategories: args.tags || [],
        budget: args.budget || '$$',
        energy: 'Vibey',
      };
      
      if (userPrefsForAggregation.length > 0) {
        const aggregated = aggregateGroupPreferences(userPrefsForAggregation, context.session);
        groupPrefs = {
          memberCount: aggregated.memberCount,
          categories: aggregated.categories,
          commonCategories: aggregated.commonCategories,
          budget: args.budget || aggregated.preferredBudget,
          energy: aggregated.energyLevel,
          crowdPreference: aggregated.crowdPreference,
          discoveryStyle: aggregated.discoveryStyle,
          favoriteNeighborhoods: aggregated.favoriteNeighborhoods.length > 0 ? aggregated.favoriteNeighborhoods : undefined,
        };
      }
      
      // Create option object for whyExplanation generation
      const addedOption: SuggestionOption = {
        optionType: 'place',
        title: args.name,
        description: args.description || '',
        address: '',
        city,
        source: 'Web',
        priceLevel: args.budget || '$$',
        tags: args.tags || [],
        generationType: 'safe',
      };

      const whyExplanation = generateWhyExplanation(addedOption, groupPrefs);
      
      const suggestion = await storage.createSuggestion({
        sessionId,
        name: args.name,
        city,
        source: 'Web',
        kind: args.kind || 'venue',
        rating: '4.5',
        turnout: '0/0',
        distance: '- mi',
        budget: args.budget || '$$',
        description: args.description,
        tags: args.tags || [],
        detailUrl: null,
        reservationUrl: null,
        whyExplanation,
      });
      
      // Update context for subsequent calls
      context.suggestions.push(suggestion);
      
      return { 
        toolCalled: 'add_suggestion', 
        result: { added: suggestion.name },
        newSuggestions: [suggestion]
      };
    } catch (error) {
      console.error('[Planner] Error adding suggestion:', error);
      return { toolCalled: 'add_suggestion', result: { error: 'Failed to add suggestion' } };
    }
  }
  
  if (toolName === 'remove_suggestion') {
    const { suggestionName } = args;
    const matchingSuggestion = context.suggestions.find(
      s => s.name.toLowerCase().includes(suggestionName.toLowerCase())
    );
    
    if (matchingSuggestion) {
      await storage.deleteSuggestion(matchingSuggestion.id);
      // Update context for subsequent calls
      const idx = context.suggestions.findIndex(s => s.id === matchingSuggestion.id);
      if (idx >= 0) context.suggestions.splice(idx, 1);
      return { toolCalled: 'remove_suggestion', result: { removed: matchingSuggestion.name } };
    }
    return { toolCalled: 'remove_suggestion', result: { error: 'Suggestion not found' } };
  }
  
  return { toolCalled: toolName, result: { error: 'Unknown tool' } };
}

export interface PlannerResponseResult {
  text: string;
  toolResults?: ToolResult[];
  suggestionsUpdated?: boolean;
  newSuggestions?: Suggestion[];
}

export async function* streamPlannerResponse(
  context: PlannerContext,
  userMessage: string
): AsyncGenerator<string, PlannerResponseResult | void, unknown> {
  const messages = buildConversationHistory(context, userMessage);
  
  try {
    // First, check if a tool call is needed (non-streaming)
    const initialResponse = await getOpenAI().chat.completions.create({
      model: 'gemini-2.5-flash-lite',
      messages,
      tools: plannerTools,
      tool_choice: 'auto',
      max_tokens: 500,
    });
    
    const toolCalls = initialResponse.choices[0]?.message?.tool_calls;
    
    if (toolCalls && toolCalls.length > 0) {
      // Execute tool calls
      const toolResults: ToolResult[] = [];
      let newSuggestions: Suggestion[] | undefined;
      
      for (const toolCall of toolCalls) {
        if (toolCall.type !== 'function' || !('function' in toolCall)) continue;
        const fn = toolCall.function as { name: string; arguments: string };
        const args = JSON.parse(fn.arguments);
        const result = await executeToolCall(fn.name, args, context);
        toolResults.push(result);
        if (result.newSuggestions) {
          newSuggestions = result.newSuggestions;
        }
      }
      
      // Add tool results to conversation and get final response
      const messagesWithTool = [
        ...messages,
        initialResponse.choices[0].message,
        ...toolCalls.map((tc, i) => ({
          role: 'tool' as const,
          tool_call_id: tc.id,
          content: JSON.stringify(toolResults[i].result),
        }))
      ];
      
      const finalStream = await getOpenAI().chat.completions.create({
        model: 'gemini-2.5-flash-lite',
        messages: messagesWithTool,
        stream: true,
        max_tokens: 150,
      });
      
      let fullText = '';
      for await (const chunk of finalStream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullText += content;
          yield content;
        }
      }
      
      return { text: fullText, toolResults, suggestionsUpdated: true, newSuggestions };
    }
    
    // No tool calls - stream the regular response
    const content = initialResponse.choices[0]?.message?.content || '';
    if (content) {
      yield content;
      return { text: content };
    }
  } catch (error: any) {
    console.error('[Planner] OpenAI error:', error);
    yield "I'm having trouble connecting right now. Try asking me again in a moment!";
  }
}

export async function getPlannerResponse(
  context: PlannerContext,
  userMessage: string
): Promise<PlannerResponseResult> {
  const messages = buildConversationHistory(context, userMessage);
  
  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gemini-2.5-flash-lite',
      messages,
      tools: plannerTools,
      tool_choice: 'auto',
      max_tokens: 500,
    });
    
    const toolCalls = response.choices[0]?.message?.tool_calls;
    
    if (toolCalls && toolCalls.length > 0) {
      const toolResults: ToolResult[] = [];
      let newSuggestions: Suggestion[] | undefined;
      
      for (const toolCall of toolCalls) {
        if (toolCall.type !== 'function' || !('function' in toolCall)) continue;
        const fn = toolCall.function as { name: string; arguments: string };
        const args = JSON.parse(fn.arguments);
        const result = await executeToolCall(fn.name, args, context);
        toolResults.push(result);
        if (result.newSuggestions) {
          newSuggestions = result.newSuggestions;
        }
      }
      
      // Get final response after tool execution
      const messagesWithTool = [
        ...messages,
        response.choices[0].message,
        ...toolCalls.map((tc, i) => ({
          role: 'tool' as const,
          tool_call_id: tc.id,
          content: JSON.stringify(toolResults[i].result),
        }))
      ];
      
      const finalResponse = await getOpenAI().chat.completions.create({
        model: 'gemini-2.5-flash-lite',
        messages: messagesWithTool,
        max_tokens: 500,
      });
      
      const text = finalResponse.choices[0]?.message?.content || "Done!";
      return { text, toolResults, suggestionsUpdated: true, newSuggestions };
    }
    
    const text = response.choices[0]?.message?.content || "I'm not sure what to say. Can you rephrase that?";
    return { text };
  } catch (error: any) {
    console.error('[Planner] OpenAI error:', error);
    return { text: "I'm having trouble connecting right now. Try asking me again in a moment!" };
  }
}

