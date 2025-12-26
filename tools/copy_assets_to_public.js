const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets');
const DEST = path.join(ROOT, 'public', 'assets');

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const dirent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, dirent.name);
    const destPath = path.join(destDir, dirent.name);
    if (dirent.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (dirent.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(SRC)) {
  console.error(`Missing assets directory: ${SRC}`);
  process.exit(1);
}

copyDir(SRC, DEST);
console.log(`Copied assets -> ${path.relative(ROOT, DEST)}`);
