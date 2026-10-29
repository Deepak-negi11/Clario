#!/usr/bin/env node
// Same as `viora-agent setup` (see cli.mjs), for running straight from this repo:
//   node tools/agent-hook/setup.mjs [--api-url http://localhost:3001] [--global]
import { run } from "./cli.mjs";

run(["setup", ...process.argv.slice(2)]);
