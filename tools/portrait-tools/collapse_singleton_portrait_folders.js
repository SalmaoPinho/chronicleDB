#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORTRAITS_ROOT = path.join(ROOT, 'portraits');
const MEDIA_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.tif', '.tiff', '.mp4']);

function usage() {
  console.log('Usage: node tools/portrait-tools/collapse_singleton_portrait_folders.js [--apply] [--root <path>]');
  process.exit(1);
}

function toPosix(p) {
  return String(p || '').replace(/\\/g, '/');
}

function isMediaFile(filePath) {
  return MEDIA_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function uniqueDestination(dirPath, baseName, ext) {
  let attempt = 0;
  let candidate = path.join(dirPath, `${baseName}${ext}`);
  while (fs.existsSync(candidate)) {
    attempt += 1;
    candidate = path.join(dirPath, `${baseName}-${attempt}${ext}`);
  }
  return candidate;
}

function parseArgs(argv) {
  let apply = false;
  let root = PORTRAITS_ROOT;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--root') {
      const value = argv[index + 1];
      if (!value) usage();
      root = path.resolve(value);
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      usage();
    }
    usage();
  }

  return { apply, root };
}

function main() {
  const { apply, root } = parseArgs(process.argv.slice(2));
  const miscRoot = path.join(root, 'misc');

  if (!fs.existsSync(root)) {
    console.error('Portrait root not found:', root);
    process.exit(1);
  }

  ensureDir(miscRoot);

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'misc') continue;

    const folderPath = path.join(root, entry.name);
    const children = fs.readdirSync(folderPath, { withFileTypes: true });
    const mediaFiles = children.filter((child) => child.isFile() && isMediaFile(child.name));
    const otherItems = children.filter((child) => !child.isFile() || !isMediaFile(child.name));

    if (mediaFiles.length !== 1 || otherItems.length !== 0) {
      continue;
    }

    const sourceName = mediaFiles[0].name;
    const sourcePath = path.join(folderPath, sourceName);
    const ext = path.extname(sourceName);
    const destinationPath = uniqueDestination(miscRoot, entry.name, ext);

    results.push({
      folder: entry.name,
      source: toPosix(path.relative(ROOT, sourcePath)),
      destination: toPosix(path.relative(ROOT, destinationPath))
    });

    if (!apply) continue;

    fs.renameSync(sourcePath, destinationPath);
    fs.rmdirSync(folderPath);
  }

  if (!results.length) {
    console.log('No singleton portrait folders found.');
    return;
  }

  for (const item of results) {
    const action = apply ? 'Moved' : 'Would move';
    console.log(`${action} ${item.source} -> ${item.destination}`);
  }

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to make changes.');
  }
}

main();