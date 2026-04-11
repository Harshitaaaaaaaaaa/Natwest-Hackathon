/**
 * MONGO SERVICE — localStorage-backed with MongoDB-ready interface.
 *
 * Current mode: ALL calls use localStorage as the store.
 * To switch to real MongoDB: set VITE_CHAT_API_URL in your .env file.
 * The service will automatically route to the backend REST API with no other changes.
 *
 * Backend endpoints expected (when VITE_CHAT_API_URL is set):
 *   POST   /chat/conversations          → create conversation record
 *   POST   /chat/turns                  → upsert one ChatTurn
 *   GET    /chat/history/:convId        → paginated history (oldest→newest)
 *   GET    /chat/conversations/:userId  → list all conversations for user
 *
 * localStorage keys:
 *   t2d_turns_{conversationId}   → ChatTurn[]  (sorted by turn_index)
 *   t2d_convs_{userId}           → ConversationRecord[]
 *   t2d_messages                 → ChatMessage[] (for fast UI restore)
 */

import type { ChatTurn, ConversationRecord, ChatMessage } from '../types';

const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || 'http://localhost:3001';

// ── localStorage key factories ────────────────────────────────────
const TURNS_KEY   = (convId: string) => `t2d_turns_${convId}`;
const CONVS_KEY   = (userId: string) => `t2d_convs_${userId}`;
const MESSAGES_KEY = 't2d_messages';  // ChatMessage[] for fast UI restore

// ── Safe JSON helpers ─────────────────────────────────────────────
function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[mongoService] localStorage write failed:', err);
  }
}

// ================================================================
// CONVERSATION — create / update metadata
// ================================================================

export async function startConversation(record: ConversationRecord): Promise<void> {
  if (CHAT_API_URL) {
    try {
      const res = await fetch(`${CHAT_API_URL}/chat/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      if (res.ok) {
        console.log('[mongoService] Conversation created on backend');
        return;
      }
    } catch (err) {
      console.warn('[mongoService] Backend unavailable, using localStorage:', err);
    }
  }

  // localStorage fallback
  const all = lsGet<ConversationRecord[]>(CONVS_KEY(record.user_id), []);
  const idx = all.findIndex(c => c.conversation_id === record.conversation_id);
  if (idx >= 0) all[idx] = record;
  else all.push(record);
  lsSet(CONVS_KEY(record.user_id), all);
}

export async function listConversations(userId: string): Promise<ConversationRecord[]> {
  if (CHAT_API_URL) {
    try {
      const res = await fetch(`${CHAT_API_URL}/chat/conversations/${userId}`);
      if (res.ok) return res.json();
    } catch {
      console.warn('[mongoService] Backend unavailable, using localStorage');
    }
  }

  const all = lsGet<ConversationRecord[]>(CONVS_KEY(userId), []);
  // Sort by most recent first
  return all.sort((a, b) =>
    new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  );
}

// ================================================================
// TURN — save one message (user OR assistant)
// ================================================================

export async function saveTurn(turn: ChatTurn): Promise<void> {
  if (CHAT_API_URL) {
    try {
      const res = await fetch(`${CHAT_API_URL}/chat/turns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(turn),
      });
      if (res.ok) {
        console.log(`[mongoService] Turn ${turn.turn_index} (${turn.role}) saved to backend`);
        return;
      }
    } catch (err) {
      console.warn('[mongoService] Backend unavailable, saving to localStorage:', err);
    }
  }

  // localStorage fallback — upsert by message_id
  const all = lsGet<ChatTurn[]>(TURNS_KEY(turn.conversation_id), []);
  const idx = all.findIndex(t => t.message_id === turn.message_id);
  if (idx >= 0) all[idx] = turn;
  else all.push(turn);

  // Keep sorted by turn_index
  all.sort((a, b) => a.turn_index - b.turn_index);
  lsSet(TURNS_KEY(turn.conversation_id), all);
  console.log(`[mongoService] Turn ${turn.turn_index} (${turn.role}) saved to localStorage`);
}

// ================================================================
// HISTORY — load turns (paginated)
// ================================================================

/**
 * Load conversation history.
 * @param conversationId  The conversation to load
 * @param cursor          message_id of the oldest message currently shown
 *                        (undefined = load the most recent `limit` turns)
 * @param limit           How many turns to return per page (default 40)
 */
export async function loadHistory(
  conversationId: string,
  cursor?: string,
  limit = 40,
): Promise<{ turns: ChatTurn[]; hasMore: boolean; nextCursor: string | null }> {
  if (CHAT_API_URL) {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`${CHAT_API_URL}/chat/history/${conversationId}?${params}`);
      if (res.ok) return res.json();
    } catch {
      console.warn('[mongoService] Backend unavailable, loading from localStorage');
    }
  }

  // localStorage fallback
  const all = lsGet<ChatTurn[]>(TURNS_KEY(conversationId), []);
  // Already sorted by turn_index from saveTurn

  if (!cursor) {
    // Initial load — return newest `limit` turns
    const slice = all.slice(Math.max(0, all.length - limit));
    return {
      turns: slice,
      hasMore: all.length > limit,
      nextCursor: slice[0]?.message_id ?? null,
    };
  }

  // Paginate backward — load turns before the cursor
  const cursorIdx = all.findIndex(t => t.message_id === cursor);
  if (cursorIdx <= 0) return { turns: [], hasMore: false, nextCursor: null };

  const slice = all.slice(Math.max(0, cursorIdx - limit), cursorIdx);
  return {
    turns: slice,
    hasMore: cursorIdx > limit,
    nextCursor: slice[0]?.message_id ?? null,
  };
}

// ================================================================
// UI MESSAGE CACHE — fast restore on reload (no async)
// Stores the full ChatMessage[] so the UI can render instantly.
// The ChatTurn store is the authoritative record; this is the UI cache.
// ================================================================

/** Save the full messages array to localStorage for instant reload recovery. */
export function persistMessages(messages: ChatMessage[]): void {
  lsSet(MESSAGES_KEY, messages);
}

/** Load messages from localStorage for instant UI restore. Returns [] if none. */
export function loadPersistedMessages(): ChatMessage[] {
  return lsGet<ChatMessage[]>(MESSAGES_KEY, []);
}

/** Clear the persisted message cache (e.g., new conversation). */
export function clearPersistedMessages(): void {
  localStorage.removeItem(MESSAGES_KEY);
}

// ================================================================
// ENTITY EXTRACTOR — simple keyword-based (no ML needed)
// Used to fill the `entities` field in ChatTurn before saving.
// ================================================================

export function extractEntities(query: string): Record<string, string | number | boolean> {
  const q = query.toLowerCase();
  const entities: Record<string, string | number | boolean> = {};

  // Metric type
  if (q.includes('revenue') || q.includes('sales')) entities.metric = 'revenue';
  else if (q.includes('cost') || q.includes('spending') || q.includes('expense')) entities.metric = 'spending';
  else if (q.includes('churn') || q.includes('retention')) entities.metric = 'churn';
  else if (q.includes('profit') || q.includes('margin')) entities.metric = 'profit';
  else if (q.includes('user') || q.includes('customer')) entities.metric = 'customers';

  // Time references
  if (q.match(/\b(q1|q2|q3|q4)\b/)) entities.quarter = q.match(/\b(q1|q2|q3|q4)\b/)![0];
  if (q.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/)) {
    entities.month = q.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/)![0];
  }
  if (q.includes('this week')) entities.time_window = 'this_week';
  if (q.includes('this month')) entities.time_window = 'this_month';
  if (q.includes('last month')) entities.time_window = 'last_month';
  if (q.includes('year') || q.includes('annual')) entities.time_window = 'annual';

  // Chart type (explicit request)
  if (q.includes('pie chart') || /\bpie\b/.test(q)) entities.chart_requested = 'pie';
  if (q.includes('bar chart') || /\bbar\b/.test(q)) entities.chart_requested = 'bar';
  if (q.includes('line chart') || /\bline\b/.test(q)) entities.chart_requested = 'line';
  if (q.includes('treemap')) entities.chart_requested = 'treemap';

  // Numeric values
  const numMatch = q.match(/\d[\d,.]*/g);
  if (numMatch) entities.numeric_values = numMatch.join(', ');

  return entities;
}

// ================================================================
// CONTEXT BUILDER — builds previous_context from recent turns
// ================================================================

/**
 * Builds a compact context string from the last N assistant turns.
 * Used to populate the `previous_context` field in ChatTurn.
 */
export function buildPreviousContext(turns: ChatTurn[], lastN = 3): string {
  const assistantTurns = turns
    .filter(t => t.role === 'assistant')
    .slice(-lastN);

  if (assistantTurns.length === 0) return '';

  return assistantTurns
    .map(t => `[Turn ${t.turn_index}] Q: "${t.raw_user_query}" → ${t.simplified_response}`)
    .join('\n');
}
