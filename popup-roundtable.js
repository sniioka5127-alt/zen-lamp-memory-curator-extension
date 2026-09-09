const button = document.getElementById("openRoundtable");

button?.addEventListener("click", async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("roundtable.html") });
  window.close();
});
