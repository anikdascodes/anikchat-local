import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface StreamingState {
  isLoading: boolean;
  streamingContent: string;
  streamingMessageId: string | null;
  
  setIsLoading: (loading: boolean) => void;
  setStreamingContent: (content: string) => void;
  setStreamingMessageId: (id: string | null) => void;
  resetStreaming: () => void;
}

export const useStreamingStore = create<StreamingState>()(
  subscribeWithSelector((set) => ({
    isLoading: false,
    streamingContent: '',
    streamingMessageId: null,

    setIsLoading: (loading) => set({ isLoading: loading }),
    setStreamingContent: (content) => set({ streamingContent: content }),
    setStreamingMessageId: (id) => set({ streamingMessageId: id }),
    resetStreaming: () => set({ 
      isLoading: false, 
      streamingContent: '', 
      streamingMessageId: null 
    }),
  }))
);
