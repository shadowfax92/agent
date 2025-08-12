import { z } from 'zod'
import { TemplateSchema, type Template } from '@/newtab/schemas/template.schema'

// Validate templates at runtime
const TEMPLATES: Template[] = z.array(TemplateSchema).parse([
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
    steps: ['Read today\'s calendar', 'Pull context from docs/emails', 'Compose a brief summary'],
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
])

export default TEMPLATES