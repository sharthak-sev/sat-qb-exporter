# SAT Question Bank Exporter

Local unpacked Chrome/Edge extension for exporting SAT and PSAT Student Question Bank question packets from an authenticated College Board session. 

This tool seamlessly interfaces with College Board's API to extract your questions and package them into cleanly formatted PDFs or interactive testing files for use in [Sevrony](https://sharthak-sev.github.io/).

## Features

- **Multi-Test Support**: Export questions from the standard **SAT**, **PSAT/NMSQT & PSAT 10**, and **PSAT 8/9** question banks.
- **Practice Test Exports**: Go to your College Board Dashboard or Practice Test Details page to export your completed full-length Practice Tests!
- **Interactive Test Files**: Export batches of Math and Reading & Writing questions as `.sat-test` files to simulate real, timed Digital SAT experiences on [Sevrony](https://sharthak-sev.github.io/).
- **PDF Batches**: Seamlessly generate heavily-optimized printable PDFs without triggering browser print dialogs.
- **Granular Filtering**: Filter exports by Assessment, Difficulty (Easy, Medium, Hard), Domains (e.g. Algebra, Geometry), and Exclude Active/Live items.
- **Answer Formats**: Choose between "No Answers", "With Answers" (includes rationales), or "No Choices" formats.

## Install

1. Open `chrome://extensions` or `edge://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select the downloaded extension folder.

*Note: The extension asks for Chrome's `debugger` permission so it can securely call Chrome's own `Page.printToPDF` command and save PDF batches without interrupting you with print dialogs.*

## Usage: Question Bank Export

1. Log in to `https://mypractice.collegeboard.org/questionbank/results`.
2. Wait for the page to load your questions. The extension will automatically capture your session in the background.
3. Open the extension popup. It should show that the session was captured and the current section (Math or Reading & Writing) is detected.
4. Select your **Assessment** (SAT, PSAT/NMSQT & PSAT 10, or PSAT 8/9).
5. Adjust your desired options (Difficulty, Domains, Answer Mode, Batch Size).
6. Click **Count Questions** to see how many match your criteria.
7. Click **Export All PDFs** or **Export as Interactive Test** depending on your workflow.

## Usage: Practice Test Export

1. Log in to `https://mypractice.collegeboard.org/dashboard` or a specific Practice Test details page.
2. Open the extension popup.
3. Use the toggle to switch to **Practice Test Mode**.
4. Select the practice test attempt you want to export from the dropdown.
5. Click **Export Practice Test** to generate an interactive `.sat-test` file for that specific test attempt.

## Interactive Test Export (`.sat-test`)

The **Export as Interactive Test** or **Export Practice Test** buttons create a `.sat-test` JSON file containing normalized questions. The standalone app [Sevrony](https://sharthak-sev.github.io/) imports this file, stores the question bank in your browser's IndexedDB, and runs a timed local practice session mimicking the real Digital SAT without needing a backend server.

The `.sat-test` file includes answer keys for local scoring, so treat exported files as private study material.

## Output Structure

The exporter generates cleanly named files corresponding to your selections:
- `sat-math-no-answers-mh-part-01-of-09.pdf`
- `psat10-rw-answers-em-sample.pdf`
- `psat8-9-question-bank-interactive-math-200-rw-150.sat-test`

## Notes

- Use this only with your own authenticated access and in line with the terms that apply to your College Board account.

## Support This Project

If you found this tool helpful for your SAT prep, consider supporting the project! ❤️

<img src="qr.svg" alt="Payment QR Code" width="220" style="border-radius: 8px; border: 1px solid #ddd; margin: 10px 0;"/>

**UPI ID**: `sharthak-jaiswal@fam`

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/sevrony)

## License

sat-qb-exporter is released under the [MIT License](LICENSE). It is provided as-is, without warranty.
