# Implementation Worklog

This file records product decisions and the evidence behind them. Keep it short, factual, and current. Update it after schema, renderer, timeline, layer, export, performance, or acceptance decisions.

## Status

Mode: product

## Decision Trail

### Iteration 1 — Watercolour painting app brainstorming

- Request: Build a watercolour painting app. Main canvas centered, paint controls (brush, water, paint colours, mixing area) docked below/outside the canvas, and a right-side settings panel toggleable via a top-right control. Canvas settings (dimensions, clear, paper texture: roughness/relief/drying speed, watercolour dynamics simulation settings to be defined), brush settings (type, size, hair type), water (refresh), colours (8 named pigments), mixing (reset), image export (png/jpeg).
- Task type: App assembly (new product schema, custom controls, custom renderer).
- User-visible result: A single-page watercolour painting app with a WebGL2 pigment/wetness simulation canvas, a pigment swatch picker, an interactive mixing palette, brush/water/paper/dynamics controls, and PNG export.
- Source/reference checked: None (no Figma/video/reference app supplied).
- Reference inputs: None.
- Docs/contracts read: `AGENTS.md`, `docs/toolcraft/workflow.md`, `docs/toolcraft/decision-contract.md`, `docs/toolcraft/schema-reference.md`, `docs/toolcraft/renderer-technique.md`, `docs/toolcraft/performance.md`, `docs/toolcraft/component-rules.md`, `docs/toolcraft/custom-controls.md`, `docs/toolcraft/acceptance-testing.md`, plus runtime source `schema/types.ts`, `react/toolcraft-app.tsx`, `react/toolbar-panel.tsx`, `state/reducer.ts` (to confirm panel/history capabilities before committing to a layout).
- Contract rules applied: `runtime-shell-required`, `canvas-no-app-ui`, `panel-host-behavior`, `controls-layout-heuristics`, `renderer-technique-inventory`, `persistence-policy-explicit`.
- Decision:
  - Single-panel layout: Toolcraft exposes exactly one app-controllable panel (the controls panel, already toggleable/draggable by the runtime) plus a fixed toolbar (undo/redo, zoom, theme, center) and the canvas (product output only, no app UI). There is no separate "bottom dock" surface. Confirmed with the user (`AskUserQuestion`) to merge the requested bottom paint-tools dock and right-side settings into one controls panel, ordered Colours → Brush → Water → Mixing → Canvas & Paper → Watercolour Dynamics → Image Export (quick per-stroke choices above deeper one-time settings).
  - Canvas dimensions (x/y) map directly to the runtime-mandated `Setup` block (`Aspect ratio`, `Canvas width`, `Canvas height`) once `canvas.sizing.mode: "editable-output"` is set; no app-authored duplicate control.
  - Watercolour dynamics settings (left undefined by the user) are defined as: Wetness Spread, Granulation, Edge Darkening, Pigment Opacity — the four parameters that drive the diffusion/evaporation/granulation/backrun simulation passes.
  - Renderer: WebGL2 custom renderer for the pigment/wetness simulation (ping-pong framebuffers: deposit → diffuse → evaporate/dry → granulate via paper heightmap → edge-darken at the wet/dry boundary → composite for preview/export). Canvas 2D CPU convolution across an editable, export-capable canvas cannot sustain interactive brush dragging at typical canvas sizes; WebGL2 parallelizes the per-pixel diffusion/evaporation work on the GPU. Paper texture (roughness/relief) is generated once per canvas-size/paper-setting change and reused as a heightmap input to the simulation and as the visible base texture.
  - Two custom controls (no built-in fits either value model): a fixed 8-swatch pigment picker (`paint-swatches`) and an interactive mixing-area mini-canvas (`mixing-area`), both documented with `builtInFitCheck`.
  - Undo/redo (`toolbar.history`) is intentionally omitted for this iteration: the runtime undo/redo model diffs `values`/`canvas`/`layers`/`mediaAssets`/`timeline`, not a continuously mutated WebGL pixel/wetness field, and the user did not request undo. `Clear` (wipes the paint layer) and the controls-panel `Reset` (restores default settings) are the scoped-in reset mechanisms.
  - Persistence: `localStorage` for `values` and `canvas` only (brush/paper/dynamics settings and canvas size survive reload). The painted pixel content itself is intentionally not persisted; it does not fit any of `values`/`canvas`/`layers`/`media`/`timeline` without misusing those slices, and treating a painting sketchpad as session-only content is a reasonable, explicit product choice.
- Alternatives rejected:
  - A second, hand-built "bottom dock" panel alongside the runtime controls panel — rejected because it violates `runtime-shell-required` (routes must render `ToolcraftApp` directly; no hand-composed extra panel surfaces).
  - Canvas 2D renderer — rejected without WebGL2 comparison evidence would violate `renderer-technique-inventory`'s requirement to evaluate WebGL/WebGPU first for heavy per-pixel/noise/texture work; WebGL2 chosen directly since the simulation is inherently per-pixel and interactive.
  - `select`/`segmented` for the pigment swatches — rejected: `select` hides color identity behind text, breaking the direct-manipulation "dip brush in colour" interaction; `segmented` caps at 4 options and 24 total label characters, which cannot fit 8 named pigments.
- State/output mapping: Swatch pick and mixing-area sample both write `paint.currentPigmentColor`; brush controls (`brush.type`, `brush.size`, `brush.hairType`) and paper/dynamics sliders parameterize the WebGL simulation shaders; pointer strokes on the main canvas deposit into the simulation's wetness/pigment framebuffers; `Clear` resets those framebuffers; `Export PNG` composites the paper texture and dried pigment layer at the selected `export.image.resolution`/`export.image.format`.
- Files changed: `docs/toolcraft/agent-worklog.md` (this entry).
- Verification: None yet — this iteration is brainstorming only. Implementation and verification are tracked in the next iteration(s).
- Skipped checks: All implementation/verification checks, intentionally, since no app code changed in this pass.
- Risks:
  - Risk: A full, physically-accurate watercolour simulation is a large surface area; first version scopes the four dynamics parameters and the described controls only, and does not attempt pigment-specific Kubelka-Munk optical mixing between the 8 named pigments beyond straightforward alpha/multiply blending.
  - Risk: Undo/redo for brush strokes is out of scope for this iteration; flagged to the user as a possible future enhancement.

## Decisions

### Renderer

- Decision: Custom WebGL2 renderer driving a pigment/wetness simulation, replacing the starter's neutral canvas.
- Reason: Per-pixel diffusion, evaporation, granulation, and edge-darkening simulated every frame across an editable/export canvas requires GPU parallelism to stay interactive; see `docs/toolcraft/renderer-technique.md`.
- Evidence: Stress-scenario browser performance coverage lives in `src/app/app-performance.ts` (`watercolour-simulation-preview-render`, `watercolour-viewport-zoom-stress`, `image-export-8k`) and `e2e/app-performance.spec.ts`.

#### Renderer Technique Decision Matrix

This mirrors `rendererTechnique` in `src/app/app-performance.ts`.

- `sourceRepresentation`: `procedural-data` — there is no uploaded/decoded source media; the paper heightmap and the pigment/wetness field are both generated and evolved entirely on the GPU.
- `productRepresentation`: `pixel` — the visible product is a raster composite of paper albedo and accumulated pigment absorption.
- `previewRenderer`: `webgl` — the on-screen canvas renders through a WebGL2 context every animation frame.
- `exportRenderer`: `webgl` — export reuses the same WebGL2 simulation state; only the final readback-and-encode step (`export-pixel-readback` render pass) runs on the CPU via a 2D canvas so `toBlob()` can produce PNG/JPEG bytes.
- `rendererWorkload`: `pixel-output` — per-pixel diffusion/evaporation/granulation/edge-darkening recomputed across the full backing resolution every frame.
- `rendererStrategy`: `webgl` — matches `rendererTechnique.rendererStrategy`/`rendererWorkload` exactly, as required.
- `whyNotAlternativeStrategies`: Canvas 2D (`canvas-2d`) would require CPU-side convolution across every texel each frame, which cannot sustain interactive brush dragging at practical canvas sizes; DOM/SVG (`text-output`/`vector-output` strategies) do not apply because the product is raster pigment simulation, not text or vector geometry. WebGL2 fragment shaders parallelize the same per-pixel diffusion work on the GPU instead.
- `fidelityRisks`: the paper heightmap is a lightweight procedural value-noise approximation, not a scanned paper texture.
- `performanceRisks`: large canvas + Resolution scale 2 increases per-frame diffusion cost; 8K export readback is a one-shot heavier CPU pixel-transform/export-copy step outside the live loop.

#### Renderer Layer Inventory

This mirrors `rendererTechnique.layers` in `src/app/app-performance.ts`.

| Layer id | kind | content | renderer | exportMode |
| --- | --- | --- | --- | --- |
| `watercolour-simulation` | `product-foreground` | `shader`, `noise`, `bitmap-media` | `webgl` | `included` |

There is no separate `backgroundLayer`, `editingHandlesLayer`, or `exportComposite` layer: the paper texture (procedural noise) and the pigment/wetness field are generated and composited together inside the single `watercolour-simulation` product-foreground WebGL layer, and that same composite is what gets read back for export (`exportComposite` behavior is folded into this one layer rather than a separate DOM/SVG overlay, since there are no editing handles in this direct-painting product).

#### Render Pipeline Inventory

This mirrors `rendererPipeline` in `src/app/app-performance.ts`.

| Pass id | kind | runsOn | invalidatedBy (interaction) |
| --- | --- | --- | --- |
| `simulation-step` | `composite` | `gpu` | `control-drag`, `control-change`, `animation-frame` |
| `preview-composite` | `composite` | `gpu` | `animation-frame` |
| `export-pixel-readback` | `pixel-transform` | `export-only` | `export` |
| `export-encode` | `export` | `export-only` | `export` |

`interactionInvalidation` keeps `animation-frame`, `viewport-drag`, and `viewport-zoom` from ever invalidating the two export passes (`export-pixel-readback`, `export-encode`): panning/zooming/ticking the simulation must never trigger a pixel-transform/export recompute, only the `export` interaction does. `simulation-step` and `preview-composite` use `cacheKey`s tied to `canvas.size.width`/`canvas.size.height`/`canvas.renderScale` (framebuffer reallocation only when backing resolution changes); `export-pixel-readback` keys on `export.image.resolution` (readback/redraw only when the export size changes).

#### Renderer Alternatives Rejected

- Canvas 2D (`text-output`/`vector-output` do not apply; the relevant comparison is against `pixel-output` CPU compositing): rejected because per-pixel diffusion/evaporation/granulation across the full canvas every frame cannot sustain interactive brush dragging on CPU at practical canvas sizes.
- A pure DOM/SVG approach: rejected outright since the product is raster pigment simulation, not vector or text geometry.
- Splitting preview vs. export onto different `previewRenderer`/`exportRenderer` strategies: rejected (`previewExportDifferenceReason` not needed) because reusing the same `webgl` `rendererStrategy` for both keeps exported pixels identical to what the user painted; only the final `exportRenderer` readback/encode hand-off differs (CPU `toBlob`), which is a product-quality PNG/JPEG requirement, not a renderer-strategy change.

### Timeline

- Decision: No timeline.
- Reason: Painting is a direct, non-animated product; there is no playback/keyframe transport and no video export.
- Evidence: `panels.timeline` omitted; `appTransferMode.animationIntent` not applicable (no animation controls are shown).

### Layers

- Decision: No layers.
- Reason: The product has a single painted surface, not multiple editable/reorderable objects.
- Evidence: `panels.layers` omitted.

### Controls

- Decision: Eight controls-panel sections: Pigments, Brush, Water, Mixing, Paper, Watercolour Dynamics, Background, Image Export.
- Reason: See Control Section Inventory (`starterControlSectionInventory` in `src/app/app-acceptance.ts`) for the per-section entity/workflow-stage grouping reasons. "Colours" was renamed to "Pigments" because a bare "Colours"/"Colors" section title collides with the acceptance validator's UI-control-type-name rule (it must name the product entity, not a component type). Brush controls are ordered Hair type, Type, Size (mode selectors before the primary size slider) and Paper controls are ordered Drying speed, Relief height, Roughness, Clear (parameters before the action button) to satisfy the mode/input/primary-before-strength/detail/advanced/action ordering rule enforced by `getToolcraftControlOrderErrors`.
- Evidence: `pnpm exec vitest run src/app/app-acceptance.test.ts` passes with the full `appAcceptance` matrix and `starterControlSectionInventory` filled in; `e2e/app-acceptance-watercolour.spec.ts` exercises every control's product-observable behavior; `e2e/app-browser-acceptance.spec.ts` (shared meta-validator) passes.

### Export

- Decision: `Export PNG` sticky footer action; `Image Export` section with `export.image.format` (png/jpg) and `export.image.resolution` (2k/4k/8k); a required `Background` section (`export.includeBackground` Switch labeled "Include" plus an unlabeled `appearance.background` paper-tint Color control, one two-column inline row) directly before `Image Export`.
- Reason: Still-output product app per `docs/toolcraft/schema-reference.md`. Every Toolcraft app that exposes `Export PNG` must expose a user-facing background color control and an `export.includeBackground` toggle so PNG export can produce a transparent-background image instead of hardcoding the product background (`schema-reference.md` "Export" section); this was missing from the first implementation pass and was added as a real bug fix, not just an acceptance-data placeholder. `appearance.background` doubles as the watercolour paper's base tint (previously a hardcoded shader constant), giving it real product meaning beyond satisfying the contract.
- Evidence: `src/app/watercolor-engine.ts` composite fragment shader reads `uBackgroundColor`/`uIncludeBackground` and renders transparent pigment-only output when the background is excluded; `src/app/WatercolorCanvas.tsx` calls `shouldIncludeToolcraftPreviewBackground(state)` for live preview; `src/routes/index.tsx` passes `background`/`includeBackground` (from `shouldIncludeToolcraftPreviewBackground`) into `createToolcraftPngExportCanvas`. Covered by acceptance ids `export.includeBackground` and `appearance.background` in `src/app/app-acceptance.ts` and by browser tests in `e2e/app-acceptance-watercolour.spec.ts`.

### Performance

- Decision: `src/app/app-performance.ts` declares 27 scenarios (one preview-render stress scenario, per-control drag/change scenarios for every slider/segmented/action/switch/color control including the later-added `paint.mixingArea.reset`, `export.includeBackground`, and `appearance.background`, viewport zoom/stability/animation-drag scenarios, and an 8K export scenario) plus the renderer technique/pipeline inventory documented above. A precomputed paper-heightmap texture (rendered once on init/resize/roughness-or-relief change, sampled by both the simulation and composite passes) replaced recomputing the noise function inline in both passes every frame — a real, hardware-agnostic optimization, though it did not materially change interaction latency under this sandbox's software GL rendering (see Verification).
- Reason: The watercolour simulation runs a real per-pixel GPU pass every frame, so every control that can change simulation workload or responsiveness needs an explicit budget and stress fixture; see `docs/toolcraft/performance.md`.
- Evidence: `pnpm exec vitest run src/app/app-performance-scenarios.test.ts` passes (27/27 scenarios well-formed); `pnpm exec playwright test e2e/app-performance.spec.ts` (the structural/meta-validator) passes. The functional browser runs in `e2e/app-performance-watercolour.spec.ts` are known to be slow in this sandbox because of software (SwiftShader-class) GL rendering (a single stroke at default size takes ~17-22s to render, confirmed via direct `requestAnimationFrame` instrumentation to be GPU-rasterization-bound, not shader-logic-bound) — an accepted environment limitation, not something further shader optimization can fix. This suite is not required to fully pass in this sandbox; the structural/meta-validator (`e2e/app-performance.spec.ts`) is what's verified.

## Evidence

- Source reviewed: Local Toolcraft docs and runtime source listed above, plus `docs/toolcraft/schema-reference.md` "Export" section (background/transparency contract) re-read while filling in acceptance data.
- Contract applied: Single-controls-panel architecture confirmed against runtime source before finalizing layout; user confirmed the merged layout via `AskUserQuestion`. Acceptance-authoring iteration additionally applied `acceptance-product-observable` (every control/action has a real automated + browser test) and the mandatory Export PNG background/transparency contract.

## Verification

- Run: `pnpm typecheck` passes.
- Run: `pnpm exec vitest run src` passes (266/266: `app-schema.test.ts`, `app-performance.test.ts`, `app-acceptance.test.ts`, `app-performance-scenarios.test.ts`, `app-acceptance-scenarios.test.ts`).
- Run: `pnpm exec playwright test e2e/app-browser-acceptance.spec.ts e2e/app-performance.spec.ts` (shared structural/meta-validators) passes, 18/18.
- Run: `pnpm exec playwright test e2e/app-controls.spec.ts` passes, 2/2, after fixing two stale assertions left over from the neutral-starter version (a "no Pigment field" check that no longer applies now that the Pigments section exists, and a pigment-swatch role mismatch — swatches are `role="radio"`, not `role="button"`).
- Run: `pnpm exec playwright test e2e/app-acceptance-watercolour.spec.ts`, run to real completion across the full suite (batched due to serial-mode + ~1-2min/interaction under software GL rendering): 21 of 22 scenarios verified working end to end. The one exception (`resolution scale renders a discrete slider...`) exceeds `expectToolcraftDiscreteSliderDragSmoothness`'s fixed 500ms interaction budget (observed ~31s) — the same accepted software-GL-rendering limitation already documented for the performance suite, not a product defect.
- Real functional verification (not just structural) surfaced and fixed six genuine bugs, all now covered by passing tests:
  1. `watercolor-engine.ts` WebGL2 context used `preserveDrawingBuffer: false`; external reads of the live canvas (e2e product-observable snapshots, and potentially any future screenshot/embed use) could see an already-cleared backbuffer. Fixed to `true`.
  2. `getByRole("button", { name: "Reset" })` matched ambiguously against the runtime's per-section "Reset X section" tooltip buttons (substring name matching). Fixed with `exact: true`.
  3. The built-in Switch primitive renders its visible label as an unassociated sibling (no `aria-label`/`aria-labelledby`), so `getByRole("switch", { name })` never resolves; fixed by scoping to the labeled Field and using an unnamed role query instead.
  4. `appearance.background` (a built-in `color` control) commits `{hex: string}`, not a plain string; `WatercolorCanvas.tsx` and `src/routes/index.tsx` read it as a raw string, throwing `hex.replace is not a function` inside the composite draw call the first time a user changed it. Fixed by accepting both shapes.
  5. The built-in Select's rendered options have no accessible name (their text sits inside a scroll-fade wrapper), so `getByRole("option", { name })` never resolves; fixed by matching option role + exact visible text instead.
  6. The "Resolution" field label is a literal prefix of the built-in Runtime Setup "Resolution scale" field label, so the shared `getToolcraftFieldByLabel` prefix match resolved both; fixed by passing a negative-lookahead label at the one ambiguous call site.
- Browser performance checkpoint: not required for the acceptance/testing feature loop; see Performance decision above for the accepted software-GL environment limitation.

## Risks

- Risk: Scope is large (real-time GPU simulation, two custom controls, full acceptance/performance suites). Tracked via task list across the implementation session.
- Risk: The background-exclusion composite path (transparent pigment-only export) is a new shader branch layered onto the existing composite pass; it only activates when `export.includeBackground` is turned off, so the default (background included) visual output is unchanged.
