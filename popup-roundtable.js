const button = document.getElementById("openRoundtable");
const workspaceProjectId = new URLSearchParams(location.search).get("project");

button?.addEventListener("click", async () => {
  const url = new URL(chrome.runtime.getURL("roundtable.html"));
  if (workspaceProjectId) url.searchParams.set("project", workspaceProjectId);
  await chrome.tabs.create({ url: url.toString() });
  window.close();
});
