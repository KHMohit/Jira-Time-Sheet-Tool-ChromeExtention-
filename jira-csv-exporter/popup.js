// popup.js

// Initialize storage and theme when popup opens
document.addEventListener('DOMContentLoaded', () => {
  loadStoredData();
  loadTheme();
});

// Load stored data from chrome.storage.session
function loadStoredData() {
  chrome.storage.session.get(['jiraTickets'], (result) => {
    const tickets = result.jiraTickets || [];
    displayData(tickets);
  });
}

// Load theme preference from chrome.storage.local
async function loadTheme() {
  const savedTheme = await chrome.storage.local.get(['theme']);
  const theme = savedTheme.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(theme);
}

// Set the current theme
function setTheme(theme) {
  const body = document.body;
  if (theme === 'dark') {
    body.classList.add('dark-mode');
    body.classList.remove('light-mode');
  } else {
    body.classList.add('light-mode');
    body.classList.remove('dark-mode');
  }
  chrome.storage.local.set({ theme });
}

// Define the fixed column order
const COLUMN_ORDER = [
  'TFS/JIRA ID',
  'Project Name',
  'BotName',
  'Month of Creation',
  'CreationDate',
  'Project Start Date',
  'Completion date',
  'Efforts in Min.',
  'Efforts in Hrs'
];

// Display data in table format or show empty state
function displayData(tickets) {
  const dataContainer = document.getElementById('dataContainer');
  const emptyState = document.getElementById('emptyState');
  const downloadBtn = document.getElementById('downloadBtn');
  const appendContainer = document.querySelector('.append-container');

  if (!tickets || tickets.length === 0) {
    dataContainer.innerHTML = ''; // Clear table content
    dataContainer.style.display = 'none';
    emptyState.style.display = 'flex'; // Show empty state
    downloadBtn.style.display = 'none';
    appendContainer.style.display = 'none';
  } else {
    let html = '<table><thead><tr>';
    // Add headers in fixed order
    COLUMN_ORDER.forEach(key => {
      html += `<th>${key}</th>`;
    });
    html += '</tr></thead><tbody>';

    // Add rows for each ticket
    tickets.forEach((ticket, index) => {
      html += `<tr class="ticket-row">`;
      COLUMN_ORDER.forEach(key => {
        const value = ticket[key] || '';
        html += `<td><input type="text" data-key="${key}" data-index="${index}" value="${value}"></td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    dataContainer.innerHTML = html;
    dataContainer.style.display = ''; // Show table
    emptyState.style.display = 'none'; // Hide empty state
    downloadBtn.style.display = ''; // Show download button
    appendContainer.style.display = ''; // Show append button container

    // Add event listeners to inputs
    document.querySelectorAll('#dataContainer input[type="text"]').forEach(input => {
      input.addEventListener('input', (e) => {
        const key = input.getAttribute('data-key');
        const index = parseInt(input.getAttribute('data-index'));
        updateStoredData(index, key, input.value);
      });
    });
  }
}

// Update stored data when input changes
function updateStoredData(index, key, value) {
  chrome.storage.session.get(['jiraTickets'], (result) => {
    const tickets = result.jiraTickets || [];
    if (tickets[index]) {
      tickets[index][key] = value;
      chrome.storage.session.set({ jiraTickets: tickets });
    } else {
      console.error(`Ticket at index ${index} not found.`);
    }
  });
}

// Extract button click handler
async function handleExtractClick() {
  try {
    // Show loading state
    const extractBtn = document.getElementById('extractBtn');
    const originalText = extractBtn.innerHTML;
    extractBtn.disabled = true;
    extractBtn.innerHTML = '<span class="material-icons rotating">refresh</span> Extracting...';
    
    // Query the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id) {
      throw new Error('Could not access the current tab');
    }
    
    // Check if we're on a Jira ticket page
    if (!tab.url.includes('atlassian.net/browse/')) {
      throw new Error('Please navigate to a Jira ticket page first');
    }

    // Try to inject content script if it's not already there
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (err) {
      console.log('Content script already injected or failed to inject:', err);
    }
    
    // Execute content script to extract data
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JIRA_DATA' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError);
          resolve({ success: false, error: 'Failed to communicate with the page. Please refresh the page and try again.' });
        } else {
          resolve(response);
        }
      });
    });
    
    if (!response) {
      throw new Error('No response from content script. Please refresh the page and try again.');
    }
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to extract data from this page');
    }
    
    // Get existing data
    const result = await chrome.storage.session.get(['jiraTickets']);
    const existingTickets = result.jiraTickets || [];
    
    // Check for duplicate ticket
    if (response.data['TFS/JIRA ID']) {
      const isDuplicate = existingTickets.some(
        ticket => ticket['TFS/JIRA ID'] === response.data['TFS/JIRA ID']
      );
      
      if (isDuplicate) {
        showMessage('This ticket has already been added', false);
        return;
      }
    }
    
    // Add new ticket
    const updatedTickets = [...existingTickets, response.data];
    await chrome.storage.session.set({ jiraTickets: updatedTickets });
    
    // Update UI
    displayData(updatedTickets);
    showMessage('Ticket added successfully!', false);
    
  } catch (error) {
    console.error('Error extracting Jira data:', error);
    showMessage(error.message || 'Failed to extract data', true);
  } finally {
    // Reset button state
    const extractBtn = document.getElementById('extractBtn');
    if (extractBtn) {
      extractBtn.disabled = false;
      extractBtn.innerHTML = '<span class="material-icons">add</span>';
    }
  }
}

// Add event listeners
document.getElementById('extractBtn').addEventListener('click', handleExtractClick);
document.getElementById('extractBtnEmpty').addEventListener('click', handleExtractClick);

// Function to highlight a row
function highlightRow(index) {
  const rows = document.querySelectorAll('.ticket-row');
  if (rows[index]) {
    rows[index].classList.add('highlight-row');
    // Remove highlight after 2 seconds
    setTimeout(() => {
      rows[index].classList.remove('highlight-row');
    }, 2000);
  }
}

// Clear button click handler
document.getElementById('clearBtn').addEventListener('click', () => {
  chrome.storage.session.remove(['jiraTickets'], () => {
    displayData([]);
  });
});

// Helper function to prepare CSV data
function prepareCSVData(tickets) {
  const CSV_EXTRA_COLUMNS = ['Assignee', 'Emp Code'];
  const CSV_EXTRA_VALUES = ['Mohit Khulbe', '4635']; // TODO: Make these configurable
  const csvHeaders = [...COLUMN_ORDER, ...CSV_EXTRA_COLUMNS].join(',');
  const rows = tickets.map(ticket =>
    [
      ...COLUMN_ORDER.map(key => {
        const value = ticket[key] || '';
        return `"${String(value).replace(/"/g, '""')}"`;
      }),
      ...CSV_EXTRA_VALUES.map(val => `"${val.replace(/"/g, '""')}"`) // Handle quotes in extra values
    ].join(',')
  );
  return { csvHeaders, rows };
}

// Helper function to show message
function showMessage(text, isError = false) {
  // Remove any existing messages first
  const existingMessages = document.querySelectorAll('.message');
  existingMessages.forEach(msg => msg.remove());
  
  const message = document.createElement('div');
  message.className = `message ${isError ? 'error' : 'success'}`;
  message.textContent = text;
  
  const container = document.querySelector('.container');
  if (container) {
    container.insertBefore(message, container.firstChild);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      message.style.opacity = '0';
      setTimeout(() => message.remove(), 300);
    }, 5000);
  }
}

// Helper function to display errors
function displayError(text) {
  showMessage(text, true);
}

// Download button click handler
document.getElementById('downloadBtn').addEventListener('click', () => {
  chrome.storage.session.get(['jiraTickets'], (result) => {
    if (!result.jiraTickets || result.jiraTickets.length === 0) {
        displayError('No data to download.');
        return;
    }

    const { csvHeaders, rows } = prepareCSVData(result.jiraTickets);
    const csv = [csvHeaders, ...rows].join('\n');

    // Download new file
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jira Data(TimeSheet).csv'; // Default filename
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showMessage('CSV file downloaded successfully!');
  });
});

// Append button click handler
document.getElementById('appendBtn').addEventListener('click', (event) => {
  const appendOptions = document.getElementById('appendOptions');
  // Toggle display and prevent event propagation
  if (appendOptions.style.display === 'flex') {
    appendOptions.style.display = 'none';
  } else {
    appendOptions.style.display = 'flex';
  }
  event.stopPropagation(); // Prevent click from immediately closing the dropdown
});

// Close append options when clicking outside
document.addEventListener('click', (e) => {
  const appendOptions = document.getElementById('appendOptions');
  const appendBtn = document.getElementById('appendBtn');
  // Check if the click is outside the button and the options
  if (appendOptions.style.display === 'flex' && !appendBtn.contains(e.target) && !appendOptions.contains(e.target)) {
    appendOptions.style.display = 'none';
  }
});

// Default append button click handler
document.getElementById('defaultAppendBtn').addEventListener('click', async () => {
  chrome.storage.session.get(['jiraTickets'], async (result) => {
    if (!result.jiraTickets || result.jiraTickets.length === 0) {
        displayError('No data to append.');
        return;
    }

    const { csvHeaders, rows } = prepareCSVData(result.jiraTickets);

    try {
      // Use showSaveFilePicker to get a handle, suggesting the default name
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: 'jira Data(TimeSheet).csv',
        types: [{
          description: 'CSV Files',
          accept: {'text/csv': ['.csv']},
        }],
      });

      // Get the file and its content
      const file = await fileHandle.getFile();
      let existingContent = '';

      // Try to read existing content, handle empty file case
      if (file.size > 0) {
         try {
            existingContent = await file.text();
         } catch (e) {
             console.error('Error reading existing file:', e);
             displayError('Could not read the selected file. Please make sure it is a valid CSV file and you have permissions.');
             return;
         }
      }

      // Create a FileSystemWritableFileStream to write to
      const writable = await fileHandle.createWritable();

      const newContent = existingContent.trim() + (existingContent.trim() ? '\n' : '') + rows.join('\n');

      await writable.write(newContent);
      await writable.close();
      showMessage('Data successfully appended to jira Data(TimeSheet).csv!');

    } catch (err) {
      console.error('Error appending to default file:', err);
      // User cancellation of file picker is common, don't show error for that
      if (err.name !== 'AbortError') {
         displayError('Failed to append to file. Please try downloading a new file instead.');
      }
    }
     // Close the dropdown after selection
    document.getElementById('appendOptions').style.display = 'none';
  });
});

// Custom append button click handler
document.getElementById('customAppendBtn').addEventListener('click', async () => {
  chrome.storage.session.get(['jiraTickets'], async (result) => {
    if (!result.jiraTickets || result.jiraTickets.length === 0) {
        displayError('No data to append.');
        return;
    }

    const { csvHeaders, rows } = prepareCSVData(result.jiraTickets);

    try {
      // Open file picker for custom location
      // Use showOpenFilePicker to select an existing file
      const fileHandleArray = await window.showOpenFilePicker({
        types: [{
          description: 'CSV Files',
          accept: {'text/csv': ['.csv']},
        }],
        multiple: false // Ensure only one file can be selected
      });

      if (!fileHandleArray || fileHandleArray.length === 0) {
          // User cancelled the file picker
          return;
      }

      const fileHandle = fileHandleArray[0];

      // Get the file and its content
      const file = await fileHandle.getFile();
      let existingContent = '';

       // Try to read existing content, handle empty file case
      if (file.size > 0) {
         try {
            existingContent = await file.text();
         } catch (e) {
             console.error('Error reading existing file:', e);
             displayError('Could not read the selected file. Please make sure it is a valid CSV file and you have permissions.');
             return;
         }
      }

      // Create a FileSystemWritableFileStream to write to
      const writable = await fileHandle.createWritable();

       const newContent = existingContent.trim() + (existingContent.trim() ? '\n' : '') + rows.join('\n');

      await writable.write(newContent);
      await writable.close();
      showMessage('Data successfully appended to the selected CSV file!');

    } catch (err) {
       console.error('Error appending to custom file:', err);
       // User cancellation of file picker is common, don't show error for that
       if (err.name !== 'AbortError') {
          displayError('Failed to append to file. Please try downloading a new file instead.');
       }
    }
     // Close the dropdown after selection
    document.getElementById('appendOptions').style.display = 'none';
  });
});

// Theme toggle button click handler
document.getElementById('themeToggleBtn').addEventListener('click', () => {
  const body = document.body;
  const currentTheme = body.classList.contains('dark-mode') ? 'dark' : 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
});

// Side Panel Functionality
const menuBtn = document.getElementById('menuBtn');
const sidePanel = document.getElementById('sidePanel');
const closePanelBtn = document.getElementById('closePanelBtn');
const sidePanelOverlay = document.getElementById('sidePanelOverlay');

menuBtn.addEventListener('click', () => {
  sidePanel.classList.add('open');
  sidePanelOverlay.classList.add('visible');
});

closePanelBtn.addEventListener('click', () => {
  sidePanel.classList.remove('open');
  sidePanelOverlay.classList.remove('visible');
});

sidePanelOverlay.addEventListener('click', () => {
  sidePanel.classList.remove('open');
  sidePanelOverlay.classList.remove('visible');
}); 