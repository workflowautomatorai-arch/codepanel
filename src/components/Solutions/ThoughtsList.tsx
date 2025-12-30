import React from 'react';
import ReactMarkdown from 'react-markdown';

interface ThoughtsListProps {
  thoughts: string[];
}

const ThoughtsList: React.FC<ThoughtsListProps> = ({ thoughts }) => {
  // If there's only one thought and it's long (likely full markdown response), render as markdown
  const isSingleMarkdownResponse =
    thoughts.length === 1 && thoughts[0].length > 200;

  if (isSingleMarkdownResponse) {
    return (
      <div className="prose prose-invert prose-sm max-w-none overflow-hidden animate-fade-in">
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 className="text-base font-bold text-[var(--text-primary)] mt-4 mb-2 break-words">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-sm font-bold text-[var(--text-primary)] mt-3 mb-2 break-words">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mt-2 mb-1 break-words">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="text-[var(--text-secondary)] text-sm mb-3 break-words leading-relaxed">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="list-none text-[var(--text-secondary)] text-sm mb-3 space-y-2 pl-0">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside text-[var(--text-secondary)] text-sm mb-3 space-y-2">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-[var(--text-secondary)] break-words flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-2 flex-shrink-0" />
                <span>{children}</span>
              </li>
            ),
            code: ({ className, children }) => {
              const isInline = !className;
              if (isInline) {
                return (
                  <code className="bg-[var(--surface-elevated)] px-1.5 py-0.5 rounded text-[var(--accent-light)] text-xs font-mono break-all border border-[var(--border-subtle)]">
                    {children}
                  </code>
                );
              }

              return (
                <pre className="code-block my-3">
                  <div className="code-block-header">
                    <span>code</span>
                  </div>
                  <div className="code-block-content">
                    <code className="text-emerald-400 text-xs font-mono break-all whitespace-pre-wrap">
                      {children}
                    </code>
                  </div>
                </pre>
              );
            },
            pre: ({ children }) => <>{children}</>,
            strong: ({ children }) => (
              <strong className="text-[var(--text-primary)] font-semibold">
                {children}
              </strong>
            ),
            em: ({ children }) => (
              <em className="text-[var(--text-secondary)] italic">
                {children}
              </em>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-[var(--accent)] pl-4 text-[var(--text-muted)] italic my-3 break-words">
                {children}
              </blockquote>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                className="text-[var(--accent)] hover:text-[var(--accent-light)] underline underline-offset-2 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ),
          }}
        >
          {thoughts[0]}
        </ReactMarkdown>
      </div>
    );
  }

  // Staggered bullet-point style for multiple thoughts - render each as markdown
  return (
    <div className="space-y-3">
      {thoughts.map((thought, index) => (
        <div key={index} className="stagger-item flex items-start gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-2 flex-shrink-0 glow-accent" />
          <div className="text-[var(--text-secondary)] text-sm leading-relaxed prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              components={{
                p: ({ children }) => <span>{children}</span>,
                code: ({ children }) => (
                  <code className="bg-[var(--surface-elevated)] px-1 py-0.5 rounded text-[var(--accent-light)] text-xs font-mono">
                    {children}
                  </code>
                ),
                strong: ({ children }) => (
                  <strong className="text-[var(--text-primary)] font-semibold">{children}</strong>
                ),
              }}
            >
              {thought}
            </ReactMarkdown>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ThoughtsList;
