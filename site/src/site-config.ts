import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'codecomfy-vscode',
  description: 'Generate images and videos with ComfyUI directly from VS Code. Prompt, poll, download, assemble — all without leaving your editor.',
  logoBadge: 'CV',
  brandName: 'codecomfy-vscode',
  repoUrl: 'https://github.com/mcp-tool-shop-org/codecomfy-vscode',
  npmUrl: 'https://www.npmjs.com/package/codecomfy-vscode',
  footerText: 'MIT Licensed — built by <a href="https://github.com/mcp-tool-shop-org" style="color:var(--color-muted);text-decoration:underline">mcp-tool-shop-org</a>',

  hero: {
    badge: 'VS Code extension',
    headline: 'ComfyUI generation',
    headlineAccent: 'without leaving your editor.',
    description: 'Prompt, generate, download, and assemble images and videos with ComfyUI directly from VS Code. Status bar polling, auto-gallery, and FFmpeg assembly built in.',
    primaryCta: { href: '#quickstart', label: 'Get started' },
    secondaryCta: { href: '#features', label: 'Features' },
    previews: [
      { label: 'Command', code: 'Ctrl+Shift+P → CodeComfy: Generate Image (HQ)' },
      { label: 'Prompt', code: 'masterpiece, dynamic pose, soft lighting, 8k' },
      { label: 'Watch', code: 'Status bar updates as generation completes' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Core Capabilities',
      subtitle: 'Everything built into CodeComfy.',
      features: [
        { title: 'ComfyUI Integration', desc: 'Talks directly to your ComfyUI HTTP API. Configure the URL once, generate without touching a browser.' },
        { title: 'Image & Video', desc: 'HQ image generation or short videos (2–15 s). Safety limits prevent runaway tasks; all workflows are preset.' },
        { title: 'Automated Pipeline', desc: 'Submission → polling → frame download → FFmpeg assembly, all in the background with real-time status bar updates.' },
        { title: 'Gallery Viewer', desc: 'NextGallery integration opens your outputs automatically. Outputs are organized by run, searchable by metadata.' },
        { title: 'Workspace Workflow', desc: 'Outputs save to `.codecomfy/` in your workspace. Run metadata and index live there for reproducibility.' },
        { title: 'Cross-Platform', desc: 'Windows-first (fully tested 10/11). macOS and Linux expected to work; remote/WSL supported if ComfyUI is reachable.' },
      ],
    },
    {
      kind: 'code-cards',
      id: 'quickstart',
      title: 'Installation & Setup',
      cards: [
        { title: 'Install from VSIX', code: 'Extensions → ··· → Install from VSIX…\n\nDownload latest from Releases' },
        { title: 'Configure ComfyUI', code: 'Settings → Extensions → CodeComfy\n\ncomfyuiUrl: http://127.0.0.1:8188\nffmpegPath: (auto or full path)' },
        { title: 'Generate', code: 'Ctrl+Shift+P → CodeComfy: Generate Image (HQ)\n\nor\n\nCodeComfy: Generate Video (HQ)' },
        { title: 'View Outputs', code: 'Outputs saved to .codecomfy/outputs/\n\nRun metadata in .codecomfy/runs/\n\nNextGallery auto-opens' },
      ],
    },
  ],
};
