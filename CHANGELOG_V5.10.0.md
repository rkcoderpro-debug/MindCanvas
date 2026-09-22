# MindCanvas v5.10.0

## Added

- Structured DOCX document model and OOXML import/export package.
- DOCX ribbon editor with styles, font/marks, paragraph/list controls,
  find/replace, symbols, hyperlinks, page layout and zoom.
- Real table and inline image context tools, editable header/footer, page break,
  local IndexedDB draft recovery, save-as-copy and source preservation.
- Create DOCX from a blank document in Learning Hub → Công cụ.
- Typed DOCX/PDF guide events scoped by document and guide session.

## Fixed

- PDF guide no longer advances when a DOCX row is opened first.
- Technical paragraph-style/import warnings are summarized and expandable.
- Image media/relationships, hyperlink targets and page-break runs are retained
  in the structured model and export package.
- Footer PAGE field and PDF.js worker asset are emitted/configured correctly.

## Compatibility notes

- Data remains local by default; no cloud storage or paid service was added.
- Floating/wrap images, arbitrary vertical table merges, OMML, tracked changes,
  comments/fields and a true multi-page editable layout are not fully supported.
  The importer warns and keeps the original bytes safe.
- Browser E2E, screenshots and Microsoft Word desktop round-trip require an
  environment with a real browser/Office and remain unverified here.
