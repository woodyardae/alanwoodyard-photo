---
repo_name: aw-photo
repo_type: Photography Portfolio Site
lifecycle_state: Staged-Shell
active_sub_state: Waiting
security_tier: Strong
updated: "2026-06-20"
---
# Agent Instructions — aw-photo
## Security Tier: Strong (2)
All changes via PR. No direct pushes to main.
## What this repo does
Staged shell for a photography portfolio site. No active development until the ss- fleet direction (Ghost vs hand-coded) is decided and the primary brand sites are migrated.
## Cluster
ss-Fleet / Personal Brand
## Active horizon
```yaml
horizon:
  goal: "Launch photography portfolio site"
  active_sub_state: "Waiting — ss- fleet direction pending"
  next_milestone: "Decision on Ghost vs hand-code for ss- fleet"
  blockers: ["ss- fleet direction not yet decided"]
```
## Agent rules
1. Read this file before any action.
2. This is a staged shell — do not build features until the lifecycle state changes to Active.
3. All changes via PR to main. No direct pushes.
4. Portfolio-wide rules: stax/ops/stax-format.md
