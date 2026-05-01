// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { t } from "@/app/i18n";
import { WaveConfigCompactFieldClass } from "@/app/view/waveconfig/formstyles";
import type { WaveConfigViewModel } from "@/app/view/waveconfig/waveconfig-model";
import { cn } from "@/util/util";
import { useAtom } from "jotai";
import { memo, useMemo } from "react";

type SettingsConfig = Record<string, any>;
type SelectOption = string | { value: string; labelKey: string };
type SettingField =
    | {
          key: string;
          labelKey: string;
          type: "boolean";
          helpKey?: string;
      }
    | {
          key: string;
          labelKey: string;
          type: "text" | "number";
          placeholder?: string;
          helpKey?: string;
      }
    | {
          key: string;
          labelKey: string;
          type: "select";
          options: SelectOption[];
          helpKey?: string;
      };

type SettingSection = {
    titleKey: string;
    descriptionKey: string;
    icon: string;
    fields: SettingField[];
};

const Sections: SettingSection[] = [
    {
        titleKey: "App",
        descriptionKey: "Window behavior, tab bar, and common interaction settings.",
        icon: "sliders",
        fields: [
            {
                key: "app:locale",
                labelKey: "Language",
                type: "select",
                options: [
                    { value: "system", labelKey: "System default" },
                    { value: "en-US", labelKey: "English" },
                    { value: "zh-CN", labelKey: "Simplified Chinese" },
                    { value: "ja-JP", labelKey: "Japanese" },
                ],
            },
            { key: "app:tabbar", labelKey: "Tab Bar Position", type: "select", options: ["top", "left"] },
            { key: "app:confirmquit", labelKey: "Confirm Quit", type: "boolean" },
            { key: "app:hideaibutton", labelKey: "Hide AI Button", type: "boolean" },
            {
                key: "app:focusfollowscursor",
                labelKey: "Focus Follows Cursor",
                type: "select",
                options: ["off", "on", "term"],
            },
            { key: "tab:confirmclose", labelKey: "Confirm Tab Close", type: "boolean" },
            { key: "widget:showhelp", labelKey: "Show Help Widgets", type: "boolean" },
        ],
    },
    {
        titleKey: "Wave AI",
        descriptionKey: "Default mode and cloud mode visibility.",
        icon: "sparkles",
        fields: [
            { key: "waveai:defaultmode", labelKey: "Default AI Mode", type: "text", placeholder: "ai@openai" },
            { key: "waveai:showcloudmodes", labelKey: "Show Wave Cloud Modes", type: "boolean" },
            { key: "ai:fontsize", labelKey: "AI Font Size", type: "number" },
            { key: "ai:fixedfontsize", labelKey: "AI Fixed Font Size", type: "number" },
        ],
    },
    {
        titleKey: "Terminal",
        descriptionKey: "Terminal appearance and interaction defaults.",
        icon: "terminal",
        fields: [
            { key: "term:fontsize", labelKey: "Font Size", type: "number" },
            { key: "term:fontfamily", labelKey: "Font Family", type: "text", placeholder: "JetBrains Mono" },
            { key: "term:theme", labelKey: "Theme", type: "text", placeholder: "default" },
            { key: "term:scrollback", labelKey: "Scrollback Lines", type: "number" },
            { key: "term:cursor", labelKey: "Cursor", type: "select", options: ["block", "bar", "underline"] },
            { key: "term:cursorblink", labelKey: "Blinking Cursor", type: "boolean" },
            { key: "term:copyonselect", labelKey: "Copy On Select", type: "boolean" },
            {
                key: "term:transparency",
                labelKey: "Transparency",
                type: "number",
                helpKey: "0 is opaque, 1 is fully transparent.",
            },
            { key: "term:bellsound", labelKey: "Bell Sound", type: "boolean" },
            { key: "term:bellindicator", labelKey: "Bell Indicator", type: "boolean" },
            { key: "term:osc52", labelKey: "OSC52 Clipboard", type: "select", options: ["focus", "always"] },
            { key: "term:durable", labelKey: "Durable Sessions", type: "boolean" },
        ],
    },
    {
        titleKey: "Editor and Preview",
        descriptionKey: "File browser, preview, and editor defaults.",
        icon: "file-lines",
        fields: [
            { key: "editor:fontsize", labelKey: "Editor Font Size", type: "number" },
            { key: "editor:wordwrap", labelKey: "Word Wrap", type: "boolean" },
            { key: "editor:minimapenabled", labelKey: "Editor Minimap", type: "boolean" },
            { key: "preview:showhiddenfiles", labelKey: "Show Hidden Files", type: "boolean" },
            { key: "preview:defaultsort", labelKey: "Directory Sort Order", type: "select", options: ["name", "modtime"] },
        ],
    },
    {
        titleKey: "Web",
        descriptionKey: "Embedded browser defaults.",
        icon: "globe",
        fields: [
            { key: "web:defaulturl", labelKey: "Default URL", type: "text", placeholder: "https://github.com/wavetermdev/waveterm" },
            {
                key: "web:defaultsearch",
                labelKey: "Default Search URL",
                type: "text",
                placeholder: "https://www.google.com/search?q=%s",
            },
            { key: "web:openlinksinternally", labelKey: "Open Links Internally", type: "boolean" },
        ],
    },
    {
        titleKey: "Window",
        descriptionKey: "Main window rendering and chrome settings.",
        icon: "window-maximize",
        fields: [
            { key: "window:transparent", labelKey: "Transparent Window", type: "boolean" },
            { key: "window:blur", labelKey: "Window Blur", type: "boolean" },
            { key: "window:opacity", labelKey: "Window Opacity", type: "number" },
            { key: "window:bgcolor", labelKey: "Window Background Color", type: "text", placeholder: "#000000" },
            { key: "window:showmenubar", labelKey: "Show Menu Bar", type: "boolean" },
            { key: "window:nativetitlebar", labelKey: "Native Title Bar", type: "boolean" },
            { key: "window:zoom", labelKey: "Window Zoom", type: "number" },
        ],
    },
];

function getSelectOptionValue(option: SelectOption): string {
    return typeof option === "string" ? option : option.value;
}

function getSelectOptionLabel(option: SelectOption): string {
    return typeof option === "string" ? option : t(option.labelKey);
}

function parseConfig(content: string): SettingsConfig {
    if (content.trim() === "") {
        return {};
    }
    const parsed = JSON.parse(content);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(t("Settings configuration must be a JSON object."));
    }
    return parsed as SettingsConfig;
}

function formatConfig(config: SettingsConfig): string {
    return JSON.stringify(config, null, 2);
}

function formatValuePreview(value: any): string {
    if (value === true) return t("On");
    if (value === false) return t("Off");
    if (value == null || value === "") return t("Default");
    return String(value);
}

function BooleanControl({
    value,
    onChange,
}: {
    value: boolean | undefined;
    onChange: (value: boolean | undefined) => void;
}) {
    return (
        <select
            value={value == null ? "" : value ? "true" : "false"}
            onChange={(e) => {
                if (e.target.value === "") {
                    onChange(undefined);
                } else {
                    onChange(e.target.value === "true");
                }
            }}
            className={`${WaveConfigCompactFieldClass} @w900:max-w-[190px]`}
        >
            <option value="">{t("Use Default")}</option>
            <option value="true">{t("On")}</option>
            <option value="false">{t("Off")}</option>
        </select>
    );
}

const SettingRow = memo(
    ({
        field,
        value,
        hasValue,
        onUpdate,
    }: {
        field: SettingField;
        value: any;
        hasValue: boolean;
        onUpdate: (key: string, value: any) => void;
    }) => {
        return (
            <div className="grid gap-3 border-t border-border/70 px-4 py-3 first:border-t-0 @w900:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] @w900:items-center">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-primary">{t(field.labelKey)}</div>
                        <span
                            className={cn(
                                "rounded-md border px-1.5 py-0.5 text-[10px]",
                                hasValue
                                    ? "border-accent/40 bg-accent/15 text-accent"
                                    : "border-border bg-background/40 text-muted"
                            )}
                        >
                            {hasValue ? t("Custom value") : t("Default value")}
                        </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span className="font-mono">{field.key}</span>
                        {"helpKey" in field && field.helpKey && <span>{t(field.helpKey)}</span>}
                    </div>
                </div>

                <div className="flex min-w-0 items-center gap-2 @w900:justify-end">
                    {field.type === "boolean" ? (
                        <BooleanControl value={hasValue ? value === true : undefined} onChange={(nextValue) => onUpdate(field.key, nextValue)} />
                    ) : field.type === "select" ? (
                        <select
                            value={value ?? ""}
                            onChange={(e) => onUpdate(field.key, e.target.value || undefined)}
                            className={`${WaveConfigCompactFieldClass} @w900:max-w-[260px]`}
                        >
                            <option value="">{t("Use Default")}</option>
                            {field.options.map((option) => (
                                <option key={getSelectOptionValue(option)} value={getSelectOptionValue(option)}>
                                    {getSelectOptionLabel(option)}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input
                            type={field.type === "number" ? "number" : "text"}
                            value={value ?? ""}
                            onChange={(e) =>
                                onUpdate(
                                    field.key,
                                    field.type === "number"
                                        ? e.target.value === ""
                                            ? undefined
                                            : Number(e.target.value)
                                        : e.target.value
                                )
                            }
                            placeholder={"placeholder" in field ? field.placeholder : undefined}
                            className={`${WaveConfigCompactFieldClass} @w900:max-w-[260px]`}
                        />
                    )}
                    {hasValue && (
                        <button
                            type="button"
                            onClick={() => onUpdate(field.key, undefined)}
                            className="h-9 shrink-0 rounded-md border border-border px-2 text-xs text-muted transition-colors hover:bg-hover hover:text-primary"
                        >
                            {t("Reset")}
                        </button>
                    )}
                </div>
            </div>
        );
    }
);
SettingRow.displayName = "SettingRow";

export const SettingsContent = memo(({ model }: { model: WaveConfigViewModel }) => {
    const [fileContent, setFileContent] = useAtom(model.fileContentAtom);
    const parseResult = useMemo(() => {
        try {
            return { config: parseConfig(fileContent), error: null as string | null };
        } catch (e) {
            return { config: {} as SettingsConfig, error: e instanceof Error ? e.message : String(e) };
        }
    }, [fileContent]);

    const configuredCount = useMemo(() => {
        return Sections.reduce((count, section) => {
            return count + section.fields.filter((field) => Object.prototype.hasOwnProperty.call(parseResult.config, field.key)).length;
        }, 0);
    }, [parseResult.config]);

    const writeConfig = (nextConfig: SettingsConfig) => {
        setFileContent(formatConfig(nextConfig));
        model.markAsEdited();
    };

    const updateValue = (key: string, value: any) => {
        const nextConfig = { ...parseResult.config };
        if (value === "" || value == null || Number.isNaN(value)) {
            delete nextConfig[key];
        } else {
            nextConfig[key] = value;
        }
        writeConfig(nextConfig);
    };

    if (parseResult.error) {
        return (
            <div className="h-full overflow-auto p-5">
                <div className="rounded-md border border-error bg-error/10 p-4 text-error">{parseResult.error}</div>
                <div className="mt-2 text-sm text-muted">{t("Fix the JSON in Raw JSON before using the visual editor.")}</div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto bg-background">
            <div className="mx-auto grid max-w-6xl gap-5 p-5 @w900:grid-cols-[220px_minmax(0,1fr)]">
                <aside className="hidden @w900:block">
                    <div className="sticky top-5 rounded-lg border border-border bg-panel p-3">
                        <div className="px-2 pb-3">
                            <div className="text-sm font-semibold text-primary">{t("Common Settings")}</div>
                            <div className="mt-1 text-xs text-muted">
                                {t("{count} custom values", { count: configuredCount })}
                            </div>
                        </div>
                        <nav className="flex flex-col gap-1">
                            {Sections.map((section) => {
                                const sectionCount = section.fields.filter((field) =>
                                    Object.prototype.hasOwnProperty.call(parseResult.config, field.key)
                                ).length;
                                return (
                                    <a
                                        key={section.titleKey}
                                        href={`#settings-${section.titleKey.replace(/\s+/g, "-").toLowerCase()}`}
                                        className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-secondary transition-colors hover:bg-hoverbg hover:text-primary"
                                    >
                                        <i className={`fa-sharp fa-solid fa-${section.icon} w-4 text-center text-xs`} />
                                        <span className="min-w-0 flex-1 truncate">{t(section.titleKey)}</span>
                                        {sectionCount > 0 && (
                                            <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                                                {sectionCount}
                                            </span>
                                        )}
                                    </a>
                                );
                            })}
                        </nav>
                    </div>
                </aside>

                <main className="min-w-0">
                    <div className="mb-5 rounded-lg border border-border bg-panel p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="text-base font-semibold text-primary">{t("Common Settings")}</div>
                                <div className="mt-1 max-w-2xl text-sm text-muted">
                                    {t("Visual controls for everyday settings. Advanced keys stay in Raw JSON.")}
                                </div>
                            </div>
                            <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-right">
                                <div className="text-lg font-semibold text-primary">{configuredCount}</div>
                                <div className="text-[10px] uppercase tracking-wide text-muted">{t("Configured")}</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-5">
                        {Sections.map((section) => (
                            <section
                                key={section.titleKey}
                                id={`settings-${section.titleKey.replace(/\s+/g, "-").toLowerCase()}`}
                                className="overflow-hidden rounded-lg border border-border bg-panel"
                            >
                                <div className="flex items-start gap-3 border-b border-border px-4 py-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
                                        <i className={`fa-sharp fa-solid fa-${section.icon} text-sm`} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-semibold text-primary">{t(section.titleKey)}</div>
                                        <div className="mt-0.5 text-sm text-muted">{t(section.descriptionKey)}</div>
                                    </div>
                                </div>
                                <div className="divide-y-0">
                                    {section.fields.map((field) => {
                                        const value = parseResult.config[field.key];
                                        const hasValue = Object.prototype.hasOwnProperty.call(parseResult.config, field.key);
                                        return (
                                            <SettingRow
                                                key={field.key}
                                                field={field}
                                                value={value}
                                                hasValue={hasValue}
                                                onUpdate={updateValue}
                                            />
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                    </div>
                </main>
            </div>
        </div>
    );
});

SettingsContent.displayName = "SettingsContent";
