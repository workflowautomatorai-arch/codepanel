import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import {
  SolveResponse,
  LeetCodeSolveResponse,
  DebugResponse,
  LeetCodeDebugResponse,
} from '@shared/api.ts';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SolutionState {
  solution: SolveResponse | LeetCodeSolveResponse | null;
  newSolution: DebugResponse | LeetCodeDebugResponse | null;
  conversationId: string | null;
  conversationHistory: ConversationMessage[];
}

type SolutionAction =
  | { type: 'SET_SOLUTION'; payload: SolveResponse | LeetCodeSolveResponse }
  | { type: 'SET_NEW_SOLUTION'; payload: DebugResponse | LeetCodeDebugResponse }
  | { type: 'SET_CONVERSATION_ID'; payload: string }
  | { type: 'ADD_CONVERSATION_MESSAGE'; payload: ConversationMessage }
  | { type: 'CLEAR_SOLUTION' }
  | { type: 'CLEAR_NEW_SOLUTION' }
  | { type: 'CLEAR_ALL' };

const initialState: SolutionState = {
  solution: null,
  newSolution: null,
  conversationId: null,
  conversationHistory: [],
};

function solutionReducer(
  state: SolutionState,
  action: SolutionAction,
): SolutionState {
  switch (action.type) {
    case 'SET_SOLUTION':
      return { ...state, solution: action.payload };
    case 'SET_NEW_SOLUTION':
      return { ...state, newSolution: action.payload };
    case 'SET_CONVERSATION_ID':
      return { ...state, conversationId: action.payload };
    case 'ADD_CONVERSATION_MESSAGE':
      return {
        ...state,
        conversationHistory: [...state.conversationHistory, action.payload],
      };
    case 'CLEAR_SOLUTION':
      return { ...state, solution: null };
    case 'CLEAR_NEW_SOLUTION':
      return { ...state, newSolution: null };
    case 'CLEAR_ALL':
      return initialState;
    default:
      return state;
  }
}

interface SolutionContextType {
  state: SolutionState;
  setSolution: (solution: SolveResponse | LeetCodeSolveResponse) => void;
  setNewSolution: (solution: DebugResponse | LeetCodeDebugResponse) => void;
  setConversationId: (id: string) => void;
  addConversationMessage: (message: ConversationMessage) => void;
  clearSolution: () => void;
  clearNewSolution: () => void;
  clearAll: () => void;
}

const SolutionContext = createContext<SolutionContextType | undefined>(
  undefined,
);

export function SolutionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(solutionReducer, initialState);

  const setSolution = (solution: SolveResponse | LeetCodeSolveResponse) => {
    dispatch({ type: 'SET_SOLUTION', payload: solution });
  };

  const setNewSolution = (solution: DebugResponse | LeetCodeDebugResponse) => {
    dispatch({ type: 'SET_NEW_SOLUTION', payload: solution });
  };

  const setConversationId = (id: string) => {
    dispatch({ type: 'SET_CONVERSATION_ID', payload: id });
  };

  const addConversationMessage = (message: ConversationMessage) => {
    dispatch({ type: 'ADD_CONVERSATION_MESSAGE', payload: message });
  };

  const clearSolution = () => {
    dispatch({ type: 'CLEAR_SOLUTION' });
  };

  const clearNewSolution = () => {
    dispatch({ type: 'CLEAR_NEW_SOLUTION' });
  };

  const clearAll = () => {
    dispatch({ type: 'CLEAR_ALL' });
  };

  return (
    <SolutionContext.Provider
      value={{
        state,
        setSolution,
        setNewSolution,
        setConversationId,
        addConversationMessage,
        clearSolution,
        clearNewSolution,
        clearAll,
      }}
    >
      {children}
    </SolutionContext.Provider>
  );
}

export function useSolutionContext() {
  const context = useContext(SolutionContext);
  if (!context) {
    throw new Error(
      'useSolutionContext must be used within a SolutionProvider',
    );
  }

  return context;
}
