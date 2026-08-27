---
name: prose-pass
description: Trim comments, changelog entries, and PR bodies down to non-obvious "why". Run before presenting code, committing, or opening a PR.
---

A pass over the prose in a diff — code comments, JSDoc, changelog entries, PR
body — deleting text a reader does not need.

Run it **before** presenting work, not after someone asks for it.

## The bar

**The desired default is no comment.** A comment must justify its existence;
accuracy is not a justification. Do not preserve prose merely because it is
true, and do not preserve it merely because you wrote it.

The bar is **"obvious and logical"**, not "true and useful". A comment stating a
real hazard still goes if a competent reader derives it from the adjacent lines.
What survives is what the code cannot carry: a constraint, a non-obvious failure
mode, or why a test is shaped oddly — in the shortest form that carries it.

Every judgement here is about **information content, never about style**. No
phrasing is banned; nothing survives on phrasing either.

The cost of cutting too much is one line restored on request. The cost of
cutting too little is paid by every future reader.

## Prefer a code change to a comment

If a comment is necessary only because the surrounding identifier or structure
is unclear, **fix the identifier or the structure and delete the comment.** A
comment explaining what a name means is a rename waiting to happen; a comment
labelling a stretch of a long function is an extracted function waiting to
happen.

## AI smell openers

Comments beginning with phrases such as `Ensure`, `Handle`, `Now`, `First`,
`Then`, `We need to`, `This allows`, `This ensures`, `Note that`, or `Important`
often introduce a restatement of the next line. **Treat the opener as a signal to
inspect the comment, not as a deletion rule.**

Delete it when the remaining sentence merely narrates the code. Keep it when the
sentence carries information the code cannot express: a constraint, an invariant,
a compatibility requirement, or a non-obvious failure mode. For example:

```js
// Note that N must stay a power of two.
```

stays if nothing in the type system or the surrounding code makes that constraint
apparent.

When the verdict is delete, delete — rewriting a restatement into a shorter
restatement is not the fix.

## Delete on sight

- **Restatements of the next line.** If the identifier, the following statement,
  or the `it(...)` title already says it, cut it. This covers a comment
  describing a newly introduced variable immediately above its declaration, and
  a comment restating the signature above a function.
- **Any comment above a `logger.error`/`logger.warn` call.** The log message
  states the failure; a preamble explaining why it is logged rather than thrown
  is padding. (Exception: an empty `catch {}` that lint forces you to annotate.)
- **TDD scaffolding.** `// FAILING REPRO.` and the paragraph under it describe a
  bug that no longer exists once the fix lands.
- **Per-test preambles.** The test title is the claim; the source comment is the
  reasoning. Do not re-argue the fix in the test file.
- **Narration of test steps** when the mock's name already says it
  (`// The second enqueue is the write that fails.`).

Keep in tests **only** mock and setup mechanics that would otherwise baffle:
which prepared statement the failure targets, why a shared mock makes the
expected call count 2, why a cache is primed before the assertion.

## Say it once

State a rationale once, at the code it justifies — not in both a source comment
and its test, and not duplicated across sibling files.

At the second site, **delete it and add nothing.** No cross-file pointer, no
"same reasoning as `<name>`" — a reader who needs the argument finds it, and one
who doesn't pays for the line. A pointer is warranted only when the second site
is genuinely hard to understand without it; that is rare, and the burden is on
the pointer.

## JSDoc

Keep the tags the repo's `jsdoc/*` lint rules require (`@param`, `@returns`) —
make the prose minimal rather than dropping the tag. Trim `@param` text to a
bare noun phrase (`The error the rollback threw, if it threw.`), not a clause
about how the argument is used.

## Changelogs and PR bodies

Same rule: state the change and its why once, then stop. See
[`docs/contributing/updating-changelogs.md`](../../../docs/contributing/updating-changelogs.md)
for the format; this section is about length.

- Default to **one line per user-visible change**, naming renamed or added API,
  and `**BREAKING:**` where it applies.
- A sub-bullet is for a consumer-facing detail that doesn't fit the line, not
  for the story behind the change.
- Several entries describing one user-visible change collapse into one.

Never put in a changelog: how the fix works internally, which mechanism was
chosen over which alternative, what was verified, or a "known gap" / follow-up
bullet.

Ask of every line: **does a consumer do something differently because of it?**
If not, cut it.

## Checklist

1. Find the diff's added comments matching the openers above and judge each one
   on information content — delete the narration, keep the constraints.
2. Re-read every remaining comment. Delete any whose information is in the
   identifier, the next line, the test title, or another file.
3. For each survivor, ask whether a rename or an extracted function removes the
   need for it. If so, make that change instead.
4. Re-read what is left asking **"is this obvious?"** — this pass is the one that
   gets skipped, and it is where most of the cuts are.
5. Apply the changelog / PR-body test above to each entry.
6. Report what was cut only if asked; otherwise just present the trimmed work.
