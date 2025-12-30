import React from 'react';
import QueueCommands from '../Queue/QueueCommands';
import SolutionCommands from '../Solutions/SolutionCommands';
import { Screenshot } from '../../../shared/api';

type CommandSectionMode = 'queue' | 'solutions' | 'debug';

interface CommandSectionProps {
  mode: CommandSectionMode;
  screenshotCount?: number;
  // Solutions/Debug mode props
  isProcessing?: boolean;
  screenshots?: Screenshot[];
  className?: string;
}

export const CommandSection: React.FC<CommandSectionProps> = ({
  mode,
  screenshotCount = 0,
  isProcessing = false,
  screenshots = [],
  className = '',
}) => {
  if (mode === 'queue') {
    return (
      <div className={className}>
        <QueueCommands screenshotCount={screenshotCount} />
      </div>
    );
  }

  if (mode === 'solutions' || mode === 'debug') {
    return (
      <div className={className}>
        <SolutionCommands
          isProcessing={isProcessing}
          screenshots={screenshots}
        />
      </div>
    );
  }

  return null;
};
