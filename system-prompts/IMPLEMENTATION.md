# System Prompts - Dashboard Control

## ✅ Implementation Complete

Modular system prompts can now be toggled via Dashboard → AI Settings → System Prompts.

## What Was Built

### 1. Module Metadata System
All modules now export objects with metadata:
```js
module.exports = {
    name: 'identity',
    description: 'AI personality and role definition',
    category: 'Core',
    generate: async (context) => { /* ... */ }
}
```

**Categories:**
- **Core**: identity, context, memory
- **Behavior**: language, tools
- **Format**: formatting

### 2. Settings Management
Added to `settingsManager.js`:
- `getEnabledSystemPrompts()` - Get enabled list
- `getAvailableSystemPrompts()` - List all with metadata
- `updateEnabledSystemPrompts(names)` - Save enabled list
- `enabledSystemPrompts` field in settings (empty = all enabled)

### 3. Loader Enhancement
`systemPromptLoader.js` now:
- Reads metadata from modules
- Filters by enabled list from settings
- Supports both old (function) and new (object) formats
- Auto-excludes `.example` and `.disabled` files
- Hot-reload enabled

### 4. Dashboard API
**GET** `/api/ai-settings/system-prompts`
- Returns all modules with metadata
- Includes enabled status for each

**PUT** `/api/ai-settings/system-prompts`
- Body: `{ enabledPrompts: ["identity", "context", ...] }`
- Empty array = enable all (default)

### 5. Dashboard UI
**New Tab:** AI Settings → System Prompts
- Grid view of all modules
- Toggle each module on/off
- Color-coded by category
- Enable All / Disable All buttons
- Save Changes button
- Shows enabled count

## How to Use

### Dashboard
1. Open Dashboard → AI Settings
2. Click "System Prompts" tab
3. Toggle modules on/off
4. Click "Save Changes"

### Add New Module
1. Create `system-prompts/XX-name.js`:
```js
module.exports = {
    name: 'mymodule',
    description: 'What this does',
    category: 'Custom',
    generate: async (context) => {
        return `Your prompt text`;
    }
};
```
2. Reload page → module appears automatically
3. No code changes needed!

### Disable Module
- **Via Dashboard:** Uncheck and save
- **Via File:** Rename to `.disabled` or `.example`

## Current Modules

1. **00-identity** - AI personality (from settings)
2. **10-context** - User, date, time
3. **20-memory** - Conversation history
4. **30-language** - Language matching
5. **40-tools** - Tool usage guidelines
6. **50-formatting** - WhatsApp formatting

## Files Changed

- ✅ `system-prompts/*.js` - Updated with metadata
- ✅ `systemPromptLoader.js` - Enhanced with filtering
- ✅ `settingsManager.js` - Added methods
- ✅ `dashboard.js` - Added API endpoints
- ✅ `public/dashboard.html` - Added UI tab
- ✅ `public/dashboard.js` - Added JS functions

## Testing

```bash
# List active modules
node -e "const l = require('./systemPromptLoader'); console.log(l.getModuleList())"

# Test generation
# (restart bot or send AI command to see it in action)
```

## Notes

- Empty `enabledSystemPrompts` array = all enabled (default)
- Changes apply immediately on next AI command
- Hot-reload: edit module → next AI call uses new version
- TEMPLATE.js.example: copy to create new modules
