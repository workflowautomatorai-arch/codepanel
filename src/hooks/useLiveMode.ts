import { useState, useEffect, useCallback, useRef } from 'react';
import { useChatContext, generateMessageId } from '../contexts/ChatContext';
import { useToast } from '../contexts/toast';

interface UseLiveModeReturn {
  isLiveMode: boolean;
  isConnecting: boolean;
  toggleLiveMode: () => Promise<void>;
  sendTextInLiveMode: (text: string) => Promise<void>;
}

export function useLiveMode(): UseLiveModeReturn {
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const { addMessage } = useChatContext();
  const { showToast } = useToast();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const toggleRef = useRef<(() => void) | null>(null);

  // Set up response listener
  useEffect(() => {
    if (isLiveMode) {
      unsubscribeRef.current = window.electronAPI.onLiveResponse((response) => {
        if (response.type === 'response' && response.content) {
          addMessage({
            id: generateMessageId(),
            role: 'assistant',
            content: response.content,
            timestamp: Date.now(),
            status: 'complete',
          });
        }
      });
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [isLiveMode, addMessage]);

  // Toggle function
  const toggleLiveMode = useCallback(async () => {
    if (isLiveMode) {
      // Stop live mode
      const result = await window.electronAPI.stopLiveSession();
      if (result.success) {
        setIsLiveMode(false);
        showToast('Live Mode', 'Stopped listening', 'neutral');
      } else {
        showToast('Error', result.error || 'Failed to stop', 'error');
      }
    } else {
      // Start live mode
      setIsConnecting(true);
      try {
        const result = await window.electronAPI.startLiveSession();
        if (result.success) {
          setIsLiveMode(true);
          showToast('Live Mode', 'Now listening...', 'neutral');
        } else {
          showToast('Error', result.error || 'Failed to start', 'error');
        }
      } finally {
        setIsConnecting(false);
      }
    }
  }, [isLiveMode, showToast]);

  // Listen for keyboard shortcut toggle
  useEffect(() => {
    toggleRef.current = window.electronAPI.onToggleLiveMode(() => {
      toggleLiveMode();
    });

    return () => {
      if (toggleRef.current) {
        toggleRef.current();
        toggleRef.current = null;
      }
    };
  }, [toggleLiveMode]);

  // Send text in live mode
  const sendTextInLiveMode = useCallback(async (text: string) => {
    if (!isLiveMode) return;

    const result = await window.electronAPI.sendLiveText(text);
    if (!result.success) {
      showToast('Error', result.error || 'Failed to send', 'error');
    }
  }, [isLiveMode, showToast]);

  return {
    isLiveMode,
    isConnecting,
    toggleLiveMode,
    sendTextInLiveMode,
  };
}
