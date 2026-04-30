// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { t } from "@/app/i18n";

export const TabPinnedMetaKey = "tab:pinned";
export const TabPinnedWidth = 42;

export function isPinnedTab(tabData: Tab | null | undefined): boolean {
    return tabData?.meta?.[TabPinnedMetaKey] === true;
}

export function confirmClosePinnedTab(): boolean {
    return window.confirm(t("Close pinned tab?"));
}
