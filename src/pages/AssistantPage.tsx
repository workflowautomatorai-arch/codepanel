import React from 'react';
import { AssistantLayout } from '../layouts/AssistantLayout';
import { ChatMessageList, ChatInput } from '../components/Chat';
import { useAssistant } from '../hooks/useAssistant';
import { useLiveMode } from '../hooks/useLiveMode';
import { useSettings } from '../contexts/SettingsContext';
import { useChatContext, generateMessageId } from '../contexts/ChatContext';
import AssistantCommands from '../components/Commands/AssistantCommands';

interface AssistantPageProps {
  setView?: (view: 'assistant' | 'queue' | 'solutions' | 'debug') => void;
}

const AssistantPage: React.FC<AssistantPageProps> = () => {
  // Get capability settings
  const { enableWebSearch, enableUrlContext, enablePersonalContext } = useSettings();

  // Get chat context for adding live mode user messages
  const { addMessage } = useChatContext();

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

  // Use live mode hook
  const {
    isLiveMode,
    isConnecting,
    toggleLiveMode,
    sendTextInLiveMode,
  } = useLiveMode();

  // Handle sending message - route through live mode when active
  const handleSendMessage = async (text: string, screenshotData?: Array<{ path: string; preview: string }>) => {
    if (isLiveMode && (!screenshotData || screenshotData.length === 0)) {
      // Add user message to chat
      addMessage({
        id: generateMessageId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
        status: 'complete',
      });
      // Send through live session
      await sendTextInLiveMode(text);
    } else {
      // Use regular assistant
      await sendMessage(text, screenshotData);
    }
  };

  return (
    <>
      <AssistantLayout
        commandSection={
          <AssistantCommands
            onScreenshot={addScreenshot}
            onClear={clearChat}
            screenshotCount={screenshots.length}
            isProcessing={isProcessing}
            isLiveMode={isLiveMode}
            isConnecting={isConnecting}
            onToggleLiveMode={toggleLiveMode}
          />
        }
        chatSection={
          <>
            {/* Message list - scrollable */}
            <ChatMessageList messages={messages} />
            {/* Input - stays at bottom */}
            <div className="flex-shrink-0 pt-2">
              <ChatInput
                onSendMessage={handleSendMessage}
                onSendVoice={sendVoice}
                screenshots={screenshots}
                onRemoveScreenshot={removeScreenshot}
                isProcessing={isProcessing || isConnecting}
              />
            </div>
          </>
        }
      />
    </>
  );
};

export default AssistantPage;
