// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type AiAgentCommandType = "claude" | "codex" | "gemini" | "aider" | "opencode";

export type AiAgentCommandDefinition = {
    type: AiAgentCommandType;
    command: string;
    telemetryActionType: string;
};

export const AiAgentCommandRegistry: readonly AiAgentCommandDefinition[] = [
    { type: "claude", command: "claude", telemetryActionType: "claude" },
    { type: "codex", command: "codex", telemetryActionType: "codex" },
    { type: "gemini", command: "gemini", telemetryActionType: "gemini" },
    { type: "aider", command: "aider", telemetryActionType: "aider" },
    { type: "opencode", command: "opencode", telemetryActionType: "opencode" },
] as const;

const EnvAssignmentRegex = /^[A-Za-z_][A-Za-z0-9_]*=/u;

function shellTokens(command: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let quote: '"' | "'" | null = null;
    let escaped = false;
    for (const char of command) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }
        if (char === "\\" && quote !== "'") {
            current += char;
            escaped = true;
            continue;
        }
        if (quote != null) {
            current += char;
            if (char === quote) {
                quote = null;
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            current += char;
            continue;
        }
        if (/\s/u.test(char)) {
            if (current !== "") {
                tokens.push(current);
                current = "";
            }
            continue;
        }
        current += char;
    }
    if (current !== "") {
        tokens.push(current);
    }
    return tokens;
}

function stripQuotedToken(token: string): string {
    if (token.length < 2) {
        return token;
    }
    const quote = token[0];
    if ((quote === '"' || quote === "'") && token[token.length - 1] === quote) {
        return token.slice(1, -1);
    }
    return token;
}

function isEnvAssignment(token: string): boolean {
    return EnvAssignmentRegex.test(token);
}

function firstExecutableToken(command: string): string | null {
    const tokens = shellTokens(command.trim());
    let index = 0;
    if (tokens[index] === "env") {
        index += 1;
        while (index < tokens.length && tokens[index].startsWith("-")) {
            const option = tokens[index];
            index += 1;
            if ((option === "-u" || option === "--unset") && index < tokens.length) {
                index += 1;
            }
        }
    }
    while (index < tokens.length && isEnvAssignment(tokens[index])) {
        index += 1;
    }
    return tokens[index] ? stripQuotedToken(tokens[index]) : null;
}

export function getAiAgentCommand(command?: string | null): AiAgentCommandDefinition | null {
    if (!command) {
        return null;
    }
    const executable = firstExecutableToken(command);
    if (!executable) {
        return null;
    }
    return AiAgentCommandRegistry.find((agentCommand) => agentCommand.command === executable) ?? null;
}

export function getAiAgentCommandType(command?: string | null): AiAgentCommandType | null {
    return getAiAgentCommand(command)?.type ?? null;
}

export function isAiAgentCommand(command?: string | null): boolean {
    return getAiAgentCommand(command) != null;
}

export function isClaudeCodeCommand(command?: string | null): boolean {
    return getAiAgentCommandType(command) === "claude";
}
