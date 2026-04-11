import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useAppContext } from '../../stores/appStore';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage }) => {
  const [input, setInput] = useState('');
  const { isLoading } = useAppContext();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur border-t border-gray-200 p-4">
      <div className="max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="relative flex items-end shadow-sm rounded-2xl border border-gray-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-primary-blue/50 focus-within:border-primary-blue transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your data... (e.g. 'Why did revenue drop in Q3?')"
            disabled={isLoading}
            className="w-full max-h-[120px] py-4 pl-4 pr-14 bg-transparent border-none resize-none focus:ring-0 text-gray-800 disabled:opacity-50 placeholder:text-gray-400"
            rows={1}
          />
          <div className="absolute right-2 bottom-2">
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2 rounded-xl bg-primary-blue text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors hover:bg-primary-blue-light focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary-blue"
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>
        </form>
        <div className="text-center mt-2">
          <span className="text-xs text-gray-400">Press Enter to send, Shift+Enter for new line. AI can make mistakes.</span>
        </div>
      </div>
    </div>
  );
};
