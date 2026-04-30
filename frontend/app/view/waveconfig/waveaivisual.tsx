// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { t } from "@/app/i18n";
import type { WaveConfigViewModel } from "@/app/view/waveconfig/waveconfig-model";
import { useAtom } from "jotai";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";

type Capability = "tools" | "images" | "pdfs";
type Provider = "wave" | "google" | "groq" | "openrouter" | "nanogpt" | "openai" | "azure" | "azure-legacy" | "custom";
type ApiType = "google-gemini" | "openai-responses" | "openai-chat";
type Level = "low" | "medium" | "high";

type WaveAIModeConfig = {
    "display:name": string;
    "display:order"?: number;
    "display:icon"?: string;
    "display:description"?: string;
    "ai:provider"?: Provider;
    "ai:apitype"?: ApiType;
    "ai:model"?: string;
    "ai:thinkinglevel"?: Level;
    "ai:verbosity"?: Level;
    "ai:endpoint"?: string;
    "ai:proxyurl"?: string;
    "ai:azureapiversion"?: string;
    "ai:apitoken"?: string;
    "ai:apitokensecretname"?: string;
    "ai:azureresourcename"?: string;
    "ai:azuredeployment"?: string;
    "ai:capabilities"?: Capability[];
    "ai:switchcompat"?: string[];
    "waveai:cloud"?: boolean;
    "waveai:premium"?: boolean;
};

type WaveAIConfig = Record<string, WaveAIModeConfig>;

const ProviderOptions: Provider[] = [
    "wave",
    "openai",
    "google",
    "groq",
    "openrouter",
    "nanogpt",
    "azure",
    "azure-legacy",
    "custom",
];
const ApiTypeOptions: ApiType[] = ["openai-responses", "openai-chat", "google-gemini"];
const LevelOptions: Level[] = ["low", "medium", "high"];
const CapabilityOptions: Capability[] = ["tools", "images", "pdfs"];
const ModeKeyPattern = /^[a-zA-Z0-9_@.-]+$/;

function parseConfig(content: string): WaveAIConfig {
    if (content.trim() === "") {
        return {};
    }
    const parsed = JSON.parse(content);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(t("Wave AI modes must be a JSON object."));
    }
    return parsed as WaveAIConfig;
}

function formatConfig(config: WaveAIConfig): string {
    return JSON.stringify(config, null, 2);
}

function makeModeKey(config: WaveAIConfig, baseKey: string): string {
    let key = baseKey;
    let i = 2;
    while (Object.prototype.hasOwnProperty.call(config, key)) {
        key = `${baseKey}-${i}`;
        i += 1;
    }
    return key;
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

function patchMode(config: WaveAIConfig, key: string, patch: Partial<WaveAIModeConfig>): WaveAIConfig {
    const current = config[key] ?? { "display:name": key };
    const nextMode: WaveAIModeConfig = { ...current, ...patch };
    for (const prop of Object.keys(nextMode) as Array<keyof WaveAIModeConfig>) {
        const value = nextMode[prop];
        if (value === "" || value == null || (Array.isArray(value) && value.length === 0)) {
            delete nextMode[prop];
        }
    }
    nextMode["display:name"] = nextMode["display:name"] || key;
    return { ...config, [key]: nextMode };
}

function makeTemplate(config: WaveAIConfig, provider: Provider): [string, WaveAIModeConfig] {
    if (provider === "openai") {
        return [
            makeModeKey(config, "ai@openai"),
            {
                "display:name": "OpenAI",
                "display:description": "OpenAI Responses API",
                "ai:provider": "openai",
                "ai:apitype": "openai-responses",
                "ai:model": "gpt-4.1",
                "ai:apitokensecretname": "OPENAI_API_KEY",
                "ai:capabilities": ["tools", "images", "pdfs"],
            },
        ];
    }
    if (provider === "google") {
        return [
            makeModeKey(config, "ai@google"),
            {
                "display:name": "Google Gemini",
                "display:description": "Google Gemini API",
                "ai:provider": "google",
                "ai:apitype": "google-gemini",
                "ai:model": "gemini-2.5-pro",
                "ai:apitokensecretname": "GOOGLE_API_KEY",
                "ai:capabilities": ["tools", "images", "pdfs"],
            },
        ];
    }
    if (provider === "openrouter") {
        return [
            makeModeKey(config, "ai@openrouter"),
            {
                "display:name": "OpenRouter",
                "display:description": "OpenRouter compatible model",
                "ai:provider": "openrouter",
                "ai:apitype": "openai-chat",
                "ai:model": "openai/gpt-4.1",
                "ai:apitokensecretname": "OPENROUTER_API_KEY",
                "ai:capabilities": ["tools", "images", "pdfs"],
            },
        ];
    }
    if (provider === "azure") {
        return [
            makeModeKey(config, "ai@azure"),
            {
                "display:name": "Azure OpenAI",
                "display:description": "Azure OpenAI deployment",
                "ai:provider": "azure",
                "ai:apitype": "openai-chat",
                "ai:apitokensecretname": "AZURE_OPENAI_API_KEY",
                "ai:azureapiversion": "2024-10-21",
                "ai:capabilities": ["tools"],
            },
        ];
    }
    return [
        makeModeKey(config, "ai@local"),
        {
            "display:name": "Local Model",
            "display:description": "OpenAI-compatible local endpoint",
            "ai:provider": "custom",
            "ai:apitype": "openai-chat",
            "ai:model": "llama3.1",
            "ai:endpoint": "http://localhost:11434/v1",
            "ai:capabilities": ["tools"],
        },
    ];
}

const FormRow = memo(
    ({
        label,
        children,
        help,
    }: {
        label: string;
        children: ReactNode;
        help?: string;
    }) => (
        <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">{label}</span>
            {children}
            {help && <span className="text-xs text-muted">{help}</span>}
        </label>
    )
);
FormRow.displayName = "FormRow";

function TextInput({
    value,
    onChange,
    placeholder,
    mono,
    type = "text",
    onBlur,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    mono?: boolean;
    type?: string;
    onBlur?: () => void;
}) {
    return (
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={placeholder}
            className={`rounded border border-border bg-secondary px-3 py-2 text-primary outline-none focus:border-accent ${
                mono ? "font-mono" : ""
            }`}
        />
    );
}

function SelectInput<T extends string>({
    value,
    options,
    onChange,
}: {
    value: string;
    options: T[];
    onChange: (value: T | undefined) => void;
}) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value ? (e.target.value as T) : undefined)}
            className="rounded border border-border bg-secondary px-3 py-2 text-primary outline-none focus:border-accent"
        >
            <option value="">{t("Use provider default")}</option>
            {options.map((option) => (
                <option key={option} value={option}>
                    {option}
                </option>
            ))}
        </select>
    );
}

export const WaveAIVisualContent = memo(({ model }: { model: WaveConfigViewModel }) => {
    const [fileContent, setFileContent] = useAtom(model.fileContentAtom);
    const [selectedKey, setSelectedKey] = useState("");
    const [keyDraft, setKeyDraft] = useState("");
    const parseResult = useMemo(() => {
        try {
            return { config: parseConfig(fileContent), error: null as string | null };
        } catch (e) {
            return { config: {} as WaveAIConfig, error: e instanceof Error ? e.message : String(e) };
        }
    }, [fileContent]);

    const entries = useMemo(() => {
        return Object.entries(parseResult.config).sort(
            ([aKey, a], [bKey, b]) => (a["display:order"] ?? 0) - (b["display:order"] ?? 0) || aKey.localeCompare(bKey)
        );
    }, [parseResult.config]);

    useEffect(() => {
        if (!selectedKey && entries.length > 0) {
            setSelectedKey(entries[0][0]);
        } else if (selectedKey && !parseResult.config[selectedKey]) {
            setSelectedKey(entries[0]?.[0] ?? "");
        }
    }, [entries, parseResult.config, selectedKey]);

    useEffect(() => {
        setKeyDraft(selectedKey);
    }, [selectedKey]);

    const writeConfig = (nextConfig: WaveAIConfig) => {
        setFileContent(formatConfig(nextConfig));
        model.markAsEdited();
    };

    const selectedMode = selectedKey ? parseResult.config[selectedKey] : null;

    const addMode = (provider: Provider) => {
        const [key, mode] = makeTemplate(parseResult.config, provider);
        const maxOrder = Math.max(0, ...Object.values(parseResult.config).map((modeConfig) => modeConfig["display:order"] ?? 0));
        const nextConfig = { ...parseResult.config, [key]: { ...mode, "display:order": maxOrder + 10 } };
        writeConfig(nextConfig);
        setSelectedKey(key);
    };

    const duplicateMode = () => {
        if (!selectedMode) return;
        const key = makeModeKey(parseResult.config, `${selectedKey}-copy`);
        writeConfig({
            ...parseResult.config,
            [key]: {
                ...selectedMode,
                "display:name": `${selectedMode["display:name"]} Copy`,
                "display:order": (selectedMode["display:order"] ?? entries.length * 10) + 1,
            },
        });
        setSelectedKey(key);
    };

    const deleteMode = () => {
        if (!selectedKey || !window.confirm(t("Delete this AI mode?"))) return;
        const nextConfig = { ...parseResult.config };
        delete nextConfig[selectedKey];
        writeConfig(nextConfig);
        setSelectedKey(Object.keys(nextConfig)[0] ?? "");
    };

    const updateMode = (patch: Partial<WaveAIModeConfig>) => {
        if (!selectedKey) return;
        writeConfig(patchMode(parseResult.config, selectedKey, patch));
    };

    const renameMode = () => {
        const nextKey = keyDraft.trim();
        if (!selectedKey || nextKey === selectedKey) return;
        if (!ModeKeyPattern.test(nextKey)) {
            window.alert(t("Mode key can only contain letters, numbers, underscores, @, dots, and hyphens."));
            setKeyDraft(selectedKey);
            return;
        }
        if (parseResult.config[nextKey]) {
            window.alert(t("A mode with this key already exists."));
            setKeyDraft(selectedKey);
            return;
        }
        const nextConfig = { ...parseResult.config };
        nextConfig[nextKey] = nextConfig[selectedKey];
        delete nextConfig[selectedKey];
        writeConfig(nextConfig);
        setSelectedKey(nextKey);
    };

    const toggleCapability = (capability: Capability) => {
        if (!selectedMode) return;
        const capabilities = new Set(selectedMode["ai:capabilities"] ?? []);
        if (capabilities.has(capability)) {
            capabilities.delete(capability);
        } else {
            capabilities.add(capability);
        }
        updateMode({ "ai:capabilities": Array.from(capabilities) as Capability[] });
    };

    if (parseResult.error) {
        return (
            <div className="h-full overflow-auto p-5">
                <div className="rounded border border-error bg-error/10 p-4 text-error">{parseResult.error}</div>
                <div className="mt-2 text-sm text-muted">{t("Fix the JSON in Raw JSON before using the visual editor.")}</div>
            </div>
        );
    }

    return (
        <div className="grid h-full grid-cols-[260px_1fr] overflow-hidden bg-background @max-w800:grid-cols-1">
            <aside className="flex min-h-0 flex-col border-r border-border @max-w800:border-b @max-w800:border-r-0">
                <div className="border-b border-border p-3">
                    <div className="text-sm font-semibold">{t("AI Modes")}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {(["openai", "google", "openrouter", "azure", "custom"] as Provider[]).map((provider) => (
                            <button
                                key={provider}
                                type="button"
                                onClick={() => addMode(provider)}
                                className="rounded border border-border px-2 py-1 text-xs hover:bg-hover"
                            >
                                <i className="fa fa-plus mr-1" />
                                {provider === "custom" ? t("Local") : provider}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                    {entries.map(([key, mode]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedKey(key)}
                            className={`flex w-full flex-col gap-1 border-b border-border px-3 py-2 text-left hover:bg-hover ${
                                selectedKey === key ? "bg-accentbg" : ""
                            }`}
                        >
                            <span className="font-medium">{mode["display:name"] || key}</span>
                            <span className="truncate font-mono text-xs text-muted">{key}</span>
                            <span className="truncate text-xs text-muted">{mode["ai:provider"] || t("Provider default")}</span>
                        </button>
                    ))}
                    {entries.length === 0 && <div className="p-4 text-sm text-muted">{t("No AI modes configured.")}</div>}
                </div>
            </aside>

            <main className="min-h-0 overflow-auto p-5">
                {!selectedMode ? (
                    <div className="rounded border border-border bg-secondary/40 p-5 text-sm text-muted">
                        {t("Create an AI mode from the left panel to begin.")}
                    </div>
                ) : (
                    <div className="mx-auto flex max-w-5xl flex-col gap-5">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                            <div>
                                <div className="text-base font-semibold">{selectedMode["display:name"]}</div>
                                <div className="font-mono text-xs text-muted">{selectedKey}</div>
                            </div>
                            <div className="flex gap-2">
                                <button type="button" onClick={duplicateMode} className="rounded border border-border px-3 py-2 text-sm hover:bg-hover">
                                    {t("Duplicate")}
                                </button>
                                <button type="button" onClick={deleteMode} className="rounded border border-error px-3 py-2 text-sm text-error hover:bg-error/10">
                                    {t("Delete")}
                                </button>
                            </div>
                        </div>

                        <section className="grid gap-4 @w900:grid-cols-2">
                            <FormRow label={t("Mode Key")} help={t("Used by waveai:defaultmode and mode switching.")}>
                                <TextInput value={keyDraft} onChange={setKeyDraft} onBlur={renameMode} mono />
                            </FormRow>
                            <FormRow label={t("Display Name")}>
                                <TextInput value={selectedMode["display:name"] ?? ""} onChange={(value) => updateMode({ "display:name": value })} />
                            </FormRow>
                            <FormRow label={t("Display Order")}>
                                <TextInput
                                    type="number"
                                    value={selectedMode["display:order"] == null ? "" : String(selectedMode["display:order"])}
                                    onChange={(value) => updateMode({ "display:order": value === "" ? undefined : Number(value) })}
                                />
                            </FormRow>
                            <FormRow label={t("Icon")}>
                                <TextInput value={selectedMode["display:icon"] ?? ""} onChange={(value) => updateMode({ "display:icon": value })} placeholder="sparkles" />
                            </FormRow>
                            <FormRow label={t("Description")}>
                                <TextInput
                                    value={selectedMode["display:description"] ?? ""}
                                    onChange={(value) => updateMode({ "display:description": value })}
                                />
                            </FormRow>
                        </section>

                        <section className="grid gap-4 @w900:grid-cols-2">
                            <FormRow label={t("Provider")}>
                                <SelectInput value={selectedMode["ai:provider"] ?? ""} options={ProviderOptions} onChange={(value) => updateMode({ "ai:provider": value })} />
                            </FormRow>
                            <FormRow label={t("API Type")}>
                                <SelectInput value={selectedMode["ai:apitype"] ?? ""} options={ApiTypeOptions} onChange={(value) => updateMode({ "ai:apitype": value })} />
                            </FormRow>
                            <FormRow label={t("Model")}>
                                <TextInput value={selectedMode["ai:model"] ?? ""} onChange={(value) => updateMode({ "ai:model": value })} mono />
                            </FormRow>
                            <FormRow label={t("Endpoint")}>
                                <TextInput value={selectedMode["ai:endpoint"] ?? ""} onChange={(value) => updateMode({ "ai:endpoint": value })} placeholder="http://localhost:11434/v1" mono />
                            </FormRow>
                            <FormRow label={t("API Token Secret Name")} help={t("Recommended: store the real token in Secrets and reference it here.")}>
                                <TextInput
                                    value={selectedMode["ai:apitokensecretname"] ?? ""}
                                    onChange={(value) => updateMode({ "ai:apitokensecretname": value })}
                                    placeholder="OPENAI_API_KEY"
                                    mono
                                />
                            </FormRow>
                            <FormRow label={t("API Token")} help={t("Less secure than using a secret name.")}>
                                <TextInput value={selectedMode["ai:apitoken"] ?? ""} onChange={(value) => updateMode({ "ai:apitoken": value })} type="password" mono />
                            </FormRow>
                            <FormRow label={t("Proxy URL")}>
                                <TextInput value={selectedMode["ai:proxyurl"] ?? ""} onChange={(value) => updateMode({ "ai:proxyurl": value })} mono />
                            </FormRow>
                        </section>

                        <section className="grid gap-4 @w900:grid-cols-2">
                            <FormRow label={t("Thinking Level")}>
                                <SelectInput
                                    value={selectedMode["ai:thinkinglevel"] ?? ""}
                                    options={LevelOptions}
                                    onChange={(value) => updateMode({ "ai:thinkinglevel": value })}
                                />
                            </FormRow>
                            <FormRow label={t("Verbosity")}>
                                <SelectInput value={selectedMode["ai:verbosity"] ?? ""} options={LevelOptions} onChange={(value) => updateMode({ "ai:verbosity": value })} />
                            </FormRow>
                            <FormRow label={t("Capabilities")}>
                                <div className="flex flex-wrap gap-2">
                                    {CapabilityOptions.map((capability) => (
                                        <button
                                            key={capability}
                                            type="button"
                                            onClick={() => toggleCapability(capability)}
                                            className={`rounded border px-3 py-2 text-sm ${
                                                selectedMode["ai:capabilities"]?.includes(capability)
                                                    ? "border-accent bg-accentbg text-primary"
                                                    : "border-border hover:bg-hover"
                                            }`}
                                        >
                                            {capability}
                                        </button>
                                    ))}
                                </div>
                            </FormRow>
                            <FormRow label={t("Compatible Mode Keys")}>
                                <TextInput
                                    value={splitList(selectedMode["ai:switchcompat"])}
                                    onChange={(value) => updateMode({ "ai:switchcompat": parseList(value) })}
                                    placeholder="ai@openai, ai@local"
                                    mono
                                />
                            </FormRow>
                        </section>

                        <section className="grid gap-4 @w900:grid-cols-2">
                            <FormRow label={t("Azure Resource Name")}>
                                <TextInput value={selectedMode["ai:azureresourcename"] ?? ""} onChange={(value) => updateMode({ "ai:azureresourcename": value })} mono />
                            </FormRow>
                            <FormRow label={t("Azure Deployment")}>
                                <TextInput value={selectedMode["ai:azuredeployment"] ?? ""} onChange={(value) => updateMode({ "ai:azuredeployment": value })} mono />
                            </FormRow>
                            <FormRow label={t("Azure API Version")}>
                                <TextInput value={selectedMode["ai:azureapiversion"] ?? ""} onChange={(value) => updateMode({ "ai:azureapiversion": value })} mono />
                            </FormRow>
                            <div className="flex flex-wrap items-end gap-4 text-sm">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedMode["waveai:cloud"] === true}
                                        onChange={(e) => updateMode({ "waveai:cloud": e.target.checked ? true : undefined })}
                                    />
                                    {t("Wave Cloud Mode")}
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedMode["waveai:premium"] === true}
                                        onChange={(e) => updateMode({ "waveai:premium": e.target.checked ? true : undefined })}
                                    />
                                    {t("Premium Mode")}
                                </label>
                            </div>
                        </section>
                    </div>
                )}
            </main>
        </div>
    );
});

WaveAIVisualContent.displayName = "WaveAIVisualContent";
