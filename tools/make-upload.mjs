// Packs dist/index.html (single self-contained file) into crazygames-upload/ping-palace-upload.zip
import fs from 'fs';
import { execSync } from 'child_process';
const out = 'crazygames-upload';
fs.mkdirSync(out, { recursive: true });
const html = fs.readFileSync('dist/index.html', 'utf8');
if (!html.includes('crazygames-sdk-v3.js')) throw new Error('CrazyGames SDK tag missing from dist/index.html');
if (/src="\.?\/?assets\//.test(html) || /href="\.?\/?assets\//.test(html)) throw new Error('index.html still references external asset files');
const zip = `${out}/ping-palace-upload.zip`;
if (fs.existsSync(zip)) fs.unlinkSync(zip);
execSync(`zip -j -9 -q ${zip} dist/index.html`);
const list = execSync(`unzip -Z1 ${zip}`).toString().trim().split('\n');
if (list.length !== 1 || list[0] !== 'index.html') throw new Error('zip must contain only index.html, got: ' + list.join(', '));
console.log(`${zip}: ${list.join(', ')} (${(fs.statSync(zip).size / 1024 / 1024).toFixed(2)} MB zipped, ${(html.length / 1024 / 1024).toFixed(2)} MB unzipped)`);
