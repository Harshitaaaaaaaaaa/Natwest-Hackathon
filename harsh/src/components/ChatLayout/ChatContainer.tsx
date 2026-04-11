import React, { useRef, useEffect } from 'react';
import { useAppContext } from '../../stores/appStore';
import { ChatInput } from './ChatInput';
import { MessageBubble } from './MessageBubble';
import { classifyIntent } from '../../services/geminiService';
import { fetchDummyInsight } from '../../services/mockDataService';
import { buildResponse } from '../../utils/responseMapper';

export const ChatContainer: React.FC = () => {
  const { messages, addMessage, updateMessage, currentPersona, setIsLoading } = useAppContext();
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (text: string) => {
    const userMsgId = Date.now().toString();
    addMessage({ id: userMsgId, sender: 'user', text });

    const aiMsgId = (Date.now() + 1).toString();
    addMessage({ id: aiMsgId, sender: 'ai', isLoading: true });
    setIsLoading(true);

    try {
      // 1. Get Intent
      const intent = await classifyIntent(text, currentPersona);
      
      // 2. Fetch Mock Data
      const dummyData = await fetchDummyInsight(intent);

      // 3. Map Response per Persona
      const finalResponse = buildResponse(currentPersona, intent, dummyData);

      updateMessage(aiMsgId, { isLoading: false, response: finalResponse });
    } catch (err) {
      console.error(err);
      updateMessage(aiMsgId, { isLoading: false, response: undefined });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 overflow-hidden relative">
      {/* Scrollable Message Area */}
      <div className="flex-1 overflow-y-auto px-4 py-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto min-h-full flex flex-col pt-8">
          {messages.length === 0 ? (
            <div className="m-auto text-center space-y-4 max-w-lg mb-20 fade-in">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary-blue to-primary-blue-light rounded-2xl flex items-center justify-center shadow-lg shadow-primary-blue/20 mb-6">
                <span className="text-white font-bold text-2xl">DG</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Hello! I'm DataGuide.</h2>
              <p className="text-gray-500">
                I can help you analyze your business data. Switch personas on the sidebar to see how I adapt my language, charts, and depth of analysis to your needs.
              </p>
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
          <div ref={endOfMessagesRef} />
        </div>
      </div>

      {/* Input Area */}
      <ChatInput onSendMessage={handleSendMessage} />
    </div>
  );
};
