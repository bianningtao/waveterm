// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { CenteredDiv } from "@/app/element/quickelems";
import { t } from "@/app/i18n";
import { globalStore } from "@/app/store/jotaiStore";
import { base64ToArrayBuffer } from "@/util/util";
import DOMPurify from "dompurify";
import { useAtomValue } from "jotai";
import * as mammoth from "mammoth";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import type { SpecializedViewProps } from "./preview";

const MaxExcelRows = 1000;
const MaxExcelColumns = 100;

type WordPreviewState = {
    html: string;
    error: string;
    loading: boolean;
};

function usePreviewRefresh(model: SpecializedViewProps["model"]) {
    useEffect(() => {
        model.refreshCallback = () => {
            globalStore.set(model.refreshVersion, (v) => v + 1);
        };
        return () => {
            model.refreshCallback = null;
        };
    }, [model]);
}

function getFileBuffer(fileData: FileData): ArrayBuffer {
    return base64ToArrayBuffer(fileData?.data64 ?? "");
}

function WordPreview({ model }: SpecializedViewProps) {
    usePreviewRefresh(model);
    const fullFile = useAtomValue(model.fullFile);
    const fileInfo = useAtomValue(model.statFile);
    const [state, setState] = useState<WordPreviewState>({ html: "", error: "", loading: true });

    useEffect(() => {
        let isCanceled = false;

        async function convertDocument() {
            setState({ html: "", error: "", loading: true });
            try {
                const result = await mammoth.convertToHtml({ arrayBuffer: getFileBuffer(fullFile) });
                if (isCanceled) {
                    return;
                }
                const sanitized = DOMPurify.sanitize(result.value, {
                    USE_PROFILES: { html: true },
                    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "link", "meta"],
                });
                setState({ html: sanitized, error: "", loading: false });
            } catch (e) {
                if (!isCanceled) {
                    setState({ html: "", error: `${e}`, loading: false });
                }
            }
        }

        convertDocument();
        return () => {
            isCanceled = true;
        };
    }, [fileInfo?.path, fullFile?.data64]);

    if (state.error) {
        return <CenteredDiv>{t("Unable to preview Word document: {error}", { error: state.error })}</CenteredDiv>;
    }
    if (state.loading) {
        return <CenteredDiv>{t("Loading Preview...")}</CenteredDiv>;
    }
    if (!state.html) {
        return <CenteredDiv>{t("Word document has no previewable content")}</CenteredDiv>;
    }
    return (
        <div className="h-full overflow-auto bg-white text-black">
            <div
                className="mx-auto min-h-full max-w-[900px] px-10 py-8 text-[14px] leading-[1.55] [&_a]:text-blue-700 [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_table]:my-4 [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-300 [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-6"
                dangerouslySetInnerHTML={{ __html: state.html }}
            />
        </div>
    );
}

function formatCellValue(value: unknown): string {
    if (value == null) {
        return "";
    }
    if (value instanceof Date) {
        return value.toLocaleString();
    }
    return String(value);
}

function ExcelPreview({ model }: SpecializedViewProps) {
    usePreviewRefresh(model);
    const fullFile = useAtomValue(model.fullFile);
    const [activeSheetName, setActiveSheetName] = useState<string>("");

    const workbookState = useMemo(() => {
        try {
            return {
                workbook: XLSX.read(getFileBuffer(fullFile), { type: "array", cellDates: true }),
                error: "",
            };
        } catch (e) {
            return {
                workbook: null,
                error: `${e}`,
            };
        }
    }, [fullFile?.data64]);

    const workbook = workbookState.workbook;
    const sheetNames = workbook?.SheetNames ?? [];
    const selectedSheetName = sheetNames.includes(activeSheetName) ? activeSheetName : sheetNames[0];

    useEffect(() => {
        if (selectedSheetName && selectedSheetName !== activeSheetName) {
            setActiveSheetName(selectedSheetName);
        }
    }, [activeSheetName, selectedSheetName]);

    const sheetRows = useMemo(() => {
        if (!workbook || !selectedSheetName) {
            return [];
        }
        const worksheet = workbook.Sheets[selectedSheetName];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", raw: false });
        return rows.slice(0, MaxExcelRows).map((row) => row.slice(0, MaxExcelColumns));
    }, [selectedSheetName, workbook]);

    if (workbookState.error) {
        return (
            <CenteredDiv>{t("Unable to preview Excel workbook: {error}", { error: workbookState.error })}</CenteredDiv>
        );
    }
    if (!workbook) {
        return <CenteredDiv>{t("Unable to preview Excel workbook")}</CenteredDiv>;
    }
    if (!selectedSheetName) {
        return <CenteredDiv>{t("Workbook has no sheets")}</CenteredDiv>;
    }

    const worksheet = workbook.Sheets[selectedSheetName];
    const range = worksheet?.["!ref"] ? XLSX.utils.decode_range(worksheet["!ref"]) : null;
    const totalRows = range ? range.e.r + 1 : sheetRows.length;
    const totalColumns = range ? range.e.c + 1 : Math.max(0, ...sheetRows.map((row) => row.length));
    const isLimited = totalRows > MaxExcelRows || totalColumns > MaxExcelColumns;

    return (
        <div className="flex h-full flex-col overflow-hidden bg-white text-black">
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 px-3 py-2">
                {sheetNames.map((sheetName) => (
                    <button
                        className={
                            sheetName === selectedSheetName
                                ? "rounded border border-gray-300 bg-gray-900 px-3 py-1 text-xs font-medium text-white"
                                : "rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                        }
                        key={sheetName}
                        onClick={() => setActiveSheetName(sheetName)}
                        type="button"
                    >
                        {sheetName}
                    </button>
                ))}
                {isLimited && (
                    <div className="ml-auto whitespace-nowrap px-2 py-1 text-xs text-gray-500">
                        {t("Showing first {rows} rows and {columns} columns", {
                            rows: Math.min(totalRows, MaxExcelRows),
                            columns: Math.min(totalColumns, MaxExcelColumns),
                        })}
                    </div>
                )}
            </div>
            <div className="flex-1 overflow-auto">
                <table className="border-collapse text-left text-xs">
                    <tbody>
                        {sheetRows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                <th className="sticky left-0 z-10 border border-gray-200 bg-gray-100 px-2 py-1 text-right font-medium text-gray-500">
                                    {rowIndex + 1}
                                </th>
                                {row.map((cell, columnIndex) => (
                                    <td
                                        className="max-w-[320px] whitespace-pre-wrap border border-gray-200 px-2 py-1 align-top"
                                        key={columnIndex}
                                    >
                                        {formatCellValue(cell)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export { ExcelPreview, WordPreview };
