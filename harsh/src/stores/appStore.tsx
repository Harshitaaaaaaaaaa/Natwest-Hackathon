/**
 * APP STORE v2 — central state with full session persistence.
 *
 * Persistence strategy:
 *   - On mount: restore messages from localStorage instantly (no flicker)
 *   - On backend: hydrate from user_conversations monolithic document
 *   - On new AI message: saveMessage() → $push to conversation doc
 *   - On persona switch: reRenderWithPersona() — no API call, pure local
 */

import React, {
  createContext, useContext, useState, useCallback, useEffect, useRef,
} from 'react';
import type { ReactNode } from 'react';
import type {
  Persona, ChatMessage, OnboardingAnswers, MLOutputContract,
} from '../types';
import { buildResponseFromInsight, reRenderWithPersona } from '../utils/responseMapper';
import {
  getUserId, getConversationId, getSessionId,
  newMessageId,
  savePersona, loadPersona, markOnboardingDone, isOnboardingDone,
  startNewConversation as sessionStartNew, setUserId, getIsLoggedIn,
  clearSession,
} from '../services/sessionService';
import {
  saveMessage, loadHistory, startConversation, persistMessages,
  loadPersistedMessages, clearPersistedMessages,
} from '../services/mongoService';

type AppView = 'login' | 'upload' | 'onboarding' | 'transition' | 'chat';

interface AppContextState {
  // Persona
  currentPersona: Persona;
  setCurrentPersona: (p: Persona) => void;
  switchPersona: (p: Persona) => void;

  // Messages
  messages: ChatMessage[];
  addMessage: (m: ChatMessage) => void;
  updateMessage: (id: string, partial: Partial<ChatMessage>) => void;

  // Loading
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Navigation
  appView: AppView;
  setAppView: (v: AppView) => void;
  completeOnboarding: (answers: OnboardingAnswers, persona: Persona) => void;

  // Onboarding
  onboardingAnswers: OnboardingAnswers | null;
  setOnboardingAnswers: (a: OnboardingAnswers) => void;

  // Accessibility
  voiceMode: boolean;
  setVoiceMode: (v: boolean) => void;

  // Session IDs
  userId: string;
  conversationId: string;
  sessionId: string;
  datasetRef: string | null;
  setDatasetRef: (ref: string) => void;

  // History scroll-back
  isRestoring: boolean;
  hasMoreHistory: boolean;
  loadMoreHistory: () => Promise<void>;

  // Conversation management
  startFreshConversation: () => void;
  loginUser: (username: string) => Promise<void>;
  logoutUser: () => void;
}

const AppContext = createContext<AppContextState | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // ── Session IDs ──────────────────────────────────────────────────
  const [userId, setUserIdState] = useState(getUserId());
  const conversationId = useRef(getConversationId()).current;
  const sessionId = useRef(getSessionId()).current;

  // ── Initial persona ──────────────────────────────────────────────
  const resolveInitialPersona = (): Persona => {
    const saved = loadPersona();
    const valid: Persona[] = ['Beginner', 'Everyday', 'SME', 'Executive', 'Analyst', 'Compliance'];
    return (valid.includes(saved as Persona) ? saved : 'Beginner') as Persona;
  };

  // ── Initial view ─────────────────────────────────────────────────
  const resolveInitialView = (): AppView => {
    if (!getIsLoggedIn()) return 'login';
    return isOnboardingDone() ? 'chat' : 'upload';
  };

  // ── State ────────────────────────────────────────────────────────
  const [currentPersona, setCurrentPersonaRaw] = useState<Persona>(resolveInitialPersona);
  const [datasetRef, setDatasetRef] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [appView, setAppView] = useState<AppView>(resolveInitialView);
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswers | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);

  // ── Restore messages on mount ─────────────────────────────────────
  useEffect(() => {
    if (appView !== 'chat') return;

    // Step 1: instant restore from localStorage UI cache
    const cached = loadPersistedMessages();
    if (cached.length > 0) {
      setMessages(cached);
    }

    // Step 2: try to hydrate from backend (non-blocking)
    (async () => {
      setIsRestoring(true);
      try {
        const historyRes = await loadHistory(conversationId, userId);
        const { messages: apiMsgs } = historyRes;
        if (apiMsgs && apiMsgs.length > 0) {
          const restored = apiMsgs
            .filter(m => m.role === 'assistant' && m.ml_output && Object.keys(m.ml_output).length > 0)
            .map(m => ({
              id: m.message_id,
              sender: 'ai' as const,
              rawInsight: m.ml_output as MLOutputContract,
              response: buildResponseFromInsight(currentPersona, m.ml_output as MLOutputContract),
              rawQuery: m.user_query,
              isLoading: false,
            }));
          if (restored.length > cached.length) {
            setMessages(restored);
            persistMessages(restored);
          }
        }
      } catch (err) {
        console.warn('[appStore] Backend history restore failed, using cache:', err);
      } finally {
        setIsRestoring(false);
      }
    })();
  }, [appView]);

  // ── Persist messages to localStorage on change ────────────────────
  const prevMessagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    if (messages.length === 0) return;
    if (messages === prevMessagesRef.current) return;
    prevMessagesRef.current = messages;
    const t = setTimeout(() => persistMessages(messages), 200);
    return () => clearTimeout(t);
  }, [messages]);

  // ── addMessage ────────────────────────────────────────────────────
  const addMessage = useCallback(
    (m: ChatMessage) => {
      setMessages(prev => {
        const next = [...prev, m];
        void persistMsg(m, userId, conversationId);
        return next;
      });
    },
    [userId, conversationId],
  );

  // ── updateMessage ─────────────────────────────────────────────────
  const updateMessage = useCallback(
    (id: string, partial: Partial<ChatMessage>) => {
      setMessages(prev => {
        const next = prev.map(msg => msg.id === id ? { ...msg, ...partial } : msg);
        const updated = next.find(m => m.id === id);
        if (updated && updated.sender === 'ai' && partial.isLoading === false) {
          void persistMsg(updated, userId, conversationId);
        }
        return next;
      });
    },
    [userId, conversationId],
  );

  // ── Scroll-back history ───────────────────────────────────────────
  const loadMoreHistory = useCallback(async () => {
    // No-op: monolithic document loads everything at once
    setHasMoreHistory(false);
  }, []);

  // ── Persona switch — re-renders all AI messages instantly ─────────
  const switchPersona = useCallback(
    (newPersona: Persona) => {
      setCurrentPersonaRaw(newPersona);
      savePersona(newPersona);

      setMessages(prev => {
        const updates = reRenderWithPersona(prev, newPersona);
        const updateMap = new Map(updates.map(u => [u.id, u.response]));
        return prev.map(msg => {
          if (msg.sender !== 'ai' || !msg.rawInsight) return msg;
          const newResp = updateMap.get(msg.id);
          if (!newResp) return msg;
          return { ...msg, response: newResp };
        });
      });
    },
    [],
  );

  const setCurrentPersona = useCallback((p: Persona) => {
    setCurrentPersonaRaw(p);
    savePersona(p);
  }, []);

  // ── Onboarding completion ─────────────────────────────────────────
  const completeOnboarding = useCallback(
    (answers: OnboardingAnswers, persona: Persona) => {
      setOnboardingAnswers(answers);
      setCurrentPersonaRaw(persona);
      savePersona(persona);
      markOnboardingDone();

      void startConversation({
        conversation_id: conversationId,
        user_id: userId,
        user_type: persona,
        dataset_ref: datasetRef,
        title: 'New Conversation',
        created_at: new Date().toISOString(),
        messages: [],
      });
    },
    [conversationId, userId, datasetRef],
  );

  // ── Fresh conversation ────────────────────────────────────────────
  const startFreshConversation = useCallback(() => {
    const newId = sessionStartNew();
    void startConversation({
      conversation_id: newId,
      user_id: userId,
      user_type: currentPersona,
      dataset_ref: datasetRef,
      title: 'New Conversation',
      created_at: new Date().toISOString(),
      messages: [],
    });
    clearPersistedMessages();
    setMessages([]);
    setHasMoreHistory(false);
  }, [userId, currentPersona, datasetRef]);

  // ── Login ────────────────────────────────────────────────────────
  const loginUser = useCallback(async (username: string) => {
    setUserId(username);
    setUserIdState(username);
    const { listConversations } = await import('../services/mongoService');
    const convs = await listConversations(username);
    if (convs && convs.length > 0) {
      if (convs[0].dataset_ref) setDatasetRef(convs[0].dataset_ref);
      localStorage.setItem('t2d_conv_id', convs[0].conversation_id);
    } else {
      const newId = sessionStartNew();
      await startConversation({
        conversation_id: newId,
        user_id: username,
        user_type: currentPersona,
        dataset_ref: datasetRef,
        title: 'New Conversation',
        created_at: new Date().toISOString(),
        messages: [],
      });
    }
    clearPersistedMessages();
    window.location.reload();
  }, [currentPersona, datasetRef]);

  // ── Logout ────────────────────────────────────────────────────────
  const logoutUser = useCallback(() => {
    clearSession();
    window.location.reload();
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentPersona, setCurrentPersona, switchPersona,
        messages, addMessage, updateMessage,
        isLoading, setIsLoading,
        appView, setAppView,
        completeOnboarding,
        onboardingAnswers, setOnboardingAnswers,
        voiceMode, setVoiceMode,
        userId, conversationId, sessionId,
        datasetRef, setDatasetRef,
        isRestoring, hasMoreHistory, loadMoreHistory,
        startFreshConversation, loginUser, logoutUser,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};

// ================================================================
// INTERNAL HELPERS
// ================================================================

async function persistMsg(
  m: ChatMessage,
  userId: string,
  conversationId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await saveMessage(conversationId, userId, {
    message_id: m.id,
    role: m.sender === 'user' ? 'user' : 'assistant',
    user_query: m.rawQuery ?? m.text ?? '',
    query_type: m.rawInsight?.query_type ?? (m.sender === 'ai' ? ['Conversational'] : ['Unknown']),
    ml_output: (m.rawInsight as any) ?? {},
    simplified_response: m.response?.ttsHeadline ?? m.text ?? '',
    timestamp: now,
  });
}
