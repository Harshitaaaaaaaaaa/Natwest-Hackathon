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
  Persona, ChatMessage, OnboardingAnswers, MLOutputContract, DatasetSchema
} from '../types';
import { buildResponseFromInsight, reRenderWithPersona } from '../utils/responseMapper';
import {
  getUserId, getConversationId, getSessionId,
  newMessageId,
  startNewConversation as sessionStartNew, setUserId, getIsLoggedIn,
  clearSession,
} from '../services/sessionService';
import {
  saveMessage, loadHistory, startConversation, persistMessages,
  loadPersistedMessages, clearPersistedMessages,
} from '../services/mongoService';

type AppView = 'booting' | 'login' | 'upload' | 'onboarding' | 'transition' | 'chat';

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
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (v: boolean) => void;

  // Accessibility
  voiceMode: boolean;
  setVoiceMode: (v: boolean) => void;
  blindMode: boolean;
  setBlindMode: (v: boolean) => void;

  // Session IDs
  userId: string | null;
  conversationId: string;
  sessionId: string;
  datasetRef: string | null;
  setDatasetRef: (ref: string) => void;
  datasetSchema: DatasetSchema | null;
  language: string;
  setLanguage: (lang: string) => void;
  setDatasetSchema: (schema: DatasetSchema | null) => void;

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
  const [userId, setUserIdState]             = useState<string | null>(getUserId());
  const [conversationId, setConversationId]  = useState(getConversationId());
  const sessionId = useRef(getSessionId()).current;

  // ── Initial view ─────────────────────────────────────────────────
  const resolveInitialView = (): AppView => {
    if (!getIsLoggedIn()) return 'login';
    return 'booting'; // Will resolve after fetching profile
  };

  // ── State ────────────────────────────────────────────────────────
  const [currentPersona, setCurrentPersonaRaw] = useState<Persona>('Beginner');
  const [datasetRef, setDatasetRef] = useState<string | null>(null);
  const [datasetSchema, setDatasetSchema] = useState<DatasetSchema | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [appView, setAppView] = useState<AppView>(resolveInitialView);
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswers | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [blindMode, setBlindMode] = useState(false);
  const [language, setLanguage] = useState(() => localStorage.getItem('t2d_language') || 'en');
  const [isRestoring, setIsRestoring] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);

  // ── Fetch Schema when Dataset changes ─────────────────────────────
  useEffect(() => {
    if (!datasetRef) return;
    const fetchSchema = async () => {
      try {
        const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || 'http://localhost:5000';
        const res = await fetch(`${CHAT_API_URL}/api/dataset/profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset_ref: datasetRef })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.schema) setDatasetSchema(data.schema);
        }
      } catch (err) {
        console.warn('Failed to fetch dynamic dataset schema:', err);
      }
    };
    fetchSchema();
  }, [datasetRef]);

  // ── Fetch Profile on Mount ────────────────────────────────────────
  useEffect(() => {
    if (!getIsLoggedIn() || !userId) return;

    const fetchProfile = async () => {
      try {
        const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || 'http://localhost:5000';
        const res = await fetch(`${CHAT_API_URL}/api/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: userId }),
        });
        
        if (res.ok) {
          const profile = await res.json();
          if (profile.hasCompletedOnboarding) {
            setHasCompletedOnboarding(true);
            setCurrentPersonaRaw((profile.personaTier as Persona) || 'Beginner');
            if (profile.datasetRef) setDatasetRef(profile.datasetRef);
          }
          setAppView('upload');
        } else {
          setAppView('login');
        }
      } catch (err) {
        console.warn('[appStore] Profile fetch failed, falling back to chat');
        setAppView('chat');
      }
    };
    
    if (appView === 'booting') {
      fetchProfile();
    }
  }, [userId, appView]);

  // ── Restore messages on mount ─────────────────────────────────────
  useEffect(() => {
    if (appView !== 'chat') return;

    // Step 1: instant restore from localStorage UI cache
    const cached = loadPersistedMessages();
    if (cached.length > 0) {
      setMessages(cached);
    }

    // Step 2: hydrate from MongoDB (non-blocking) — restores BOTH user + assistant
    (async () => {
      setIsRestoring(true);
      try {
        const historyRes = await loadHistory(conversationId, userId ?? 'anonymous');
        const { messages: apiMsgs } = historyRes;

        if (apiMsgs && apiMsgs.length > 0) {
          // Rebuild the full interleaved message list in chronological order
          const restored: ChatMessage[] = apiMsgs
            .filter(m => m.role === 'user' || (m.role === 'assistant' && m.ml_output && Object.keys(m.ml_output).length > 0))
            .map(m => {
              if (m.role === 'user') {
                return {
                  id:       m.message_id,
                  sender:   'user' as const,
                  text:     m.user_query,
                  rawQuery: m.user_query,
                  isLoading: false,
                };
              }
              // assistant
              return {
                id:         m.message_id,
                sender:     'ai' as const,
                rawInsight: m.ml_output as MLOutputContract,
                response:   buildResponseFromInsight(currentPersona, m.ml_output as MLOutputContract),
                rawQuery:   m.user_query,
                isLoading:  false,
              };
            });
            
          // Deduplicate by ID to handle existing "dirty" history in DB
          const uniqueRestored = restored.filter((msg, index, self) =>
            index === self.findIndex((m) => m.id === msg.id)
          );

          if (uniqueRestored.length > 0) {
            setMessages(uniqueRestored);
            persistMessages(uniqueRestored);
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
  // Only persist USER messages immediately — AI messages are persisted
  // in updateMessage() once they are fully loaded (isLoading: false).
  // This prevents saving empty AI placeholders to MongoDB.
  const addMessage = useCallback(
    (m: ChatMessage) => {
      setMessages(prev => {
        if (prev.some(msg => msg.id === m.id)) return prev;
        return [...prev, m];
      });
      if (m.sender === 'user') {
        void persistMsg(m, userId, conversationId);
      }
    },
    [userId, conversationId],
  );

  // ── updateMessage ─────────────────────────────────────────────────
  // Persist AI messages only when they are fully resolved (isLoading → false)
  const updateMessage = useCallback(
    (id: string, partial: Partial<ChatMessage>) => {
      setMessages(prev => {
        const next = prev.map(msg => msg.id === id ? { ...msg, ...partial } : msg);
        const updated = next.find(m => m.id === id);
        if (updated && updated.sender === 'ai' && partial.isLoading === false && updated.rawInsight) {
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
  }, []);

  // ── Onboarding completion ─────────────────────────────────────────
  const completeOnboarding = useCallback(
    (answers: OnboardingAnswers, persona: Persona) => {
      setOnboardingAnswers(answers);
      setCurrentPersonaRaw(persona);

      void startConversation({
        conversation_id: conversationId,
        user_id: userId || 'anonymous',
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
      user_id: userId || 'anonymous',
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
  const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || 'http://localhost:5000';

  const loginUser = useCallback(async (username: string) => {
    setUserId(username);
    setUserIdState(username);

    // Step 1: Create or fetch the UserProfile from MongoDB
    let isNewUser = true;
    let savedPersona: Persona = 'Beginner';
    try {
      const profileRes = await fetch(`${CHAT_API_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        isNewUser = profile.isNewUser;
        if (!isNewUser && profile.personaTier) {
          savedPersona = profile.personaTier as Persona;
        }
      }
    } catch {
      // Backend down — treat as new user, onboarding will run locally
    }

    // Step 2: Check for existing conversations in MongoDB
    const { listConversations: listConvs } = await import('../services/mongoService');
    const convs = await listConvs(username);

    if (!isNewUser && convs && convs.length > 0) {
      // RETURNING USER — restore their last conversation
      const lastConvId = convs[0].conversation_id;
      if (convs[0].dataset_ref) setDatasetRef(convs[0].dataset_ref);
      // Write the conv_id to localStorage BEFORE the reload so getConversationId() picks it up
      localStorage.setItem('t2d_conv_id', lastConvId);
      setConversationId(lastConvId);
    } else {
      // NEW USER — clear stale state so they go through full onboarding
      clearPersistedMessages();
      const newId = sessionStartNew();
      setConversationId(newId);
      await startConversation({
        conversation_id: newId,
        user_id: username,
        user_type: 'Beginner',
        dataset_ref: null,
        title: 'New Conversation',
        created_at: new Date().toISOString(),
        messages: [],
      });
    }

    window.location.reload();
  }, []);

  // ── Logout ────────────────────────────────────────────────────────
  const logoutUser = useCallback(() => {
    clearSession();
    clearPersistedMessages(); // wipe message cache so next user starts fresh
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
        hasCompletedOnboarding, setHasCompletedOnboarding,
        voiceMode, setVoiceMode,
        blindMode, setBlindMode,
        userId, conversationId, sessionId,
        datasetRef, setDatasetRef,
        datasetSchema, setDatasetSchema,
        language, setLanguage,
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
  userId: string | null,
  conversationId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await saveMessage(conversationId, userId || 'anonymous', {
    message_id: m.id,
    role: m.sender === 'user' ? 'user' : 'assistant',
    user_query: m.rawQuery ?? m.text ?? '',
    query_type: m.rawInsight?.query_type ?? (m.sender === 'ai' ? ['Conversational'] : ['Unknown']),
    ml_output: (m.rawInsight as any) ?? {},
    simplified_response: m.response?.ttsHeadline ?? m.text ?? '',
    timestamp: now,
  });
}
