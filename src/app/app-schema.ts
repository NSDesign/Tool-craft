import { defineToolcraft } from "@/toolcraft/runtime";

import { defaultPigmentHex, pigments, waterPigmentValue } from "./pigments";

export const appSchema = defineToolcraft({
  canvas: {
    draggable: false,
    enabled: true,
    renderScale: true,
    sizing: { mode: "editable-output" },
    upload: false,
  },
  export: {
    png: {
      background: "include",
    },
  },
  panels: {
    controls: {
      sections: [
        {
          controls: {
            pigment: {
              defaultValue: defaultPigmentHex,
              description:
                "Eight pigments plus a clear Water swatch: painting with Water wets the paper, dilutes wet paint, and re-dissolves dried paint instead of adding colour. Picking any swatch re-dips the brush to a full charge.",
              label: "Pigment",
              options: [
                ...pigments.map((pigment) => ({
                  label: pigment.name,
                  value: pigment.hex,
                })),
                { label: "Water", value: waterPigmentValue },
              ],
              orderRole: "color",
              performanceReason:
                "Selecting a swatch only updates the active pigment reference used by the next stroke; it does not change simulation resolution or pass count.",
              performanceRole: "responsiveness",
              target: "paint.currentPigmentColor",
              type: "paintSwatches",
            },
          },
          title: "Pigments",
        },
        {
          controls: {
            hairType: {
              defaultValue: "sable",
              description:
                "Sable hair lays down smooth, continuous strokes; hog hair breaks strokes into a rougher bristle texture.",
              label: "Hair type",
              options: [
                { label: "Sable", value: "sable" },
                { label: "Hog", value: "hog" },
              ],
              orderRole: "mode",
              performanceReason:
                "Hair type only changes bristle-edge noise in the stroke stamp mask; it does not change simulation resolution or pass count.",
              performanceRole: "responsiveness",
              target: "brush.hairType",
              type: "segmented",
            },
            type: {
              defaultValue: "round",
              label: "Type",
              options: [
                { label: "Round", value: "round" },
                { label: "Filbert", value: "filbert" },
                { label: "Square", value: "square" },
              ],
              orderRole: "mode",
              performanceReason:
                "Brush type only changes the stroke stamp shape used when depositing paint; it does not change simulation resolution or pass count.",
              performanceRole: "responsiveness",
              target: "brush.type",
              type: "segmented",
            },
            size: {
              defaultValue: 4,
              label: "Size",
              max: 10,
              min: 0,
              orderRole: "primary",
              performanceReason:
                "Brush size changes the stamp radius for the next stroke deposit, touching more simulation texels per frame while the stroke is active.",
              performanceRole: "workload",
              step: 1,
              target: "brush.size",
              type: "slider",
            },
          },
          title: "Brush",
        },
        {
          controls: {
            mixingArea: {
              defaultValue: { pixels: null },
              label: "Mixing palette",
              orderRole: "primary",
              performanceReason:
                "The mixing palette is a small fixed-size canvas independent of the main canvas resolution.",
              performanceRole: "responsiveness",
              target: "paint.mixingArea",
              type: "mixingArea",
            },
            reset: {
              actions: [{ icon: "eraser", label: "Reset", value: "mixing-reset" }],
              label: "Palette",
              orderRole: "action",
              performanceReason:
                "Clearing the mixing palette is a one-shot small fixed-size canvas clear.",
              performanceRole: "responsiveness",
              target: "paint.mixingArea.reset",
              type: "actions",
            },
          },
          title: "Mixing",
        },
        {
          controls: {
            dryingSpeed: {
              defaultValue: 40,
              label: "Drying speed",
              max: 100,
              min: 0,
              orderRole: "detail",
              performanceReason:
                "Drying speed only scales the per-frame evaporation multiplier already computed every frame; it does not add render passes or change texture resolution.",
              performanceRole: "responsiveness",
              step: 1,
              target: "paper.dryingSpeed",
              type: "slider",
              unit: "%",
            },
            reliefHeight: {
              defaultValue: 50,
              label: "Relief height",
              max: 100,
              min: 0,
              orderRole: "detail",
              performanceReason:
                "Relief height is a shader uniform consumed by the existing procedural paper-heightmap function; it does not add render passes or regenerate a texture.",
              performanceRole: "responsiveness",
              step: 1,
              target: "paper.reliefHeight",
              type: "slider",
              unit: "%",
            },
            roughness: {
              defaultValue: 50,
              label: "Roughness",
              max: 100,
              min: 0,
              orderRole: "detail",
              performanceReason:
                "Roughness is a shader uniform consumed by the existing procedural paper-heightmap function; it does not add render passes or regenerate a texture.",
              performanceRole: "responsiveness",
              step: 1,
              target: "paper.roughness",
              type: "slider",
              unit: "%",
            },
            preset: {
              actions: [
                { label: "Hot press", value: "paper-preset-hot-press" },
                { label: "Cold press", value: "paper-preset-cold-press" },
                { label: "Rough", value: "paper-preset-rough" },
              ],
              description:
                "Classic watercolour paper presets: Hot press is smooth, Cold press is medium-textured, Rough is heavily textured. Presets set the Roughness and Relief height sliders.",
              label: "Texture preset",
              orderRole: "action",
              performanceReason:
                "A preset is a one-shot write to the existing Roughness/Relief height slider values; the heightmap regenerates once, exactly as a manual slider change does.",
              performanceRole: "responsiveness",
              target: "paper.texturePreset",
              type: "actions",
            },
            clear: {
              actions: [{ icon: "eraser", label: "Clear", value: "canvas-clear-painting" }],
              label: "Painting",
              orderRole: "action",
              performanceReason:
                "Clearing writes a single blank frame to the existing simulation textures.",
              performanceRole: "responsiveness",
              target: "canvas.paintLayer",
              type: "actions",
            },
          },
          title: "Paper",
        },
        {
          controls: {
            edgeDarkening: {
              defaultValue: 45,
              label: "Edge darkening",
              max: 100,
              min: 0,
              orderRole: "strength",
              performanceReason:
                "Edge darkening scales an existing per-pixel wetness-gradient term inside the shared diffusion pass; it does not add render passes.",
              performanceRole: "responsiveness",
              step: 1,
              target: "dynamics.edgeDarkening",
              type: "slider",
              unit: "%",
            },
            granulation: {
              defaultValue: 35,
              label: "Granulation",
              max: 100,
              min: 0,
              orderRole: "strength",
              performanceReason:
                "Granulation scales an existing per-pixel paper-heightmap term inside the shared diffusion pass; it does not add render passes.",
              performanceRole: "responsiveness",
              step: 1,
              target: "dynamics.granulation",
              type: "slider",
              unit: "%",
            },
            pigmentOpacity: {
              defaultValue: 55,
              description:
                "Lower opacity lets successive glazes build up gradually; higher opacity makes each stroke land closer to full strength immediately.",
              label: "Pigment opacity",
              max: 100,
              min: 0,
              orderRole: "strength",
              performanceReason:
                "Pigment opacity scales the absorption strength written by the existing deposit pass; it does not add render passes.",
              performanceRole: "responsiveness",
              step: 1,
              target: "dynamics.pigmentOpacity",
              type: "slider",
              unit: "%",
            },
            tilt: {
              defaultValue: 0,
              description:
                "Easel tilt: 0 lays the paper flat with no directional flow; higher values tilt it upright so wet paint runs down the page and can drip.",
              label: "Tilt",
              max: 100,
              min: 0,
              orderRole: "strength",
              performanceReason:
                "Tilt scales the gravity term inside the existing force-field pass; it does not add render passes or change texture resolution.",
              performanceRole: "responsiveness",
              step: 1,
              target: "dynamics.tilt",
              type: "slider",
              unit: "%",
            },
            wetnessSpread: {
              defaultValue: 55,
              description:
                "Controls how far wet pigment bleeds into neighbouring paper before it dries.",
              label: "Wetness spread",
              max: 100,
              min: 0,
              orderRole: "strength",
              performanceReason:
                "Wetness spread scales the existing per-pixel diffusion kernel weight inside the shared simulation pass; it does not add render passes.",
              performanceRole: "responsiveness",
              step: 1,
              target: "dynamics.wetnessSpread",
              type: "slider",
              unit: "%",
            },
          },
          title: "Watercolour Dynamics",
        },
        {
          controls: {
            include: {
              defaultValue: true,
              label: "Include",
              orderRole: "primary",
              performanceReason:
                "Toggling background inclusion only changes which pixels the composite/export pass writes as transparent; it does not add render passes or change simulation resolution.",
              performanceRole: "responsiveness",
              target: "export.includeBackground",
              type: "switch",
            },
            paperColor: {
              defaultValue: "#f5eede",
              label: false,
              orderRole: "color",
              performanceReason:
                "The paper background color only changes the tint uniform consumed by the existing composite pass; it does not add render passes or change simulation resolution.",
              performanceRole: "responsiveness",
              target: "appearance.background",
              type: "color",
            },
          },
          layoutGroups: [
            {
              columns: 2,
              controls: ["include", "paperColor"],
              layout: "inline",
            },
          ],
          title: "Background",
        },
        {
          controls: {
            imageFormat: {
              defaultValue: "png",
              label: "Format",
              options: [
                { label: "PNG", value: "png" },
                { label: "JPEG", value: "jpg" },
              ],
              orderRole: "mode",
              performanceReason:
                "Export format only changes the final encode step; it does not change live simulation workload.",
              performanceRole: "responsiveness",
              target: "export.image.format",
              type: "select",
            },
            imageResolution: {
              defaultValue: "4k",
              label: "Resolution",
              options: [
                { label: "2K", value: "2k" },
                { label: "4K", value: "4k" },
                { label: "8K", value: "8k" },
              ],
              orderRole: "mode",
              performanceReason:
                "Export resolution changes the one-shot export render/readback cost, not the live interactive simulation workload.",
              performanceRole: "workload",
              target: "export.image.resolution",
              type: "select",
            },
          },
          layoutGroups: [
            {
              columns: 2,
              controls: ["imageFormat", "imageResolution"],
              layout: "inline",
            },
          ],
          title: "Image Export",
        },
        {
          actionGroup: "primary",
          controls: {
            footer: {
              actions: [
                { icon: "upload-simple", label: "Export PNG", value: "export-png" },
              ],
              target: "panel.actions",
              type: "panelActions",
            },
          },
          title: "Export",
        },
      ],
      title: "Watercolour",
    },
  },
  persistence: {
    include: ["values", "canvas", "panels"],
    key: "toolcraft:watercolour-painter:state:v1",
    storage: "localStorage",
    version: 1,
  },
  toolbar: {
    history: false,
    radar: true,
    theme: true,
    zoom: true,
  },
});
