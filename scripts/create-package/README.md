# `create-package`

> [!NOTE]
> This script was adapted from
> [`MetaMask/core#85188d8`](https://github.com/MetaMask/core/tree/85188d8146d13f06e1fe1a4143b6a35ac95630ea/scripts/create-package).

Manually creating a new monorepo package can be a tedious, even frustrating process. To alleviate that
problem, we have created a CLI that automates most of the job for us, creatively titled
[`create-package`](./). To create a new monorepo package, follow these steps:

1. Create a new package using `yarn create-package`.
   - Use the `--help` flag for usage information.
   - Once this is done, you can find a package with your chosen name in `/packages`.
   - By default, `create-package` does not set a license. This is pending
     decisions about `ocap-kernel` licensing generally.
2. Add your dependencies.
   - Do this as normal using `yarn`.
   - Remember, if you are adding other monorepo packages as dependents, don't forget to add them
     to the `references` array in your package's `tsconfig.json` and `tsconfig.build.json`.

And that's it!

## Contributing to `create-package`

Along with this documentation, `create-package` is intended to be the source of truth for the process of adding new packages to the monorepo. Consequently, to change that process, you will want to change `create-package`.

The `create-package` directory contains a [template package](./package-template/). The CLI is not aware of the contents of the template, only that its files have [placeholder values](./constants.ts). When a new package is created, the template files are read from disk, the placeholder values are replaced with real ones, and the updated files are added to a new directory in `/packages`. To modify the template package:

- If you need to add or modify any files or folders, just go ahead and make your changes in [`/scripts/create-package/package-template`](./package-template/). The CLI will read whatever's in that directory and write it to disk.
- If you need to add or modify any placeholders, make sure that your desired values are added to both the relevant file(s) and [`/scripts/create-package/constants.ts`](./constants.ts). Then, update the implementation of the CLI accordingly.
- As with placeholders, updating the monorepo files that the CLI interacts with begins by updating [`/scripts/create-package/constants.ts`](./constants.ts).
