// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { t } from "@/app/i18n";
import { WaveConfigFieldClass } from "@/app/view/waveconfig/formstyles";
import type { WaveConfigViewModel } from "@/app/view/waveconfig/waveconfig-model";
import { useAtom } from "jotai";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";

type Capability = "tools" | "images" | "pdfs";
type Provider = "wave" | "google" | "groq" | "openrouter" | "nanogpt" | "openai" | "azure" | "azure-legacy" | "custom";
type ApiType = "google-gemini" | "openai-responses" | "openai-chat" | "anthropic-messages";
type Level = "low" | "medium" | "high";
type TemplateId =
    | "openai"
    | "google"
    | "openrouter"
    | "azure"
    | "custom"
    | "minimax-cn"
    | "minimax-intl"
    | "minimax-token-plan-cn"
    | "minimax-token-plan-intl"
    | "kimi-cn"
    | "kimi-intl"
    | "bailian-cn"
    | "bailian-us"
    | "bailian-sg"
    | "zhipu"
    | "deepseek-openai"
    | "deepseek-anthropic"
    | "xiaomi-mimo";

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
const ApiTypeOptions: ApiType[] = ["openai-responses", "openai-chat", "anthropic-messages", "google-gemini"];
const LevelOptions: Level[] = ["low", "medium", "high"];
const CapabilityOptions: Capability[] = ["tools", "images", "pdfs"];
const ModeKeyPattern = /^[a-zA-Z0-9_@.-]+$/;
const ModelSuggestions = [
    "MiniMax-M2.7",
    "kimi-k2.5",
    "qwen-plus",
    "glm-5.1",
    "deepseek-v4-pro",
    "mimo-v2-pro",
    "mimo-v2-flash",
    "mimo-v2.5-pro",
    "gpt-4.1",
    "gemini-2.5-pro",
    "llama3.1",
];

type TemplateButton = {
    id: TemplateId;
    label: string;
    description?: string;
};

const TemplateGroups: Array<{ title: string; description: string; templates: TemplateButton[] }> = [
    {
        title: "International Providers",
        description: "OpenAI, Gemini, OpenRouter, and Azure templates.",
        templates: [
            { id: "openai", label: "OpenAI" },
            { id: "google", label: "Google" },
            { id: "openrouter", label: "OpenRouter" },
            { id: "azure", label: "Azure" },
        ],
    },
    {
        title: "Domestic Models",
        description: "MiniMax, Kimi, Bailian, Xiaomi MiMo, Zhipu, and DeepSeek templates.",
        templates: [
            { id: "minimax-cn", label: "MiniMax CN" },
            { id: "minimax-intl", label: "MiniMax Global" },
            { id: "minimax-token-plan-cn", label: "MiniMax Token Plan CN" },
            { id: "minimax-token-plan-intl", label: "MiniMax Token Plan Global" },
            { id: "kimi-cn", label: "Kimi CN" },
            { id: "kimi-intl", label: "Kimi Global" },
            { id: "bailian-cn", label: "Bailian Beijing" },
            { id: "bailian-us", label: "Bailian Virginia" },
            { id: "bailian-sg", label: "Bailian Singapore" },
            { id: "zhipu", label: "Zhipu" },
            { id: "deepseek-openai", label: "DeepSeek OpenAI" },
            { id: "deepseek-anthropic", label: "DeepSeek Anthropic" },
            { id: "xiaomi-mimo", label: "Xiaomi MiMo" },
        ],
    },
    {
        title: "Custom",
        description: "Custom OpenAI-compatible endpoint.",
        templates: [{ id: "custom", label: "Custom" }],
    },
];

function parseConfig(content: string): WaveAIConfig {
    if (content.trim() === "") {
        return {};
    }
    const parsed = JSON.parse(content);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(t("Wave AI models must be a JSON object."));
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

function customTemplate(
    config: WaveAIConfig,
    baseKey: string,
    displayName: string,
    description: string,
    apiType: ApiType,
    model: string,
    endpoint: string,
    secretName: string,
    capabilities: Capability[] = ["tools"]
): [string, WaveAIModeConfig] {
    return [
        makeModeKey(config, baseKey),
        {
            "display:name": displayName,
            "display:description": description,
            "ai:provider": "custom",
            "ai:apitype": apiType,
            "ai:model": model,
            "ai:endpoint": endpoint,
            "ai:apitokensecretname": secretName,
            "ai:capabilities": capabilities,
        },
    ];
}

function makeTemplate(config: WaveAIConfig, templateId: TemplateId): [string, WaveAIModeConfig] {
    if (templateId === "openai") {
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
    if (templateId === "google") {
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
    if (templateId === "openrouter") {
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
    if (templateId === "azure") {
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
    if (templateId === "minimax-cn") {
        return customTemplate(config, "ai@minimax-cn", "MiniMax CN", "MiniMax pay-as-you-go China endpoint", "openai-chat", "MiniMax-M2.7", "https://api.minimaxi.com/v1/chat/completions", "MINIMAX_API_KEY", ["tools"]);
    }
    if (templateId === "minimax-intl") {
        return customTemplate(config, "ai@minimax-global", "MiniMax Global", "MiniMax pay-as-you-go global endpoint", "openai-chat", "MiniMax-M2.7", "https://api.minimax.io/v1/chat/completions", "MINIMAX_API_KEY", ["tools"]);
    }
    if (templateId === "minimax-token-plan-cn") {
        return customTemplate(config, "ai@minimax-token-cn", "MiniMax Token Plan CN", "MiniMax Token Plan China endpoint", "anthropic-messages", "MiniMax-M2.7", "https://api.minimaxi.com/anthropic/v1/messages", "MINIMAX_API_KEY", ["tools"]);
    }
    if (templateId === "minimax-token-plan-intl") {
        return customTemplate(config, "ai@minimax-token-global", "MiniMax Token Plan Global", "MiniMax Token Plan global endpoint", "anthropic-messages", "MiniMax-M2.7", "https://api.minimax.io/anthropic/v1/messages", "MINIMAX_API_KEY", ["tools"]);
    }
    if (templateId === "kimi-cn") {
        return customTemplate(config, "ai@kimi-cn", "Kimi CN", "Moonshot Kimi China endpoint", "openai-chat", "kimi-k2.5", "https://api.moonshot.cn/v1/chat/completions", "MOONSHOT_API_KEY", ["tools", "images"]);
    }
    if (templateId === "kimi-intl") {
        return customTemplate(config, "ai@kimi-global", "Kimi Global", "Moonshot Kimi global endpoint", "openai-chat", "kimi-k2.5", "https://api.moonshot.ai/v1/chat/completions", "MOONSHOT_API_KEY", ["tools", "images"]);
    }
    if (templateId === "bailian-cn") {
        return customTemplate(config, "ai@bailian-cn", "Alibaba Bailian Beijing", "Alibaba Cloud Model Studio Beijing endpoint", "openai-chat", "qwen-plus", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", "DASHSCOPE_API_KEY", ["tools", "images"]);
    }
    if (templateId === "bailian-us") {
        return customTemplate(config, "ai@bailian-us", "Alibaba Bailian Virginia", "Alibaba Cloud Model Studio Virginia endpoint", "openai-chat", "qwen-plus", "https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions", "DASHSCOPE_API_KEY", ["tools", "images"]);
    }
    if (templateId === "bailian-sg") {
        return customTemplate(config, "ai@bailian-sg", "Alibaba Bailian Singapore", "Alibaba Cloud Model Studio Singapore endpoint", "openai-chat", "qwen-plus", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", "DASHSCOPE_API_KEY", ["tools", "images"]);
    }
    if (templateId === "zhipu") {
        return customTemplate(config, "ai@zhipu", "Zhipu GLM", "Zhipu OpenAI-compatible endpoint", "openai-chat", "glm-5.1", "https://open.bigmodel.cn/api/paas/v4/chat/completions", "ZAI_API_KEY", ["tools"]);
    }
    if (templateId === "deepseek-openai") {
        return customTemplate(config, "ai@deepseek", "DeepSeek", "DeepSeek OpenAI-compatible endpoint", "openai-chat", "deepseek-v4-pro", "https://api.deepseek.com/chat/completions", "DEEPSEEK_API_KEY", ["tools"]);
    }
    if (templateId === "deepseek-anthropic") {
        return customTemplate(config, "ai@deepseek-anthropic", "DeepSeek Anthropic", "DeepSeek Anthropic-compatible endpoint", "anthropic-messages", "deepseek-v4-pro", "https://api.deepseek.com/anthropic/v1/messages", "DEEPSEEK_API_KEY", ["tools"]);
    }
    if (templateId === "xiaomi-mimo") {
        return customTemplate(config, "ai@xiaomi-mimo", "Xiaomi MiMo", "Xiaomi MiMo OpenAI-compatible endpoint", "openai-chat", "mimo-v2-pro", "https://api.xiaomimimo.com/v1/chat/completions", "MIMO_API_KEY", ["tools", "images"]);
    }
    return [
        makeModeKey(config, "ai@custom"),
        {
            "display:name": "Custom",
            "display:description": "Custom OpenAI-compatible endpoint",
            "ai:provider": "custom",
            "ai:apitype": "openai-chat",
            "ai:model": "llama3.1",
            "ai:endpoint": "http://localhost:11434/v1/chat/completions",
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
    list,
    onBlur,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    mono?: boolean;
    type?: string;
    list?: string;
    onBlur?: () => void;
}) {
    return (
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={placeholder}
            list={list}
            className={`${WaveConfigFieldClass} ${mono ? "font-mono" : ""}`}
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
            className={WaveConfigFieldClass}
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
    const [editingKey, setEditingKey] = useState("");
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
        if (editingKey && !parseResult.config[editingKey]) {
            setEditingKey("");
        }
    }, [editingKey, parseResult.config]);

    useEffect(() => {
        setKeyDraft(editingKey);
    }, [editingKey]);

    const writeConfig = (nextConfig: WaveAIConfig) => {
        setFileContent(formatConfig(nextConfig));
        model.markAsEdited();
    };

    const selectedMode = editingKey ? parseResult.config[editingKey] : null;

    const addMode = (templateId: TemplateId) => {
        const [key, mode] = makeTemplate(parseResult.config, templateId);
        const maxOrder = Math.max(0, ...Object.values(parseResult.config).map((modeConfig) => modeConfig["display:order"] ?? 0));
        const nextConfig = { ...parseResult.config, [key]: { ...mode, "display:order": maxOrder + 10 } };
        writeConfig(nextConfig);
        setEditingKey(key);
    };

    const duplicateMode = (sourceKey: string) => {
        const sourceMode = parseResult.config[sourceKey];
        if (!sourceMode) return;
        const key = makeModeKey(parseResult.config, `${sourceKey}-copy`);
        writeConfig({
            ...parseResult.config,
            [key]: {
                ...sourceMode,
                "display:name": `${sourceMode["display:name"]} Copy`,
                "display:order": (sourceMode["display:order"] ?? entries.length * 10) + 1,
            },
        });
        setEditingKey(key);
    };

    const deleteMode = (key: string) => {
        if (!key || !window.confirm(t("Delete this AI model?"))) return;
        const nextConfig = { ...parseResult.config };
        delete nextConfig[key];
        writeConfig(nextConfig);
        if (editingKey === key) {
            setEditingKey("");
        }
    };

    const updateMode = (patch: Partial<WaveAIModeConfig>) => {
        if (!editingKey) return;
        writeConfig(patchMode(parseResult.config, editingKey, patch));
    };

    const renameMode = () => {
        const nextKey = keyDraft.trim();
        if (!editingKey || nextKey === editingKey) return;
        if (!ModeKeyPattern.test(nextKey)) {
            window.alert(t("Model key can only contain letters, numbers, underscores, @, dots, and hyphens."));
            setKeyDraft(editingKey);
            return;
        }
        if (parseResult.config[nextKey]) {
            window.alert(t("An AI model with this key already exists."));
            setKeyDraft(editingKey);
            return;
        }
        const nextConfig = { ...parseResult.config };
        nextConfig[nextKey] = nextConfig[editingKey];
        delete nextConfig[editingKey];
        writeConfig(nextConfig);
        setEditingKey(nextKey);
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
        <div className="h-full overflow-auto bg-background">
            <datalist id="wave-ai-model-suggestions">
                {ModelSuggestions.map((modelName) => (
                    <option key={modelName} value={modelName} />
                ))}
            </datalist>
            <main className="flex w-full flex-col gap-4 p-4">
                <section className="overflow-hidden rounded-lg border border-border bg-panel">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
                        <div>
                            <div className="text-base font-semibold">{t("Existing AI Models")}</div>
                            <div className="mt-1 text-sm text-muted">{t("Custom and BYOK")}</div>
                        </div>
                        <div className="rounded-md border border-border bg-background/40 px-3 py-2 text-xs text-muted">
                            {t("{count} models", { count: entries.length })}
                        </div>
                    </div>
                    {entries.length === 0 ? (
                        <div className="px-4 py-5 text-sm text-muted">{t("No AI models configured.")}</div>
                    ) : (
                        <div className="divide-y divide-border">
                            {entries.map(([key, mode]) => (
                                <div
                                    key={key}
                                    className={`grid gap-3 px-4 py-3 @w900:grid-cols-[minmax(0,1fr)_auto] @w900:items-center ${
                                        editingKey === key ? "bg-hoverbg shadow-[inset_3px_0_0_var(--accent-color)]" : ""
                                    }`}
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="font-semibold text-primary">{mode["display:name"] || key}</div>
                                            <span className="rounded-md border border-border bg-background/40 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                                                {key}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                                            <span>{mode["ai:provider"] || t("Provider default")}</span>
                                            {mode["ai:model"] && <span className="font-mono">{mode["ai:model"]}</span>}
                                            {mode["ai:apitype"] && <span>{mode["ai:apitype"]}</span>}
                                            {mode["ai:capabilities"]?.map((capability) => (
                                                <span key={capability} className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-accent">
                                                    {capability}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 @w900:justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setEditingKey(key)}
                                            className="rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-secondary transition-colors hover:bg-hover hover:text-primary"
                                        >
                                            {t("Edit")}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => duplicateMode(key)}
                                            className="rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-secondary transition-colors hover:bg-hover hover:text-primary"
                                        >
                                            {t("Duplicate")}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteMode(key)}
                                            className="rounded-md border border-error px-3 py-2 text-sm text-error transition-colors hover:bg-error/10"
                                        >
                                            {t("Delete")}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="rounded-lg border border-border bg-panel p-4">
                    <div className="flex flex-col gap-4">
                        <div>
                            <div className="text-base font-semibold">{t("New AI Model")}</div>
                            <div className="mt-1 text-sm text-muted">{t("Choose a provider template, then edit its details.")}</div>
                        </div>
                        {TemplateGroups.map((group) => (
                            <div key={group.title} className="rounded-md border border-border bg-background/20 p-3">
                                <div className="flex flex-wrap items-baseline gap-2">
                                    <div className="text-sm font-semibold text-primary">{t(group.title)}</div>
                                    <div className="text-xs text-muted">{t(group.description)}</div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {group.templates.map((template) => (
                                        <button
                                            key={template.id}
                                            type="button"
                                            onClick={() => addMode(template.id)}
                                            title={template.description ? t(template.description) : undefined}
                                            className="rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-secondary transition-colors hover:bg-hover hover:text-primary"
                                        >
                                            <i className="fa fa-plus mr-1" />
                                            {t(template.label)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {!selectedMode ? (
                    <div className="rounded-lg border border-border bg-panel p-5 text-sm text-muted">
                        {t("Select an AI model to edit, or create a new one.")}
                    </div>
                ) : (
                    <div className="flex w-full flex-col gap-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-panel p-4">
                            <div>
                                <div className="text-sm font-semibold text-accent">{t("Edit Model")}</div>
                                <div className="mt-1 text-base font-semibold">{selectedMode["display:name"]}</div>
                                <div className="font-mono text-xs text-muted">{editingKey}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingKey("")}
                                className="rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-secondary transition-colors hover:bg-hover hover:text-primary"
                            >
                                {t("Close")}
                            </button>
                        </div>

                        <section className="grid gap-4 rounded-lg border border-border bg-panel p-4 @w900:grid-cols-2">
                            <FormRow label={t("Model Key")} help={t("Used by waveai:defaultmode and model switching.")}>
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

                        <section className="grid gap-4 rounded-lg border border-border bg-panel p-4 @w900:grid-cols-2">
                            <FormRow label={t("Provider")}>
                                <SelectInput value={selectedMode["ai:provider"] ?? ""} options={ProviderOptions} onChange={(value) => updateMode({ "ai:provider": value })} />
                            </FormRow>
                            <FormRow label={t("API Type")}>
                                <SelectInput value={selectedMode["ai:apitype"] ?? ""} options={ApiTypeOptions} onChange={(value) => updateMode({ "ai:apitype": value })} />
                            </FormRow>
                            <FormRow label={t("Model")}>
                                <TextInput value={selectedMode["ai:model"] ?? ""} onChange={(value) => updateMode({ "ai:model": value })} list="wave-ai-model-suggestions" mono />
                            </FormRow>
                            <FormRow label={t("Endpoint")}>
                                <TextInput value={selectedMode["ai:endpoint"] ?? ""} onChange={(value) => updateMode({ "ai:endpoint": value })} placeholder="http://localhost:11434/v1/chat/completions" mono />
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

                        <section className="grid gap-4 rounded-lg border border-border bg-panel p-4 @w900:grid-cols-2">
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
                                            className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                                                selectedMode["ai:capabilities"]?.includes(capability)
                                                    ? "border-accent/50 bg-accent/15 text-accent"
                                                    : "border-border bg-background/40 text-secondary hover:bg-hover hover:text-primary"
                                            }`}
                                        >
                                            {capability}
                                        </button>
                                    ))}
                                </div>
                            </FormRow>
                            <FormRow label={t("Compatible Model Keys")}>
                                <TextInput
                                    value={splitList(selectedMode["ai:switchcompat"])}
                                    onChange={(value) => updateMode({ "ai:switchcompat": parseList(value) })}
                                    placeholder="ai@openai, ai@custom"
                                    mono
                                />
                            </FormRow>
                        </section>

                        <section className="grid gap-4 rounded-lg border border-border bg-panel p-4 @w900:grid-cols-2">
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
