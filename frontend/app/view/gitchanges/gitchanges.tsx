// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { t } from "@/app/i18n";
import { globalStore } from "@/app/store/jotaiStore";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { MetaKeyAtomFnType, WaveEnv, WaveEnvSubset } from "@/app/waveenv/waveenv";
import { createBlockSplitVertically } from "@/store/global";
import * as jotai from "jotai";
import { useAtom, useAtomValue } from "jotai";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

type GitChangesEnv = WaveEnvSubset<{
    rpc: {
        GitStatusCommand: WaveEnv["rpc"]["GitStatusCommand"];
        GitDiffCommand: WaveEnv["rpc"]["GitDiffCommand"];
        GitCommitCommand: WaveEnv["rpc"]["GitCommitCommand"];
    };
    getBlockMetaKeyAtom: MetaKeyAtomFnType<"cmd:cwd" | "connection">;
}>;

type GitActionStatus = {
    kind: "info" | "error" | "success";
    message: string;
};

type DiffLineKind = "header" | "hunk" | "added" | "removed" | "context";

const StatusLabels: Record<string, string> = {
    modified: "Modified",
    added: "Added",
    deleted: "Deleted",
    renamed: "Renamed",
    untracked: "Untracked",
};

function statusLabel(kind: string): string {
    return t(StatusLabels[kind] ?? kind);
}

function statusTone(kind: string): string {
    if (kind === "added" || kind === "untracked") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    if (kind === "deleted") return "border-red-500/40 bg-red-500/10 text-red-300";
    if (kind === "renamed") return "border-sky-500/40 bg-sky-500/10 text-sky-300";
    return "border-amber-500/40 bg-amber-500/10 text-amber-200";
}

export function classifyDiffLine(line: string): DiffLineKind {
    if (
        line.startsWith("diff --git") ||
        line.startsWith("index ") ||
        line.startsWith("new file mode") ||
        line.startsWith("deleted file mode") ||
        line.startsWith("--- ") ||
        line.startsWith("+++ ")
    ) {
        return "header";
    }
    if (line.startsWith("@@")) return "hunk";
    if (line.startsWith("+")) return "added";
    if (line.startsWith("-")) return "removed";
    return "context";
}

export function makePreviewFilePath(root: string, filePath: string): string {
    const cleanRoot = (root ?? "").trim();
    const cleanFilePath = (filePath ?? "").trim();
    if (cleanRoot === "" || cleanFilePath === "") {
        return "";
    }
    if (cleanFilePath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(cleanFilePath)) {
        return cleanFilePath;
    }
    if (cleanRoot.endsWith("/") || cleanRoot.endsWith("\\")) {
        return `${cleanRoot}${cleanFilePath}`;
    }
    return `${cleanRoot}/${cleanFilePath}`;
}

function diffLineClass(kind: DiffLineKind): string {
    switch (kind) {
        case "added":
            return "diff-line-added bg-emerald-500/10 text-emerald-100";
        case "removed":
            return "diff-line-removed bg-red-500/10 text-red-100";
        case "hunk":
            return "diff-line-hunk bg-sky-500/10 text-sky-200";
        case "header":
            return "diff-line-header text-muted";
        default:
            return "diff-line-context text-secondary";
    }
}

export class GitChangesViewModel implements ViewModel {
    viewType = "gitchanges";
    blockId: string;
    env: GitChangesEnv;
    viewIcon = jotai.atom<string>("code-branch");
    viewName = jotai.atom<string>(t("Git Changes"));
    noPadding = jotai.atom<boolean>(true);

    cwdAtom: jotai.Atom<string>;
    statusAtom = jotai.atom<CommandGitStatusRtnData>(null) as jotai.PrimitiveAtom<CommandGitStatusRtnData>;
    selectedPathAtom = jotai.atom<string>(null) as jotai.PrimitiveAtom<string>;
    diffAtom = jotai.atom<CommandGitDiffRtnData>(null) as jotai.PrimitiveAtom<CommandGitDiffRtnData>;
    loadingAtom = jotai.atom<boolean>(false);
    diffLoadingAtom = jotai.atom<boolean>(false);
    commitMessageAtom = jotai.atom<string>("");
    actionStatusAtom = jotai.atom<GitActionStatus>(null) as jotai.PrimitiveAtom<GitActionStatus>;

    constructor({ blockId, waveEnv }: ViewModelInitType) {
        this.blockId = blockId;
        this.env = waveEnv;
        this.cwdAtom = jotai.atom((get) => get(this.env.getBlockMetaKeyAtom(blockId, "cmd:cwd")) || "~");
    }

    get viewComponent(): ViewComponent {
        return GitChangesView;
    }

    async refresh() {
        const cwd = globalStore.get(this.cwdAtom);
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.actionStatusAtom, null);
        try {
            const status = await this.env.rpc.GitStatusCommand(TabRpcClient, { cwd });
            globalStore.set(this.statusAtom, status);
            const currentSelected = globalStore.get(this.selectedPathAtom);
            const nextSelected = status.files?.find((file) => file.path === currentSelected)?.path ?? status.files?.[0]?.path ?? null;
            globalStore.set(this.selectedPathAtom, nextSelected);
            if (nextSelected) {
                await this.loadDiff(nextSelected, status);
            } else {
                globalStore.set(this.diffAtom, null);
            }
        } catch (e) {
            globalStore.set(this.actionStatusAtom, { kind: "error", message: String(e) });
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    async loadDiff(path: string, statusOverride?: CommandGitStatusRtnData) {
        const status = statusOverride ?? globalStore.get(this.statusAtom);
        if (!status?.root || !path) return;
        const file = status.files?.find((entry) => entry.path === path);
        globalStore.set(this.selectedPathAtom, path);
        globalStore.set(this.diffLoadingAtom, true);
        try {
            const diff = await this.env.rpc.GitDiffCommand(TabRpcClient, {
                root: status.root,
                path,
                untracked: file?.kind === "untracked",
            });
            globalStore.set(this.diffAtom, diff);
        } catch (e) {
            globalStore.set(this.diffAtom, { path, diff: String(e) });
        } finally {
            globalStore.set(this.diffLoadingAtom, false);
        }
    }

    async commitAll() {
        const status = globalStore.get(this.statusAtom);
        const message = globalStore.get(this.commitMessageAtom).trim();
        if (!status?.root || status.notagit) return;
        if (!message) {
            globalStore.set(this.actionStatusAtom, { kind: "error", message: t("Enter a commit message.") });
            return;
        }
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.actionStatusAtom, null);
        try {
            const result = await this.env.rpc.GitCommitCommand(TabRpcClient, { root: status.root, message });
            globalStore.set(this.commitMessageAtom, "");
            await this.refresh();
            globalStore.set(this.actionStatusAtom, { kind: "success", message: result.output || t("Commit created.") });
        } catch (e) {
            globalStore.set(this.actionStatusAtom, { kind: "error", message: String(e) });
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    async openPreview(path: string) {
        const status = globalStore.get(this.statusAtom);
        if (!status?.root || !path) return;
        const file = status.files?.find((entry) => entry.path === path);
        if (file?.kind === "deleted") {
            globalStore.set(this.actionStatusAtom, { kind: "error", message: t("Deleted files cannot be previewed.") });
            return;
        }
        const previewPath = makePreviewFilePath(status.root, path);
        if (!previewPath) return;
        const connection = globalStore.get(this.env.getBlockMetaKeyAtom(this.blockId, "connection"));
        const blockDef: BlockDef = {
            meta: {
                view: "preview",
                file: previewPath,
            },
        };
        if (connection) {
            blockDef.meta.connection = connection;
        }
        await createBlockSplitVertically(blockDef, this.blockId, "after");
    }
}

const GitChangesView = memo(({ model }: ViewComponentProps<GitChangesViewModel>) => {
    const cwd = useAtomValue(model.cwdAtom);
    const status = useAtomValue(model.statusAtom);
    const selectedPath = useAtomValue(model.selectedPathAtom);
    const diff = useAtomValue(model.diffAtom);
    const loading = useAtomValue(model.loadingAtom);
    const diffLoading = useAtomValue(model.diffLoadingAtom);
    const actionStatus = useAtomValue(model.actionStatusAtom);
    const [commitMessage, setCommitMessage] = useAtom(model.commitMessageAtom);
    const [hasLoaded, setHasLoaded] = useState(false);

    const selectedFile = useMemo(() => status?.files?.find((file) => file.path === selectedPath), [status?.files, selectedPath]);
    const diffLines = useMemo(() => (diff?.diff ?? "").split("\n"), [diff?.diff]);
    const canCommit = Boolean(status?.root && !status.notagit && status.files?.length > 0 && commitMessage.trim() && !loading);

    const refresh = useCallback(() => {
        setHasLoaded(true);
        void model.refresh();
    }, [model]);

    useEffect(() => {
        if (!hasLoaded) {
            refresh();
        }
    }, [hasLoaded, refresh]);

    return (
        <div className="@container flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background text-primary">
            <div className="w-full shrink-0 border-b border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <i className="fa-sharp fa-solid fa-code-branch text-accent" />
                            {t("Git Changes")}
                        </div>
                        <div className="mt-1 truncate font-mono text-xs text-muted">{status?.root || cwd}</div>
                        {status?.branch && <div className="mt-1 text-xs text-muted">{t("Branch")}: {status.branch}</div>}
                    </div>
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={loading}
                        className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-hover hover:text-primary disabled:opacity-60"
                    >
                        <i className={`fa fa-rotate-right mr-1 ${loading ? "fa-spin" : ""}`} />
                        {t("Refresh")}
                    </button>
                </div>
                {status?.root && !status.notagit && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        <input
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            placeholder={t("Commit message")}
                            className="min-w-[220px] flex-1 rounded-md border border-border bg-panel px-3 py-2 text-sm text-primary outline-none transition-colors placeholder:text-muted focus:border-accent focus:bg-background"
                        />
                        <button
                            type="button"
                            onClick={() => void model.commitAll()}
                            disabled={!canCommit}
                            className="rounded-md border border-accent/50 bg-accent/15 px-3 py-2 text-sm text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:border-border disabled:bg-panel disabled:text-muted"
                        >
                            {t("Commit All Changes")}
                        </button>
                    </div>
                )}
                {actionStatus && (
                    <div
                        className={`mt-2 whitespace-pre-wrap rounded border px-3 py-2 text-xs ${
                            actionStatus.kind === "error"
                                ? "border-error/50 bg-error/10 text-error"
                                : actionStatus.kind === "success"
                                  ? "border-accent/40 bg-accent/10 text-accent"
                                  : "border-border bg-panel text-muted"
                        }`}
                    >
                        {actionStatus.message}
                    </div>
                )}
            </div>

            {status?.notagit ? (
                <div className="p-5 text-sm text-muted">{t("Current directory is not inside a Git repository.")}</div>
            ) : !status ? (
                <div className="p-5 text-sm text-muted">{t("Loading Git changes...")}</div>
            ) : status.files.length === 0 ? (
                <div className="p-5 text-sm text-muted">{t("No Git changes.")}</div>
            ) : (
                <div className="grid min-h-0 w-full min-w-0 flex-1 grid-cols-[320px_minmax(0,1fr)] @max-w800:grid-cols-1">
                    <div className="min-h-0 overflow-auto border-r border-border @max-w800:max-h-64 @max-w800:border-b @max-w800:border-r-0">
                        {status.files.map((file) => (
                            <button
                                key={`${file.kind}:${file.path}`}
                                type="button"
                                onClick={() => void model.loadDiff(file.path)}
                                className={`flex w-full flex-col gap-1 border-b border-border px-3 py-2 text-left transition-colors hover:bg-hover ${
                                    selectedPath === file.path ? "bg-hoverbg shadow-[inset_3px_0_0_var(--accent-color)]" : ""
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${statusTone(file.kind)}`}>
                                        {statusLabel(file.kind)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate font-mono text-sm">{file.path}</span>
                                </div>
                                {file.originalpath && <div className="truncate font-mono text-xs text-muted">{file.originalpath}</div>}
                            </button>
                        ))}
                    </div>
                    <div className="min-h-0 overflow-auto">
                        <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-2">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="truncate font-mono text-sm">{selectedFile?.path ?? t("Select a file")}</div>
                                    {selectedFile && (
                                        <div className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-[11px] font-semibold ${statusTone(selectedFile.kind)}`}>
                                            {statusLabel(selectedFile.kind)}
                                        </div>
                                    )}
                                </div>
                                {selectedFile && (
                                    <button
                                        type="button"
                                        onClick={() => void model.openPreview(selectedFile.path)}
                                        disabled={selectedFile.kind === "deleted"}
                                        title={selectedFile.kind === "deleted" ? t("Deleted files cannot be previewed.") : t("Preview Source")}
                                        className="shrink-0 rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs text-secondary transition-colors hover:bg-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <i className="fa fa-eye mr-1" />
                                        {t("Preview")}
                                    </button>
                                )}
                            </div>
                        </div>
                        {diffLoading || !diff?.diff ? (
                            <div className="p-3 text-sm text-muted">{diffLoading ? t("Loading diff...") : t("No diff available.")}</div>
                        ) : (
                            <div className="min-h-full overflow-auto py-2 font-mono text-xs leading-relaxed">
                                {diffLines.map((line, index) => {
                                    const kind = classifyDiffLine(line);
                                    return (
                                        <div
                                            key={`${index}:${line}`}
                                            className={`whitespace-pre-wrap break-words px-3 ${diffLineClass(kind)}`}
                                        >
                                            {line === "" ? " " : line}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

GitChangesView.displayName = "GitChangesView";
