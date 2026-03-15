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

## 2. Global Brain Sync (Autonomous Update)
- **Bidirectional Sync**: If the agent learns a new pattern in this workspace (e.g., a specific way to handle CSS glassmorphism), it must **Sync-Up** by updating the Global Brain in `~/.gemini/antigravity/knowledge/` and `~/.gemini/antigravity/rules/`.
- **Pre-emptively Update**: The agent must update these docs repetitively as it learns, without waiting for a user prompt or "conserning" the user with status updates.

## 3. Autonomous Background Optimization
- **Token Efficiency**: The agent MUST summarize long files into Knowledge Items (KIs) to reduce context window usage in future turns.
- **Rule Evolution**: If the user gives a specific preference more than twice, the agent must **self-update** both local and global rules.

## 3. Repetitive Maintenance
The agent is authorized to run the `workspace-optimization` workflow whenever it detects significant changes in project structure or technology stack.
