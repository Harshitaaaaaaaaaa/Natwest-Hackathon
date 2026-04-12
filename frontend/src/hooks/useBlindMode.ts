/**
 * useBlindMode — Accessibility "Self-Voicing" hook
 *
 * Activated by holding the Spacebar for 5 seconds (outside text inputs).
 * Once active:
 *   1. Every button focused via Tab is read aloud.
 *   2. AI responses are auto-spoken on arrival.
 *   3. Voice input auto-activates after the user presses Enter on their query.
 *
 * Uses native Web Speech API only — zero external deps.
 */

import { useEffect, useRef, useCallback } from 'react';

// ── Speech helpers ────────────────────────────────────────────────

function speak(text: string, rate = 0.95): void {
  if (!('speechSynthesis' in window) || !text?.trim()) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text.trim());
  utt.rate = rate;
  window.speechSynthesis.speak(utt);
}

function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// ── Hook ──────────────────────────────────────────────────────────

export function useBlindMode(
  blindMode: boolean,
  setBlindMode: (v: boolean) => void,
) {
  const spaceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spaceHeldRef = useRef(false);

  // ────────────────────────────────────────────────────────────────
  // Task 1 — 5-second Spacebar activation
  // ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in a text field
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code !== 'Space' || e.repeat) return;

      e.preventDefault(); // prevent page scroll while holding

      if (spaceHeldRef.current) return; // already tracking
      spaceHeldRef.current = true;

      spaceTimerRef.current = setTimeout(() => {
        const newMode = !blindMode;
        setBlindMode(newMode);

        if (newMode) {
          speak('Blind mode activated. Buttons will be announced on focus. AI responses will be read aloud automatically.');
        } else {
          speak('Blind mode deactivated.');
        }
      }, 5000);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      spaceHeldRef.current = false;
      if (spaceTimerRef.current) {
        clearTimeout(spaceTimerRef.current);
        spaceTimerRef.current = null;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (spaceTimerRef.current) clearTimeout(spaceTimerRef.current);
    };
  }, [blindMode, setBlindMode]);

  // ────────────────────────────────────────────────────────────────
  // Task 2 — Global button focus reader (Tab navigation)
  // ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!blindMode) return;

    const handleFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!el) return;

      const isButton =
        el.tagName === 'BUTTON' ||
        el.getAttribute('role') === 'button';

      if (!isButton) return;

      // Prefer aria-label → title → innerText
      const text =
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.innerText;

      if (text?.trim()) {
        speak(text);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [blindMode]);

  // ── Expose helpers for the consuming component ──────────────────

  /** Call when a new AI response arrives — will auto-read if blind mode is on */
  const announceResponse = useCallback(
    (text: string) => {
      if (blindMode && text?.trim()) {
        speak(text, 0.9);
      }
    },
    [blindMode],
  );

  return {
    speak,
    stopSpeaking,
    announceResponse,
  };
}
