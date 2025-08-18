import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Cog, Hammer, Send } from 'lucide-react'

interface ParsedPlan { goal: string; steps: string[] }

interface PlanGeneratorProps {
  className?: string
  onReplacePlan?: (plan: ParsedPlan) => void
  onAppendSteps?: (steps: string[]) => void
  onReplaceGoal?: (goal: string) => void
  getCurrentPlan?: () => ParsedPlan | null
}

export function PlanGenerator ({
  className,
  onReplacePlan,
  onAppendSteps,
  onReplaceGoal,
  getCurrentPlan
}: PlanGeneratorProps) {
  const [activeTab, setActiveTab] = useState<'configuration' | 'builder'>('builder')
  const [freeText, setFreeText] = useState<string>('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea when opened
  useEffect(() => {
    if (inputRef.current && activeTab === 'builder') inputRef.current.focus()
  }, [activeTab])

  const currentPlan = useMemo(() => (getCurrentPlan ? getCurrentPlan() : null), [getCurrentPlan])

  // Parse free text into goal + steps with simple heuristics
  const parsePlan = (text: string): ParsedPlan => {
    const raw = text.replace(/\r\n/g, '\n')
    // Support explicit sections if present
    const goalMatch = raw.match(/(^|\n)\s*goal\s*[:\-]\s*(.+)/i)
    const stepsMatch = raw.match(/(^|\n)\s*steps?\s*[:\-]\s*([\s\S]+)/i)

    let goal = ''
    let steps: string[] = []

    if (goalMatch) {
      goal = goalMatch[2].trim()
    }

    if (stepsMatch) {
      const tail = stepsMatch[2]
      steps = tail
        .split('\n')
        .map(s => s.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
        .filter(Boolean)
    }

    if (!goal || steps.length === 0) {
      // Fallback: first non-empty line is goal, rest are steps (bullets or lines)
      const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
      if (!goal) goal = lines[0] || ''
      if (steps.length === 0) {
        steps = lines.slice(1).map(s => s.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim()).filter(Boolean)
      }
    }

    return { goal, steps }
  }

  const generateMockPlan = (): ParsedPlan => {
    const mocks: ParsedPlan[] = [
      {
        goal: 'Launch a product landing page',
        steps: [
          'Define value prop and target persona',
          'Draft copy and hero CTA',
          'Assemble screenshots and illustrations',
          'Build responsive layout and form',
          'Ship, instrument analytics, and collect feedback'
        ]
      },
      {
        goal: 'Research and qualify new signups',
        steps: [
          'Gather signup metadata and company domain',
          'Enrich with LinkedIn and Crunchbase',
          'Score fit by ICP criteria',
          'Summarize profile and next step'
        ]
      },
      {
        goal: 'Create weekly content pipeline',
        steps: [
          'Ideate themes and topics',
          'Outline briefs for 3 posts',
          'Draft, edit, and schedule',
          'Publish and track performance'
        ]
      }
    ]
    const i = Math.floor(Math.random() * mocks.length)
    return mocks[i]
  }

  const handleSendPlan = (): void => {
    const plan = freeText.trim() ? parsePlan(freeText) : generateMockPlan()
    onReplacePlan && onReplacePlan(plan)
    setFreeText('')
    if (inputRef.current) inputRef.current.focus()
  }

  return (
    <div className={"h-full flex flex-col bg-background-alt " + (className || '')}>
      {/* Header with single Builder tab (Configuration hidden for now) */}
      <div className="border-b border-border">
        <div className="flex items-center">
          <div className="flex-1 px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium text-foreground bg-background relative">
            <Hammer className="w-4 h-4" />
            Plan Generator
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          </div>
        </div>
      </div>

      {/* Builder content only */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {currentPlan && (currentPlan.goal || currentPlan.steps.length > 0) && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs font-medium text-muted-foreground mb-2">CURRENT PLAN</div>
                {currentPlan.goal && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Goal</div>
                    <div className="text-sm font-medium">{currentPlan.goal}</div>
                  </div>
                )}
                {currentPlan.steps.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">Steps</div>
                    <ol className="list-decimal list-inside space-y-1">
                      {currentPlan.steps.map((step, i) => (
                        <li key={i} className="text-sm text-muted-foreground">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              Welcome back! How can I improve {currentPlan?.goal || 'your agent'}?
            </div>
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-border p-4">
          <div className="relative">
            <textarea
              ref={inputRef}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Create an agent that can..."
              className="w-full min-h-[80px] max-h-40 resize-none px-4 py-3 pr-12 text-sm border border-border rounded-lg bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendPlan()
                }
              }}
            />
            <button
              onClick={handleSendPlan}
              className="absolute bottom-3 right-3 p-2 rounded-md hover:bg-accent transition-colors"
              aria-label="Send plan"
            >
              <Send className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
