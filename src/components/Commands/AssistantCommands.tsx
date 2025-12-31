import React from 'react';
import CommandButton from '../shared/commands/CommandButton';
import AssistantSettingsTooltip from './AssistantSettingsTooltip';

interface AssistantCommandsProps {
  onScreenshot: () => void;
  onClear: () => void;
  screenshotCount: number;
  isProcessing: boolean;
}

const AssistantCommands: React.FC<AssistantCommandsProps> = ({
  onScreenshot,
  onClear,
  screenshotCount,
  isProcessing,
}) => {
  return (
    <div className="flex items-center justify-between">
      {/* Left side: Commands */}
      <div className="w-fit">
        <div className="text-xs text-gray-100 bg-gray-900/80 backdrop-blur-sm rounded-lg py-2 px-4 flex items-center justify-center gap-4">
          <CommandButton
            label="Screenshot"
            shortcut="H"
            onClick={onScreenshot}
            disabled={isProcessing}
          />

          {screenshotCount > 0 && (
            <span className="text-[var(--accent)] font-medium">
              {screenshotCount} attached
            </span>
          )}

          <CommandButton
            label="Clear"
            shortcut="G"
            onClick={onClear}
            disabled={isProcessing}
          />
        </div>
      </div>

      {/* Right side: Settings */}
      <div className="flex items-center gap-2">
        <AssistantSettingsTooltip />
      </div>
    </div>
  );
};

export default AssistantCommands;
