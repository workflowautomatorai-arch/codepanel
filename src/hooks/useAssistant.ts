import { useCallback, useEffect, useRef } from 'react';
import { Screenshot } from '@shared/api.ts';
import {
  useChatContext,
  ChatMessage,
  generateMessageId,
} from '../contexts/ChatContext';
import { useScreenshots } from './useScreenshots';
import { useScreenshotEvents } from './useScreenshotEvents';
import { useToast } from '../contexts/toast';

interface AssistantCapabilities {
  enableWebSearch: boolean;
  enableUrlContext: boolean;
  enablePersonalContext: boolean;
}

interface UseAssistantOptions {
  capabilities: AssistantCapabilities;
  useStreaming?: boolean;
}

interface QueryParams {
  text?: string;
  audio?: string;
}

export function useAssistant(options: UseAssistantOptions) {
  const { capabilities, useStreaming = true } = options;
  const {
    state: chatState,
    addMessage,
    updateMessage,
    setInteractionId,
    setProcessing,
    clearAll,
  } = useChatContext();

  const {
    screenshots,
    handleDeleteScreenshot,
    clearAllScreenshots,
    refetch,
  } = useScreenshots();

  // Listen for screenshot events to refetch when new screenshots are taken
  useScreenshotEvents({ refetch });

  const { showToast } = useToast();

  // Track current streaming message for the listener
  // Using a unique streamId to prevent race conditions with concurrent streams
  const streamingMessageRef = useRef<{
    id: string;
    streamId: string;
    content: string;
    screenshotPathsToClean: string[];
  } | null>(null);

  // Helper to clean up screenshots that were attached to a message
  const cleanupAttachedScreenshots = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    // Delete each screenshot by path
    for (const path of paths) {
      try {
        await window.electronAPI.deleteScreenshot(path);
      } catch (e) {
        console.warn('Failed to delete screenshot:', path, e);
      }
    }
  }, []);

  // Set up stream chunk listener
  useEffect(() => {
    if (!useStreaming) return;

    const unsubscribe = window.electronAPI.onAssistantStreamChunk((chunk) => {
      const msgRef = streamingMessageRef.current;
      if (!msgRef) return;

      if (chunk.type === 'text') {
        // Append content
        msgRef.content += chunk.content || '';
        updateMessage(msgRef.id, {
          content: msgRef.content,
          status: 'streaming',
        });
      } else if (chunk.type === 'done') {
        // Complete the message
        updateMessage(msgRef.id, {
          content: msgRef.content,
          status: 'complete',
          metadata: {
            sources: chunk.sources || [],
            contextFilesUsed: chunk.context_files_used || [],
          },
        });
        if (chunk.interaction_id) {
          setInteractionId(chunk.interaction_id);
        }
        // Clean up only the screenshots that were attached to this message
        cleanupAttachedScreenshots(msgRef.screenshotPathsToClean);
        streamingMessageRef.current = null;
        setProcessing(false);
      } else if (chunk.type === 'error') {
        updateMessage(msgRef.id, {
          content: chunk.content || 'An error occurred',
          status: 'error',
        });
        // Also clean up screenshots on error (they were already "used")
        cleanupAttachedScreenshots(msgRef.screenshotPathsToClean);
        streamingMessageRef.current = null;
        setProcessing(false);
        showToast('Error', chunk.content || 'Stream error', 'error');
      }
    });

    return unsubscribe;
  }, [useStreaming, updateMessage, setInteractionId, setProcessing, cleanupAttachedScreenshots, showToast]);

  // Shared query logic for both text and voice messages
  const sendQuery = useCallback(
    async (
      params: QueryParams,
      userMessageContent: string,
      attachedScreenshots?: Screenshot[],
      errorContext: string = 'message'
    ) => {
      // Create user message
      const userMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'user',
        content: userMessageContent,
        screenshots: attachedScreenshots,
        timestamp: Date.now(),
        status: 'complete',
      };
      addMessage(userMessage);

      // Create thinking placeholder
      const assistantMessageId = generateMessageId();
      const thinkingMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        status: 'thinking',
      };
      addMessage(thinkingMessage);
      setProcessing(true);

      try {
        // Prepare images from screenshots
        const images = attachedScreenshots?.map((s) => s.preview) || [];

        const requestParams = {
          ...params,
          images: images.length > 0 ? images : undefined,
          previousInteractionId: chatState.interactionId || undefined,
          enableWebSearch: capabilities.enableWebSearch,
          enableUrlContext: capabilities.enableUrlContext,
          enablePersonalContext: capabilities.enablePersonalContext,
        };

        if (useStreaming) {
          // Cancel any existing stream before starting a new one
          // This prevents race conditions when user sends rapid queries
          if (streamingMessageRef.current) {
            console.warn('Cancelling previous stream to start new one');
            // Mark the old message as interrupted
            updateMessage(streamingMessageRef.current.id, {
              content: streamingMessageRef.current.content || 'Message interrupted by new query',
              status: 'complete',
            });
          }

          // Generate unique stream ID and store screenshot paths (not full objects)
          const streamId = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
          const screenshotPaths = attachedScreenshots?.map(s => s.path) || [];

          // Set up ref for stream handler
          streamingMessageRef.current = {
            id: assistantMessageId,
            streamId,
            content: '',
            screenshotPathsToClean: screenshotPaths,
          };

          // Start streaming - the listener will handle updates
          const result = await window.electronAPI.queryAssistantStream(requestParams);

          if (!result.success) {
            updateMessage(assistantMessageId, {
              content: result.error || 'Failed to start stream',
              status: 'error',
            });
            streamingMessageRef.current = null;
            setProcessing(false);
            showToast('Error', result.error || 'Failed to start stream', 'error');
          }
          // Otherwise, the stream listener will handle the rest
        } else {
          // Non-streaming fallback
          const result = await window.electronAPI.queryAssistant(requestParams);
          const screenshotPaths = attachedScreenshots?.map(s => s.path) || [];

          if (result.success && result.response) {
            updateMessage(assistantMessageId, {
              content: result.response,
              status: 'complete',
              metadata: {
                sources: result.sources,
                contextFilesUsed: result.contextFilesUsed,
              },
            });

            if (result.interactionId) {
              setInteractionId(result.interactionId);
            }

            // Clean up only the screenshots that were attached
            await cleanupAttachedScreenshots(screenshotPaths);
          } else {
            updateMessage(assistantMessageId, {
              content: result.error || 'Failed to get response',
              status: 'error',
            });
            // Also clean up on error
            await cleanupAttachedScreenshots(screenshotPaths);
            showToast('Error', result.error || 'Failed to get response', 'error');
          }
          setProcessing(false);
        }
      } catch (error) {
        console.error(`Assistant ${errorContext} error:`, error);
        updateMessage(assistantMessageId, {
          content: 'An error occurred. Please try again.',
          status: 'error',
        });
        showToast('Error', `Failed to send ${errorContext}`, 'error');
        // Clean up screenshots on exception too
        if (streamingMessageRef.current) {
          await cleanupAttachedScreenshots(streamingMessageRef.current.screenshotPathsToClean);
        }
        streamingMessageRef.current = null;
        setProcessing(false);
      }
    },
    [
      chatState.interactionId,
      capabilities,
      useStreaming,
      addMessage,
      updateMessage,
      setInteractionId,
      setProcessing,
      cleanupAttachedScreenshots,
      showToast,
    ]
  );

  // Send a text message
  const sendMessage = useCallback(
    async (text: string, attachedScreenshots?: Screenshot[]) => {
      if (!text.trim()) return;
      await sendQuery({ text }, text, attachedScreenshots, 'message');
    },
    [sendQuery]
  );

  // Send a voice message
  const sendVoice = useCallback(
    async (audio: string, attachedScreenshots?: Screenshot[]) => {
      await sendQuery({ audio }, '[Voice message]', attachedScreenshots, 'voice');
    },
    [sendQuery]
  );

  // Add screenshot
  const addScreenshot = useCallback(async () => {
    try {
      await window.electronAPI.triggerScreenshot();
    } catch (error) {
      console.error('Screenshot error:', error);
      showToast('Error', 'Failed to capture screenshot', 'error');
    }
  }, [showToast]);

  // Remove screenshot
  const removeScreenshot = useCallback(
    async (path: string) => {
      const index = screenshots.findIndex((s) => s.path === path);
      if (index !== -1) {
        await handleDeleteScreenshot(index);
      } else {
        console.warn(`Screenshot with path ${path} not found`);
      }
    },
    [screenshots, handleDeleteScreenshot]
  );

  // Clear chat
  const clearChat = useCallback(() => {
    clearAll();
    clearAllScreenshots();
  }, [clearAll, clearAllScreenshots]);

  return {
    messages: chatState.messages,
    isProcessing: chatState.isProcessing,
    screenshots,
    sendMessage,
    sendVoice,
    addScreenshot,
    removeScreenshot,
    clearChat,
  };
}
