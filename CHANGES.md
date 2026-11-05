# Changes

## 0.1.0 (2026-11-05)

First version of STKR (Project Omnitron).

### Added

- Create and edit radar maps in three steps: name 3 to 12 axes, set each rating by
  dragging or with the keyboard, then add optional details.
- Per-map scales, and a "better when higher or lower" setting for each axis.
- Optional date, time, device location, place name, category, tags, people, notes,
  custom details and up to 10 photos on each map.
- Stacks that group maps by category, place or date.
- A graph of how maps and stacks relate, with zoom, pan, keyboard use and a list view.
- "Would I like it?" search, using a sentence embedding model that runs on the device.
  It gives an estimate, the maps behind it, and "not enough to go on" when nothing is
  close. If the model can't load, it falls back to labelled word matching.
- JSON backup export and merge import, a persistent storage request, and delete everything.
- Offline use as an installable web app.
- A Cloudflare Worker that serves the app with a strict security policy and stores nothing.

### Decisions

- Uses the CPU-only ONNX runtime, because the WebGPU runtime's 28 MB WebAssembly file
  exceeds Cloudflare's 25 MiB per-file limit.
- Sets `ignore-scripts=true` in `.npmrc`. Install scripts run no third-party code, and
  `onnxruntime-node`'s post-install download, which the app doesn't use, can't stall installs.
- Set the prediction similarity threshold to 0.25 from measurements on the real model
  (see `e2e/calibrate.spec.ts`).
