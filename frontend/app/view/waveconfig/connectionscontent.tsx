// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { t } from "@/app/i18n";
import { WaveConfigFieldClass } from "@/app/view/waveconfig/formstyles";
import type { WaveConfigViewModel } from "@/app/view/waveconfig/waveconfig-model";
import { useAtom } from "jotai";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";

type ConnectionConfig = Record<string, any> & {
    "ssh:hostname"?: string;
    "ssh:user"?: string;
    "ssh:port"?: string;
    "ssh:identityfile"?: string[];
    "ssh:proxyjump"?: string[];
    "ssh:passwordsecretname"?: string;
    "conn:wshenabled"?: boolean;
    "conn:ignoresshconfig"?: boolean;
    "display:hidden"?: boolean;
};
type ConnectionsConfig = Record<string, ConnectionConfig>;

const ConnectionKeyPattern = /^[a-zA-Z0-9_@.-]+$/;

function parseConfig(content: string): ConnectionsConfig {
    if (content.trim() === "") {
        return {};
    }
    const parsed = JSON.parse(content);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(t("Connections configuration must be a JSON object."));
    }
    return parsed as ConnectionsConfig;
}

function formatConfig(config: ConnectionsConfig): string {
    return JSON.stringify(config, null, 2);
}

function splitList(value?: string[]): string {
    return value?.join(", ") ?? "";
}

function parseList(value: string): string[] | undefined {
    const items = value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    return items.length > 0 ? items : undefined;
}

function cleanConnection(conn: ConnectionConfig): ConnectionConfig {
    const next = { ...conn };
    for (const key of Object.keys(next)) {
        const value = next[key];
        if (value === "" || value == null || (Array.isArray(value) && value.length === 0)) {
            delete next[key];
        }
    }
    return next;
}

function makeConnectionKey(config: ConnectionsConfig, baseKey: string): string {
    let key = baseKey;
    let i = 2;
    while (Object.prototype.hasOwnProperty.call(config, key)) {
        key = `${baseKey}-${i}`;
        i += 1;
    }
    return key;
}

const FormRow = memo(({ label, children, help }: { label: string; children: ReactNode; help?: string }) => (
    <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{label}</span>
        {children}
        {help && <span className="text-xs text-muted">{help}</span>}
    </label>
));
FormRow.displayName = "FormRow";

function TextInput({
    value,
    onChange,
    placeholder,
    mono,
    onBlur,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    mono?: boolean;
    onBlur?: () => void;
}) {
    return (
        <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={placeholder}
            className={`${WaveConfigFieldClass} ${mono ? "font-mono" : ""}`}
        />
    );
}

export const ConnectionsContent = memo(({ model }: { model: WaveConfigViewModel }) => {
    const [fileContent, setFileContent] = useAtom(model.fileContentAtom);
    const [selectedKey, setSelectedKey] = useState("");
    const [keyDraft, setKeyDraft] = useState("");

    const parseResult = useMemo(() => {
        try {
            return { config: parseConfig(fileContent), error: null as string | null };
        } catch (e) {
            return { config: {} as ConnectionsConfig, error: e instanceof Error ? e.message : String(e) };
        }
    }, [fileContent]);

    const entries = useMemo(() => Object.entries(parseResult.config).sort(([a], [b]) => a.localeCompare(b)), [
        parseResult.config,
    ]);

    useEffect(() => {
        if (!selectedKey && entries.length > 0) {
            setSelectedKey(entries[0][0]);
        } else if (selectedKey && !Object.prototype.hasOwnProperty.call(parseResult.config, selectedKey)) {
            setSelectedKey(entries[0]?.[0] ?? "");
        }
    }, [entries, parseResult.config, selectedKey]);

    useEffect(() => {
        setKeyDraft(selectedKey);
    }, [selectedKey]);

    const updateConfig = (nextConfig: ConnectionsConfig) => {
        setFileContent(formatConfig(nextConfig));
        model.markAsEdited();
    };

    const selectedConn = selectedKey ? parseResult.config[selectedKey] : undefined;

    const patchConnection = (patch: Partial<ConnectionConfig>) => {
        if (!selectedKey) return;
        updateConfig({
            ...parseResult.config,
            [selectedKey]: cleanConnection({ ...(selectedConn ?? {}), ...patch }),
        });
    };

    const addConnection = () => {
        const key = makeConnectionKey(parseResult.config, "ssh@new-host");
        updateConfig({
            ...parseResult.config,
            [key]: {
                "ssh:hostname": "",
                "ssh:user": "",
                "ssh:port": "22",
            },
        });
        setSelectedKey(key);
    };

    const deleteConnection = () => {
        if (!selectedKey || !window.confirm(t("Delete this connection from connections.json?"))) return;
        const nextConfig = { ...parseResult.config };
        delete nextConfig[selectedKey];
        updateConfig(nextConfig);
        setSelectedKey("");
    };

    const commitRename = () => {
        const nextKey = keyDraft.trim();
        if (!selectedKey || nextKey === selectedKey) return;
        if (!ConnectionKeyPattern.test(nextKey)) {
            return;
        }
        if (Object.prototype.hasOwnProperty.call(parseResult.config, nextKey)) {
            return;
        }
        const nextConfig: ConnectionsConfig = {};
        for (const [key, value] of Object.entries(parseResult.config)) {
            if (key === selectedKey) {
                nextConfig[nextKey] = value;
            } else {
                nextConfig[key] = value;
            }
        }
        updateConfig(nextConfig);
        setSelectedKey(nextKey);
    };

    if (parseResult.error) {
        return (
            <div className="h-full overflow-auto p-4">
                <div className="rounded border border-error/40 bg-error/10 p-3 text-error">{parseResult.error}</div>
                <div className="mt-2 text-sm text-muted">{t("Fix the JSON in Raw JSON before using the visual editor.")}</div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0">
            <div className="w-64 shrink-0 overflow-auto border-r border-border">
                <div className="flex items-center justify-between gap-2 border-b border-border p-3">
                    <div className="font-semibold">{t("SSH Connections")}</div>
                    <button
                        onClick={addConnection}
                        className="rounded bg-accent/80 px-2 py-1 text-sm text-primary hover:bg-accent cursor-pointer"
                    >
                        {t("Add")}
                    </button>
                </div>
                {entries.length === 0 && <div className="p-4 text-sm text-muted">{t("No connections configured.")}</div>}
                {entries.map(([key, conn]) => (
                    <button
                        key={key}
                        onClick={() => setSelectedKey(key)}
                        className={`block w-full border-b border-border px-3 py-2 text-left transition-colors cursor-pointer ${
                            selectedKey === key ? "bg-highlightbg text-primary" : "hover:bg-hover"
                        }`}
                    >
                        <div className="truncate font-mono text-sm">{key}</div>
                        <div className="truncate text-xs text-muted">
                            {conn["ssh:user"] ? `${conn["ssh:user"]}@` : ""}
                            {conn["ssh:hostname"] || t("No host set")}
                            {conn["ssh:port"] ? `:${conn["ssh:port"]}` : ""}
                        </div>
                    </button>
                ))}
            </div>
            <div className="min-w-0 flex-1 overflow-auto p-4">
                {!selectedKey || !selectedConn ? (
                    <div className="text-sm text-muted">{t("Select or add a connection.")}</div>
                ) : (
                    <div className="max-w-3xl space-y-5">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-lg font-semibold">{t("Connection Details")}</div>
                                <div className="text-sm text-muted">
                                    {t("Common SSH settings. Advanced keys stay in Raw JSON.")}
                                </div>
                            </div>
                            <button
                                onClick={deleteConnection}
                                className="rounded border border-error/60 px-3 py-1 text-sm text-error hover:bg-error/10 cursor-pointer"
                            >
                                {t("Delete")}
                            </button>
                        </div>
                        <div className="grid gap-4 @2xl:grid-cols-2">
                            <FormRow label={t("Connection Key")} help={t("Use letters, numbers, dots, hyphens, underscores, and @.")}>
                                <TextInput value={keyDraft} onChange={setKeyDraft} onBlur={commitRename} mono />
                            </FormRow>
                            <FormRow label={t("Host Name")} help={t("Maps to ssh:hostname.")}>
                                <TextInput
                                    value={selectedConn["ssh:hostname"] ?? ""}
                                    onChange={(value) => patchConnection({ "ssh:hostname": value })}
                                    placeholder="example.com"
                                />
                            </FormRow>
                            <FormRow label={t("User Name")} help={t("Maps to ssh:user.")}>
                                <TextInput
                                    value={selectedConn["ssh:user"] ?? ""}
                                    onChange={(value) => patchConnection({ "ssh:user": value })}
                                    placeholder="root"
                                />
                            </FormRow>
                            <FormRow label={t("Port")} help={t("Maps to ssh:port.")}>
                                <TextInput
                                    value={selectedConn["ssh:port"] ?? ""}
                                    onChange={(value) => patchConnection({ "ssh:port": value })}
                                    placeholder="22"
                                    mono
                                />
                            </FormRow>
                            <FormRow label={t("Identity Files")} help={t("Comma or newline separated paths.")}>
                                <TextInput
                                    value={splitList(selectedConn["ssh:identityfile"])}
                                    onChange={(value) => patchConnection({ "ssh:identityfile": parseList(value) })}
                                    placeholder="~/.ssh/id_ed25519"
                                    mono
                                />
                            </FormRow>
                            <FormRow label={t("Proxy Jump")} help={t("Comma or newline separated hosts.")}>
                                <TextInput
                                    value={splitList(selectedConn["ssh:proxyjump"])}
                                    onChange={(value) => patchConnection({ "ssh:proxyjump": parseList(value) })}
                                    placeholder="bastion"
                                    mono
                                />
                            </FormRow>
                            <FormRow label={t("Password Secret Name")} help={t("Secret name for password authentication.")}>
                                <TextInput
                                    value={selectedConn["ssh:passwordsecretname"] ?? ""}
                                    onChange={(value) => patchConnection({ "ssh:passwordsecretname": value })}
                                    placeholder="MY_SSH_PASSWORD"
                                    mono
                                />
                            </FormRow>
                        </div>
                        <div className="grid gap-3 @2xl:grid-cols-3">
                            <label className="flex items-center gap-2 rounded border border-border p-3 text-sm">
                                <input
                                    type="checkbox"
                                    checked={selectedConn["conn:wshenabled"] !== false}
                                    onChange={(e) => patchConnection({ "conn:wshenabled": e.target.checked ? undefined : false })}
                                />
                                {t("Enable wsh")}
                            </label>
                            <label className="flex items-center gap-2 rounded border border-border p-3 text-sm">
                                <input
                                    type="checkbox"
                                    checked={selectedConn["conn:ignoresshconfig"] === true}
                                    onChange={(e) => patchConnection({ "conn:ignoresshconfig": e.target.checked ? true : undefined })}
                                />
                                {t("Ignore SSH config")}
                            </label>
                            <label className="flex items-center gap-2 rounded border border-border p-3 text-sm">
                                <input
                                    type="checkbox"
                                    checked={selectedConn["display:hidden"] === true}
                                    onChange={(e) => patchConnection({ "display:hidden": e.target.checked ? true : undefined })}
                                />
                                {t("Hide from UI")}
                            </label>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

ConnectionsContent.displayName = "ConnectionsContent";
