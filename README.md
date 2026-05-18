# SAT Question Bank Exporter

## Overview
A custom Google Chrome/Microsoft Edge extension developed to automate the extraction and formatting of SAT practice questions from the College Board's Student Question Bank. This tool was built to solve the tedious process of manually saving practice questions, enabling bulk export of customized PDF question packets for offline study.

## Technical Highlights
* **API Interception & Auth Extraction:** The extension uses `chrome.webRequest` to silently capture highly restricted `x-cb-catapult` authentication and authorization tokens from live session traffic without needing to store or manage user credentials directly.
* **Headless PDF Generation:** Integrates directly with the Chrome Debugger API (`chrome.debugger`) to execute the `Page.printToPDF` command. This bypasses the standard browser print dialog, allowing for the silent, automated generation of hundreds of PDFs in batch processes.
* **Custom DOM Rendering:** Dynamically reconstructs the College Board JSON payloads into a clean, printable HTML/CSS format, systematically removing visually redundant elements (like graph accessibility descriptions) and formatting student-produced response fields.

## Features
* Batch export up to 100 questions per PDF.
* Filter questions by Subject (Math / Reading & Writing), Difficulty (Easy, Medium, Hard), and Domain (Algebra, Advanced Math, etc.).
* Toggle inclusion of answer keys and rationales.
* Option to filter for only currently active/live questions.

## Installation (Developer Mode)
1. Clone or download this repository.
2. Open your chromium-based browser and navigate to `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this project folder.
*Note: The extension requires Chrome `debugger` permissions to access the native PDF printing engine.*

## Usage
1. Log in to your College Board account and navigate to `https://mypractice.collegeboard.org/questionbank/search`.
2. Apply a filter or refresh the page so the extension can intercept the session authentication tokens.
3. Open the extension popup—it will indicate "Session Captured".
4. Select your desired subjects, domains, and difficulties.
5. Click **Export All PDFs**. The PDFs will be automatically generated and saved to your default downloads folder.

## Disclaimer
This tool was built strictly for personal, offline educational purposes. Use this only with your own authenticated access and in accordance with the terms of service of your College Board account.

## Author
* **Sharthak**
