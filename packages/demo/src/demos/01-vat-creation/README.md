# Vat Creation

Each vat is initialized from an entrypoint bundle. The bundle can be produced by calling `yarn ocap bundle <path-to-script>` on a file meeting the following criteria.

1. The file is a `.js` file.
1. The file exports a function called `buildRootObject`.
1. The `buildRootObject` function returns a _remotable_ object—the result of calling `@endo`'s `Far` function on a object with only method properties.

## Demo

From this directory, run the following command.

```
yarn ocap bundle ./my-vat.sh
```

It will produce the file `./my-vat.bundle`.
