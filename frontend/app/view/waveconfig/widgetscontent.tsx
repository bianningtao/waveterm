// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { t } from "@/app/i18n";
import type { WaveConfigViewModel } from "@/app/view/waveconfig/waveconfig-model";
import { useAtom } from "jotai";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";

type WidgetMeta = Record<string, any> & {
    view?: string;
    file?: string;
    url?: string;
    controller?: string;
    cmd?: string;
};
type WidgetConfig = {
    "display:order"?: number;
    "display:hidden"?: boolean;
    icon?: string;
    color?: string;
    label?: string;
    description?: string;
    workspaces?: string[];
    magnified?: boolean;
    blockdef: {
        files?: Record<string, { content?: string; meta?: Record<string, any> }>;
        meta?: WidgetMeta;
    };
};
type WidgetsConfig = Record<string, WidgetConfig | null>;

const ViewOptions = ["term", "preview", "web", "sysinfo", "processviewer", "launcher"];
const ControllerOptions = ["shell", "cmd"];
const WidgetKeyPattern = /^[a-zA-Z0-9_@.-]+$/;

function parseConfig(content: string): WidgetsConfig {
    if (content.trim() === "") {
        return {};
    }
    const parsed = JSON.parse(content);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(t("Widgets configuration must be a JSON object."));
    }
    return parsed as WidgetsConfig;
}

function formatConfig(config: WidgetsConfig): string {
    return JSON.stringify(config, null, 2);
}

function makeWidgetKey(config: WidgetsConfig, baseKey: string): string {
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

function makeTemplate(config: WidgetsConfig, view: string): [string, WidgetConfig] {
    const key = makeWidgetKey(config, `widget@${view === "processviewer" ? "process" : view}`);
    if (view === "web") {
        return [
            key,
            {
                icon: "globe",
                label: "web",
                color: "#d1d5db",
                blockdef: { meta: { view: "web", url: "https://docs.waveterm.dev" } },
            },
        ];
    }
    if (view === "preview") {
        return [
            key,
            {
                icon: "folder",
                label: "files",
                color: "#d1d5db",
                blockdef: { meta: { view: "preview", file: "~" } },
            },
        ];
    }
    if (view === "sysinfo" || view === "processviewer") {
        return [
            key,
            {
                icon: view === "sysinfo" ? "chart-line" : "list-check",
                label: view === "sysinfo" ? "sysinfo" : "processes",
                color: "#d1d5db",
                blockdef: { meta: { view } },
            },
        ];
    }
    return [
        key,
        {
            icon: "terminal",
            label: "terminal",
            color: "#d1d5db",
            blockdef: { meta: { view: "term", controller: "shell" } },
        },
    ];
}

function normalizeWidget(key: string, widget: WidgetConfig | null | undefined): WidgetConfig {
    return widget ?? { label: key, blockdef: { meta: { view: "term", controller: "shell" } } };
}

function patchWidget(config: WidgetsConfig, key: string, patch: Partial<WidgetConfig>): WidgetsConfig {
    const current = normalizeWidget(key, config[key]);
    const nextWidget: WidgetConfig = {
        ...current,
        ...patch,
        blockdef: patch.blockdef ? { ...current.blockdef, ...patch.blockdef } : current.blockdef,
    };
    for (const prop of Object.keys(nextWidget) as Array<keyof WidgetConfig>) {
        const value = nextWidget[prop];
        if (value === "" || value == null || (Array.isArray(value) && value.length === 0)) {
            delete nextWidget[prop];
        }
    }
    nextWidget.blockdef = nextWidget.blockdef ?? {};
    return { ...config, [key]: nextWidget };
}

function patchMeta(config: WidgetsConfig, key: string, patch: Partial<WidgetMeta>): WidgetsConfig {
    const current = normalizeWidget(key, config[key]);
    const nextMeta: WidgetMeta = { ...(current.blockdef.meta ?? {}), ...patch };
    for (const prop of Object.keys(nextMeta)) {
        const value = nextMeta[prop];
        if (value === "" || value == null || (Array.isArray(value) && value.length === 0)) {
            delete nextMeta[prop];
        }
    }
    return patchWidget(config, key, { blockdef: { ...current.blockdef, meta: nextMeta } });
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

export const WidgetsContent = memo(({ model }: { model: WaveConfigViewModel }) => {
    const [fileContent, setFileContent] = useAtom(model.fileContentAtom);
    const [selectedKey, setSelectedKey] = useState("");
    const [keyDraft, setKeyDraft] = useState("");
    const [metaDraft, setMetaDraft] = useState("");
    const [metaError, setMetaError] = useState<string | null>(null);
    const parseResult = useMemo(() => {
        try {
            return { config: parseConfig(fileContent), error: null as string | null };
        } catch (e) {
            return { config: {} as WidgetsConfig, error: e instanceof Error ? e.message : String(e) };
        }
    }, [fileContent]);

    const entries = useMemo(() => {
        return Object.entries(parseResult.config).sort(([aKey, a], [bKey, b]) => {
            const aOrder = a?.["display:order"] ?? 0;
            const bOrder = b?.["display:order"] ?? 0;
            return aOrder - bOrder || aKey.localeCompare(bKey);
        });
    }, [parseResult.config]);

    useEffect(() => {
        if (!selectedKey && entries.length > 0) {
            setSelectedKey(entries[0][0]);
        } else if (selectedKey && !Object.prototype.hasOwnProperty.call(parseResult.config, selectedKey)) {
            setSelectedKey(entries[0]?.[0] ?? "");
        }
    }, [entries, parseResult.config, selectedKey]);

    const selectedWidget = selectedKey ? parseResult.config[selectedKey] : undefined;
    const normalizedWidget = selectedKey ? normalizeWidget(selectedKey, selectedWidget) : null;
    const meta = normalizedWidget?.blockdef.meta ?? {};
    const disabledByNull = selectedWidget === null;

    useEffect(() => {
        setKeyDraft(selectedKey);
    }, [selectedKey]);

    useEffect(() => {
        setMetaDraft(JSON.stringify(meta, null, 2));
        setMetaError(null);
    }, [selectedKey, meta]);

    const writeConfig = (nextConfig: WidgetsConfig) => {
        setFileContent(formatConfig(nextConfig));
        model.markAsEdited();
    };

    const addWidget = (view: string) => {
        const [key, widget] = makeTemplate(parseResult.config, view);
        const maxOrder = Math.max(0, ...Object.values(parseResult.config).map((widgetConfig) => widgetConfig?.["display:order"] ?? 0));
        writeConfig({ ...parseResult.config, [key]: { ...widget, "display:order": maxOrder + 10 } });
        setSelectedKey(key);
    };

    const updateWidget = (patch: Partial<WidgetConfig>) => {
        if (!selectedKey) return;
        writeConfig(patchWidget(parseResult.config, selectedKey, patch));
    };

    const updateMeta = (patch: Partial<WidgetMeta>) => {
        if (!selectedKey) return;
        writeConfig(patchMeta(parseResult.config, selectedKey, patch));
    };

    const renameWidget = () => {
        const nextKey = keyDraft.trim();
        if (!selectedKey || nextKey === selectedKey) return;
        if (!WidgetKeyPattern.test(nextKey)) {
            window.alert(t("Widget key can only contain letters, numbers, underscores, @, dots, and hyphens."));
            setKeyDraft(selectedKey);
            return;
        }
        if (Object.prototype.hasOwnProperty.call(parseResult.config, nextKey)) {
            window.alert(t("A widget with this key already exists."));
            setKeyDraft(selectedKey);
            return;
        }
        const nextConfig = { ...parseResult.config };
        nextConfig[nextKey] = nextConfig[selectedKey];
        delete nextConfig[selectedKey];
        writeConfig(nextConfig);
        setSelectedKey(nextKey);
    };

    const duplicateWidget = () => {
        if (!selectedKey || selectedWidget == null) return;
        const key = makeWidgetKey(parseResult.config, `${selectedKey}-copy`);
        writeConfig({
            ...parseResult.config,
            [key]: {
                ...selectedWidget,
                label: `${selectedWidget.label ?? selectedKey} Copy`,
                "display:order": (selectedWidget["display:order"] ?? entries.length * 10) + 1,
            },
        });
        setSelectedKey(key);
    };

    const setWidgetNull = () => {
        if (!selectedKey || !window.confirm(t("Disable this widget by setting it to null?"))) return;
        writeConfig({ ...parseResult.config, [selectedKey]: null });
    };

    const deleteWidget = () => {
        if (!selectedKey || !window.confirm(t("Delete this widget key from widgets.json?"))) return;
        const nextConfig = { ...parseResult.config };
        delete nextConfig[selectedKey];
        writeConfig(nextConfig);
        setSelectedKey(Object.keys(nextConfig)[0] ?? "");
    };

    const restoreWidget = () => {
        if (!selectedKey) return;
        writeConfig(patchWidget(parseResult.config, selectedKey, normalizeWidget(selectedKey, null)));
    };

    const applyMetaDraft = () => {
        if (!selectedKey) return;
        try {
            const parsed = JSON.parse(metaDraft);
            if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
                throw new Error(t("Meta JSON must be an object."));
            }
            const current = normalizeWidget(selectedKey, parseResult.config[selectedKey]);
            writeConfig(patchWidget(parseResult.config, selectedKey, { blockdef: { ...current.blockdef, meta: parsed } }));
            setMetaError(null);
        } catch (e) {
            setMetaError(e instanceof Error ? e.message : String(e));
        }
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
                    <div className="text-sm font-semibold">{t("Sidebar Widgets")}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {["term", "preview", "web", "sysinfo", "processviewer"].map((view) => (
                            <button key={view} type="button" onClick={() => addWidget(view)} className="rounded border border-border px-2 py-1 text-xs hover:bg-hover">
                                <i className="fa fa-plus mr-1" />
                                {view}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                    {entries.map(([key, widget]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedKey(key)}
                            className={`flex w-full flex-col gap-1 border-b border-border px-3 py-2 text-left hover:bg-hover ${
                                selectedKey === key ? "bg-accentbg" : ""
                            }`}
                        >
                            <span className="font-medium">{widget?.label ?? key}</span>
                            <span className="truncate font-mono text-xs text-muted">{key}</span>
                            <span className="truncate text-xs text-muted">
                                {widget == null ? t("Disabled") : widget.blockdef?.meta?.view || t("No View")}
                            </span>
                        </button>
                    ))}
                    {entries.length === 0 && <div className="p-4 text-sm text-muted">{t("No widgets configured.")}</div>}
                </div>
            </aside>

            <main className="min-h-0 overflow-auto p-5">
                {!selectedKey || !normalizedWidget ? (
                    <div className="rounded border border-border bg-secondary/40 p-5 text-sm text-muted">
                        {t("Create a widget from the left panel to begin.")}
                    </div>
                ) : disabledByNull ? (
                    <div className="mx-auto flex max-w-3xl flex-col gap-4">
                        <div className="rounded border border-warning bg-warning/10 p-4 text-warning">
                            {t("This widget is disabled because its value is null.")}
                        </div>
                        <div className="flex gap-2">
                            <button type="button" onClick={restoreWidget} className="rounded bg-accent px-3 py-2 text-sm text-primary hover:bg-accent/80">
                                {t("Restore Widget")}
                            </button>
                            <button type="button" onClick={deleteWidget} className="rounded border border-error px-3 py-2 text-sm text-error hover:bg-error/10">
                                {t("Delete Key")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="mx-auto flex max-w-5xl flex-col gap-5">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                            <div>
                                <div className="text-base font-semibold">{normalizedWidget.label ?? selectedKey}</div>
                                <div className="font-mono text-xs text-muted">{selectedKey}</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={duplicateWidget} className="rounded border border-border px-3 py-2 text-sm hover:bg-hover">
                                    {t("Duplicate")}
                                </button>
                                <button type="button" onClick={setWidgetNull} className="rounded border border-warning px-3 py-2 text-sm text-warning hover:bg-warning/10">
                                    {t("Disable")}
                                </button>
                                <button type="button" onClick={deleteWidget} className="rounded border border-error px-3 py-2 text-sm text-error hover:bg-error/10">
                                    {t("Delete")}
                                </button>
                            </div>
                        </div>

                        <section className="grid gap-4 @w900:grid-cols-2">
                            <FormRow label={t("Widget Key")} help={t("Default widgets can be disabled by setting their value to null.")}>
                                <TextInput value={keyDraft} onChange={setKeyDraft} onBlur={renameWidget} mono />
                            </FormRow>
                            <FormRow label={t("Label")}>
                                <TextInput value={normalizedWidget.label ?? ""} onChange={(value) => updateWidget({ label: value })} />
                            </FormRow>
                            <FormRow label={t("Icon")} help={t("Font Awesome icon name, for example terminal or globe.")}>
                                <TextInput value={normalizedWidget.icon ?? ""} onChange={(value) => updateWidget({ icon: value })} />
                            </FormRow>
                            <FormRow label={t("Color")}>
                                <div className="flex gap-2">
                                    <input
                                        type="color"
                                        value={normalizedWidget.color?.startsWith("#") ? normalizedWidget.color : "#d1d5db"}
                                        onChange={(e) => updateWidget({ color: e.target.value })}
                                        className="h-10 w-12 rounded border border-border bg-secondary"
                                    />
                                    <TextInput value={normalizedWidget.color ?? ""} onChange={(value) => updateWidget({ color: value })} />
                                </div>
                            </FormRow>
                            <FormRow label={t("Display Order")}>
                                <TextInput
                                    type="number"
                                    value={normalizedWidget["display:order"] == null ? "" : String(normalizedWidget["display:order"])}
                                    onChange={(value) => updateWidget({ "display:order": value === "" ? undefined : Number(value) })}
                                />
                            </FormRow>
                            <FormRow label={t("Description")}>
                                <TextInput value={normalizedWidget.description ?? ""} onChange={(value) => updateWidget({ description: value })} />
                            </FormRow>
                            <FormRow label={t("Workspaces")} help={t("Comma-separated workspace names. Leave blank for all workspaces.")}>
                                <TextInput value={splitList(normalizedWidget.workspaces)} onChange={(value) => updateWidget({ workspaces: parseList(value) })} />
                            </FormRow>
                            <div className="flex flex-wrap items-end gap-4 text-sm">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={normalizedWidget["display:hidden"] === true}
                                        onChange={(e) => updateWidget({ "display:hidden": e.target.checked ? true : undefined })}
                                    />
                                    {t("Hidden")}
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={normalizedWidget.magnified === true}
                                        onChange={(e) => updateWidget({ magnified: e.target.checked ? true : undefined })}
                                    />
                                    {t("Open Magnified")}
                                </label>
                            </div>
                        </section>

                        <section className="grid gap-4 @w900:grid-cols-2">
                            <FormRow label={t("Widget View")}>
                                <select
                                    value={meta.view ?? ""}
                                    onChange={(e) => updateMeta({ view: e.target.value || undefined })}
                                    className="rounded border border-border bg-secondary px-3 py-2 text-primary outline-none focus:border-accent"
                                >
                                    <option value="">{t("No View")}</option>
                                    {ViewOptions.map((view) => (
                                        <option key={view} value={view}>
                                            {view}
                                        </option>
                                    ))}
                                </select>
                            </FormRow>
                            <FormRow label={t("Controller")}>
                                <select
                                    value={meta.controller ?? ""}
                                    onChange={(e) => updateMeta({ controller: e.target.value || undefined })}
                                    className="rounded border border-border bg-secondary px-3 py-2 text-primary outline-none focus:border-accent"
                                >
                                    <option value="">{t("Use view default")}</option>
                                    {ControllerOptions.map((controller) => (
                                        <option key={controller} value={controller}>
                                            {controller}
                                        </option>
                                    ))}
                                </select>
                            </FormRow>
                            <FormRow label={t("Command")}>
                                <TextInput value={meta.cmd ?? ""} onChange={(value) => updateMeta({ cmd: value })} mono />
                            </FormRow>
                            <FormRow label={t("File Path")}>
                                <TextInput value={meta.file ?? ""} onChange={(value) => updateMeta({ file: value })} placeholder="~" mono />
                            </FormRow>
                            <FormRow label={t("URL")}>
                                <TextInput value={meta.url ?? ""} onChange={(value) => updateMeta({ url: value })} placeholder="https://docs.waveterm.dev" mono />
                            </FormRow>
                            <FormRow label={t("Working Directory")}>
                                <TextInput value={meta["cmd:cwd"] ?? ""} onChange={(value) => updateMeta({ "cmd:cwd": value })} mono />
                            </FormRow>
                            <div className="flex flex-wrap items-end gap-4 text-sm @w900:col-span-2">
                                {(["cmd:runonstart", "cmd:persistent", "cmd:interactive", "cmd:closeonexit"] as const).map((field) => (
                                    <label key={field} className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={meta[field] === true}
                                            onChange={(e) => updateMeta({ [field]: e.target.checked ? true : undefined })}
                                        />
                                        {field}
                                    </label>
                                ))}
                            </div>
                        </section>

                        <section className="flex flex-col gap-2">
                            <div className="text-sm font-semibold">{t("Advanced Meta JSON")}</div>
                            <textarea
                                value={metaDraft}
                                onChange={(e) => setMetaDraft(e.target.value)}
                                onBlur={applyMetaDraft}
                                className="min-h-40 rounded border border-border bg-secondary px-3 py-2 font-mono text-sm text-primary outline-none focus:border-accent"
                            />
                            {metaError ? <div className="text-sm text-error">{metaError}</div> : <div className="text-xs text-muted">{t("Advanced fields are preserved and can be edited here.")}</div>}
                        </section>
                    </div>
                )}
            </main>
        </div>
    );
});

WidgetsContent.displayName = "WidgetsContent";
