import { create } from 'zustand'
import { z } from 'zod'

// Message schema - simplified for direct PubSub mapping
export const MessageSchema = z.object({
  msgId: z.string(),  // Primary ID for both React keys and PubSub correlation
  role: z.enum(['user', 'thinking', 'assistant', 'error']),  // Direct from PubSub
  content: z.string(),  // Message content
  timestamp: z.date(),  // When message was created
  metadata: z.object({
    toolName: z.string().optional(),  // Tool name if this is a tool result
  }).optional()  // Minimal metadata
})

export type Message = z.infer<typeof MessageSchema>

// Store state schema
const ChatStateSchema = z.object({
  messages: z.array(MessageSchema),  // All chat messages
  isProcessing: z.boolean(),  // Is agent currently processing
  selectedTabIds: z.array(z.number()),  // Selected browser tab IDs
  error: z.string().nullable(),  // Current error message if any
  executingMessageRemoving: z.boolean()  // Flag when executing message is being removed
})

type ChatState = z.infer<typeof ChatStateSchema>

// PubSub message type for upsert
export interface PubSubMessage {
  msgId: string
  content: string
  role: 'thinking' | 'user' | 'assistant' | 'error'
  ts: number
}

// Store actions
interface ChatActions {
  // Message operations - now with upsert
  upsertMessage: (pubsubMessage: PubSubMessage) => void
  clearMessages: () => void
  
  // Legacy operations (to be removed)
  markMessageAsExecuting: (msgId: string) => void
  markMessageAsCompleting: (msgId: string) => void
  removeExecutingMessage: (msgId: string) => void
  setExecutingMessageRemoving: (removing: boolean) => void
  
  // Processing state
  setProcessing: (processing: boolean) => void
  
  // Tab selection
  setSelectedTabs: (tabIds: number[]) => void
  clearSelectedTabs: () => void
  
  // Error handling
  setError: (error: string | null) => void
  
  // Reset everything
  reset: () => void
}

// Initial state
const initialState: ChatState = {
  messages: [],
  isProcessing: false,
  selectedTabIds: [],
  error: null,
  executingMessageRemoving: false
}

// Create the store
export const useChatStore = create<ChatState & ChatActions>((set) => ({
  // State
  ...initialState,
  
  // Actions
  upsertMessage: (pubsubMessage) => {
    set((state) => {
      const existingIndex = state.messages.findIndex(m => m.msgId === pubsubMessage.msgId)
      
      if (existingIndex >= 0) {
        // Update existing message content
        const updated = [...state.messages]
        updated[existingIndex] = {
          ...updated[existingIndex],
          content: pubsubMessage.content,
          timestamp: new Date(pubsubMessage.ts)
        }
        return { messages: updated, error: null }
      } else {
        // Add new message
        const newMessage: Message = {
          msgId: pubsubMessage.msgId,
          content: pubsubMessage.content,
          role: pubsubMessage.role,
          timestamp: new Date(pubsubMessage.ts),
          metadata: {}
        }
        return { 
          messages: [...state.messages, newMessage],
          error: null
        }
      }
    })
  },
  
  clearMessages: () => set({ messages: [] }),
  
  // Executing message operations (now use msgId)
  markMessageAsExecuting: (msgId) => {
    set((state) => ({
      messages: state.messages.map(msg =>
        msg.msgId === msgId ? { 
          ...msg, 
          metadata: { 
            ...msg.metadata, 
            isExecuting: true,
            isCompleting: false
          } 
        } : msg
      )
    }))
  },
  
  markMessageAsCompleting: (msgId) => {
    set((state) => ({
      messages: state.messages.map(msg =>
        msg.msgId === msgId ? { 
          ...msg, 
          metadata: { 
            ...msg.metadata, 
            isExecuting: false,
            isCompleting: true
          } 
        } : msg
      )
    }))
  },
  
  removeExecutingMessage: (msgId) => {
    set((state) => ({
      messages: state.messages.filter(msg => msg.msgId !== msgId)
    }))
  },
  
  setExecutingMessageRemoving: (removing) => set({ executingMessageRemoving: removing }),
  
  setProcessing: (processing) => set({ isProcessing: processing }),
  
  setSelectedTabs: (tabIds) => set({ selectedTabIds: tabIds }),
  
  clearSelectedTabs: () => set({ selectedTabIds: [] }),
  
  setError: (error) => set({ error }),
  
  reset: () => set(initialState)
}))

// Selectors for common operations
export const chatSelectors = {
  getLastMessage: (state: ChatState): Message | undefined => 
    state.messages[state.messages.length - 1],
    
  hasMessages: (state: ChatState): boolean => 
    state.messages.length > 0,
    
  getMessageByMsgId: (state: ChatState, msgId: string): Message | undefined =>
    state.messages.find(msg => msg.msgId === msgId),
    
  getSelectedTabCount: (state: ChatState): number => 
    state.selectedTabIds.length
}
