---
name: commit-push
description: Optionally checks, then commits and pushes code to the remote repository.
argument-hint: check | skip
allowed-tools:
  - Bash(git add*)
  - Bash(git status*)
  - Bash(git commit*)
  - Bash(git push*)
  - Bash(git diff*)
  - Bash(git log*)
  - Skill
model: claude-haiku-4-5
---

Arguments: $ARGUMENTS

If the argument is "skip", skip the check step. Otherwise (default), run the `/check` command first to lint, build, and test the code. If any of the checks fail, stop and report the errors.

Once ready, commit and push the code by following these steps:

1. Run these bash commands in parallel to understand the current state:

   - `git status` to see all untracked files
   - `git diff HEAD` to see both staged and unstaged changes
   - `git log --oneline -10` to see recent commit messages for style consistency

2. Analyze all changes and draft a commit message:

   - Summarize the nature of the changes (new feature, enhancement, bug fix, refactoring, test, docs, etc.)
   - Use the conventional commit format: `type(scope): description`
   - Keep the first line under 72 characters
   - Do not commit files that likely contain secrets (.env, credentials.json, etc.)

3. Stage and commit the changes:

   - Add relevant files using `git add`
   - Create the commit with a message ending with:
     ```
     Co-Authored-By: Claude <noreply@anthropic.com>
     ```
   - Use a HEREDOC for the commit message to ensure proper formatting

4. Push to the remote repository:

   - Run `git push` to push the commit
   - If the branch has no upstream, use `git push -u origin <branch-name>`

5. Report the results including:
   - The commit hash
   - The commit message
   - The push status
