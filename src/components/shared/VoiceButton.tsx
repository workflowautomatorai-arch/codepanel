import React from 'react';
import { Mic, Square } from 'lucide-react';

interface VoiceButtonProps {
  isRecording: boolean;
  onToggle: () => void;
  disabled?: boolean;
  showShortcut?: boolean;
}

const VoiceButton: React.FC<VoiceButtonProps> = ({
  isRecording,
  onToggle,
  disabled = false,
  showShortcut = true,
}) => {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`
        relative flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
        transition-all duration-200
        ${
          isRecording
            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
            : 'btn-secondary'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      style={{
        // @ts-expect-error - WebkitAppRegion is a valid Electron CSS property
        WebkitAppRegion: 'no-drag',
        appRegion: 'no-drag',
      }}
      title={isRecording ? 'Stop Recording' : 'Start Voice Input (⌘M)'}
    >
      {/* Recording ring effect */}
      {isRecording && (
        <span className="absolute inset-0 rounded-lg border-2 border-red-500/50 recording-active" />
      )}

      {isRecording ? (
        <>
          <div className="relative">
            <Square className="w-3.5 h-3.5 fill-current" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full status-dot--recording" />
          </div>
          <span>Stop</span>
        </>
      ) : (
        <>
          <Mic className="w-3.5 h-3.5" />
          <span>Voice</span>
          {showShortcut && <span className="kbd">M</span>}
        </>
      )}
    </button>
  );
};

export default VoiceButton;
