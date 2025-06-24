chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed.');

  // Open the side panel on action click
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
});