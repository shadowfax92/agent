import { z } from 'zod'
import { getLLM } from '@/lib/llm/LangChainProvider'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { PLANNING_CONFIG } from '@/lib/tools/planning/PlannerTool.config'
import { generatePlannerSystemPrompt, generatePlannerTaskPrompt } from '@/lib/tools/planning/PlannerTool.prompt'
import { Logging } from '@/lib/utils/Logging'

// Here let's use a higher max steps
const MAX_PLANNER_STEPS = 20

// Structured plan schema (matches PlannerTool schema)
const PlanSchema = z.object({
  steps: z.array(
    z.object({
      action: z.string(),  // What to do
      reasoning: z.string()  // Why this step
    })
  )
})

export type StructuredPlan = z.infer<typeof PlanSchema>

export interface SimplePlan { goal?: string; steps: string[] }

type UpdateFn = (update: { status: 'queued' | 'started' | 'thinking' | 'done' | 'error'; content?: string; structured?: StructuredPlan; error?: string }) => void

/**
 * PlanGeneratorService
 * Stateless service that generates or refines plans using the configured LLM.
 * Does not rely on BrowserContext; uses the same prompts as PlannerTool for consistency.
 */
export class PlanGeneratorService {
  async generatePlan(input: string, opts?: { context?: string; maxSteps?: number; onUpdate?: UpdateFn }): Promise<StructuredPlan> {
    const maxSteps = opts?.maxSteps ?? MAX_PLANNER_STEPS
    const context = opts?.context ?? ''
    const onUpdate = opts?.onUpdate

    onUpdate?.({ status: 'started', content: 'Generating plan…' })

    // Compose prompts similar to PlannerTool but without browser state
    const systemPrompt = generatePlannerSystemPrompt(maxSteps)
    const conversation = context ? `Additional context provided by user:\n${context}` : ''
    const taskPrompt = generatePlannerTaskPrompt(input, maxSteps, conversation, 'N/A')

    const messages = [new SystemMessage(systemPrompt), new HumanMessage(taskPrompt)]
    onUpdate?.({ status: 'thinking', content: 'Calling LLM for plan…' })

    // Use structured output for reliability
    const llm = await getLLM()
    const structuredLLM = (llm as any).withStructuredOutput(PlanSchema)
    const plan = await structuredLLM.invoke(messages)

    Logging.log('PlanGeneratorService', `Generated plan with ${plan.steps?.length || 0} steps`, 'info')
    onUpdate?.({ status: 'done', content: 'Plan ready', structured: plan })
    return plan
  }

  async refinePlan(currentPlan: SimplePlan, feedback: string, opts?: { maxSteps?: number; onUpdate?: UpdateFn }): Promise<StructuredPlan> {
    const maxSteps = opts?.maxSteps ?? MAX_PLANNER_STEPS
    const onUpdate = opts?.onUpdate

    onUpdate?.({ status: 'started', content: 'Refining plan…' })

    // Build refinement context
    const planTextParts: string[] = []
    if (currentPlan.goal) planTextParts.push(`Goal: ${currentPlan.goal}`)
    if (currentPlan.steps?.length) {
      planTextParts.push('Current steps:')
      currentPlan.steps.forEach((s, i) => planTextParts.push(`${i + 1}. ${s}`))
    }
    if (feedback) {
      planTextParts.push('Refinement notes:')
      planTextParts.push(feedback)
    }
    const refinementContext = planTextParts.join('\n')

    // Compose prompts (reuse planner prompts)
    const systemPrompt = generatePlannerSystemPrompt(maxSteps)
    const taskPrompt = generatePlannerTaskPrompt(currentPlan.goal || 'Refine existing plan', maxSteps, refinementContext, 'N/A')

    const messages = [new SystemMessage(systemPrompt), new HumanMessage(taskPrompt)]
    onUpdate?.({ status: 'thinking', content: 'Calling LLM for refinement…' })

    const llm = await getLLM()
    const structuredLLM = (llm as any).withStructuredOutput(PlanSchema)
    const plan = await structuredLLM.invoke(messages)

    Logging.log('PlanGeneratorService', `Refined plan with ${plan.steps?.length || 0} steps`, 'info')
    onUpdate?.({ status: 'done', content: 'Plan refined', structured: plan })
    return plan
  }
}
