import OpenAI from "openai";
import type { Session, Message, User, Suggestion } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface PlannerContext {
  session: Session;
  user: User;
  participants: { id: string; name: string; preferences: { budget: string[]; energy: string; categories: string[] } }[];
  suggestions: Suggestion[];
  recentMessages: Message[];
}

function buildSystemPrompt(context: PlannerContext): string {
  const { session, participants, suggestions } = context;
  const filters = session.filters as any;
  
  const participantSummary = participants.map(p => 
    `- ${p.name}: budget ${p.preferences.budget.join('/')}, energy "${p.preferences.energy}", interests: ${p.preferences.categories.slice(0, 3).join(', ')}`
  ).join('\n');
  
  const suggestionSummary = suggestions.length > 0 
    ? suggestions.map((s, i) => `${i + 1}. ${s.name} (${s.budget}, ${s.rating}★) - ${s.description.slice(0, 50)}...`).join('\n')
    : 'No suggestions generated yet.';
  
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

YOUR ROLE:
1. Help the group refine their plan based on preferences
2. Suggest adjustments to filters if options seem limited
3. Answer questions about venues, neighborhoods, or timing
4. Encourage group consensus and decision-making
5. Keep responses brief (2-3 sentences) unless asked for detail

IMPORTANT RULES:
- Only discuss venues in ${filters.locationScope || 'NYC'} - never suggest places outside this city
- Be conversational and fun - use casual language appropriate for young professionals
- If asked about something outside your knowledge, admit it honestly
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

export async function* streamPlannerResponse(
  context: PlannerContext,
  userMessage: string
): AsyncGenerator<string, void, unknown> {
  const messages = buildConversationHistory(context, userMessage);
  
  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      stream: true,
      max_tokens: 500,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error: any) {
    console.error('[Planner] OpenAI error:', error);
    yield "I'm having trouble connecting right now. Try asking me again in a moment!";
  }
}

export async function getPlannerResponse(
  context: PlannerContext,
  userMessage: string
): Promise<string> {
  const messages = buildConversationHistory(context, userMessage);
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 500,
    });
    
    return response.choices[0]?.message?.content || "I'm not sure what to say. Can you rephrase that?";
  } catch (error: any) {
    console.error('[Planner] OpenAI error:', error);
    return "I'm having trouble connecting right now. Try asking me again in a moment!";
  }
}
