import React from 'react';
import type { ChatMessage } from '../../types';
import { User, Sparkles } from 'lucide-react';
import { ResponseCard } from '../ResponseCard/ResponseCard';

interface MessageBubbleProps {
  message: ChatMessage;
  onActionClick?: (text: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onActionClick }) => {
  const isUser = message.sender === 'user';

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-5 fade-in-up`}>
      <div className={`flex max-w-[92%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}>

        {/* Avatar */}
        <div
          className={`shrink-0 h-8 w-8 flex items-center justify-center rounded-full mt-1 ${
            isUser
              ? 'bg-slate-100 text-slate-500'
              : 'bg-gradient-to-br from-blue-500 to-violet-500 text-white shadow-md'
          }`}
        >
          {isUser ? <User size={16} /> : <Sparkles size={16} />}
        </div>

        {/* Content */}
        <div className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'} min-w-0`}>
          {isUser ? (
            <div className="glass-card-low px-5 py-3 text-slate-700 text-[15px] leading-relaxed">
              {message.text}
            </div>
          ) : (
            <>
              {message.isLoading ? (
                <div className="glass-card px-6 py-4 text-slate-500 flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {[0, 150, 300].map(d => (
                      <span
                        key={d}
                        className="w-2 h-2 rounded-full bg-blue-400/60 animate-bounce"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium">Analyzing your data...</span>
                </div>
              ) : message.response ? (
                <div className="w-full">
                  <ResponseCard response={message.response} onActionClick={onActionClick} />
                </div>
              ) : message.text ? (
                <div className="glass-card-low px-5 py-3 text-slate-700 text-[15px] leading-relaxed">
                  {message.text}
                </div>
              ) : (
                <div className="glass-card-low px-5 py-3 text-red-500 text-sm">
                  Something went wrong. Please try again.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
