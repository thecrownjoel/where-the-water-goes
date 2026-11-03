#!/usr/bin/env node
// Windows only: produce a .scr (a renamed .exe) from the release build. Right-click the
// .scr → Install, or copy it to %SystemRoot%\System32. See docs/PLATFORMS.md.
import fs from 'node:fs';
const exe = 'src-tauri/target/release/where-the-water-goes.exe';
if (!fs.existsSync(exe)) throw new Error(`build first: npm run tauri build (missing ${exe})`);
fs.mkdirSync('dist-scr', { recursive: true });
fs.copyFileSync(exe, 'dist-scr/WhereTheWaterGoes.scr');
console.log('wrote dist-scr/WhereTheWaterGoes.scr (unsigned)');
