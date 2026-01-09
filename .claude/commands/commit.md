---
name: commit
description: Optionally checks, then commits code to the current or a new feature branch.
argument-hint: check | force
allowed-tools:
  - Bash(git branch*)
  - Bash(git checkout*)
  - Bash(git add*)
  - Bash(git status*)
  - Bash(git commit*)
  - Bash(git diff*)
  - Bash(git log*)
  - Skill
model: claude-haiku-4-5
---

Arguments: $ARGUMENTS

If the argument is "force", skip the check step. Otherwise (default), run the `/check` command first to lint, build, and test the code. If any of the checks fail, stop and report the errors.

Once ready, commit and push the code by following these steps:

1. Run these bash commands in parallel to understand the current state:

   - `git status` to see all untracked files
   - `git diff HEAD` to see both staged and unstaged changes
   - `git log --oneline -10` to see recent commit messages for style consistency

2. If you are on the `main` branch, create a new feature branch using `git branch` and switch to it.

3. Analyze all changes and draft a commit message:

   - Summarize the nature of the changes (new feature, enhancement, bug fix, refactoring, test, docs, etc.)
   - Use the conventional commit format: `type(scope): description`
   - Keep the first line under 72 characters
   - Do not commit files that likely contain secrets (.env, credentials.json, etc.)

4. Stage and commit the changes:

   - Add relevant files using `git add`
   - Create the commit with a message ending with:
     ```
     Co-Authored-By: Claude <noreply@anthropic.com>
     ```
   - Use a HEREDOC for the commit message to ensure proper formatting, **unless** you are sandboxed, in
     which case use a plain string because HEREDOCs are not supported.

5. Report the results including:
   - The commit hash
   - The commit message
