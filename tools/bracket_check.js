const fs = require('fs');

const filePath = process.argv[2] || 'script.js';
const code = fs.readFileSync(filePath, 'utf8');

let state = 'code';
let esc = false;
const stack = [];
let line = 1;
let col = 0;

function push(ch, i) {
  stack.push({ ch, line, col, i });
}

for (let i = 0; i < code.length; i++) {
  const c = code[i];
  const n = code[i + 1];

  if (c === '\n') {
    line++;
    col = 0;
  } else {
    col++;
  }

  if (state === 'linecomment') {
    if (c === '\n') state = 'code';
    continue;
  }

  if (state === 'blockcomment') {
    if (c === '*' && n === '/') {
      state = 'code';
      i++;
      col++;
    }
    continue;
  }

  if (state === 'single') {
    if (!esc && c === '\\') {
      esc = true;
      continue;
    }
    if (!esc && c === "'") state = 'code';
    esc = false;
    continue;
  }

  if (state === 'double') {
    if (!esc && c === '\\') {
      esc = true;
      continue;
    }
    if (!esc && c === '"') state = 'code';
    esc = false;
    continue;
  }

  // Note: template literals are treated as strings; this is a heuristic.
  if (state === 'template') {
    if (!esc && c === '\\') {
      esc = true;
      continue;
    }
    if (!esc && c === '`') state = 'code';
    esc = false;
    continue;
  }

  // code state
  if (c === '/' && n === '/') {
    state = 'linecomment';
    i++;
    col++;
    continue;
  }
  if (c === '/' && n === '*') {
    state = 'blockcomment';
    i++;
    col++;
    continue;
  }

  if (c === "'") {
    state = 'single';
    continue;
  }
  if (c === '"') {
    state = 'double';
    continue;
  }
  if (c === '`') {
    state = 'template';
    continue;
  }

  if (c === '(' || c === '{' || c === '[') push(c, i);

  if (c === ')' || c === '}' || c === ']') {
    const open = stack.pop();
    if (!open) {
      console.log(`Extra closing ${c} at ${line}:${col}`);
      process.exitCode = 2;
      break;
    }
  }
}

console.log(`end state: ${state}`);
console.log(`unclosed opens: ${stack.length}`);
if (stack.length) {
  const last = stack[stack.length - 1];
  console.log(`last open '${last.ch}' at ${last.line}:${last.col}`);
}
