#!/bin/bash
set -e

# Bundle the counter vat
echo "Bundling counter vat..."
yarn ocap bundle src/counter-vat.js

echo "Vat bundling complete!"

