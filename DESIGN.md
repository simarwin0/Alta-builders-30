# Alta Chat — Cursor-inspired design system

> A practical adaptation of the public Cursor visual-language analysis for Alta Chat. This is an independent inspiration reference, not an official Cursor design system. Preserve Alta Chat's identity and messaging-first information architecture; do not turn the product into a code editor.

## Design direction

Use a calm, warm, editorial interface: warm cream canvas, white conversation surfaces, warm near-black text, restrained Cursor Orange for primary actions, crisp hairline dividers, compact controls and no decorative shadows. The experience should feel premium, quiet and efficient.

This guide is a visual source of truth for future UI work. It does not authorize replacing working application behavior, authentication, end-to-end encryption, Socket.IO, video calling, notification flows or backend APIs.

## Color tokens

| Token | Value | Role |
| --- | --- | --- |
| `--color-canvas` | `#f7f7f4` | Main application background |
| `--color-canvas-soft` | `#fafaf7` | Secondary/background regions |
| `--color-surface` | `#ffffff` | Chat pane, cards, menus, composer |
| `--color-surface-strong` | `#e6e5e0` | Soft selected states, chips and subtle fills |
| `--color-ink` | `#26251e` | Primary text and high-contrast controls |
| `--color-body` | `#5a5852` | Default body text |
| `--color-muted` | `#807d72` | Secondary labels and metadata |
| `--color-muted-soft` | `#a09c92` | Disabled or low-emphasis text |
| `--color-primary` | `#f54e00` | Primary action, active indicator and focus accent |
| `--color-primary-active` | `#d04200` | Pressed/active primary action |
| `--color-hairline` | `#e6e5e0` | Default 1px borders and separators |
| `--color-hairline-strong` | `#cfcdc4` | Focused or emphasized outlines |
| `--color-success` | `#1f8a65` | Success status |
| `--color-error` | `#cf2d56` | Errors and destructive validation |
| `--color-timeline-thinking` | `#dfa88f` | Optional non-critical progress marker |
| `--color-timeline-grep` | `#9fc9a2` | Optional non-critical progress marker |
| `--color-timeline-read` | `#9fbbe0` | Optional non-critical progress marker |
| `--color-timeline-edit` | `#c0a8dd` | Optional non-critical progress marker |
| `--color-timeline-done` | `#c08532` | Optional non-critical progress marker |

Use the pastel timeline colors only for a clearly labeled progress visualization, not as general message, presence or alert colors. Keep contrast accessible; do not use muted text for essential message content.

## Typography

Prefer an installed, web-safe UI sans stack. CursorGothic is a proprietary brand typeface and must not be copied, bundled or fetched from unofficial sources. Use `Inter, system-ui, -apple-system, "Segoe UI", sans-serif` as the practical substitute. Use `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` only for technical metadata or diagnostic details.

| Role | Size | Weight | Line height | Usage |
| --- | ---: | ---: | ---: | --- |
| Screen title | 26px | 400 | 1.25 | Main page heading |
| Panel title | 22px | 400 | 1.3 | Sidebar and dialog headings |
| Component title | 18px | 600 | 1.4 | Contact and conversation names |
| Body | 16px | 400 | 1.5 | Standard UI copy |
| Message body | 14–16px | 400 | 1.45–1.5 | Chat content, easy to scan |
| Supporting text | 14px | 400 | 1.5 | Secondary descriptions |
| Metadata | 11px | 600 | 1.4 | Timestamps, status and small labels |
| Technical detail | 13px | 400 | 1.5 | IDs or diagnostics, when needed |

Headings should feel measured and calm rather than heavy. Use bold only for hierarchy or emphasis, not for every label.

## Spacing and layout

Use a 4px base scale:
- 4px: icon/text micro-gap
- 8px: compact controls and bubble spacing
- 12px: small component padding
- 16px: standard component padding
- 20px: comfortable grouping
- 24px: panel spacing
- 32px: large section spacing
- 48px: page-level separation

Maintain Alta Chat's existing wide, full-height conversation layout and desktop sidebar. Do not introduce a narrow marketing-page container or reduce the usable conversation width. On mobile, keep the active conversation usable edge-to-edge and provide a clear way back to the conversation list.

## Components

### Buttons
- Primary action: Cursor Orange fill, white text, 8px radius, 40px minimum height.
- Pressed primary: `#d04200`.
- Secondary: white surface, 1px hairline border, warm ink text.
- Tertiary: text-only warm-ink control; orange for hover/focus emphasis.
- Destructive: semantic error color with clear labeling.
- Preserve visible keyboard focus and disabled states.

### Conversation surfaces
- Main page canvas: warm cream.
- Chat pane, sidebar and popovers: white or soft cream surfaces, separated by hairline borders.
- Avoid large drop shadows, glossy gradients, glass effects and heavy card stacks.
- Use a compact, consistent 8px spacing rhythm in dense conversation history.
- Contact avatars should remain distinct and readable; do not encode presence by color alone.

### Message bubbles
- Received messages: white surface with a fine hairline border and warm ink text.
- Sent messages: warm near-black surface with a light foreground for clear sender distinction; reserve orange for important actions and small active indicators.
- Keep message text readable, avoid excessive rounding, and maintain clear timestamps and sender labels.
- Preserve the existing message data, encryption and delivery behavior.

### Inputs and composer
- White surface, 1px hairline border, 8px radius.
- Clear focus outline using the primary accent with sufficient contrast.
- Composer should remain visually anchored to the bottom of the active conversation.
- Maintain accessible labels and comfortable touch targets.

### Notifications, dialogs and call controls
- Use the same white/cream surfaces, hairline borders, type scale and 8px control radii.
- Use semantic green/red only for success/error state.
- Keep video-call controls high-contrast and easy to operate; never use decorative colors that obscure mute, camera or end-call states.

### Badges and status
- Compact labels with 11px uppercase type and restrained padding.
- Use pill shapes only for small status badges where helpful; ordinary buttons and message bubbles use compact radii.
- Pair color with text or icon so state is never communicated by color alone.

## Borders, radius and depth

- Radius scale: 4px (extra small), 6px (small), 8px (standard control), 12px (large surface), 16px (large panel).
- Use 1px hairline borders for surface separation.
- Prefer surface contrast and borders over shadows. Avoid drop shadows unless required for a transient overlay and needed for separation.
- Keep the visual hierarchy flat, calm and uncluttered.

## Responsive behavior

- Mobile: below 640px. Conversation list and active conversation should behave as clear, focused views. Keep touch targets at least 40–44px high. Avoid horizontal overflow.
- Tablet: 640–1024px. Preserve the split layout when space permits; otherwise collapse the sidebar cleanly.
- Desktop: 1024–1280px. Show the full navigation and conversation workspace.
- Wide: above 1280px. Use the available width for the application workspace; do not apply the 1200px marketing-content cap to the chat application.
- Respect `prefers-reduced-motion`; use subtle transitions only.

## Implementation rules for AI coding agents

1. Read this file before creating or changing UI or CSS.
2. Apply this visual system to the existing Alta Chat components incrementally; do not replace the app or rewrite its architecture.
3. Preserve all working routes, responsive behavior, Socket.IO events, polling fallback, notification behavior, WebRTC calls, authentication and session handling.
4. Preserve end-to-end encryption. Never send plaintext message contents to the server or expose encryption keys, session cookies, JWT secrets, OAuth credentials or database URLs.
5. Do not add proprietary Cursor font files, logos, screenshots or trademark assets. This is visual inspiration only.
6. Prefer existing CSS variables and component classes; consolidate duplicate styles carefully instead of adding conflicting overrides.
7. Verify the production build, responsive breakpoints, keyboard focus, contrast, and core messaging flows before deployment.
8. Do not deploy to production unless the user explicitly requests deployment.

## Reference

The palette, typography scale, component treatment, border language and responsive concepts are adapted from the public Cursor visual-system preview at https://getdesign.md/design-md/cursor/preview. The published catalog describes these files as independent inspiration rather than official brand design systems.
