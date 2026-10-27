import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', target: ['es2019'], write: false, legalComments: 'none' });
let js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = readFileSync('template.html', 'utf8');
const out = tpl.replace('/*__BUNDLE__*/', () => js);
writeFileSync('index.html', out);
console.log('bundle', (js.length/1024).toFixed(0)+'KB', 'html', (out.length/1024).toFixed(0)+'KB');
