import React, { useState, useCallback } from 'react';
import { Screenshot } from '@shared/api.ts';
import VoiceButton from '../shared/VoiceButton';
import { useVoiceRecording } from '../../hooks';

interface ChatInputProps {
  onSendMessage: (text: string, screenshots?: Screenshot[]) => Promise<void>;
  onSendVoice: (audio: string, screenshots?: Screenshot[]) => Promise<void>;
  screenshots: Screenshot[];
  onRemoveScreenshot: (path: string) => void;
  isProcessing: boolean;
  placeholder?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onSendVoice,
  screenshots,
  onRemoveScreenshot,
  isProcessing,
  placeholder = 'Ask anything...',
}) => {
  const [inputText, setInputText] = useState('');
  const { isRecording, startRecording, stopRecording } = useVoiceRecording();

  const handleSubmit = useCallback(async () => {
    if (!inputText.trim() || isProcessing) return;

    const text = inputText.trim();
    setInputText('');
    await onSendMessage(text, screenshots.length > 0 ? screenshots : undefined);
  }, [inputText, screenshots, isProcessing, onSendMessage]);

  const handleVoiceToggle = useCallback(async () => {
    if (isRecording) {
      const audio = await stopRecording();
      if (audio) {
        await onSendVoice(audio, screenshots.length > 0 ? screenshots : undefined);
      }
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording, screenshots, onSendVoice]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="space-y-2"
      style={{
        // @ts-expect-error - WebkitAppRegion is a valid Electron CSS property
        WebkitAppRegion: 'no-drag',
        appRegion: 'no-drag',
      }}
    >
      {/* Screenshot previews */}
      {screenshots.length > 0 && (
        <div className="flex gap-2 flex-wrap px-1">
          {screenshots.map((screenshot) => (
            <div
              key={screenshot.path}
              className="relative group w-16 h-12 rounded overflow-hidden border border-[var(--border-subtle)]"
            >
              <img
                src={screenshot.preview}
                alt="Screenshot"
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => onRemoveScreenshot(screenshot.path)}
                className="absolute top-0 right-0 w-4 h-4 bg-red-500/80 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                disabled={isProcessing}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-center gap-2 p-2 bg-[var(--surface-elevated)]/80 backdrop-blur-sm rounded-lg border border-[var(--border-subtle)]">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRecording ? 'Recording...' : placeholder}
          disabled={isProcessing || isRecording}
          className="flex-1 bg-transparent text-[var(--text-primary)] text-sm px-3 py-2 rounded-md border-none outline-none placeholder:text-[var(--text-muted)] disabled:opacity-50"
          style={{
            // @ts-expect-error - WebkitAppRegion is a valid Electron CSS property
            WebkitAppRegion: 'no-drag',
            appRegion: 'no-drag',
          }}
        />

        {/* Voice button */}
        <VoiceButton
          isRecording={isRecording}
          onToggle={handleVoiceToggle}
          disabled={isProcessing}
        />

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={isProcessing || (!inputText.trim() && !isRecording)}
          className="flex items-center justify-center w-8 h-8 rounded-md transition-all duration-150 hover:bg-[var(--border-default)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text-primary)]"
          style={{
            // @ts-expect-error - WebkitAppRegion is a valid Electron CSS property
            WebkitAppRegion: 'no-drag',
            appRegion: 'no-drag',
          }}
        >
          {isProcessing ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>

      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-2 px-2">
          <div className="status-dot status-dot--recording" />
          <span className="text-xs text-[var(--text-muted)]">
            Recording... Click mic to stop
          </span>
        </div>
      )}
    </div>
  );
};

export default ChatInput;
