// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { t } from "@/app/i18n";
import { recordTEvent } from "@/app/store/global";
import { globalStore } from "@/app/store/jotaiStore";
import { makeORef } from "@/app/store/wos";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { WaveConfigColorInputClass, WaveConfigFieldClass } from "@/app/view/waveconfig/formstyles";
import type { WaveConfigViewModel } from "@/app/view/waveconfig/waveconfig-model";
import { computeBgStyleFromMeta } from "@/util/waveutil";
import { useAtomValue } from "jotai";
import { useMemo, useRef, useState } from "react";

type BackgroundsMap = Record<string, BackgroundConfigType | null>;
type BackgroundSource = "image" | "color";

const DefaultBackgroundColors = [
    "#111827",
    "#1f2937",
    "#2563eb",
    "#0891b2",
    "#059669",
    "#65a30d",
    "#ca8a04",
    "#ea580c",
    "#dc2626",
    "#be185d",
    "#7c3aed",
    "#475569",
];

function parseBackgrounds(content: string): BackgroundsMap {
    if (content.trim() === "") {
        return {};
    }
    const parsed = JSON.parse(content);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(t("Background configuration must be a JSON object."));
    }
    return parsed as BackgroundsMap;
}

function makeCustomKey(displayName: string, backgrounds: BackgroundsMap): string {
    const slug = displayName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const baseKey = `bg@custom-${slug || "image"}`;
    let key = baseKey;
    let i = 2;
    while (Object.prototype.hasOwnProperty.call(backgrounds, key)) {
        key = `${baseKey}-${i}`;
        i += 1;
    }
    return key;
}

function makeImageBackgroundValue(imagePath: string): string {
    const safePath = imagePath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `url("${safePath}") center / cover no-repeat`;
}

function isValidHexColor(color: string): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(color.trim());
}

async function saveBackgrounds(model: WaveConfigViewModel, backgrounds: BackgroundsMap) {
    const formatted = JSON.stringify(backgrounds, null, 2);
    globalStore.set(model.fileContentAtom, formatted);
    model.markAsEdited();
    await model.saveFile();
}

function getBackgroundDisplayName(key: string | null, backgrounds: BackgroundsMap): string {
    if (!key) {
        return t("Default");
    }
    const bg = backgrounds[key];
    return bg?.["display:name"] ?? key;
}

export function BackgroundsContent({ model }: { model: WaveConfigViewModel }) {
    const fileContent = useAtomValue(model.fileContentAtom);
    const isSaving = useAtomValue(model.isSavingAtom);
    const currentBgKey = useAtomValue(model.tabModel.getTabMetaAtom("tab:background")) ?? null;
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [displayName, setDisplayName] = useState(t("My Background"));
    const [backgroundSource, setBackgroundSource] = useState<BackgroundSource>("image");
    const [imagePath, setImagePath] = useState("");
    const [colorValue, setColorValue] = useState("#2563eb");
    const [opacity, setOpacity] = useState("0.55");
    const [localError, setLocalError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const parseResult = useMemo(() => {
        try {
            return { backgrounds: parseBackgrounds(fileContent), error: null };
        } catch (e) {
            return { backgrounds: {} as BackgroundsMap, error: e instanceof Error ? e.message : String(e) };
        }
    }, [fileContent]);

    const sortedEntries = useMemo(() => {
        return Object.entries(parseResult.backgrounds)
            .filter((entry): entry is [string, BackgroundConfigType] => entry[1] != null)
            .sort(([, a], [, b]) => ((a?.["display:order"] ?? 0) as number) - ((b?.["display:order"] ?? 0) as number));
    }, [parseResult.backgrounds]);

    const opacityValue = Number.parseFloat(opacity);
    const canAdd =
        displayName.trim() !== "" &&
        (backgroundSource === "image" ? imagePath.trim() !== "" : isValidHexColor(colorValue)) &&
        Number.isFinite(opacityValue) &&
        opacityValue >= 0 &&
        opacityValue <= 1 &&
        !parseResult.error &&
        !isSaving;

    const handleFileSelect = (file: File | null) => {
        if (!file) {
            return;
        }
        const path = window.api.getPathForFile(file);
        if (path) {
            setImagePath(path);
            setLocalError(null);
            if (!displayName.trim()) {
                setDisplayName(file.name.replace(/\.[^.]+$/, ""));
            }
        }
    };

    const applyBackgroundToCurrentTab = async (bgKey: string | null, backgrounds = parseResult.backgrounds) => {
        await model.env.rpc.SetMetaCommand(TabRpcClient, {
            oref: makeORef("tab", model.tabModel.tabId),
            meta: { "bg:*": true, "tab:background": bgKey },
        });
        recordTEvent("action:settabtheme");
        setStatusMessage(
            bgKey
                ? t("Applied background to current tab: {name}", {
                      name: getBackgroundDisplayName(bgKey, backgrounds),
                  })
                : t("Restored current tab to default background.")
        );
    };

    const handleAdd = async () => {
        if (!canAdd) {
            setLocalError(t("Choose a background and enter a valid opacity from 0 to 1."));
            return;
        }
        const nextBackgrounds = { ...parseResult.backgrounds };
        const key = makeCustomKey(displayName, nextBackgrounds);
        const maxOrder = Math.max(100, ...Object.values(nextBackgrounds).map((bg) => bg?.["display:order"] ?? 0));
        const bgValue =
            backgroundSource === "image" ? makeImageBackgroundValue(imagePath.trim()) : colorValue.trim().toLowerCase();
        nextBackgrounds[key] = {
            "display:name": displayName.trim(),
            "display:order": maxOrder + 1,
            bg: bgValue,
            "bg:opacity": opacityValue,
        };
        setLocalError(null);
        await saveBackgrounds(model, nextBackgrounds);
        await applyBackgroundToCurrentTab(key, nextBackgrounds);
    };

    const handleDelete = async (key: string) => {
        if (!window.confirm(t("Delete this custom background?"))) {
            return;
        }
        const nextBackgrounds = { ...parseResult.backgrounds };
        nextBackgrounds[key] = null;
        await saveBackgrounds(model, nextBackgrounds);
        if (currentBgKey === key) {
            await applyBackgroundToCurrentTab(null);
        }
    };

    const previewBg =
        backgroundSource === "image"
            ? imagePath.trim()
                ? makeImageBackgroundValue(imagePath)
                : null
            : isValidHexColor(colorValue)
              ? colorValue
              : null;
    const previewStyle = previewBg
        ? computeBgStyleFromMeta({
              bg: previewBg,
              "bg:opacity": Number.isFinite(opacityValue) ? opacityValue : 0.55,
          })
        : undefined;

    return (
        <div className="h-full overflow-auto bg-background">
            <div className="mx-auto flex max-w-5xl flex-col gap-6 p-5">
                <section className="flex flex-col gap-4 border-b border-border pb-5">
                    <div>
                        <div className="text-base font-semibold">{t("Add Custom Background")}</div>
                        <div className="mt-1 text-sm text-muted">
                            {t("Choose a local image or color, then save and apply it to the current tab.")}
                        </div>
                    </div>

                    <div className="grid gap-4 @w800:grid-cols-[1fr_220px]">
                        <div className="flex flex-col gap-3">
                            <div className="flex w-fit rounded border border-border p-0.5 text-sm">
                                <button
                                    type="button"
                                    onClick={() => setBackgroundSource("image")}
                                    className={`rounded px-3 py-1.5 ${
                                        backgroundSource === "image" ? "bg-accent text-primary" : "hover:bg-hover"
                                    }`}
                                >
                                    {t("Image")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBackgroundSource("color")}
                                    className={`rounded px-3 py-1.5 ${
                                        backgroundSource === "color" ? "bg-accent text-primary" : "hover:bg-hover"
                                    }`}
                                >
                                    {t("Color")}
                                </button>
                            </div>

                            <label className="flex flex-col gap-1 text-sm">
                                <span className="text-muted">{t("Background Name")}</span>
                                <input
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className={WaveConfigFieldClass}
                                />
                            </label>

                            {backgroundSource === "image" ? (
                                <label className="flex flex-col gap-1 text-sm">
                                    <span className="text-muted">{t("Image Path")}</span>
                                    <div className="flex gap-2">
                                        <input
                                            value={imagePath}
                                            onChange={(e) => setImagePath(e.target.value)}
                                            placeholder="/Users/me/Pictures/background.jpg"
                                            className={`${WaveConfigFieldClass} min-w-0 flex-1 font-mono`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="rounded border border-border px-3 py-2 text-sm hover:bg-hover"
                                        >
                                            {t("Choose Image")}
                                        </button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                                        />
                                    </div>
                                </label>
                            ) : (
                                <label className="flex flex-col gap-2 text-sm">
                                    <span className="text-muted">{t("Background Color")}</span>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="color"
                                            value={isValidHexColor(colorValue) ? colorValue : "#2563eb"}
                                            onChange={(e) => setColorValue(e.target.value)}
                                            className={`${WaveConfigColorInputClass} h-10 w-12 cursor-pointer`}
                                        />
                                        <input
                                            value={colorValue}
                                            onChange={(e) => setColorValue(e.target.value)}
                                            className={`${WaveConfigFieldClass} w-32 font-mono`}
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {DefaultBackgroundColors.map((color) => (
                                            <button
                                                key={color}
                                                type="button"
                                                aria-label={t("Use color {color}", { color })}
                                                title={color}
                                                onClick={() => setColorValue(color)}
                                                className={`h-7 w-7 rounded border ${
                                                    colorValue.toLowerCase() === color
                                                        ? "border-primary"
                                                        : "border-border hover:border-muted"
                                                }`}
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                    </div>
                                </label>
                            )}

                            <label className="flex flex-col gap-1 text-sm">
                                <span className="text-muted">{t("Opacity")}</span>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={opacity}
                                        onChange={(e) => setOpacity(e.target.value)}
                                        className="w-48"
                                    />
                                    <input
                                        value={opacity}
                                        onChange={(e) => setOpacity(e.target.value)}
                                        className={`${WaveConfigFieldClass} w-20 px-2 py-1`}
                                    />
                                </div>
                            </label>

                            {(parseResult.error || localError) && (
                                <div className="rounded border border-error bg-error/20 px-3 py-2 text-sm text-primary">
                                    {parseResult.error || localError}
                                </div>
                            )}

                            <div>
                                <button
                                    type="button"
                                    disabled={!canAdd}
                                    onClick={() => void handleAdd()}
                                    className="rounded bg-accent px-4 py-2 text-sm text-primary transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:border disabled:border-border disabled:bg-transparent disabled:text-muted"
                                >
                                    {isSaving ? t("Saving...") : t("Save and Apply to Current Tab")}
                                </button>
                            </div>
                        </div>

                        <div
                            className="h-32 rounded border border-border bg-black"
                            style={previewStyle ?? undefined}
                        />
                    </div>
                </section>

                <section className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-base font-semibold">{t("Available Backgrounds")}</div>
                            <div className="mt-1 text-sm text-muted">
                                {t("Current background: {name}", {
                                    name: getBackgroundDisplayName(currentBgKey, parseResult.backgrounds),
                                })}
                            </div>
                        </div>
                        <button
                            type="button"
                            disabled={currentBgKey == null}
                            onClick={() => void applyBackgroundToCurrentTab(null)}
                            className="rounded border border-border px-3 py-2 text-sm hover:bg-hover disabled:cursor-not-allowed disabled:text-muted"
                        >
                            {t("Use Default Background")}
                        </button>
                    </div>
                    {statusMessage && (
                        <div className="rounded border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-primary">
                            {statusMessage}
                        </div>
                    )}
                    <div className="grid gap-3 @w800:grid-cols-2">
                        {sortedEntries.map(([key, bg]) => (
                            <div key={key} className="flex gap-3 rounded border border-border bg-secondary/40 p-3">
                                <div
                                    className="h-16 w-24 shrink-0 rounded border border-border bg-black"
                                    style={computeBgStyleFromMeta(bg, 0.55) ?? undefined}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <div className="truncate font-medium">{bg["display:name"] ?? key}</div>
                                        {currentBgKey === key && (
                                            <span className="shrink-0 rounded border border-accent/50 bg-accent/20 px-1.5 py-0.5 text-xs text-primary">
                                                {t("Current")}
                                            </span>
                                        )}
                                    </div>
                                    <div className="truncate font-mono text-xs text-muted">{key}</div>
                                    <div className="mt-1 truncate font-mono text-xs text-muted">{bg.bg}</div>
                                </div>
                                <button
                                    type="button"
                                    disabled={currentBgKey === key}
                                    onClick={() => void applyBackgroundToCurrentTab(key)}
                                    className="self-start rounded border border-border px-2 py-1 text-xs hover:bg-hover disabled:cursor-default disabled:text-muted"
                                >
                                    {currentBgKey === key ? t("In Use") : t("Apply")}
                                </button>
                                {key.startsWith("bg@custom-") && (
                                    <button
                                        type="button"
                                        onClick={() => void handleDelete(key)}
                                        className="self-start rounded border border-border px-2 py-1 text-xs hover:bg-hover"
                                    >
                                        {t("Delete")}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
