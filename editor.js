// Used by git as GIT_EDITOR / GIT_SEQUENCE_EDITOR (run under the VS Code node via ELECTRON_RUN_AS_NODE).
// Todo mode: copy a prepared todo and exit. Otherwise: ask the extension host to open the file, wait until it is closed.
const fs = require('fs');
const path = require('path');

const file = path.resolve(process.argv[2]);
if (process.env.REBASE_HELPER_TODO && path.basename(file) === 'git-rebase-todo') {
  fs.copyFileSync(process.env.REBASE_HELPER_TODO, file);
  process.exit(0);
}

const dir = process.env.REBASE_HELPER_DIR;
const id = `${Date.now()}-${process.pid}`;
fs.writeFileSync(path.join(dir, `${id}.tmp`), file);
fs.renameSync(path.join(dir, `${id}.tmp`), path.join(dir, `${id}.req`)); // rename = atomic for fs.watch
const done = path.join(dir, `${id}.done`);
(function wait() {
  if (fs.existsSync(done)) { fs.unlinkSync(done); return; }
  setTimeout(wait, 200);
})();
