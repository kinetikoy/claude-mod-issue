---
description: Show a Jira issue in the issue panel
argument-hint: <ISSUE-KEY>
---

The issue-panel plugin draws the Jira issue panel from the results of your own tool calls. Show issue $ARGUMENTS (upper-case the key):

1. Call getJiraIssue with issueIdOrKey "$ARGUMENTS", everything the panel shows (comments, sprint, parent, links): view "full" if the tool has a view option, otherwise fields ["summary","issuetype","status","priority","fixVersions","description","comment","parent","issuelinks","customfield_10020"]. Get the cloudId from getAccessibleAtlassianResources first, or use the site hostname if you know it.
2. Call getTeamworkGraphContext (or getGraphContext) with objectType "JiraWorkItem", objectIdentifier "$ARGUMENTS" and detailLevel "full".

Use whichever Atlassian MCP has these tools. If none is connected, tell me to authenticate the atlassian plugin's server in /mcp. Do not repeat the issue in your reply; say only "Opened $ARGUMENTS."
