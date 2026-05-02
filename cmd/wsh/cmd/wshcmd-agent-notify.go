// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmd

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/spf13/cobra"
	"github.com/wavetermdev/waveterm/pkg/baseds"
	"github.com/wavetermdev/waveterm/pkg/waveobj"
	"github.com/wavetermdev/waveterm/pkg/wps"
	"github.com/wavetermdev/waveterm/pkg/wshrpc"
	"github.com/wavetermdev/waveterm/pkg/wshrpc/wshclient"
	"github.com/wavetermdev/waveterm/pkg/wshutil"
)

const defaultAgentNotifyTitle = "Agent Notification"

var agentNotifyCmd = &cobra.Command{
	Use:     "agent-notify {waiting|running|done|error} [message]",
	Short:   "set or clear an agent status badge",
	Args:    validateAgentNotifyArgs,
	RunE:    agentNotifyRun,
	PreRunE: preRunSetupRpcClient,
}

var (
	agentNotifyClear  bool
	agentNotifyNotify bool
	agentNotifyTitle  string
	agentNotifySilent bool
)

type agentNotifyBadgeSpec struct {
	icon     string
	color    string
	priority float64
	message  string
}

var agentNotifyBadgeSpecs = map[string]agentNotifyBadgeSpec{
	"running": {
		icon:     "spinner+spin",
		color:    "#38bdf8",
		priority: 2,
		message:  "Agent running",
	},
	"waiting": {
		icon:     "bell",
		color:    "#f59e0b",
		priority: 3,
		message:  "Agent waiting",
	},
	"done": {
		icon:     "circle-check",
		color:    "#22c55e",
		priority: 1,
		message:  "Agent done",
	},
	"error": {
		icon:     "triangle-exclamation",
		color:    "#ef4444",
		priority: 4,
		message:  "Agent error",
	},
}

func init() {
	rootCmd.AddCommand(agentNotifyCmd)
	agentNotifyCmd.Flags().BoolVar(&agentNotifyClear, "clear", false, "clear the current block or tab badge")
	agentNotifyCmd.Flags().BoolVar(&agentNotifyNotify, "notify", false, "also send a system notification")
	agentNotifyCmd.Flags().StringVar(&agentNotifyTitle, "title", defaultAgentNotifyTitle, "system notification title")
	agentNotifyCmd.Flags().BoolVar(&agentNotifySilent, "silent", false, "send the system notification silently")
}

func validateAgentNotifyArgs(cmd *cobra.Command, args []string) error {
	if agentNotifyClear {
		if len(args) > 0 {
			return fmt.Errorf("--clear cannot be combined with a status")
		}
		return nil
	}
	if len(args) == 0 {
		return fmt.Errorf("status is required: waiting, running, done, or error")
	}
	if _, ok := agentNotifyBadgeSpecs[args[0]]; !ok {
		return fmt.Errorf("invalid status %q: expected waiting, running, done, or error", args[0])
	}
	return nil
}

func agentNotifyRun(cmd *cobra.Command, args []string) (rtnErr error) {
	defer func() {
		sendActivity("agent-notify", rtnErr == nil)
	}()

	oref, err := resolveBlockArg()
	if err != nil {
		return fmt.Errorf("resolving block: %w", err)
	}
	if oref.OType != waveobj.OType_Block && oref.OType != waveobj.OType_Tab {
		return fmt.Errorf("agent-notify oref must be a block or tab (got %q)", oref.OType)
	}

	if agentNotifyClear {
		err = publishAgentNotifyBadgeEvent(oref, baseds.BadgeEvent{
			ORef:  oref.String(),
			Clear: true,
		})
		if err != nil {
			return err
		}
		fmt.Printf("agent notification cleared\n")
		return nil
	}

	status := args[0]
	spec := agentNotifyBadgeSpecs[status]
	message := spec.message
	if len(args) > 1 {
		message = strings.Join(args[1:], " ")
	}

	badgeId, err := uuid.NewV7()
	if err != nil {
		return fmt.Errorf("generating badge id: %w", err)
	}
	err = publishAgentNotifyBadgeEvent(oref, baseds.BadgeEvent{
		ORef: oref.String(),
		Badge: &baseds.Badge{
			BadgeId:  badgeId.String(),
			Icon:     spec.icon,
			Color:    spec.color,
			Priority: spec.priority,
		},
	})
	if err != nil {
		return err
	}

	shouldNotify := agentNotifyNotify || cmd.Flags().Changed("title") || cmd.Flags().Changed("silent")
	if shouldNotify {
		err = wshclient.NotifyCommand(RpcClient, wshrpc.WaveNotificationOptions{
			Title:  agentNotifyTitle,
			Body:   message,
			Silent: agentNotifySilent,
		}, &wshrpc.RpcOpts{Timeout: 2000, Route: wshutil.ElectronRoute})
		if err != nil {
			return fmt.Errorf("sending notification: %w", err)
		}
	}

	fmt.Printf("agent notification set: %s\n", status)
	return nil
}

func publishAgentNotifyBadgeEvent(oref *waveobj.ORef, eventData baseds.BadgeEvent) error {
	event := wps.WaveEvent{
		Event:  wps.Event_Badge,
		Scopes: []string{oref.String()},
		Data:   eventData,
	}
	err := wshclient.EventPublishCommand(RpcClient, event, &wshrpc.RpcOpts{NoResponse: true})
	if err != nil {
		return fmt.Errorf("publishing badge event: %w", err)
	}
	return nil
}
