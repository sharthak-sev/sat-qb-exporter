# SAT Question Bank Exporter

> **Disclaimer**: This project is a personal educational tool and is **not affiliated with, endorsed by, or associated with College Board**. SAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, this product. This tool does not distribute, contain, or host any College Board content. It is designed solely to help users interact with their own authenticated data for personal study purposes.

Local unpacked Chrome/Edge extension for saving your own practice data from your authenticated College Board session into convenient local formats.

## Install

1. Open `chrome://extensions` or `edge://extensions`.
2. Turn on Developer mode.
3. Choose **Load unpacked**.
4. Select the downloaded extension folder.

The extension now asks for Chrome's `debugger` permission so it can call Chrome's own `Page.printToPDF` command and save PDF batches without the print dialog.

## Use

1. Log in to `https://mypractice.collegeboard.org/questionbank/search`.
2. After the extension is loaded, refresh the question bank page or change a filter so the extension can read the data stream.
3. Open the extension popup. It should show that the session was captured.
4. Leave the defaults for Math + Medium + Hard + all matching questions, or adjust section/domains/difficulties.
5. Click **Count Questions**, then **Export Sample PDF**, then **Export All PDFs**.
6. Click **Export as Interactive Test** to save a `.sat-test` file for your personal use in the standalone practice app in `../sat-test-app`.

Defaults:

- Math selected.
- Medium and Hard checked.
- Easy unchecked, but available.
- **Only live/active questions** unchecked. Leave it off to include all matching questions.
- Batch size: 100 questions per PDF.
- No answers, no rationales, no correct-choice highlighting.
- Graph accessibility descriptions are hidden in the visual PDF.
- Student-produced response blanks are not printed.

## Interactive Test Export

The **Export as Interactive Test** button creates a `.sat-test` JSON file containing normalized Math and Reading/Writing questions when both sections are available from the authenticated session. The standalone app imports this file, stores the question bank in IndexedDB, and runs timed local practice without a backend.

The `.sat-test` file includes answer keys for local scoring, so treat exported files as private study material.

Open the interactive test app locally in your browser (e.g. by opening its `index.html` file).

You can also serve that folder with any static file server if your browser limits IndexedDB on `file://` pages.

## Output

The exporter creates PDFs named like:

- `sat-math-no-answers-mh-sample.pdf`
- `sat-math-no-answers-mh-part-01-of-09.pdf`

Chrome may show a notification while the extension is debugging a temporary print tab. That is expected during automatic PDF creation.

- Use this only with your own authenticated access and in line with the terms that apply to your College Board account. Do not distribute exported materials.

## Support This Project

If this tool saves you time, consider buying me a coffee! ☕

<img src="icons/qr.png" alt="Buy me a coffee QR" width="250" style="border-radius: 8px; border: 1px solid #ddd; margin: 10px 0;">

**UPI ID**: `sharthak-jaiswal@fam`

## License

This project is open-sourced under the [MIT License](LICENSE). It is provided "AS IS" without warranty of any kind.
