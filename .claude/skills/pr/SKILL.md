---
name: pr
description: Creates a pull request for the current branch.
unsandboxed: true
---

When asked to create a pull request, follow these steps:

## Phase 1: Pre-flight checks

1. Run `git status`. If any of the following conditions apply, stop and report the errors:

   - There are unstaged changes
   - There are untracked files
   - The current branch is the default branch (`main`)

2. Check if this is a stacked PR:

   - Run `git merge-base main HEAD` to find the common ancestor with main
   - Run `git log --oneline <merge-base>..HEAD` to see commits since diverging from main
   - Check if any parent commits are on another feature branch (not main)
   - If so, run `gh pr list --head <parent-branch>` to check if that branch has an open PR
   - If a parent branch has an open PR, this is a **stacked PR**

3. Run `git log main..HEAD --oneline` to see the commit history.

4. Run `git diff main...HEAD` to get the full diff for the review.

## Phase 2: Automated PR review (parallel subagents)

Before creating the PR, analyze the diff to decide **which review subagents to launch**. Not every PR needs every reviewer.

### Triage: classify the change

Look at the files changed in the diff and classify the PR:

- **docs-only**: All changed files are documentation (`.md`, `.txt`, `CHANGELOG`, `LICENSE`, `CLAUDE.md`, `.claude/` skill files, `docs/`). **Skip the entire review phase** and go straight to Phase 3.
- **config-only**: All changed files are configuration (`.json`, `.yml`, `.yaml`, `.eslintrc`, `.prettierrc`, `tsconfig`, `Dockerfile`, CI files). Launch only **Subagent 2 (Style)**.
- **test-only**: All changed files are test files (`*.test.ts`, `*.spec.ts`, `test/` directories). Launch only **Subagent 2 (Style)** and **Subagent 4 (Tests)**.
- **code**: Any source code files (`.ts`, `.js`, `.mjs`, `.cjs`, etc.) are changed. Launch **all applicable subagents** based on what changed:
  - Always launch **Subagent 1 (Correctness)** and **Subagent 2 (Style)**
  - Launch **Subagent 3 (Security)** if the diff touches: network/HTTP code, user input handling, authentication, cryptography, `eval`/`Function`, capability passing, or `harden()`/SES-related code
  - Launch **Subagent 4 (Tests)** if non-test source files are changed

### Subagent 1: Correctness & Logic

Prompt the agent to:

- Review the diff for logical errors, off-by-one mistakes, race conditions, and incorrect assumptions
- Check that error handling is adequate at system boundaries
- Verify that new code paths are reachable and dead code hasn't been introduced
- Flag any behavior changes that aren't covered by tests

### Subagent 2: Style & Conventions

Prompt the agent to:

- Check adherence to the project's CLAUDE.md conventions (TypeScript types over interfaces, no `any`, no `enum`, kebab-case files, `@metamask/superstruct` for runtime types, options bags for 3+ args, `harden()` usage, etc.)
- Check test conventions (no "should", `toStrictEqual` for full objects, `it.each` for parameterized tests, concise verb-form titles)
- Flag unnecessary complexity, over-engineering, or missing `harden()` calls

### Subagent 3: Security & Performance

Prompt the agent to:

- Look for OWASP top-10 vulnerabilities (injection, XSS, etc.)
- Check for capability leaks in the ocap model (unhardened objects, leaked references)
- Identify performance issues (unnecessary allocations in hot paths, missing early returns, O(n^2) patterns)
- Verify that lockdown/SES compatibility isn't broken (no ambient authority, no forbidden globals)

### Subagent 4: Test Coverage

Prompt the agent to:

- Identify new or changed logic that lacks corresponding test coverage
- Check that edge cases and error paths are tested
- Verify tests are co-located correctly per project conventions
- Flag any test anti-patterns (global state, missing cleanup, overly broad mocks)

## Phase 3: Review summary

If the review phase was skipped (docs-only), proceed directly to Phase 4.

Otherwise, after all launched subagents complete:

1. Compile findings into a **Review Summary** with sections for each subagent that ran.
2. Classify each finding as one of:
   - **blocker** - Must fix before merging
   - **suggestion** - Should consider fixing
   - **nit** - Minor, optional improvement
3. If there are **blockers**, present them to the user and ask whether to:
   - Fix the blockers automatically, then re-review
   - Proceed with PR creation anyway
   - Abort
4. If there are no blockers, briefly summarize the findings and proceed.

## Phase 4: Create the PR

5. Run `gh pr create` to create a pull request. The PR body should include:

   - A brief narrative description of the PR
   - A summary of the changes (bullet points)
   - A brief description of how the code is tested (narrative, not a checklist)

   **If this is a stacked PR**, add `--draft` to create it as a draft PR.

6. Return the PR URL, the review summary, and any relevant information.
