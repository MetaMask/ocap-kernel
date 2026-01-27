---
name: commit-push-pr
description: Optionally checks, then commits and pushes code to the remote repository, and creates a pull request.
---

When asked to commit, push, and create a pull request, follow these steps:

## Arguments

- `check` (default): Run checks before committing.
- `force`: Skip checks and commit/push directly.

## Steps

1. Invoke the commit-push skill with the provided arguments to commit and push the changes.

2. Invoke the pr skill to create a pull request for the pushed branch.
