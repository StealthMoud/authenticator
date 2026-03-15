---
description: Automated Workspace Audit and Optimization Workflow
---
# Workspace Optimization Workflow

This workflow is designed to be run autonomously by the agent to keep the workspace meta-files up to date.

// turbo
1. **Audit Project State**
   - Check `package.json` or `manifest.json` for tech stack (React, Chrome Ext, etc.).
   - Check for existing style files (CSS/SCSS).

// turbo
2. **Update Rules**
   - Compare current `.agents/rules` with the Global Standard Template.
   - Inject project-specific constraints (e.g., "Always use Manifest V3 for this Chromium project").

3. **Knowledge Distillation**
   - Analyze recent changes in the `src/` or root directory.
   - Create or Update KIs in the `.gemini/antigravity/knowledge` folder to capture the latest architecture decisions.

// turbo
4. **Token Usage Report**
   - Briefly summarize how many files were compressed/summarized to save context.
