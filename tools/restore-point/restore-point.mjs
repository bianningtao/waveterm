#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ToolName = "restore-point";
const StoreDirName = "restore-points";
const CheckpointIdPattern = /^\d{8}T\d{6}-[a-f0-9]{8}$/;

function printUsage(exitCode = 0) {
    const usage = `
Usage:
  ${ToolName} status [--json]
  ${ToolName} bootstrap [--message <text>] [--json]
  ${ToolName} prompt --prompt <text> [--json]
  ${ToolName} create [--message <text>] [--prompt <text>] [--json]
  ${ToolName} list [--json]
  ${ToolName} diff <restore-point-id> [--json]
  ${ToolName} restore <restore-point-id> [--yes] [--json]
  ${ToolName} ensure-git [--yes] [--json]

Notes:
  - Restore points are stored under .git/${StoreDirName}.
  - restore is a dry run unless --yes is provided.
  - restore creates a pre-restore restore point before changing files.
`;
    writeText(usage.trim() + "\n");
    process.exit(exitCode);
}

function writeText(text) {
    process.stdout.write(text);
}

function fail(message, exitCode = 1, json = false) {
    if (json) {
        writeText(JSON.stringify({ ok: false, error: message }, null, 2) + "\n");
    } else {
        process.stderr.write(`${ToolName}: ${message}\n`);
    }
    process.exit(exitCode);
}

function parseArgs(argv) {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--json") {
            args.json = true;
        } else if (arg === "--verbose") {
            args.verbose = true;
        } else if (arg === "--yes") {
            args.yes = true;
        } else if (arg === "--message" || arg === "-m") {
            const value = argv[i + 1];
            if (value == null) fail(`${arg} requires a value`);
            args.message = value;
            i += 1;
        } else if (arg === "--prompt") {
            const value = argv[i + 1];
            if (value == null) fail(`${arg} requires a value`);
            args.prompt = value;
            i += 1;
        } else if (arg === "--help" || arg === "-h") {
            args.help = true;
        } else if (arg.startsWith("-")) {
            fail(`unknown option: ${arg}`);
        } else {
            args._.push(arg);
        }
    }
    return args;
}

function git(args, cwd, options = {}) {
    return execFileSync("git", args, {
        cwd,
        encoding: options.encoding ?? "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

function gitMaybe(args, cwd) {
    try {
        return { ok: true, stdout: git(args, cwd).trim() };
    } catch (err) {
        return { ok: false, error: err };
    }
}

function resolveRepo(cwd = process.cwd()) {
    const rootResult = gitMaybe(["rev-parse", "--show-toplevel"], cwd);
    if (!rootResult.ok) return null;
    const root = rootResult.stdout;
    const gitCommonDir = git(["rev-parse", "--git-common-dir"], root).trim();
    const gitDir = path.isAbsolute(gitCommonDir) ? gitCommonDir : path.resolve(root, gitCommonDir);
    return { root, gitDir };
}

function requireRepo(json = false) {
    const repo = resolveRepo();
    if (repo == null) fail("current directory is not inside a Git repository", 2, json);
    return repo;
}

function getBranch(root) {
    const branch = gitMaybe(["branch", "--show-current"], root);
    return branch.ok && branch.stdout ? branch.stdout : "(detached)";
}

function getHead(root) {
    const head = gitMaybe(["rev-parse", "HEAD"], root);
    return head.ok ? head.stdout : null;
}

function splitNullList(text) {
    return text.split("\0").filter(Boolean);
}

function getTrackedFiles(root) {
    return splitNullList(git(["ls-files", "-z"], root));
}

function getUntrackedFiles(root) {
    return splitNullList(git(["ls-files", "--others", "--exclude-standard", "-z"], root));
}

function normalizeRel(relPath) {
    const normalized = relPath.split(path.sep).join("/");
    if (!isSafeRelativePath(normalized)) {
        throw new Error(`unsafe path from git: ${relPath}`);
    }
    return normalized;
}

function isInsidePath(parent, child) {
    const resolvedParent = path.resolve(parent);
    const resolvedChild = path.resolve(child);
    return resolvedChild === resolvedParent || resolvedChild.startsWith(resolvedParent + path.sep);
}

function safeResolveInside(parent, ...parts) {
    const resolved = path.resolve(parent, ...parts);
    if (!isInsidePath(parent, resolved)) {
        throw new Error(`path escapes allowed directory: ${parts.join("/")}`);
    }
    return resolved;
}

function isSafeRelativePath(relPath) {
    if (typeof relPath !== "string" || relPath.length === 0) return false;
    if (relPath.includes("\0") || relPath.includes("\\")) return false;
    if (path.posix.isAbsolute(relPath)) return false;
    const normalized = path.posix.normalize(relPath);
    return normalized === relPath && normalized !== "." && !normalized.startsWith("../") && normalized !== "..";
}

function assertSafeRelativePath(relPath, label = "path") {
    if (!isSafeRelativePath(relPath)) {
        throw new Error(`unsafe checkpoint ${label}: ${relPath}`);
    }
    return relPath;
}

function getCandidateFiles(root) {
    const files = new Set();
    for (const file of [...getTrackedFiles(root), ...getUntrackedFiles(root)]) {
        const relPath = normalizeRel(file);
        if (!shouldSkipSnapshotPath(relPath)) files.add(relPath);
    }
    return [...files].sort((a, b) => a.localeCompare(b));
}

function shouldSkipSnapshotPath(relPath) {
    const base = path.basename(relPath);
    const lower = base.toLowerCase();
    const normalized = relPath.toLowerCase();
    if (base === ".env" || base.startsWith(".env.")) return true;
    if (lower === ".npmrc" || lower === ".netrc" || lower === ".pypirc") return true;
    if (normalized === ".kube/config") return true;
    if (normalized.includes("/.aws/credentials") || normalized.includes("/.config/gcloud/")) return true;
    if (lower === "credentials.json" || lower === "service-account.json") return true;
    if (lower.includes("secret") || lower.includes("token")) return true;
    if (lower === "id_rsa" || lower === "id_dsa" || lower === "id_ecdsa" || lower === "id_ed25519") return true;
    if (lower.endsWith(".pem") || lower.endsWith(".key") || lower.endsWith(".p12") || lower.endsWith(".pfx")) return true;
    return false;
}

function sha256File(filePath) {
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(filePath));
    return hash.digest("hex");
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function getStore(repo) {
    const storeRoot = path.join(repo.gitDir, StoreDirName);
    const metaDir = path.join(storeRoot, "metadata");
    const snapshotDir = path.join(storeRoot, "snapshots");
    ensureDir(metaDir);
    ensureDir(snapshotDir);
    return { storeRoot, metaDir, snapshotDir };
}

function makeCheckpointId() {
    const now = new Date();
    const timestamp = now
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "");
    return `${timestamp}-${crypto.randomBytes(4).toString("hex")}`;
}

function summarizePrompt(prompt) {
    if (!prompt) return "";
    const compact = prompt.replace(/\s+/g, " ").trim();
    if (compact.length <= 80) return compact;
    return compact.slice(0, 77) + "...";
}

function snapshotFile(root, snapshotFilesDir, relPath) {
    const sourcePath = safeResolveInside(root, relPath);
    if (!fs.existsSync(sourcePath)) return null;
    const stat = fs.lstatSync(sourcePath);
    if (stat.isSymbolicLink()) {
        return {
            path: relPath,
            type: "symlink",
            target: fs.readlinkSync(sourcePath),
            mode: stat.mode,
        };
    }
    if (!stat.isFile()) return null;

    const destination = safeResolveInside(snapshotFilesDir, relPath);
    ensureDir(path.dirname(destination));
    fs.copyFileSync(sourcePath, destination);
    return {
        path: relPath,
        type: "file",
        size: stat.size,
        mode: stat.mode,
        sha256: sha256File(sourcePath),
    };
}

function createCheckpoint(repo, message = "", options = {}) {
    const store = getStore(repo);
    let id = makeCheckpointId();
    while (fs.existsSync(path.join(store.metaDir, `${id}.json`))) {
        id = makeCheckpointId();
    }

    const snapshotFilesDir = path.join(store.snapshotDir, id, "files");
    ensureDir(snapshotFilesDir);

    const files = [];
    for (const relPath of getCandidateFiles(repo.root)) {
        const entry = snapshotFile(repo.root, snapshotFilesDir, relPath);
        if (entry != null) files.push(entry);
    }

    const promptSummary = summarizePrompt(options.prompt ?? "");
    const finalMessage = message || (promptSummary ? `before: ${promptSummary}` : "");
    const metadata = {
        version: 1,
        id,
        message: finalMessage,
        prompt: options.prompt ?? "",
        promptSummary,
        createdAt: new Date().toISOString(),
        repoRoot: repo.root,
        branch: getBranch(repo.root),
        head: getHead(repo.root),
        fileCount: files.length,
        files,
    };
    fs.writeFileSync(path.join(store.metaDir, `${id}.json`), JSON.stringify(metadata, null, 2) + "\n");
    return metadata;
}

function loadCheckpoint(repo, id) {
    if (!CheckpointIdPattern.test(id)) {
        throw new Error(`invalid checkpoint id: ${id}`);
    }
    const store = getStore(repo);
    const metaPath = safeResolveInside(store.metaDir, `${id}.json`);
    if (!fs.existsSync(metaPath)) {
        throw new Error(`checkpoint not found: ${id}`);
    }
    return validateCheckpointMetadata(repo, id, JSON.parse(fs.readFileSync(metaPath, "utf8")));
}

function validateCheckpointMetadata(repo, expectedId, checkpoint) {
    if (checkpoint == null || typeof checkpoint !== "object") {
        throw new Error(`invalid checkpoint metadata: ${expectedId}`);
    }
    if (checkpoint.id !== expectedId || !CheckpointIdPattern.test(checkpoint.id)) {
        throw new Error(`checkpoint id mismatch: ${expectedId}`);
    }
    if (!Array.isArray(checkpoint.files)) {
        throw new Error(`checkpoint files must be an array: ${expectedId}`);
    }
    checkpoint.files = checkpoint.files.map((entry) => validateCheckpointEntry(repo, checkpoint.id, entry));
    checkpoint.fileCount = checkpoint.files.length;
    return checkpoint;
}

function validateCheckpointEntry(repo, checkpointId, entry) {
    if (entry == null || typeof entry !== "object") {
        throw new Error(`invalid checkpoint file entry in ${checkpointId}`);
    }
    const relPath = assertSafeRelativePath(entry.path, "file path");
    if (entry.type !== "file" && entry.type !== "symlink") {
        throw new Error(`unsupported checkpoint entry type for ${relPath}: ${entry.type}`);
    }
    const mode = Number.isInteger(entry.mode) ? entry.mode : 0o100644;
    const validated = { ...entry, path: relPath, mode };
    if (validated.type === "symlink") {
        if (typeof validated.target !== "string" || validated.target.includes("\0")) {
            throw new Error(`unsafe symlink target for ${relPath}`);
        }
        return validated;
    }
    const store = getStore(repo);
    const snapshotFilesDir = safeResolveInside(store.snapshotDir, checkpointId, "files");
    const snapshotPath = safeResolveInside(snapshotFilesDir, relPath);
    if (!fs.existsSync(snapshotPath) || !fs.lstatSync(snapshotPath).isFile()) {
        throw new Error(`missing snapshot file for ${relPath}`);
    }
    return validated;
}

function listCheckpoints(repo) {
    const store = getStore(repo);
    return fs
        .readdirSync(store.metaDir)
        .filter((name) => CheckpointIdPattern.test(name.replace(/\.json$/, "")))
        .map((name) => loadCheckpoint(repo, name.replace(/\.json$/, "")))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function currentEntry(root, relPath) {
    assertSafeRelativePath(relPath);
    const filePath = safeResolveInside(root, relPath);
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) {
        return { path: relPath, type: "symlink", target: fs.readlinkSync(filePath), mode: stat.mode };
    }
    if (stat.isFile()) {
        return { path: relPath, type: "file", size: stat.size, mode: stat.mode, sha256: sha256File(filePath) };
    }
    return null;
}

function entriesEqual(a, b) {
    if (a == null || b == null) return a == null && b == null;
    if (a.type !== b.type) return false;
    if (a.type === "symlink") return a.target === b.target;
    return a.sha256 === b.sha256;
}

function diffCheckpoint(repo, checkpoint) {
    const snapshotByPath = new Map(checkpoint.files.map((entry) => [entry.path, entry]));
    const currentPaths = new Set(getCandidateFiles(repo.root));
    const allPaths = new Set([...snapshotByPath.keys(), ...currentPaths]);
    const changes = [];

    for (const relPath of [...allPaths].sort((a, b) => a.localeCompare(b))) {
        const snapshotEntry = snapshotByPath.get(relPath) ?? null;
        const liveEntry = currentEntry(repo.root, relPath);
        if (snapshotEntry == null && liveEntry != null) {
            changes.push({ path: relPath, status: "addedAfterCheckpoint" });
        } else if (snapshotEntry != null && liveEntry == null) {
            changes.push({ path: relPath, status: "deletedAfterCheckpoint" });
        } else if (!entriesEqual(snapshotEntry, liveEntry)) {
            changes.push({ path: relPath, status: "modified" });
        }
    }

    const summary = {
        modified: changes.filter((entry) => entry.status === "modified").length,
        addedAfterCheckpoint: changes.filter((entry) => entry.status === "addedAfterCheckpoint").length,
        deletedAfterCheckpoint: changes.filter((entry) => entry.status === "deletedAfterCheckpoint").length,
    };
    return { id: checkpoint.id, summary, changes };
}

function removeEmptyParents(root, startDir) {
    let dir = startDir;
    while (isInsidePath(root, dir) && dir !== path.resolve(root)) {
        try {
            fs.rmdirSync(dir);
        } catch {
            return;
        }
        dir = path.dirname(dir);
    }
}

function restoreCheckpoint(repo, checkpoint) {
    const store = getStore(repo);
    const snapshotFilesDir = safeResolveInside(store.snapshotDir, checkpoint.id, "files");
    const snapshotByPath = new Map(checkpoint.files.map((entry) => [entry.path, entry]));
    const currentPaths = new Set(getCandidateFiles(repo.root));

    for (const relPath of [...currentPaths].sort((a, b) => b.localeCompare(a))) {
        if (snapshotByPath.has(relPath)) continue;
        const livePath = safeResolveInside(repo.root, relPath);
        if (!fs.existsSync(livePath)) continue;
        fs.rmSync(livePath, { force: true, recursive: true });
        removeEmptyParents(repo.root, path.dirname(livePath));
    }

    for (const entry of checkpoint.files) {
        const livePath = safeResolveInside(repo.root, entry.path);
        fs.rmSync(livePath, { force: true, recursive: true });
        ensureDir(path.dirname(livePath));
        if (entry.type === "symlink") {
            fs.symlinkSync(entry.target, livePath);
        } else {
            fs.copyFileSync(safeResolveInside(snapshotFilesDir, entry.path), livePath);
            fs.chmodSync(livePath, entry.mode);
        }
    }
}

function output(data, json) {
    if (json) {
        writeText(JSON.stringify(data, null, 2) + "\n");
        return;
    }
    if (data.command === "create") {
        writeText(`Created checkpoint ${data.id} (${data.fileCount} files)\n`);
    } else if (data.command === "list") {
        for (const item of data.checkpoints) {
            writeText(`${item.id}  ${item.createdAt}  ${item.branch}  ${item.message || "(no message)"}\n`);
        }
    } else if (data.command === "diff" || data.command === "restore") {
        const { summary } = data;
        writeText(
            `${data.id}: ${summary.modified} modified, ${summary.addedAfterCheckpoint} added after checkpoint, ${summary.deletedAfterCheckpoint} deleted after checkpoint\n`
        );
        for (const change of data.changes ?? []) {
            writeText(`  ${change.status.padEnd(22)} ${change.path}\n`);
        }
        if (data.dryRun) writeText("Dry run only. Re-run restore with --yes to apply.\n");
    } else if (data.command === "status") {
        writeText(`Git repository: ${data.repoRoot}\nBranch: ${data.branch}\nHEAD: ${data.head ?? "(none)"}\n`);
    } else if (data.command === "ensure-git") {
        writeText(data.message + "\n");
    } else if (data.command === "bootstrap") {
        writeText(data.message + "\n");
        if (data.createdCheckpoint != null) {
            writeText(`Created checkpoint ${data.createdCheckpoint.id} (${data.createdCheckpoint.fileCount} files)\n`);
        }
    }
}

function isProtectedInitPath(cwd) {
    const resolved = path.resolve(cwd);
    const home = os.homedir();
    const protectedPaths = new Set([
        "/",
        home,
        path.join(home, "Desktop"),
        path.join(home, "Downloads"),
        path.join(home, "Documents"),
        path.join(home, "Library"),
        "/Users",
        "/tmp",
    ]);
    return protectedPaths.has(resolved);
}

function ensureGit(args) {
    const existing = resolveRepo();
    if (existing != null) {
        return {
            command: "ensure-git",
            ok: true,
            initialized: false,
            repoRoot: existing.root,
            message: `Already inside Git repository: ${existing.root}`,
        };
    }
    if (!args.yes) {
        fail("not a Git repository; re-run ensure-git with --yes after confirming this is the project root", 2, args.json);
    }
    if (isProtectedInitPath(process.cwd())) {
        fail(`refusing to initialize Git in protected path: ${process.cwd()}`, 2, args.json);
    }
    git(["init"], process.cwd());
    const ignorePath = path.join(process.cwd(), ".gitignore");
    const additions = [
        "node_modules/",
        "dist/",
        "build/",
        "out/",
        ".env",
        ".env.*",
        "*.log",
        "process/*",
        "!process/.gitkeep",
        "!process/README.md",
        "tests/*",
    ];
    const existingIgnore = fs.existsSync(ignorePath) ? fs.readFileSync(ignorePath, "utf8") : "";
    const lines = new Set(existingIgnore.split(/\r?\n/));
    const missing = additions.filter((line) => !lines.has(line));
    if (missing.length > 0) {
        const prefix = existingIgnore && !existingIgnore.endsWith("\n") ? "\n" : "";
        fs.appendFileSync(ignorePath, `${prefix}\n# Restore point baseline\n${missing.join("\n")}\n`);
    }
    return {
        command: "ensure-git",
        ok: true,
        initialized: true,
        repoRoot: process.cwd(),
        message: `Initialized Git repository: ${process.cwd()}`,
    };
}

function summarizeCheckpoint(checkpoint) {
    if (checkpoint == null) return null;
    return {
        id: checkpoint.id,
        message: checkpoint.message,
        promptSummary: checkpoint.promptSummary,
        createdAt: checkpoint.createdAt,
        branch: checkpoint.branch,
        head: checkpoint.head,
        fileCount: checkpoint.fileCount,
    };
}

function bootstrap(args) {
    const gitResult = ensureGit({ ...args, yes: true });
    const repo = requireRepo(args.json);
    const checkpoints = listCheckpoints(repo);
    if (checkpoints.length > 0) {
        return {
            command: "bootstrap",
            ok: true,
            initializedGit: gitResult.initialized,
            repoRoot: repo.root,
            checkpointCount: checkpoints.length,
            createdCheckpoint: null,
            latestCheckpoint: summarizeCheckpoint(checkpoints[0]),
            message: gitResult.initialized
                ? `Initialized Git repository and found existing checkpoints in ${repo.root}`
                : `Git repository and checkpoint store are ready in ${repo.root}`,
        };
    }
    const checkpoint = createCheckpoint(repo, args.message ?? "session baseline");
    return {
        command: "bootstrap",
        ok: true,
        initializedGit: gitResult.initialized,
        repoRoot: repo.root,
        checkpointCount: 1,
        createdCheckpoint: summarizeCheckpoint(checkpoint),
        latestCheckpoint: summarizeCheckpoint(checkpoint),
        message: gitResult.initialized
            ? `Initialized Git repository and created first checkpoint in ${repo.root}`
            : `Created first checkpoint in ${repo.root}`,
    };
}

function promptCheckpoint(args) {
    if (!args.prompt) {
        fail("prompt requires --prompt <text>", 1, args.json);
    }
    const gitResult = ensureGit({ ...args, yes: true });
    const repo = requireRepo(args.json);
    const promptSummary = summarizePrompt(args.prompt);
    const checkpoint = createCheckpoint(repo, args.message || `before: ${promptSummary}`, { prompt: args.prompt });
    return {
        command: "prompt",
        ok: true,
        initializedGit: gitResult.initialized,
        repoRoot: repo.root,
        createdCheckpoint: summarizeCheckpoint(checkpoint),
        message: gitResult.initialized
            ? `Initialized Git repository and created prompt checkpoint in ${repo.root}`
            : `Created prompt checkpoint in ${repo.root}`,
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || args._.length === 0) printUsage(args.help ? 0 : 1);
    const command = args._[0];

    try {
        if (command === "ensure-git") {
            output(ensureGit(args), args.json);
            return;
        }
        if (command === "bootstrap") {
            output(bootstrap(args), args.json);
            return;
        }
        if (command === "prompt") {
            output(promptCheckpoint(args), args.json);
            return;
        }

        const repo = requireRepo(args.json);
        if (command === "status") {
            output(
                {
                    command,
                    ok: true,
                    repoRoot: repo.root,
                    branch: getBranch(repo.root),
                    head: getHead(repo.root),
                    checkpointCount: listCheckpoints(repo).length,
                },
                args.json
            );
        } else if (command === "create") {
            const checkpoint = createCheckpoint(repo, args.message ?? "", { prompt: args.prompt ?? "" });
            output(
                {
                    command,
                    ok: true,
                    version: checkpoint.version,
                    id: checkpoint.id,
                    message: checkpoint.message,
                    promptSummary: checkpoint.promptSummary,
                    createdAt: checkpoint.createdAt,
                    repoRoot: checkpoint.repoRoot,
                    branch: checkpoint.branch,
                    head: checkpoint.head,
                    fileCount: checkpoint.fileCount,
                    ...(args.verbose ? { files: checkpoint.files } : {}),
                },
                args.json
            );
        } else if (command === "list") {
            const checkpoints = listCheckpoints(repo).map((entry) => ({
                id: entry.id,
                message: entry.message,
                promptSummary: entry.promptSummary,
                createdAt: entry.createdAt,
                branch: entry.branch,
                head: entry.head,
                fileCount: entry.fileCount,
            }));
            output({ command, ok: true, checkpoints }, args.json);
        } else if (command === "diff") {
            const id = args._[1];
            if (!id) fail("diff requires a checkpoint id", 1, args.json);
            const checkpoint = loadCheckpoint(repo, id);
            output({ command, ok: true, ...diffCheckpoint(repo, checkpoint) }, args.json);
        } else if (command === "restore") {
            const id = args._[1];
            if (!id) fail("restore requires a checkpoint id", 1, args.json);
            const checkpoint = loadCheckpoint(repo, id);
            const diff = diffCheckpoint(repo, checkpoint);
            if (!args.yes) {
                output({ command, ok: true, dryRun: true, ...diff }, args.json);
                return;
            }
            const preRestore = createCheckpoint(repo, `pre-restore ${id}`);
            restoreCheckpoint(repo, checkpoint);
            output(
                {
                    command,
                    ok: true,
                    restored: true,
                    dryRun: false,
                    preRestoreCheckpointId: preRestore.id,
                    ...diff,
                },
                args.json
            );
        } else {
            fail(`unknown command: ${command}`, 1, args.json);
        }
    } catch (err) {
        fail(err.message, 1, args.json);
    }
}

main();
