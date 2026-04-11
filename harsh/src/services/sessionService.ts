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
const KEY_TURN_IDX = 't2d_turn_idx';
const KEY_SESSION = 't2d_session_id';
const KEY_PERSONA = 't2d_persona';
const KEY_ONBOARD = 't2d_onboarding_done';
const KEY_LOGGED_IN = 't2d_logged_in';

// ── Helpers ──────────────────────────────────────────────────────
function newUUID(): string {
  // crypto.randomUUID is available in all modern browsers + Node ≥ 19
  return crypto.randomUUID();
}

// ── User ID (permanent per device) ───────────────────────────────
export function getUserId(): string {
  let id = localStorage.getItem(KEY_USER_ID);
  if (!id) {
    id = newUUID();
    localStorage.setItem(KEY_USER_ID, id);
  }
  return id;
}

export function setUserId(id: string): void {
  localStorage.setItem(KEY_USER_ID, id);
  sessionStorage.setItem(KEY_LOGGED_IN, '1');
}

export function getIsLoggedIn(): boolean {
  return sessionStorage.getItem(KEY_LOGGED_IN) === '1';
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY_LOGGED_IN);
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

/**
 * Start a fresh conversation.
 * Returns the new conversation_id. Resets the turn counter.
 */
export function startNewConversation(): string {
  const id = newUUID();
  localStorage.setItem(KEY_CONV_ID, id);
  localStorage.setItem(KEY_TURN_IDX, '0');
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

// ── Turn Index (increments per user+AI exchange) ─────────────────
export function currentTurnIndex(): number {
  return parseInt(localStorage.getItem(KEY_TURN_IDX) ?? '0', 10);
}

export function incrementTurnIndex(): number {
  const next = currentTurnIndex() + 1;
  localStorage.setItem(KEY_TURN_IDX, String(next));
  return next;
}

// ── Convenience: get all identifiers at once ─────────────────────
export function getCurrentIds() {
  return {
    user_id: getUserId(),
    conversation_id: getConversationId(),
    session_id: getSessionId(),
  };
}

// ── Persona persistence ──────────────────────────────────────────
export function savePersona(persona: string): void {
  localStorage.setItem(KEY_PERSONA, persona);
}

export function loadPersona(): string | null {
  return localStorage.getItem(KEY_PERSONA);
}

// ── Onboarding persistence ───────────────────────────────────────
export function markOnboardingDone(): void {
  localStorage.setItem(KEY_ONBOARD, '1');
}

export function isOnboardingDone(): boolean {
  return localStorage.getItem(KEY_ONBOARD) === '1';
}

export function clearOnboarding(): void {
  localStorage.removeItem(KEY_ONBOARD);
  localStorage.removeItem(KEY_PERSONA);
}
