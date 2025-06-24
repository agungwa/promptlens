# AI-Powered Image Scraper & Prompt Generator

This is a Chrome extension that allows you to scrape images from any website and use powerful AI models to generate creative prompts for ad campaigns, social media posts, and more.

## Features

*   **Image Scraping**: Scrape all images from the current web page with a single click.
*   **AI-Powered Prompt Generation**: Use the Gemini AI model to generate creative prompts for each scraped image.
*   **Customizable Settings**: Configure the AI model and enter your own API key.
*   **Dark Mode**: A sleek dark mode for comfortable viewing.
*   **Top Navigation Menu**: A clean and intuitive top navigation menu.

## Installation

1.  Go to the [Releases page](https://github.com/agungwa/promptlens/releases) of this repository.
2.  Download the `extension.zip` file from the latest release.
3.  Unzip the downloaded file.
4.  Open Chrome and navigate to `chrome://extensions/`.
5.  Enable "Developer mode".
6.  Click "Load unpacked" and select the unzipped directory.

## Usage

1.  Open the extension by clicking the icon in the Chrome toolbar.
2.  Go to the "Settings" page and enter your Gemini API key.
3.  Click "Save Settings".
4.  Navigate to any website and open the extension.
5.  Go to the "Features" page and click "Scrape Images".
6.  The extension will scrape all images from the page and generate a prompt for each one.

## Development Setup

To contribute to this project, you can set up a local development environment:

1.  Clone this repository to your local machine.
2.  Install the dependencies:
    ```bash
    npm install
    ```
3.  Build the extension:
    ```bash
    npm run build
    ```
4.  Follow the installation steps above to load the unpacked extension in Chrome.

## Usage

1.  Open the extension by clicking the icon in the Chrome toolbar.
2.  Go to the "Settings" page and enter your Gemini API key.
3.  Click "Save Settings".
4.  Navigate to any website and open the extension.
5.  Go to the "Features" page and click "Scrape Images".
6.  The extension will scrape all images from the page and generate a prompt for each one.

## Development

To make changes to the extension, edit the TypeScript files in the `src` directory. After making changes, you'll need to rebuild the extension:

```bash
npm run build
```

Then, reload the extension in Chrome to see your changes.