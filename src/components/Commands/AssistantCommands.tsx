import React from 'react';
import { Radio, Loader2 } from 'lucide-react';
import CommandButton from '../shared/commands/CommandButton';
import AssistantSettingsTooltip from './AssistantSettingsTooltip';

interface AssistantCommandsProps {
  onScreenshot: () => void;
  onClear: () => void;
  screenshotCount: number;
  isProcessing: boolean;
  isLiveMode?: boolean;
  isConnecting?: boolean;
  onToggleLiveMode?: () => void;
}

const AssistantCommands: React.FC<AssistantCommandsProps> = ({
  onScreenshot,
  onClear,
  screenshotCount,
  isProcessing,
  isLiveMode = false,
  isConnecting = false,
  onToggleLiveMode,
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

          {/* Live mode toggle */}
          {onToggleLiveMode && (
            <>
              <div className="h-4 w-px bg-gray-600" />
              <button
                onClick={onToggleLiveMode}
                disabled={isConnecting}
                className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
                  isLiveMode
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'hover:bg-gray-700/50 text-gray-300'
                } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isLiveMode ? 'Stop listening (Ctrl+Shift+L)' : 'Start listening (Ctrl+Shift+L)'}
              >
                {isConnecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Radio className={`h-3.5 w-3.5 ${isLiveMode ? 'text-red-400' : ''}`} />
                )}
                <span>{isLiveMode ? 'Live' : 'Listen'}</span>
              </button>

              {/* Live indicator */}
              {isLiveMode && (
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-red-400 text-[10px]">Listening</span>
                </div>
              )}
            </>
          )}
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
