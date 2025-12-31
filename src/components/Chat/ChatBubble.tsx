import React, { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ChatMessage } from '../../contexts/ChatContext';
import ThinkingIndicator from './ThinkingIndicator';

interface ChatBubbleProps {
  message: ChatMessage;
}

// Code block with syntax highlighting and copy button
const CodeBlock: React.FC<{ language: string; children: string }> = ({ language, children }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [children]);

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-[var(--border-subtle)]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)]">
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 text-xs rounded hover:bg-[var(--surface-whisper)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {copied ? (
            <span className="text-green-400">Copied!</span>
          ) : (
            <span>Copy</span>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '12px',
          background: 'var(--surface-code)',
          fontSize: '12px',
          borderRadius: 0,
        }}
        showLineNumbers={children.split('\n').length > 5}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
};

// Sources dropdown component
const SourcesDisplay: React.FC<{ sources: string[]; contextFiles?: string[] }> = ({ sources, contextFiles }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const totalItems = sources.length + (contextFiles?.length || 0);

  if (totalItems === 0) return null;

  return (
    <div className="mt-3 pt-2 border-t border-[var(--border-whisper)]">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
        <span>
          {sources.length > 0 && `${sources.length} source${sources.length !== 1 ? 's' : ''}`}
          {sources.length > 0 && contextFiles && contextFiles.length > 0 && ' • '}
          {contextFiles && contextFiles.length > 0 && `${contextFiles.length} context file${contextFiles.length !== 1 ? 's' : ''}`}
        </span>
      </button>
      {isExpanded && (
        <div className="mt-2 space-y-1.5 pl-5 animate-in">
          {sources.map((source, idx) => (
            <a
              key={`source-${idx}`}
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-[var(--accent)] hover:underline truncate"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              🌐 {(() => { try { return new URL(source).hostname; } catch { return source; } })()}
            </a>
          ))}
          {contextFiles?.map((file, idx) => (
            <div key={`context-${idx}`} className="text-xs text-[var(--text-muted)]">
              📄 {file}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isThinking = message.status === 'thinking';
  const isStreaming = message.status === 'streaming';
  const isError = message.status === 'error';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in stagger-item`}
    >
      <div
        className={`glass-card max-w-[85%] p-3 ${
          isUser
            ? 'bg-[var(--accent)]/10 border-[var(--accent)]/20'
            : 'bg-[var(--surface-content)]'
        } ${isError ? 'border-red-500/30' : ''}`}
      >
        {/* Role indicator */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`status-dot ${
              isThinking || isStreaming
                ? 'status-dot--processing'
                : isError
                  ? 'status-dot--recording'
                  : isUser
                    ? 'status-dot--accent'
                    : 'status-dot--ready'
            }`}
          />
          <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
            {isUser ? 'You' : 'Assistant'}
          </span>
        </div>

        {/* Screenshot previews for user messages */}
        {isUser && message.screenshots && message.screenshots.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {message.screenshots.map((screenshot, idx) => (
              <div
                key={idx}
                className="w-16 h-12 rounded overflow-hidden border border-[var(--border-subtle)]"
              >
                <img
                  src={screenshot.preview}
                  alt={`Screenshot ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        {isThinking ? (
          <ThinkingIndicator />
        ) : (
          <div className="text-sm text-[var(--text-primary)] text-shadow leading-relaxed">
            {isUser ? (
              // User messages: plain text
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : isStreaming && !message.content ? (
              // Streaming but no content yet
              <ThinkingIndicator />
            ) : (
              // Assistant messages: render markdown with syntax highlighting
              <>
              <ReactMarkdown
                components={{
                  // Enhanced code block with syntax highlighting
                  code: ({ className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    const language = match ? match[1] : '';
                    const codeString = String(children).replace(/\n$/, '');
                    const isCodeBlock = className?.includes('language-') || codeString.includes('\n');

                    if (isCodeBlock) {
                      return <CodeBlock language={language}>{codeString}</CodeBlock>;
                    }
                    return (
                      <code
                        className="px-1.5 py-0.5 rounded bg-[var(--surface-code)] text-[var(--accent)] font-mono text-xs"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => <>{children}</>,
                  ul: ({ children }) => (
                    <ul className="list-none space-y-1 my-2">{children}</ul>
                  ),
                  li: ({ children }) => (
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-2 shrink-0" />
                      <span>{children}</span>
                    </li>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] hover:underline"
                      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    >
                      {children}
                    </a>
                  ),
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  strong: ({ children }) => (
                    <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>
                  ),
                  h1: ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2 first:mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2 first:mt-0">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1 first:mt-0">{children}</h3>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-[var(--accent)] pl-3 my-2 text-[var(--text-muted)] italic">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-[var(--accent)] animate-pulse ml-0.5" />
              )}
              </>
            )}
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="mt-2 text-xs text-red-400">
            Failed to send. Please try again.
          </div>
        )}

        {/* Sources and context files display */}
        {!isUser && !isThinking && !isStreaming && (
          <SourcesDisplay
            sources={message.metadata?.sources || []}
            contextFiles={message.metadata?.contextFilesUsed}
          />
        )}
      </div>
    </div>
  );
};

export default ChatBubble;
