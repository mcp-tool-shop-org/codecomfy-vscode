import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'codecomfy-vscode',
  description: 'Drive ComfyUI from VS Code — image, video, audio, 3D, and image understanding. 27 verified workflows, with missing nodes and models named before anything runs.',
  logoBadge: 'CV',
  brandName: 'codecomfy-vscode',
  repoUrl: 'https://github.com/mcp-tool-shop-org/codecomfy-vscode',
  npmUrl: 'https://www.npmjs.com/package/codecomfy-vscode',
  footerText: 'MIT Licensed — built by <a href="https://github.com/mcp-tool-shop-org" style="color:var(--color-muted);text-decoration:underline">mcp-tool-shop-org</a>',

  hero: {
    badge: 'VS Code extension',
    headline: 'Six ComfyUI profiles',
    headlineAccent: 'without leaving your editor.',
    description: 'Image, video, audio, 3D meshes, and image understanding — driven from the Command Palette. Every shipped workflow is verified against the live ComfyUI catalog, and missing nodes or models are named before anything is submitted.',
    primaryCta: { href: '#quickstart', label: 'Get started' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Command', code: 'Ctrl+Shift+P → CodeComfy: Run… (all profiles)' },
      { label: 'Pick', code: 'Profile → preset → the inputs it actually needs' },
      { label: 'Preflight', code: 'Missing model? Named before a run is spent.' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Core Capabilities',
      subtitle: 'Six profiles, 27 verified workflows.',
      features: [
        { title: 'Six Profiles', desc: 'Image, Video, Audio, 3D, Inference, and Metadata — from one command. Pick a profile, pick a preset, answer only the inputs that preset actually needs.' },
        { title: 'Verified Workflows', desc: 'The 27 reference graphs are vendored from comfy-headless, where every node type is checked against the live ComfyUI catalog. We do not hand-author graphs — a wrong graph runs green and returns nothing.' },
        { title: 'Preflight', desc: 'Nodes checked against /object_info, models against /models. A missing node names its pack, a missing model names its folder — and nothing is submitted, so no GPU time is wasted.' },
        { title: 'Live Progress', desc: 'Real sampler steps in the status bar over ComfyUI’s WebSocket — not a static “generating…” for the whole run. Falls back to polling automatically; outputs are never affected.' },
        { title: 'FFmpeg Optional', desc: 'Presets ending in CreateVideo → SaveVideo are encoded by the server itself. FFmpeg is only needed for frame-assembly presets.' },
        { title: 'Workspace Workflow', desc: 'Outputs save to .codecomfy/ in your workspace — images, video, audio, meshes, and captions alike. Run metadata and index live there for reproducibility.' },
        { title: 'PNG Provenance', desc: 'Read the workflow ComfyUI embedded in any output PNG, entirely offline. The fastest way to recover exactly what produced an image somebody sent you.' },
      ],
    },
    {
      kind: 'data-table',
      id: 'profiles',
      title: 'The Six Profiles',
      subtitle: 'Inputs are derived from each preset’s own graph, not from its profile.',
      columns: ['Profile', 'What it does', 'Presets'],
      rows: [
        ['Image', 'Text-to-image, image edit, union ControlNet', 'Qwen txt2img, Qwen edit, ControlNet (Qwen / SDXL)'],
        ['Video', 'Text- and image-to-video on real temporal models', 'Hunyuan 1.5 i2v + 720p, Wan 14B, LTX, Mochi'],
        ['Audio', 'Text-to-music and stem separation', 'ACE-Step 1.5 (music / jingle / draft / mp3), separation'],
        ['3D', 'Image-to-mesh, exported as GLB', 'Hunyuan3D-2 (draft / standard / detail)'],
        ['Inference', 'Caption, tag, detect, segment, OCR', 'Florence-2 (7 tasks)'],
        ['Metadata', 'Read the workflow embedded in a PNG', 'Local-only — no server needed'],
      ],
    },
    {
      kind: 'code-cards',
      id: 'quickstart',
      title: 'Installation & Setup',
      cards: [
        { title: 'Install from VSIX', code: 'Extensions → ··· → Install from VSIX…\n\nDownload latest from Releases' },
        { title: 'Configure ComfyUI', code: 'Settings → Extensions → CodeComfy\n\ncomfyuiUrl: http://127.0.0.1:8188\nffmpegPath: (optional — only for\n            frame-assembly presets)' },
        { title: 'Run anything', code: 'Ctrl+Shift+P → CodeComfy: Run… (all profiles)\n\nProfile → preset → inputs.\nPreflight names anything missing first.' },
        { title: 'View Outputs', code: 'Outputs saved to .codecomfy/outputs/\n\nImages, video, audio, .glb meshes,\nand captions all land here.' },
      ],
    },
  ],
};
