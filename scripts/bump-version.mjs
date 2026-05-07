import { readFileSync, writeFileSync } from 'fs';

const version = process.argv[2];
if (!version) {
  console.error('Usage: bump-version.mjs <version>');
  process.exit(1);
}

// package.json
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.version = version;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('✓ package.json');

// src-tauri/Cargo.toml
let cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
cargo = cargo.replace(/^(version = )"[^"]*"/m, `$1"${version}"`);
writeFileSync('src-tauri/Cargo.toml', cargo);
console.log('✓ src-tauri/Cargo.toml');

// src-tauri/tauri.conf.json
const tauri = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
tauri.version = version;
writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(tauri, null, 2) + '\n');
console.log('✓ src-tauri/tauri.conf.json');

// src-tauri/Cargo.lock (member-level lock file)
let lockMember = readFileSync('src-tauri/Cargo.lock', 'utf8');
lockMember = lockMember.replace(/(name = "charon"\nversion = )"[^"]*"/, `$1"${version}"`);
writeFileSync('src-tauri/Cargo.lock', lockMember);
console.log('✓ src-tauri/Cargo.lock');

// Cargo.lock (workspace-level lock file)
let lockRoot = readFileSync('Cargo.lock', 'utf8');
lockRoot = lockRoot.replace(/(name = "charon"\nversion = )"[^"]*"/, `$1"${version}"`);
writeFileSync('Cargo.lock', lockRoot);
console.log('✓ Cargo.lock');

console.log(`\nBumped all files to ${version}`);
