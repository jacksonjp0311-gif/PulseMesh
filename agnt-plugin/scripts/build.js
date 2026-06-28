#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as tar from 'tar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_DIR = path.resolve(__dirname, '..');
const REPO_DIR = path.resolve(PLUGIN_DIR, '..');
const DIST_DIR = path.join(PLUGIN_DIR, 'dist');
const STAGE_DIR = path.join(DIST_DIR, 'stage', 'pulsemesh');
const OUTPUT_FILE = path.join(DIST_DIR, 'pulsemesh.agnt');

function copyRecursive(source, target, ignore = new Set()) {
  if (!fs.existsSync(source)) return;
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      if (ignore.has(entry)) continue;
      copyRecursive(path.join(source, entry), path.join(target, entry), ignore);
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function resetStage() {
  fs.rmSync(path.join(DIST_DIR, 'stage'), { recursive: true, force: true });
  fs.mkdirSync(STAGE_DIR, { recursive: true });
}

async function build() {
  const manifestPath = path.join(PLUGIN_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest.json not found');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  fs.mkdirSync(DIST_DIR, { recursive: true });
  resetStage();

  for (const entry of ['manifest.json', 'package.json', 'pulsemesh-agnt.js', 'README.md']) {
    copyRecursive(path.join(PLUGIN_DIR, entry), path.join(STAGE_DIR, entry));
  }
  copyRecursive(path.join(PLUGIN_DIR, 'profiles'), path.join(STAGE_DIR, 'profiles'));
  copyRecursive(path.join(PLUGIN_DIR, 'scripts'), path.join(STAGE_DIR, 'scripts'));

  const vendorDir = path.join(STAGE_DIR, 'vendor', 'pulsemesh');
  for (const entry of ['src', 'examples', 'schemas']) {
    copyRecursive(path.join(REPO_DIR, entry), path.join(vendorDir, entry), new Set(['__pycache__']));
  }
  for (const entry of ['pyproject.toml', 'README.md', 'LICENSE']) {
    copyRecursive(path.join(REPO_DIR, entry), path.join(vendorDir, entry));
  }
  copyRecursive(path.join(REPO_DIR, 'docs', 'contracts'), path.join(vendorDir, 'docs', 'contracts'));

  await tar.create(
    {
      gzip: true,
      file: OUTPUT_FILE,
      cwd: path.join(DIST_DIR, 'stage'),
    },
    ['pulsemesh'],
  );

  const stats = fs.statSync(OUTPUT_FILE);
  console.log(JSON.stringify({
    ok: true,
    name: manifest.name,
    version: manifest.version,
    tools: manifest.tools?.map((tool) => tool.type) || [],
    output: OUTPUT_FILE,
    size_kb: Number((stats.size / 1024).toFixed(1)),
  }, null, 2));
}

build().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
