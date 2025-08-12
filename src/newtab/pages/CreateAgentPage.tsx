import React, { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { ChevronLeft, Play, Save, Trash2, Plus, X, Edit2 } from 'lucide-react'
import { useAgentsStore, Agent } from '@/newtab/stores/agentsStore'
import { useProviderStore } from '@/newtab/stores/providerStore'

// Validation schema for explicit checks
const CreateAgentSchema = z.object({
  name: z.string().min(2).max(50),  // Title of the agent
  description: z.string().max(200).optional(),  // Subtitle/description
  goal: z.string().min(10),  // Goal paragraph
  steps: z.array(z.string().min(1)),  // Instructions list
  notes: z.array(z.string()).optional()  // Notes list
})

interface CreateAgentPageProps {
  onBack: () => void
}

// Defaults and timings
const DEFAULT_TITLE = 'Untitled agent'
const DEFAULT_DESCRIPTION = ''
const AUTOSAVE_DEBOUNCE_MS = 600

// Template type definition
const TemplateSchema = z.object({
  id: z.string(),  // template id
  name: z.string(),  // display name
  description: z.string().default(''),  // short description
  goal: z.string(),  // goal paragraph
  steps: z.array(z.string()),  // steps list
  notes: z.array(z.string()).default([])  // notes list
})
type Template = z.infer<typeof TemplateSchema>

export function CreateAgentPage ({ onBack }: CreateAgentPageProps) {
  const { agents, addAgent, updateAgent, deleteAgent } = useAgentsStore()
  const { executeAgent } = useProviderStore()

  // Editor state
  const [mode, setMode] = useState<'index' | 'editor'>('index')
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [name, setName] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [goal, setGoal] = useState<string>('')
  const [instructions, setInstructions] = useState<string[]>([''])
  const [notes, setNotes] = useState<string[]>([''])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [headerNotification, setHeaderNotification] = useState<string>('')

  // Derived display title without using inline defaults
  const displayTitle: string = useMemo(() => {
    return name.trim().length > 0 ? name : DEFAULT_TITLE
  }, [name])

  // Track when we're waiting for a new agent to be saved
  const [waitingForNewAgent, setWaitingForNewAgent] = useState<string | null>(null)
  const [skipDraftLoad, setSkipDraftLoad] = useState<boolean>(false)

  // Watch for new agent creation
  useEffect(() => {
    if (waitingForNewAgent && agents.length > 0) {
      const newAgent = agents.find(a => a.name === waitingForNewAgent)
      if (newAgent) {
        setActiveAgentId(newAgent.id)
        setWaitingForNewAgent(null)
      }
    }
  }, [agents, waitingForNewAgent])

  // Load draft on mount if no agent selected
  useEffect(() => {
    if (activeAgentId !== null || skipDraftLoad || mode !== 'editor') return
    const raw: string | null = localStorage.getItem('agent-draft')
    if (!raw) return
    try {
      const draft: unknown = JSON.parse(raw)
      const schema = z.object({
        name: z.string().default(''),
        description: z.string().default(''),
        goal: z.string().default(''),
        steps: z.array(z.string()).default(['']),
        notes: z.array(z.string()).default([''])
      })
      const safe = schema.parse(draft)
      // Only load draft if fields are empty (not coming from template)
      if (!name && !description && !goal) {
        setName(safe.name)
        setDescription(safe.description)
        setGoal(safe.goal)
        setInstructions(safe.steps.length > 0 ? safe.steps : [''])
        setNotes(safe.notes.length > 0 ? safe.notes : [''])
      }
    } catch {
      // ignore invalid draft
    }
  }, [activeAgentId, skipDraftLoad, mode, name, description, goal])

  // Autosave draft to localStorage
  useEffect(() => {
    // When user starts editing, allow draft loading again
    if (skipDraftLoad && (name || description || goal || instructions.some(i => i) || notes.some(n => n))) {
      setSkipDraftLoad(false)
    }
    const handle = setTimeout(() => {
      const draft = { name, description, goal, steps: instructions, notes }
      localStorage.setItem('agent-draft', JSON.stringify(draft))
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [name, description, goal, instructions, notes, skipDraftLoad])

  // Show notification when new agent needs saving
  useEffect(() => {
    if (mode === 'editor' && !activeAgentId && !headerNotification) {
      setHeaderNotification('Save to enable Run')
    }
  }, [mode, activeAgentId, headerNotification])

  // Helpers for list editors
  const instructionRefs = useRef<Array<HTMLTextAreaElement | null>>([])
  const noteRefs = useRef<Array<HTMLTextAreaElement | null>>([])

  const autoResize = (el: HTMLTextAreaElement): void => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const handleListKey = (
    params: {
      e: React.KeyboardEvent<HTMLTextAreaElement>,
      index: number,
      items: string[],
      setItems: (next: string[]) => void,
      refs: React.MutableRefObject<Array<HTMLTextAreaElement | null>>
    }
  ): void => {
    const { e, index, items, setItems, refs } = params
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const current = items[index]
      const next = [...items]
      if (current.trim().length === 0) return
      next.splice(index + 1, 0, '')
      setItems(next)
      setTimeout(() => refs.current[index + 1]?.focus(), 0)
      return
    }
    if (e.key === 'Backspace') {
      const value = items[index]
      const selectionStart = (e.target as HTMLTextAreaElement).selectionStart || 0
      if (value.length === 0 || (value.trim().length === 0 && selectionStart === 0)) {
        if (items.length <= 1) return
        e.preventDefault()
        const next = items.filter((_, i) => i !== index)
        setItems(next)
        const focusIndex = Math.max(0, index - 1)
        setTimeout(() => {
          const target = refs.current[focusIndex]
          if (target) {
            target.focus()
            target.selectionStart = target.value.length
            target.selectionEnd = target.value.length
          }
        }, 0)
      }
    }
  }

  // Load an existing agent into the editor
  const loadAgent = (agent: Agent): void => {
    setSkipDraftLoad(true)  // Prevent draft from overwriting
    setMode('editor')
    setActiveAgentId(agent.id)
    setName(agent.name)
    setDescription(agent.description)
    setGoal(agent.goal)
    setInstructions(agent.steps.length > 0 ? agent.steps : [''])
    setNotes(agent.notes && agent.notes.length > 0 ? agent.notes : [''])
    setErrors({})
    setHeaderNotification('')  // Clear any notifications when loading existing agent
    // Allow draft loading again after data is set
    setTimeout(() => setSkipDraftLoad(false), 100)
  }

  // Create new blank editor
  const newAgent = (): void => {
    // Set flag to prevent draft loading
    setSkipDraftLoad(true)
    // Clear all fields first
    setName('')
    setDescription('')
    setGoal('')
    setInstructions([''])
    setNotes([''])
    setErrors({})
    setActiveAgentId(null)
    setWaitingForNewAgent(null)
    // Clear localStorage draft for fresh start
    localStorage.removeItem('agent-draft')
    // Then switch to editor mode
    setMode('editor')
    // Show save notification for new agents
    setHeaderNotification('Save to enable Run')
    // Allow draft loading again after fields are set
    setTimeout(() => setSkipDraftLoad(false), 100)
  }

  // Save to store (create or update)  
  const handleSave = (): void => {
    setErrors({})
    const filteredSteps: string[] = instructions.filter(s => s.trim().length > 0)
    const filteredNotes: string[] = notes.filter(n => n.trim().length > 0)
    try {
      const payload = CreateAgentSchema.parse({
        name: name,
        description: description,
        goal: goal,
        steps: filteredSteps,
        notes: filteredNotes
      })
      const normalizedDescription: string = payload.description ?? DEFAULT_DESCRIPTION
      if (activeAgentId) {
        updateAgent(activeAgentId, {
          ...payload,
          description: normalizedDescription,
          notes: filteredNotes,
          tools: []
        })
      } else {
        // Generate unique name if duplicate exists
        let finalName = payload.name
        const existingNames = agents.map(a => a.name)
        if (existingNames.includes(finalName)) {
          // Find the next available number suffix
          let counter = 1
          while (existingNames.includes(`${payload.name} #${counter}`)) {
            counter++
          }
          finalName = `${payload.name} #${counter}`
        }
        
        // Create new agent with unique name
        setWaitingForNewAgent(finalName)
        addAgent({
          ...payload,
          name: finalName,
          description: normalizedDescription,
          notes: filteredNotes,
          tools: [],
          isPinned: false,
          lastUsed: null
        })
      }
      // Show saved notification briefly
      setHeaderNotification('Saved')
      setTimeout(() => setHeaderNotification(''), 2500)
    } catch (err) {
      if (err instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {}
        err.errors.forEach(issue => {
          const key = String(issue.path[0])
          fieldErrors[key] = issue.message
        })
        setErrors(fieldErrors)
      }
    }
  }

  // Run agent only when editing an existing one
  const handleRun = async (): Promise<void> => {
    if (!activeAgentId) return
    const agent = agents.find(a => a.id === activeAgentId)
    if (!agent) return
    await executeAgent(agent, agent.goal)
  }

  // Delete agent
  const handleDelete = (id: string): void => {
    const confirmed: boolean = window.confirm('Delete this agent?')
    if (!confirmed) return
    deleteAgent(id)
    if (activeAgentId === id) newAgent()
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const isCmd = e.metaKey || e.ctrlKey
      if (isCmd && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSave()
      }
      if (isCmd && e.key === 'Enter') {
        e.preventDefault()
        handleRun()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeAgentId, name, description, goal, instructions, notes])


  // ---------- Templates ----------

  const TEMPLATES: Template[] = [
    {
      id: 'cust-support',
      name: 'Customer Support Agent',
      description: 'Answer questions using docs and Slack threads',
      goal: 'Maintain a knowledge base of internal documentation and answer basic user questions when mentioned in external spaces.',
      steps: [
        'Search the indexed knowledge base, Slack channels, and Notion pages to find relevant information.',
        'Provide a concise response with references to the documentation sources.',
        'If information is missing, suggest alternative resources.'
      ],
      notes: ['Keep responses concise and to the point.']
    },
    {
      id: 'news-summariser',
      name: 'Google News Summariser',
      description: 'Summarise top news with clear bullet points',
      goal: 'Summarise top news in 10 bullet points with clear language and emojis when helpful.',
      steps: ['Go to Google News', 'Extract top headlines', 'Summarise into bullet points'],
      notes: []
    },
    {
      id: 'weekly-report',
      name: 'Weekly Activity Summary',
      description: 'Compile activity updates across sources',
      goal: 'Create a weekly summary of activity, progress and highlights across selected tools.',
      steps: ['Collect updates', 'Group by theme', 'Generate summary and highlights'],
      notes: []
    },
    {
      id: 'calendar-digest',
      name: 'Calendar Daily Digest',
      description: 'Morning brief with your meetings and materials',
      goal: 'Send a concise daily brief about upcoming meetings with links and prep notes.',
      steps: ['Read today’s calendar', 'Pull context from docs/emails', 'Compose a brief summary'],
      notes: []
    },
    {
      id: 'sales-pipeline',
      name: 'Sales Pipeline Update',
      description: 'Summarise changes and next actions',
      goal: 'Produce a short pipeline update with wins, risks, and next steps.',
      steps: ['Fetch CRM changes', 'Group by stage', 'List next actions'],
      notes: []
    },
    {
      id: 'company-summary',
      name: 'Company Summary From Docs',
      description: 'Weekly internal summary for leadership',
      goal: 'Generate a weekly company summary from selected folders and notes.',
      steps: ['Scan docs and notes', 'Extract highlights', 'Create structured summary'],
      notes: []
    },
    {
      id: 'meeting-notes',
      name: 'Meeting Notes Summariser',
      description: 'Turn transcripts into crisp notes',
      goal: 'Summarise meeting transcripts into action items and decisions.',
      steps: ['Parse transcript', 'Extract actions + owners', 'Generate summary with follow‑ups'],
      notes: []
    },
    {
      id: 'research-signups',
      name: 'Research New Signups',
      description: 'Qualify new users with quick research',
      goal: 'Research and qualify new signups from CRM or form responses.',
      steps: ['Gather signup data', 'Look up public info', 'Create a short profile + score'],
      notes: []
    },
    {
      id: 'expense-report',
      name: 'Expense Report From Emails',
      description: 'Collect receipts and prepare a report',
      goal: 'Aggregate receipts from email to a simple monthly spreadsheet.',
      steps: ['Find receipts', 'Extract totals and vendors', 'Create monthly CSV'],
      notes: []
    },
    {
      id: 'promo-finder',
      name: 'Promo Code Finder',
      description: 'Find current promo/discount codes',
      goal: 'Search the web for current promo or discount codes for the active site.',
      steps: ['Identify site/store', 'Search for valid codes', 'Return best code + how to apply'],
      notes: []
    }
  ]

  const useTemplate = (tpl: Template): void => {
    // Clear localStorage draft to prevent it from loading
    localStorage.removeItem('agent-draft')
    setSkipDraftLoad(true)  // Prevent draft from overwriting template
    setActiveAgentId(null)
    // Set template data
    setName(tpl.name)
    setDescription(tpl.description || '')
    setGoal(tpl.goal)
    setInstructions(tpl.steps.length > 0 ? tpl.steps : [''])
    setNotes(tpl.notes.length > 0 ? tpl.notes : [''])
    setErrors({})
    setHeaderNotification('Save to enable Run')  // Show save notification for templates
    // Switch to editor mode after setting data
    setMode('editor')
    // Keep skipDraftLoad true permanently for this session
  }

  // ---------- Render ----------

  return (
    <div className='h-screen flex flex-col bg-white'>
      {/* Top header */}
      <header className='sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur'>
        <div className='h-12 px-4 flex items-center justify-between gap-4'>
          <div className='flex items-center gap-2'>
            <button onClick={mode === 'editor' ? () => setMode('index') : onBack} className='p-1.5 rounded hover:bg-accent' aria-label='Go back'>
              <ChevronLeft className='w-5 h-5' />
            </button>
            <div className='flex items-center gap-1.5 text-sm'>
              <button onClick={() => setMode('index')} className='font-medium hover:underline'>Agents</button>
              {mode === 'editor' && (
                <>
                  <span className='text-muted-foreground'>›</span>
                  <span className='font-medium'>{activeAgentId ? displayTitle : 'New'}</span>
                </>
              )}
            </div>
          </div>
          <div className='flex items-center gap-3'>
            {mode === 'editor' ? (
              <>
                {headerNotification && (
                  <span className='text-xs text-muted-foreground'>{headerNotification}</span>
                )}
                <button 
                  onClick={handleRun} 
                  disabled={!activeAgentId} 
                  className='px-3 py-1.5 text-sm rounded text-white disabled:opacity-50 disabled:cursor-not-allowed bg-[hsl(var(--brand))]'
                >
                  <Play className='w-4 h-4 inline mr-1' /> Run
                </button>
                <button 
                  onClick={handleSave} 
                  className='px-3 py-1.5 text-sm rounded border border-border hover:bg-accent transition-colors'
                >
                  <Save className='w-4 h-4 inline mr-1' /> Save
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {/* Template Preview Modal */}
      {selectedTemplate && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm' onClick={() => setSelectedTemplate(null)}>
          <div className='bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-6 max-h-[85vh] overflow-hidden' onClick={(e) => e.stopPropagation()}>
            {/* Modal Content */}
            <div className='px-10 py-10 overflow-y-auto max-h-[calc(85vh-80px)]'>
              {/* Title */}
              <h1 className='text-[32px] font-semibold tracking-tight mb-2'>{selectedTemplate.name}</h1>
              {selectedTemplate.description && (
                <p className='text-[15px] text-gray-600 mb-6'>{selectedTemplate.description}</p>
              )}
              
              {/* Use Agent Button */}
              <button 
                onClick={() => {
                  useTemplate(selectedTemplate)
                  setSelectedTemplate(null)
                }}
                className='mb-8 px-3 py-1.5 text-sm rounded-md text-white bg-[hsl(var(--brand))] hover:bg-[hsl(var(--brand)/0.9)] transition-colors'
              >
                Use agent
              </button>
              
              {/* Goal Section */}
              <div className='mb-8'>
                <div className='mb-3'>
                  <span className='inline-block text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium'>Goal:</span>
                </div>
                <p className='text-[15px] leading-relaxed text-gray-800'>{selectedTemplate.goal}</p>
              </div>
              
              {/* Steps Section */}
              <div className='mb-8'>
                <div className='mb-3'>
                  <span className='inline-block text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium'>
                    Steps: <span className='text-gray-500 font-normal ml-1'>{selectedTemplate.steps.length} step{selectedTemplate.steps.length === 1 ? '' : 's'}</span>
                  </span>
                </div>
                <ol className='space-y-2.5'>
                  {selectedTemplate.steps.map((step, i) => (
                    <li key={i} className='flex gap-3'>
                      <span className='text-[15px] text-gray-500 select-none'>{i + 1}.</span>
                      <p className='text-[15px] leading-relaxed text-gray-800 flex-1'>{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
              
              {/* Notes Section */}
              {selectedTemplate.notes && selectedTemplate.notes.length > 0 && (
                <div>
                  <div className='mb-3'>
                    <span className='inline-block text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium'>Notes:</span>
                  </div>
                  <ul className='space-y-2'>
                    {selectedTemplate.notes.map((note, i) => (
                      <li key={i} className='flex gap-3'>
                        <span className='text-gray-500 select-none'>•</span>
                        <p className='text-[15px] leading-relaxed text-gray-800 flex-1'>{note}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            {/* Close button */}
            <button 
              onClick={() => setSelectedTemplate(null)}
              className='absolute top-6 right-6 p-1.5 rounded-lg hover:bg-gray-100 transition-colors'
              aria-label='Close'
            >
              <X className='w-5 h-5 text-gray-500' />
            </button>
          </div>
        </div>
      )}

      {/* Index view */}
      {mode === 'index' && (
        <div className='flex-1 overflow-y-auto'>
          <div className='mx-auto max-w-[1100px] px-10 py-10 space-y-10'>
            {/* Existing agents */}
            <section>
              <div className='flex items-center justify-between mb-3'>
                <h2 className='text-[18px] font-semibold tracking-tight'>Your agents</h2>
                <button onClick={newAgent} className='px-3 py-1.5 text-sm rounded-md text-white bg-[hsl(var(--brand))] hover:bg-[hsl(var(--brand)/0.9)] transition-colors'>
                  <Plus className='w-4 h-4 inline mr-1' /> New agent
                </button>
              </div>
              {agents.length === 0 ? (
                <div className='text-sm text-muted-foreground'>No agents yet.</div>
              ) : (
                <div className='grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'>
                  {agents.map((a) => (
                    <div key={a.id} className='rounded border border-border bg-card p-3.5 hover:shadow-sm hover:-translate-y-[1px] transition will-change-transform flex h-[120px] flex-col'>
                      <div className='text-[16px] font-semibold mb-1 line-clamp-1'>{a.name}</div>
                      <div className='text-[14px] text-muted-foreground line-clamp-2 flex-1'>{a.description || 'No description'}</div>
                      <div className='mt-2 flex items-center justify-between'>
                        <span className='text-xs text-muted-foreground px-1.5 py-0.5 rounded border'>{a.steps.length} step{a.steps.length === 1 ? '' : 's'}</span>
                        <div className='flex items-center gap-1'>
                          <button
                            className='p-1.5 rounded hover:bg-accent transition-colors'
                            onClick={() => loadAgent(a)}
                            aria-label='Edit agent'
                          >
                            <Edit2 className='w-4 h-4 text-muted-foreground' />
                          </button>
                          <button
                            className='p-1.5 rounded hover:bg-accent transition-colors'
                            onClick={() => handleDelete(a.id)}
                            aria-label='Delete agent'
                          >
                            <Trash2 className='w-4 h-4 text-muted-foreground' />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Templates */}
            <section>
              <h2 className='text-[18px] font-semibold tracking-tight mb-4'>Templates</h2>
              <div className='grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'>
                {TEMPLATES.map(tpl => (
                  <div 
                    key={tpl.id} 
                    className='rounded border border-border bg-card p-3.5 hover:shadow-sm hover:-translate-y-[1px] transition will-change-transform flex h-[120px] flex-col cursor-pointer'
                    onClick={() => setSelectedTemplate(tpl)}
                  >
                    <div className='text-[16px] font-semibold mb-1'>{tpl.name}</div>
                    <div className='text-[14px] text-muted-foreground line-clamp-2 flex-1'>{tpl.description}</div>
                    <div className='mt-2 flex items-center justify-between'>
                      <span className='text-xs text-muted-foreground px-1.5 py-0.5 rounded border'>{tpl.steps.length} steps</span>
                      <button
                        className='px-3 py-1.5 text-sm rounded border border-[hsl(var(--brand))] text-[hsl(var(--brand))] hover:bg-[hsl(var(--brand)/0.08)]'
                        onClick={(e) => {
                          e.stopPropagation()
                          useTemplate(tpl)
                        }}
                      >
                        Use
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Editor view */}
      {mode === 'editor' && (
      <div className='flex flex-1 min-h-0'>
        {/* Left sidebar - minimal workspace */}
        <aside className='w-[272px] border-r border-border overflow-y-auto'>
          <div className='px-3 py-3'>
            <button onClick={newAgent} className='w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded border border-border hover:bg-accent'>
              <Plus className='w-4 h-4' /> New agent
            </button>
          </div>
          <div className='px-2 pb-4 space-y-1'>
            {agents.map(a => (
              <div key={a.id} className={`group px-3 py-2 rounded cursor-pointer ${activeAgentId === a.id ? 'bg-accent' : 'hover:bg-accent'}`} onClick={() => loadAgent(a)}>
                <div className='flex items-center justify-between'>
                  <span className='text-sm'>{a.name}</span>
                  <button className='opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background' aria-label='Delete' onClick={(e) => { e.stopPropagation(); handleDelete(a.id) }}>
                    <Trash2 className='w-4 h-4 text-muted-foreground' />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Center canvas */}
        <main className='flex-1 overflow-y-auto'>
          <div className='mx-auto max-w-[820px] px-10 py-10'>
            {/* Title */}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Untitled agent'
              className='w-full text-[34px] font-semibold tracking-tight outline-none placeholder:text-muted-foreground'
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Add a short description…'
              className='w-full mt-2 text-[15px] text-muted-foreground outline-none placeholder:text-muted-foreground'
            />

            {/* Goal */}
            <section aria-label='Goal' className='mt-8'>
              <div className='mb-2'>
                <span className='inline-block text-[11px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground'>Goal:</span>
              </div>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Maintain a knowledge base of internal documentation and answer basic user questions when mentioned in external spaces."
                rows={3}
                className={`w-full min-h-[28px] text-[16px] leading-7 outline-none resize-none placeholder:text-muted-foreground ${errors.goal ? 'ring-1 ring-red-500/60 rounded' : ''}`}
                onInput={(e) => autoResize(e.currentTarget)}
              />
              {errors.goal && <div className='text-xs text-red-600 mt-1'>{errors.goal}</div>}
            </section>

            {/* Steps */}
            <section aria-label='Steps' className='mt-6'>
              <div className='flex items-center gap-2 mb-2'>
                <span className='inline-block text-[11px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground'>Steps:</span>
                <div className='text-[11px] text-muted-foreground'>
                  {instructions.filter(s => s.trim().length > 0).length} step{instructions.filter(s => s.trim().length > 0).length === 1 ? '' : 's'}
                </div>
              </div>
              <div className='space-y-1'>
                {instructions.map((text, i) => (
                  <div key={i} className='flex items-start gap-3'>
                    <span className='mt-1.5 min-w-[20px] text-[14px] text-muted-foreground select-none'>{i + 1}.</span>
                    <textarea
                      ref={el => { instructionRefs.current[i] = el }}
                      value={text}
                      onChange={(e) => {
                        const next = [...instructions]
                        next[i] = e.target.value
                        setInstructions(next)
                        autoResize(e.currentTarget)
                      }}
                      onKeyDown={(e) => handleListKey({ e, index: i, items: instructions, setItems: setInstructions, refs: instructionRefs })}
                      placeholder={i === 0 ? 'When mentioned… analyze the user’s question.' : 'Describe this step…'}
                      className='w-full min-h-[28px] text-[16px] leading-7 outline-none resize-none placeholder:text-muted-foreground'
                      rows={1}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Notes */}
            <section aria-label='Notes' className='mt-6 mb-28'>
              <div className='mb-2'>
                <span className='inline-block text-[11px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground'>Notes:</span>
              </div>
              <div className='space-y-1'>
                {notes.map((text, i) => (
                  <div key={i} className='pl-6 relative'>
                    <span className='absolute left-0 top-1 text-muted-foreground'>•</span>
                    <textarea
                      ref={el => { noteRefs.current[i] = el }}
                      value={text}
                      onChange={(e) => {
                        const next = [...notes]
                        next[i] = e.target.value
                        setNotes(next)
                        autoResize(e.currentTarget)
                      }}
                      onKeyDown={(e) => handleListKey({ e, index: i, items: notes, setItems: setNotes, refs: noteRefs })}
                      placeholder={i === 0 ? 'Keep responses concise and to the point.' : 'Add note…'}
                      className='w-full min-h-[28px] text-[16px] leading-7 outline-none resize-none placeholder:text-muted-foreground'
                      rows={1}
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
          {/* Bottom builder removed */}
        </main>
        {/* Right panel removed */}
      </div>
      )}
    </div>
  )
}