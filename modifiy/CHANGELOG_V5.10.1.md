# MindCanvas v5.10.1

## Fixed

- PDF annotation now starts only from a primary pressed pointer and only the
  captured pointer may extend the stroke. Hover movement and unrelated pointers
  no longer draw in fullscreen or dedicated PDF view.
- Completed or skipped contextual guides are carried across the v5.10.1
  content namespace and are not automatically replayed. An explicit guide
  reset remains the opt-in replay path.
- Contextual help is available again on Workspace, Canvas and Learning Hub once
  the matching guide is completed. Duplicate visual controls are collapsed to
  one help row per function.
- The sidebar resize affordance is aligned to the navigation rail's right edge.

## Improved

- “Được chia sẻ với tôi” now has a clearer inbox header, summary counts,
  status badges, search, type filters, sorting and empty/no-result states.

## Compatibility and blockers

- Uploaded-document sharing is not enabled in this release. The local document
  library is device-local IndexedDB/localStorage, while cloud documents use a
  separate project-scoped Supabase repository. A safe share feature needs a
  reviewed document-share schema, storage/RLS policy, invitation/revocation
  flow, quota handling and migration; no backend, credential or paid service
  was added without that decision.
- Browser E2E/screenshots remain unverified in the current container because no
  Chrome/Firefox executable is installed. See
  `V5.10.1_RELEASE_REPORT_VI.md` for the exact gates.
