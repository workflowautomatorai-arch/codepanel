import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../../contexts/ChatContext';
import ChatBubble from './ChatBubble';

interface ChatMessageListProps {
  messages: ChatMessage[];
  className?: string;
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  className = '',
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className={`flex-1 min-h-0 flex flex-col items-center justify-center py-8 ${className}`}>
        <div className="text-center space-y-3">
          <div className="status-dot status-dot--accent mx-auto" />
          <p className="text-sm text-[var(--text-muted)] text-shadow">
            Ask me anything about coding, your background, or search the web.
          </p>
          <div className="flex flex-wrap gap-2 justify-center mt-4">
            <span className="text-xs px-2 py-1 rounded-full bg-[var(--surface-whisper)] text-[var(--text-muted)]">
              "Tell me about yourself"
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-[var(--surface-whisper)] text-[var(--text-muted)]">
              "Latest Kubernetes features"
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-[var(--surface-whisper)] text-[var(--text-muted)]">
              "Debug this code"
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-scrollable
      className={`flex-1 min-h-0 overflow-y-auto space-y-3 stagger-container pr-1 ${className}`}
      style={{
        // @ts-expect-error - WebkitAppRegion is a valid Electron CSS property
        WebkitAppRegion: 'no-drag',
        appRegion: 'no-drag',
      }}
    >
      {messages.map((message) => (
        <ChatBubble key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default ChatMessageList;
