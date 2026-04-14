import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import type {
  Persona,
  ChatMessage,
  OnboardingAnswers,
  MLOutputContract,
  DatasetSchema,
} from '../types';
import { buildResponseFromInsight, reRenderWithPersona } from '../utils/responseMapper';
import {
  getUserId,
  getConversationId,
  getSessionId,
  startNewConversation as sessionStartNew,
  setUserId,
  getIsLoggedIn,
  clearSession,
} from '../services/sessionService';
import {
  saveMessage,
  loadHistory,
  startConversation,
  persistMessages,
  loadPersistedMessages,
  clearPersistedMessages,
} from '../services/mongoService';
import { buildApiUrl, buildEngineUrl } from '../config/api';

type AppView = 'booting' | 'login' | 'upload' | 'onboarding' | 'transition' | 'chat';
type ServiceWarmStatus = 'pending' | 'waking' | 'ready' | 'failed';

interface WarmupState {
  message: string;
  progress: number;
  backend: ServiceWarmStatus;
  engine: ServiceWarmStatus;
  canRetry: boolean;
}

interface AppContextState {
  currentPersona: Persona;
  setCurrentPersona: (p: Persona) => void;
  switchPersona: (p: Persona) => void;
  messages: ChatMessage[];
  addMessage: (m: ChatMessage) => void;
  updateMessage: (id: string, partial: Partial<ChatMessage>) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  appView: AppView;
  setAppView: (v: AppView) => void;
  completeOnboarding: (answers: OnboardingAnswers, persona: Persona) => void;
  onboardingAnswers: OnboardingAnswers | null;
  setOnboardingAnswers: (a: OnboardingAnswers) => void;
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (v: boolean) => void;
  voiceMode: boolean;
  setVoiceMode: (v: boolean) => void;
  blindMode: boolean;
  setBlindMode: (v: boolean) => void;
  userId: string | null;
  conversationId: string;
  sessionId: string;
  datasetRef: string | null;
  setDatasetRef: (ref: string) => void;
  datasetSchema: DatasetSchema | null;
  language: string;
  setLanguage: (lang: string) => void;
  setDatasetSchema: (schema: DatasetSchema | null) => void;
  isRestoring: boolean;
  hasMoreHistory: boolean;
  loadMoreHistory: () => Promise<void>;
  startFreshConversation: () => void;
  loginUser: (username: string) => Promise<void>;
  logoutUser: () => void;
  warmupState: WarmupState;
  retryWarmup: () => void;
}

const AppContext = createContext<AppContextState | undefined>(undefined);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pingService(url: string, timeoutMs = 6000): Promise<boolean> {
  if (!url) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [userId, setUserIdState] = useState<string | null>(getUserId());
  const [conversationId, setConversationId] = useState(getConversationId());
  const sessionId = useRef(getSessionId()).current;

  const [currentPersona, setCurrentPersonaRaw] = useState<Persona>('Beginner');
  const [datasetRef, setDatasetRef] = useState<string | null>(null);
  const [datasetSchema, setDatasetSchema] = useState<DatasetSchema | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [appView, setAppView] = useState<AppView>('booting');
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswers | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [blindMode, setBlindMode] = useState(false);
  const [language, setLanguage] = useState(() => localStorage.getItem('t2d_language') || 'en');
  const [isRestoring, setIsRestoring] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [warmupState, setWarmupState] = useState<WarmupState>({
    message: 'Setting things up...',
    progress: 8,
    backend: 'pending',
    engine: 'pending',
    canRetry: false,
  });

  const resolvePostWarmupView = useCallback(async () => {
    const activeUser = getUserId();
    if (!getIsLoggedIn() || !activeUser) {
      setAppView('login');
      return;
    }

    setUserIdState(activeUser);

    try {
      const res = await fetch(buildApiUrl('/api/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: activeUser }),
      });

      if (res.ok) {
        const profile = await res.json();
        if (profile.hasCompletedOnboarding) {
          setHasCompletedOnboarding(true);
          setCurrentPersonaRaw((profile.personaTier as Persona) || 'Beginner');
          if (profile.datasetRef) setDatasetRef(profile.datasetRef);
        }
        setAppView('upload');
        return;
      }

      setAppView('login');
    } catch (err) {
      console.warn('[appStore] Profile fetch failed, falling back to chat');
      setAppView('chat');
    }
  }, []);

  const runWarmup = useCallback(async () => {
    const backendHealthUrl = buildApiUrl('/health/ready');
    const engineHealthUrl = buildEngineUrl('/health');

    setAppView('booting');
    setWarmupState({
      message: 'Setting things up...',
      progress: 10,
      backend: 'waking',
      engine: engineHealthUrl ? 'pending' : 'ready',
      canRetry: false,
    });

    const warmService = async (
      key: 'backend' | 'engine',
      label: string,
      url: string,
      progressFloor: number,
      successProgress: number,
    ) => {
      if (!url) {
        setWarmupState((prev) => ({
          ...prev,
          [key]: 'ready',
          progress: Math.max(prev.progress, successProgress),
        }));
        return true;
      }

      for (let attempt = 1; attempt <= 8; attempt += 1) {
        setWarmupState((prev) => ({
          ...prev,
          [key]: 'waking',
          message: `${label} is starting up${attempt > 1 ? ` (attempt ${attempt}/8)` : '...'}`,
          progress: Math.max(prev.progress, progressFloor),
        }));

        const ok = await pingService(url);
        if (ok) {
          setWarmupState((prev) => ({
            ...prev,
            [key]: 'ready',
            message: `${label} is ready.`,
            progress: Math.max(prev.progress, successProgress),
          }));
          return true;
        }

        await sleep(2000);
      }

      setWarmupState((prev) => ({
        ...prev,
        [key]: 'failed',
        message: `${label} is still waking up. Please retry setup.`,
        canRetry: true,
      }));
      return false;
    };

    const backendReady = await warmService('backend', 'Backend', backendHealthUrl, 18, 48);
    const engineReady = await warmService('engine', 'Execution engine', engineHealthUrl, 56, 88);

    if (!backendReady || !engineReady) {
      setWarmupState((prev) => ({
        ...prev,
        progress: Math.max(prev.progress, 88),
        canRetry: true,
      }));
      return;
    }

    setWarmupState((prev) => ({
      ...prev,
      message: 'Everything is ready. Opening Bolt...',
      progress: 100,
      canRetry: false,
    }));

    await sleep(500);
    await resolvePostWarmupView();
  }, [resolvePostWarmupView]);

  const retryWarmup = useCallback(() => {
    void runWarmup();
  }, [runWarmup]);

  useEffect(() => {
    void runWarmup();
  }, [runWarmup]);

  useEffect(() => {
    if (!datasetRef) return;
    const fetchSchema = async () => {
      try {
        const res = await fetch(buildApiUrl('/api/dataset/profile'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset_ref: datasetRef }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.schema) setDatasetSchema(data.schema);
        }
      } catch (err) {
        console.warn('Failed to fetch dynamic dataset schema:', err);
      }
    };
    void fetchSchema();
  }, [datasetRef]);

  useEffect(() => {
    if (appView !== 'chat') return;

    const cached = loadPersistedMessages();
    if (cached.length > 0) {
      setMessages(cached);
    }

    void (async () => {
      setIsRestoring(true);
      try {
        const historyRes = await loadHistory(conversationId, userId ?? 'anonymous');
        const { messages: apiMsgs } = historyRes;

        if (apiMsgs && apiMsgs.length > 0) {
          const restored: ChatMessage[] = apiMsgs
            .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.ml_output && Object.keys(m.ml_output).length > 0))
            .map((m) => {
              if (m.role === 'user') {
                return {
                  id: m.message_id,
                  sender: 'user' as const,
                  text: m.user_query,
                  rawQuery: m.user_query,
                  isLoading: false,
                };
              }

              return {
                id: m.message_id,
                sender: 'ai' as const,
                rawInsight: m.ml_output as MLOutputContract,
                response: buildResponseFromInsight(currentPersona, m.ml_output as MLOutputContract),
                rawQuery: m.user_query,
                isLoading: false,
              };
            });

          const uniqueRestored = restored.filter((msg, index, self) =>
            index === self.findIndex((m) => m.id === msg.id),
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
  }, [appView, conversationId, currentPersona, userId]);

  const prevMessagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    if (messages.length === 0) return;
    if (messages === prevMessagesRef.current) return;
    prevMessagesRef.current = messages;
    const timeout = setTimeout(() => persistMessages(messages), 200);
    return () => clearTimeout(timeout);
  }, [messages]);

  const addMessage = useCallback(
    (m: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((msg) => msg.id === m.id)) return prev;
        return [...prev, m];
      });
      if (m.sender === 'user') {
        void persistMsg(m, userId, conversationId);
      }
    },
    [conversationId, userId],
  );

  const updateMessage = useCallback(
    (id: string, partial: Partial<ChatMessage>) => {
      setMessages((prev) => {
        const next = prev.map((msg) => (msg.id === id ? { ...msg, ...partial } : msg));
        const updated = next.find((m) => m.id === id);
        if (updated && updated.sender === 'ai' && partial.isLoading === false && updated.rawInsight) {
          void persistMsg(updated, userId, conversationId);
        }
        return next;
      });
    },
    [conversationId, userId],
  );

  const loadMoreHistory = useCallback(async () => {
    setHasMoreHistory(false);
  }, []);

  const switchPersona = useCallback((newPersona: Persona) => {
    setCurrentPersonaRaw(newPersona);

    setMessages((prev) => {
      const updates = reRenderWithPersona(prev, newPersona);
      const updateMap = new Map(updates.map((u) => [u.id, u.response]));
      return prev.map((msg) => {
        if (msg.sender !== 'ai' || !msg.rawInsight) return msg;
        const newResp = updateMap.get(msg.id);
        if (!newResp) return msg;
        return { ...msg, response: newResp };
      });
    });
  }, []);

  const setCurrentPersona = useCallback((p: Persona) => {
    setCurrentPersonaRaw(p);
  }, []);

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
    [conversationId, datasetRef, userId],
  );

  const startFreshConversation = useCallback(() => {
    const newId = sessionStartNew();
    setConversationId(newId);
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
  }, [currentPersona, datasetRef, userId]);

  const loginUser = useCallback(async (username: string) => {
    setUserId(username);
    setUserIdState(username);

    let isNewUser = true;
    try {
      const profileRes = await fetch(buildApiUrl('/api/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        isNewUser = profile.isNewUser;
      }
    } catch {
      // Backend down: onboarding will fall back locally once warmup is retried.
    }

    const { listConversations } = await import('../services/mongoService');
    const convs = await listConversations(username);

    if (!isNewUser && convs && convs.length > 0) {
      const lastConvId = convs[0].conversation_id;
      if (convs[0].dataset_ref) setDatasetRef(convs[0].dataset_ref);
      localStorage.setItem('t2d_conv_id', lastConvId);
      setConversationId(lastConvId);
    } else {
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

  const logoutUser = useCallback(() => {
    clearSession();
    clearPersistedMessages();
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
        hasCompletedOnboarding,
        setHasCompletedOnboarding,
        voiceMode,
        setVoiceMode,
        blindMode,
        setBlindMode,
        userId,
        conversationId,
        sessionId,
        datasetRef,
        setDatasetRef,
        datasetSchema,
        setDatasetSchema,
        language,
        setLanguage,
        isRestoring,
        hasMoreHistory,
        loadMoreHistory,
        startFreshConversation,
        loginUser,
        logoutUser,
        warmupState,
        retryWarmup,
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
