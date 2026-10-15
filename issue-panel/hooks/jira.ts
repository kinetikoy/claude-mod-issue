import type { DevItem, Issue } from '../types'

export const KEY = /\b[A-Z][A-Z0-9]+-\d+\b/
/** An issue key typed in any case, normalised to upper case. */
export const keyIn = (t: string) => t.match(/\b[a-z][a-z0-9]+-\d+\b/i)?.[0].toUpperCase()
export const HIDE = /\bhide\b.*\b(jira|panel|issue)\b|\bclose\b.*\bjira\b/i
const SHOW = /\b(show|open|view|display|go to|jump to|work(ing)? on|start|continue|pick up)\b|atlassian\.net\/browse\//i
const ICONS: Record<string, string> = {
  bug: '🐞', story: '📗', task: '✅', epic: '⚡', 'sub-task': '🔹', subtask: '🔹', improvement: '⬆️',
}
export const icon = (type: string) => ICONS[type.toLowerCase()] ?? '📄'

/** What the prompt asks to show: an issue key, or a relation of the current issue. */
export function parseShow(text: string): { key: string } | { rel: 'parent' | 'dependant' } | null {
  if (!SHOW.test(text)) return null
  const key = keyIn(text)
  if (key) return { key }
  if (/\bparent\b/i.test(text)) return { rel: 'parent' }
  if (/\b(depend[ae]nt|dependency|dependencies|blocker|blocked|linked)\b/i.test(text)) return { rel: 'dependant' }
  return null
}

/** Issue key a tool call is about: worktree or branch creation. */
export function keyOfToolCall(e: { tool: string } & Record<string, unknown>): string | undefined {
  const { tool } = e
  if (tool === 'Bash') {
    const cmd = String(e.command ?? '')
    return /\bgit\s+(worktree\s+add|checkout\s+-b|switch\s+-c|branch)\b/.test(cmd) ? cmd.match(KEY)?.[0] : undefined
  }
  if (tool === 'EnterWorktree') return String(e.name ?? e.path ?? '').match(KEY)?.[0]
  return undefined
}

/** Jira text is untrusted: drop terminal control chars (ESC etc.), keep newlines and tabs. */
export const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
const cleanDeep = <T,>(v: T): T =>
  typeof v === 'string' ? (clean(v) as T) : Array.isArray(v) ? (v.map(cleanDeep) as T)
  : v && typeof v === 'object' ? (Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cleanDeep(x)])) as T) : v

// ADF (or markdown string) -> plain text
const text = (n: any): string =>
  n == null ? '' : typeof n === 'string' ? n.replace(/<custom[^>]*>(.*?)<\/custom>/gs, '$1')
  : Array.isArray(n) ? n.map(text).join('')
  : n.type === 'text' ? n.text ?? ''
  : text(n.content) + (['paragraph', 'heading', 'listItem', 'codeBlock'].includes(n.type) ? '\n' : '')

export const parseIssue = (raw: string): Issue => cleanDeep(parseIssueRaw(raw))
function parseIssueRaw(raw: string): Issue {
  const parsed = JSON.parse(raw)
  const j = parsed.issues?.nodes?.[0] ?? parsed // Atlassian MCP wraps the issue
  const f = j.fields ?? j
  const sprint = [f.customfield_10020 ?? f.sprint].flat().filter(Boolean)
  return {
    key: j.key,
    title: f.summary ?? '',
    type: f.issuetype?.name ?? '',
    status: f.status?.name ?? '',
    priority: f.priority?.name ?? '-',
    sprint: sprint.map((s: any) => s.name ?? s).join(', ') || '-',
    fixVersions: (f.fixVersions ?? []).map((v: any) => v.name).join(', ') || '-',
    description: text(f.description).trim() || '(no description)',
    comments: (f.comment?.comments ?? []).map((c: any) => ({
      author: c.author?.displayName ?? '?', created: String(c.created ?? '').slice(0, 10), body: text(c.body).trim(),
    })),
    parent: f.parent?.key,
    parentTitle: f.parent?.fields?.summary,
    links: (f.issuelinks ?? []).map((l: any) => {
      const o = l.outwardIssue ?? l.inwardIssue
      return { kind: l.outwardIssue ? l.type?.outward : l.type?.inward, key: o?.key }
    }).filter((l: any) => l.key),
  }
}

/** The "dependant" issue: prefer a blocking/depends link, else the first link. */
export const dependantOf = (i: Issue) =>
  (i.links.find(l => /block|depend/i.test(l.kind)) ?? i.links[0])?.key

const STATUS: [RegExp, string][] = [[/done|closed|resolved|complete/i, 'green'], [/progress|review|test/i, 'yellow'], [/block/i, 'red']]
export const statusColor = (s: string) => STATUS.find(([re]) => re.test(s))?.[1] ?? 'white'
export const priorityColor = (p: string) =>
  /highest|critical|blocker/i.test(p) ? 'red' : /high/i.test(p) ? 'magenta' : /medium/i.test(p) ? 'yellow' : /low/i.test(p) ? 'green' : 'white'

const DEV_KINDS: [RegExp, string][] = [
  [/pull.?request/i, 'Pull requests'], [/commit/i, 'Commits'], [/build/i, 'Builds'], [/deploy/i, 'Deployments'], [/branch/i, 'Branches'],
]
export const DEV_ORDER = DEV_KINDS.map(([, k]) => k)
const first = (o: any, keys: string[]) => keys.map(k => o?.[k]).find(v => typeof v === 'string' && v)

/** Teamwork Graph relationships of a work item -> its GitHub-sourced dev items; unknown shapes are returned in `unknown`. */
export function parseDev(raw: string): { key?: string; items: DevItem[]; unknown: string[] } {
  const data = JSON.parse(raw)?.data?.data
  const rels = data?.relationships ?? []
  const items: DevItem[] = []
  const unknown: string[] = []
  for (const r of rels) {
    const kind = DEV_KINDS.find(([re]) => re.test(`${r.targetObjectType} ${r.relationshipName}`))?.[1]
    if (!kind) continue
    for (const t of r.targets ?? []) {
      const label = first(t, ['title', 'name', 'displayName', 'summary', 'message', 'description', 'url', 'webUrl', 'ari']) ?? '?'
      items.push({ kind, label, status: first(t, ['status', 'state', 'buildState', 'deploymentState', 'lifecycleState']), url: first(t, ['url', 'webUrl']) })
      unknown.push(`${kind}: ${Object.keys(t).join(',')}`)
    }
  }
  return { key: data?.object?.key, items: cleanDeep(items), unknown: [...new Set(unknown)].map(clean) }
}

export const devColor = (s?: string) =>
  !s ? undefined : /merged|success|passed|successful|deployed|done/i.test(s) ? 'green' : /fail|error|declined|cancel/i.test(s) ? 'red' : /open|progress|pending|running|queued/i.test(s) ? 'yellow' : undefined
