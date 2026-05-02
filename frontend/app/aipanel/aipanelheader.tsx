// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { handleWaveAIContextMenu } from "@/app/aipanel/aipanel-contextmenu";
import { t } from "@/app/i18n";
import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { memo } from "react";
import { WaveAIModel } from "./waveai-model";

export const AIPanelHeader = memo(() => {
    const model = WaveAIModel.getInstance();
    const widgetAccess = useAtomValue(model.widgetAccessAtom);
    const inBuilder = model.inBuilder;

    const handleKebabClick = (e: React.MouseEvent) => {
        handleWaveAIContextMenu(e, false);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        handleWaveAIContextMenu(e, false);
    };

    const handleNewChatClick = () => {
        model.clearChat();
        setTimeout(() => {
            model.focusInput();
        }, 0);
    };

    return (
        <div
            className="py-2 pl-3 pr-1 @xs:p-2 @xs:pl-4 border-b border-gray-700/80 flex items-center justify-between min-w-0"
            onContextMenu={handleContextMenu}
        >
            <div className="flex min-w-0 items-center gap-2">
                <h2 className="text-white text-sm @xs:text-lg font-semibold flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
                    <i className="fa fa-sparkles text-accent"></i>
                    Wave AI
                </h2>
                {!inBuilder && (
                    <span
                        className={cn(
                            "hidden @xs:inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                            widgetAccess
                                ? "border-accent/30 bg-accent/10 text-accent"
                                : "border-zinc-600 bg-zinc-800 text-gray-400"
                        )}
                        title={t("Widget Access {state}", { state: widgetAccess ? t("ON") : t("OFF") })}
                    >
                        <i className="fa fa-plug text-[10px]"></i>
                        {widgetAccess ? t("Context On") : t("Context Off")}
                    </span>
                )}
            </div>

            <div className="flex items-center flex-shrink-0 whitespace-nowrap">
                {!inBuilder && (
                    <div className="flex items-center text-sm whitespace-nowrap @xs:hidden">
                        <span className="text-gray-300 mr-1 text-[12px]">{t("Context")}</span>
                        <button
                            onClick={() => {
                                model.setWidgetAccess(!widgetAccess);
                                setTimeout(() => {
                                    model.focusInput();
                                }, 0);
                            }}
                            className={`relative inline-flex h-6 w-14 items-center rounded-full transition-colors cursor-pointer ${
                                widgetAccess ? "bg-accent-600" : "bg-zinc-600"
                            }`}
                            title={t("Widget Access {state}", { state: widgetAccess ? t("ON") : t("OFF") })}
                        >
                            <span
                                className={`absolute inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    widgetAccess ? "translate-x-8" : "translate-x-1"
                                }`}
                            />
                            <span
                                className={`relative z-10 text-xs text-white transition-all ${
                                    widgetAccess ? "ml-2.5 mr-6 text-left" : "ml-6 mr-1 text-right"
                                }`}
                            >
                                {widgetAccess ? t("ON") : t("OFF")}
                            </span>
                        </button>
                    </div>
                )}

                <button
                    onClick={handleNewChatClick}
                    className="text-gray-400 hover:text-white cursor-pointer transition-colors p-1 rounded flex-shrink-0 ml-2 focus:outline-none"
                    title={t("New Chat")}
                    aria-label={t("New Chat")}
                >
                    <i className="fa fa-solid fa-plus"></i>
                </button>

                <button
                    onClick={() => model.openChatHistory()}
                    className="text-gray-400 hover:text-white cursor-pointer transition-colors p-1 rounded flex-shrink-0 ml-2 focus:outline-none"
                    title={t("Chat History")}
                >
                    <i className="fa fa-clock-rotate-left"></i>
                </button>

                <button
                    onClick={handleKebabClick}
                    className="text-gray-400 hover:text-white cursor-pointer transition-colors p-1 rounded flex-shrink-0 ml-2 focus:outline-none"
                    title={t("More options")}
                >
                    <i className="fa fa-ellipsis-vertical"></i>
                </button>
            </div>
        </div>
    );
});

AIPanelHeader.displayName = "AIPanelHeader";
