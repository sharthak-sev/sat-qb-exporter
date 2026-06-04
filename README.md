# SAT Question Bank Exporter

Local unpacked Chrome/Edge extension for exporting SAT Student Question Bank question packets from an authenticated College Board session.

## Install

1. Open `chrome://extensions` or `edge://extensions`.
2. Turn on Developer mode.
3. Choose **Load unpacked**.
4. Select the downloaded extension folder.

The extension now asks for Chrome's `debugger` permission so it can call Chrome's own `Page.printToPDF` command and save PDF batches without the print dialog.

## Use

1. Log in to `https://mypractice.collegeboard.org/questionbank/search`.
2. After the extension is loaded, refresh the question bank page or change a filter so the page makes a normal API request.
3. Open the extension popup. It should show that the session was captured.
4. Leave the defaults for Math + Medium + Hard + all matching questions, or adjust section/domains/difficulties.
5. Click **Count Questions**, then **Export Sample PDF**, then **Export All PDFs**.
6. Click **Export as Interactive Test** to save a `.sat-test` file for the standalone practice app in `../sat-test-app`.

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

## Notes

- Use this only with your own authenticated access and in line with the terms that apply to your College Board account.

## Support This Project

If you found this tool helpful for your SAT prep, consider supporting the author! ❤️

<img src="qr.svg" alt="Payment QR Code" width="220" style="border-radius: 8px; border: 1px solid #ddd; margin: 10px 0;"/>

**UPI ID**: `sharthak-jaiswal@fam`

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/sevrony)

## License

sat-qb-exporter is released under the [MIT License](LICENSE). It is provided as-is, without warranty.
