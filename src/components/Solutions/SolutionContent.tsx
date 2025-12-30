import React from 'react';
import { ProgrammingLanguage } from '../../../shared/api';

interface SolutionContentProps {
  title: string;
  content: React.ReactNode;
  isLoading: boolean;
  currentLanguage?: ProgrammingLanguage;
  type?: 'code' | 'text';
  status?: 'ready' | 'processing' | 'success';
}

const SolutionContent: React.FC<SolutionContentProps> = ({
  title,
  content,
  isLoading,
  type = 'text',
  status = 'ready',
}) => {
  const getStatusDotClass = () => {
    if (isLoading) {
      return 'status-dot--processing';
    }
    switch (status) {
      case 'processing':
        return 'status-dot--processing';
      case 'success':
        return 'status-dot--ready';
      default:
        return 'status-dot--accent';
    }
  };

  return (
    <div className="glass-card animate-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-whisper)]">
        <div className={`status-dot ${getStatusDotClass()}`} />
        <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-wide text-shadow">
          {title}
        </h2>
        {type === 'code' && (
          <span className="ml-auto text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider text-shadow">
            code
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4 scrollable-content">
        {isLoading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="status-dot status-dot--processing" />
              <span className="text-sm text-gradient-animated font-medium text-shadow">
                Analyzing...
              </span>
            </div>
            <div className="space-y-2">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-4/5" />
              <div className="skeleton h-4 w-3/5" />
            </div>
          </div>
        ) : (
          <div
            className={`text-sm leading-relaxed text-shadow ${
              type === 'text' ? 'text-[var(--text-secondary)]' : ''
            }`}
          >
            {content}
          </div>
        )}
      </div>
    </div>
  );
};

export default SolutionContent;
