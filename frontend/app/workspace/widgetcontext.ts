// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const FileLikeExtensions = new Set([
    "md",
    "markdown",
    "mdx",
    "txt",
    "log",
    "json",
    "jsonl",
    "yaml",
    "yml",
    "toml",
    "xml",
    "html",
    "htm",
    "css",
    "scss",
    "js",
    "jsx",
    "ts",
    "tsx",
    "go",
    "py",
    "sh",
    "zsh",
    "bash",
    "sql",
    "csv",
    "docx",
    "xlsx",
    "pdf",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
]);

function cloneBlockDef(blockDef: BlockDef): BlockDef {
    return {
        ...blockDef,
        meta: {
            ...(blockDef?.meta ?? {}),
        },
    };
}

function dirname(path: string): string {
    const normalized = path.replace(/\/+$/u, "");
    if (normalized === "" || normalized === "/" || normalized === "~") {
        return normalized || "/";
    }
    const slashIdx = normalized.lastIndexOf("/");
    if (slashIdx <= 0) {
        return slashIdx === 0 ? "/" : ".";
    }
    return normalized.slice(0, slashIdx);
}

function previewFileToCwd(filePath: string): string {
    const normalized = filePath.trim();
    const lastSegment = normalized.split("/").pop() ?? "";
    const extMatch = /\.([a-z0-9]+)$/iu.exec(lastSegment);
    if (extMatch && FileLikeExtensions.has(extMatch[1].toLowerCase())) {
        return dirname(normalized);
    }
    return normalized.replace(/\/+$/u, "") || "/";
}

function getCwdFromFocusedMeta(focusedMeta?: MetaType | null): string | null {
    if (focusedMeta == null) {
        return null;
    }
    if (focusedMeta.view === "term" && typeof focusedMeta["cmd:cwd"] === "string" && focusedMeta["cmd:cwd"] !== "") {
        return focusedMeta["cmd:cwd"];
    }
    if (focusedMeta.view === "preview" && typeof focusedMeta.file === "string" && focusedMeta.file !== "") {
        return previewFileToCwd(focusedMeta.file);
    }
    return null;
}

export function makeContextAwareWidgetBlockDef(blockDef: BlockDef, focusedMeta?: MetaType | null): BlockDef {
    const widgetView = blockDef?.meta?.view;
    if (widgetView !== "term" && widgetView !== "gitchanges") {
        return blockDef;
    }
    const cwd = getCwdFromFocusedMeta(focusedMeta);
    if (cwd == null) {
        return blockDef;
    }
    const nextBlockDef = cloneBlockDef(blockDef);
    nextBlockDef.meta["cmd:cwd"] = cwd;
    if (nextBlockDef.meta.connection == null && focusedMeta?.connection != null) {
        nextBlockDef.meta.connection = focusedMeta.connection;
    }
    return nextBlockDef;
}
