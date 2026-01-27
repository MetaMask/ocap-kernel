---
name: pr
description: Creates a pull request for the current branch.
unsandboxed: true
---

When asked to create a pull request, follow these steps:

1. Run `git status`. If any of the following conditions apply, stop and report the errors:

   - There are unstaged changes
   - There are untracked files
   - The current branch is the default branch (`main`)

2. Run `git log main..HEAD --oneline` to see the commit history.

3. Run `git diff` and/or `git show` as necessary to understand the changes.

4. Run `gh pr create` to create a pull request. The PR body should include:

   - A brief narrative description of the PR
   - A summary of the changes (bullet points)
   - A brief description of how the code is tested (narrative, not a checklist)

5. Return the PR URL and any relevant information.
