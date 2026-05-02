// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package chatstore

import (
	"bufio"
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
const chatSessionsDirName = "sessions"
const defaultChatTitle = "New Chat"
const maxGeneratedTitleRunes = 60
const chatSessionArchiveVersion = 1

type ChatStore struct {
	lock            sync.Mutex
	chats           map[string]*uctypes.AIChat
	history         map[string]*WaveAIChatHistoryEntry
	uiSnapshots     map[string]*uctypes.UIChat
	historyPath     string
	sessionRootPath string
}

type WaveAIChatHistoryEntry struct {
	ChatId       string `json:"chatid"`
	Title        string `json:"title"`
	CreatedTs    int64  `json:"createdts,omitempty"`
	UpdatedTs    int64  `json:"updatedts"`
	APIType      string `json:"apitype"`
	Model        string `json:"model"`
	APIVersion   string `json:"apiversion,omitempty"`
	MessageCount int    `json:"messagecount"`
	SessionPath  string `json:"sessionpath,omitempty"`
}

type persistedChatHistory struct {
	Version     int                                `json:"version"`
	History     map[string]*WaveAIChatHistoryEntry `json:"history"`
	UISnapshots map[string]*uctypes.UIChat         `json:"uisnapshots,omitempty"`
}

type chatSessionEvent struct {
	Timestamp string `json:"timestamp"`
	Type      string `json:"type"`
	Payload   any    `json:"payload"`
}

type chatSessionRawEvent struct {
	Timestamp string          `json:"timestamp"`
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload"`
}

type chatSessionMessagePayload struct {
	ChatId     string               `json:"chatid"`
	MessageId  string               `json:"messageid"`
	Role       string               `json:"role"`
	Action     string               `json:"action"`
	APIType    string               `json:"apitype,omitempty"`
	Model      string               `json:"model,omitempty"`
	APIVersion string               `json:"apiversion,omitempty"`
	Message    uctypes.GenAIMessage `json:"message"`
}

type chatSessionSnapshotPayload struct {
	ChatId       string          `json:"chatid"`
	APIType      string          `json:"apitype,omitempty"`
	Model        string          `json:"model,omitempty"`
	APIVersion   string          `json:"apiversion,omitempty"`
	MessageCount int             `json:"messagecount"`
	Snapshot     *uctypes.UIChat `json:"snapshot"`
}

type chatSessionLifecyclePayload struct {
	ChatId      string `json:"chatid"`
	Action      string `json:"action"`
	Title       string `json:"title,omitempty"`
	MessageId   string `json:"messageid,omitempty"`
	SessionPath string `json:"sessionpath,omitempty"`
}

var DefaultChatStore = NewChatStore()

func NewChatStore() *ChatStore {
	historyPath := ""
	sessionRootPath := ""
	if dataDir := wavebase.GetWaveDataDir(); dataDir != "" {
		historyPath = filepath.Join(dataDir, chatHistoryFileName)
		sessionRootPath = filepath.Join(dataDir, chatSessionsDirName)
	}
	cs := &ChatStore{
		chats:           make(map[string]*uctypes.AIChat),
		history:         make(map[string]*WaveAIChatHistoryEntry),
		uiSnapshots:     make(map[string]*uctypes.UIChat),
		historyPath:     historyPath,
		sessionRootPath: sessionRootPath,
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

	if snapshot := cs.uiSnapshots[chatId]; snapshot != nil {
		return cloneUIChat(snapshot)
	}
	entry := cs.history[chatId]
	if entry == nil {
		return nil
	}
	snapshot := cs.loadUISnapshotFromSessionLocked(entry)
	if snapshot == nil {
		snapshot = cs.loadLegacyUISnapshot(chatId)
		if snapshot != nil {
			cs.uiSnapshots[chatId] = cloneUIChat(snapshot)
			cs.appendSessionEventLocked(entry, "response_item", chatSessionSnapshotPayload{
				ChatId:       snapshot.ChatId,
				APIType:      snapshot.APIType,
				Model:        snapshot.Model,
				APIVersion:   snapshot.APIVersion,
				MessageCount: len(snapshot.Messages),
				Snapshot:     cloneUIChat(snapshot),
			})
			cs.persistHistoryLocked()
		}
	}
	if snapshot != nil {
		cs.uiSnapshots[chatId] = cloneUIChat(snapshot)
	}
	return cloneUIChat(snapshot)
}

func (cs *ChatStore) Delete(chatId string) {
	cs.lock.Lock()
	defer cs.lock.Unlock()

	entry := cs.history[chatId]
	if entry != nil {
		cs.appendSessionEventLocked(entry, "event_msg", chatSessionLifecyclePayload{
			ChatId:      chatId,
			Action:      "delete",
			Title:       entry.Title,
			SessionPath: entry.SessionPath,
		})
	}
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
	cs.appendSessionEventLocked(entry, "event_msg", chatSessionLifecyclePayload{
		ChatId: entry.ChatId,
		Action: "rename",
		Title:  title,
	})
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
	cs.appendSessionEventLocked(entry, "event_msg", chatSessionLifecyclePayload{
		ChatId: entry.ChatId,
		Action: "rename",
		Title:  title,
	})
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
			CreatedTs: nowMillis(),
			UpdatedTs: nowMillis(),
		}
		cs.history[uiChat.ChatId] = entry
	}
	entry.APIType = uiChat.APIType
	entry.Model = uiChat.Model
	entry.APIVersion = uiChat.APIVersion
	entry.MessageCount = len(uiChat.Messages)
	if entry.CreatedTs == 0 {
		entry.CreatedTs = entry.UpdatedTs
	}
	cs.appendSessionEventLocked(entry, "response_item", chatSessionSnapshotPayload{
		ChatId:       uiChat.ChatId,
		APIType:      uiChat.APIType,
		Model:        uiChat.Model,
		APIVersion:   uiChat.APIVersion,
		MessageCount: len(uiChat.Messages),
		Snapshot:     cloneUIChat(uiChat),
	})
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
			cs.appendMessageSessionEventLocked(chat, message, "replace")
			cs.persistHistoryLocked()
			return nil
		}
	}

	// Append the new message if no duplicate found
	chat.NativeMessages = append(chat.NativeMessages, message)
	cs.updateHistoryForChatLocked(chat)
	cs.appendMessageSessionEventLocked(chat, message, "append")
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
		if entry := cs.history[chatId]; entry != nil {
			cs.appendSessionEventLocked(entry, "event_msg", chatSessionLifecyclePayload{
				ChatId:    chatId,
				Action:    "remove_message",
				MessageId: messageId,
			})
		}
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
			ChatId:    chat.ChatId,
			Title:     defaultChatTitle,
			CreatedTs: nowMillis(),
		}
		cs.history[chat.ChatId] = entry
	}
	entry.APIType = chat.APIType
	entry.Model = chat.Model
	entry.APIVersion = chat.APIVersion
	entry.MessageCount = len(chat.NativeMessages)
	entry.UpdatedTs = nowMillis()
	if entry.CreatedTs == 0 {
		entry.CreatedTs = entry.UpdatedTs
	}
	if entry.Title == "" {
		entry.Title = defaultChatTitle
	}
}

func (cs *ChatStore) appendMessageSessionEventLocked(chat *uctypes.AIChat, message uctypes.GenAIMessage, action string) {
	if chat == nil {
		return
	}
	entry := cs.history[chat.ChatId]
	cs.appendSessionEventLocked(entry, "response_item", chatSessionMessagePayload{
		ChatId:     chat.ChatId,
		MessageId:  message.GetMessageId(),
		Role:       message.GetRole(),
		Action:     action,
		APIType:    chat.APIType,
		Model:      chat.Model,
		APIVersion: chat.APIVersion,
		Message:    message,
	})
}

func (cs *ChatStore) appendSessionEventLocked(entry *WaveAIChatHistoryEntry, eventType string, payload any) {
	if entry == nil || cs.sessionRootPath == "" {
		return
	}
	now := time.Now()
	path, isNew := cs.ensureSessionPathLocked(entry, now)
	if path == "" {
		return
	}
	if isNew {
		cs.appendSessionEventToPath(path, chatSessionEvent{
			Timestamp: now.UTC().Format(time.RFC3339Nano),
			Type:      "session_meta",
			Payload: map[string]any{
				"archive_version": chatSessionArchiveVersion,
				"source":          "wave-ai",
				"chatid":          entry.ChatId,
				"title":           entry.Title,
				"createdts":       entry.CreatedTs,
				"sessionpath":     entry.SessionPath,
			},
		})
	}
	cs.appendSessionEventToPath(path, chatSessionEvent{
		Timestamp: now.UTC().Format(time.RFC3339Nano),
		Type:      eventType,
		Payload:   payload,
	})
}

func (cs *ChatStore) ensureSessionPathLocked(entry *WaveAIChatHistoryEntry, now time.Time) (string, bool) {
	if entry.CreatedTs == 0 {
		if entry.UpdatedTs != 0 {
			entry.CreatedTs = entry.UpdatedTs
		} else {
			entry.CreatedTs = now.UnixMilli()
		}
	}
	if entry.SessionPath == "" {
		started := time.UnixMilli(entry.CreatedTs)
		dateDir := filepath.Join(
			cs.sessionRootPath,
			started.Format("2006"),
			started.Format("01"),
			started.Format("02"),
		)
		fileName := fmt.Sprintf("waveai-%s-%s.jsonl", started.Format("2006-01-02T15-04-05"), entry.ChatId)
		entry.SessionPath = filepath.Join(dateDir, fileName)
		return entry.SessionPath, true
	}
	if _, err := os.Stat(entry.SessionPath); os.IsNotExist(err) {
		return entry.SessionPath, true
	}
	return entry.SessionPath, false
}

func (cs *ChatStore) appendSessionEventToPath(path string, event chatSessionEvent) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return
	}
	data, err := json.Marshal(event)
	if err != nil {
		return
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return
	}
	defer file.Close()
	_, _ = file.Write(append(data, '\n'))
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
}

func (cs *ChatStore) persistHistoryLocked() {
	if cs.historyPath == "" {
		return
	}
	if err := os.MkdirAll(filepath.Dir(cs.historyPath), 0700); err != nil {
		return
	}
	persisted := persistedChatHistory{
		Version: 1,
		History: cs.history,
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

func (cs *ChatStore) loadUISnapshotFromSessionLocked(entry *WaveAIChatHistoryEntry) *uctypes.UIChat {
	if entry == nil || entry.SessionPath == "" {
		return nil
	}
	file, err := os.Open(entry.SessionPath)
	if err != nil {
		return nil
	}
	defer file.Close()

	var latest *uctypes.UIChat
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 50*1024*1024)
	for scanner.Scan() {
		var event chatSessionRawEvent
		if err := json.Unmarshal(scanner.Bytes(), &event); err != nil {
			continue
		}
		if event.Type != "response_item" {
			continue
		}
		var payload chatSessionSnapshotPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil || payload.Snapshot == nil {
			continue
		}
		latest = cloneUIChat(payload.Snapshot)
	}
	return latest
}

func (cs *ChatStore) loadLegacyUISnapshot(chatId string) *uctypes.UIChat {
	if cs.historyPath == "" {
		return nil
	}
	data, err := os.ReadFile(cs.historyPath)
	if err != nil {
		return nil
	}
	var persisted persistedChatHistory
	if err := json.Unmarshal(data, &persisted); err != nil {
		return nil
	}
	return cloneUIChat(persisted.UISnapshots[chatId])
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
