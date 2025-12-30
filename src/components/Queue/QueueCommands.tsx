import React, { useState, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';
import { AppModeIndicator } from './AppModeIndicator';
import { useVoiceRecording } from '../../hooks';
import { useToast } from '../../contexts/toast';
import CommandButton from '../shared/commands/CommandButton';

interface ScreenshotPreview {
  path: string;
  preview: string;
}

type ScreenshotResult =
  | ScreenshotPreview[]
  | { success: boolean; previews: ScreenshotPreview[]; error?: string };

function extractScreenshotPreviews(result: ScreenshotResult): string[] {
  if (Array.isArray(result)) {
    return result.map((s) => s.preview);
  }
  if (result && typeof result === 'object' && 'previews' in result) {
    return result.previews.map((s) => s.preview);
  }
  return [];
}

interface QueueCommandsProps {
  screenshotCount?: number;
}

const QueueCommands: React.FC<QueueCommandsProps> = ({
  screenshotCount = 0,
}) => {
  const { isRecording, startRecording, stopRecording } = useVoiceRecording();
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState('');

  const handleTextSubmit = async () => {
    if (!textInput.trim()) {
      return;
    }

    setIsProcessing(true);
    showToast('Processing', 'Sending to AI...', 'neutral');

    try {
      const screenshots = await window.electronAPI?.getScreenshots?.();
      const images = screenshots ? extractScreenshotPreviews(screenshots as ScreenshotResult) : [];

      const result = await window.electronAPI?.processVoice?.({
        text: textInput.trim(),
        images,
      });

      if (result?.success) {
        showToast('Done', 'Response received!', 'success');
        setTextInput('');
        setShowTextInput(false);
      } else {
        showToast('Error', result?.error || 'Failed to get response', 'error');
      }
    } catch (error) {
      console.error('Text submission error:', error);
      showToast('Error', 'Failed to send message', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScreenshot = async () => {
    try {
      setIsProcessing(true);
      showToast('Capturing', 'Taking screenshot...', 'neutral');

      const screenshotResult = await window.electronAPI?.triggerScreenshot?.();

      if (!screenshotResult?.success) {
        showToast('Error', 'Failed to capture screenshot', 'error');
        setIsProcessing(false);

        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      const screenshots = await window.electronAPI?.getScreenshots?.();
      const images = screenshots ? extractScreenshotPreviews(screenshots as ScreenshotResult) : [];

      if (images.length === 0) {
        showToast('Error', 'No screenshot captured', 'error');
        setIsProcessing(false);

        return;
      }

      showToast('Analyzing', 'Sending to AI...', 'neutral');

      const result = await window.electronAPI?.processVoice?.({
        images,
        text: 'Analyze this screenshot. If it contains code, explain what it does and suggest improvements. If it contains a problem or question, provide a clear solution with code if applicable.',
      });

      if (result?.success) {
        showToast('Done', 'Analysis complete!', 'success');
      } else {
        showToast('Error', result?.error || 'Failed to analyze', 'error');
      }
    } catch (error) {
      console.error('Screenshot error:', error);
      showToast('Error', 'Failed to take screenshot', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScreenshotAndRecord = async () => {
    try {
      await window.electronAPI?.triggerScreenshot?.();
      showToast('Screenshot taken', 'Starting voice recording...', 'neutral');

      await new Promise((resolve) => setTimeout(resolve, 300));
      await startRecording();
      showToast('Recording', 'Speak now...', 'neutral');
    } catch (error) {
      console.error('Screenshot+Record error:', error);
      showToast('Error', 'Failed to start screenshot and record', 'error');
    }
  };

  const handleVoiceToggle = useCallback(async () => {
    if (isRecording) {
      const audio = await stopRecording();
      if (audio) {
        setIsProcessing(true);
        showToast('Processing', 'Sending voice to AI...', 'neutral');

        try {
          const screenshots = await window.electronAPI?.getScreenshots?.();
          const images = screenshots ? extractScreenshotPreviews(screenshots as ScreenshotResult) : [];

          const result = await window.electronAPI?.processVoice?.({
            audio,
            images,
          });

          if (result?.success) {
            showToast('Success', 'Voice processed successfully!', 'success');
          } else {
            showToast(
              'Error',
              result?.error || 'Failed to process voice',
              'error',
            );
          }
        } catch (error) {
          console.error('Voice processing error:', error);
          showToast('Error', 'Failed to process voice', 'error');
        } finally {
          setIsProcessing(false);
        }
      }
    } else {
      await startRecording();
      showToast('Recording', 'Speak now...', 'neutral');
    }
  }, [isRecording, stopRecording, startRecording, showToast]);

  useEffect(() => {
    const cleanup = window.electronAPI?.onVoiceToggle?.(() => {
      handleVoiceToggle().catch(console.error);
    });

    return () => cleanup?.();
  }, [handleVoiceToggle]);

  const handleStartOver = useCallback(() => {
    window.electronAPI?.triggerReset?.();
  }, []);

  return (
    <div className="pt-2">
      {/* Mode Indicator */}
      <div className="mb-3">
        <AppModeIndicator />
      </div>

      {/* Command Bar - matching SolutionCommands style */}
      <div className="w-fit">
        <div className="text-xs text-gray-100 bg-gray-900/80 backdrop-blur-sm rounded-lg py-2 px-4 flex items-center justify-center gap-4">
          <CommandButton
            label="Capture"
            shortcut="H"
            onClick={() => handleScreenshot().catch(console.error)}
          />

          {isRecording ? (
            <button
              onClick={() => handleVoiceToggle().catch(console.error)}
              disabled={isProcessing}
              className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1.5 bg-[var(--status-recording)]/20 text-[var(--status-recording)] border border-[var(--status-recording)]/30"
              style={{
                // @ts-expect-error - WebkitAppRegion is a valid Electron CSS property
                WebkitAppRegion: 'no-drag',
                appRegion: 'no-drag',
              }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--status-recording)] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--status-recording)]"></span>
              </span>
              <span className="leading-none text-shadow">Stop Recording</span>
            </button>
          ) : (
            <CommandButton
              label="Voice"
              shortcut="M"
              onClick={() => handleVoiceToggle().catch(console.error)}
            />
          )}

          <CommandButton
            label="Type"
            shortcut="T"
            onClick={() => setShowTextInput(!showTextInput)}
          />

          {!isRecording && (
            <CommandButton
              label="Capture+Ask"
              shortcut="A"
              onClick={() => handleScreenshotAndRecord().catch(console.error)}
            />
          )}

          {screenshotCount > 0 && (
            <>
              <CommandButton label="Solve" shortcut="↵" />
              <CommandButton
                label="Reset"
                shortcut="G"
                onClick={handleStartOver}
              />
            </>
          )}
        </div>
      </div>

      {/* Text Input Area */}
      {showTextInput && (
        <div className="mt-3 flex gap-2">
          <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg py-2 px-3 flex items-center gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleTextSubmit().catch(console.error);
                }
              }}
              placeholder="Ask anything..."
              disabled={isProcessing}
              className="bg-transparent border-none outline-none text-[var(--text-primary)] text-sm w-[250px] placeholder:text-[var(--text-muted)]"
              style={{
                // @ts-expect-error - WebkitAppRegion is a valid Electron CSS property
                WebkitAppRegion: 'no-drag',
                appRegion: 'no-drag',
              }}
              autoFocus
            />
            <button
              onClick={() => handleTextSubmit().catch(console.error)}
              disabled={isProcessing || !textInput.trim()}
              className="flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150 hover:bg-[var(--border-default)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text-primary)]"
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
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueueCommands;
