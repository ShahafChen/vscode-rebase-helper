const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSquashTodo } = require('./todo');

const out = vscode.window.createOutputChannel('Rebase Helper');
const bridgeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebase-helper-'));
const editorJs = path.join(__dirname, 'editor.js');

function gitEnv(extra = {}) {
  const editor = `ELECTRON_RUN_AS_NODE=1 "${process.execPath}" "${editorJs}"`;
  return { ...process.env, GIT_EDITOR: editor, GIT_SEQUENCE_EDITOR: editor, REBASE_HELPER_DIR: bridgeDir, GIT_TERMINAL_PROMPT: '0', ...extra };
}

function git(cwd, args, env = gitEnv()) {
  out.appendLine(`$ git ${args.join(' ')}`);
  const run = new Promise((resolve, reject) => {
    cp.execFile('git', args, { cwd, env, maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      if (stdout) out.append(stdout);
      if (stderr) out.append(stderr);
      err ? reject(Object.assign(err, { stdout, stderr })) : resolve(stdout);
    });
  });
  return vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `git ${args[0]}` }, () => run);
}

// --- editor bridge: git (via editor.js) asks us to open a file; we answer when the tab is closed ---
async function serveEditorRequest(reqFile) {
  const id = path.basename(reqFile, '.req');
  const target = fs.readFileSync(reqFile, 'utf8').trim();
  fs.unlinkSync(reqFile);
  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc, { preview: false });
  await new Promise((resolve) => {
    const sub = vscode.workspace.onDidCloseTextDocument((d) => {
      if (d.uri.fsPath === doc.uri.fsPath) { sub.dispose(); resolve(); }
    });
    vscode.window.showInformationMessage(`Edit ${path.basename(target)}, then click Done (or save and close the tab).`, 'Done')
      .then(async (a) => {
        if (a !== 'Done') return;
        await doc.save();
        for (const g of vscode.window.tabGroups.all) for (const t of g.tabs) {
          if (t.input instanceof vscode.TabInputText && t.input.uri.fsPath === doc.uri.fsPath) await vscode.window.tabGroups.close(t);
        }
      });
  });
  fs.writeFileSync(path.join(bridgeDir, `${id}.done`), '');
}

function watchBridge() {
  return fs.watch(bridgeDir, () => {
    for (const f of fs.readdirSync(bridgeDir)) {
      if (f.endsWith('.req')) serveEditorRequest(path.join(bridgeDir, f)).catch((e) => vscode.window.showErrorMessage(String(e)));
    }
  });
}

// --- helpers ---
async function pickRepo() {
  const repos = vscode.extensions.getExtension('vscode.git').exports.getAPI(1).repositories;
  if (!repos.length) throw new Error('No git repository is open.');
  if (repos.length === 1) return repos[0].rootUri.fsPath;
  return vscode.window.showQuickPick(repos.map((r) => r.rootUri.fsPath), { placeHolder: 'Repository' });
}

async function pickCommits(cwd, options, customRef) {
  const log = await git(cwd, ['log', '--format=%h%x00%s%x00%an, %ar', '-n', '100']);
  const items = log.trim().split('\n').filter(Boolean).map((l) => {
    const [sha, subject, meta] = l.split('\0');
    return { label: `${sha}  ${subject}`, description: meta, sha, subject };
  });
  if (customRef) items.unshift({ label: '$(pencil) Type a base ref… (e.g. origin/main, HEAD~5)', alwaysShow: true });
  return vscode.window.showQuickPick(items, { matchOnDescription: true, ...options });
}

async function rebaseInProgress(cwd) {
  const p = (await git(cwd, ['rev-parse', '--git-path', 'rebase-merge'])).trim();
  return fs.existsSync(path.resolve(cwd, p));
}

async function runRebase(cwd, args, env) {
  try {
    await git(cwd, args, env);
    vscode.window.showInformationMessage('Rebase finished.');
  } catch (e) {
    if (!(await rebaseInProgress(cwd))) return vscode.window.showErrorMessage(`git ${args.join(' ')} failed: ${(e.stderr || e.message).trim()}`);
    const hint = (e.stderr || '').trim().split('\n').pop();
    const a = await vscode.window.showWarningMessage(
      `Rebase paused. Resolve conflicts in Source Control and stage the files, then Continue. (${hint})`,
      'Continue', 'Skip this commit', 'Abort');
    if (a === 'Continue') return runRebase(cwd, ['rebase', '--continue']);
    if (a === 'Skip this commit') return runRebase(cwd, ['rebase', '--skip']);
    if (a === 'Abort') return abort(cwd);
  }
}

async function abort(cwd) {
  await git(cwd, ['rebase', '--abort']);
  vscode.window.showInformationMessage('Rebase aborted.');
}

// --- commands ---
async function fetch() {
  const cwd = await pickRepo();
  if (!cwd) return;
  await git(cwd, ['fetch', 'origin', '--prune']);
  vscode.window.showInformationMessage('Fetched origin.');
}

async function interactiveRebase() {
  const cwd = await pickRepo();
  if (!cwd) return;
  const pick = await pickCommits(cwd, { placeHolder: 'Oldest commit to include (it and everything after it will be rebased)' }, true);
  if (!pick) return;
  const base = pick.sha ? `${pick.sha}~1` : await vscode.window.showInputBox({ prompt: 'Base ref', placeHolder: 'origin/main' });
  if (!base) return;
  await runRebase(cwd, ['rebase', '-i', base]);
}

async function squash() {
  const cwd = await pickRepo();
  if (!cwd) return;
  const picked = await pickCommits(cwd, { canPickMany: true, placeHolder: 'Select two or more commits to squash into one' });
  if (!picked) return;
  if (picked.length < 2) return vscode.window.showWarningMessage('Select at least two commits.');
  const oldest = picked[picked.length - 1]; // quick pick keeps list order: newest first
  const message = await vscode.window.showInputBox({ prompt: 'Message for the squashed commit', value: oldest.subject });
  if (!message) return;
  const log = await git(cwd, ['log', '--reverse', '--format=%h %s', `${oldest.sha}~1..HEAD`]);
  const msgFile = path.join(bridgeDir, 'squash-msg');
  const todoFile = path.join(bridgeDir, 'squash-todo');
  fs.writeFileSync(msgFile, message + '\n');
  fs.writeFileSync(todoFile, buildSquashTodo(log.trim().split('\n'), new Set(picked.map((p) => p.sha)), msgFile));
  await runRebase(cwd, ['rebase', '-i', `${oldest.sha}~1`], gitEnv({ REBASE_HELPER_TODO: todoFile }));
}

async function continueRebase() {
  const cwd = await pickRepo();
  if (cwd) await runRebase(cwd, ['rebase', '--continue']);
}

async function abortRebase() {
  const cwd = await pickRepo();
  if (cwd) await abort(cwd);
}

function activate(context) {
  const guard = (fn) => () => fn().catch((e) => vscode.window.showErrorMessage((e.stderr || e.message || String(e)).trim()));
  context.subscriptions.push(
    out,
    { dispose: () => watcher.close() },
    vscode.commands.registerCommand('rebaseHelper.fetch', guard(fetch)),
    vscode.commands.registerCommand('rebaseHelper.interactiveRebase', guard(interactiveRebase)),
    vscode.commands.registerCommand('rebaseHelper.squash', guard(squash)),
    vscode.commands.registerCommand('rebaseHelper.continue', guard(continueRebase)),
    vscode.commands.registerCommand('rebaseHelper.abort', guard(abortRebase)),
  );
  const watcher = watchBridge();
}

module.exports = { activate, deactivate() {} };
