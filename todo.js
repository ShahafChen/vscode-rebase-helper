// Builds a git-rebase-todo that folds `selected` commits into one commit with the message in msgFile.
// lines: "<sha> <subject>" oldest first; selected: Set of shas.
function buildSquashTodo(lines, selected, msgFile) {
  const before = [], group = [], after = [];
  for (const l of lines) {
    if (selected.has(l.split(' ')[0])) group.push(`${group.length ? 'fixup' : 'pick'} ${l}`);
    else (group.length ? after : before).push(`pick ${l}`);
  }
  return [...before, ...group, `exec git commit --amend -F "${msgFile}"`, ...after, ''].join('\n');
}
module.exports = { buildSquashTodo };
