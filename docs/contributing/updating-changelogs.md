# Updating changelogs

Each package in this repo has a file named `CHANGELOG.md` which is used to
record consumer-facing changes that have been published over time. All
changelogs follow the ["Keep a Changelog"](https://keepachangelog.com/)
specification (enforced by `@metamask/auto-changelog`).

If a PR introduces a consumer-facing change to one or more packages, their changelogs must
be updated. This is enforced by CI. When updating changelogs, keep the following in mind:

- A changelog is not a git history; it is a summary of consumer-facing changes introduced by
  a particular release.
  - Consider each PR from the perspective of a consumer of an individual package. Changelog
    entries may differ between packages.
  - For example, if you're introducing feature X to package A, and it contains an incidental
    change Y to package B, the package changelogs should reflect this.
  - Describe entries in natural language; do not simply reuse the commit message.
- Unless you're cutting a new release, place new entries under the "Unreleased" section.
- Place changes into categories. Consult the ["Keep a Changelog"](https://keepachangelog.com/en/1.1.0/#how) specification for the list.
- Highlight breaking changes by prefixing them with `**BREAKING:**`.
- Omit non-consumer facing changes from the changelog.
- Use a list nested under a changelog entry to enumerate more details about a change if need be.
- Include links (e.g. `#123) to the pull request(s) that introduced each change.
- Combine like changes from multiple pull requests into a single changelog entry if necessary.
- Split disparate changes from the same pull request into multiple entries if necessary.
- Only included reverted changes if they were previously released.

If your PR does not contain any consumer-facing changes, add the label `no-changelog`, and the
changelog validation CI job will be skipped.
