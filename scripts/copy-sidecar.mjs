#!/usr/bin/env node

/**
 * Copies the agent-browser native binary into src-tauri/binaries/
 * with the platform target triple suffix required by Tauri sidecar.
 *
 * Usage: node scripts/copy-sidecar.mjs
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const BIN_DIR = path.join(ROOT, "src-tauri", "binaries");

// Map Node platform/arch to agent-browser binary names
const PLATFORM_MAP = {
  "darwin-arm64": "agent-browser-darwin-arm64",
  "darwin-x64": "agent-browser-darwin-x64",
  "linux-arm64": "agent-browser-linux-arm64",
  "linux-x64": "agent-browser-linux-x64",
  "win32-x64": "agent-browser-win32-x64.exe",
};

const key = `${process.platform}-${process.arch}`;
const srcName = PLATFORM_MAP[key];
if (!srcName) {
  console.error(`Unsupported platform: ${key}`);
  process.exit(1);
}

const srcPath = path.join(
  ROOT,
  "node_modules",
  "agent-browser",
  "bin",
  srcName
);

if (!fs.existsSync(srcPath)) {
  console.error(`Binary not found: ${srcPath}`);
  process.exit(1);
}

// Get Rust target triple for sidecar naming
const targetTriple = execSync("rustc --print host-tuple").toString().trim();
const ext = process.platform === "win32" ? ".exe" : "";
const destPath = path.join(BIN_DIR, `agent-browser-${targetTriple}${ext}`);

fs.mkdirSync(BIN_DIR, { recursive: true });
fs.copyFileSync(srcPath, destPath);
fs.chmodSync(destPath, 0o755);

console.log(`Copied sidecar: ${srcName} -> agent-browser-${targetTriple}${ext}`);
