// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package gitstatus

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestParsePorcelainStatus(t *testing.T) {
	files := ParsePorcelainStatus(" M frontend/app.tsx\nA  README.md\n D old.txt\n?? story.md\nR  old-name.ts -> new-name.ts\n")

	expected := []FileStatus{
		{Path: "frontend/app.tsx", IndexStatus: " ", WorkTreeStatus: "M", Kind: "modified"},
		{Path: "README.md", IndexStatus: "A", WorkTreeStatus: " ", Kind: "added"},
		{Path: "old.txt", IndexStatus: " ", WorkTreeStatus: "D", Kind: "deleted"},
		{Path: "story.md", IndexStatus: "?", WorkTreeStatus: "?", Kind: "untracked"},
		{Path: "new-name.ts", OriginalPath: "old-name.ts", IndexStatus: "R", WorkTreeStatus: " ", Kind: "renamed"},
	}
	if len(files) != len(expected) {
		t.Fatalf("expected %d files, got %d: %#v", len(expected), len(files), files)
	}
	for i := range expected {
		if files[i] != expected[i] {
			t.Fatalf("file %d mismatch\nexpected: %#v\nactual:   %#v", i, expected[i], files[i])
		}
	}
}

func TestDiffArgs(t *testing.T) {
	args := DiffArgs("/tmp/repo", "story.md", true)
	expected := []string{"-c", "core.quotepath=false", "-C", "/tmp/repo", "diff", "--no-ext-diff", "--no-color", "--", "story.md"}
	if len(args) != len(expected) {
		t.Fatalf("expected %d args, got %d: %#v", len(expected), len(args), args)
	}
	for i := range expected {
		if args[i] != expected[i] {
			t.Fatalf("arg %d: expected %q, got %q", i, expected[i], args[i])
		}
	}

	untrackedArgs := DiffArgs("/tmp/repo", "story.md", false)
	expectedUntracked := []string{"-c", "core.quotepath=false", "-C", "/tmp/repo", "diff", "--no-ext-diff", "--no-color", "--no-index", "--", "/dev/null", "story.md"}
	if len(untrackedArgs) != len(expectedUntracked) {
		t.Fatalf("expected %d untracked args, got %d: %#v", len(expectedUntracked), len(untrackedArgs), untrackedArgs)
	}
	for i := range expectedUntracked {
		if untrackedArgs[i] != expectedUntracked[i] {
			t.Fatalf("untracked arg %d: expected %q, got %q", i, expectedUntracked[i], untrackedArgs[i])
		}
	}
}

func TestGitBaseArgsDisableQuotedPaths(t *testing.T) {
	args := GitBaseArgs("/tmp/repo", "status", "--porcelain=v1")
	expected := []string{"-c", "core.quotepath=false", "-C", "/tmp/repo", "status", "--porcelain=v1"}
	if len(args) != len(expected) {
		t.Fatalf("expected %d args, got %d: %#v", len(expected), len(args), args)
	}
	for i := range expected {
		if args[i] != expected[i] {
			t.Fatalf("arg %d: expected %q, got %q", i, expected[i], args[i])
		}
	}
}

func TestStatusAndDiffKeepUnicodePaths(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not available")
	}
	ctx := context.Background()
	root := t.TempDir()
	if out, err := exec.CommandContext(ctx, "git", "-C", root, "init").CombinedOutput(); err != nil {
		t.Fatalf("git init failed: %s", string(out))
	}
	fileName := "中文文件.txt"
	fileContent := "第一行\n第二行\n"
	if err := os.WriteFile(filepath.Join(root, fileName), []byte(fileContent), 0o644); err != nil {
		t.Fatalf("write unicode file: %v", err)
	}

	status, err := Status(ctx, root)
	if err != nil {
		t.Fatalf("status failed: %v", err)
	}
	if len(status.Files) != 1 {
		t.Fatalf("expected one changed file, got %#v", status.Files)
	}
	if status.Files[0].Path != fileName {
		t.Fatalf("expected unicode path %q, got %q", fileName, status.Files[0].Path)
	}

	diff, err := Diff(ctx, root, fileName, false)
	if err != nil {
		t.Fatalf("diff failed: %v", err)
	}
	if !strings.Contains(diff, fileName) || !strings.Contains(diff, "第一行") {
		t.Fatalf("diff did not preserve unicode path/content:\n%s", diff)
	}
}

func TestCommitArgs(t *testing.T) {
	addArgs := AddAllArgs("/tmp/repo")
	expectedAdd := []string{"-c", "core.quotepath=false", "-C", "/tmp/repo", "add", "-A"}
	if len(addArgs) != len(expectedAdd) {
		t.Fatalf("expected %d add args, got %d: %#v", len(expectedAdd), len(addArgs), addArgs)
	}
	for i := range expectedAdd {
		if addArgs[i] != expectedAdd[i] {
			t.Fatalf("add arg %d: expected %q, got %q", i, expectedAdd[i], addArgs[i])
		}
	}

	commitArgs := CommitArgs("/tmp/repo", "save ai changes")
	expectedCommit := []string{"-c", "core.quotepath=false", "-C", "/tmp/repo", "commit", "-m", "save ai changes"}
	if len(commitArgs) != len(expectedCommit) {
		t.Fatalf("expected %d commit args, got %d: %#v", len(expectedCommit), len(commitArgs), commitArgs)
	}
	for i := range expectedCommit {
		if commitArgs[i] != expectedCommit[i] {
			t.Fatalf("commit arg %d: expected %q, got %q", i, expectedCommit[i], commitArgs[i])
		}
	}
}
