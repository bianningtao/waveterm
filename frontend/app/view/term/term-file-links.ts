// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const PreviewableFileExtensions = [
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
] as const;

const PreviewableExtensionPattern = PreviewableFileExtensions.join("|");
const TerminalFileRefRegex = new RegExp(
    `(^|[\\s\\[({:："'\`])((?:~|/|\\.{1,2}/)?(?:[^\\s<>"'\`|]+/)*[^\\s<>"'\`|]+\\.(${PreviewableExtensionPattern}))(?=$|[\\s\\])}，。,:;!?])`,
    "giu"
);

const TrailPunctuationRe = /[，。,:;!?]+$/u;

export type TerminalFileLinkMatch = {
    text: string;
    path: string;
    startIndex: number;
    endIndex: number;
};

function stripAnsiControlChars(text: string): string {
    return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function trimFileRef(text: string): string {
    return text.trim().replace(TrailPunctuationRe, "");
}

function normalizeMatchedFileRef(text: string): { fileRef: string; offset: number } {
    const cleanRef = trimFileRef(text);
    const lastOpenParenIdx = cleanRef.lastIndexOf("(");
    if (lastOpenParenIdx >= 0 && !cleanRef.slice(0, lastOpenParenIdx).includes("/")) {
        const parenSuffix = cleanRef.slice(lastOpenParenIdx + 1);
        if (parenSuffix.includes(".")) {
            return { fileRef: parenSuffix, offset: lastOpenParenIdx + 1 };
        }
    }
    return { fileRef: cleanRef, offset: 0 };
}

function normalizePosixPath(path: string): string {
    if (path === "" || path === "~") {
        return path;
    }
    const homePrefixed = path.startsWith("~/");
    const absolute = path.startsWith("/");
    const trailingSlash = path.endsWith("/");
    const rawParts = path.split("/");
    const parts: string[] = [];
    for (let idx = 0; idx < rawParts.length; idx++) {
        const part = rawParts[idx];
        if (part === "" || part === ".") {
            continue;
        }
        if (part === "..") {
            if (parts.length > 0 && parts[parts.length - 1] !== "..") {
                parts.pop();
            } else if (!absolute && !homePrefixed) {
                parts.push(part);
            }
            continue;
        }
        parts.push(part);
    }
    let prefix = "";
    if (absolute) {
        prefix = "/";
    } else if (homePrefixed) {
        prefix = "~/";
        if (parts[0] === "~") {
            parts.shift();
        }
    }
    const normalized = prefix + parts.join("/");
    if (trailingSlash && normalized !== "/" && normalized !== "~/") {
        return normalized + "/";
    }
    return normalized || (absolute ? "/" : homePrefixed ? "~" : ".");
}

export function resolveTerminalFilePath(fileRef: string, cwd?: string | null): string | null {
    const cleanRef = trimFileRef(stripAnsiControlChars(fileRef));
    if (cleanRef === "" || cleanRef.includes("\u0000")) {
        return null;
    }
    if (cleanRef.startsWith("/") || cleanRef.startsWith("~/")) {
        return normalizePosixPath(cleanRef);
    }
    if (cwd == null || cwd.trim() === "") {
        return null;
    }
    return normalizePosixPath(`${cwd.replace(/\/+$/u, "")}/${cleanRef}`);
}

export function findTerminalFileLinks(lineText: string, cwd?: string | null): TerminalFileLinkMatch[] {
    const links: TerminalFileLinkMatch[] = [];
    const seen = new Set<string>();
    const cleanLine = stripAnsiControlChars(lineText);
    TerminalFileRefRegex.lastIndex = 0;
    for (let match = TerminalFileRefRegex.exec(cleanLine); match != null; match = TerminalFileRefRegex.exec(cleanLine)) {
        const { fileRef: rawRef, offset } = normalizeMatchedFileRef(match[2]);
        const path = resolveTerminalFilePath(rawRef, cwd);
        if (path == null) {
            continue;
        }
        const startIndex = match.index + match[1].length + offset;
        const endIndex = startIndex + rawRef.length;
        const dedupeKey = `${startIndex}:${endIndex}:${path}`;
        if (seen.has(dedupeKey)) {
            continue;
        }
        seen.add(dedupeKey);
        links.push({
            text: rawRef,
            path,
            startIndex,
            endIndex,
        });
    }
    return links;
}
