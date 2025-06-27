# Vat Creation

Each vat is initialized from an entrypoint bundle. The bundle can be produced by calling `yarn ocap bundle <path-to-script>` on a file meeting the following criteria.

1. The file is a `.js` file.
1. The file exports a function called `buildRootObject`.
1. The `buildRootObject` function returns a _remotable_ object—the result of calling `@endo`'s `Far` function on a object with only method properties.

## Demo (GUI)

```
yarn ocap start demos/01-vat-creation
```

## Demo (CLI)

From this directory, run the following command.

```sh
yarn ocap bundle my-vat.js
```

It will produce the file `./my-vat.bundle`. Then, use the demo runner to run the bundle.

```
yarn demo -b <bundle-path> -p <parameters> -m <method-name>
```

This will create a vat from the bundle file at `<bundle-path>`, calling buildRootObject with parameters parsed from the JSON `<parameters>`, and calling the method `<method-name>` on the resulting root object.

```sh
yarn run-bundle -b my-vat.bundle -p '{ "name": "Alice" }' -m hello

> Demo completed: Hello, Alice!
```

```sh
yarn run-bundle -b my-vat.bundle -p '{ "name": "Alice" }' -m goodbye

> Demo completed: Goodbye, Alice!
```

```sh
yarn run-bundle -b my-vat.bundle -p '{ "name": "Alice" }' aloha

> Demo failed: target has no method "aloha", has ["__getMethodNames__","goodbye","hello"]
```
