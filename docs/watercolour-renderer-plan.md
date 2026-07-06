# Watercolour Renderer Plan

This is the app-specific renderer decision record for the watercolour painting app, required alongside `docs/toolcraft/agent-worklog.md` because the shared Toolcraft framework docs under `docs/toolcraft/` describe the general rules, not this app's actual decision.

The simulation model follows David Small, "Modeling Watercolor by Simulating Diffusion, Pigment, and Paper Fibers" (MIT Media Lab, Visible Language Workshop): each cell carries a mobile surface layer (CMY pigment + water) and an infused layer soaked into the paper fibers, with per-step surface displacement forces (tilt gravity, surface tension, spreading), dampness-gated infused diffusion, capacity-clamped absorption, evaporation, and a subtractive `paper − (CMY_surface + CMY_infused)` render.

## Renderer Technique Decision Matrix

Mirrors `rendererTechnique` in `src/app/app-performance.ts`.

- `sourceRepresentation`: `procedural-data` — no uploaded/decoded source media; the paper heightmap and the pigment/water fields are both generated and evolved entirely on the GPU.
- `productRepresentation`: `pixel` — the visible product is a raster subtractive composite of paper albedo and accumulated CMY pigment concentration.
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

`interactionInvalidation` keeps `animation-frame`, `viewport-drag`, and `viewport-zoom` from ever invalidating the two export passes (`export-pixel-readback`, `export-encode`): panning/zooming/ticking the simulation must never trigger a pixel-transform/export recompute — only the `export` interaction does. `simulation-step` and `preview-composite` cache on canvas size/render-scale (framebuffer reallocation only on resize); `export-pixel-readback` caches on `export.image.resolution` (readback/redraw only when export size changes).

## Rejected Renderer Alternatives

- Canvas 2D (the CPU `pixel-output` alternative to the chosen `rendererStrategy`): rejected because per-pixel diffusion/evaporation/granulation across the full canvas every frame cannot sustain interactive brush dragging on CPU at practical canvas sizes — this is a workload rejection, not a product-quality one.
- A pure DOM/SVG, `text-output`/`vector-output` approach: rejected outright since the product is raster pigment simulation, not vector or text geometry, so reference/text preservation does not apply here.
- Splitting `previewRenderer` and `exportRenderer` onto different strategies: rejected because reusing the same `webgl` `rendererStrategy` for both keeps exported pixels identical to what the user painted (no preview/export drift); only the final export/copy hand-off differs (CPU `toBlob` readback), which is a product-quality PNG/JPEG export requirement, not a renderer-strategy change.
