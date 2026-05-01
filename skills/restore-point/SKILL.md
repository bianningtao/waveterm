# Restore Point

Use this skill at the start of a coding session, before making file changes, or when the user asks to create, list, inspect, or restore a project restore point.

## Goal

Create local, Git-backed restore points so a user can return project files to an earlier moment in the conversation. Restore points are stored inside the local Git directory and are not intended to be committed or uploaded.

## Privacy Rules

- Do not include private prompts, secrets, API keys, personal paths, or customer data in public README, release notes, commits, or PR descriptions.
- Do not snapshot obvious secret files. The tool skips common `.env`, token, credential, key, and certificate filenames.
- Do not upload restore point snapshots. They live under `.git/restore-points` and should remain local.
- When writing restore point messages, use a short task summary instead of raw private conversation text if the content is sensitive.

## Commands

Run from the project root.

```bash
node tools/restore-point/restore-point.mjs bootstrap --json
```

Initializes Git when needed and creates the first baseline restore point if no restore point exists.

```bash
node tools/restore-point/restore-point.mjs prompt --prompt "short task summary" --json
```

Creates a restore point before handling a new request. Use a concise summary; do not paste secrets or private customer content.

```bash
node tools/restore-point/restore-point.mjs list
```

Lists restore points with their readable message.

```bash
node tools/restore-point/restore-point.mjs diff <restore-point-id>
```

Shows what changed after a restore point.

```bash
node tools/restore-point/restore-point.mjs restore <restore-point-id>
node tools/restore-point/restore-point.mjs restore <restore-point-id> --yes
```

The first command is a dry run. Add `--yes` only after the user confirms the restore.

## Agent Workflow

1. At session start, run `bootstrap --json`.
2. If restore points already exist, do not create a duplicate baseline.
3. Before file-changing work, create a prompt restore point with a short safe summary.
4. Before restoring, run `diff` and explain the affected files.
5. Only run `restore --yes` after explicit user confirmation.
