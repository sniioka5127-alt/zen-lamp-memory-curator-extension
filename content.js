chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "GET_SELECTION") {
    const selection = window.getSelection ? String(window.getSelection()) : "";
    sendResponse({ text: selection || "" });
    return true;
  }
  if (message && message.type === "GET_PAGE_TEXT") {
    sendResponse({ text: document.body ? document.body.innerText : "" });
    return true;
  }
});
