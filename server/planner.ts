import OpenAI from "openai";
import type { Session, Message, User, Suggestion, InsertSuggestion } from "@shared/schema";
import { getSuggestions } from "./suggestions";
import { storage } from "./storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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
  participants: { id: string; name: string; preferences: { budget: string[]; energy: string; categories: string[] } }[];
  suggestions: Suggestion[];
  recentMessages: Message[];
  liveEvents?: { name: string; venue: string; date: string; ticketUrl: string }[];
}

function buildSystemPrompt(context: PlannerContext): string {
  const { session, participants, suggestions, liveEvents } = context;
  const filters = session.filters as any;
  
  const participantSummary = participants.map(p => 
    `- ${p.name}: budget ${p.preferences.budget.join('/')}, energy "${p.preferences.energy}", interests: ${p.preferences.categories.slice(0, 3).join(', ')}`
  ).join('\n');
  
  const suggestionSummary = suggestions.length > 0 
    ? suggestions.map((s, i) => `${i + 1}. ${s.name} (${s.budget}, ${s.rating}★) - ${s.description.slice(0, 50)}...`).join('\n')
    : 'No suggestions generated yet.';

  const eventsSummary = liveEvents && liveEvents.length > 0
    ? liveEvents.map((e, i) => `${i + 1}. ${e.name} at ${e.venue} (${e.date}) - Tickets: ${e.ticketUrl}`).join('\n')
    : 'No upcoming events found for this area.';
  
  return `You are the Planner, an AI assistant helping a group of friends plan a social outing in ${filters.locationScope || 'NYC'}. You're friendly, concise, and helpful.

CURRENT PLAN CONTEXT:
- City: ${filters.locationScope || 'NYC'}
- Date/Time: ${filters.specificDate || 'flexible'} ${filters.specificTime || ''}
- Budget: ${filters.budget || 'any'}
- Vibe: ${filters.energy || 'any'}
- Categories: ${(filters.category || []).join(', ') || 'any'}
${session.neighborhood ? `- Neighborhood: ${session.neighborhood}` : ''}

GROUP PREFERENCES:
${participantSummary || 'No participants yet.'}

CURRENT SUGGESTIONS:
${suggestionSummary}

LIVE CONCERTS & EVENTS (from Ticketmaster):
${eventsSummary}

YOUR ROLE:
1. Help the group refine their plan based on preferences
2. Suggest adjustments to filters if options seem limited
3. Answer questions about venues, neighborhoods, or timing
4. When asked about concerts or events, reference the LIVE CONCERTS & EVENTS section above
5. Encourage group consensus and decision-making
6. Keep responses brief (2-3 sentences) unless asked for detail

IMPORTANT RULES:
- Only discuss venues in ${filters.locationScope || 'NYC'} - never suggest places outside this city
- Be conversational and fun - use casual language appropriate for young professionals
- When mentioning events, include the ticket URL so users can buy tickets
- Don't make up specific venue details you don't know`;
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
      
      // Fetch new suggestions with updated filters
      const result = await getSuggestions({
        city,
        categories: args.categories || filters.category || [],
        budget: args.budget,
        neighborhood: args.neighborhood || context.session.neighborhood || undefined,
        specificDate: filters.specificDate,
      });
      
      // Save new suggestions
      const sourceMap: Record<string, string> = { 'Google': 'Web', 'Ticketmaster': 'Web' };
      const newSuggestions: Suggestion[] = [];
      
      for (const opt of result.options.slice(0, 8)) {
        const suggestion = await storage.createSuggestion({
          sessionId,
          name: opt.title,
          city,
          source: sourceMap[opt.source] || 'Web',
          kind: opt.optionType === 'event' ? 'event' : 'venue',
          rating: opt.rating || '4.5',
          turnout: '0/0',
          distance: opt.distance || '1.0 mi',
          budget: opt.priceLevel || '$$',
          description: opt.description || `A great spot in ${city}`,
          tags: opt.tags || [],
          detailUrl: opt.detailUrl || null,
          reservationUrl: opt.reservationUrl || null,
          ticketUrl: opt.ticketUrl || null,
          eventUrl: opt.eventUrl || null,
          venueName: opt.venueName || null,
          startTime: opt.startTime || null,
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
        ticketUrl: null,
        eventUrl: null,
        venueName: null,
        startTime: null,
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
    const initialResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeToolCall(toolCall.function.name, args, context);
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
      
      const finalStream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messagesWithTool,
        stream: true,
        max_tokens: 500,
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
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeToolCall(toolCall.function.name, args, context);
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
      
      const finalResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
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

export async function fetchLiveEvents(city: string, specificDate?: string): Promise<{ name: string; venue: string; date: string; ticketUrl: string }[]> {
  try {
    const result = await getSuggestions({
      city,
      categories: ['Live Music', 'Comedy', 'Club'],
      specificDate,
    });
    
    return result.options
      .filter(opt => opt.optionType === 'event')
      .slice(0, 10)
      .map(opt => ({
        name: opt.title,
        venue: opt.venueName || 'TBA',
        date: opt.startTime || 'Check website',
        ticketUrl: opt.ticketUrl || opt.detailUrl || '',
      }));
  } catch (error) {
    console.error('[Planner] Error fetching live events:', error);
    return [];
  }
}
