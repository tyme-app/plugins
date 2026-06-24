# RUKK Invoices — Tyme plugin

Sends tracked time from [Tyme](https://www.tyme-app.com) straight into **RUKK** as a
draft invoice, using RUKK's custom `rukk://` URL scheme. Fully offline — the data is
handed directly to the RUKK app on the same Mac; nothing is uploaded anywhere.

**Requires the RUKK app** (invoicing for small Icelandic businesses), free on the
Mac App Store: https://apps.apple.com/app/id6777342177 — version 1.2 or later, which
registers the `rukk://` URL scheme this plugin hands off to.

## How it works

1. In Tyme, open **Share / Export** and choose **RUKK**.
2. Pick a date range, the tasks to bill, and the options (summarize, only unbilled, …).
3. Run the export. RUKK launches (or comes to the front) with a new **draft invoice**
   whose lines are the selected, aggregated time entries
   (description = task/sub-task, quantity = hours, unit price = the Tyme rate).
4. Optionally tick *Mark exported entries as billed* to flag them in Tyme.

The plugin builds a JSON payload, base64-encodes it, and calls
`tyme.openURL("rukk://invoice?data=…")`. RUKK registers the `rukk` scheme
(`CFBundleURLTypes`) and decodes the payload in `InvoiceImport.swift` /
`ContentView.importInvoice(_:)`.

## Payload contract (`rukk://invoice?data=<urlencoded base64 JSON>`)

```json
{
  "version": 1,
  "source": "tyme",
  "currency": "ISK",
  "customer": "Project name (optional)",
  "lines": [
    { "description": "Task: sub-task", "quantity": 1.5, "unitPrice": 19000, "unit": "klst" }
  ]
}
```

## Installing for development

Tyme reads plugins from its Application Support folder. Copy this `RUKKInvoices`
folder into Tyme's plugin directory (Tyme → Preferences → Plugins → *Open plugin
folder*), then reload plugins. During development you can also point Tyme at this
folder directly.

## Files

| File | Purpose |
|------|---------|
| `plugin.json` | Metadata + entry points (`rukk.createInvoice()`, `rukk.generatePreview()`) |
| `script.js` | Reads `tyme.timeEntries`, aggregates, opens the `rukk://` URL |
| `form.json` | Date range, task picker, summarize/unbilled/mark-billed options |
| `localization.json` | English, Icelandic, German strings |
| `icon.png` | Plugin icon (RUKK logo) |
