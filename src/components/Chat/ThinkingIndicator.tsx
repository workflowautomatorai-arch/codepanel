import React from 'react';

interface ThinkingIndicatorProps {
  className?: string;
}

const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({ className = '' }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="status-dot status-dot--processing" />
      <span className="text-sm text-gradient-animated font-medium text-shadow">
        Thinking...
      </span>
    </div>
  );
};

export default ThinkingIndicator;
