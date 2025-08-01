import { z } from "zod"
import { DynamicStructuredTool } from "@langchain/core/tools"
import { ExecutionContext } from "@/lib/runtime/ExecutionContext"
import { toolSuccess, toolError, type ToolOutput } from "@/lib/tools/Tool.interface"

// Constants
const DEFAULT_TAB_URL = "chrome://newtab/"

// Input schema for tab operations
export const TabOperationInputSchema = z.object({
  action: z.enum(["list", "list_all", "new", "switch", "close"]),  // Tab operation to perform
  tabIds: z.array(z.number()).optional(),  // Tab IDs for switch/close operations
})

export type TabOperationInput = z.infer<typeof TabOperationInputSchema>

export class TabOperationsTool {
  constructor(private executionContext: ExecutionContext) {}

  async execute(input: TabOperationInput): Promise<ToolOutput> {
    switch (input.action) {
      case "list":
        return this._listTabs()
      case "list_all":
        return this._listAllTabs()
      case "new":
        return this._createNewTab()
      case "switch":
        return this._switchToTab(input.tabIds)
      case "close":
        return this._closeTabs(input.tabIds)
    }
  }

  // Private helper methods
  private async _listTabs(): Promise<ToolOutput> {
    try {
      const currentWindow = await this.executionContext.browserContext.getCurrentWindow()
      const tabs = await chrome.tabs.query({ windowId: currentWindow.id })
      
      const formattedTabs = tabs
        .filter(tab => tab.id !== undefined && tab.url && tab.title)
        .map(tab => ({
          id: tab.id!,
          url: tab.url!,
          title: tab.title!,
          windowId: tab.windowId!
        }))
      
      return {
        ok: true,
        output: JSON.stringify(formattedTabs)
      }
    } catch (error) {
      return toolError(`Failed to list tabs: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async _listAllTabs(): Promise<ToolOutput> {
    try {
      const tabs = await chrome.tabs.query({})
      
      const formattedTabs = tabs
        .filter(tab => tab.id !== undefined && tab.url && tab.title)
        .map(tab => ({
          id: tab.id!,
          url: tab.url!,
          title: tab.title!,
          windowId: tab.windowId!
        }))
      
      return {
        ok: true,
        output: JSON.stringify(formattedTabs)
      }
    } catch (error) {
      return toolError(`Failed to list all tabs: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async _createNewTab(): Promise<ToolOutput> {
    try {
      const page = await this.executionContext.browserContext.openTab(DEFAULT_TAB_URL)
      return toolSuccess(`Created new tab with ID: ${page.tabId}`)
    } catch (error) {
      return toolError(`Failed to create new tab: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async _switchToTab(tabIds?: number[]): Promise<ToolOutput> {
    if (!tabIds || tabIds.length === 0) {
      return toolError("Switch operation requires a tab ID")
    }

    const tabId = tabIds[0]
    
    try {
      await this.executionContext.browserContext.switchTab(tabId)
      
      // Get tab info for confirmation
      const tab = await chrome.tabs.get(tabId)
      return toolSuccess(`Switched to tab: ${tab.title || 'Untitled'} (ID: ${tabId})`)
    } catch (error) {
      return toolError(`Failed to switch to tab ${tabId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async _closeTabs(tabIds?: number[]): Promise<ToolOutput> {
    if (!tabIds || tabIds.length === 0) {
      return toolError("Close operation requires tab IDs")
    }

    try {
      // Verify tabs exist before closing
      const allTabs = await chrome.tabs.query({})
      const validTabIds = tabIds.filter(tabId => 
        allTabs.some(tab => tab.id === tabId)
      )

      if (validTabIds.length === 0) {
        return toolSuccess("No valid tabs found to close")
      }

      // Close tabs using browserContext for proper cleanup
      let closedCount = 0
      const errors: string[] = []
      
      for (const tabId of validTabIds) {
        try {
          await this.executionContext.browserContext.closeTab(tabId)
          closedCount++
        } catch (error) {
          errors.push(`Tab ${tabId}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      if (errors.length > 0) {
        return toolSuccess(`Closed ${closedCount} tab(s). Failed to close ${errors.length} tab(s): ${errors.join(', ')}`)
      }
      
      return toolSuccess(`Closed ${closedCount} tab${closedCount === 1 ? '' : 's'}`)
    } catch (error) {
      return toolError(`Failed to close tabs: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

// LangChain wrapper factory function
export function createTabOperationsTool(executionContext: ExecutionContext): DynamicStructuredTool {
  const tabOperationsTool = new TabOperationsTool(executionContext)
  
  return new DynamicStructuredTool({
    name: "tab_operations",
    description: "Manage browser tabs: list tabs in current window (list), list all tabs (list_all), create new tab (new), switch to tab (switch), or close tabs (close). Use tabIds array for switch/close operations.",
    schema: TabOperationInputSchema,
    func: async (args): Promise<string> => {
      const result = await tabOperationsTool.execute(args)
      return JSON.stringify(result)
    }
  })
}