#!/usr/bin/env bash

# set -x
set -e
set -o pipefail

dir=$(pwd)

package_root="$(dirname "$0")/.."
cd "$package_root"
package_root=$(pwd)
monorepo_root="$package_root/../.."

while getopts ":ab:" _; do
  case $OPTARG in
    f) force=1 ;;
    \?) echo "Invalid option: -$OPTARG"; exit 1 ;;
  esac
done

if ! [ "$force" = "1" ] && [ -f "node_modules/better-sqlite3/build/better_sqlite3.node" ]; then
  echo "Found better-sqlite3 bindings."
  exit 0
fi

echo "Building better-sqlite3 bindings."

# build better-sqlite at the monorepo root
cd "$monorepo_root"
cd node_modules/better-sqlite3
yarn build-release

# move back to the source folder
cd "$package_root"

# copy the build to this package
mkdir -p node_modules/better-sqlite3/build/
cp -r ../../node_modules/better-sqlite3/build/Release/ node_modules/better-sqlite3/build/

cd "$dir"
