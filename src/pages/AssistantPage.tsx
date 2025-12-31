import React from 'react';
import { AssistantLayout } from '../layouts/AssistantLayout';
import { ChatMessageList, ChatInput } from '../components/Chat';
import { useAssistant } from '../hooks/useAssistant';
import { useSettings } from '../contexts/SettingsContext';
import AssistantCommands from '../components/Commands/AssistantCommands';

interface AssistantPageProps {
  setView?: (view: 'assistant' | 'queue' | 'solutions' | 'debug') => void;
}

const AssistantPage: React.FC<AssistantPageProps> = () => {
  // Get capability settings
  const { enableWebSearch, enableUrlContext, enablePersonalContext } = useSettings();

  // Use assistant hook
  const {
    messages,
    isProcessing,
    screenshots,
    sendMessage,
    sendVoice,
    addScreenshot,
    removeScreenshot,
    clearChat,
  } = useAssistant({
    capabilities: {
      enableWebSearch: enableWebSearch ?? true,
      enableUrlContext: enableUrlContext ?? true,
      enablePersonalContext: enablePersonalContext ?? true,
    },
  });

  return (
    <AssistantLayout
      commandSection={
        <AssistantCommands
          onScreenshot={addScreenshot}
          onClear={clearChat}
          screenshotCount={screenshots.length}
          isProcessing={isProcessing}
        />
      }
      chatSection={
        <>
          {/* Message list - scrollable */}
          <ChatMessageList messages={messages} />
          {/* Input - stays at bottom */}
          <div className="flex-shrink-0 pt-2">
            <ChatInput
              onSendMessage={sendMessage}
              onSendVoice={sendVoice}
              screenshots={screenshots}
              onRemoveScreenshot={removeScreenshot}
              isProcessing={isProcessing}
            />
          </div>
        </>
      }
    />
  );
};

export default AssistantPage;
