# MR Methods Split

The MR Vue method bundle was split out of the original `scripts/mr/methods.js` monolith.

Current layout:

- `scripts/mr/methods.js`: base method slice and compatibility loader.
- `scripts/mr/methods_timeline.js`: timeline observers, portrait queueing, and timeline portrait resolution.
- `scripts/mr/methods_media.js`: row image helpers, upload/drop handling, and XRay media wiring.
- `scripts/mr/methods_loaders.js`: timeline/notebook/relationship loaders and year bootstrapping.
- `scripts/mr/methods_graph.js`: init flow plus relationship tree and family graph behavior.

Loading order is preserved in `mr.html` so each script extends the shared `window.MR_METHODS` object before `scripts/mr/app.js` mounts Vue.