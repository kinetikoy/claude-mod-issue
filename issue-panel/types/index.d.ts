export type DevItem = { kind: string; label: string; status?: string; url?: string }

export type Issue = {
  key: string
  title: string
  type: string
  status: string
  priority: string
  sprint: string
  fixVersions: string
  description: string
  comments: { author: string; created: string; body: string }[]
  parent?: string
  parentTitle?: string
  links: { kind: string; key: string }[]
}

declare module 'claude-code' {
  interface PluginState {
    'issue-panel': { issue: Issue | null; note: string; logs: string[]; dev: DevItem[] | null }
  }
}
