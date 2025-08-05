import { ExecutionContext } from '@/lib/runtime/ExecutionContext';
import { MessageManager, MessageManagerReadOnly } from '@/lib/runtime/MessageManager';
import { ToolManager } from '@/lib/tools/ToolManager';
import { TodoStore } from '@/lib/runtime/TodoStore';
import { EventProcessor } from '@/lib/events/EventProcessor';
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { Abortable, AbortError } from '@/lib/utils/Abortable';
import { formatToolOutput } from '@/lib/tools/formatToolOutput';
import { formatTodoList } from '@/lib/tools/utils/formatTodoList';
import { createPlannerTool } from '@/lib/tools/planning/PlannerTool';
import { createTodoManagerTool } from '@/lib/tools/planning/TodoManagerTool';
import { createDoneTool } from '@/lib/tools/utils/DoneTool';
import { createNavigationTool } from '@/lib/tools/navigation/NavigationTool';
import { createFindElementTool } from '@/lib/tools/navigation/FindElementTool';
import { createInteractionTool } from '@/lib/tools/navigation/InteractionTool';
import { createScrollTool } from '@/lib/tools/navigation/ScrollTool';
import { createSearchTool } from '@/lib/tools/navigation/SearchTool';
import { createRefreshStateTool } from '@/lib/tools/navigation/RefreshStateTool';
import { createTabOperationsTool } from '@/lib/tools/tab/TabOperationsTool';
import { createValidatorTool } from '@/lib/tools/validation/ValidatorTool';
import { createScreenshotTool } from '@/lib/tools/utils/ScreenshotTool';
import { createExtractTool } from '@/lib/tools/extraction/ExtractTool';
import { generateSubAgentSystemPrompt, generateSubAgentTaskPrompt } from './SubAgent.prompt';
import { generateSystemPrompt } from '@/lib/agent/PocAgent.prompt';
import { z } from 'zod';

// Schema for summary generation
const SubAgentSummarySchema = z.object({
  success: z.boolean(),  // true if task completed, false if failed
  summary: z.string()  // Brief summary of what was accomplished
});

/**
 * SubAgent - A self-contained agent that can execute multi-step tasks
 * Used by SubAgentTool to handle complex task execution in isolation
 */
export class SubAgent {
  private static readonly MAX_STEPS = 20;  // Max total execution steps
  
  private readonly parentContext: ExecutionContext;
  private readonly executionContext: ExecutionContext;
  private readonly messageManager: MessageManager;
  private readonly toolManager: ToolManager;
  private readonly todoStore: TodoStore;
  private readonly eventEmitter: EventProcessor;
  private readonly task: string;
  private readonly description: string;

  constructor(
    parentContext: ExecutionContext,
    task: string,
    description: string
  ) {
    this.parentContext = parentContext;
    this.task = task;
    this.description = description;
    
    // Create isolated components
    this.messageManager = new MessageManager(128000);
    this.todoStore = new TodoStore();
    
    // Create a new ExecutionContext for the subagent
    // Keep parent's browser context, abort controller, and event processors
    // But use our own message manager and todo store
    this.executionContext = new ExecutionContext({
      browserContext: parentContext.browserContext,
      messageManager: this.messageManager,
      abortController: parentContext.abortController,
      debugMode: parentContext.debugMode,
      eventBus: parentContext.getEventBus(),
      eventProcessor: parentContext.getEventProcessor(),
      todoStore: this.todoStore
    });
    
    // Create tool manager with our execution context
    this.toolManager = new ToolManager(this.executionContext);
    
    // Use parent's event emitter for UI updates
    this.eventEmitter = parentContext.getEventProcessor();
    
    // Register tools
    this._registerTools();
  }

  /**
   * Execute the task using plan-execute-validate cycles
   */
  async execute(): Promise<{ success: boolean; summary: string; error?: string }> {
    try {
      // Initialize with system prompt and task
      this._initializeExecution();
      
      // Execute simple loop until done_tool is called
      const success = await this._executeLoop();
      
      // Generate summary using LLM
      const { success: summarySuccess, summary } = await this._generateSummary();
      
      if (success && summarySuccess) {
        return { success: true, summary };
      } else {
        return { 
          success: false, 
          summary: summary || 'Task could not be completed',
          error: success ? undefined : 'Max steps exceeded'
        };
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if user cancelled
      if (error instanceof AbortError || 
          this.executionContext.isUserCancellation() || 
          (error instanceof Error && error.name === "AbortError")) {
        return {
          success: false,
          summary: 'Task was cancelled',
          error: 'User cancelled'
        };
      }
      
      return {
        success: false,
        summary: 'Task failed due to an error',
        error: errorMessage
      };
    }
  }

  private _initializeExecution(): void {
    // Generate system prompt using the prompt template
    // const systemPrompt = generateSubAgentSystemPrompt(
    //   this.toolManager.getDescriptions()
    // );
    const systemPrompt = generateSystemPrompt(this.toolManager.getDescriptions(), true);

    this.messageManager.addSystem(systemPrompt);
    
    // Generate task prompt
    const taskPrompt = generateSubAgentTaskPrompt(this.task, this.description);
    this.messageManager.addHuman(taskPrompt);
  }

  private _registerTools(): void {
    // Planning and task management
    this.toolManager.register(createPlannerTool(this.executionContext));
    this.toolManager.register(createTodoManagerTool(this.executionContext));
    this.toolManager.register(createDoneTool());
    
    // Navigation tools
    this.toolManager.register(createNavigationTool(this.executionContext));
    this.toolManager.register(createFindElementTool(this.executionContext));
    this.toolManager.register(createInteractionTool(this.executionContext));
    this.toolManager.register(createScrollTool(this.executionContext));
    this.toolManager.register(createSearchTool(this.executionContext));
    this.toolManager.register(createRefreshStateTool(this.executionContext));
    
    // Tab operations
    this.toolManager.register(createTabOperationsTool(this.executionContext));
    
    // Validation and utility
    this.toolManager.register(createValidatorTool(this.executionContext));
    this.toolManager.register(createScreenshotTool(this.executionContext));
    this.toolManager.register(createExtractTool(this.executionContext));
    
    // Note: We don't register SubAgentTool here to avoid recursion
  }

  @Abortable
  private async _executeLoop(): Promise<boolean> {
    let taskCompleted = false;
    
    // Simple loop until done or max iterations
    let stepCount = 0;
    while (stepCount < SubAgent.MAX_STEPS) {
      this.checkIfAborted();  // Check if user cancelled
      
      // Execute one turn with the LLM
      const { wasDoneCalled: wasDoneToolCalled, wasValidatorCalled: wasValidatorToolCalled } = await this._executeSingleTurn();

      // if we called done_tool and did not call validator_tool, we need to validate the task manually
      if (wasDoneToolCalled && !wasValidatorToolCalled) {
        const { isComplete, reasoning, suggestions } = await this._validateTaskCompletion(this.task);
        if (isComplete) {
          taskCompleted = true;
          break;
        }

        if (!isComplete) {
          if (suggestions.length > 0) {
            const validationMessage = `Validation result: ${reasoning}\nSuggestions: ${suggestions.join(', ')}`;
            this.messageManager.addAI(validationMessage);
            taskCompleted = false;
          }
          else {
            this.messageManager.addAI(`Validation failed. Re-plan and execute.`);
          }
        }
      }
      
      // maybe add system reminders
      await this._maybeAddSystemReminders(stepCount);
      
      // increment step count
      stepCount++;
    }
    
    return taskCompleted;
  }

  private checkIfAborted(): void {
    if (this.executionContext.abortController.signal.aborted) {
      throw new AbortError();
    }
  }

  @Abortable
  private async _executeSingleTurn(instruction?: string): Promise<{ wasDoneCalled: boolean, wasValidatorCalled: boolean }> {
    if (instruction && instruction.length > 0) {
      this.messageManager.addHuman(instruction);
    }

    // This method encapsulates the streaming logic
    const llmResponse = await this._invokeLLMWithStreaming();

    let wasDoneCalled = false;
    let wasValidatorCalled = false;

    if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
      // IMPORTANT: We must add the full AIMessage object (not just a string) to maintain proper conversation history.
      // The AIMessage contains both content and tool_calls. LLMs like Google's API validate that function calls
      // in the conversation history match with their corresponding ToolMessage responses. If we only add a string
      // here, we lose the tool_calls information, causing "function calls don't match" errors.
      this.messageManager.add(llmResponse);

      const { wasDoneCalled: wasDoneCalled_inner, wasValidatorCalled: wasValidatorCalled_inner } = await this._processToolCalls(llmResponse.tool_calls);

      wasDoneCalled = wasDoneCalled_inner;
      wasValidatorCalled = wasValidatorCalled_inner;

    } else if (llmResponse.content) {
      // If the AI responds with text, just add it to the history
      this.messageManager.addAI(llmResponse.content as string);
    }

    return { wasDoneCalled, wasValidatorCalled };
  }

  @Abortable  // Checks at method start
  private async _invokeLLMWithStreaming(): Promise<AIMessage> {
    const llm = await this.executionContext.getLLM();
    if (!llm.bindTools || typeof llm.bindTools !== 'function') {
      throw new Error('This LLM does not support tool binding');
    }

    const message_history = this.messageManager.getMessages();

    const llmWithTools = llm.bindTools(this.toolManager.getAll());
    const stream = await llmWithTools.stream(message_history, {
      signal: this.executionContext.abortController.signal
    });

    let accumulatedChunk: AIMessageChunk | undefined;
    let accumulatedText = '';
    let hasStartedThinking = false;

    for await (const chunk of stream) {
      this.checkIfAborted();  // Manual check during streaming

      if (chunk.content && typeof chunk.content === 'string') {
        // Start thinking on first real content
        if (!hasStartedThinking) {
          this.eventEmitter.startThinking();
          hasStartedThinking = true;
        }

        this.eventEmitter.streamThoughtDuringThinking(chunk.content);
        accumulatedText += chunk.content;
      }
      accumulatedChunk = !accumulatedChunk ? chunk : accumulatedChunk.concat(chunk);
    }

    // Only finish thinking if we started and have content
    if (hasStartedThinking && accumulatedText.trim()) {
      this.eventEmitter.finishThinking(accumulatedText);
    }

    if (!accumulatedChunk) return new AIMessage({ content: '' });

    // Convert the final chunk back to a standard AIMessage
    return new AIMessage({
      content: accumulatedChunk.content,
      tool_calls: accumulatedChunk.tool_calls,
    });
  }

  @Abortable  // Checks at method start
  private async _processToolCalls(toolCalls: any[]): Promise<{ wasDoneCalled: boolean, wasValidatorCalled: boolean }> {
    let wasDoneCalled = false;
    let wasValidatorCalled = false;

    for (const toolCall of toolCalls) {
      this.checkIfAborted();  // Manual check before each tool

      const { name: toolName, args, id: toolCallId } = toolCall;
      const tool = this.toolManager.get(toolName);

      if (!tool) {
        // Handle tool not found
        continue;
      }

      this.eventEmitter.executingTool(toolName, args);
      const result = await tool.func(args);
      const parsedResult = JSON.parse(result);

      // Format the tool output for display
      const displayMessage = formatToolOutput(toolName, parsedResult);
      this.eventEmitter.debug('SubAgent executing tool: ' + toolName + ' result: ' + displayMessage);

      // Emit tool result for UI display (always shown)
      this.eventEmitter.emitToolResult(toolName, result);

      // Add the result back to the message history for context
      // add toolMessage before systemReminders as openAI expects each 
      // tool call to be followed by toolMessage
      this.messageManager.addTool(result, toolCallId);

      // Special handling for todo_manager tool
      if (toolName === 'todo_manager_tool' && parsedResult.ok && args.action !== 'list') {
        this.messageManager.addSystemReminder(
          `TODO list updated. Current state:\n${this.todoStore.getXml()}`
        );
        this.eventEmitter.info(formatTodoList(this.todoStore.getJson(), 'SubAgent'));
      }

      // Special handling for refresh_browser_state tool, add the browser state to the message history
      if (toolName === 'refresh_browser_state_tool' && parsedResult.ok) {
        // Add browser state as a system reminder that LLM should not print
        this.messageManager.addSystemReminder(parsedResult.output);
      }

      if (toolName === 'done_tool' && parsedResult.ok) {
        wasDoneCalled = true;
      }

      if (toolName === 'validator_tool' && parsedResult.ok) {
        wasValidatorCalled = true;
      }
    }

    return { wasDoneCalled, wasValidatorCalled };
  }
  
  private async _maybeAddSystemReminders(stepCount: number): Promise<void> {

    const suffixMessage = `\n\nCRITICAL: These are STRICTLY for your reference only and should NEVER be echoed back in your responses.`;
    let reminderMessage = ``;

    if (stepCount % 5 === 0 && stepCount > 0) {
      reminderMessage += `REMINDER: Use validator_tool check the progress of the task and re-plan using planner_tool.`;
    }
    if (this._getRandom(0.1)) {
      reminderMessage += `REMINDER: You can use screenshot_tool for visual reference of the page if you need more clarity.`;
    }
    
    if (this._getRandom(0.1)) {
      reminderMessage += `REMINDER: Ensure you are updating your todo_manager_tool frequently to track your progress and updating them as you complete steps.`;
    }

    if (reminderMessage.length > 0) {
      reminderMessage += suffixMessage;
      this.messageManager.addSystem(reminderMessage);
    }
  }

  private _getRandom(probability: number): boolean {
    return Math.random() < probability;
  }

  private async _validateTaskCompletion(task: string): Promise<{
    isComplete: boolean;
    reasoning: string;
    suggestions: string[];
  }> {
    const validatorTool = this.toolManager.get('validator_tool');
    if (!validatorTool) {
      return {
        isComplete: true,
        reasoning: 'Validation skipped - tool not available',
        suggestions: []
      };
    }

    const args = { task };
    try {
      this.eventEmitter.executingTool('validator_tool', args);
      const result = await validatorTool.func(args);
      const parsedResult = JSON.parse(result);

      // Format the validator output
      const validator_formatted_output = formatToolOutput('validator_tool', parsedResult);
      this.eventEmitter.toolEnd('validator_tool', parsedResult.ok, validator_formatted_output);

      if (parsedResult.ok) {
        // Parse the validation data from output
        const validationData = JSON.parse(parsedResult.output);
        return {
          isComplete: validationData.isComplete,
          reasoning: validationData.reasoning,
          suggestions: validationData.suggestions || []
        };
      }
    } catch (error) {
      const errorResult = { ok: false, error: 'Validation failed' };
      const error_formatted_output = formatToolOutput('validator_tool', errorResult);
      this.eventEmitter.toolEnd('validator_tool', false, error_formatted_output);
    }

    return {
      isComplete: true,
      reasoning: 'Validation failed - continuing execution',
      suggestions: []
    };
  }

  private async _generateSummary(): Promise<{ success: boolean; summary: string }> {
    try {
      // Get LLM instance
      const llm = await this.executionContext.getLLM({ temperature: 0.3 });
      
      // Get message history - filter to tool messages for conciseness
      const readOnlyMessageManager = new MessageManagerReadOnly(this.messageManager);
      const messageHistory = readOnlyMessageManager.getAll()
        .filter(m => m instanceof ToolMessage)
        .map(m => m.content)
        .join('\n');
      
      // Get final browser state
      const browserState = await this.executionContext.browserContext.getBrowserStateString();
      
      // Create prompt for summary generation
      const systemPrompt = `You are a task summarizer. Analyze the execution history and generate a brief summary.`;
      const taskPrompt = `Task: ${this.task}
Description: ${this.description}

Execution History:
${messageHistory}

Final Browser State:
${browserState}

Based on the execution history and final state, determine if the task was successfully completed and provide a brief 1-2 sentence summary of what was accomplished.`;
      
      // Get structured response from LLM
      const structuredLLM = llm.withStructuredOutput(SubAgentSummarySchema);
      const result = await structuredLLM.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(taskPrompt)
      ]) as { success: boolean; summary: string };
      
      return result;
    } catch (error) {
      // Fallback on error
      return {
        success: false,
        summary: 'Failed to generate summary'
      };
    }
  }
}
