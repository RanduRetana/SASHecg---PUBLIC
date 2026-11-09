# Redactly

Redactly anonymizes batches of PDF pages, such as ECG reports, directly in your browser. Mark the areas that contain patient details once, apply them to every page, and download a ZIP with one anonymized PDF per page.

**Your files never leave your computer.** There is no server that receives files, no accounts, no database, and no analytics. All processing runs in the browser tab, using your own computer’s processor and memory.

## Features

- Upload one multi-page PDF or many PDFs at once.
- Mark one or more redaction areas and apply them to every page, with per-page exceptions when a layout differs.
- Review anonymized thumbnails before exporting.
- Optionally add a study code (for example `8805-001`) on top of a redaction area, with a choice of area and text orientation.
- Download a ZIP containing one single-page PDF per input page.
- Try it with a built-in synthetic practice report that contains no real data.

## How it works

Everything below happens locally in the browser:

1. [PDF.js](https://mozilla.github.io/pdf.js/) renders each page as an image (about 220 dpi).
2. Each marked area is painted over with a solid block, so the pixels underneath are replaced, not hidden. An optional study code is drawn on top of the block.
3. [pdf-lib](https://pdf-lib.js.org/) saves each page as a new PDF containing only that flattened image. The original text layer and metadata are not copied.
4. [fflate](https://github.com/101arrowz/fflate) packs the pages into a ZIP for download.

Closing or reloading the tab clears everything Redactly was holding in memory.

## Good to know

- Only the areas you mark are covered. Check every page before sharing, including footers, margins, and barcodes.
- The output is an image-based PDF: it can be viewed and printed, but the text is no longer selectable.
- Output file names are based on the source file names, so rename them if those names identify a person.
- Large batches use a lot of memory, and slower computers take longer. A current version of Chrome, Edge, Firefox, or Safari is recommended.

## Run locally

Requires [Bun](https://bun.sh) 1.1 or newer.

```bash
bun install
bun run dev        # http://127.0.0.1:43123
```

Other commands:

```bash
bun run build      # production build in dist/
bun run preview    # serve the production build
bun run typecheck
bun run lint
bun test
```

## Deployment

The app is a static single-page app. On Vercel, `vercel.json` rewrites unknown paths to `index.html`. On other static hosts, add the same fallback while keeping real files (such as `/assets/*`) served as themselves.

## Built with

React, TypeScript, Vite, and Bun, with interface components from [Stealth UI](https://www.stealth.pm).

## License

[MIT](LICENSE)
