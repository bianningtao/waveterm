// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
package shellutil

import (
	"os"
	"os/exec"
	"slices"
	"testing"
)

func TestUpdateCmdEnvRemovesEmptyOverride(t *testing.T) {
	cmd := exec.Command("env")
	cmd.Env = []string{"NO_COLOR=1", "KEEP=value"}

	UpdateCmdEnv(cmd, map[string]string{"NO_COLOR": "", "COLORTERM": "truecolor"})

	if slices.Contains(cmd.Env, "NO_COLOR=1") || slices.Contains(cmd.Env, "NO_COLOR=") {
		t.Fatalf("expected NO_COLOR to be removed, got %v", cmd.Env)
	}
	if !slices.Contains(cmd.Env, "COLORTERM=truecolor") {
		t.Fatalf("expected COLORTERM to be added, got %v", cmd.Env)
	}
	if !slices.Contains(cmd.Env, "KEEP=value") {
		t.Fatalf("expected unrelated env to remain, got %v", cmd.Env)
	}
}

func TestWaveshellLocalEnvVarsClearsInheritedNoColor(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	t.Setenv("COLORTERM", "")

	env := WaveshellLocalEnvVars(DefaultTermType)

	if got := env["NO_COLOR"]; got != "" {
		t.Fatalf("expected NO_COLOR removal marker, got %q", got)
	}
	if got := env["COLORTERM"]; got != "truecolor" {
		t.Fatalf("expected COLORTERM truecolor, got %q", got)
	}
}

func TestWaveshellLocalEnvVarsDoesNotAddNoColorWhenAbsent(t *testing.T) {
	origNoColor, hadNoColor := os.LookupEnv("NO_COLOR")
	if hadNoColor {
		if err := os.Unsetenv("NO_COLOR"); err != nil {
			t.Fatal(err)
		}
		defer os.Setenv("NO_COLOR", origNoColor)
	}

	env := WaveshellLocalEnvVars(DefaultTermType)

	if _, ok := env["NO_COLOR"]; ok {
		t.Fatalf("expected NO_COLOR to be absent when parent env does not define it, got %v", env)
	}
}
