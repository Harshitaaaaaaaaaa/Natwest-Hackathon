/**
 * SESSION SERVICE
 * Manages the 5 required identifiers across browser reloads.
 *
 * Storage strategy:
 *   user_id        → localStorage (permanent per device, survives everything)
 *   conversation_id → localStorage (survives reloads, cleared on startNewConversation)
 *   session_id     → sessionStorage (ephemeral, resets per browser tab)
 *   message_id     → crypto.randomUUID() per message
 *   turn_index     → localStorage (increments per exchange, resets per conversation)
 */

// ── Storage keys ─────────────────────────────────────────────────
const KEY_USER_ID = 't2d_user_id';
const KEY_CONV_ID = 't2d_conv_id';
const KEY_SESSION = 't2d_session_id';

// ── Helpers ──────────────────────────────────────────────────────
function newUUID(): string {
  // crypto.randomUUID is available in all modern browsers + Node ≥ 19
  return crypto.randomUUID();
}

// ── User ID (established at login) ───────────────────────────────
export function getUserId(): string | null {
  return localStorage.getItem(KEY_USER_ID);
}

export function setUserId(id: string): void {
  localStorage.setItem(KEY_USER_ID, id);
}

export function getIsLoggedIn(): boolean {
  return localStorage.getItem(KEY_USER_ID) !== null;
}

export function clearSession(): void {
  localStorage.removeItem(KEY_USER_ID);
  localStorage.removeItem(KEY_CONV_ID);
  localStorage.removeItem('t2d_messages');
}

// ── Conversation ID (survives reloads, one per conversation) ─────
export function getConversationId(): string {
  let id = localStorage.getItem(KEY_CONV_ID);
  if (!id) {
    id = newUUID();
    localStorage.setItem(KEY_CONV_ID, id);
  }
  return id;
}

export function startNewConversation(): string {
  const id = newUUID();
  localStorage.setItem(KEY_CONV_ID, id);
  return id;
}

// ── Session ID (per browser tab, resets on reload) ───────────────
export function getSessionId(): string {
  let id = sessionStorage.getItem(KEY_SESSION);
  if (!id) {
    id = newUUID();
    sessionStorage.setItem(KEY_SESSION, id);
  }
  return id;
}

// ── Message ID (fresh UUID per message) ──────────────────────────
export function newMessageId(): string {
  return newUUID();
}

// ── Convenience: get all identifiers at once ─────────────────────
export function getCurrentIds() {
  return {
    user_id: getUserId() ?? 'anonymous',
    conversation_id: getConversationId(),
    session_id: getSessionId(),
  };
}
