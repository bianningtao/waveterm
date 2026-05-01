// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package gitstatus

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type FileStatus struct {
	Path           string
	OriginalPath   string
	IndexStatus    string
	WorkTreeStatus string
	Kind           string
}

type StatusResult struct {
	Root   string
	Branch string
	Files  []FileStatus
}

var ErrNotGitRepository = errors.New("not a git repository")

func classify(indexStatus string, workTreeStatus string) string {
	switch {
	case indexStatus == "?" && workTreeStatus == "?":
		return "untracked"
	case indexStatus == "R" || workTreeStatus == "R":
		return "renamed"
	case indexStatus == "A" || workTreeStatus == "A":
		return "added"
	case indexStatus == "D" || workTreeStatus == "D":
		return "deleted"
	default:
		return "modified"
	}
}

func ParsePorcelainStatus(output string) []FileStatus {
	var files []FileStatus
	for _, line := range strings.Split(output, "\n") {
		if strings.TrimSpace(line) == "" || len(line) < 4 {
			continue
		}
		indexStatus := line[0:1]
		workTreeStatus := line[1:2]
		path := strings.TrimSpace(line[3:])
		originalPath := ""
		if indexStatus == "R" || workTreeStatus == "R" {
			parts := strings.Split(path, " -> ")
			if len(parts) == 2 {
				originalPath = parts[0]
				path = parts[1]
			}
		}
		files = append(files, FileStatus{
			Path:           path,
			OriginalPath:   originalPath,
			IndexStatus:    indexStatus,
			WorkTreeStatus: workTreeStatus,
			Kind:           classify(indexStatus, workTreeStatus),
		})
	}
	return files
}

func runGit(ctx context.Context, cwd string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", GitBaseArgs(cwd, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git %s failed: %s", strings.Join(args, " "), strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}

func GitBaseArgs(cwd string, args ...string) []string {
	cwd = NormalizeCwd(cwd)
	fullArgs := []string{"-c", "core.quotepath=false", "-C", cwd}
	return append(fullArgs, args...)
}

func NormalizeCwd(cwd string) string {
	cwd = strings.TrimSpace(cwd)
	if cwd == "" || cwd == "~" {
		home, err := os.UserHomeDir()
		if err == nil && home != "" {
			return home
		}
		return "."
	}
	if strings.HasPrefix(cwd, "~/") {
		home, err := os.UserHomeDir()
		if err == nil && home != "" {
			return filepath.Join(home, strings.TrimPrefix(cwd, "~/"))
		}
	}
	return cwd
}

func Status(ctx context.Context, cwd string) (*StatusResult, error) {
	root, err := runGit(ctx, cwd, "rev-parse", "--show-toplevel")
	if err != nil {
		return nil, ErrNotGitRepository
	}
	branch, err := runGit(ctx, root, "branch", "--show-current")
	if err != nil || branch == "" {
		branch, _ = runGit(ctx, root, "rev-parse", "--short", "HEAD")
	}
	statusOut, err := runGit(ctx, root, "status", "--porcelain=v1")
	if err != nil {
		return nil, err
	}
	return &StatusResult{
		Root:   root,
		Branch: branch,
		Files:  ParsePorcelainStatus(statusOut),
	}, nil
}

func DiffArgs(root string, path string, tracked bool) []string {
	args := GitBaseArgs(root, "diff", "--no-ext-diff", "--no-color")
	if tracked {
		return append(args, "--", path)
	}
	return append(args, "--no-index", "--", "/dev/null", path)
}

func Diff(ctx context.Context, root string, path string, tracked bool) (string, error) {
	args := DiffArgs(root, path, tracked)
	cmd := exec.CommandContext(ctx, "git", args...)
	out, err := cmd.CombinedOutput()
	// `git diff --no-index` returns 1 when differences exist.
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); !ok || exitErr.ExitCode() > 1 {
			return "", fmt.Errorf("git diff failed: %s", strings.TrimSpace(string(out)))
		}
	}
	return string(out), nil
}

func AddAllArgs(root string) []string {
	return GitBaseArgs(root, "add", "-A")
}

func CommitArgs(root string, message string) []string {
	return GitBaseArgs(root, "commit", "-m", message)
}

func CommitAll(ctx context.Context, root string, message string) (string, error) {
	message = strings.TrimSpace(message)
	if message == "" {
		return "", fmt.Errorf("commit message is required")
	}
	addCmd := exec.CommandContext(ctx, "git", AddAllArgs(root)...)
	if out, err := addCmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("git add failed: %s", strings.TrimSpace(string(out)))
	}
	commitCmd := exec.CommandContext(ctx, "git", CommitArgs(root, message)...)
	out, err := commitCmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git commit failed: %s", strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}
