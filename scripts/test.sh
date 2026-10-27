#!/bin/zsh
# Builds plugin/main.js from src/, then runs the test kit on the plugin in this project (it reads styles.css next to main.js).
cd "${0:A:h}/.." && scripts/build.sh && node tests/test.cjs "$PWD/plugin/main.js"
