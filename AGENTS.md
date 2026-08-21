# Project Instructions

## Git workflow

This repository has two working copies on the same MacBook:

- Catalina is normally used for React/Vite/PWA development.
- Sequoia is normally used for Capacitor/native iOS and Xcode development.
- Both working copies use the same GitHub repository and `master` branch.
- GitHub is the synchronization mechanism. Never assume changes made in one working copy are already present in the other.

### Before coding

Before editing any files:

1. Run `git status`.
2. Confirm the checked-out branch.
3. If the working tree is clean, run `git pull origin master`.
4. If the working tree is not clean, do not pull, stash, discard, reset, overwrite, or otherwise modify the existing changes. Report the status and ask the user how to proceed.
5. If a pull changes `package.json` or `package-lock.json`, determine whether `npm install` is required.
6. Confirm that the local working copy is current before beginning coding work.

### Committing completed work

When the user asks to commit:

1. Run `git status` and inspect the actual changes.
2. Review the diff before staging.
3. Exclude generated and transient files that are intentionally ignored.
4. Run appropriate tests and build checks.
5. Stage only the intended files.
6. Create a concise commit message describing the actual change.
7. Push the commit to `origin master`.
8. Verify that the push succeeded and the local branch is up to date with `origin/master`.

### Switching environments

Before leaving either Catalina or Sequoia, commit and push completed work. Upon entering the other environment, follow the status, branch, and pull procedure before making changes.

Never automatically resolve merge conflicts, discard local work, force-push, reset, stash, or overwrite files without explicit user approval.
