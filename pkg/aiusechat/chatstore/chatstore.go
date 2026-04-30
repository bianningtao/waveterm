// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package chatstore

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/wavetermdev/waveterm/pkg/aiusechat/uctypes"
	"github.com/wavetermdev/waveterm/pkg/wavebase"
)

const chatHistoryFileName = "waveai-chat-history.json"
const defaultChatTitle = "New Chat"
const maxGeneratedTitleRunes = 60

type ChatStore struct {
	lock        sync.Mutex
	chats       map[string]*uctypes.AIChat
	history     map[string]*WaveAIChatHistoryEntry
	uiSnapshots map[string]*uctypes.UIChat
	historyPath string
}

type WaveAIChatHistoryEntry struct {
	ChatId       string `json:"chatid"`
	Title        string `json:"title"`
	UpdatedTs    int64  `json:"updatedts"`
	APIType      string `json:"apitype"`
	Model        string `json:"model"`
	APIVersion   string `json:"apiversion,omitempty"`
	MessageCount int    `json:"messagecount"`
}

type persistedChatHistory struct {
	Version     int                                `json:"version"`
	History     map[string]*WaveAIChatHistoryEntry `json:"history"`
	UISnapshots map[string]*uctypes.UIChat         `json:"uisnapshots,omitempty"`
}

var DefaultChatStore = NewChatStore()

func NewChatStore() *ChatStore {
	historyPath := ""
	if dataDir := wavebase.GetWaveDataDir(); dataDir != "" {
		historyPath = filepath.Join(dataDir, chatHistoryFileName)
	}
	cs := &ChatStore{
		chats:       make(map[string]*uctypes.AIChat),
		history:     make(map[string]*WaveAIChatHistoryEntry),
		uiSnapshots: make(map[string]*uctypes.UIChat),
		historyPath: historyPath,
	}
	cs.loadPersistedHistory()
	return cs
}

func (cs *ChatStore) Get(chatId string) *uctypes.AIChat {
	cs.lock.Lock()
	defer cs.lock.Unlock()

	chat := cs.chats[chatId]
	if chat == nil {
		return nil
	}

	// Copy the chat to prevent concurrent access issues
	copyChat := &uctypes.AIChat{
		ChatId:         chat.ChatId,
		APIType:        chat.APIType,
		Model:          chat.Model,
		APIVersion:     chat.APIVersion,
		NativeMessages: make([]uctypes.GenAIMessage, len(chat.NativeMessages)),
	}
	copy(copyChat.NativeMessages, chat.NativeMessages)

	return copyChat
}

func (cs *ChatStore) GetUISnapshot(chatId string) *uctypes.UIChat {
	cs.lock.Lock()
	defer cs.lock.Unlock()

	return cloneUIChat(cs.uiSnapshots[chatId])
}

func (cs *ChatStore) Delete(chatId string) {
	cs.lock.Lock()
	defer cs.lock.Unlock()

	delete(cs.chats, chatId)
	delete(cs.history, chatId)
	delete(cs.uiSnapshots, chatId)
	cs.persistHistoryLocked()
}

func (cs *ChatStore) ListChats() []WaveAIChatHistoryEntry {
	cs.lock.Lock()
	defer cs.lock.Unlock()

	rtn := make([]WaveAIChatHistoryEntry, 0, len(cs.history))
	for _, entry := range cs.history {
		if entry == nil {
			continue
		}
		rtn = append(rtn, *entry)
	}
	sort.Slice(rtn, func(i, j int) bool {
		if rtn[i].UpdatedTs == rtn[j].UpdatedTs {
			return rtn[i].ChatId < rtn[j].ChatId
		}
		return rtn[i].UpdatedTs > rtn[j].UpdatedTs
	})
	return rtn
}

func (cs *ChatStore) SetChatTitle(chatId string, title string) bool {
	cs.lock.Lock()
	defer cs.lock.Unlock()

	entry := cs.history[chatId]
	if entry == nil {
		return false
	}
	title = GenerateChatTitleFromText(title)
	if title == "" {
		title = defaultChatTitle
	}
	entry.Title = title
	entry.UpdatedTs = nowMillis()
	cs.persistHistoryLocked()
	return true
}

func (cs *ChatStore) SetChatTitleFromText(chatId string, text string) {
	title := GenerateChatTitleFromText(text)
	if title == "" {
		return
	}

	cs.lock.Lock()
	defer cs.lock.Unlock()

	entry := cs.history[chatId]
	if entry == nil {
		return
	}
	if entry.Title != "" && entry.Title != defaultChatTitle {
		return
	}
	entry.Title = title
	cs.persistHistoryLocked()
}

func (cs *ChatStore) SaveUISnapshot(uiChat *uctypes.UIChat) {
	if uiChat == nil || uiChat.ChatId == "" {
		return
	}
	cs.lock.Lock()
	defer cs.lock.Unlock()

	cs.uiSnapshots[uiChat.ChatId] = cloneUIChat(uiChat)
	entry := cs.history[uiChat.ChatId]
	if entry == nil {
		entry = &WaveAIChatHistoryEntry{
			ChatId:    uiChat.ChatId,
			Title:     defaultChatTitle,
			UpdatedTs: nowMillis(),
		}
		cs.history[uiChat.ChatId] = entry
	}
	entry.APIType = uiChat.APIType
	entry.Model = uiChat.Model
	entry.APIVersion = uiChat.APIVersion
	entry.MessageCount = len(uiChat.Messages)
	cs.persistHistoryLocked()
}

func (cs *ChatStore) CountUserMessages(chatId string) int {
	cs.lock.Lock()
	defer cs.lock.Unlock()

	chat := cs.chats[chatId]
	if chat == nil {
		return 0
	}

	count := 0
	for _, msg := range chat.NativeMessages {
		if msg.GetRole() == "user" {
			count++
		}
	}
	return count
}

func (cs *ChatStore) PostMessage(chatId string, aiOpts *uctypes.AIOptsType, message uctypes.GenAIMessage) error {
	cs.lock.Lock()
	defer cs.lock.Unlock()

	chat := cs.chats[chatId]
	if chat == nil {
		// Create new chat
		chat = &uctypes.AIChat{
			ChatId:         chatId,
			APIType:        aiOpts.APIType,
			Model:          aiOpts.Model,
			APIVersion:     aiOpts.APIVersion,
			NativeMessages: make([]uctypes.GenAIMessage, 0),
		}
		cs.chats[chatId] = chat
	} else {
		// Verify that the AI options match
		if chat.APIType != aiOpts.APIType {
			return fmt.Errorf("API type mismatch: expected %s, got %s (must start a new chat)", chat.APIType, aiOpts.APIType)
		}
		if !uctypes.AreModelsCompatible(chat.APIType, chat.Model, aiOpts.Model) {
			return fmt.Errorf("model mismatch: expected %s, got %s (must start a new chat)", chat.Model, aiOpts.Model)
		}
		if chat.APIVersion != aiOpts.APIVersion {
			return fmt.Errorf("API version mismatch: expected %s, got %s (must start a new chat)", chat.APIVersion, aiOpts.APIVersion)
		}
	}

	// Check for existing message with same ID (idempotency)
	messageId := message.GetMessageId()
	for i, existingMessage := range chat.NativeMessages {
		if existingMessage.GetMessageId() == messageId {
			// Replace existing message with same ID
			chat.NativeMessages[i] = message
			cs.updateHistoryForChatLocked(chat)
			cs.persistHistoryLocked()
			return nil
		}
	}

	// Append the new message if no duplicate found
	chat.NativeMessages = append(chat.NativeMessages, message)
	cs.updateHistoryForChatLocked(chat)
	cs.persistHistoryLocked()

	return nil
}

func (cs *ChatStore) RemoveMessage(chatId string, messageId string) bool {
	cs.lock.Lock()
	defer cs.lock.Unlock()

	chat := cs.chats[chatId]
	if chat == nil {
		return false
	}

	initialLen := len(chat.NativeMessages)
	chat.NativeMessages = slices.DeleteFunc(chat.NativeMessages, func(msg uctypes.GenAIMessage) bool {
		return msg.GetMessageId() == messageId
	})

	removed := len(chat.NativeMessages) < initialLen
	if removed {
		cs.updateHistoryForChatLocked(chat)
		cs.persistHistoryLocked()
	}
	return removed
}

func (cs *ChatStore) updateHistoryForChatLocked(chat *uctypes.AIChat) {
	if chat == nil || chat.ChatId == "" {
		return
	}
	entry := cs.history[chat.ChatId]
	if entry == nil {
		entry = &WaveAIChatHistoryEntry{
			ChatId: chat.ChatId,
			Title:  defaultChatTitle,
		}
		cs.history[chat.ChatId] = entry
	}
	entry.APIType = chat.APIType
	entry.Model = chat.Model
	entry.APIVersion = chat.APIVersion
	entry.MessageCount = len(chat.NativeMessages)
	entry.UpdatedTs = nowMillis()
	if entry.Title == "" {
		entry.Title = defaultChatTitle
	}
}

func (cs *ChatStore) loadPersistedHistory() {
	data, err := os.ReadFile(cs.historyPath)
	if err != nil {
		return
	}
	var persisted persistedChatHistory
	if err := json.Unmarshal(data, &persisted); err != nil {
		return
	}
	if persisted.History != nil {
		cs.history = persisted.History
	}
	if persisted.UISnapshots != nil {
		cs.uiSnapshots = persisted.UISnapshots
	}
}

func (cs *ChatStore) persistHistoryLocked() {
	if cs.historyPath == "" {
		return
	}
	if err := os.MkdirAll(filepath.Dir(cs.historyPath), 0700); err != nil {
		return
	}
	persisted := persistedChatHistory{
		Version:     1,
		History:     cs.history,
		UISnapshots: cs.uiSnapshots,
	}
	data, err := json.MarshalIndent(persisted, "", "  ")
	if err != nil {
		return
	}
	tmpPath := cs.historyPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0600); err != nil {
		return
	}
	_ = os.Rename(tmpPath, cs.historyPath)
}

func GenerateChatTitleFromText(text string) string {
	title := strings.Join(strings.Fields(text), " ")
	if title == "" {
		return ""
	}
	runes := []rune(title)
	if len(runes) > maxGeneratedTitleRunes {
		title = string(runes[:maxGeneratedTitleRunes]) + "..."
	}
	return title
}

func cloneUIChat(chat *uctypes.UIChat) *uctypes.UIChat {
	if chat == nil {
		return nil
	}
	copyChat := *chat
	copyChat.Messages = make([]uctypes.UIMessage, len(chat.Messages))
	for i, msg := range chat.Messages {
		copyMsg := msg
		copyMsg.Parts = make([]uctypes.UIMessagePart, len(msg.Parts))
		copy(copyMsg.Parts, msg.Parts)
		copyChat.Messages[i] = copyMsg
	}
	return &copyChat
}

func nowMillis() int64 {
	return time.Now().UnixMilli()
}
