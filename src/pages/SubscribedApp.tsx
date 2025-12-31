import React, { useEffect, useRef, useState, useCallback } from 'react';
import { QueuePage, SolutionsPage } from '.';
import AssistantPage from './AssistantPage';
import { AppModeLayoutProvider } from '../layouts';
import { useToast } from '../contexts/toast';
import { SettingsProvider } from '../contexts/SettingsContext';
import {
  SolutionProvider,
  useSolutionContext,
} from '../contexts/SolutionContext';
import { ScreenshotProvider } from '../contexts/ScreenshotContext';
import { ChatProvider } from '../contexts/ChatContext';
// DragHandle removed - entire overlay is now draggable

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface SubscribedAppProps {}

const SubscribedAppContent: React.FC = () => {
  const { clearAll } = useSolutionContext();
  const [view, setView] = useState<'assistant' | 'queue' | 'solutions' | 'debug'>('assistant');
  const containerRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const dimensionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced dimension update to prevent jitter
  const updateDimensions = useCallback((delay: number = 50) => {
    // Clear any pending update
    if (dimensionTimeoutRef.current) {
      clearTimeout(dimensionTimeoutRef.current);
    }

    dimensionTimeoutRef.current = setTimeout(() => {
      if (!containerRef.current) {
        return;
      }
      const scrollHeight = containerRef.current.scrollHeight;
      const scrollWidth = containerRef.current.scrollWidth;
      const clientHeight = containerRef.current.clientHeight;
      const offsetHeight = containerRef.current.offsetHeight;

      // Use the largest height measurement + generous padding
      // Let Electron handle the max height constraint
      const contentHeight = Math.max(scrollHeight, clientHeight, offsetHeight) + 80;

      // Ensure minimum dimensions (200px minimum height)
      const height = Math.max(contentHeight, 200);
      const width = Math.max(scrollWidth, 400);

      console.log(`[updateDimensions] scroll: ${scrollHeight}, client: ${clientHeight}, offset: ${offsetHeight}, final: ${height}`);

      window.electronAPI
        ?.updateContentDimensions({ width, height, source: 'SubscribedApp' })
        .catch(console.error);
    }, delay);
  }, []);

  // Track last known height to prevent unnecessary updates
  const lastHeightRef = useRef<number>(0);

  // Smart dimension update that only fires on significant changes
  const smartUpdateDimensions = useCallback(() => {
    if (!containerRef.current) return;

    const currentHeight = containerRef.current.scrollHeight;
    const heightDiff = Math.abs(currentHeight - lastHeightRef.current);

    // Only update if height changed by more than 20px (prevents jitter from small DOM changes)
    if (heightDiff > 20) {
      lastHeightRef.current = currentHeight;
      updateDimensions(100);
    }
  }, [updateDimensions]);

  // ResizeObserver for layout changes (not triggered by typing/clicking)
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      smartUpdateDimensions();
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (dimensionTimeoutRef.current) {
        clearTimeout(dimensionTimeoutRef.current);
      }
    };
  }, [smartUpdateDimensions]);

  // Update dimensions when view changes
  useEffect(() => {
    // Small delay to ensure content is rendered
    updateDimensions(50);
    // Follow-up update to catch any late-rendering content
    const timeoutId = setTimeout(() => updateDimensions(50), 300);
    return () => clearTimeout(timeoutId);
  }, [view, updateDimensions]);

  // Scroll to top helper (with small delay to ensure content is rendered)
  const scrollToTop = () => {
    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
      }
    }, 50);
  };

  // Listen for events that might switch views or show errors
  useEffect(() => {
    const cleanupFunctions = [
      // PROCESSING_EVENTS.INITIAL_START
      window.electronAPI?.onSolutionStart?.(() => {
        setView('solutions');
        scrollToTop();
      }),
      window.electronAPI?.onSolutionSuccess?.(() => {
        // Scroll to top and update dimensions when solution is received
        scrollToTop();
        // Use multiple staggered updates to catch content as it renders
        // First update after initial render
        updateDimensions(100);
        // Second update after animations complete
        setTimeout(() => updateDimensions(50), 400);
        // Final update to catch any late-rendering content
        setTimeout(() => updateDimensions(50), 800);
      }),
      window.electronAPI?.onUnauthorized?.(() => {
        clearAll();
        setView('queue');
      }),
      window.electronAPI?.onResetView?.(() => {
        clearAll();
        setView('queue');
      }),
      window.electronAPI?.onSolutionError?.((error: string) => {
        showToast('Error', error, 'error');
      }),
    ].filter(Boolean) as (() => void)[];

    return () => cleanupFunctions.forEach((fn) => fn());
  }, [clearAll, showToast, updateDimensions]);

  // Disable click-through when in solutions view (need to scroll)
  // Enable click-through in queue view for click-through to work
  useEffect(() => {
    if (view === 'solutions' || view === 'debug') {
      // Solutions view: always interactive for scrolling
      window.electronAPI?.handleMouseEnter?.();

      return () => {
        // Re-enable click-through when leaving solutions view
        window.electronAPI?.handleMouseLeave?.();
      };
    } else {
      // Queue view: use smart click-through based on mouse position
      let isInteractive = false;

      const checkAndUpdateInteractive = (e: MouseEvent) => {
        const element = document.elementFromPoint(e.clientX, e.clientY);
        const isOverContent =
          element &&
          element !== document.body &&
          element !== document.documentElement &&
          element.closest('[data-overlay-content]') !== null;

        if (isOverContent && !isInteractive) {
          isInteractive = true;
          window.electronAPI?.handleMouseEnter?.();
        } else if (!isOverContent && isInteractive) {
          isInteractive = false;
          window.electronAPI?.handleMouseLeave?.();
        }
      };

      // Handle mouse events for click-through toggle
      const handleMouseDown = (e: MouseEvent) => {
        // Ensure we're interactive before any click
        checkAndUpdateInteractive(e);
      };

      document.addEventListener('mousemove', checkAndUpdateInteractive, true);
      document.addEventListener('mousedown', handleMouseDown, true);

      // Start with click-through disabled if mouse is already over content
      window.electronAPI?.handleMouseEnter?.();

      return () => {
        document.removeEventListener('mousemove', checkAndUpdateInteractive, true);
        document.removeEventListener('mousedown', handleMouseDown, true);
        window.electronAPI?.handleMouseLeave?.();
      };
    }
  }, [view]);

  return (
    <AppModeLayoutProvider>
      <div
        ref={containerRef}
        data-overlay-content
        className="glass-container min-h-[200px] flex flex-col overflow-visible cursor-move"
      >
        {view === 'assistant' ? (
          <div className="flex flex-col h-[600px] max-h-[85vh]">
            <AssistantPage setView={setView} />
          </div>
        ) : view === 'queue' ? (
          <QueuePage setView={setView} />
        ) : view === 'solutions' ? (
          <SolutionsPage setView={setView} />
        ) : null}
      </div>
    </AppModeLayoutProvider>
  );
};

const SubscribedApp: React.FC<SubscribedAppProps> = () => {
  return (
    <SettingsProvider>
      <ChatProvider>
        <SolutionProvider>
          <ScreenshotProvider>
            <SubscribedAppContent />
          </ScreenshotProvider>
        </SolutionProvider>
      </ChatProvider>
    </SettingsProvider>
  );
};

export default SubscribedApp;
