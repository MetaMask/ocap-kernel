---
name: commit-push
description: Optionally checks, then commits and pushes code to the remote repository.
argument-hint: check | force
allowed-tools:
  - Bash(git branch*)
  - Bash(git status*)
  - Bash(git push*)
  - Skill
model: claude-haiku-4-5
---

Arguments: $ARGUMENTS

1. Run `/commit $ARGUMENTS` to commit the changes.

2. Push to the remote repository:

   - Run `git push` to push the commit
   - If the branch has no upstream, use `git push -u origin <branch-name>`

3. Report the results including:
   - The commit hash
   - The commit message
   - The push status
