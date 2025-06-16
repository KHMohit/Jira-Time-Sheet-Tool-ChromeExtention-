# Jira CSV Exporter

A Chrome extension that helps you extract Jira ticket information and export it to CSV format.

## Features

- Extract key information from Jira tickets
- View and edit data before exporting
- Export to CSV format
- Append to existing CSV files
- Dark/Light theme support
- Responsive design

## Installation

1. Clone this repository or download the source code
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked" and select the extension directory

## Usage

1. Navigate to a Jira ticket in your browser
2. Click the extension icon in the toolbar
3. Click the "+" button to extract data from the current ticket
4. (Optional) Edit any data in the table
5. Click "Download" to save as CSV or "Append" to add to an existing file

## Development

### Project Structure

- `content.js`: Handles data extraction from Jira pages
- `popup.js`: Manages the extension's UI and data handling
- `popup.html`: The extension's user interface
- `popup.css`: Styling for the extension
- `manifest.json`: Extension configuration

### Building

This is a vanilla JavaScript extension, so no build step is required. Just load the extension in Chrome as described in the Installation section.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT
