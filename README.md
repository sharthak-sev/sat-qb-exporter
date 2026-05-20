# SAT Question Bank Exporter

## Overview
A custom Chromium-based browser extension developed to automate the extraction and formatting of SAT practice questions from the College Board's Student Question Bank. This tool was built to solve the tedious process of manually saving practice questions, enabling bulk export of customized PDF question packets for offline study.

## Technical Highlights
* **API Interception & Auth Extraction:** The extension uses `chrome.webRequest` to silently capture highly restricted `x-cb-catapult` authentication and authorization tokens from live session traffic without needing to store or manage user credentials directly.
* **Headless PDF Generation:** Integrates directly with the Chrome Debugger API (`chrome.debugger`) to execute the `Page.printToPDF` command. A single hidden tab and debugger session is reused across all batches — only one debugger permission prompt per export, no matter how many PDFs are generated.
* **ZIP-Bundled Export:** All generated PDFs are bundled into a single ZIP archive using a built-in ZIP creator (CRC-32 + uncompressed store). This means exactly one save dialog for the entire export — no repeated popups. Works across all Chromium browsers including Brave.
* **Custom DOM Rendering:** Dynamically reconstructs the College Board JSON payloads into a clean, printable HTML/CSS format, systematically removing visually redundant elements (like graph accessibility descriptions) and formatting student-produced response fields.
* **Auto Section Detection:** Automatically detects whether you're browsing Math or Reading & Writing questions by monitoring API traffic — no manual section selection needed.

## Features
* Seamless one-click bulk export — all PDFs delivered as a single ZIP file.
* Customize batch size to determine how many questions are grouped into each PDF (max 250 per PDF to prevent renderer overload).
* Export a small sample size first to preview formatting before committing to a bulk download.
* Dynamic Count button to calculate the total number of questions matching your selected difficulty and section.
* Auto-detects subject (Math / Reading & Writing) from your current question bank page.
* Three export modes:
  * **No correct answers or explanations** — clean practice sheets.
  * **With correct answers and explanations** — includes answer keys, rationales, and highlighted correct choices.
  * **Without answers or headers** — minimal format with just question stems and choices.
* Filter questions by Difficulty (Easy, Medium, Hard).
* Option to exclude currently active/live questions.

## Technologies Used
* **Languages:** JavaScript, HTML, CSS
* **APIs:** Chrome Extensions API (Manifest V3), Chrome Debugger API (`chrome.debugger`), Chrome WebRequest API (`chrome.webRequest`), Chrome Downloads API (`chrome.downloads`)
* **Format:** JSON parsing, DOM manipulation, binary ZIP creation

## Installation (Developer Mode)
1. Clone or download this repository.
2. Open your Chromium-based browser and navigate to `chrome://extensions`, `edge://extensions`, or `brave://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this project folder.
*Note: The extension requires Chrome `debugger` permissions to access the native PDF printing engine.*

## Usage
1. Log in to your College Board account and navigate to `https://mypractice.collegeboard.org/questionbank/search`.
2. Choose your assessment, section, and domains, then click **Continue**.
3. Apply a filter or refresh the page so the extension can intercept the session authentication tokens.
4. Open the extension popup — it will indicate "Session Captured" and show the detected section (Math or Reading & Writing).
5. Select your desired difficulties and export mode.
6. Click **Count** to see the total number of available questions matching your parameters.
7. Configure your desired **Batch Size** (questions per PDF, max 250) and **Sample Size** (for a quick preview download).
8. Click **Sample** to test formatting, or **Export All** to generate the full batch. A single save dialog will appear for the ZIP file containing all your PDFs.

## Disclaimer
This tool was built strictly for personal, offline educational purposes. Use this only with your own authenticated access and in accordance with the terms of service of your College Board account.

## Author
* **Sharthak**
