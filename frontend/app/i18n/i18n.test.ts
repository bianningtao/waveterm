// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import { getI18nLocale, resolveLocale, setI18nLocale, t } from "./index";

describe("i18n", () => {
    afterEach(() => {
        setI18nLocale("en-US");
    });

    it("defaults to English source strings", () => {
        setI18nLocale("en-US");
        expect(getI18nLocale()).toBe("en-US");
        expect(t("Save")).toBe("Save");
        expect(t("Open File...")).toBe("Open File...");
    });

    it("returns Simplified Chinese translations", () => {
        setI18nLocale("zh-CN");
        expect(t("Save")).toBe("保存");
        expect(t("Open File...")).toBe("打开文件...");
    });

    it("returns Japanese translations", () => {
        setI18nLocale("ja-JP");
        expect(t("Save")).toBe("保存");
        expect(t("Open File...")).toBe("ファイルを開く...");
    });

    it("interpolates translated messages", () => {
        setI18nLocale("zh-CN");
        expect(t("Client Version {version}", { version: "0.14.5" })).toBe("客户端版本 0.14.5");
        expect(t("Open Clipboard URL ({host})", { host: "example.com" })).toBe("打开剪贴板 URL（example.com）");
    });

    it("falls back to the original key when a translation is missing", () => {
        setI18nLocale("zh-CN");
        expect(t("Untranslated UI String")).toBe("Untranslated UI String");
    });

    it("resolves supported system locales", () => {
        expect(resolveLocale("system", "zh-Hans-CN")).toBe("zh-CN");
        expect(resolveLocale(null, "ja-JP")).toBe("ja-JP");
        expect(resolveLocale("en", "zh-CN")).toBe("en-US");
        expect(resolveLocale("fr-FR", "fr-FR")).toBe("en-US");
    });
});
