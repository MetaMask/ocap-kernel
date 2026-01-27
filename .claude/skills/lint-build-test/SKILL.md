---
name: lint-build-test
description: How to check code by linting, building, and testing.
---

When asked to check, lint, build, or test code, follow these steps:

## For a specific package

If a package name is specified (e.g. `@metamask/ocap-kernel`), run the commands in that workspace:

1. `yarn workspace <package-name> lint:fix`
2. `yarn workspace <package-name> build`
3. `yarn workspace <package-name> test:dev:quiet`

## For the entire monorepo

If no package is specified, run the commands at the monorepo root:

1. `yarn lint:fix`
2. `yarn build`
3. `yarn test:dev:quiet`

Report any errors encountered during these steps.
