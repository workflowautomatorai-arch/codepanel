import { useState, useEffect, useRef } from 'react';
import { SolveResponse, LeetCodeSolveResponse } from '@shared/api.ts';
import { useToast } from '../contexts/toast';
import { useScreenshots } from './useScreenshots';
import { useScreenshotEvents } from './useScreenshotEvents';
import { useSolutionContext } from '../contexts/SolutionContext';

export function useSolutions() {
  const {
    state: solutionState,
    setSolution,
    setNewSolution,
    setConversationId,
    addConversationMessage,
    clearAll,
  } = useSolutionContext();
  const contentRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const [debugProcessing, setDebugProcessing] = useState(false);
  const [solutionData, setSolutionData] = useState<string | null>(null);
  const [thoughtsData, setThoughtsData] = useState<string[] | null>(null);
  const [timeComplexityData, setTimeComplexityData] = useState<string | null>(
    null,
  );
  const [spaceComplexityData, setSpaceComplexityData] = useState<string | null>(
    null,
  );
  const [isResetting, setIsResetting] = useState(false);

  const {
    screenshots,
    handleDeleteScreenshot: deleteScreenshot,
    clearAllScreenshots,
    refetch,
  } = useScreenshots();

  const handleDeleteScreenshot = async (index: number) => {
    const success = await deleteScreenshot(index);
    if (!success) {
      showToast('Error', 'Failed to delete the screenshot', 'error');
    }
  };


  // Update local state when context solution changes
  useEffect(() => {
    if (solutionState.solution) {
      setSolutionData(solutionState.solution.code || null);
      setThoughtsData(
        'thoughts' in solutionState.solution
          ? solutionState.solution.thoughts || null
          : null,
      );
      setTimeComplexityData(
        'time_complexity' in solutionState.solution
          ? solutionState.solution.time_complexity || null
          : null,
      );
      setSpaceComplexityData(
        'space_complexity' in solutionState.solution
          ? solutionState.solution.space_complexity || null
          : null,
      );
    }
  }, [solutionState.solution]);

  // Use a ref to access the latest solution state without adding it as a dependency
  const solutionStateRef = useRef(solutionState);
  solutionStateRef.current = solutionState;

  useEffect(() => {
    // Note: Dimension updates are handled by SubscribedApp
    // No observers needed here - prevents duplicate updates and jitter

    const cleanupFunctions = [
      window.electronAPI?.onSolutionStart?.(() => {
        setSolutionData(null);
        setThoughtsData(null);
        setTimeComplexityData(null);
        setSpaceComplexityData(null);
      }),
      window.electronAPI?.onSolutionError?.((error: string) => {
        showToast('Processing Failed', error, 'error');
        // Restore previous solution data on error using ref to avoid stale closure
        const currentSolution = solutionStateRef.current.solution;
        if (currentSolution) {
          setSolutionData(currentSolution.code || null);
          setThoughtsData(
            'thoughts' in currentSolution
              ? currentSolution.thoughts || null
              : null,
          );
          setTimeComplexityData(
            'time_complexity' in currentSolution
              ? currentSolution.time_complexity || null
              : null,
          );
          setSpaceComplexityData(
            'space_complexity' in currentSolution
              ? currentSolution.space_complexity || null
              : null,
          );
        }
      }),
      window.electronAPI?.onSolutionSuccess?.(
        (
          data:
            | SolveResponse
            | (LeetCodeSolveResponse & { conversation_id?: string }),
        ) => {
          console.log('[onSolutionSuccess] Received data:', data);
          if (!data) {
            console.warn('[onSolutionSuccess] No data received');
            return;
          }
          setSolution(data);
          const code = data.code || null;
          const thoughts = 'thoughts' in data ? data.thoughts || null : null;
          console.log('[onSolutionSuccess] Setting solutionData:', code?.substring(0, 100));
          console.log('[onSolutionSuccess] Setting thoughtsData:', thoughts);
          setSolutionData(code);
          setThoughtsData(thoughts);
          setTimeComplexityData(
            'time_complexity' in data ? data.time_complexity || null : null,
          );
          setSpaceComplexityData(
            'space_complexity' in data ? data.space_complexity || null : null,
          );
          // Set conversation ID if present (for voice queries)
          if ('conversation_id' in data && data.conversation_id) {
            setConversationId(data.conversation_id);
            // Add initial assistant message to history (prefer thoughts over code for conversational context)
            const responseContent = 'thoughts' in data && data.thoughts?.[0]
              ? data.thoughts[0]
              : data.code || '';
            addConversationMessage({
              role: 'assistant',
              content: responseContent,
            });
          }
          void clearAllScreenshots();
        },
      ),
      window.electronAPI?.onDebugStart?.(() => setDebugProcessing(true)),
      window.electronAPI?.onDebugSuccess?.((data: SolveResponse | LeetCodeSolveResponse) => {
        setNewSolution(data);
        setDebugProcessing(false);
        void clearAllScreenshots();
      }),
      window.electronAPI?.onDebugError?.(() => {
        showToast(
          'Processing Failed',
          'There was an error debugging your code.',
          'error',
        );
        setDebugProcessing(false);
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
  }, [
    showToast,
    setSolution,
    setNewSolution,
    setConversationId,
    addConversationMessage,
    clearAllScreenshots,
    // Removed solutionState.solution to prevent dependency loop
  ]);

  useScreenshotEvents({
    refetch,
    onResetView: () => {
      setIsResetting(true);
      clearAll();
      setTimeout(() => setIsResetting(false), 0);
    },
  });

  return {
    debugProcessing,
    solutionData,
    thoughtsData,
    timeComplexityData,
    spaceComplexityData,
    isResetting,
    screenshots,
    contentRef,
    handleDeleteScreenshot,
    setDebugProcessing,
  };
}
