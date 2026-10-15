import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Issue } from '../types'

import { DEV_ORDER, HIDE, devColor, keyIn, parseDev, dependantOf, icon, priorityColor, statusColor, keyOfToolCall, parseIssue, parseShow } from './jira'

type Api = EngineInterface
const PANE = 'jira-issue'
const issue = atom({ plugin: 'issue-panel', key: 'issue' } as const, null)
const dev = atom({ plugin: 'issue-panel', key: 'dev' } as const, null)
const note = atom({ plugin: 'issue-panel', key: 'note' } as const, '')
const FIELDS = ['summary', 'issuetype', 'status', 'priority', 'fixVersions', 'description', 'comment', 'parent', 'issuelinks', 'customfield_10020']
const NEED_MCP = 'You need to connect the Atlassian MCP first (run /mcp and authenticate Atlassian).'
const SERVERS = ['plugin:restoflow:atlassian', 'plugin_restoflow_atlassian', 'atlassian'] // tried in order
let server: string | undefined // first one that answered, or the one seen in a tool call
let cloudId: string | undefined

async function callText($: Api, tool: string, args: object) {
  const r = await $.mcp.call(server!, tool, args)
  const t = r.content.map((b: any) => b.text ?? '').join('')
  if (r.isError) throw new Error(t.slice(0, 200))
  return t
}

async function connect($: Api) {
  if (server && cloudId) return
  for (const s of server ? [server] : SERVERS) {
    try {
      server = s
      cloudId = JSON.parse(await callText($, 'getAccessibleAtlassianResources', {}))[0].id
      return
    } catch {
      server = undefined
    }
  }
  throw new Error('no atlassian')
}

async function show($: Api, key: string) {
  const title = `Jira ${key}`
  const opened = await $.ui.open({ id: PANE, title })
  if (!opened.isPlaced) $.ui.toast(`Jira panel not shown: ${opened.reason}. Try /issue ${key}`)
  await update($, note, () => `Loading ${key}…`)
  try {
    await connect($)
    const raw = await callText($, 'getJiraIssue', { cloudId, issueIdOrKey: key, fields: FIELDS })
    const parsed = parseIssue(raw)
    await update($, issue, () => parsed)
    await update($, note, () => '')
    await update($, dev, () => null)
    try {
      const d = parseDev(await callText($, 'getTeamworkGraphContext', { cloudId, objectType: 'JiraWorkItem', objectIdentifier: key, detailLevel: 'full', first: 50 }))
      await update($, dev, () => d.items)
    } catch {
      // dev info is optional: leave the section empty
    }
  } catch (err) {
    await update($, issue, () => null)
    await update($, note, () => NEED_MCP)
  }
}

async function hide($: Api) {
  await $.ui.close({ id: PANE })
  await update($, issue, () => null)
}

const fields = (i: Issue): [string, string, string | undefined][] => [
  ['Type', i.type, undefined],
  ['Status', i.status, statusColor(i.status)],
  ['Priority', i.priority, priorityColor(i.priority)],
  ['Parent', i.parent ? `${i.parent}${i.parentTitle ? ' · ' + i.parentTitle : ''}` : '-', i.parent ? 'cyan' : undefined],
  ['Sprint', i.sprint, undefined],
  ['Fix version', i.fixVersions, undefined],
]

// pane background, matched by eye to the terminal's; set to undefined to use the engine's
const BG = '#151922'

// full-width rule: a long line clipped to one row by the pane's width
const rule = (Box: any, Text: any) => (
  <Box height={1} overflow="hidden">
    <Text dimColor>{'─'.repeat(400)}</Text>
  </Box>
)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'issue', description: 'Show a Jira issue in the panel: /issue KEY-123' })
    return next(e)
  })

  on('command.run', { command: 'issue' }, async ($, e) => {
    const key = keyIn(String((e as any).args ?? ''))
    if (!key) return { text: 'Usage: /issue KEY-123' }
    void show($, key)
    return { text: `Opening ${key}` }
  })

  on('prompt.submit', async ($, e, next) => {
    if (HIDE.test(e.text)) {
      await hide($)
      return next(e)
    }
    const ask = parseShow(e.text)
    if (!ask) return next(e)
    if ('key' in ask) void show($, ask.key)
    else {
      const cur = await read($, issue)
      const key = cur && (ask.rel === 'parent' ? cur.parent : dependantOf(cur))
      if (key) void show($, key)
      else await update($, note, () => `No ${ask.rel} issue for ${cur?.key ?? 'current issue'}`)
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const key = keyOfToolCall(e as any)
    if (key) void show($, key)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const i = await read($, issue)
    const msg = await read($, note)
    const devItems = await read($, dev)

    let main
    try {
      main = (
        <Box flexDirection="column">
        {i ? (
          <Box flexDirection="column">
            <Text><Text bold color="cyan">{`${icon(i.type)} ${i.key}  `}</Text><Text bold>{i.title}</Text></Text>
            {msg ? <Text color="yellow">{msg}</Text> : null}
            {rule(Box, Text)}
            <Box>
              {[fields(i).slice(0, 3), fields(i).slice(3)].map((col, n) => (
                <Box key={`c${n}`} flexDirection="column" flexGrow={1}>
                  {col.map(([label, value, color]) => (
                    <Box key={label}>
                      <Box width={13}><Text color="cyan">{label}</Text></Box>
                      <Text color={color} bold={color !== undefined}>{value}</Text>
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
            {rule(Box, Text)}
            <Text bold color="cyan">{'\nDescription'}</Text>
            {i.description.split('\n').map(l => (
              <Text bold={/^#+\s/.test(l)} color={/^#+\s/.test(l) ? 'yellow' : undefined}>{l.replace(/^#+\s*/, '')}</Text>
            ))}
            <Text bold color="cyan">{`\nComments (${i.comments.length})`}</Text>
            {i.comments.map(c => (
              <Box flexDirection="column">
                <Text><Text color="green" bold>{c.author}</Text><Text dimColor>{`  ${c.created}`}</Text></Text>
                <Text>{c.body + '\n'}</Text>
              </Box>
            ))}
            <Text bold color="cyan">{'\nDevelopment'}</Text>
            {devItems === null ? <Text dimColor>loading…</Text> : devItems.length === 0 ? <Text dimColor>No linked commits, PRs, builds or deployments.</Text> : null}
            {DEV_ORDER.map(kind => {
              const rows = (devItems ?? []).filter(d => d.kind === kind)
              return rows.length === 0 ? null : (
                <Box key={kind} flexDirection="column">
                  <Text bold color="green">{`${kind} (${rows.length})`}</Text>
                  {rows.map(d => (
                    <Text><Text color={devColor(d.status)} bold>{d.status ? `${d.status}  ` : ''}</Text><Text>{d.label}</Text></Text>
                  ))}
                </Box>
              )
            })}
          </Box>
        ) : (
          <Text dimColor>{msg || 'No issue.'}</Text>
        )}
        </Box>
      )
    } catch (err) {
      const text = `render failed: ${(err as Error).message.slice(0, 160)}`
      main = <Text color="red">{text}</Text>
    }

    return (
      <Box flexDirection="column" height="100%" backgroundColor={BG}>
        {main}
      </Box>
    )
  })
}
