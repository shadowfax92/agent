import { useEffect, useCallback } from 'react'
import { MessageType } from '@/lib/types/messaging'
import { useSidePanelPortMessaging } from '@/sidepanel/hooks'
import { useChatStore } from '../stores/chatStore'

export function useMessageHandler() {
  const { addMessage, updateMessage, setProcessing, setError } = useChatStore()
  const { addMessageListener, removeMessageListener } = useSidePanelPortMessaging()

  // Create stable callback functions
  const handleStreamUpdate = useCallback((payload: any) => {
    // Check if this is a new PubSub event
    if (payload?.action === 'PUBSUB_EVENT' && payload?.details?.type === 'message') {
      const message = payload.details.payload
      
      // Handle PubSub message based on role
      // Note: 'system' role is no longer in the new types, but keeping for backwards compatibility
      if (message.role === 'thinking') {
        // Check if we need to update existing assistant message or create new one
        const currentMessages = useChatStore.getState().messages
        const lastAssistantMsg = [...currentMessages].reverse().find(m => m.role === 'thinking' && m.metadata?.msgId === message.msgId)
        
        if (lastAssistantMsg) {
          // Update existing message
          updateMessage(lastAssistantMsg.id, message.content)
        } else {
          // Add new assistant message
          addMessage({
            role: 'thinking',
            content: message.content,
            metadata: { 
              msgId: message.msgId,
              timestamp: message.ts
            }
          })
        }
      } else if (message.role === 'user') {
        addMessage({
          role: 'user',
          content: message.content,
          metadata: { timestamp: message.ts }
        })
      } else if (message.role === 'error') {
        // For now, map error messages to assistant messages
        // TODO: Once we have different UI for errors, update this
        addMessage({
          role: 'thinking',
          content: message.content,
          metadata: { 
            msgId: message.msgId,
            timestamp: message.ts,
            error: true
          }
        })
      } else if (message.role === 'assistant') {
        // For now, map result messages to assistant messages
        // TODO: Once we have different UI for results, update this
        addMessage({
          role: 'thinking',
          content: message.content,
          metadata: { 
            msgId: message.msgId,
            timestamp: message.ts,
            result: true,
          }
        })
      }
      return
    }
    
    // No longer needed - old event format is removed
  }, [addMessage, updateMessage, setProcessing, setError])
  
  // Handle workflow status updates
  const handleWorkflowStatus = useCallback((payload: any) => {
    if (payload.status === 'completed' || payload.status === 'failed' || payload.cancelled) {
      setProcessing(false)
      
      if (payload.error && !payload.cancelled) {
        setError(payload.error)
        addMessage({
          role: 'assistant',
          content: payload.error,
          metadata: { error: true }
        })
      }
    }
  }, [addMessage, setProcessing, setError])
  
  useEffect(() => {
    // Register listeners
    addMessageListener(MessageType.AGENT_STREAM_UPDATE, handleStreamUpdate)
    addMessageListener(MessageType.WORKFLOW_STATUS, handleWorkflowStatus)
    
    // Cleanup
    return () => {
      removeMessageListener(MessageType.AGENT_STREAM_UPDATE, handleStreamUpdate)
      removeMessageListener(MessageType.WORKFLOW_STATUS, handleWorkflowStatus)
    }
  }, [addMessageListener, removeMessageListener, handleStreamUpdate, handleWorkflowStatus])
}
