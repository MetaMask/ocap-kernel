---
name: check
description: Lints, builds, and tests the code.
allowed-tools:
  - Bash(yarn lint*)
  - Bash(yarn build*)
  - Bash(yarn test*)
  - Bash(yarn workspace *)
model: claude-haiku-4-5
---

Run the following commands to check the code.

If `$ARGUMENTS` is provided (e.g. `@metamask/ocap-kernel`), run the commands in
that workspace using `yarn workspace $ARGUMENTS`:

1. `yarn workspace $ARGUMENTS lint:fix`
2. `yarn workspace $ARGUMENTS build`
3. `yarn workspace $ARGUMENTS test:dev`

If `$ARGUMENTS` is empty, run the commands at the monorepo root:

1. `yarn lint:fix`
2. `yarn build`
3. `yarn test:dev`

Return the results of the commands.
