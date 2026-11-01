# Rebase Helper

Interactive rebase, fetch and squash from VS Code, with the same flow you get in a terminal:
the rebase todo and commit messages open as VS Code tabs, and conflicts are resolved in the normal
Source Control view / merge editor.

## Install

Option A: from a VSIX (recommended)

```sh
cd vscode-rebase-helper
npx @vscode/vsce package          # produces rebase-helper-0.1.0.vsix
code --install-extension rebase-helper-0.1.0.vsix
```

Or in VS Code: Extensions view → `…` menu → **Install from VSIX…**.

Option B: run from source. Open this folder in VS Code and press **F5** (Extension Development Host).

Reload the window after installing. Requires VS Code desktop with git on your PATH.

## Commands (Command Palette, `Cmd+Shift+P`)

| Command | What it does |
|---|---|
| **Rebase Helper: Fetch from origin** | `git fetch origin --prune` |
| **Rebase Helper: Interactive Rebase…** | `git rebase -i` with the todo opened in VS Code |
| **Rebase Helper: Squash Commits…** | Tick commits, type one message, done |
| **Rebase Helper: Continue Rebase** | `git rebase --continue` (same as the "Continue" button) |
| **Rebase Helper: Abort Rebase** | `git rebase --abort` |

If several repositories are open you are asked which one to use.

## Interactive rebase

1. Run **Rebase Helper: Interactive Rebase…**.
2. Pick the **oldest commit** you want in the rebase (it and everything newer is included),
   or choose **Type a base ref…** and enter something like `origin/main` or `HEAD~5`.
3. The `git-rebase-todo` file opens as a tab with syntax highlighting. Edit it exactly like in the
   terminal: change `pick` to `squash`, `fixup`, `reword`, `edit` or `drop`, reorder lines, delete lines.
   An empty file aborts the rebase.
4. Click **Done** in the notification (saves and closes the tab), or save and close the tab yourself.
5. If a `reword` or `squash` needs a message, the message file opens as a tab the same way.

## Conflicts

When git stops on a conflict you get a notification: **Continue / Skip this commit / Abort**.

1. Open the conflicting files from the Source Control view (Merge Changes) and resolve them as usual.
2. Stage the resolved files (`+` in Source Control, or `git add`).
3. Click **Continue**. If you dismissed the notification, run **Rebase Helper: Continue Rebase**.

The same loop handles `edit` stops: make your changes, stage, Continue.

## Squash

1. Run **Rebase Helper: Squash Commits…**.
2. Tick two or more commits (they do not need to be adjacent) and press Enter.
3. Type the message for the resulting commit (prefilled with the oldest ticked commit's subject).

The ticked commits are folded into one commit at the position of the oldest one; other commits keep
their order. Non-adjacent squashes can conflict, in which case the normal conflict flow above applies.

## Notes and limits

- Linear history only. Merge commits inside the chosen range are not supported (same as plain `git rebase -i`).
- Rebasing commits that are already pushed rewrites history; you will need `git push --force-with-lease`.
- The editor bridge runs `editor.js` under VS Code's bundled Node, so it works without the `code` CLI on your PATH.
- Full git output is in the **Rebase Helper** output channel.

## Development

```sh
npm test   # squashes non-adjacent commits in a throwaway repo and checks the result
```
