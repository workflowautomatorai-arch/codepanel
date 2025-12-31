import React, { ReactNode } from 'react';

interface AssistantLayoutProps {
  chatSection?: ReactNode;
  commandSection?: ReactNode;
  className?: string;
}

export const AssistantLayout: React.FC<AssistantLayoutProps> = ({
  chatSection,
  commandSection,
  className = '',
}) => {
  return (
    <div className={`flex flex-col h-full px-4 py-3 ${className}`}>
      {/* Command bar at top - always visible */}
      {commandSection && (
        <div className="flex-shrink-0 w-full pb-3">
          {commandSection}
        </div>
      )}

      {/* Chat section - scrollable */}
      {chatSection && (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          {chatSection}
        </div>
      )}
    </div>
  );
};
