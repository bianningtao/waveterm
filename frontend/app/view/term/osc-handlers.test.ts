import { describe, expect, it } from "vitest";

import { getAiAgentCommandType, isAiAgentCommand } from "./agent-command";
import { isClaudeCodeCommand } from "./osc-handlers";

describe("isClaudeCodeCommand", () => {
    it("matches direct Claude Code invocations", () => {
        expect(isClaudeCodeCommand("claude")).toBe(true);
        expect(isClaudeCodeCommand("claude --dangerously-skip-permissions")).toBe(true);
    });

    it("matches Claude Code invocations wrapped with env assignments", () => {
        expect(isClaudeCodeCommand('ANTHROPIC_API_KEY="test" claude')).toBe(true);
        expect(isClaudeCodeCommand("env FOO=bar claude --print")).toBe(true);
        expect(isClaudeCodeCommand("env -u ANTHROPIC_API_KEY FOO=bar claude --print")).toBe(true);
    });

    it("ignores other commands", () => {
        expect(isClaudeCodeCommand("claudes")).toBe(false);
        expect(isClaudeCodeCommand("echo claude")).toBe(false);
        expect(isClaudeCodeCommand("ls ~/claude")).toBe(false);
        expect(isClaudeCodeCommand("cat /logs/claude")).toBe(false);
        expect(isClaudeCodeCommand("")).toBe(false);
    });
});

describe("AI agent command detection", () => {
    it("detects supported agent command types", () => {
        expect(getAiAgentCommandType("claude")).toBe("claude");
        expect(getAiAgentCommandType("codex")).toBe("codex");
        expect(getAiAgentCommandType("gemini chat")).toBe("gemini");
        expect(getAiAgentCommandType("aider --model sonnet")).toBe("aider");
        expect(getAiAgentCommandType("opencode")).toBe("opencode");
    });

    it("matches commands wrapped with env and variable prefixes", () => {
        expect(isAiAgentCommand("env FOO=bar codex")).toBe(true);
        expect(isAiAgentCommand('GEMINI_API_KEY="test value" gemini')).toBe(true);
        expect(isAiAgentCommand("OPENAI_API_KEY='test value' aider")).toBe(true);
        expect(isAiAgentCommand("env -i OPENCODE_DISABLE_UPDATE=1 opencode")).toBe(true);
    });

    it("does not match agent names outside the executable position", () => {
        expect(isAiAgentCommand("echo claude")).toBe(false);
        expect(isAiAgentCommand("claudes")).toBe(false);
        expect(isAiAgentCommand("cat /logs/opencode")).toBe(false);
        expect(isAiAgentCommand("codexes")).toBe(false);
    });
});
