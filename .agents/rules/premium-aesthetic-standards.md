---
description: Premium Aesthetic & Professional Coding Standards
---
# User Thinking Pattern & Aesthetic Standards

This rule defines the core visual and structural philosophy of the USER (StealthMoud), as identified from historical project analysis (authenticator, GoalOS/DeepGrow).

## 1. Visual Philosophy: "Elite Premium"
- **Glassmorphism is Mandatory**: Use translucent backgrounds with backdrop-blur.
  - Typical style: `background: hsla(var(--bg-card), 0.7); backdrop-filter: blur(12px); border: 1px solid hsla(var(--border), 0.1);`
- **Dynamic Feedback**: Every interaction must have a hover/active state. Use subtle glows (`box-shadow: 0 0 20px var(--color-primary-glow)`).
- **Typography & Icons**: Use `Lucide-React` (or equivalent SVG) for ALL buttons. Buttons without icons are considered "FAILED."
- **Color Palettes**: Avoid generic colors. Use HSL-based palettes with primary accents (Cyan/Purple or Forest Green).
- **No Placeholders**: Never use placeholder text or empty boxes. Generate real content or use `generate_image` for mockups.

## 2. Structural Philosophy: "Radical Clarity"
- **Consolidation over Fragmentation**: If multiple pages do similar things, consolidate them (e.g., the Focus Timer overhaul).
- **Semantic Naming**: Use evocative but clear names (e.g., "DeepGrow" vs "GoalOS", "Focus" vs "Sanctuary").
- **Mobile First**: All layouts must be verified for mobile responsiveness. Use `min(relative, absolute)` units for stage elements.

## 3. Interaction & "Humanized" Behavior
- **GitHub Connectivity**: Projects must always be connected to GitHub.
- **Commit & Sync Pattern**: 
  - Commit every "tiny" change. No large bulk commits.
  - **Auto-Push**: Always run `git push` immediately after every commit to maintain cloud synchronization.
  - Messages must be humanized and SHORT.
  - **CRITICAL**: No emojis. No signs of AI (e.g., avoid "Updated...", "Refactored...", use "added button", "fix css").
- **Code Commenting**: 
  - Comments should feel written by a human.
  - Occasional intentional typos (e.g., "funcition", "reponsive") are encouraged to mask AI identity.
- **Agent Interaction**: 
  - Deep Research First: Always check KI summaries and conversation logs before asking questions.
  - Autonomous Maintenance: Handle setups and optimization without prompting.
