import { test, expect } from 'claude-code/testing'
import { parseDev, parseIssue, parseShow, keyOfToolCall, dependantOf } from './jira'

test('parseShow', () => {
  expect(parseShow('show issue AB-12')).toEqual({ key: 'AB-12' })
  expect(parseShow('show me the parent issue')).toEqual({ rel: 'parent' })
  expect(parseShow('show the dependant issue')).toEqual({ rel: 'dependant' })
  expect(parseShow('we should work on https://x.atlassian.net/browse/AA-1447...')).toEqual({ key: 'AA-1447' })
  expect(parseShow('show issue aa-1600')).toEqual({ key: 'AA-1600' })
  expect(parseShow('fix AB-12')).toBeNull()
})
test('keyOfToolCall', () => {
  expect(keyOfToolCall({ tool: 'Bash', command: 'git worktree add .worktrees/AB-7-x' })).toBe('AB-7')
  expect(keyOfToolCall({ tool: 'Bash', command: 'ls AB-7' })).toBeUndefined()
})
test('dependantOf', () => {
  expect(dependantOf({ links: [{ kind: 'relates to', key: 'A-1' }, { kind: 'is blocked by', key: 'A-2' }] } as any)).toBe('A-2')
})
test('parseIssue unwraps the MCP envelope', () => {
  const raw = JSON.stringify({ issues: { nodes: [{ key: 'AA-1', fields: { summary: 'S', issuetype: { name: 'Bug' }, status: { name: 'In Progress' }, customfield_10020: [{ name: 'Sprint 1' }], comment: { comments: [{ author: { displayName: 'A' }, created: '2026-10-15T11:10', body: 'hi' }] } } }] } })
  const i = parseIssue(raw)
  expect([i.key, i.type, i.sprint, i.comments[0].body]).toEqual(['AA-1', 'Bug', 'Sprint 1', 'hi'])
  expect(parseIssue(JSON.stringify({ key: 'A-2', fields: { parent: { key: 'A-1', fields: { summary: 'Epic' } } } })).parentTitle).toBe('Epic')
})
test('parseDev groups PRs and builds', () => {
  const raw = JSON.stringify({ data: { data: { object: { key: 'AA-1' }, relationships: [
    { relationshipName: 'x-has-pull-request', targetObjectType: 'ExternalPullRequest', targets: [{ title: 'Fix login', status: 'MERGED', url: 'u' }] },
    { relationshipName: 'jira-work-item-links-external-build', targetObjectType: 'ExternalBuild', targets: [{ name: 'ci #4', state: 'FAILED' }] },
    { relationshipName: 'atlassian_user_assigned_jira_work_item', targetObjectType: 'AtlassianUser', targets: [{}] },
  ] } } })
  const { items, key } = parseDev(raw)
  expect(key).toBe('AA-1')
  expect(items.map(i => `${i.kind}|${i.label}|${i.status}`)).toEqual(['Pull requests|Fix login|MERGED', 'Builds|ci #4|FAILED'])
})
test('control characters from Jira are stripped', () => {
  const i = parseIssue(JSON.stringify({ key: 'A-1', fields: { summary: 'x\u001b[2Jy', description: 'a\nb\u0007' } }))
  expect([i.title, i.description]).toEqual(['x[2Jy', 'a\nb'])
})
