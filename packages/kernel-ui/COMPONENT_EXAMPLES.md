# MetaMask Design System Component Examples

This document provides real-world examples of converting components from custom CSS to MetaMask Design System.

## 1. Layout Components

### Panel Layout (App.tsx)

```tsx
// BEFORE:
<div className="panel">
  <div className="leftPanel">{/* content */}</div>
  <div className="rightPanel">{/* content */}</div>
</div>;

// AFTER:
import { Box } from '@metamask/design-system-react';

<Box className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 min-w-[600px] min-h-full bg-background-default">
  <Box className="min-w-0">{/* content */}</Box>
  <Box className="sticky top-4 flex flex-col max-h-[calc(100vh-2rem)]">
    {/* content */}
  </Box>
</Box>;
```

## 2. Typography

### Text with Colors

```tsx
// BEFORE:
<div className="error">Error message</div>
<div className="success">Success message</div>
<h3>Section Title</h3>

// AFTER:
import { Text as TextComponent, TextColor, TextVariant } from '@metamask/design-system-react';

<TextComponent color={TextColor.ErrorDefault}>Error message</TextComponent>
<TextComponent color={TextColor.SuccessDefault}>Success message</TextComponent>
<TextComponent variant={TextVariant.HeadingSm}>Section Title</TextComponent>
```

## 3. Tabs Component

### Complete Tabs Conversion

```tsx
// BEFORE:
export const Tabs = ({ tabs, activeTab, onTabChange }) => {
  return (
    <div className="tabButtons">
      {tabs.map((tab) => (
        <button
          className={`tabButton ${activeTab === tab.value ? 'activeTab' : ''}`}
          onClick={() => onTabChange(tab.value)}
          key={tab.value}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

// AFTER:
import { Box } from '@metamask/design-system-react';

export const Tabs = ({ tabs, activeTab, onTabChange }) => {
  return (
    <Box className="flex gap-1 border-b border-border-default mb-4 h-10 bg-background-alternative rounded-t">
      {tabs.map((tab) => (
        <button
          className={`px-4 py-3 border border-transparent border-b-0 -mb-px bg-transparent cursor-pointer leading-none text-sm transition-colors rounded-t flex-none font-medium ${
            activeTab === tab.value
              ? 'bg-background-default border-border-default text-text-default tab-active-border'
              : 'text-text-muted hover:text-primary-default'
          }`}
          onClick={() => onTabChange(tab.value)}
          key={tab.value}
        >
          {tab.label}
        </button>
      ))}
    </Box>
  );
};
```

## 4. Message Panel

### Output Panel with Dynamic Styling

```tsx
// BEFORE:
<div className="outputSection">
  <div className="outputHeader">
    <h4>Message History</h4>
    <button>Clear</button>
  </div>
  <div className="messageOutput">
    {logs.map((log) => (
      <div className={log.type}>
        <span className="logType">{icon}</span>
        <span className="logMessage">{log.message}</span>
      </div>
    ))}
  </div>
</div>;

// AFTER:
import {
  Box,
  Text as TextComponent,
  TextColor,
  TextButton,
  TextButtonSize,
} from '@metamask/design-system-react';

const getLogTypeColor = (type) => {
  switch (type) {
    case 'error':
      return TextColor.ErrorDefault;
    case 'success':
      return TextColor.SuccessDefault;
    case 'sent':
      return TextColor.TextMuted;
    default:
      return TextColor.TextDefault;
  }
};

<Box className="h-full flex flex-col bg-background-alternative rounded overflow-hidden">
  <Box className="p-3 bg-background-alternative border-b border-border-default flex justify-between items-center h-bar">
    <TextComponent className="font-bold">Message History</TextComponent>
    <TextButton size={TextButtonSize.BodyXs} onClick={clearLogs}>
      Clear
    </TextButton>
  </Box>
  <Box className="flex-1 font-mono text-xs leading-5 bg-background-alternative p-3 text-text-default overflow-y-auto custom-scrollbar">
    {logs.map((log, index) => (
      <Box
        key={index}
        className={`mb-2 ${log.type === 'sent' && index > 0 ? 'pt-2 border-t border-dashed border-border-muted' : ''}`}
      >
        <TextComponent
          color={getLogTypeColor(log.type)}
          className="inline-block text-center mr-1"
        >
          {icon}
        </TextComponent>
        <TextComponent
          color={getLogTypeColor(log.type)}
          className="whitespace-pre-wrap"
        >
          {log.message}
        </TextComponent>
      </Box>
    ))}
  </Box>
</Box>;
```

## 5. Form Components

### Complete Form with Inputs and Select

```tsx
// BEFORE:
<div className="messageInputSection">
  <h3>Send Message</h3>
  <div className="horizontalForm">
    <div className="formFieldTarget">
      <label>Target:</label>
      <select>{/* options */}</select>
    </div>
    <div>
      <label>Method:</label>
      <input type="text" />
    </div>
    <div>
      <button>Send</button>
    </div>
  </div>
</div>;

// AFTER:
import {
  Box,
  Button,
  ButtonVariant,
  Text as TextComponent,
  TextVariant,
} from '@metamask/design-system-react';

<Box className="border border-border-default p-3 bg-background-alternative rounded mb-4">
  <TextComponent variant={TextVariant.HeadingSm} className="mb-3">
    Send Message
  </TextComponent>
  <Box className="flex gap-2">
    <Box className="flex flex-col flex-1 lg:flex-none lg:w-[150px]">
      <label htmlFor="target" className="mb-1 text-sm">
        Target:
      </label>
      <select
        id="target"
        className="flex items-center h-9 px-3.5 pr-8 rounded border border-border-default text-sm bg-background-default text-text-default cursor-pointer appearance-none custom-select transition-colors hover:bg-background-hover focus:outline-none focus:ring-2 focus:ring-primary-default"
      >
        {/* options */}
      </select>
    </Box>
    <Box className="flex flex-col flex-1">
      <label htmlFor="method" className="mb-1 text-sm">
        Method:
      </label>
      <input
        id="method"
        type="text"
        className="flex items-center h-9 px-3.5 rounded border border-border-default text-sm bg-background-default text-text-default transition-colors hover:bg-background-hover focus:outline-none focus:ring-2 focus:ring-primary-default"
      />
    </Box>
    <Box className="flex-none w-[66px] pt-[18px]">
      <Button variant={ButtonVariant.Primary} onClick={handleSend}>
        Send
      </Button>
    </Box>
  </Box>
</Box>;
```

## 6. Tables

### Data Table with Hover States

```tsx
// BEFORE:
<div className="table">
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Value</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Item 1</td>
        <td>Value 1</td>
      </tr>
    </tbody>
  </table>
</div>

// AFTER:
<Box className="w-full border border-border-default rounded overflow-hidden mb-4">
  <table className="w-full border-collapse table-hover">
    <thead>
      <tr>
        <th className="bg-background-alternative p-3 text-left font-bold text-text-default">
          Name
        </th>
        <th className="bg-background-alternative p-3 text-left font-bold text-text-default">
          Value
        </th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td className="p-2 px-3 border-t border-border-default text-text-default">
          Item 1
        </td>
        <td className="p-2 px-3 border-t border-border-default text-text-default">
          Value 1
        </td>
      </tr>
    </tbody>
  </table>
</Box>
```

## 7. Modal/Dialog

### Modal with Header and Body

```tsx
// BEFORE:
<div className="modalBackdrop">
  <div className="modalContent md">
    <div className="modalHeader">
      <h3 className="modalTitle">Modal Title</h3>
      <button>×</button>
    </div>
    <div className="modalBody">{/* content */}</div>
  </div>
</div>;

// AFTER:
import {
  Box,
  Text as TextComponent,
  TextVariant,
  ButtonIcon,
  IconName,
} from '@metamask/design-system-react';

<Box className="fixed inset-0 bg-overlay-default flex items-center justify-center z-modal p-4">
  <Box className="bg-background-default rounded shadow-modal max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col w-[600px]">
    <Box className="flex justify-between items-center p-4 border-b border-border-default bg-background-alternative">
      <TextComponent variant={TextVariant.HeadingMd}>Modal Title</TextComponent>
      <ButtonIcon
        iconName={IconName.Close}
        onClick={handleClose}
        ariaLabel="Close"
      />
    </Box>
    <Box className="p-4 overflow-y-auto flex-1">{/* content */}</Box>
  </Box>
</Box>;
```

## 8. Accordion

### Collapsible Section

```tsx
// BEFORE:
<div className="accordion">
  <div className="accordionHeader" onClick={toggle}>
    <div className="accordionTitle">Section Title</div>
    <div className="accordionIndicator">{isOpen ? '-' : '+'}</div>
  </div>
  {isOpen && <div className="accordionContent">{/* content */}</div>}
</div>

// AFTER:
<Box className="mb-4 border border-border-default rounded overflow-hidden hover:bg-background-hover">
  <Box
    className="flex justify-between items-center p-3 bg-background-alternative cursor-pointer transition-colors select-none font-bold border-b border-transparent"
    onClick={toggle}
  >
    <Box className="flex items-center">
      <TextComponent>{title}</TextComponent>
    </Box>
    <Box className="text-lg font-bold w-5 h-5 flex items-center justify-center text-text-muted">
      {isOpen ? '-' : '+'}
    </Box>
  </Box>
  {isOpen && (
    <Box className="p-3 bg-background-default">
      {/* content */}
    </Box>
  )}
</Box>
```

## 9. Loading States

### Loading Indicator

```tsx
// BEFORE:
<div className="loading">Loading...</div>;

// AFTER:
import { Box, Icon, IconName, IconSize } from '@metamask/design-system-react';

<Box className="flex items-center gap-2">
  <Icon name={IconName.Loading} size={IconSize.Sm} className="animate-pulse" />
  <TextComponent color={TextColor.TextMuted}>Loading...</TextComponent>
</Box>;
```

## 10. File Upload

### Drop Zone

```tsx
// BEFORE:
<div className={`dropZone ${isDragging ? 'dragging' : ''}`}>
  <div className="dropZoneContent">
    <div className="uploadIcon">📁</div>
    <p className="dropZoneText">Drop files here</p>
  </div>
</div>

// AFTER:
<Box
  className={`border-2 border-dashed border-border-default rounded p-8 mt-3 bg-background-alternative transition-all cursor-pointer ${
    isDragging ? 'drop-zone-active' : ''
  }`}
>
  <Box className="flex flex-col items-center gap-3 text-center">
    <Icon
      name={IconName.Upload}
      size={IconSize.Lg}
      color={IconColor.IconMuted}
    />
    <TextComponent color={TextColor.TextMuted} className="text-sm">
      Drop files here or click to upload
    </TextComponent>
  </Box>
</Box>
```

## Common Patterns

### Input Field Template

```tsx
// Reusable input class string
const inputClassName =
  'flex items-center h-9 px-3.5 rounded border border-border-default text-sm bg-background-default text-text-default transition-colors hover:bg-background-hover focus:outline-none focus:ring-2 focus:ring-primary-default';

// Select with custom arrow
const selectClassName = `${inputClassName} pr-8 cursor-pointer appearance-none custom-select`;

// Textarea
const textareaClassName = `${inputClassName} h-auto py-2 resize-none`;
```

### Button Variants

```tsx
import { Button, ButtonVariant, ButtonSize } from '@metamask/design-system-react';

// Primary action
<Button variant={ButtonVariant.Primary} size={ButtonSize.Md}>
  Confirm
</Button>

// Secondary action
<Button variant={ButtonVariant.Secondary} size={ButtonSize.Md}>
  Cancel
</Button>

// Text button
<TextButton size={TextButtonSize.BodySm} onClick={handleClick}>
  Learn more
</TextButton>

// Icon button
<ButtonIcon
  iconName={IconName.Close}
  size={ButtonIconSize.Sm}
  onClick={handleClose}
  ariaLabel="Close"
/>
```

### Responsive Utilities

```tsx
// Hide on mobile, show on desktop
<Box className="hidden lg:block">

// Stack on mobile, side-by-side on desktop
<Box className="flex flex-col lg:flex-row gap-4">

// Full width on mobile, fixed width on desktop
<Box className="w-full lg:w-[600px]">

// Different padding on different screen sizes
<Box className="p-2 lg:p-4">
```

## Migration Tips

1. **Always import Text as TextComponent** to avoid conflicts with global Text
2. **Use enums for component props** (TextColor, ButtonVariant, etc.)
3. **Combine Tailwind utilities with MetaMask components** using className
4. **Keep custom utilities minimal** - only for things not covered by the design system
5. **Test dark mode** - MetaMask Design Tokens handle theme switching automatically
6. **Use semantic color names** - `text-text-default` instead of hardcoded colors
7. **Leverage responsive prefixes** - `lg:`, `md:`, `sm:` for responsive design
8. **Use Box component** instead of div for better consistency
