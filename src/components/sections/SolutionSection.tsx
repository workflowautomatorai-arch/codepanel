import React, { useState, useCallback } from 'react';
import SolutionContent from '../Solutions/SolutionContent';
import ThoughtsList from '../Solutions/ThoughtsList';
import CodeBlock from '../Solutions/CodeBlock';
import ReplyInput from '../Solutions/ReplyInput';
import { useAppModeLayout } from '../../layouts';
import { useSettings } from '../../contexts/SettingsContext';
import { useSolutionContext } from '../../contexts/SolutionContext';

interface SolutionSectionProps {
  solutionData?: string | null;
  thoughtsData?: string[] | null;
  timeComplexityData?: string | null;
  spaceComplexityData?: string | null;
  title?: string;
  isGenerating?: boolean;
  className?: string;
  conversationId?: string;
}

const SolutionSectionInner: React.FC<SolutionSectionProps> = ({
  solutionData,
  thoughtsData,
  timeComplexityData,
  spaceComplexityData,
  title = 'Solution',
  isGenerating = false,
  className = '',
  conversationId: propConversationId,
}) => {
  const { isLeetcodeSolver } = useAppModeLayout();
  const { solutionLanguage } = useSettings();
  const { state, setConversationId, addConversationMessage } =
    useSolutionContext();
  const currentLanguage = solutionLanguage;
  const [isReplying, setIsReplying] = useState(false);

  const handleNewResponse = useCallback(
    (response: string, newConversationId: string) => {
      if (newConversationId) {
        setConversationId(newConversationId);
      }
      addConversationMessage({ role: 'assistant', content: response });
    },
    [setConversationId, addConversationMessage],
  );

  const conversationId = propConversationId || state.conversationId;

  if (isGenerating) {
    return (
      <div className={className}>
        <SolutionContent
          title="Generating solution"
          content="..."
          isLoading={true}
        />
      </div>
    );
  }

  if (!solutionData && !thoughtsData) {
    return null;
  }

  const complexityContent = (timeComplexityData || spaceComplexityData) && (
    <div className="space-y-2 font-normal">
      {timeComplexityData && (
        <div className="flex items-start gap-2">
          <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
          <div>
            <span className="font-medium">Time:</span> {timeComplexityData}
          </div>
        </div>
      )}
      {spaceComplexityData && (
        <div className="flex items-start gap-2">
          <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
          <div>
            <span className="font-medium">Space:</span> {spaceComplexityData}
          </div>
        </div>
      )}
    </div>
  );

  const replyInput = (
    <ReplyInput
      conversationId={conversationId || undefined}
      conversationHistory={state.conversationHistory}
      onNewResponse={handleNewResponse}
      isProcessing={isReplying}
      setIsProcessing={setIsReplying}
    />
  );

  if (isLeetcodeSolver) {
    return (
      <div className={className}>
        {solutionData && (
          <SolutionContent
            title={title}
            content={
              <CodeBlock
                code={solutionData}
                language={currentLanguage}
                showCopyButton={true}
              />
            }
            isLoading={!solutionData}
            type="code"
          />
        )}
        {replyInput}
      </div>
    );
  }

  return (
    <div className={`space-y-4 stagger-container ${className}`}>
      {thoughtsData && (
        <SolutionContent
          title={title === 'Solution' ? 'My Thoughts' : 'What I Changed'}
          content={<ThoughtsList thoughts={thoughtsData} />}
          isLoading={!thoughtsData}
        />
      )}

      {solutionData && (
        <SolutionContent
          title={title}
          content={
            <CodeBlock
              code={solutionData}
              language={currentLanguage}
              showCopyButton={false}
            />
          }
          isLoading={!solutionData}
          type="code"
        />
      )}

      {complexityContent && (
        <SolutionContent
          title="Complexity"
          content={complexityContent}
          isLoading={!timeComplexityData && !spaceComplexityData}
        />
      )}

      {replyInput}
    </div>
  );
};

export const SolutionSection: React.FC<SolutionSectionProps> =
  SolutionSectionInner;
