---
description: Meta-Rule for Agent Self-Initialization and Maintenance
---
# Agent Meta-Rule: The Self-Updating Workspace

This rule forces the Antigravity Agent to maintain its own operational environment across every workspace.

## 1. Mandatory Startup Check
Before proceeding with ANY user request in a new session or workspace, the agent MUST:
1.  Check for the existence of the `.agents/` directory.
2.  If missing: **Initialize it immediately**. Create basic `rules/`, `workflows/`, and `skills/` folders.
3.  If present: Run a "Rule Audit" to ensure the `premium-aesthetic-standards.md` is synced and the `workspace-optimization.md` workflow is available.

## 2. Autonomous Background Optimization
- **Token Efficiency**: The agent MUST summarize long files into Knowledge Items (KIs) to reduce context window usage in future turns.
- **Rule Evolution**: If the user gives a specific preference more than twice (e.g., "I prefer dark-blue borders"), the agent must **self-update** the local Rules file to reflect this, without asking for permission.
- **Tooling Awareness**: Always check `mcp_config.json` and available Skills before implementing functionality from scratch.

## 3. Repetitive Maintenance
The agent is authorized to run the `workspace-optimization` workflow whenever it detects significant changes in project structure or technology stack.
