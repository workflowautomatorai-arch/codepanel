import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVoiceRecordingReturn {
  isRecording: boolean;
  audioData: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  clearAudio: () => void;
  error: string | null;
}

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [audioData, setAudioData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mountedRef = useRef(true);

  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      // Stop any active recording and release media stream
      if (mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current.stream
          .getTracks()
          .forEach((track) => track.stop());
        mediaRecorderRef.current = null;
      }
      chunksRef.current = [];
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Failed to access microphone. Please check permissions.');
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (
        !mediaRecorderRef.current ||
        mediaRecorderRef.current.state === 'inactive'
      ) {
        if (mountedRef.current) {
          setIsRecording(false);
        }
        resolve(null);

        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // Only update state if component is still mounted
          if (mountedRef.current) {
            setAudioData(base64);
            setIsRecording(false);
          }
          resolve(base64);
        };
        reader.onerror = () => {
          if (mountedRef.current) {
            setIsRecording(false);
          }
          resolve(null);
        };
        reader.readAsDataURL(blob);

        // Stop all tracks
        mediaRecorderRef.current?.stream
          .getTracks()
          .forEach((track) => track.stop());
      };

      mediaRecorderRef.current.stop();
    });
  }, []);

  const clearAudio = useCallback(() => {
    setAudioData(null);
    chunksRef.current = [];
  }, []);

  return {
    isRecording,
    audioData,
    startRecording,
    stopRecording,
    clearAudio,
    error,
  };
}
