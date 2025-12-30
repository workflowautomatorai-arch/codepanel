# Glass Cockpit Frontend Redesign

**Date**: 2025-12-29
**Status**: Approved

## Overview

Redesign CodePanel's frontend with a "Glass Cockpit" aesthetic - a translucent floating instrument panel that's always present but never in the way.

## Design Principles

1. **Whisper transparency** (~88% transparent) - see-through, unobtrusive
2. **Hairline borders** - subtle edge definition without heaviness
3. **Full-surface draggable** - no dedicated drag handle needed
4. **Hybrid text readability** - shadows for labels, backdrop blur for content
5. **Stagger reveal animations** - content cascades in like instruments powering up

## Visual Specifications

### Base Container
- Background: `rgba(17, 17, 19, 0.12)`
- Backdrop blur: `blur(12px)`
- Border: `1px solid rgba(255, 255, 255, 0.08)`
- Border radius: `12px`
- Entire surface draggable (except interactive elements)
- **No drag handle pill** - removed as redundant

### Text Readability

**Labels, buttons, small text:**
- Color: `#FAFAFA`
- Text shadow: `0 1px 3px rgba(0, 0, 0, 0.9)`

**Content blocks (solutions, thoughts):**
- Localized backdrop: `rgba(10, 10, 11, 0.6)` with `blur(8px)`
- Text: `#FAFAFA`

**Code blocks:**
- Background: `rgba(22, 27, 34, 0.85)`
- Stronger opacity for syntax highlighting contrast

### New CSS Variables

```css
/* Translucent surfaces */
--surface-whisper: rgba(17, 17, 19, 0.12);
--surface-content: rgba(10, 10, 11, 0.6);
--surface-code: rgba(22, 27, 34, 0.85);

/* Borders */
--border-whisper: rgba(255, 255, 255, 0.08);
--border-hover: rgba(255, 255, 255, 0.15);

/* Text */
--text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
```

### Animations

**View transitions (stagger reveal):**
- Container stays, content crossfades (150ms)
- Cards stagger in: 40ms delay between each
- Animation: slide up 8px + fade in, 250ms ease-out

**Micro-interactions:**
- Button hover: scale(1.02) + background shift, 150ms
- Button active: scale(0.98), instant
- Card hover: border brightens (0.08 → 0.15 opacity)
- Input focus: accent border + glow ring

## Files to Modify

| File | Changes |
|------|---------|
| `src/index.css` | New tokens, updated surface classes |
| `src/pages/SubscribedApp.tsx` | Whisper container, remove drag handle, full-surface drag |
| `src/pages/AuthForm.tsx` | Design system classes, whisper background |
| `src/pages/SubscribePage.tsx` | Same treatment |
| `src/pages/QueuePage.tsx` | Stagger animations |
| `src/pages/SolutionsPage.tsx` | Stagger animations, content backdrop |
| `src/components/Solutions/SolutionContent.tsx` | Content backdrop blur |
| `src/components/Solutions/CodeBlock.tsx` | Opaque code surface |
| `src/components/Queue/QueueCommands.tsx` | Text shadows, button refinements |
| `src/components/shared/commands/CommandButton.tsx` | Text shadow, hover states |
| `src/components/ui/button.tsx` | Micro-interaction updates |
| `electron/` files | Enable full-surface dragging |

## Not Changing

- Accent color (cyan) - already distinctive
- Typography (Outfit/JetBrains Mono) - excellent choices
- Layout structure - works well
- Status indicators - already polished
