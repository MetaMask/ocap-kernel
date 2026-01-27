---
name: commit-push
description: Optionally checks, then commits and pushes code to the remote repository.
---

When asked to commit and push code, follow these steps:

## Arguments

- `check` (default): Run checks before committing.
- `force`: Skip checks and commit/push directly.

## Steps

1. Invoke the commit skill with the provided arguments to commit the changes.

2. Push to the remote repository:

   - Run `git push` to push the commit
   - If the branch has no upstream, use `git push -u origin <branch-name>`

3. Report the results including:
   - The commit hash
   - The commit message
   - The push status
