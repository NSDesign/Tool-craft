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

### Iteration 2 — Simulation realism rework (Small-paper model)

- Request: User reported the simulation doesn't feel like real watercolour: paint doesn't flow, wet colours don't mix into each other on canvas, a pigment saturation bug caps how dark the *same* pigment can go (but switching pigment resets the cap), edges are too grainy/noisy instead of soft watercolour blooms, wet-on-wet vs wet-on-dry blending isn't distinguished, paper texture should be visible/selectable, and the Water section should fold into brush pigment selection as a "wet brush" swatch instead of a standalone Refresh action.
- Task type: Renderer/simulation rework plus schema/control changes (Tier 3 — renderer/canvas/runtime feature, per `AGENTS.md`'s verification tier classifier).
- User-visible result: Paint now flows (surface displacement with easel-tilt gravity, surface tension, and spreading), wet strokes blend into each other while dried strokes keep their shape under new paint, repeated strokes of the same pigment keep darkening (true glazing), a clear Water swatch wets/dilutes/re-dissolves paint, blank paper shows its texture, a Paper "Texture preset" row (Hot press/Cold press/Rough) one-shot-writes the Roughness/Relief sliders, and a new Tilt slider (default 0 = flat) makes wet washes run down the page.
- Source/reference checked: David Small, "Modeling Watercolor by Simulating Diffusion, Pigment, and Paper Fibers" (MIT Media Lab, Visible Language Workshop) — supplied by the user as a PostScript file after the original Google Drive link returned 403 through this environment's egress policy. Full text extracted from the .ps (8 pages, equations [1]–[13]). An earlier assumption that the reference was Curtis et al. 1997 was wrong and is corrected here; the implemented model is Small's cellular-automata formulation.
- Reference inputs: `f6d544df-Modeling_Watercolor_by_Simulating_Diffusion_Pigment_and_Paper_Fibers.ps` (user upload). Key model elements adopted: per-cell surface vs infused layers for water and pigment, displacement force `D = g·water + s·Σ(water±n)/n + sp·(water₋₁ − water₊₁)` (eq [1]), neighbour-exchange movement rules (eqs [2]–[5]), absorbency/dampness-gated infused diffusion (eqs [6]–[8]), capacity-clamped absorption `A = k·a·water_surface` (eqs [9]–[10]), evaporation ∝ humidity, and subtractive rendering `pixel = paper − (pigment_surface + pigment_infused)` (eqs [11]–[13]).
- Docs/contracts read: `AGENTS.md` verification tier classifier, `docs/toolcraft/performance.md` (render pipeline inventory), `docs/toolcraft/schema-reference.md` (actions/slider rules), plus runtime source `state/persistence.ts` (persisted payload shape for the probe seed).
- Contract rules applied: `renderer-technique-inventory` (pipeline inventory updated for the new force-field pass), `controls-product-coverage` (every added/removed control re-covered in acceptance/performance), `acceptance-product-observable`, `performance-coverage-levels`, `canvas-no-app-ui`.
- Root cause diagnosis for the reported bugs:
  - Saturation cap: the old deposit shader used `absorption += (target − absorption) · strength`, an exponential blend that asymptotically approaches one pigment's target — repeat strokes of the same pigment plateau, while switching pigment moves toward a different asymptote and looks like it "unlocked" more range. Fixed by additive CMY concentration deposit + subtractive render (no per-pigment asymptote), verified visually: four passes of the same red are dramatically darker than one.
  - Wet/dry mixing: the old sim had one absorption field with a single scalar wetness and uniform diffusion, so it could not distinguish wet-meets-wet from wet-over-dry. Fixed by the surface/infused split: fresh strokes are mobile surface paint that flows and mixes; dried paint is infused and only re-mobilises when re-dampened (dampness-gated pigment diffusion uses the drier side of each neighbour pair).
  - No flow: the old diffusion was an isotropic 4-neighbour blur with no forces. Fixed by the force-field pass (tilt gravity + surface-tension kernel + spreading) driving surface advection.
  - Grainy edges: the old brush mask used per-pixel high-frequency noise on the stroke edge and granulation injected noise into the composite. Fixed by low-frequency bristle jitter, real diffusion edges, and granulation moved into absorption (pigment settles into paper cavities — dried-wash texture, not edge noise).
- Decision:
  1. `src/app/watercolor-engine.ts` rewritten to the Small model: RGBA16F state textures (`EXT_color_buffer_float` required — 8-bit quantised away additive pigment and small fluxes), surface + infused ping-pong pairs written in one MRT `simulation-step` pass, a new `force-field` pass (radius-4 1/n-weighted tension kernel, spreading, tilt gravity), capacity-clamped absorption with granulation-weighted settling, evaporation ∝ drying speed, and a subtractive composite with relief shading strong enough to show blank-paper texture. Deposit/flow/diffusion/absorption rates are dt-scaled to a 60 steps/s reference with stability clamps, so behaviour is frame-rate independent (also removes stroke "beading" at low frame rates).
  2. Water becomes the 9th Pigments swatch (sentinel value `water`, droplet-styled in `PaintSwatchesControl`): deposits surface water only, dilutes wet paint, and lifts a little infused pigment back into the mobile layer (re-wetting). The standalone Water section and `water-refresh` action are removed — picking any swatch (including Water) re-dips the brush to full charge via the existing `pickedAt` mechanism.
  3. Paper section gains a `Texture preset` actions control (Hot press/Cold press/Rough) whose panel actions `controls.setValue` the existing Roughness/Relief height sliders (single source of truth); Watercolour Dynamics gains the `Tilt` slider (default 0 = flat, user-confirmed framing) scaling the gravity term.
  4. Mixing palette: water dabs thin the mix back toward the palette base instead of depositing colour.
- Alternatives rejected: full per-pigment Kubelka-Munk optical constants with per-pigment concentration channels — disproportionate complexity/perf risk versus Small's CMY subtractive model, which fixes every reported symptom; a full pressure-projected Navier-Stokes shallow-water solve — Small's displacement-force formulation achieves the requested flow/drip behaviour with one extra cheap pass; labelling the new slider "Gravity" — rejected with the user in favour of "Tilt" (gravity is constant; the artist varies easel tilt), default 0 confirmed by the user.
- State/output mapping: swatch picks (including Water) write `paint.currentPigmentColor` {hex|"water", pickedAt}; Tilt writes `dynamics.tilt` consumed as the force-pass gravity uniform; paper presets dispatch `controls.setValue` to `paper.roughness`/`paper.reliefHeight`, regenerating the cached heightmap once; the heightmap doubles as the absorbency/capacity field so Roughness/Relief/preset changes visibly change both blank paper and wash texture; pointer strokes deposit additive CMY + water into the surface layer, which the force/diffusion/absorption passes evolve into the infused layer rendered subtractively.
- Files changed: `src/app/watercolor-engine.ts` (rewrite), `src/app/pigments.ts`, `src/app/PaintSwatchesControl.tsx`, `src/app/MixingAreaControl.tsx`, `src/app/WatercolorCanvas.tsx`, `src/app/app-schema.ts`, `src/routes/index.tsx`, `src/app/app-acceptance.ts`, `src/app/app-performance.ts`, `src/app/app-acceptance-scenarios.test.ts`, `src/app/app-performance-scenarios.test.ts`, `src/app/app-schema.test.ts`, `src/app/app-acceptance.test.ts` (control-order list), `e2e/app-acceptance-watercolour.spec.ts`, `e2e/app-performance-watercolour.spec.ts`, `e2e/app-controls.spec.ts`, `docs/watercolour-renderer-plan.md`, this worklog.
- Verification: Tier 3. `pnpm typecheck` passes; `pnpm exec vitest run src` passes; visual behaviour verified in a real browser via an in-process Vite+Playwright probe at a reduced canvas size with screenshot evidence for all six requested behaviours (wet-on-wet mixing, same-colour build-up beyond the old cap, wet-over-dry edge retention, water-swatch re-wetting of dried paint, tilt-driven downward flow, paper-preset texture change); structural meta-validators and targeted functional e2e runs recorded in the Verification section below.
- Skipped checks: None beyond the standing software-GL performance-budget limitation documented under Performance.
- Risks:
  - Risk: The three-pass simulation with a radius-4 tension kernel is heavier per frame than the previous two-pass version; real GPUs absorb it, but very large canvases at Resolution scale 2 on weak hardware will run the simulation visibly slower (the model is frame-rate independent in rates but still computed per frame).
  - Risk: `EXT_color_buffer_float` is required; the engine throws a clear error if a WebGL2 context lacks it (universally available in practice, including SwiftShader).

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

- Decision: Seven product controls-panel sections: Pigments, Brush, Mixing, Paper, Watercolour Dynamics, Background, Image Export (the standalone Water section was removed in Iteration 2 — clear water is now the 9th Pigments swatch, and picking any swatch re-dips the brush).
- Reason: See Control Section Inventory (`starterControlSectionInventory` in `src/app/app-acceptance.ts`) for the per-section entity/workflow-stage grouping reasons. "Colours" was renamed to "Pigments" because a bare "Colours"/"Colors" section title collides with the acceptance validator's UI-control-type-name rule (it must name the product entity, not a component type). Brush controls are ordered Hair type, Type, Size (mode selectors before the primary size slider) and Paper controls are ordered Drying speed, Relief height, Roughness, Texture preset, Clear (parameters before action buttons) to satisfy the mode/input/primary-before-strength/detail/advanced/action ordering rule enforced by `getToolcraftControlOrderErrors`.
- Evidence: `pnpm exec vitest run src/app/app-acceptance.test.ts` passes with the full `appAcceptance` matrix and `starterControlSectionInventory` filled in; `e2e/app-acceptance-watercolour.spec.ts` exercises every control's product-observable behavior; `e2e/app-browser-acceptance.spec.ts` (shared meta-validator) passes.

### Export

- Decision: `Export PNG` sticky footer action; `Image Export` section with `export.image.format` (png/jpg) and `export.image.resolution` (2k/4k/8k); a required `Background` section (`export.includeBackground` Switch labeled "Include" plus an unlabeled `appearance.background` paper-tint Color control, one two-column inline row) directly before `Image Export`.
- Reason: Still-output product app per `docs/toolcraft/schema-reference.md`. Every Toolcraft app that exposes `Export PNG` must expose a user-facing background color control and an `export.includeBackground` toggle so PNG export can produce a transparent-background image instead of hardcoding the product background (`schema-reference.md` "Export" section); this was missing from the first implementation pass and was added as a real bug fix, not just an acceptance-data placeholder. `appearance.background` doubles as the watercolour paper's base tint (previously a hardcoded shader constant), giving it real product meaning beyond satisfying the contract.
- Evidence: `src/app/watercolor-engine.ts` composite fragment shader reads `uBackgroundColor`/`uIncludeBackground` and renders transparent pigment-only output when the background is excluded; `src/app/WatercolorCanvas.tsx` calls `shouldIncludeToolcraftPreviewBackground(state)` for live preview; `src/routes/index.tsx` passes `background`/`includeBackground` (from `shouldIncludeToolcraftPreviewBackground`) into `createToolcraftPngExportCanvas`. Covered by acceptance ids `export.includeBackground` and `appearance.background` in `src/app/app-acceptance.ts` and by browser tests in `e2e/app-acceptance-watercolour.spec.ts`.

### Performance

- Decision: `src/app/app-performance.ts` declares 28 scenarios (one preview-render stress scenario, per-control drag/change scenarios for every slider/segmented/action/switch/color control — including Iteration 2's `dynamics.tilt` drag and `paper.texturePreset` change, replacing the removed Water-section refresh scenario — plus viewport zoom/stability/animation-drag scenarios and an 8K export scenario) and the renderer technique/pipeline inventory documented above. The pipeline is now four passes: `force-field` → `simulation-step` (MRT) → `preview-composite`, plus the export-only readback/encode pair. A precomputed paper-heightmap texture (rendered once on init/resize/roughness-or-relief change, sampled by the simulation and composite passes, and reused as the absorbency/capacity field) replaced recomputing the noise inline every frame.
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

### Iteration 2 verification (simulation realism rework)

- Run: `pnpm typecheck` passes.
- Run: `pnpm exec vitest run src` passes (268/268 across all five suites, including the updated control-order list, section inventory, tilt/preset scenarios, and worklog validation).
- Run: `pnpm exec playwright test e2e/app-performance.spec.ts e2e/app-browser-acceptance.spec.ts` (shared structural/meta-validators) passes, 18/18, in 31s — the idle-skip (force/simulation passes only run while there is content with recent stroke activity) restored fast first-load even at the default 8.3MP backing size.
- Run: `pnpm exec playwright test e2e/app-acceptance-watercolour.spec.ts e2e/app-controls.spec.ts --workers=1` (excluding the one documented budget-limited scenario below) passes 24/24 in 3.3 minutes. The acceptance suite now seeds a small persisted canvas in `beforeEach` (acceptance verifies behaviour; declared workload/stress fixtures remain full-size in the performance suite), which is what makes the full functional suite reliably runnable under this sandbox's software GL rendering.
- Known limitation (unchanged): `resolution scale renders a discrete slider...` still exceeds `expectToolcraftDiscreteSliderDragSmoothness`'s fixed 500ms interaction budget under SwiftShader because each discrete step reallocates the simulation framebuffers — the same accepted software-GL limitation documented for the performance suite.
- Run: `pnpm build` passes.
- Visual probe evidence (in-process Vite+Playwright, screenshots reviewed): wet-on-wet strokes blend; four same-colour passes build far darker than one (saturation cap gone); wet-over-dry retains the dried stroke's edge; the Water swatch re-wets and bleeds dried paint; maximum Tilt makes a wet blob sag/run down-screen; Rough vs Hot press presets visibly change blank-paper grain and write the sliders.

## Risks

- Risk: Scope is large (real-time GPU simulation, two custom controls, full acceptance/performance suites). Tracked via task list across the implementation session.
- Risk: The background-exclusion composite path (transparent pigment-only export) is a new shader branch layered onto the existing composite pass; it only activates when `export.includeBackground` is turned off, so the default (background included) visual output is unchanged.
