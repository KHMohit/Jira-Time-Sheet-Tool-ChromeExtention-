// background.js

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if the page is fully loaded and is a Jira ticket page
  if (changeInfo.status === 'complete' && tab.url?.includes('atlassian.net/browse/')) {
    // Inject content script
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }).catch(err => console.error('Failed to inject content script:', err));
  }
});

// Listen for extension installation or update
chrome.runtime.onInstalled.addListener(() => {
  // Clear any existing data
  chrome.storage.session.clear();
}); 