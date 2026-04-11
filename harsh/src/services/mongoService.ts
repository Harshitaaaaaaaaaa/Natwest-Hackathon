/**
 * MONGO SERVICE — localStorage-backed with MongoDB-ready interface.
 *
 * Current mode: ALL calls use localStorage as the store.
 * To switch to real MongoDB: set VITE_CHAT_API_URL in your .env file.
 *
 * Backend endpoints (when VITE_CHAT_API_URL is set):
 *   POST   /chat/conversations          → create UserConversationRecord
 *   POST   /chat/turns                  → $push ConversationMessage
 *   GET    /chat/history/:convId        → full conversation document
 *   GET    /chat/conversations/:userId  → list all conversations
 *
 * localStorage keys:
 *   t2d_convs_{userId}  → UserConversationRecord[]
 *   t2d_messages        → ChatMessage[] (fast UI restore)
 */

import type { UserConversationRecord, ConversationMessage, ChatMessage } from '../types';

const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || 'http://localhost:3001';

const CONVS_KEY    = (userId: string) => `t2d_convs_${userId}`;
const MESSAGES_KEY = 't2d_messages';


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

export async function startConversation(record: UserConversationRecord): Promise<void> {
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
  const all = lsGet<UserConversationRecord[]>(CONVS_KEY(record.user_id), []);
  const idx = all.findIndex(c => c.conversation_id === record.conversation_id);
  if (idx >= 0) all[idx] = record;
  else all.push(record);
  lsSet(CONVS_KEY(record.user_id), all);
}

export async function listConversations(userId: string): Promise<UserConversationRecord[]> {
  if (CHAT_API_URL) {
    try {
      const res = await fetch(`${CHAT_API_URL}/chat/conversations/${userId}`);
      if (res.ok) return res.json();
    } catch {
      console.warn('[mongoService] Backend unavailable, using localStorage');
    }
  }

  const all = lsGet<UserConversationRecord[]>(CONVS_KEY(userId), []);
  // Sort by most recent first
  return all.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

// ================================================================
// TURN — save one message (user OR assistant)
// ================================================================

export async function saveMessage(conversation_id: string, userId: string, message: ConversationMessage): Promise<void> {
  if (CHAT_API_URL) {
    try {
      const res = await fetch(`${CHAT_API_URL}/chat/turns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id, message }),
      });
      if (res.ok) {
        console.log(`[mongoService] Message saved to backend array`);
        return;
      }
    } catch (err) {
      console.warn('[mongoService] Backend unavailable, saving to localStorage:', err);
    }
  }

  // localStorage fallback — push into messages array
  const all = lsGet<UserConversationRecord[]>(CONVS_KEY(userId), []);
  const conv = all.find(c => c.conversation_id === conversation_id);
  if (conv) {
    conv.messages.push(message);
    lsSet(CONVS_KEY(userId), all);
  }
}

// ================================================================
// HISTORY — load monolithic conversation
// ================================================================

export async function loadHistory(
  conversationId: string,
  userId: string
): Promise<{ messages: ConversationMessage[]; user_type: string; dataset_ref: string | null }> {
  if (CHAT_API_URL) {
    try {
      const res = await fetch(`${CHAT_API_URL}/chat/history/${conversationId}`);
      if (res.ok) return res.json();
    } catch {
      console.warn('[mongoService] Backend unavailable, loading from localStorage');
    }
  }

  // localStorage fallback
  const all = lsGet<UserConversationRecord[]>(CONVS_KEY(userId), []);
  const conv = all.find(c => c.conversation_id === conversationId);
  return {
    messages: conv?.messages ?? [],
    user_type: conv?.user_type ?? 'Beginner',
    dataset_ref: conv?.dataset_ref ?? null
  };
}

// ================================================================
// UI MESSAGE CACHE — fast restore on reload (no async)
// Stores the full ChatMessage[] so the UI can render instantly.
// ================================================================

export function persistMessages(messages: ChatMessage[]): void {
  lsSet(MESSAGES_KEY, messages);
}

export function loadPersistedMessages(): ChatMessage[] {
  return lsGet<ChatMessage[]>(MESSAGES_KEY, []);
}

export function clearPersistedMessages(): void {
  localStorage.removeItem(MESSAGES_KEY);
}
