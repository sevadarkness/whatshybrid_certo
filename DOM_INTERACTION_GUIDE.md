# WhatsApp Web DOM Interaction Guide (2024-2025)

## Overview

This extension now uses **direct DOM manipulation** as the primary method for interacting with WhatsApp Web, with Store-based methods as a fallback. This ensures compatibility with current and future versions of WhatsApp Web.

## Architecture

### Hybrid Approach: DOM + Store Fallback

The extension operates in two modes:

1. **Hybrid Mode** (Store + DOM): When `window.Store` is available
2. **DOM-Only Mode**: When Store is not available (WhatsApp Web 2024-2025+)

## Key Functions

### 1. Message Sending (`sendMessageViaDOM`)

**Location**: `extension/inject.js`

**Features**:
- Finds message box with 7 fallback selectors
- Properly focuses and clears the field
- Dispatches InputEvent and Change events for WhatsApp compatibility
- Finds send button with 5 fallback selectors
- Includes extensive logging for debugging

**Selectors Used**:
```javascript
// Message Box
'[data-testid="conversation-compose-box-input"]'
'[contenteditable="true"][data-tab="10"]'
'[contenteditable="true"][data-tab="6"]'
'footer [contenteditable="true"]'
'div[role="textbox"][contenteditable="true"]'
'[data-lexical-editor="true"]'

// Send Button
'[data-testid="send"]'
'button[aria-label*="Enviar"]'
'button[aria-label*="Send"]'
'span[data-icon="send"]'
'footer button[data-tab="11"]'
```

### 2. Message Reading (`getLastMessagesFromDOM`)

**Location**: `extension/inject.js`

**Features**:
- Reads messages from DOM with multiple fallback selectors
- Identifies message direction (sent/received)
- Returns structured message data with text and metadata

**Selectors Used**:
```javascript
// Message Containers
'div[data-id]'
'div[data-message-id]'
'div.message-in'
'div.message-out'
'div[role="row"]'

// Message Text
'span.selectable-text'
'div.copyable-text'
'span[dir="ltr"]'
'span[dir="auto"]'
```

### 3. Current Chat Detection (`getCurrentChatFromDOM`)

**Location**: `extension/inject.js`

**Features**:
- Detects current open chat name
- Identifies if chat is a group
- Returns chat metadata

**Selectors Used**:
```javascript
'[data-testid="conversation-info-header-chat-title"]'
'header span[dir="auto"][title]'
'#main header span[title]'
'header[data-testid="conversation-header"] span[title]'
```

### 4. Chat Navigation (`openChatByName`, `searchAndOpenChat`)

**Location**: `extension/inject.js`

**Features**:
- Opens chat by name from the chat list
- Searches for a chat using the search field
- Clicks on the first result

**Selectors Used**:
```javascript
// Chat Items
'[data-testid="cell-frame-container"]'
'[data-testid="list-item-content"]'
'div[role="listitem"]'

// Search Field
'[data-testid="chat-list-search"]'
'[contenteditable="true"][data-tab="3"]'
'div[role="textbox"][data-tab="3"]'
'[data-testid="search-input"]'
```

## Updated Components

### `extension/inject.js`
- ✅ Added 5 new DOM-based utility functions
- ✅ Updated `initUtils()` with DOM fallback for sendMessage
- ✅ Updated `handleSendMessageFromRuntime()` with DOM fallback
- ✅ Enhanced error handling and logging
- ✅ Made initialization more resilient (works without Store)

### `extension/content_main.js`
- ✅ Updated `getMessageBox()` with 7 fallback selectors
- ✅ Updated `fillMessageBox()` with better event dispatching
- ✅ Updated `getLastMessages()` with DOM-based reading
- ✅ Updated `getCurrentContactName()` with better selectors

### `extension/utils/selector-engine.js`
- ✅ Added 30+ new selectors for WhatsApp Web 2024-2025
- ✅ Added message-specific selectors
- ✅ Added search input selectors
- ✅ Added app wrapper selectors

### `extension/recovery_content.js`
- ✅ Already supports new WhatsApp Web 2024-2025 selectors
- ✅ Uses `data-id`, `data-message-id`, `data-msg-id` attributes

## Integration Flow

```
User Action (e.g., "Send Message")
    ↓
content_main.js receives request
    ↓
Sends message to inject.js via postMessage
    ↓
inject.js: handleExtensionMessage()
    ↓
inject.js: sendMessageToUser()
    ↓
inject.js: this.Utils.sendMessage()
    ↓
┌─────────────────────────────────┐
│ Try Store-based method first   │
│ ↓                               │
│ window.Store.SendMessage...    │
│                                 │
│ If fails or unavailable:       │
│ ↓                               │
│ sendMessageViaDOM()             │
│   → Find message box            │
│   → Focus and clear             │
│   → Insert text                 │
│   → Dispatch events             │
│   → Find send button            │
│   → Click                       │
└─────────────────────────────────┘
    ↓
Success/failure response
    ↓
Updates UI
```

## Debugging

All DOM-based functions include extensive logging:

```javascript
console.log('[Inject][DOM] Attempting to send message via DOM:', text);
console.log('[Inject][DOM] Message box found');
console.log('[Inject][DOM] Send button found, clicking...');
console.log('[Inject][DOM] Message sent successfully via DOM');
```

To debug in Chrome DevTools:
1. Open WhatsApp Web
2. Open DevTools (F12)
3. Filter console by `[Inject]` or `[content_main]`
4. Perform an action (e.g., use AI wand)
5. Review the logs

## Testing Checklist

- [ ] Message sending via AI wand button
- [ ] Message reading for AI context
- [ ] Quick replies functionality
- [ ] CRM panel operations
- [ ] Recovery feature for deleted messages
- [ ] Chat switching
- [ ] Group chat detection

## Compatibility

### Supported WhatsApp Web Versions
- ✅ 2024 versions (DOM-based)
- ✅ 2025 versions (DOM-based)
- ✅ Older versions with Store (hybrid mode)

### Browser Compatibility
- ✅ Chrome/Edge (Manifest V3)
- ✅ Chromium-based browsers

## Future Enhancements

1. **Dynamic Selector Discovery**: Automatically detect and adapt to new selectors
2. **Mutation Observer**: Monitor DOM changes for more reliable element detection
3. **Shadow DOM Support**: Handle elements inside shadow roots if WhatsApp uses them
4. **Performance Optimization**: Cache selector results for faster lookups

## Troubleshooting

### Issue: Message not sending
**Check**:
1. Is the message box visible?
2. Is a chat open?
3. Check console for `[Inject][DOM]` errors
4. Try manually clicking the message box

### Issue: Cannot read messages
**Check**:
1. Are messages visible on screen?
2. Check console for message count: `Found X message containers`
3. Scroll up to load more messages
4. Check if WhatsApp changed selectors (compare with current DOM)

### Issue: Integration not initializing
**Check**:
1. Is WhatsApp Web fully loaded?
2. Check console for `[Inject] WhatsApp Web detected`
3. Look for initialization mode: `hybrid mode` or `DOM-only mode`
4. Check if `#app` or `#pane-side` exists in DOM

## Resources

- **WhatsApp Web**: https://web.whatsapp.com/
- **Chrome Extensions**: https://developer.chrome.com/docs/extensions/
- **DOM API**: https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model
