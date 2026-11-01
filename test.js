// Self-check of the git plumbing without VS Code: squash non-contiguous commits in a throwaway repo.
const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSquashTodo } = require('./todo');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebase-helper-test-'));
const git = (...a) => cp.execFileSync('git', a, { cwd: dir, env: { ...process.env, ...env }, stdio: 'pipe' }).toString();
let env = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

git('init', '-q', '-b', 'main');
for (const n of ['base', 'a', 'b', 'c', 'd']) {
  fs.writeFileSync(path.join(dir, n), n);
  git('add', n); git('commit', '-q', '-m', n);
}
const lines = git('log', '--reverse', '--format=%h %s', 'HEAD~4..HEAD').trim().split('\n'); // a b c d
const sha = (s) => lines.find((l) => l.endsWith(' ' + s)).split(' ')[0];

const msgFile = path.join(dir, 'msg'); fs.writeFileSync(msgFile, 'a+c squashed\n');
const todo = buildSquashTodo(lines, new Set([sha('a'), sha('c')]), msgFile);
assert.deepStrictEqual(todo.trim().split('\n').map((l) => l.split(' ')[0]), ['pick', 'fixup', 'exec', 'pick', 'pick']);

const todoFile = path.join(dir, 'todo'); fs.writeFileSync(todoFile, todo);
env = { ...env, REBASE_HELPER_TODO: todoFile, GIT_SEQUENCE_EDITOR: `"${process.execPath}" "${path.join(__dirname, 'editor.js')}"` };
git('rebase', '-i', 'HEAD~4');

assert.deepStrictEqual(git('log', '--format=%s').trim().split('\n'), ['d', 'b', 'a+c squashed', 'base']);
assert.deepStrictEqual(git('show', '--name-only', '--format=', 'HEAD~2').trim().split('\n'), ['a', 'c']);
fs.rmSync(dir, { recursive: true });
console.log('ok');
