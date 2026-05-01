import { describe, expect, it } from "vitest";

import { findTerminalFileLinks, resolveTerminalFilePath } from "./term-file-links";

describe("terminal file links", () => {
    it("detects absolute generated file paths", () => {
        const links = findTerminalFileLinks(
            "路径: /Users/bianningtao/Desktop/JOTO.nosync/阿里-瑞思迈(北京)贸易有限公司/story.md"
        );
        expect(links).toEqual([
            {
                text: "/Users/bianningtao/Desktop/JOTO.nosync/阿里-瑞思迈(北京)贸易有限公司/story.md",
                path: "/Users/bianningtao/Desktop/JOTO.nosync/阿里-瑞思迈(北京)贸易有限公司/story.md",
                startIndex: 4,
                endIndex: 68,
            },
        ]);
    });

    it("resolves relative file references against the terminal cwd", () => {
        expect(resolveTerminalFilePath("story.md", "/tmp/project")).toBe("/tmp/project/story.md");
        expect(resolveTerminalFilePath("./docs/story.md", "/tmp/project")).toBe("/tmp/project/docs/story.md");
        expect(resolveTerminalFilePath("../story.md", "/tmp/project/docs")).toBe("/tmp/project/story.md");
        expect(resolveTerminalFilePath("story.md", null)).toBeNull();
    });

    it("detects Claude Code style write output", () => {
        const links = findTerminalFileLinks("Write(story.md)\n  Wrote 49 lines to story.md", "/tmp/project");
        expect(links.map((link) => link.path)).toEqual(["/tmp/project/story.md", "/tmp/project/story.md"]);
    });

    it("ignores command names and unsupported extensions", () => {
        expect(findTerminalFileLinks("run task dev and inspect README", "/tmp/project")).toEqual([]);
    });
});
