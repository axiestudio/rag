# Chat Interface - UI/UX Guide

## Visual Layout

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  💬 Chat Interface                                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Messages Container (Scrollable)                           │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                                                       │ │
│  │  User: "What are the main topics?"                   │ │
│  │  ────────────────────────────────────────────────→   │ │
│  │                                                       │ │
│  │  ←──────────────────────────────────────────────     │ │
│  │  Assistant: I found 3 relevant documents...          │ │
│  │                                                       │ │
│  │  Sources:                                            │ │
│  │  • document1.pdf (92%)                               │ │
│  │    "The main topics discussed include..."            │ │
│  │  • document2.pdf (87%)                               │ │
│  │    "Key areas covered in this section..."            │ │
│  │  • document3.pdf (81%)                               │ │
│  │    "Additional information about..."                 │ │
│  │                                                       │ │
│  │  User: "Tell me more about topic X"                  │ │
│  │  ────────────────────────────────────────────────→   │ │
│  │                                                       │ │
│  │  ⟳ Processing your query...                          │ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Input Area:                                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Ask a question about your documents...              │   │
│  │                                                     │   │
│  │                                                     │ ⬆ │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Color Scheme

### Message Colors
- **User Message**: Blue (#2563EB)
  - Background: `bg-blue-600/80`
  - Text: White
  - Alignment: Right
  - Tail: Bottom-right rounded

- **Assistant Message**: White/Gray (#F3F4F6)
  - Background: `bg-white/10`
  - Text: White/90
  - Border: `border-white/20`
  - Alignment: Left
  - Tail: Bottom-left rounded

### UI Elements
- **Container**: Glass effect dark background
- **Sources**: Dark background with subtle borders
- **Error**: Red background (#DC2626)
- **Loading**: Animated spinner
- **Buttons**: Blue (#2563EB) with hover effect

## Typography

### Headers
- Font Size: 18px
- Font Weight: Semibold (600)
- Color: White
- Margin Bottom: 24px

### Message Text
- Font Size: 14px
- Font Weight: Regular (400)
- Color: White/90
- Line Height: 1.5

### Source Labels
- Font Size: 12px
- Font Weight: Medium (500)
- Color: White/70
- Monospace font for values

### Placeholder Text
- Font Size: 14px
- Color: White/50
- Italic style

## Spacing & Dimensions

### Container
- Padding: 32px (8 units)
- Border Radius: 16px (2xl)
- Max Height: 600px
- Min Height: 400px

### Messages
- Padding: 12px 16px (3px 4px)
- Margin Bottom: 16px (4 units)
- Max Width: 600px (desktop)
- Max Width: 400px (tablet)
- Max Width: 100% (mobile)

### Sources Section
- Margin Top: 12px (3 units)
- Padding Top: 12px (3 units)
- Border Top: 1px solid white/20
- Gap Between Sources: 8px (2 units)

### Input Area
- Gap: 12px (3 units)
- Textarea Padding: 12px (3 units)
- Button Padding: 12px 16px (3px 4px)
- Border Radius: 8px (lg)

## Responsive Breakpoints

### Mobile (< 640px)
- Message Max Width: 100%
- Padding: 16px
- Font Size: 13px
- Button Size: 44px (touch target)
- Textarea Rows: 2

### Tablet (640px - 1024px)
- Message Max Width: 400px
- Padding: 24px
- Font Size: 14px
- Button Size: 40px
- Textarea Rows: 2

### Desktop (> 1024px)
- Message Max Width: 600px
- Padding: 32px
- Font Size: 14px
- Button Size: 40px
- Textarea Rows: 2

## Interactive States

### Button States

**Normal**
- Background: Blue (#2563EB)
- Cursor: Pointer
- Opacity: 100%

**Hover**
- Background: Blue (#1D4ED8)
- Transition: 200ms
- Shadow: Subtle

**Active/Pressed**
- Background: Blue (#1E40AF)
- Transform: Scale 0.98

**Disabled**
- Background: Blue (#2563EB)
- Opacity: 50%
- Cursor: Not-allowed
- Pointer Events: None

### Input States

**Focus**
- Border: 2px solid white/30
- Ring: 2px ring white/30
- Outline: None

**Disabled**
- Opacity: 50%
- Cursor: Not-allowed
- Background: Unchanged

**Error**
- Border: 2px solid red
- Background: Red/10

## Animation & Transitions

### Scroll Animation
- Behavior: Smooth
- Duration: 300ms
- Easing: ease-in-out

### Loading Spinner
- Animation: Spin
- Duration: 1s
- Iteration: Infinite
- Direction: Clockwise

### Fade In
- Duration: 200ms
- Opacity: 0 → 1

### Hover Effects
- Duration: 200ms
- Transition: All properties

## Accessibility Features

### Keyboard Navigation
- Tab: Navigate between elements
- Enter: Send message
- Shift+Enter: New line
- Escape: Close error (if added)

### Focus Indicators
- Visible focus ring on all interactive elements
- Color: White/30
- Width: 2px
- Offset: 2px

### Color Contrast
- Text on background: 4.5:1 (WCAG AA)
- Button text: 7:1 (WCAG AAA)
- Error text: 5:1 (WCAG AA)

### Screen Reader Support
- Semantic HTML elements
- ARIA labels on buttons
- Role attributes where needed
- Alt text for icons

## Empty States

### No Credentials
```
┌─────────────────────────────────────┐
│                                     │
│         💬                          │
│                                     │
│  Chat with Your Documents           │
│                                     │
│  Configure your credentials first   │
│  to start chatting with your        │
│  knowledge base                     │
│                                     │
└─────────────────────────────────────┘
```

### No Messages
```
┌─────────────────────────────────────┐
│                                     │
│         💬                          │
│                                     │
│  Start a conversation by asking     │
│  a question about your documents    │
│                                     │
└─────────────────────────────────────┘
```

## Error Display

```
┌─────────────────────────────────────┐
│ ⚠️  Error Message                   │
│                                     │
│ Specific error details here...      │
│ This helps users understand what    │
│ went wrong and how to fix it.       │
└─────────────────────────────────────┘
```

## Loading State

```
┌─────────────────────────────────────┐
│ ⟳ Processing your query...          │
│                                     │
│ (Animated spinner)                  │
└─────────────────────────────────────┘
```

## Source Card

```
┌─────────────────────────────────────┐
│ document_name.pdf          92%      │
├─────────────────────────────────────┤
│ "This is a preview of the           │
│  relevant content from the          │
│  document that matches your         │
│  query..."                          │
└─────────────────────────────────────┘
```

## Best Practices

1. **Message Clarity**
   - Keep messages concise
   - Use line breaks for readability
   - Highlight important information

2. **Source Attribution**
   - Always show document name
   - Display similarity score
   - Include content preview

3. **Error Handling**
   - Show user-friendly messages
   - Provide actionable suggestions
   - Don't expose technical details

4. **Performance**
   - Auto-scroll smoothly
   - Show loading indicators
   - Prevent multiple submissions

5. **Accessibility**
   - Maintain color contrast
   - Support keyboard navigation
   - Use semantic HTML
   - Provide ARIA labels

