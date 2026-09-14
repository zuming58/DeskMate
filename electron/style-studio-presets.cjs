const STYLE_STUDIO_PRESETS = Object.freeze({
  paper: Object.freeze({ name: "纸间光影", prompt: "Layered paper-cut sculpture, tactile paper fibers, cobalt blue and warm cream botanical layers, soft dimensional shadows, refined handcrafted details." }),
  yarn: Object.freeze({ name: "毛线手作", prompt: "Hand-knitted wool miniature, visible soft yarn loops, cream and teal textiles, warm macro photography, charming handcrafted details." }),
  glass: Object.freeze({ name: "玻璃花房", prompt: "Miniature glass terrarium, delicate moss and leaves, transparent glass dome, warm natural product photography, subtle reflections." }),
  clay: Object.freeze({ name: "黏土质感", prompt: "Handmade clay sculpture, matte tactile finish, subtle finger-made texture, warm apricot and cream palette, studio product lighting." }),
  pixel: Object.freeze({ name: "像素世界", prompt: "Refined voxel miniature, cubic teal shapes, tiny block plants, warm cream background, clean isometric aesthetic." }),
  ink: Object.freeze({ name: "水墨微景", prompt: "Contemporary Chinese ink-wash miniature on warm xuan paper, expressive ink edges, restrained cobalt and celadon mineral pigments, quiet mountain-and-bamboo atmosphere." }),
  chrome: Object.freeze({ name: "液态银蓝", prompt: "Pearlescent brushed chrome collectible with translucent cyan glass accents, restrained cobalt rim light, clean warm-white premium industrial-design studio." }),
  storybook: Object.freeze({ name: "绘本暖光", prompt: "Premium hand-painted gouache picture-book illustration, colored-pencil edges, soft paper grain, celadon, cobalt and apricot palette, warm morning light." }),
  jelly: Object.freeze({ name: "果冻软糖", prompt: "Translucent aqua jelly collectible, soft gummy material, subtle internal bubbles, rounded refraction, glossy cobalt highlights, clean warm-white tabletop, premium product lighting." }),
  blocks: Object.freeze({ name: "积木模型", prompt: "Intricate interlocking toy-brick sculpture with clearly visible studs and joints throughout the subject, glossy mint, cobalt-blue and warm-cream bricks, playful premium product photography." }),
});

function normalizeStrength(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error("style-studio-strength-invalid");
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeBrief(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

function buildStyleStudioPrompt(styleId, strength, brief = "") {
  const preset = STYLE_STUDIO_PRESETS[String(styleId || "")];
  if (!preset) throw new Error("style-studio-style-invalid");
  const safeStrength = normalizeStrength(strength);
  const safeBrief = normalizeBrief(brief);
  return {
    styleId: String(styleId),
    styleName: preset.name,
    strength: safeStrength,
    brief: safeBrief,
    prompt: [
      "Preserve the recognizable identity, main subject, pose and composition of the source image.",
      preset.prompt,
      `Creative transformation level: ${safeStrength}/100.`,
      safeBrief ? `Creative brief: ${safeBrief}` : "",
      "Output one polished artwork only. No application interface, border, watermark, caption or labels.",
    ].filter(Boolean).join("\n"),
  };
}

module.exports = { STYLE_STUDIO_PRESETS, buildStyleStudioPrompt, normalizeBrief, normalizeStrength };
