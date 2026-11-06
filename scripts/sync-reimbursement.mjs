import fs from 'node:fs';
import path from 'node:path';

const [sourceArg, targetArg, ref = 'unknown'] = process.argv.slice(2);
if (!sourceArg || !targetArg) {
  console.error('Usage: node scripts/sync-reimbursement.mjs <source-dist> <target-dir> [source-ref]');
  process.exit(2);
}

const source = path.resolve(sourceArg);
const target = path.resolve(targetArg);
const sourceIndex = path.join(source, 'index.html');
if (!fs.existsSync(sourceIndex)) {
  throw new Error(`报销助手构建目录缺少 index.html：${source}`);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true });

for (const entry of fs.readdirSync(target)) {
  if (entry === '.DS_Store' || entry === 'manifest.webmanifest' || entry === 'registerSW.js' || entry === 'sw.js' || /^workbox-.+\.js$/.test(entry)) {
    fs.rmSync(path.join(target, entry), { recursive: true, force: true });
  }
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (/\.(?:html|js|mjs|css|json)$/i.test(entry.name)) patchFile(fullPath);
  }
}

function patchFile(file) {
  let text = fs.readFileSync(file, 'utf8');
  const original = text;

  text = text
    .replaceAll('/base-workbench/tools/reimbursement/', './')
    .replace(/("|'|`)\/assets\//g, '$1./assets/')
    .replace(/("|'|`)\/fonts\//g, '$1./fonts/')
    .replace(/("|'|`)\/tessdata\//g, '$1./tessdata/')
    .replace(/("|'|`)\/tesseract\//g, '$1./tesseract/')
    .replace(/("|'|`)\/cmaps\//g, '$1./cmaps/')
    .replace(/("|'|`)\/standard_fonts\//g, '$1./standard_fonts/')
    .replace(/("|'|`)\/builtin\//g, '$1./builtin/')
    .replace(/("|'|`)\/version\.json/g, '$1./version.json')
    .replace(/("|'|`)\/icon-(192|512)\.png/g, '$1./icon-$2.png')
    .replace(/location\.origin:("")/g, 'location.origin+new URL("./",location.href).pathname.replace(/\\/$/,""):$1')
    .replace(/\s*<link rel="manifest"[^>]*>/g, '')
    .replace(/\s*<script id="vite-plugin-pwa:register-sw"[^>]*><\/script>/g, '')
    .replace(/,\s*maximum-scale=1\.0, user-scalable=no/g, '')
    .replace(/, \/>/g, ' />');

  if (text !== original) fs.writeFileSync(file, text);
}

walk(target);

fs.writeFileSync(path.join(target, 'SYNC.json'), JSON.stringify({
  sourceRepository: 'm0ba/reimbursement-assistant',
  ref
}, null, 2) + '\n');

console.log(`Synced reimbursement-assistant@${ref} to ${path.relative(process.cwd(), target)}`);
