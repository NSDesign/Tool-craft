# Watercolour Renderer Plan

This is the app-specific renderer decision record for the watercolour painting app, required alongside `docs/toolcraft/agent-worklog.md` because the shared Toolcraft framework docs under `docs/toolcraft/` describe the general rules, not this app's actual decision.

The simulation model follows David Small, "Modeling Watercolor by Simulating Diffusion, Pigment, and Paper Fibers" (MIT Media Lab, Visible Language Workshop): each cell carries a mobile surface layer (pigment + water) and an infused layer soaked into the paper fibers, with per-step surface displacement forces (tilt gravity, surface tension, spreading), dampness-gated infused diffusion, capacity-clamped absorption, evaporation, and a **Beer–Lambert** composite.

**Colour model (Beer–Lambert / glazing).** Pigment is stored as accumulated per-channel *absorbance* (optical density `−ln(reflectance)` of the swatch colour), summed additively as strokes are laid down. The composite renders `paper · exp(−density · absorbance)`, so stacking pigments multiplies their reflectances the way real transparent washes do: complementary overlaps (e.g. orange + blue) approach a dark muted brown/grey smoothly instead of the old linear `paper − CMY` subtraction that hard-clipped to pure black. White is a scattering/opaque pigment that scales the local absorbance *down* (a subtractive-white add is a no-op); under the exponential composite that desaturates rather than erases, so white over red reads as pink, over purple as lavender, over black as grey. (This is glazing-accurate subtractive mixing, not full spectral Kubelka–Munk, so secondaries are plausible — yellow + blue → dark green — but not guaranteed vivid.)

## Renderer Technique Decision Matrix

Mirrors `rendererTechnique` in `src/app/app-performance.ts`.

- `sourceRepresentation`: `procedural-data` — no uploaded/decoded source media; the paper heightmap and the pigment/water fields are both generated and evolved entirely on the GPU.
- `productRepresentation`: `pixel` — the visible product is a raster Beer–Lambert composite of paper albedo and accumulated per-channel pigment absorbance.
- `previewRenderer`: `webgl` — the on-screen canvas renders through a WebGL2 context every animation frame (RGBA16F state textures via `EXT_color_buffer_float`; the simulation update writes the surface and infused layers in one MRT pass).
- `exportRenderer`: `webgl` — export reuses the same WebGL2 simulation state; only the final readback-and-encode step runs on the CPU via a 2D canvas so `toBlob()` can produce PNG/JPEG bytes.
- `rendererWorkload`: `pixel-output` — per-pixel force-field/advection/diffusion/absorption/evaporation recomputed across the full backing resolution every frame.
- `rendererStrategy`: `webgl`.
- `whyNotAlternativeStrategies`: a CPU `pixel-output` alternative (Canvas 2D) would require CPU-side convolution across every texel each frame, which cannot sustain interactive brush dragging at practical canvas sizes; a `text-output`/`vector-output` strategy does not apply because the product is raster pigment simulation, not text or vector geometry. WebGL2 fragment shaders parallelize the same per-pixel diffusion work on the GPU instead.
- `fidelityRisks`: the paper heightmap is a lightweight procedural value-noise approximation, not a scanned paper texture.
- `performanceRisks`: large canvas size combined with Resolution scale 2 increases per-frame diffusion cost; 8K export readback is a heavier one-shot export/copy step outside the live interactive loop.

## Renderer Layer Inventory

Mirrors `rendererTechnique.layers` in `src/app/app-performance.ts`.

| Layer id | kind | content | renderer | exportMode |
| --- | --- | --- | --- | --- |
| `watercolour-simulation` | `product-foreground` | shader, noise, bitmap-media | webgl | included |

There is no separate `backgroundLayer`, `editingHandlesLayer`, or `exportComposite` layer as a distinct DOM/SVG overlay: the paper texture (procedural noise) and the pigment/wetness field are generated and composited together inside the single `watercolour-simulation` product-foreground WebGL layer, and that same composite is what gets read back for `exportComposite` behavior, since there are no editing handles in this direct-painting product.

## Render Pipeline Inventory

Mirrors `rendererPipeline` in `src/app/app-performance.ts`.

| Pass id | kind | runsOn | invalidatedBy (interaction) | cacheKey |
| --- | --- | --- | --- | --- |
| `force-field` | composite | gpu | control-drag, control-change, animation-frame | canvas.size.width, canvas.size.height, canvas.renderScale |
| `simulation-step` | composite | gpu | control-drag, control-change, animation-frame | canvas.size.width, canvas.size.height, canvas.renderScale |
| `preview-composite` | composite | gpu | animation-frame | canvas.size.width, canvas.size.height, canvas.renderScale |
| `export-pixel-readback` | pixel-transform | export-only | export | export.image.resolution |
| `export-encode` | export | export-only | export | — |

The `force-field` pass computes the per-axis surface displacement force (tilt gravity + surface-tension kernel + spreading, Small's eq [1]) into an auxiliary texture; the `simulation-step` MRT pass then advects the surface layer by that force, deposits from the brush, diffuses the infused layer, and transfers surface → infused (absorption) with evaporation.

Wet-on-wet bleeding is governed by how long the paper stays wet and how readily it fixes pigment, both exposed as Paper controls. **Water absorption** scales the per-frame surface-water → infused-water transfer, and evaporation (from **Drying speed**) is gentle by default so a wash stays damp for several seconds. **Paint absorption** scales pigment settling from the mobile surface layer into the fixed fibers, and that settling is gated by local dryness: while the paper is wet the pigment stays mobile and keeps flowing/diffusing (a stroke drawn into a wet area blooms into it), and it only sets as the water leaves (so wet-on-dry strokes stay crisp). Low paint/water absorption therefore bleeds more; high absorption sets crisper marks sooner.

Brush deposition is **distance-based**, not frame-based: the CPU walks the pointer path and stamps a dab every _Stroke spacing_ of arc length (with the sub-spacing remainder carried across pointer events and animation frames), then hands only that frame's new dab centres to the `simulation-step` shader, which sums their soft round/filbert/square masks additively. Because each dab is deposited exactly once — in the single frame it is placed — total pigment along a stroke depends on path length and dab spacing rather than on how many frames the pointer dwelt at a sample position. This removes the earlier beading artifact (idle frames between pointer events used to re-stamp a growing dot at the last sample) and makes _Stroke spacing_ a direct user control: tight spacing overlaps into a smooth continuous wash, wide spacing leaves separated dry-brush dabs.

`interactionInvalidation` keeps `animation-frame`, `viewport-drag`, and `viewport-zoom` from ever invalidating the two export passes (`export-pixel-readback`, `export-encode`): panning/zooming/ticking the simulation must never trigger a pixel-transform/export recompute — only the `export` interaction does. `simulation-step` and `preview-composite` cache on canvas size/render-scale (framebuffer reallocation only on resize); `export-pixel-readback` caches on `export.image.resolution` (readback/redraw only when export size changes).

## Rejected Renderer Alternatives

- Canvas 2D (the CPU `pixel-output` alternative to the chosen `rendererStrategy`): rejected because per-pixel diffusion/evaporation/granulation across the full canvas every frame cannot sustain interactive brush dragging on CPU at practical canvas sizes — this is a workload rejection, not a product-quality one.
- A pure DOM/SVG, `text-output`/`vector-output` approach: rejected outright since the product is raster pigment simulation, not vector or text geometry, so reference/text preservation does not apply here.
- Splitting `previewRenderer` and `exportRenderer` onto different strategies: rejected because reusing the same `webgl` `rendererStrategy` for both keeps exported pixels identical to what the user painted (no preview/export drift); only the final export/copy hand-off differs (CPU `toBlob` readback), which is a product-quality PNG/JPEG export requirement, not a renderer-strategy change.
