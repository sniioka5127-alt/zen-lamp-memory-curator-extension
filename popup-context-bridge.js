const button = document.getElementById("openContextBridge");

button?.addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("context-bridge.html") });
  window.close();
});
