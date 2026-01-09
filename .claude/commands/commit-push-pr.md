---
name: commit-push-pr
description: Optionally checks, then commits and pushes code to the remote repository, and creates a pull request.
argument-hint: check | force
allowed-tools:
  - Skill
model: claude-haiku-4-5
---

Run `/commit-push $ARGUMENTS` then `/pr`.
