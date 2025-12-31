import { app, ipcMain, shell, BrowserWindow } from 'electron';
import { IIpcHandlerDeps } from './main';
import { IPC_EVENTS, API_BASE_URL } from '../shared/constants';
import { AppMode } from '../shared/api';
import { AuthStorage } from './auth.storage';
import { AppStorage } from './app.storage';
import axios from 'axios';
import WebSocket from 'ws';
import { AudioCapture } from './audio-capture';

// Live session state
let liveSocket: WebSocket | null = null;
let audioCapture: AudioCapture | null = null;

function waitForMessage(ws: WebSocket, type: string, timeoutMs = 10000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Timeout waiting for message type: ${type}`));
    }, timeoutMs);

    const handler = (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === type) {
          clearTimeout(timeout);
          ws.off('message', handler);
          resolve(message);
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.on('message', handler);
  });
}

export function initializeIpcHandlers(deps: IIpcHandlerDeps): void {
  console.log('Initializing IPC handlers');

  const authStorage = AuthStorage.getInstance();
  const appStorage = AppStorage.getInstance();

  ipcMain.handle(IPC_EVENTS.TOOLTIP.MOUSE_ENTER, () => {
    // Disable click-through when mouse enters interactive area
    const mainWindow = deps.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(false);
    }
  });

  ipcMain.handle(IPC_EVENTS.TOOLTIP.MOUSE_LEAVE, () => {
    // Re-enable click-through when mouse leaves interactive area
    const mainWindow = deps.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  });

  ipcMain.handle(IPC_EVENTS.TOOLTIP.CLOSE_CLICK, () => {
    console.log('Tooltip close button clicked - closing application');
    app.quit();
  });

  ipcMain.handle(IPC_EVENTS.QUEUE.LOADED_NO_SCREENSHOTS, () => {
    console.log('Queue page loaded with no screenshots');
    deps.applyQueueWindowBehavior();
  });

  ipcMain.handle(
    IPC_EVENTS.QUEUE.LOADED_WITH_SCREENSHOTS,
    (_event, screenshotCount) => {
      console.log('Queue page loaded with screenshots:', screenshotCount);
      deps.applyQueueWindowBehavior();
    },
  );

  // Screenshot queue handlers
  ipcMain.handle('get-screenshot-queue', () => {
    return deps.getScreenshotQueue();
  });

  ipcMain.handle('delete-screenshot', async (_event, path: string) => {
    return deps.deleteScreenshot(path);
  });

  ipcMain.handle('clear-all-screenshots', async () => {
    return deps.clearAllScreenshots();
  });

  ipcMain.handle('get-image-preview', async (_event, path: string) => {
    return deps.getImagePreview(path);
  });

  // Window dimension handlers
  ipcMain.handle(
    'update-content-dimensions',
    (
      _event,
      {
        width,
        height,
        source,
      }: { width: number; height: number; source: string },
    ) => {
      // TODO: issue - chain called while window is idle at start
      console.log(
        'Received content dimensions - width:',
        width,
        'height:',
        height,
        'source:',
        source,
      );

      if (width && height) {
        deps.setWindowDimensions(width, height, source);
      }
    },
  );

  ipcMain.handle(
    'set-window-dimensions',
    (_event, width: number, height: number, source: string) => {
      deps.setWindowDimensions(width, height, source);
    },
  );

  // Screenshot management handlers
  ipcMain.handle('get-screenshots', async () => {
    try {
      const queue = deps.getScreenshotQueue();

      return await Promise.all(
        queue.map(async (path) => ({
          path,
          preview: await deps.getImagePreview(path),
        })),
      );
    } catch (error) {
      console.error('Error getting screenshots:', error);

      throw error;
    }
  });

  // Screenshot trigger handlers
  ipcMain.handle('trigger-screenshot', async () => {
    const mainWindow = deps.getMainWindow();
    if (mainWindow) {
      try {
        const screenshotPath = await deps.takeScreenshot();
        const preview = await deps.getImagePreview(screenshotPath);
        mainWindow.webContents.send('screenshot-taken', {
          path: screenshotPath,
          preview,
        });

        return { success: true };
      } catch (error) {
        console.error('Error triggering screenshot:', error);

        return { error: 'Failed to trigger screenshot' };
      }
    }

    return { error: 'No main window available' };
  });

  ipcMain.handle('take-screenshot', async () => {
    try {
      const screenshotPath = await deps.takeScreenshot();
      const preview = await deps.getImagePreview(screenshotPath);

      return { path: screenshotPath, preview };
    } catch (error) {
      console.error('Error taking screenshot:', error);

      return { error: 'Failed to take screenshot' };
    }
  });

  ipcMain.handle('open-external-url', (_event, url: string) => {
    // Security: Only allow http and https URLs to prevent local file execution
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        console.error('Blocked non-http(s) URL:', url);
        return;
      }
      shell.openExternal(url).catch(console.error);
    } catch (e) {
      console.error('Invalid URL:', url);
    }
  });

  ipcMain.handle('open-settings-portal', () => {
    // Settings are local in self-hosted mode
    console.log('Settings portal requested - using local settings');
  });

  ipcMain.handle('open-subscription-portal', async () => {
    try {
      // Self-hosted mode - no subscription needed
      console.log('Subscription portal requested - self-hosted mode');

      return { success: true };
    } catch (error) {
      console.error('Error opening checkout page:', error);

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to open checkout page',
      };
    }
  });

  // Window management handlers
  ipcMain.handle('toggle-window', () => {
    try {
      deps.toggleMainWindow();

      return { success: true };
    } catch (error) {
      console.error('Error toggling window:', error);

      return { error: 'Failed to toggle window' };
    }
  });

  ipcMain.handle('reset-queues', () => {
    try {
      deps.clearQueues();

      return { success: true };
    } catch (error) {
      console.error('Error resetting queues:', error);

      return { error: 'Failed to reset queues' };
    }
  });

  // Reset handlers
  ipcMain.handle('trigger-reset', async () => {
    try {
      // First cancel any ongoing requests
      deps.processingHelper?.cancelOngoingRequests();

      // Clear all queues immediately
      deps.clearQueues();

      // Clear all conversations in backend
      try {
        await axios.delete(`${API_BASE_URL}/conversations`);
        console.log('Cleared all backend conversations');
      } catch (error) {
        console.error('Failed to clear backend conversations:', error);
      }

      // Reset view to queue
      deps.setView('queue');

      // Get main window and send reset events
      const mainWindow = deps.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('reset-view');
      }

      return { success: true };
    } catch (error) {
      console.error('Error triggering reset:', error);

      return { error: 'Failed to trigger reset' };
    }
  });

  // Window movement handlers
  ipcMain.handle('trigger-move-left', () => {
    try {
      deps.moveWindowLeft();

      return { success: true };
    } catch (error) {
      console.error('Error moving window left:', error);

      return { error: 'Failed to move window left' };
    }
  });

  ipcMain.handle('trigger-move-right', () => {
    try {
      deps.moveWindowRight();

      return { success: true };
    } catch (error) {
      console.error('Error moving window right:', error);

      return { error: 'Failed to move window right' };
    }
  });

  ipcMain.handle('trigger-move-up', () => {
    try {
      deps.moveWindowUp();

      return { success: true };
    } catch (error) {
      console.error('Error moving window up:', error);

      return { error: 'Failed to move window up' };
    }
  });

  ipcMain.handle('trigger-move-down', () => {
    try {
      deps.moveWindowDown();

      return { success: true };
    } catch (error) {
      console.error('Error moving window down:', error);

      return { error: 'Failed to move window down' };
    }
  });

  // Auth token handlers
  ipcMain.handle(
    'auth-set-token',
    (_event, token: string, expiryTimestamp?: number) => {
      try {
        authStorage.setAuthToken(token, expiryTimestamp);

        return { success: true };
      } catch (error) {
        console.error('Error setting auth token:', error);

        return { error: 'Failed to set auth token' };
      }
    },
  );

  ipcMain.handle('auth-get-token', () => {
    try {
      const token = authStorage.getAuthToken();

      return { success: true, token };
    } catch (error) {
      console.error('Error getting auth token:', error);

      return { error: 'Failed to get auth token' };
    }
  });

  ipcMain.handle('auth-clear-token', () => {
    try {
      authStorage.clearAuthToken();

      return { success: true };
    } catch (error) {
      console.error('Error clearing auth token:', error);

      return { error: 'Failed to clear auth token' };
    }
  });

  ipcMain.handle('auth-is-authenticated', () => {
    try {
      const isAuthenticated = authStorage.isAuthenticated();

      return { success: true, isAuthenticated };
    } catch (error) {
      console.error('Error checking authentication:', error);

      return { error: 'Failed to check authentication' };
    }
  });

  ipcMain.handle('auth-set-last-used-email', (_event, email: string) => {
    try {
      authStorage.setLastUsedEmail(email);

      return { success: true };
    } catch (error) {
      console.error('Error setting last used email:', error);

      return { error: 'Failed to set last used email' };
    }
  });

  ipcMain.handle('auth-get-last-used-email', () => {
    try {
      const email = authStorage.getLastUsedEmail();

      return { success: true, email };
    } catch (error) {
      console.error('Error getting last used email:', error);

      return { error: 'Failed to get last used email' };
    }
  });

  ipcMain.handle(IPC_EVENTS.APP_MODE.CHANGE, (_event, appMode: string) => {
    try {
      console.log('App mode changed to:', appMode);

      if (Object.values(AppMode).includes(appMode as AppMode)) {
        deps.setAppMode(appMode as AppMode);

        appStorage.setAppMode(appMode as AppMode);
        console.log('App mode saved to storage:', appMode);

        const mainWindow = deps.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          const currentView = deps.getView();
          if (currentView === 'queue') {
            deps.applyQueueWindowBehavior();
          }
        }
      } else {
        return { error: 'Invalid app mode' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error changing app mode:', error);

      return { error: 'Failed to change app mode' };
    }
  });

  ipcMain.handle('get-app-mode', () => {
    try {
      const appMode = deps.getAppMode();
      console.log('Getting app mode:', appMode);

      return { success: true, appMode };
    } catch (error) {
      console.error('Error getting app mode:', error);

      return { error: 'Failed to get app mode' };
    }
  });

  // Clipboard handlers
  ipcMain.handle('write-text', async (_event, text: string) => {
    try {
      return await deps.writeText(text);
    } catch (error) {
      console.error('Error writing text to clipboard:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to copy text',
      };
    }
  });

  // Copy and refresh window handlers
  ipcMain.handle(
    'copy-and-refresh-window',
    async (_event, text: string, waitDuration?: number) => {
      try {
        return await deps.copyAndRefreshWindow(text, waitDuration);
      } catch (error) {
        console.error('Error in copy and refresh window:', error);

        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to copy and refresh window',
        };
      }
    },
  );

  // Voice processing handler
  ipcMain.handle(
    'process-voice',
    async (
      _event,
      data: {
        audio?: string;
        images?: string[];
        text?: string;
        conversation_id?: string;
        conversation_history?: Array<{ role: string; content: string }>;
      },
    ) => {
      const mainWindow = deps.getMainWindow();

      try {
        console.log('Processing voice request...');

        // Emit start event to switch view
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('initial-start');
        }

        // Build request body - only include fields that have values
        const requestBody: {
          audio?: string;
          images: string[];
          text?: string;
          conversation_id?: string;
          conversation_history?: Array<{ role: string; content: string }>;
        } = {
          images: data.images || [],
        };
        if (data.audio) {
          requestBody.audio = data.audio;
        }
        if (data.text) {
          requestBody.text = data.text;
        }
        if (data.conversation_id) {
          requestBody.conversation_id = data.conversation_id;
        }
        if (data.conversation_history && data.conversation_history.length > 0) {
          requestBody.conversation_history = data.conversation_history;
        }

        const response = await axios.post(
          `${API_BASE_URL}/voice`,
          requestBody,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 120000,
          },
        );

        console.log('Voice response received');

        // Emit solution success to display result
        if (mainWindow && !mainWindow.isDestroyed()) {
          // If there's code, show it in code block with response as thoughts
          // If there's no code, show response as thoughts only (rendered as markdown)
          const hasCode = !!response.data.code;
          const solutionData = {
            code: hasCode ? response.data.code : null,
            thoughts: [response.data.response || 'Voice query processed'],
            time_complexity: hasCode ? 'N/A' : null,
            space_complexity: hasCode ? 'N/A' : null,
            problem_statement: 'Voice Query',
            conversation_id: response.data.conversation_id,
          };
          mainWindow.webContents.send('solution-success', solutionData);
        }

        return {
          success: true,
          response: response.data.response,
          code: response.data.code,
          conversation_id: response.data.conversation_id,
        };
      } catch (error) {
        console.error('Error processing voice:', error);

        // Emit error event
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(
            'solution-error',
            error instanceof Error
              ? error.message
              : 'Failed to process voice request',
          );
        }

        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to process voice request',
        };
      }
    },
  );

  // Assistant query handler (unified assistant mode)
  ipcMain.handle(
    'query-assistant',
    async (
      _event,
      data: {
        text?: string;
        audio?: string;
        images?: string[];
        previousInteractionId?: string;
        enableWebSearch?: boolean;
        enableUrlContext?: boolean;
        enablePersonalContext?: boolean;
      },
    ) => {
      try {
        console.log('Processing assistant query...');

        // Build request body
        const requestBody: {
          text?: string;
          audio?: string;
          images?: string[];
          previous_interaction_id?: string;
          enable_web_search?: boolean;
          enable_url_context?: boolean;
          enable_personal_context?: boolean;
        } = {};

        if (data.text) {
          requestBody.text = data.text;
        }
        if (data.audio) {
          requestBody.audio = data.audio;
        }
        if (data.images && data.images.length > 0) {
          requestBody.images = data.images;
        }
        if (data.previousInteractionId) {
          requestBody.previous_interaction_id = data.previousInteractionId;
        }
        if (data.enableWebSearch !== undefined) {
          requestBody.enable_web_search = data.enableWebSearch;
        }
        if (data.enableUrlContext !== undefined) {
          requestBody.enable_url_context = data.enableUrlContext;
        }
        if (data.enablePersonalContext !== undefined) {
          requestBody.enable_personal_context = data.enablePersonalContext;
        }

        const response = await axios.post(
          `${API_BASE_URL}/assistant/query`,
          requestBody,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 120000,
          },
        );

        console.log('Assistant query response received');

        return {
          success: true,
          response: response.data.response,
          sources: response.data.sources,
          contextFilesUsed: response.data.context_files_used,
          interactionId: response.data.interaction_id,
        };
      } catch (error) {
        console.error('Error processing assistant query:', error);

        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to process assistant query',
        };
      }
    },
  );

  // Assistant streaming query handler
  ipcMain.handle(
    'query-assistant-stream',
    async (
      event,
      data: {
        text?: string;
        audio?: string;
        images?: string[];
        previousInteractionId?: string;
        enableWebSearch?: boolean;
        enableUrlContext?: boolean;
        enablePersonalContext?: boolean;
      },
    ) => {
      try {
        console.log('Processing assistant streaming query...');

        const requestBody: {
          text?: string;
          audio?: string;
          images?: string[];
          previous_interaction_id?: string;
          enable_web_search?: boolean;
          enable_url_context?: boolean;
          enable_personal_context?: boolean;
        } = {};

        if (data.text) requestBody.text = data.text;
        if (data.audio) requestBody.audio = data.audio;
        if (data.images && data.images.length > 0) requestBody.images = data.images;
        if (data.previousInteractionId) requestBody.previous_interaction_id = data.previousInteractionId;
        if (data.enableWebSearch !== undefined) requestBody.enable_web_search = data.enableWebSearch;
        if (data.enableUrlContext !== undefined) requestBody.enable_url_context = data.enableUrlContext;
        if (data.enablePersonalContext !== undefined) requestBody.enable_personal_context = data.enablePersonalContext;

        // Use fetch for SSE streaming
        const response = await fetch(`${API_BASE_URL}/assistant/query/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        // Helper to safely send events (checks if sender is still valid)
        const safeSend = (channel: string, data: unknown): boolean => {
          try {
            if (event.sender.isDestroyed()) {
              console.log('Sender destroyed, stopping stream');
              return false;
            }
            event.sender.send(channel, data);
            return true;
          } catch (e) {
            console.warn('Failed to send to renderer:', e);
            return false;
          }
        };

        // Return immediately to indicate streaming started
        // The actual data will be sent via events
        (async () => {
          try {
            while (true) {
              // Check if sender is still valid before reading
              if (event.sender.isDestroyed()) {
                console.log('Sender destroyed, cancelling stream');
                await reader.cancel();
                break;
              }

              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6);
                  try {
                    const chunk = JSON.parse(jsonStr);
                    // Send chunk to renderer, stop if sender is gone
                    if (!safeSend('assistant-stream-chunk', chunk)) {
                      await reader.cancel();
                      return;
                    }
                  } catch (e) {
                    console.error('Failed to parse SSE chunk:', e);
                  }
                }
              }
            }
          } catch (e) {
            console.error('Streaming error:', e);
            safeSend('assistant-stream-chunk', {
              type: 'error',
              content: e instanceof Error ? e.message : 'Stream error',
            });
          }
        })();

        return { success: true };
      } catch (error) {
        console.error('Error starting assistant stream:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start stream',
        };
      }
    },
  );

  // =============================================================================
  // LIVE SESSION HANDLERS
  // =============================================================================

  // Start live listening session
  ipcMain.handle('start-live-session', async () => {
    try {
      // Close existing session if any
      if (liveSocket) {
        liveSocket.close();
        liveSocket = null;
      }
      if (audioCapture) {
        audioCapture.stop();
        audioCapture = null;
      }

      // Connect to Python backend WebSocket
      liveSocket = new WebSocket('ws://localhost:3000/live/stream');

      await new Promise<void>((resolve, reject) => {
        liveSocket!.onopen = () => resolve();
        liveSocket!.onerror = (err) => reject(err);
      });

      // Wait for ready confirmation from backend
      const ready = await waitForMessage(liveSocket, 'ready');
      console.log('[IPC] Live session ready:', ready.session_id);

      // Start audio capture
      audioCapture = new AudioCapture();
      audioCapture.onAudioData((pcmData: Buffer) => {
        if (liveSocket?.readyState === WebSocket.OPEN) {
          liveSocket.send(pcmData);
        }
      });
      await audioCapture.start();

      // Forward responses to renderer
      liveSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          if (data.type === 'response') {
            const mainWindow = BrowserWindow.getAllWindows()[0];
            mainWindow?.webContents.send('live-response', data);
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      liveSocket.onclose = () => {
        console.log('[IPC] Live WebSocket closed');
        audioCapture?.stop();
        audioCapture = null;
        liveSocket = null;
      };

      return { success: true, sessionId: ready.session_id };
    } catch (error) {
      console.error('[IPC] Failed to start live session:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Stop live listening session
  ipcMain.handle('stop-live-session', async () => {
    try {
      audioCapture?.stop();
      audioCapture = null;
      liveSocket?.close();
      liveSocket = null;
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Send text while in live mode
  ipcMain.handle('send-live-text', async (_, text: string) => {
    if (liveSocket?.readyState === WebSocket.OPEN) {
      liveSocket.send(JSON.stringify({ type: 'text', content: text }));
      return { success: true };
    }
    return { success: false, error: 'Live session not active' };
  });
}
