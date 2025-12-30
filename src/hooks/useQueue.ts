import { useEffect, useRef } from 'react';
import { useToast } from '../contexts/toast';
import { sendToElectron } from '../utils/electron';
import { IPC_EVENTS } from '@shared/constants.ts';
import { useScreenshots } from './useScreenshots';
import { useScreenshotEvents } from './useScreenshotEvents';

export function useQueue() {
  const { showToast } = useToast();
  const contentRef = useRef<HTMLDivElement>(null);

  const {
    screenshots,
    refetch,
    handleDeleteScreenshot: deleteScreenshot,
  } = useScreenshots();

  const handleDeleteScreenshot = async (index: number) => {
    const success = await deleteScreenshot(index);
    if (!success) {
      showToast('Error', 'Failed to delete the screenshot file', 'error');
    }
  };

  // Dimension updates are now handled centrally by SubscribedApp's ResizeObserver
  // This prevents conflicting updates and jitter when content changes

  useScreenshotEvents({ refetch });

  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI?.onSolutionError?.((error: string) => {
        showToast(
          'Processing Failed',
          'There was an error processing your screenshots.',
          'error',
        );
        console.error('Processing error:', error);
      }),
      window.electronAPI?.onProcessingNoScreenshots?.(() => {
        showToast(
          'No Screenshots',
          'There are no screenshots to process.',
          'neutral',
        );
      }),
    ].filter(Boolean) as (() => void)[];

    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }, [showToast]);

  useEffect(() => {
    if (screenshots.length === 0) {
      sendToElectron(IPC_EVENTS.QUEUE.LOADED_NO_SCREENSHOTS);
    } else {
      sendToElectron(
        IPC_EVENTS.QUEUE.LOADED_WITH_SCREENSHOTS,
        screenshots.length,
      );
    }
  }, [screenshots]);

  return {
    screenshots,
    refetch,
    handleDeleteScreenshot,
    contentRef,
  };
}
