chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({
    enabled: true
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if ((message.type === "PROMPT_SAVE_PASSWORD" || message.type === "PROMPT_SAVE_NOTE" || message.type === "OPEN_SIDE_PANEL") && sender.tab) {
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(console.error);
  }
});
