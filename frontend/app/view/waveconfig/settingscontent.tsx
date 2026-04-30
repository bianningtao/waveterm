// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { t } from "@/app/i18n";
import type { WaveConfigViewModel } from "@/app/view/waveconfig/waveconfig-model";
import { useAtom } from "jotai";
import { memo, useMemo } from "react";

type SettingsConfig = Record<string, any>;
type SettingField =
    | {
          key: string;
          label: string;
          type: "boolean";
          help?: string;
      }
    | {
          key: string;
          label: string;
          type: "text" | "number";
          placeholder?: string;
          help?: string;
      }
    | {
          key: string;
          label: string;
          type: "select";
          options: Array<string | { value: string; label: string }>;
          help?: string;
      };

const Sections: Array<{ title: string; description: string; fields: SettingField[] }> = [
    {
        title: "App",
        description: "Window behavior, tab bar, and common interaction settings.",
        fields: [
            {
                key: "app:locale",
                label: "Language",
                type: "select",
                options: [
                    { value: "system", label: "System default" },
                    { value: "en-US", label: "English" },
                    { value: "zh-CN", label: "Simplified Chinese" },
                    { value: "ja-JP", label: "Japanese" },
                ],
            },
            { key: "app:tabbar", label: "Tab Bar Position", type: "select", options: ["top", "left"] },
            { key: "app:confirmquit", label: "Confirm Quit", type: "boolean" },
            { key: "app:hideaibutton", label: "Hide AI Button", type: "boolean" },
            { key: "app:focusfollowscursor", label: "Focus Follows Cursor", type: "select", options: ["off", "on", "term"] },
            { key: "tab:confirmclose", label: "Confirm Tab Close", type: "boolean" },
            { key: "widget:showhelp", label: "Show Help Widgets", type: "boolean" },
        ],
    },
    {
        title: "Wave AI",
        description: "Default mode and cloud mode visibility.",
        fields: [
            { key: "waveai:defaultmode", label: "Default AI Mode", type: "text", placeholder: "ai@openai" },
            { key: "waveai:showcloudmodes", label: "Show Wave Cloud Modes", type: "boolean" },
            { key: "ai:fontsize", label: "AI Font Size", type: "number" },
            { key: "ai:fixedfontsize", label: "AI Fixed Font Size", type: "number" },
        ],
    },
    {
        title: "Terminal",
        description: "Terminal appearance and interaction defaults.",
        fields: [
            { key: "term:fontsize", label: "Font Size", type: "number" },
            { key: "term:fontfamily", label: "Font Family", type: "text", placeholder: "JetBrains Mono" },
            { key: "term:theme", label: "Theme", type: "text", placeholder: "default" },
            { key: "term:scrollback", label: "Scrollback Lines", type: "number" },
            { key: "term:cursor", label: "Cursor", type: "select", options: ["block", "bar", "underline"] },
            { key: "term:cursorblink", label: "Blinking Cursor", type: "boolean" },
            { key: "term:copyonselect", label: "Copy On Select", type: "boolean" },
            { key: "term:transparency", label: "Transparency", type: "number", help: "0 is opaque, 1 is fully transparent." },
            { key: "term:bellsound", label: "Bell Sound", type: "boolean" },
            { key: "term:bellindicator", label: "Bell Indicator", type: "boolean" },
            { key: "term:osc52", label: "OSC52 Clipboard", type: "select", options: ["focus", "always"] },
            { key: "term:durable", label: "Durable Sessions", type: "boolean" },
        ],
    },
    {
        title: "Editor and Preview",
        description: "File browser, preview, and editor defaults.",
        fields: [
            { key: "editor:fontsize", label: "Editor Font Size", type: "number" },
            { key: "editor:wordwrap", label: "Word Wrap", type: "boolean" },
            { key: "editor:minimapenabled", label: "Editor Minimap", type: "boolean" },
            { key: "preview:showhiddenfiles", label: "Show Hidden Files", type: "boolean" },
            { key: "preview:defaultsort", label: "Directory Sort Order", type: "select", options: ["name", "modtime"] },
        ],
    },
    {
        title: "Web",
        description: "Embedded browser defaults.",
        fields: [
            { key: "web:defaulturl", label: "Default URL", type: "text", placeholder: "https://github.com/wavetermdev/waveterm" },
            { key: "web:defaultsearch", label: "Default Search URL", type: "text", placeholder: "https://www.google.com/search?q=%s" },
            { key: "web:openlinksinternally", label: "Open Links Internally", type: "boolean" },
        ],
    },
    {
        title: "Window",
        description: "Main window rendering and chrome settings.",
        fields: [
            { key: "window:transparent", label: "Transparent Window", type: "boolean" },
            { key: "window:blur", label: "Window Blur", type: "boolean" },
            { key: "window:opacity", label: "Window Opacity", type: "number" },
            { key: "window:bgcolor", label: "Window Background Color", type: "text", placeholder: "#000000" },
            { key: "window:showmenubar", label: "Show Menu Bar", type: "boolean" },
            { key: "window:nativetitlebar", label: "Native Title Bar", type: "boolean" },
            { key: "window:zoom", label: "Window Zoom", type: "number" },
        ],
    },
];

function getSelectOptionValue(option: string | { value: string; label: string }): string {
    return typeof option === "string" ? option : option.value;
}

function getSelectOptionLabel(option: string | { value: string; label: string }): string {
    return typeof option === "string" ? option : t(option.label);
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

export const SettingsContent = memo(({ model }: { model: WaveConfigViewModel }) => {
    const [fileContent, setFileContent] = useAtom(model.fileContentAtom);
    const parseResult = useMemo(() => {
        try {
            return { config: parseConfig(fileContent), error: null as string | null };
        } catch (e) {
            return { config: {} as SettingsConfig, error: e instanceof Error ? e.message : String(e) };
        }
    }, [fileContent]);

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
                <div className="rounded border border-error bg-error/10 p-4 text-error">{parseResult.error}</div>
                <div className="mt-2 text-sm text-muted">{t("Fix the JSON in Raw JSON before using the visual editor.")}</div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto bg-background p-5">
            <div className="mx-auto flex max-w-5xl flex-col gap-5">
                <div className="rounded border border-border bg-secondary/30 p-4 text-sm text-muted">
                    {t("This page covers common settings. Use Raw JSON for advanced keys not shown here.")}
                </div>
                {Sections.map((section) => (
                    <section key={section.title} className="rounded border border-border bg-background/60">
                        <div className="border-b border-border p-4">
                            <div className="text-base font-semibold">{t(section.title)}</div>
                            <div className="mt-1 text-sm text-muted">{t(section.description)}</div>
                        </div>
                        <div className="grid gap-4 p-4 @w900:grid-cols-2">
                            {section.fields.map((field) => {
                                const value = parseResult.config[field.key];
                                const hasValue = Object.prototype.hasOwnProperty.call(parseResult.config, field.key);
                                return (
                                    <div key={field.key} className="flex flex-col gap-1 text-sm">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-muted">{t(field.label)}</span>
                                            {hasValue && (
                                                <button
                                                    type="button"
                                                    onClick={() => updateValue(field.key, undefined)}
                                                    className="text-xs text-muted hover:text-primary"
                                                >
                                                    {t("Use Default")}
                                                </button>
                                            )}
                                        </div>
                                        {field.type === "boolean" ? (
                                            <label className="flex items-center gap-2 rounded border border-border bg-secondary px-3 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={value === true}
                                                    onChange={(e) => updateValue(field.key, e.target.checked)}
                                                />
                                                <span>{hasValue ? (value === true ? t("On") : t("Off")) : t("Default")}</span>
                                            </label>
                                        ) : field.type === "select" ? (
                                            <select
                                                value={value ?? ""}
                                                onChange={(e) => updateValue(field.key, e.target.value || undefined)}
                                                className="rounded border border-border bg-secondary px-3 py-2 text-primary outline-none focus:border-accent"
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
                                                    updateValue(
                                                        field.key,
                                                        field.type === "number"
                                                            ? e.target.value === ""
                                                                ? undefined
                                                                : Number(e.target.value)
                                                            : e.target.value
                                                    )
                                                }
                                                placeholder={"placeholder" in field ? field.placeholder : undefined}
                                                className="rounded border border-border bg-secondary px-3 py-2 text-primary outline-none focus:border-accent"
                                            />
                                        )}
                                        <div className="font-mono text-xs text-muted">{field.key}</div>
                                        {"help" in field && field.help && <div className="text-xs text-muted">{t(field.help)}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
});

SettingsContent.displayName = "SettingsContent";
