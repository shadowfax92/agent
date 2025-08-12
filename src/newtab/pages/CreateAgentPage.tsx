import React, { useState } from 'react'
import { useAgentsStore, Agent } from '../stores/agentsStore'
import { ChevronLeft, Save, Plus, X, Bot, Trash2, Copy, Edit } from 'lucide-react'
import { z } from 'zod'

// Form validation schema
const CreateAgentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  description: z.string().max(200, 'Description must be less than 200 characters'),
  goal: z.string().min(10, 'Goal must be at least 10 characters'),
  steps: z.array(z.string().min(1))
})

interface CreateAgentPageProps {
  onBack: () => void
}

export function CreateAgentPage({ onBack }: CreateAgentPageProps) {
  const { agents, addAgent, deleteAgent, updateAgent } = useAgentsStore()
  
  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [goal, setGoal] = useState('')
  const [steps, setSteps] = useState<string[]>([''])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  
  // Handle step changes
  const updateStep = (index: number, value: string) => {
    const newSteps = [...steps]
    newSteps[index] = value
    setSteps(newSteps)
  }
  
  const addStep = () => {
    setSteps([...steps, ''])
  }
  
  const removeStep = (index: number) => {
    if (steps.length > 1) {
      setSteps(steps.filter((_, i) => i !== index))
    }
  }
  
  // Load agent as template
  const loadAgentAsTemplate = (agent: Agent) => {
    setName(agent.name)
    setDescription(agent.description)
    setGoal(agent.goal)
    setSteps(agent.steps.length > 0 ? [...agent.steps] : [''])
    setSelectedAgentId(agent.id)
    setEditingAgentId(null)
    setErrors({})
  }
  
  // Load agent for editing
  const loadAgentForEdit = (agent: Agent) => {
    setName(agent.name)
    setDescription(agent.description)
    setGoal(agent.goal)
    setSteps(agent.steps.length > 0 ? [...agent.steps] : [''])
    setSelectedAgentId(agent.id)
    setEditingAgentId(agent.id)
    setErrors({})
  }
  
  // Clear form
  const clearForm = () => {
    setName('')
    setDescription('')
    setGoal('')
    setSteps([''])
    setSelectedAgentId(null)
    setEditingAgentId(null)
    setErrors({})
  }
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setIsSubmitting(true)
    
    try {
      // Filter out empty steps
      const filteredSteps = steps.filter(step => step.trim().length > 0)
      
      // Validate form data
      const formData = CreateAgentSchema.parse({
        name,
        description,
        goal,
        steps: filteredSteps
      })
      
      if (editingAgentId) {
        // Update existing agent
        updateAgent(editingAgentId, {
          ...formData,
          tools: []
        })
      } else {
        // Add new agent
        addAgent({
          ...formData,
          tools: [],
          isPinned: false,
          lastUsed: null
        })
      }
      
      // Clear form after success
      clearForm()
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {}
        error.errors.forEach(err => {
          const field = err.path[0] as string
          fieldErrors[field] = err.message
        })
        setErrors(fieldErrors)
      }
    } finally {
      setIsSubmitting(false)
    }
  }
  
  // Handle agent deletion
  const handleDeleteAgent = (agentId: string) => {
    if (confirm('Are you sure you want to delete this agent?')) {
      deleteAgent(agentId)
      if (selectedAgentId === agentId) {
        clearForm()
      }
    }
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="px-6 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">Manage Agents</h1>
          </div>
        </div>
      </header>
      
      {/* Main Content - Two Column Layout */}
      <main className="flex h-[calc(100vh-65px)]">
        {/* Left Column - Agents List */}
        <div className="w-96 border-r border-border bg-muted/30 overflow-y-auto">
          <div className="p-6">
            <div className="mb-4">
              <h2 className="text-lg font-medium mb-1">Your Agents</h2>
              <p className="text-sm text-muted-foreground">
                {agents.length} agent{agents.length !== 1 ? 's' : ''} created
              </p>
            </div>
            
            {/* Agents List */}
            <div className="space-y-3">
              {agents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No agents created yet</p>
                  <p className="text-xs mt-2">Create your first agent using the form</p>
                </div>
              ) : (
                agents.map(agent => (
                  <div
                    key={agent.id}
                    onClick={() => loadAgentForEdit(agent)}
                    className={`
                      group relative p-4 rounded-lg border transition-all cursor-pointer
                      ${selectedAgentId === agent.id
                        ? 'bg-primary/10 border-primary shadow-sm'
                        : 'bg-card border-border hover:bg-accent/50'
                      }
                    `}
                  >
                    <div className="pr-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Bot className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">
                          {agent.name}
                        </span>
                      </div>
                      {agent.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {agent.description}
                        </p>
                      )}
                      {agent.steps.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {agent.steps.length} step{agent.steps.length !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    
                    {/* Action Buttons - Always visible when selected or on hover */}
                    <div className={`
                      flex items-center gap-1 mt-3 pt-3 border-t border-border
                      ${selectedAgentId === agent.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                      transition-opacity
                    `}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          loadAgentAsTemplate(agent)
                        }}
                        className="flex-1 flex items-center justify-center gap-1 p-1.5 rounded text-xs hover:bg-accent transition-colors"
                        title="Copy as template"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          loadAgentForEdit(agent)
                        }}
                        className="flex-1 flex items-center justify-center gap-1 p-1.5 rounded text-xs hover:bg-accent transition-colors"
                        title="Edit agent"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteAgent(agent.id)
                        }}
                        className="flex-1 flex items-center justify-center gap-1 p-1.5 rounded text-xs hover:bg-destructive/20 text-destructive transition-colors"
                        title="Delete agent"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        {/* Right Column - Create/Edit Form */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-8">
            {/* Form Header */}
            <div>
              <h2 className="text-lg font-medium mb-2">
                {editingAgentId ? 'Edit Agent' : 'Create New Agent'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {editingAgentId 
                  ? 'Modify the selected agent'
                  : 'Define a new agent or use an existing one as a template'
                }
              </p>
            </div>
            
            {/* Basic Information */}
            <section className="space-y-4">
              <h3 className="text-base font-medium">Basic Information</h3>
              
              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-2">
                  Agent Name *
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., research-assistant"
                  className={`
                    w-full px-4 py-2 rounded-lg
                    bg-card border ${errors.name ? 'border-red-500' : 'border-border'}
                    focus:outline-none focus:ring-2 focus:ring-primary
                  `}
                  required
                />
                {errors.name && (
                  <p className="text-red-500 text-sm mt-1">{errors.name}</p>
                )}
              </div>
              
              {/* Description */}
              <div>
                <label htmlFor="description" className="block text-sm font-medium mb-2">
                  Description
                </label>
                <input
                  id="description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of what this agent does"
                  className={`
                    w-full px-4 py-2 rounded-lg
                    bg-card border ${errors.description ? 'border-red-500' : 'border-border'}
                    focus:outline-none focus:ring-2 focus:ring-primary
                  `}
                />
                {errors.description && (
                  <p className="text-red-500 text-sm mt-1">{errors.description}</p>
                )}
              </div>
              
              {/* Goal */}
              <div>
                <label htmlFor="goal" className="block text-sm font-medium mb-2">
                  Goal *
                </label>
                <textarea
                  id="goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Describe the agent's primary objective..."
                  rows={3}
                  className={`
                    w-full px-4 py-2 rounded-lg
                    bg-card border ${errors.goal ? 'border-red-500' : 'border-border'}
                    focus:outline-none focus:ring-2 focus:ring-primary
                    resize-none
                  `}
                  required
                />
                {errors.goal && (
                  <p className="text-red-500 text-sm mt-1">{errors.goal}</p>
                )}
              </div>
            </section>
            
            {/* Steps */}
            <section className="space-y-4">
              <h3 className="text-base font-medium">Execution Steps</h3>
              <p className="text-sm text-muted-foreground">
                Define the steps this agent will follow
              </p>
              
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="text-sm text-muted-foreground pt-2">
                      {index + 1}.
                    </span>
                    <input
                      type="text"
                      value={step}
                      onChange={(e) => updateStep(index, e.target.value)}
                      placeholder="Describe this step..."
                      className="
                        flex-1 px-4 py-2 rounded-lg
                        bg-card border border-border
                        focus:outline-none focus:ring-2 focus:ring-primary
                      "
                    />
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        className="p-2 rounded-lg hover:bg-accent transition-colors"
                        aria-label="Remove step"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              
              <button
                type="button"
                onClick={addStep}
                className="
                  flex items-center gap-2 px-4 py-2 rounded-lg
                  border border-dashed border-border
                  hover:border-primary hover:bg-accent/50
                  transition-colors
                "
              >
                <Plus className="w-4 h-4" />
                Add Step
              </button>
            </section>
            
            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-6 border-t border-border">
              <button
                type="button"
                onClick={clearForm}
                className="
                  px-6 py-2 rounded-lg
                  border border-border
                  hover:bg-accent transition-colors
                "
              >
                Clear
              </button>
              
              <button
                type="submit"
                disabled={isSubmitting}
                className="
                  flex items-center gap-2 px-6 py-2 rounded-lg
                  bg-primary text-primary-foreground
                  hover:bg-primary/90 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                <Save className="w-4 h-4" />
                {isSubmitting 
                  ? (editingAgentId ? 'Updating...' : 'Creating...')
                  : (editingAgentId ? 'Update Agent' : 'Create Agent')
                }
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}