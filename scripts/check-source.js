#!/usr/bin/env node
// Parse each inline classic script independently; never concatenate scopes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function syntaxErrors(file, source) {
  const errors = [];
  function parse(code, line = 1) {
    try { new vm.Script(code, { filename: file, lineOffset: line - 1 }); }
    catch (error) { errors.push(String(error.stack).split('\n').slice(0, 6).join('\n')); }
  }
  if (file.endsWith('.html')) {
    const tag = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    for (const match of source.matchAll(tag)) {
      if (/\bsrc\s*=/i.test(match[1])) continue;
      const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(match[1]);
      if (type && !/^(?:text|application)\/(?:java|ecma)script$/i.test(type[1])) continue;
      const start = match.index + match[0].indexOf('>') + 1;
      parse(match[2], source.slice(0, start).split('\n').length);
    }
  } else if (file.endsWith('.js')) parse(source);
  else throw new Error('Expected an HTML or JS source: ' + file);
  return errors;
}

function main(files) {
  if (!files.length) throw new Error('Usage: node scripts/check-source.js <file.html|file.js> ...');
  const errors = files.flatMap(file => syntaxErrors(file, fs.readFileSync(path.resolve(file), 'utf8')));
  if (errors.length) { console.error(errors.join('\n')); return 1; }
  return 0; // Hooks stay silent on success.
}

module.exports = { syntaxErrors };
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
