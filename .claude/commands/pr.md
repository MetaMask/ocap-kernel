---
name: pr
description: Creates a pull request for the current branch.
allowed-tools:
  - Bash(git status*)
  - Bash(git log*)
  - Bash(git show*)
  - Bash(git diff*)
  - Bash(gh pr create*)
model: claude-haiku-4-5
---

1. Run `git status`. If any of the following conditions apply, stop and report the errors:
   - There are unstaged changes
   - There are untracked files
   - The current branch is the default branch (`main`)
2. Run `git log main..HEAD --oneline` to see the commit history.
3. Run `git diff` and/or `git show` as necessary to understand the changes.
4. Run `gh pr create` to create a pull request.
5. Return the results of the commands.
