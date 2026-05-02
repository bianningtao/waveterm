// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { memo } from "react";
import { formatFileSize, getFileIcon } from "./ai-utils";
import type { WaveAIModel } from "./waveai-model";

interface AIDroppedFilesProps {
    model: WaveAIModel;
}

export const AIDroppedFiles = memo(({ model }: AIDroppedFilesProps) => {
    const droppedFiles = useAtomValue(model.droppedFiles);

    if (droppedFiles.length === 0) {
        return null;
    }

    return (
        <div className="px-2 pt-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
                {droppedFiles.map((file) => (
                    <div
                        key={file.id}
                        className="relative flex max-w-[180px] flex-shrink-0 items-center gap-2 rounded-xl border border-zinc-600/70 bg-zinc-800/80 py-1.5 pl-1.5 pr-7 shadow-sm group"
                    >
                        <button
                            onClick={() => model.removeFile(file.id)}
                            className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-zinc-700 hover:text-white cursor-pointer"
                            aria-label={`Remove ${file.name}`}
                        >
                            <i className="fa fa-times text-xs"></i>
                        </button>

                        {file.previewUrl ? (
                            <img
                                src={file.previewUrl}
                                alt={file.name}
                                className="h-8 w-8 flex-shrink-0 rounded-lg object-cover"
                            />
                        ) : (
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-700">
                                <i className={cn("fa text-sm text-gray-300", getFileIcon(file.name, file.type))}></i>
                            </div>
                        )}

                        <div className="min-w-0">
                            <div className="truncate text-[11px] leading-4 text-gray-100" title={file.name}>
                                {file.name}
                            </div>
                            <div className="text-[10px] leading-3 text-gray-400">{formatFileSize(file.size)}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
});

AIDroppedFiles.displayName = "AIDroppedFiles";
