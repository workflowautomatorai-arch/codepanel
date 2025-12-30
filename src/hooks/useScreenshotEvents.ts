import { useEffect, useCallback, useRef } from 'react';

interface UseScreenshotEventsOptions {
  onScreenshotTaken?: () => void;
  onResetView?: () => void;
  refetch?: () => void | Promise<unknown>;
}

export function useScreenshotEvents(options: UseScreenshotEventsOptions = {}) {
  // Use refs to avoid stale closures while keeping stable event handlers
  const onScreenshotTakenRef = useRef(options.onScreenshotTaken);
  const onResetViewRef = useRef(options.onResetView);
  const refetchRef = useRef(options.refetch);

  // Update refs when options change
  onScreenshotTakenRef.current = options.onScreenshotTaken;
  onResetViewRef.current = options.onResetView;
  refetchRef.current = options.refetch;

  const handleScreenshotTaken = useCallback(async () => {
    onScreenshotTakenRef.current?.();
    await refetchRef.current?.();
  }, []);

  const handleResetView = useCallback(async () => {
    onResetViewRef.current?.();
    await refetchRef.current?.();
  }, []);

  useEffect(() => {
    const cleanupFunctions: (() => void)[] = [];

    // Use optional chaining for Electron API null safety
    if (options.onScreenshotTaken || options.refetch) {
      const cleanup = window.electronAPI?.onScreenshotTaken?.(handleScreenshotTaken);
      if (cleanup) cleanupFunctions.push(cleanup);
    }

    if (options.onResetView || options.refetch) {
      const cleanup = window.electronAPI?.onResetView?.(handleResetView);
      if (cleanup) cleanupFunctions.push(cleanup);
    }

    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }, [
    // Only depend on whether handlers exist, not the functions themselves
    !!options.onScreenshotTaken,
    !!options.onResetView,
    !!options.refetch,
    handleScreenshotTaken,
    handleResetView,
  ]);
}
