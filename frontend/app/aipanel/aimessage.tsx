// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { WaveStreamdown } from "@/app/element/streamdown";
import { t } from "@/app/i18n";
import { cn } from "@/util/util";
import { memo, useEffect, useRef } from "react";
import { getFileIcon } from "./ai-utils";
import { AIFeedbackButtons } from "./aifeedbackbuttons";
import { AIToolUseGroup } from "./aitooluse";
import { WaveUIMessage, WaveUIMessagePart } from "./aitypes";
import { WaveAIModel } from "./waveai-model";

const AIThinking = memo(
    ({
        message = "AI is thinking...",
        reasoningText,
        isWaitingApproval = false,
    }: {
        message?: string;
        reasoningText?: string;
        isWaitingApproval?: boolean;
    }) => {
        const scrollRef = useRef<HTMLDivElement>(null);

        useEffect(() => {
            if (scrollRef.current && reasoningText) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        }, [reasoningText]);

        const displayText = reasoningText
            ? (() => {
                  const lastDoubleNewline = reasoningText.lastIndexOf("\n\n");
                  return lastDoubleNewline !== -1 ? reasoningText.substring(lastDoubleNewline + 2) : reasoningText;
              })()
            : "";

        return (
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    {isWaitingApproval ? (
                        <i className="fa fa-clock text-base text-yellow-500"></i>
                    ) : (
                        <div className="animate-pulse flex items-center">
                            <i className="fa fa-circle text-[10px]"></i>
                            <i className="fa fa-circle text-[10px] mx-1"></i>
                            <i className="fa fa-circle text-[10px]"></i>
                        </div>
                    )}
                    {message && <span className="text-sm text-gray-400">{message}</span>}
                </div>
                <div ref={scrollRef} className="text-sm text-gray-500 overflow-y-auto h-[3lh] max-w-[600px] pl-9">
                    {displayText}
                </div>
            </div>
        );
    }
);

AIThinking.displayName = "AIThinking";

interface UserMessageFilesProps {
    fileParts: Array<WaveUIMessagePart & { type: "data-userfile" }>;
}

const UserMessageFiles = memo(({ fileParts }: UserMessageFilesProps) => {
    if (fileParts.length === 0) return null;

    return (
        <div className="mt-2 border-t border-white/10 pt-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
                {fileParts.map((file, index) => (
                    <div
                        key={index}
                        className="flex min-w-0 max-w-[180px] flex-shrink-0 items-center gap-2 rounded-lg bg-white/10 p-1.5"
                    >
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-600/80">
                            {file.data?.previewurl ? (
                                <img
                                    src={file.data.previewurl}
                                    alt={file.data?.filename || "File"}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <i
                                    className={cn(
                                        "fa text-sm text-gray-300",
                                        getFileIcon(file.data?.filename || "", file.data?.mimetype || "")
                                    )}
                                ></i>
                            )}
                        </div>
                        <div className="min-w-0">
                            <div
                                className="truncate text-[11px] leading-4 text-gray-100"
                                title={file.data?.filename || t("File")}
                            >
                                {file.data?.filename || t("File")}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
});

UserMessageFiles.displayName = "UserMessageFiles";

interface AIMessagePartProps {
    part: WaveUIMessagePart;
    role: string;
    isStreaming: boolean;
}

const AIMessagePart = memo(({ part, role, isStreaming }: AIMessagePartProps) => {
    const model = WaveAIModel.getInstance();

    if (part.type === "text") {
        const content = part.text ?? "";

        if (role === "user") {
            return <div className="whitespace-pre-wrap break-words leading-5">{content}</div>;
        } else {
            return (
                <WaveStreamdown
                    text={content}
                    parseIncompleteMarkdown={isStreaming}
                    className="text-gray-100 leading-6"
                    codeBlockMaxWidthAtom={model.codeBlockMaxWidth}
                />
            );
        }
    }

    return null;
});

AIMessagePart.displayName = "AIMessagePart";

interface AIMessageProps {
    message: WaveUIMessage;
    isStreaming: boolean;
}

const isDisplayPart = (part: WaveUIMessagePart): boolean => {
    return (
        part.type === "text" ||
        part.type === "data-tooluse" ||
        part.type === "data-toolprogress" ||
        (part.type.startsWith("tool-") && "state" in part && part.state === "input-available")
    );
};

type MessagePart =
    | { type: "single"; part: WaveUIMessagePart }
    | { type: "toolgroup"; parts: Array<WaveUIMessagePart & { type: "data-tooluse" | "data-toolprogress" }> };

const groupMessageParts = (parts: WaveUIMessagePart[]): MessagePart[] => {
    const grouped: MessagePart[] = [];
    let currentToolGroup: Array<WaveUIMessagePart & { type: "data-tooluse" | "data-toolprogress" }> = [];

    for (const part of parts) {
        if (part.type === "data-tooluse" || part.type === "data-toolprogress") {
            currentToolGroup.push(part as WaveUIMessagePart & { type: "data-tooluse" | "data-toolprogress" });
        } else {
            if (currentToolGroup.length > 0) {
                grouped.push({ type: "toolgroup", parts: currentToolGroup });
                currentToolGroup = [];
            }
            grouped.push({ type: "single", part });
        }
    }

    if (currentToolGroup.length > 0) {
        grouped.push({ type: "toolgroup", parts: currentToolGroup });
    }

    return grouped;
};

const getThinkingMessage = (
    parts: WaveUIMessagePart[],
    isStreaming: boolean,
    role: string
): { message: string; reasoningText?: string; isWaitingApproval?: boolean } | null => {
    if (!isStreaming || role !== "assistant") {
        return null;
    }

    const hasPendingApprovals = parts.some(
        (part) => part.type === "data-tooluse" && part.data?.approval === "needs-approval"
    );

    if (hasPendingApprovals) {
        return { message: "Waiting for Tool Approvals...", isWaitingApproval: true };
    }

    const lastPart = parts[parts.length - 1];

    if (lastPart?.type === "reasoning") {
        const reasoningContent = lastPart.text || "";
        return { message: "AI is thinking...", reasoningText: reasoningContent };
    }

    if (lastPart?.type === "text" && lastPart.text) {
        return null;
    }

    return { message: "" };
};

export const AIMessage = memo(({ message, isStreaming }: AIMessageProps) => {
    const parts = message.parts || [];
    const displayParts = parts.filter(isDisplayPart);
    const fileParts = parts.filter(
        (part): part is WaveUIMessagePart & { type: "data-userfile" } => part.type === "data-userfile"
    );

    const thinkingData = getThinkingMessage(parts, isStreaming, message.role);
    const groupedParts = groupMessageParts(displayParts);

    return (
        <div className={cn("flex w-full", message.role === "user" ? "justify-end" : "justify-start")}>
            <div
                className={cn(
                    "[&>*:first-child]:!mt-0",
                    message.role === "user"
                        ? "max-w-[min(82%,680px)] rounded-2xl bg-zinc-700/80 px-3 py-2 text-white shadow-sm"
                        : "w-full max-w-[780px] px-1 py-1"
                )}
            >
                {displayParts.length === 0 && !isStreaming && !thinkingData ? (
                    <div className="whitespace-pre-wrap break-words text-sm text-muted">(no text content)</div>
                ) : (
                    <>
                        {groupedParts.map((group, index: number) =>
                            group.type === "toolgroup" ? (
                                <div key={index} className="mt-2">
                                    <AIToolUseGroup parts={group.parts} isStreaming={isStreaming} />
                                </div>
                            ) : (
                                <div key={index} className="mt-2">
                                    <AIMessagePart part={group.part} role={message.role} isStreaming={isStreaming} />
                                </div>
                            )
                        )}
                        {thinkingData != null && (
                            <div className="mt-2">
                                <AIThinking
                                    message={thinkingData.message}
                                    reasoningText={thinkingData.reasoningText}
                                    isWaitingApproval={thinkingData.isWaitingApproval}
                                />
                            </div>
                        )}
                    </>
                )}

                {message.role === "user" && <UserMessageFiles fileParts={fileParts} />}
                {message.role === "assistant" && !isStreaming && displayParts.length > 0 && (
                    <div className="mt-1 opacity-60 transition-opacity hover:opacity-100">
                        <AIFeedbackButtons
                            messageText={parts
                                .filter((p) => p.type === "text")
                                .map((p) => p.text || "")
                                .join("\n\n")}
                        />
                    </div>
                )}
            </div>
        </div>
    );
});

AIMessage.displayName = "AIMessage";
