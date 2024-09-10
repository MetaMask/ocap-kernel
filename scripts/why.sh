#!/usr/bin/env bash

while [ $# -gt 0 ]; do
  echo 'yarn why -R' "$1"
  yarn why -R "$1"
  shift
done
