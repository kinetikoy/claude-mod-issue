# claude-mod-issue

Just a little Claude Mod demo

## What it does

A side panel that shows the Jira issue you are working on: type icon, key and title, status, priority, parent, sprint, fix version, description (scrolls), comments, and the development info Jira pulls from GitHub (commits, PRs, builds, deployments). It uses the Atlassian MCP, so that must be connected.

The panel opens by itself when it sees an issue key, and reacts to:

| You do | Panel does |
| --- | --- |
| `/issue KEY-123` (any case) | shows that issue |
| "show / open / view KEY-123", "work on KEY-123", paste a `…atlassian.net/browse/KEY-123` link | shows that issue |
| "show the parent issue" | shows the parent of the issue on screen |
| "show the dependant issue" (also dependency, blocker, linked) | shows the first blocking/linked issue |
| `git worktree add` / `git checkout -b` / `git switch -c` with a key in the name | shows that issue |
| Claude calls an Atlassian MCP tool about a key | shows that issue |
| "hide jira panel", "hide jira issue", "close jira" | closes the panel |

If the Atlassian MCP is not connected, the panel says so.

## Install

In a Claude Code session:

```
/plugin marketplace add kinetikoy/claude-mod-issue
/plugin install issue-panel@kinetik
```

Then connect the Atlassian MCP (`/mcp`) and try `/issue ABC-123`.

### Or let Claude do it

Paste this into Claude Code; it asks before each step:

```
Install the "issue-panel" Claude Code plugin from github.com/kinetikoy/claude-mod-issue.
Before each step, tell me what you're about to run and wait for my OK:
1. Check if an Atlassian MCP server is connected (claude mcp list). If not, add it:
   claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp
2. claude plugin marketplace add kinetikoy/claude-mod-issue
3. claude plugin install issue-panel@kinetik
4. Tell me if I need to restart or authenticate Atlassian (/mcp), then how to try /issue ABC-123.
```
