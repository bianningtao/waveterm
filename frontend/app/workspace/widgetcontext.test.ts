import { describe, expect, it } from "vitest";

import { makeContextAwareWidgetBlockDef } from "./widgetcontext";

describe("makeContextAwareWidgetBlockDef", () => {
    it("starts terminal widgets in the focused terminal cwd", () => {
        const widgetBlockDef: BlockDef = { meta: { view: "term", controller: "shell" } };
        const focusedMeta = { view: "term", "cmd:cwd": "/tmp/project", connection: "local" };

        expect(makeContextAwareWidgetBlockDef(widgetBlockDef, focusedMeta)).toEqual({
            meta: { view: "term", controller: "shell", "cmd:cwd": "/tmp/project", connection: "local" },
        });
    });

    it("uses the focused preview path as cwd for terminal widgets", () => {
        const widgetBlockDef: BlockDef = { meta: { view: "term", controller: "shell" } };
        const focusedMeta = { view: "preview", file: "/tmp/project" };

        expect(makeContextAwareWidgetBlockDef(widgetBlockDef, focusedMeta)).toEqual({
            meta: { view: "term", controller: "shell", "cmd:cwd": "/tmp/project" },
        });
    });

    it("uses the parent directory when the focused preview path looks like a file", () => {
        const widgetBlockDef: BlockDef = { meta: { view: "term", controller: "shell" } };
        const focusedMeta = { view: "preview", file: "/tmp/project/story.md" };

        expect(makeContextAwareWidgetBlockDef(widgetBlockDef, focusedMeta)).toEqual({
            meta: { view: "term", controller: "shell", "cmd:cwd": "/tmp/project" },
        });
    });

    it("does not change non-terminal widgets", () => {
        const widgetBlockDef: BlockDef = { meta: { view: "web", url: "https://example.com" } };
        const focusedMeta = { view: "term", "cmd:cwd": "/tmp/project" };

        expect(makeContextAwareWidgetBlockDef(widgetBlockDef, focusedMeta)).toEqual(widgetBlockDef);
    });

    it("points git changes widgets at the focused terminal cwd", () => {
        const widgetBlockDef: BlockDef = { meta: { view: "gitchanges" } };
        const focusedMeta = { view: "term", "cmd:cwd": "/tmp/project", connection: "local" };

        expect(makeContextAwareWidgetBlockDef(widgetBlockDef, focusedMeta)).toEqual({
            meta: { view: "gitchanges", "cmd:cwd": "/tmp/project", connection: "local" },
        });
    });
});
