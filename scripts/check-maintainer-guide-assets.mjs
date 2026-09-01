#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const aggregateValidator = path.join(scriptDir, "check-maintainer-guide.mjs");
const argumentsFromCaller = process.argv.slice(2);
const aggregateArguments =
  argumentsFromCaller.length === 1 && !argumentsFromCaller[0].startsWith("--")
    ? ["--root", path.dirname(path.resolve(argumentsFromCaller[0]))]
    : argumentsFromCaller;
const result = spawnSync(
  process.execPath,
  [aggregateValidator, ...aggregateArguments],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(`FAIL: could not start aggregate validator: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
