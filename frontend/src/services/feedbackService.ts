/**
 * FEEDBACK SERVICE — Lightweight in-memory event buffer.
 *
 * Collects UI interaction events and drains them into the next
 * saveMessage call (piggybacking). No separate API endpoint needed.
 *
 * Usage:
 *   trackEvent('evidence_opened')     — push event to buffer
 *   drainEvents()                     — returns & clears buffer (called by mongoService)
 */

interface BehaviorEvent {
  type: string;
  timestamp: string;
}

// ── In-memory buffer ────────────────────────────────────────────
let eventBuffer: BehaviorEvent[] = [];

/**
 * Track a UI interaction event. Call this from any component.
 */
export function trackEvent(type: string): void {
  eventBuffer.push({
    type,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Drain all buffered events and return them. Clears the buffer.
 * Called by mongoService.saveMessage() to piggyback events.
 */
export function drainEvents(): BehaviorEvent[] {
  const events = [...eventBuffer];
  eventBuffer = [];
  return events;
}

/**
 * Helper: track query complexity based on classified intent types.
 */
export function trackQueryComplexity(queryTypes: string[]): void {
  const types = queryTypes.map(t => t.toLowerCase());

  if (types.includes('predictive')) {
    trackEvent('query_predictive');
  } else if (types.includes('diagnostic')) {
    trackEvent('query_diagnostic');
  } else if (types.includes('comparative')) {
    trackEvent('query_comparative');
  } else {
    trackEvent('query_simple');
  }
}

/**
 * Helper: track persona switch with advanced detection.
 */
export function trackPersonaSwitch(persona: string): void {
  const advanced = ['Analyst', 'Compliance'];
  if (advanced.includes(persona)) {
    trackEvent('persona_switch_advanced');
  } else {
    trackEvent('persona_switch');
  }
}
