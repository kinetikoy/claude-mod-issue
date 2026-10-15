# claude-mod-issue

Just a little Claude Mod demo

## What it does

A side panel that shows the Jira issue you are working on: type icon, key and title, status, priority, parent, sprint, fix version, description (scrolls), comments, and the development info Jira pulls from GitHub (commits, PRs, builds, deployments). It uses the official Atlassian MCP server from the `atlassian` plugin (claude-plugins-official), installed automatically as a dependency; you authenticate it once (`/mcp`). The panel never calls Atlassian itself: Claude fetches the issue with its normal tools and the panel draws the results, so no permission settings need editing.

The panel opens by itself when it sees an issue key, and reacts to:

| You do | Panel does |
| --- | --- |
| `/issue KEY-123` (any case) | shows that issue |
| "show / open / view KEY-123", "work on KEY-123", paste a `…atlassian.net/browse/KEY-123` link | shows that issue |
| "show the parent issue" | shows the parent of the issue on screen |
| "show the dependant issue" (also dependency, blocker, linked) | shows the first blocking/linked issue |
| `git worktree add` / `git checkout -b` / `git switch -c` with a key in the name | shows that issue |
| Claude calls `getJiraIssue` (any Atlassian MCP) | shows that issue |
| "hide jira panel", "hide jira issue", "close jira" | closes the panel |

If no Atlassian MCP is connected, Claude tells you to authenticate one in `/mcp`.

## Install

In a Claude Code session:

```
/plugin marketplace add kinetikoy/claude-mod-issue
/plugin install issue-panel@kinetik
```

This also installs `atlassian@claude-plugins-official`. Then authenticate its Atlassian server (`/mcp`) and try `/issue ABC-123`.

### Or let Claude do it

Paste this into Claude Code; it asks before each step:

```
Install the "issue-panel" Claude Code plugin from github.com/kinetikoy/claude-mod-issue.
Before each step, tell me what you're about to run and wait for my OK:
1. claude plugin marketplace add kinetikoy/claude-mod-issue
2. claude plugin install issue-panel@kinetik
3. Tell me if I need to restart, then to authenticate the atlassian plugin's server in /mcp, and how to try /issue ABC-123.
```
