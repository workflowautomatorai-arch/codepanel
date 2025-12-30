import React, { useState, useCallback } from 'react';
import { useToast } from '../../contexts/toast';
import VoiceButton from '../shared/VoiceButton';
import { useVoiceRecording } from '../../hooks';

interface ConversationMessage {
  role: string;
  content: string;
}

interface ReplyInputProps {
  conversationId?: string;
  conversationHistory: ConversationMessage[];
  onNewResponse: (response: string, conversationId: string) => void;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;
}

const ReplyInput: React.FC<ReplyInputProps> = ({
  conversationId,
  conversationHistory,
  onNewResponse,
  isProcessing,
  setIsProcessing,
}) => {
  const [inputText, setInputText] = useState('');
  const { showToast } = useToast();
  const { isRecording, startRecording, stopRecording } = useVoiceRecording();

  const handleSubmit = useCallback(async () => {
    if (!inputText.trim() && !isRecording) {
      return;
    }

    setIsProcessing(true);
    showToast('Processing', 'Sending to AI...', 'neutral');

    try {
      const result = await window.electronAPI.processVoice({
        text: inputText.trim(),
        conversation_id: conversationId,
        conversation_history: conversationHistory,
      });

      if (result.success && result.response) {
        showToast('Done', 'Response received!', 'success');
        onNewResponse(result.response, result.conversation_id || '');
        setInputText('');
      } else {
        showToast('Error', result.error || 'Failed to get response', 'error');
      }
    } catch (error) {
      console.error('Reply error:', error);
      showToast('Error', 'Failed to send message', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [
    inputText,
    conversationId,
    conversationHistory,
    onNewResponse,
    setIsProcessing,
    showToast,
    isRecording,
  ]);

  const handleVoiceToggle = useCallback(async () => {
    if (isRecording) {
      const audio = await stopRecording();
      if (audio) {
        setIsProcessing(true);
        showToast('Processing', 'Sending voice to AI...', 'neutral');

        try {
          const result = await window.electronAPI.processVoice({
            audio,
            conversation_id: conversationId,
            conversation_history: conversationHistory,
          });

          if (result.success && result.response) {
            showToast('Done', 'Response received!', 'success');
            onNewResponse(result.response, result.conversation_id || '');
          } else {
            showToast(
              'Error',
              result.error || 'Failed to get response',
              'error',
            );
          }
        } catch (error) {
          console.error('Voice reply error:', error);
          showToast('Error', 'Failed to process voice', 'error');
        } finally {
          setIsProcessing(false);
        }
      }
    } else {
      await startRecording();
      showToast('Recording', 'Speak now...', 'neutral');
    }
  }, [
    isRecording,
    stopRecording,
    startRecording,
    conversationId,
    conversationHistory,
    onNewResponse,
    setIsProcessing,
    showToast,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="flex items-center gap-2 mt-3 p-2 bg-gray-900/80 backdrop-blur-sm rounded-lg"
      style={{
        // @ts-expect-error - WebkitAppRegion is a valid Electron CSS property
        WebkitAppRegion: 'no-drag',
        appRegion: 'no-drag',
      }}
    >
      <input
        type="text"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Continue the conversation..."
        disabled={isProcessing || isRecording}
        className="w-[280px] bg-transparent text-[var(--text-primary)] text-sm px-3 py-2 rounded-md border-none outline-none placeholder:text-[var(--text-muted)] disabled:opacity-50"
        style={{
          // @ts-expect-error - WebkitAppRegion is a valid Electron CSS property
          WebkitAppRegion: 'no-drag',
          appRegion: 'no-drag',
        }}
      />
      <VoiceButton
        isRecording={isRecording}
        onToggle={handleVoiceToggle}
        disabled={isProcessing}
      />
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
  );
};

export default ReplyInput;
