// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { classifyDiffLine, makePreviewFilePath } from "./gitchanges";

describe("classifyDiffLine", () => {
    it("classifies diff lines for colored rendering", () => {
        expect(classifyDiffLine("diff --git a/story.md b/story.md")).toBe("header");
        expect(classifyDiffLine("@@ -1,2 +1,3 @@")).toBe("hunk");
        expect(classifyDiffLine("+new text")).toBe("added");
        expect(classifyDiffLine("-old text")).toBe("removed");
        expect(classifyDiffLine(" unchanged")).toBe("context");
    });

    it("keeps file marker lines out of added and removed buckets", () => {
        expect(classifyDiffLine("+++ b/story.md")).toBe("header");
        expect(classifyDiffLine("--- a/story.md")).toBe("header");
    });
});

describe("makePreviewFilePath", () => {
    it("joins a Git root with a relative file path", () => {
        expect(makePreviewFilePath("/tmp/project", "docs/story.md")).toBe("/tmp/project/docs/story.md");
    });

    it("preserves absolute file paths", () => {
        expect(makePreviewFilePath("/tmp/project", "/tmp/other/story.md")).toBe("/tmp/other/story.md");
    });
});
