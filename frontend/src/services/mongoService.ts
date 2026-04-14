/**
 * MONGO SERVICE - localStorage-backed with MongoDB-ready interface.
 *
 * Current mode: localStorage fallback is always available.
 * To point to a separate backend host, set VITE_CHAT_API_URL.
 */

import type { UserConversationRecord, ConversationMessage, ChatMessage } from '../types';
import { drainEvents } from './feedbackService';
import { buildApiUrl } from '../config/api';

const CONVS_KEY = (userId: string) => `t2d_convs_${userId}`;
const MESSAGES_KEY = 't2d_messages';

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

export async function startConversation(record: UserConversationRecord): Promise<void> {
  try {
    const res = await fetch(buildApiUrl('/chat/conversations'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (res.ok) {
      return;
    }
  } catch (err) {
    console.warn('[mongoService] Backend unavailable, using localStorage:', err);
  }

  const all = lsGet<UserConversationRecord[]>(CONVS_KEY(record.user_id), []);
  const idx = all.findIndex((c) => c.conversation_id === record.conversation_id);
  if (idx >= 0) all[idx] = record;
  else all.push(record);
  lsSet(CONVS_KEY(record.user_id), all);
}

export async function listConversations(userId: string): Promise<UserConversationRecord[]> {
  try {
    const res = await fetch(buildApiUrl(`/chat/conversations/${userId}`));
    if (res.ok) return res.json();
  } catch {
    console.warn('[mongoService] Backend unavailable, using localStorage');
  }

  const all = lsGet<UserConversationRecord[]>(CONVS_KEY(userId), []);
  return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function saveMessage(
  conversation_id: string,
  userId: string,
  message: ConversationMessage,
): Promise<void> {
  try {
    const behavior_events = drainEvents();

    const res = await fetch(buildApiUrl('/chat/turns'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id, message, behavior_events, user_id: userId }),
    });
    if (res.ok) {
      return;
    }
  } catch (err) {
    console.warn('[mongoService] Backend unavailable, saving to localStorage:', err);
  }

  const all = lsGet<UserConversationRecord[]>(CONVS_KEY(userId), []);
  const conv = all.find((c) => c.conversation_id === conversation_id);
  if (conv) {
    conv.messages.push(message);
    lsSet(CONVS_KEY(userId), all);
  }
}

export async function loadHistory(
  conversationId: string,
  userId: string,
): Promise<{ messages: ConversationMessage[]; user_type: string; dataset_ref: string | null }> {
  try {
    const res = await fetch(buildApiUrl(`/chat/history/${conversationId}`));
    if (res.ok) return res.json();
  } catch {
    console.warn('[mongoService] Backend unavailable, loading from localStorage');
  }

  const all = lsGet<UserConversationRecord[]>(CONVS_KEY(userId), []);
  const conv = all.find((c) => c.conversation_id === conversationId);
  return {
    messages: conv?.messages ?? [],
    user_type: conv?.user_type ?? 'Beginner',
    dataset_ref: conv?.dataset_ref ?? null,
  };
}

export function persistMessages(messages: ChatMessage[]): void {
  lsSet(MESSAGES_KEY, messages);
}

export function loadPersistedMessages(): ChatMessage[] {
  return lsGet<ChatMessage[]>(MESSAGES_KEY, []);
}

export function clearPersistedMessages(): void {
  localStorage.removeItem(MESSAGES_KEY);
}
