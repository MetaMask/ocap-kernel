---
name: create-package
description: Create a new monorepo package using the create-package CLI
---

# Create Package Skill

Use this skill when the user asks to create a new package in the monorepo.

## Overview

The `yarn create-package` command automates the creation of new monorepo packages by:

- Generating package scaffolding from the template package
- Setting up the package structure, configuration files, and dependencies
- Creating package.json with the provided name and description

## Required Arguments

- `--name` (or `-n`): The package name. Will be prefixed with "@ocap/" if not provided.
- `--description` (or `-d`): A short description of the package for package.json

## Usage Pattern

1. Ask the user for the package name and description if not provided
2. Run `yarn create-package --name <package-name> --description "<description>"`
3. After successful creation, remind the user to:
   - Add coverage thresholds to the root `vitest.config.ts` file
   - Add any additional dependencies using `yarn workspace @ocap/<package-name> add <dep>`
   - If adding monorepo packages as dependencies, update the `references` array in the package's `tsconfig.json` and `tsconfig.build.json`

## Example

```bash
yarn create-package --name my-package --description "A package for handling my feature"
```

This creates a new package at `packages/my-package` with the name `@ocap/my-package`.

## Post-Creation Steps

Always remind the user of these manual steps after package creation:

1. **Add coverage thresholds** to root `vitest.config.ts`:

   - The CLI cannot modify .ts config files automatically
   - Add appropriate coverage thresholds for the new package

2. **Add dependencies** if needed:

   ```bash
   yarn workspace @ocap/<package-name> add <dependency>
   ```

3. **Update TypeScript references** if adding monorepo dependencies:
   - Add to `references` array in `tsconfig.json`
   - Add to `references` array in `tsconfig.build.json`

## Notes

- The package name will automatically be prefixed with "@ocap/" if not provided
- The created package is private by default
- The template is located at `packages/template-package/`
- All placeholder values in the template will be replaced with actual values
