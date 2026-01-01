import { useState, useEffect, useCallback, useRef } from 'react';
import { useChatContext, generateMessageId } from '../contexts/ChatContext';
import { useToast } from '../contexts/toast';

interface UseLiveModeReturn {
  isLiveMode: boolean;
  isConnecting: boolean;
  toggleLiveMode: () => Promise<void>;
  sendTextInLiveMode: (text: string) => Promise<void>;
}

// Audio capture state
interface AudioCaptureState {
  systemStream: MediaStream | null;
  micStream: MediaStream | null;
  audioContext: AudioContext | null;
  processor: ScriptProcessorNode | null;
}

export function useLiveMode(): UseLiveModeReturn {
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const { addMessage } = useChatContext();
  const { showToast } = useToast();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const toggleRef = useRef<(() => void) | null>(null);
  const audioStateRef = useRef<AudioCaptureState>({
    systemStream: null,
    micStream: null,
    audioContext: null,
    processor: null,
  });

  // Start capturing system audio + microphone
  const startAudioCapture = useCallback(async () => {
    try {
      console.log('[LiveMode] Starting audio capture (system + mic)...');

      // Create audio context for processing (16kHz for Gemini)
      const audioContext = new AudioContext({ sampleRate: 16000 });

      // 1. Get system audio via desktopCapturer
      const sources = await window.electronAPI.getDesktopSources();
      if (sources.length === 0) {
        throw new Error('No screen sources available');
      }
      console.log('[LiveMode] Using screen source:', sources[0].name);

      const systemStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // @ts-ignore - Electron-specific constraint
          mandatory: {
            chromeMediaSource: 'desktop',
          },
        },
        video: {
          // @ts-ignore - Electron-specific (required for Windows)
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sources[0].id,
            minWidth: 1,
            maxWidth: 1,
            minHeight: 1,
            maxHeight: 1,
          },
        },
      });

      // Stop video track - we only need audio
      systemStream.getVideoTracks().forEach((track) => track.stop());
      console.log('[LiveMode] Got system audio track');

      // 2. Get microphone audio
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        console.log('[LiveMode] Got microphone track');
      } catch (micError) {
        console.warn('[LiveMode] Could not access microphone:', micError);
        // Continue with just system audio
      }

      // 3. Create mixer node to combine both sources
      const merger = audioContext.createChannelMerger(2);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1.0;

      // Connect system audio
      const systemSource = audioContext.createMediaStreamSource(systemStream);
      systemSource.connect(merger, 0, 0);

      // Connect microphone if available
      if (micStream) {
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(merger, 0, 1);
      }

      // Merge to mono and process
      merger.connect(gainNode);

      // Use ScriptProcessorNode to get raw PCM data
      const processor = audioContext.createScriptProcessor(4096, 2, 1);

      processor.onaudioprocess = (event) => {
        // Mix stereo (system + mic) to mono
        const left = event.inputBuffer.getChannelData(0);
        const right = event.inputBuffer.numberOfChannels > 1
          ? event.inputBuffer.getChannelData(1)
          : left;

        const pcmData = new Int16Array(left.length);
        for (let i = 0; i < left.length; i++) {
          // Mix both channels and convert to Int16
          const mixed = (left[i] + right[i]) / 2;
          const s = Math.max(-1, Math.min(1, mixed));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Send to main process
        window.electronAPI.sendLiveAudio(pcmData.buffer);
      };

      // Connect: gainNode -> processor -> destination
      gainNode.connect(processor);
      processor.connect(audioContext.destination);

      // Store state for cleanup
      audioStateRef.current = { systemStream, micStream, audioContext, processor };
      console.log('[LiveMode] Audio capture started - system audio' + (micStream ? ' + microphone' : ' only'));
    } catch (error) {
      console.error('[LiveMode] Failed to start audio capture:', error);
      throw error;
    }
  }, []);

  // Stop audio capture
  const stopAudioCapture = useCallback(() => {
    const { systemStream, micStream, audioContext, processor } = audioStateRef.current;

    if (processor) {
      processor.disconnect();
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
    }
    if (systemStream) {
      systemStream.getTracks().forEach((track) => track.stop());
    }
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
    }

    audioStateRef.current = { systemStream: null, micStream: null, audioContext: null, processor: null };
    console.log('[LiveMode] Audio capture stopped');
  }, []);

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
        // Other message types (transcript, interrupted, generation_complete)
        // are handled silently - mainly for Gemini's internal context
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
      stopAudioCapture();
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
        // First start the backend session
        const result = await window.electronAPI.startLiveSession();
        if (result.success) {
          // Then start audio capture in renderer
          await startAudioCapture();
          setIsLiveMode(true);
          showToast('Live Mode', 'Now listening to system audio...', 'neutral');
        } else {
          showToast('Error', result.error || 'Failed to start', 'error');
        }
      } catch (error) {
        console.error('[LiveMode] Failed to start:', error);
        showToast('Error', (error as Error).message || 'Failed to start audio capture', 'error');
        // Clean up if audio capture failed
        await window.electronAPI.stopLiveSession();
      } finally {
        setIsConnecting(false);
      }
    }
  }, [isLiveMode, showToast, startAudioCapture, stopAudioCapture]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioCapture();
    };
  }, [stopAudioCapture]);

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
