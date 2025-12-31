import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Screenshot } from '@shared/api.ts';

// Message types for chat
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  screenshots?: Screenshot[];
  timestamp: number;
  status: 'sending' | 'thinking' | 'streaming' | 'complete' | 'error';
  metadata?: {
    sources?: string[];
    contextFilesUsed?: string[];
  };
}

interface ChatState {
  messages: ChatMessage[];
  interactionId: string | null;
  isProcessing: boolean;
}

type ChatAction =
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<ChatMessage> } }
  | { type: 'SET_INTERACTION_ID'; payload: string | null }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'CLEAR_ALL' };

const initialState: ChatState = {
  messages: [],
  interactionId: null,
  isProcessing: false,
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
      };
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.payload.id
            ? { ...msg, ...action.payload.updates }
            : msg
        ),
      };
    case 'SET_INTERACTION_ID':
      return { ...state, interactionId: action.payload };
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };
    case 'CLEAR_ALL':
      return initialState;
    default:
      return state;
  }
}

interface ChatContextType {
  state: ChatState;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  setInteractionId: (id: string | null) => void;
  setProcessing: (processing: boolean) => void;
  clearAll: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);

  const addMessage = (message: ChatMessage) => {
    dispatch({ type: 'ADD_MESSAGE', payload: message });
  };

  const updateMessage = (id: string, updates: Partial<ChatMessage>) => {
    dispatch({ type: 'UPDATE_MESSAGE', payload: { id, updates } });
  };

  const setInteractionId = (id: string | null) => {
    dispatch({ type: 'SET_INTERACTION_ID', payload: id });
  };

  const setProcessing = (processing: boolean) => {
    dispatch({ type: 'SET_PROCESSING', payload: processing });
  };

  const clearAll = () => {
    dispatch({ type: 'CLEAR_ALL' });
  };

  return (
    <ChatContext.Provider
      value={{
        state,
        addMessage,
        updateMessage,
        setInteractionId,
        setProcessing,
        clearAll,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}

// Helper to generate unique message IDs
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
