import React from 'react';
import { Sparkles, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../../types';
import { ResponseCard } from '../ResponseCard/ResponseCard';

interface MessageBubbleProps {
  message: ChatMessage;
  onActionClick?: (text: string) => void;
  onInspect?: (message: ChatMessage) => void;
  isInspected?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onActionClick, onInspect, isInspected = false }) => {
  const { t } = useTranslation();
  const isUser = message.sender === 'user';

  return (
    <div className={`mb-2.5 flex w-full ${isUser ? 'justify-end' : 'justify-start'} ${!isUser && message.response ? 'lightning-reveal' : 'fade-in-up'}`}>
      <div className={`flex max-w-[96%] gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div
          className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
            isUser
              ? 'bg-white/[0.08] text-zinc-300'
              : 'bg-gradient-to-br from-cyan-400 to-violet-500 text-white shadow-[0_0_18px_rgba(168,85,247,0.28)]'
          }`}
        >
          {isUser ? <User size={12} /> : <Sparkles size={12} />}
        </div>

        <div className={`flex min-w-0 flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
          {isUser ? (
            <div className="rounded-[1rem] border border-violet-400/20 bg-violet-500/10 px-3.5 py-2 text-[12px] leading-relaxed text-zinc-100 shadow-[0_0_20px_rgba(168,85,247,0.08)]">
              {message.text}
            </div>
          ) : (
            <>
              {message.isLoading ? (
                <div className="flex items-center gap-2.5 rounded-[1rem] border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-zinc-400">
                  <div className="flex gap-1.5">
                    {[0, 150, 300].map((d) => (
                      <span
                        key={d}
                        className="h-1.5 w-1.5 rounded-full bg-cyan-300/70 animate-bounce"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </div>
                  <span className="text-[12px] font-medium">{t('analyzingData')}</span>
                </div>
              ) : message.response ? (
                <div className="w-full">
                  <ResponseCard
                    response={message.response}
                    onActionClick={onActionClick}
                    onInspect={() => onInspect?.(message)}
                    isInspected={isInspected}
                  />
                </div>
              ) : message.text ? (
                <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[12px] leading-relaxed text-zinc-200">
                  {message.text}
                </div>
              ) : (
                <div className="rounded-[1rem] border border-red-500/20 bg-red-500/10 px-3.5 py-2 text-[12px] text-red-200">
                  {t('somethingWrong')}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
