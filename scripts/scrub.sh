#!/bin/bash

echo "yarn clean"
yarn clean

echo "rm -rf node_modules"
rm -rf node_modules
echo "Done"

echo "rm -rf packages/*/node_modules"
rm -rf packages/*/node_modules
echo "Done"
