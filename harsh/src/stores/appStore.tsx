/**
 * APP STORE — central state with full session persistence.
 *
 * Persistence strategy:
 *   - On mount: restore messages from localStorage instantly (no flicker)
 *   - On every AI message: save ChatTurn to mongoService + update UI cache
 *   - On persona save: persist to sessionService
 *   - loadMoreHistory(): scroll-back — prepend older messages
 */

import React, {
  createContext, useContext, useState, useCallback, useEffect, useRef,
} from 'react';
import type { ReactNode } from 'react';
import type {
  Persona, ChatMessage, OnboardingAnswers, NormalizedInsight, ChatTurn,
} from '../types';
import { buildResponseFromInsight, reRenderWithPersona } from '../utils/responseMapper';
import {
  getUserId, getConversationId, getSessionId,
  newMessageId, incrementTurnIndex, currentTurnIndex,
  savePersona, loadPersona, markOnboardingDone, isOnboardingDone,
  startNewConversation as sessionStartNew, setUserId, getIsLoggedIn,
  clearSession,
} from '../services/sessionService';
import {
  saveTurn, loadHistory, startConversation, persistMessages,
  loadPersistedMessages, clearPersistedMessages, extractEntities,
  buildPreviousContext,
} from '../services/mongoService';

type AppView = 'login' | 'onboarding' | 'transition' | 'chat';

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

  // Session IDs (read-only, used by PresentationShell for ML request building)
  userId: string;
  conversationId: string;
  sessionId: string;

  // History pagination (scroll-back)
  isRestoring: boolean;
  hasMoreHistory: boolean;
  loadMoreHistory: () => Promise<void>;

  // Conversation management
  startFreshConversation: () => void;
  
  // Login management
  loginUser: (username: string) => Promise<void>;
  logoutUser: () => void;
}

const AppContext = createContext<AppContextState | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // ── Session IDs (stable across renders) ─────────────────────────
  const [userId, setUserIdState] = useState(getUserId());
  const conversationId = useRef(getConversationId()).current;
  const sessionId      = useRef(getSessionId()).current;

  // ── Resolve initial persona from localStorage or default ─────────
  const resolveInitialPersona = (): Persona => {
    const saved = loadPersona();
    const valid: Persona[] = ['Beginner', 'Everyday', 'SME', 'Executive', 'Analyst', 'Compliance'];
    return (valid.includes(saved as Persona) ? saved : 'Beginner') as Persona;
  };

  // ── Initial view — skip onboarding if already done ──────────────
  const resolveInitialView = (): AppView => {
    if (!getIsLoggedIn()) return 'login';
    return isOnboardingDone() ? 'chat' : 'onboarding';
  };

  // ── State ────────────────────────────────────────────────────────
  const [currentPersona, setCurrentPersonaRaw] = useState<Persona>(resolveInitialPersona);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [appView, setAppView] = useState<AppView>(resolveInitialView);
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswers | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);

  // ── Restore messages on mount ─────────────────────────────────────
  // Step 1: instant restore from localStorage UI cache (no flicker)
  // Step 2: try to sync from backend (when VITE_CHAT_API_URL is set)
  useEffect(() => {
    if (appView !== 'chat') return;  // Don't restore during onboarding

    const cached = loadPersistedMessages();
    if (cached.length > 0) {
      setMessages(cached);
      console.log(`[appStore] Restored ${cached.length} messages from localStorage`);
    }

    // Try backend history (async, non-blocking)
    (async () => {
      setIsRestoring(true);
      try {
        const { turns, hasMore, nextCursor } = await loadHistory(conversationId);
        if (turns.length > 0) {
          // Reconstruct ChatMessage[] from ChatTurn[]
          const restoredMessages = turnsToMessages(turns);
          if (restoredMessages.length > cached.length) {
            // Backend has more — use it as truth
            setMessages(restoredMessages);
            persistMessages(restoredMessages);
            console.log(`[appStore] Restored ${restoredMessages.length} messages from backend`);
          }
          setHasMoreHistory(hasMore);
          setOldestCursor(nextCursor);
        }
      } catch (err) {
        console.warn('[appStore] History restore from backend failed, using cache:', err);
      } finally {
        setIsRestoring(false);
      }
    })();
  }, [appView]);

  // ── Persist messages to localStorage on every change ─────────────
  // This is the fast-path restore for next reload.
  const prevMessagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    if (messages.length === 0) return;
    if (messages === prevMessagesRef.current) return;
    prevMessagesRef.current = messages;
    // Debounce slightly to avoid too many writes during rapid updates
    const t = setTimeout(() => persistMessages(messages), 200);
    return () => clearTimeout(t);
  }, [messages]);

  // ── addMessage — also builds + saves ChatTurn ─────────────────────
  const addMessage = useCallback(
    (m: ChatMessage) => {
      setMessages(prev => {
        const next = [...prev, m];

        // Save to MongoDB/localStorage (non-blocking)
        void persistChatTurn(m, prev, userId, conversationId, sessionId, currentPersona);

        return next;
      });
    },
    [userId, conversationId, sessionId, currentPersona],
  );

  const updateMessage = useCallback(
    (id: string, partial: Partial<ChatMessage>) => {
      setMessages(prev => {
        const next = prev.map(msg => (msg.id === id ? { ...msg, ...partial } : msg));
        const updatedMsg = next.find(m => m.id === id);
        
        // Save to Database if an AI message has transitioned from loading to completed
        if (updatedMsg && updatedMsg.sender === 'ai' && partial.isLoading === false) {
          void persistChatTurn(updatedMsg, next, userId, conversationId, sessionId, currentPersona);
        }
        
        return next;
      });
    },
    [userId, conversationId, sessionId, currentPersona],
  );

  // ── Scroll-back: load older messages ─────────────────────────────
  const loadMoreHistory = useCallback(async () => {
    if (!hasMoreHistory || !oldestCursor) return;
    setIsRestoring(true);
    try {
      const { turns, hasMore, nextCursor } = await loadHistory(conversationId, oldestCursor);
      if (turns.length > 0) {
        const older = turnsToMessages(turns);
        setMessages(prev => [...older, ...prev]);
        setHasMoreHistory(hasMore);
        setOldestCursor(nextCursor);
      }
    } finally {
      setIsRestoring(false);
    }
  }, [conversationId, hasMoreHistory, oldestCursor]);

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
          const newResponse = updateMap.get(msg.id);
          if (!newResponse) return msg;
          const updatedRawInsight: NormalizedInsight = { ...msg.rawInsight, persona: newPersona };
          return { ...msg, response: newResponse, rawInsight: updatedRawInsight };
        });
      });
    },
    [],
  );

  const setCurrentPersona = useCallback((p: Persona) => {
    setCurrentPersonaRaw(p);
    savePersona(p);
  }, []);

  // ── Onboarding completion ────────────────────────────────────────
  const completeOnboarding = useCallback(
    (answers: OnboardingAnswers, persona: Persona) => {
      setOnboardingAnswers(answers);
      setCurrentPersonaRaw(persona);
      savePersona(persona);
      markOnboardingDone();

      // Create conversation record in MongoDB
      void startConversation({
        conversation_id: conversationId,
        user_id: userId,
        title: 'New Conversation',
        persona,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        turn_count: 0,
      });
    },
    [conversationId, userId],
  );

  // ── Start completely fresh conversation ──────────────────────────
  const startFreshConversation = useCallback(() => {
    const newId = sessionStartNew();
    
    // Create conversation record in MongoDB so listConversations can find it
    void startConversation({
      conversation_id: newId,
      user_id: userId,
      title: 'New Conversation',
      persona: currentPersona,
      created_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      turn_count: 0,
    });

    clearPersistedMessages();
    setMessages([]);
    setHasMoreHistory(false);
    setOldestCursor(null);
  }, [userId, currentPersona]);

  // ── Login User ───────────────────────────────────────────────────
  const loginUser = useCallback(async (username: string) => {
    setUserId(username);
    
    // Check if user has previous conversations and load the most recent one
    const { listConversations, startConversation } = await import('../services/mongoService');
    const convs = await listConversations(username);
    
    if (convs && convs.length > 0) {
      localStorage.setItem('t2d_conv_id', convs[0].conversation_id);
    } else {
      const newId = sessionStartNew();
      
      // Ensure we create a record for this new user so history isn't lost
      await startConversation({
        conversation_id: newId,
        user_id: username,
        title: 'New Conversation',
        persona: currentPersona,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        turn_count: 0,
      });
    }
    
    // Clear persisted UI cache so it fetches history cleanly from backend
    clearPersistedMessages();
    window.location.reload();
  }, [currentPersona]);

  // ── Logout User ──────────────────────────────────────────────────
  const logoutUser = useCallback(() => {
    clearSession();
    window.location.reload();
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentPersona,
        setCurrentPersona,
        switchPersona,
        messages,
        addMessage,
        updateMessage,
        isLoading,
        setIsLoading,
        appView,
        setAppView,
        completeOnboarding,
        onboardingAnswers,
        setOnboardingAnswers,
        voiceMode,
        setVoiceMode,
        userId,
        conversationId,
        sessionId,
        isRestoring,
        hasMoreHistory,
        loadMoreHistory,
        startFreshConversation,
        loginUser,
        logoutUser,
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

/**
 * Builds a ChatTurn from a ChatMessage and saves it.
 * Called from addMessage — fire-and-forget (void).
 */
async function persistChatTurn(
  m: ChatMessage,
  prevMessages: ChatMessage[],
  userId: string,
  conversationId: string,
  sessionId: string,
  persona: Persona,
): Promise<void> {
  const now = new Date().toISOString();
  const rawQuery = m.text ?? m.rawQuery ?? '';
  const turnIdx = incrementTurnIndex();

  // Build previous context from recent assistant turns
  const recentTurns = prevMessages
    .filter(msg => msg.sender === 'ai' && msg.rawInsight)
    .slice(-3)
    .map((msg, i): ChatTurn => ({
      user_id: userId, conversation_id: conversationId,
      session_id: sessionId, message_id: msg.id,
      turn_index: i, role: 'assistant',
      raw_user_query: msg.rawQuery ?? '',
      normalized_query: (msg.rawQuery ?? '').toLowerCase().trim(),
      detected_intent: msg.rawInsight?.query_type ?? 'Unknown',
      entities: {}, previous_context: '',
      ml_request_json: {}, ml_response_json: {},
      simplified_response: msg.response?.ttsHeadline ?? '',
      final_interpretation: msg.response?.blocks.find(b => b.type === 'insight')?.content ?? '',
      created_at: now, updated_at: now,
      metadata: {
        persona, query_type: msg.rawInsight?.query_type ?? '',
        confidence: msg.rawInsight?.confidence ?? 0,
        source: msg.rawInsight?.metadata?.source ?? '',
      },
    }));

  const previousContext = buildPreviousContext(recentTurns);

  if (m.sender === 'user') {
    const turn: ChatTurn = {
      user_id: userId, conversation_id: conversationId,
      session_id: sessionId, message_id: m.id,
      turn_index: turnIdx, role: 'user',
      raw_user_query: rawQuery,
      normalized_query: rawQuery.toLowerCase().trim(),
      detected_intent: 'Unknown',
      entities: extractEntities(rawQuery),
      previous_context: previousContext,
      ml_request_json: {
        user_id: userId, conversation_id: conversationId,
        session_id: sessionId, message_id: m.id,
        turn_index: turnIdx, raw_query: rawQuery,
        normalized_query: rawQuery.toLowerCase().trim(),
        persona, previous_context: previousContext,
      },
      ml_response_json: {},
      simplified_response: rawQuery,
      final_interpretation: '',
      created_at: now, updated_at: now,
      metadata: { persona, query_type: '', confidence: 0, source: '' },
    };
    await saveTurn(turn);
  }

  if (m.sender === 'ai' && m.rawInsight) {
    const insight = m.rawInsight;
    const response = m.response;
    const insightBlock = response?.blocks.find(b => b.type === 'insight')?.content ?? '';

    const turn: ChatTurn = {
      user_id: userId, conversation_id: conversationId,
      session_id: sessionId, message_id: m.id,
      turn_index: turnIdx, role: 'assistant',
      raw_user_query: insight.metadata.query,
      normalized_query: insight.metadata.query.toLowerCase().trim(),
      detected_intent: insight.query_type,
      entities: extractEntities(insight.metadata.query),
      previous_context: previousContext,
      ml_request_json: {
        user_id: userId, conversation_id: conversationId,
        session_id: sessionId, message_id: m.id, turn_index: turnIdx,
        raw_query: insight.metadata.query,
        normalized_query: insight.metadata.query.toLowerCase().trim(),
        intent: insight.query_type, persona,
        previous_context: previousContext,
        entities: extractEntities(insight.metadata.query),
      },
      ml_response_json: insight as unknown as Record<string, unknown>,
      simplified_response: response?.ttsHeadline ?? insight.main_summary,
      final_interpretation: insightBlock,
      created_at: now, updated_at: now,
      metadata: {
        persona,
        query_type: insight.query_type,
        confidence: insight.confidence,
        source: insight.metadata.source,
        chart_type: insight.chart.primary,
      },
    };
    await saveTurn(turn);
  } else if (m.sender === 'ai' && !m.rawInsight && m.text) {
    // Conversational text messages (Greetings, errors)
    const turn: ChatTurn = {
      user_id: userId, conversation_id: conversationId,
      session_id: sessionId, message_id: m.id,
      turn_index: turnIdx, role: 'assistant',
      raw_user_query: m.rawQuery ?? '',
      normalized_query: (m.rawQuery ?? '').toLowerCase().trim(),
      detected_intent: 'Conversational',
      entities: {}, previous_context: previousContext,
      ml_request_json: {}, ml_response_json: {},
      simplified_response: m.text,
      final_interpretation: m.text,
      created_at: now, updated_at: now,
      metadata: { persona, query_type: 'Conversational', confidence: 1, source: 'System' },
    };
    await saveTurn(turn);
  }
}

/**
 * Reconstructs a minimal ChatMessage[] from stored ChatTurn[].
 * Used for scroll-back history restoration from the backend.
 * Note: rawInsight is not stored in ChatTurn for size reasons;
 * these restored messages only show text, not interactive charts.
 * For full chart re-render, the user needs to re-query.
 */
function turnsToMessages(turns: ChatTurn[]): ChatMessage[] {
  return turns.map(turn => {
    let response: undefined | ReturnType<typeof buildResponseFromInsight>;
    let rawInsight: NormalizedInsight | undefined;

    // Reconstruct full charts and insights if available
    if (turn.role === 'assistant' && turn.ml_response_json && Object.keys(turn.ml_response_json).length > 0) {
      rawInsight = turn.ml_response_json as unknown as NormalizedInsight;
      if (rawInsight.chart && rawInsight.chart.primary) {
        response = buildResponseFromInsight(turn.metadata.persona as Persona || 'Beginner', rawInsight);
      }
    }

    return {
      id: turn.message_id,
      sender: turn.role === 'user' ? 'user' : 'ai',
      text: turn.role === 'user' 
        ? turn.raw_user_query 
        : (!response ? turn.simplified_response : undefined),
      rawQuery: turn.raw_user_query,
      response,
      rawInsight,
      isLoading: false,
    } as ChatMessage;
  });
}
