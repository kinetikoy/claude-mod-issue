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
const READ_TOOL = /^mcp__.*__(getJiraIssue|get(Teamwork)?GraphContext)$/ // tool names differ between Atlassian MCP versions

// The panel never calls Atlassian itself (a plugin-initiated call has no request behind it, so permission
// checks refuse it). Claude fetches through its own tool calls; the panel draws what those return.
const instruction = (key: string) =>
  `The issue-panel plugin is showing Jira issue ${key}. Fill it: call getJiraIssue (issueIdOrKey "${key}", with comments, sprint, parent and links: view "full" if it has a view option, else fields ${JSON.stringify(FIELDS)}; ` +
  `get the cloudId from getAccessibleAtlassianResources, or use the site hostname) and getTeamworkGraphContext, or getGraphContext (objectType "JiraWorkItem", objectIdentifier "${key}", detailLevel "full"). ` +
  'Use whichever Atlassian MCP has these tools. The panel draws the results, so do not repeat them.'

async function show($: Api, key: string) {
  const opened = await $.ui.open({ id: PANE, title: `Jira ${key}` })
  if (!opened.isPlaced) $.ui.toast(`Jira panel not shown: ${opened.reason}. Try /issue ${key}`)
  await update($, note, () => `Waiting for Claude to fetch ${key}…`)
}

/** Draw the result of Claude's own getJiraIssue / getTeamworkGraphContext call. */
async function capture($: Api, tool: string, ran: { text?: string; isError?: true }) {
  const text = ran.text ?? ''
  try {
    if (tool.endsWith('getJiraIssue')) {
      if (ran.isError) throw new Error(text.slice(0, 200))
      const parsed = parseIssue(text)
      await update($, issue, () => parsed)
      await update($, note, () => '')
      await $.ui.open({ id: PANE, title: `Jira ${parsed.key}` })
    } else {
      const d = parseDev(text)
      if (d.key) await update($, dev, () => ({ key: d.key!, items: d.items }))
    }
  } catch (err) {
    if (tool.endsWith('getJiraIssue')) await update($, note, () => `Could not load the issue: ${(err as Error).message}`)
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
  on('prompt.submit', async ($, e, next) => {
    // /issue is a plugin command file (commands/issue.md), so it lists in every host; the file tells Claude what to fetch
    const slashKey = e.command?.name.split(':').pop() === 'issue' ? keyIn(e.command.args) : undefined
    if (slashKey) {
      await show($, slashKey)
      return next(e)
    }
    if (HIDE.test(e.text)) {
      await hide($)
      return next(e)
    }
    const ask = parseShow(e.text)
    if (!ask) return next(e)
    let key: string | undefined
    if ('key' in ask) key = ask.key
    else {
      const cur = await read($, issue)
      key = cur && (ask.rel === 'parent' ? cur.parent : dependantOf(cur))
      if (!key) {
        await update($, note, () => `No ${ask.rel} issue for ${cur?.key ?? 'current issue'}`)
        return next(e)
      }
    }
    await show($, key)
    return next({ ...e, context: [...(e.context ?? []), instruction(key)] })
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    if (READ_TOOL.test(e.tool)) {
      await capture($, e.tool, ran as any)
      return ran
    }
    const key = e.tool.startsWith('mcp__') ? undefined : keyOfToolCall(e as any) // worktree / branch with an issue key
    if (!key) return ran
    await show($, key)
    return { ...(ran as any), context: [...(ran.context ?? []), instruction(key)] }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const i = await read($, issue)
    const msg = await read($, note)
    const d = await read($, dev)
    const devItems = d && d.key === i?.key ? d.items : null

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
