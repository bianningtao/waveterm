// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { formatFileSizeError, isAcceptableFile, validateFileSize } from "@/app/aipanel/ai-utils";
import { waveAIHasFocusWithin } from "@/app/aipanel/waveai-focus-utils";
import { type WaveAIModel } from "@/app/aipanel/waveai-model";
import { t } from "@/app/i18n";
import { Tooltip } from "@/element/tooltip";
import { cn } from "@/util/util";
import { useAtom, useAtomValue } from "jotai";
import { memo, useCallback, useEffect, useRef } from "react";
import { AIModeDropdown } from "./aimode";

interface AIPanelInputProps {
    onSubmit: (e: React.FormEvent) => void;
    status: string;
    model: WaveAIModel;
}

export interface AIPanelInputRef {
    focus: () => void;
    resize: () => void;
    scrollToBottom: () => void;
}

export const AIPanelInput = memo(({ onSubmit, status, model }: AIPanelInputProps) => {
    const [input, setInput] = useAtom(model.inputAtom);
    const isFocused = useAtomValue(model.isWaveAIFocusedAtom);
    const isChatEmpty = useAtomValue(model.isChatEmptyAtom);
    const droppedFiles = useAtomValue(model.droppedFiles);
    const widgetAccess = useAtomValue(model.widgetAccessAtom);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isPanelOpen = useAtomValue(model.getPanelVisibleAtom());
    const isBusy = status === "streaming" || status === "submitted";
    const canSubmit =
        (status === "ready" || status === "error") && (input.trim().length > 0 || droppedFiles.length > 0);

    let placeholder: string;
    if (!isChatEmpty) {
        placeholder = t("Continue...");
    } else if (model.inBuilder) {
        placeholder = t("What would you like to build...");
    } else {
        placeholder = t("Ask Wave AI anything...");
    }

    const resizeTextarea = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        textarea.style.height = "auto";
        const scrollHeight = textarea.scrollHeight;
        const maxHeight = 7 * 24;
        textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }, []);

    useEffect(() => {
        const inputRefObject: React.RefObject<AIPanelInputRef> = {
            current: {
                focus: () => {
                    textareaRef.current?.focus();
                },
                resize: resizeTextarea,
                scrollToBottom: () => {
                    const textarea = textareaRef.current;
                    if (textarea) {
                        textarea.scrollTop = textarea.scrollHeight;
                    }
                },
            },
        };
        model.registerInputRef(inputRefObject);
    }, [model, resizeTextarea]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const isComposing = e.nativeEvent?.isComposing || e.keyCode == 229;
        if (e.key === "Enter" && !e.shiftKey && !isComposing) {
            e.preventDefault();
            onSubmit(e as any);
        }
    };

    const handleFocus = useCallback(() => {
        model.requestWaveAIFocus();
    }, [model]);

    const handleBlur = useCallback(
        (e: React.FocusEvent) => {
            if (e.relatedTarget === null) {
                return;
            }

            if (waveAIHasFocusWithin(e.relatedTarget)) {
                return;
            }

            model.requestNodeFocus();
        },
        [model]
    );

    useEffect(() => {
        resizeTextarea();
    }, [input, resizeTextarea]);

    useEffect(() => {
        if (isPanelOpen) {
            resizeTextarea();
        }
    }, [isPanelOpen, resizeTextarea]);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const acceptableFiles = files.filter(isAcceptableFile);

        for (const file of acceptableFiles) {
            const sizeError = validateFileSize(file);
            if (sizeError) {
                model.setError(formatFileSizeError(sizeError));
                if (e.target) {
                    e.target.value = "";
                }
                return;
            }
            await model.addFile(file);
        }

        if (acceptableFiles.length < files.length) {
            console.warn(`${files.length - acceptableFiles.length} files were rejected due to unsupported file types`);
        }

        if (e.target) {
            e.target.value = "";
        }
    };

    return (
        <div className={cn("px-2 pb-2 pt-1", isFocused ? "border-accent/50" : "border-gray-600")}>
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.md,.js,.jsx,.ts,.tsx,.go,.py,.java,.c,.cpp,.h,.hpp,.html,.css,.scss,.sass,.json,.xml,.yaml,.yml,.sh,.bat,.sql"
                onChange={handleFileChange}
                className="hidden"
            />
            <form onSubmit={onSubmit}>
                <div
                    className={cn(
                        "rounded-2xl border bg-zinc-800/90 shadow-sm transition-colors",
                        isFocused ? "border-accent/60" : "border-zinc-600/80 hover:border-zinc-500"
                    )}
                >
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        placeholder={placeholder}
                        className={cn(
                            "w-full text-white px-3 pt-3 pb-2 focus:outline-none resize-none overflow-auto bg-transparent placeholder:text-gray-500"
                        )}
                        style={{ fontSize: "13px" }}
                        rows={2}
                    />
                    <div className="flex items-center justify-between gap-2 px-2 pb-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <Tooltip content={t("Attach files")} placement="top">
                                <button
                                    type="button"
                                    onClick={handleUploadClick}
                                    className={cn(
                                        "h-7 w-7 rounded-full transition-colors flex items-center justify-center",
                                        "text-gray-300 hover:text-white hover:bg-zinc-700 cursor-pointer"
                                    )}
                                    aria-label={t("Attach files")}
                                >
                                    <i className="fa fa-paperclip text-sm"></i>
                                </button>
                            </Tooltip>
                            <AIModeDropdown compatibilityMode={!isChatEmpty} menuPlacement="top" />
                            {!model.inBuilder && (
                                <Tooltip
                                    content={t("Widget Access {state}", { state: widgetAccess ? t("ON") : t("OFF") })}
                                    placement="top"
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            model.setWidgetAccess(!widgetAccess);
                                            setTimeout(() => {
                                                model.focusInput();
                                            }, 0);
                                        }}
                                        className={cn(
                                            "hidden @xs:flex h-7 items-center gap-1.5 rounded-full border px-2 text-[11px] transition-colors cursor-pointer",
                                            widgetAccess
                                                ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/15"
                                                : "border-zinc-600 bg-zinc-800 text-gray-400 hover:bg-zinc-700 hover:text-gray-200"
                                        )}
                                    >
                                        <i className="fa fa-plug text-[10px]"></i>
                                        <span>{widgetAccess ? t("Context On") : t("Context Off")}</span>
                                    </button>
                                </Tooltip>
                            )}
                        </div>

                        {isBusy ? (
                            <Tooltip content={t("Stop Response")} placement="top">
                                <button
                                    type="button"
                                    onClick={() => model.stopResponse()}
                                    className={cn(
                                        "h-8 w-8 rounded-full transition-colors flex items-center justify-center",
                                        "bg-zinc-200 text-zinc-950 hover:bg-white cursor-pointer"
                                    )}
                                    aria-label={t("Stop Response")}
                                >
                                    <i className="fa fa-square text-xs"></i>
                                </button>
                            </Tooltip>
                        ) : (
                            <Tooltip content={t("Send message (Enter)")} placement="top">
                                <button
                                    type="submit"
                                    disabled={!canSubmit}
                                    className={cn(
                                        "h-8 w-8 rounded-full transition-colors flex items-center justify-center",
                                        canSubmit
                                            ? "bg-accent text-white hover:bg-accent/90 cursor-pointer"
                                            : "bg-zinc-700 text-gray-500 cursor-default"
                                    )}
                                    aria-label={t("Send message (Enter)")}
                                >
                                    <i className="fa fa-arrow-up text-sm"></i>
                                </button>
                            </Tooltip>
                        )}
                    </div>
                </div>
            </form>
        </div>
    );
});

AIPanelInput.displayName = "AIPanelInput";
