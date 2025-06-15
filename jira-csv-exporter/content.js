// content.js

console.log('Jira CSV Exporter: Content script loaded');

class JiraDataExtractorError extends Error {
  constructor(message, elementSelector = '') {
    super(message);
    this.name = 'JiraDataExtractorError';
    this.elementSelector = elementSelector;
  }
}

function extractJiraData() {
  // Helper to get text by selector or return empty string with error handling
  const getText = (selector, isRequired = false) => {
    try {
      const el = document.querySelector(selector);
      if (!el && isRequired) {
        throw new JiraDataExtractorError(`Element not found with selector: ${selector}`, selector);
      }
      return el ? el.textContent.trim() : '';
    } catch (error) {
      console.error(`Error getting text for selector ${selector}:`, error);
      if (isRequired) throw error;
      return '';
    }
  };

  // 1. TFS/JIRA ID (e.g., PGAIROPS-18158)
  let jiraId = '';
  try {
    // Try multiple selectors to find the Jira ID
    const jiraIdSelectors = [
      '[data-testid="issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container"]',
      '[data-test-id="issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container"]',
      'a[data-testid="issue.views.issue-base.foundation.breadcrumbs.current-issue.item"]',
      '.issue-header-key'
    ];
    
    for (const selector of jiraIdSelectors) {
      jiraId = getText(selector);
      if (jiraId) break;
    }
    
    // Fallback to title extraction
    if (!jiraId) {
      const titleMatch = document.title.match(/([A-Z]+-\d+)/);
      if (titleMatch) jiraId = titleMatch[1];
    }
    
    if (!jiraId) {
      console.warn('Could not extract Jira ID');
    }
  } catch (error) {
    console.error('Error extracting Jira ID:', error);
  }

  // 2. Project Name (from breadcrumbs or other locations)
  let projectName = '';
  try {
    const projectSelectors = [
      'a[data-testid="issue.views.issue-base.foundation.breadcrumbs.project-container"]',
      'a[data-testid="breadcrumbs__item--parent"]',
      'nav[aria-label="Breadcrumbs"] a:first-child',
      '.project-name',
      '#project-name-val'
    ];
    
    for (const selector of projectSelectors) {
      projectName = getText(selector);
      if (projectName) break;
    }
    
    // Clean up project name if it contains the Jira ID
    if (jiraId && projectName.includes(jiraId)) {
      projectName = projectName.replace(jiraId, '').trim();
    }
  } catch (error) {
    console.error('Error extracting project name:', error);
  }

  // 3. BotName (from heading, after '|')
  let botName = '';
  const heading = getText('[data-testid="issue.views.issue-base.foundation.summary.heading"]') || document.querySelector('h1')?.textContent || '';
  if (heading.includes('|')) {
    botName = heading.split('|')[1].split('-')[0].trim();
  }

  // 4. Customer Name (from right panel)
  function getCustomerNameFallback() {
    // Find all divs
    const divs = document.querySelectorAll('div');
    for (let div of divs) {
      if (div.textContent.trim() === "Customer Name") {
        // Try to get the next sibling div
        let next = div.nextElementSibling;
        if (next && next.tagName === "DIV") {
          return next.textContent.trim();
        }
      }
    }
    return '';
  }
  const customerName = getText('div[data-testid="issue.views.field.customer-name"]') || getCustomerNameFallback() || '';

  // 5. Time Tracking (Efforts in Hrs/Min)
  let timeTracking = '';
  const timeTrackingLabel = Array.from(document.querySelectorAll('div')).find(div => div.textContent.includes('logged'));
  if (timeTrackingLabel) timeTracking = timeTrackingLabel.textContent;
  
  // Parse timeTracking (e.g., '1d 30m logged')
  let effortsHrs = 0, effortsMin = 0;
  if (timeTracking) {
    const dayMatch = timeTracking.match(/(\d+)d/);
    const hrMatch = timeTracking.match(/(\d+)h/);
    const minMatch = timeTracking.match(/(\d+)m/);
    effortsHrs = (dayMatch ? parseInt(dayMatch[1]) * 8 : 0) + (hrMatch ? parseInt(hrMatch[1]) : 0) + (minMatch ? parseInt(minMatch[1]) / 60 : 0);
    effortsMin = Math.round(effortsHrs * 60);
    effortsHrs = +effortsHrs.toFixed(2);
  }

  // 6. Dates (Created, Resolved, Updated)
  let createdDate = '', resolvedDate = '', updatedDate = '';
  const dateDivs = Array.from(document.querySelectorAll('div')).filter(div => div.textContent.match(/Created|Resolved|Updated/));
  dateDivs.forEach(div => {
    if (div.textContent.includes('Created')) createdDate = div.textContent;
    if (div.textContent.includes('Resolved')) resolvedDate = div.textContent;
    if (div.textContent.includes('Updated')) updatedDate = div.textContent;
  });
  // Parse dates
  function parseDate(str) {
    // e.g., 'Created April 28, 2025 at 3:58 PM'
    const match = str.match(/(\w+ \d{1,2}, \d{4})/);
    if (!match) return '';
    const date = new Date(match[1]);
    if (isNaN(date)) return '';
    // Format: DD-MMM-YY
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    const year = String(date.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  }
  const creationDate = parseDate(createdDate);
  // Completion date: prefer Resolved, fallback to Updated
  let completionDateRaw = resolvedDate || updatedDate;
  const completionDate = parseDate(completionDateRaw);
  // Month of Creation: MMM-YY
  let monthOfCreation = '';
  if (creationDate) {
    const [_, m, y] = creationDate.match(/\d{2}-(\w+)-(\d{2})/) || [];
    if (m && y) monthOfCreation = `${m}-${y}`;
  }

  // 7. Project Start Date (same as CreationDate)
  const projectStartDate = creationDate;

  // Use customer name as project name if project name wasn't found
  const finalProjectName = projectName || customerName;

  return {
    'TFS/JIRA ID': jiraId,
    'Project Name': finalProjectName,
    'BotName': botName,
    'Month of Creation': monthOfCreation,
    'CreationDate': creationDate,
    'Project Start Date': projectStartDate,
    'Completion date': completionDate,
    'Efforts in Min.': effortsMin,
    'Efforts in Hrs': effortsHrs
  };
}

// Listen for messages from popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Jira CSV Exporter: Message received:', request);
  
  if (request.type === 'EXTRACT_JIRA_DATA') {
    try {
      console.log('Jira CSV Exporter: Extracting data...');
      const data = extractJiraData();
      console.log('Jira CSV Exporter: Data extracted successfully:', data);
      sendResponse({ success: true, data });
    } catch (error) {
      console.error('Jira CSV Exporter: Error extracting Jira data:', error);
      sendResponse({
        success: false,
        error: error.message || 'Failed to extract Jira data',
        elementSelector: error.elementSelector || ''
      });
    }
  }
  return true; // Keep the message channel open for async response
});