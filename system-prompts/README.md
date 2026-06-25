# System Prompts

Modular system prompt components for AI command.

## Structure

Each module is a `.js` file that exports an async function:

```js
module.exports = async (context) => {
    // Access any data you need from context
    const { userName, currentDate, settingsManager } = context;
    
    // Return prompt text or null to skip
    return `Your prompt content here`;
};
```

## Modules (Load Order)

Modules are loaded alphabetically by filename:

1. **00-identity.js** - AI personality/role (from settings)
2. **10-context.js** - Current user, date, time
3. **20-memory.js** - Recent conversation history
4. **30-language.js** - Language matching rules
5. **40-tools.js** - Tool usage guidelines
6. **50-formatting.js** - WhatsApp formatting rules

## Full Context API

All modules receive a rich context object with EVERYTHING you might need:

```js
{
    // === Managers (access any bot functionality) ===
    settingsManager,     // AI settings (models, identity, etc)
    memoryManager,       // Conversation history
    whitelistManager,    // User permissions & quotas
    bot,                 // Wachan bot instance

    // === Message Context ===
    message,             // Full Wachan message object
    group,               // Group data (or null for private chat)
    roomJid,             // Room ID (e.g., "123@s.whatsapp.net")
    sender,              // Message sender object (id, name, lid)

    // === Pre-computed Values (convenient shortcuts) ===
    userName,            // Current user's display name
    currentDate,         // Formatted date: "Wednesday, June 25, 2026"
    currentTime,         // Formatted time: "11:30 AM GMT+7"
    memoryContext,       // Recent chat history as formatted string (or null)

    // === User Info ===
    workingIdentifier    // User's working ID (id or lid)
}
```

## Examples

### Simple Static Module
```js
// 70-disclaimer.js
module.exports = async (context) => {
    return `DISCLAIMER: I may make mistakes. Verify important information.`;
};
```

### Dynamic Module Using Settings
```js
// 60-quota-reminder.js
module.exports = async (context) => {
    const { whitelistManager, workingIdentifier } = context;
    
    const quota = await whitelistManager.getQuotaInfo(workingIdentifier);
    const remaining = quota.remaining;
    
    if (remaining <= 5) {
        return `NOTE: You have ${remaining} queries remaining today.`;
    }
    
    return null; // Skip if quota is fine
};
```

### Conditional Module Based on Chat Type
```js
// 65-group-rules.js
module.exports = async (context) => {
    const { group } = context;
    
    // Only apply in groups
    if (!group) return null;
    
    return `GROUP CHAT RULES:
- Be respectful to all members
- Keep conversations on-topic`;
};
```

### Module Accessing Message Data
```js
// 75-image-helper.js
module.exports = async (context) => {
    const { message } = context;
    
    if (message?.type === 'image') {
        return `The user sent an image. Analyze it carefully and describe what you see.`;
    }
    
    return null;
};
```

## Adding New Modules

1. Create `XX-name.js` in this folder (XX = load order, e.g., 60, 70, 80)
2. Export async function that receives context
3. Access any data you need from context
4. Return string prompt or null to skip
5. **That's it!** No other files need editing.

Changes apply immediately (hot-reload enabled).

## Testing Your Module

Test without restarting bot:

```bash
# Test individual module
node -e "
const context = {
    settingsManager: require('./settingsManager'),
    userName: 'TestUser',
    currentDate: new Date().toDateString(),
    currentTime: new Date().toTimeString()
};
const mod = require('./system-prompts/XX-yourmodule.js');
mod(context).then(r => console.log(r));
"
```

## Best Practices

✅ **Return null** when module doesn't apply (don't return empty string)
✅ **Use numbered prefix** to control order (00-09 = core, 10-89 = custom, 90-99 = overrides)
✅ **Keep modules focused** - one concern per module
✅ **Access managers** via context for dynamic data
✅ **Add comments** explaining when/why module applies

❌ Don't hardcode values that can be fetched from context
❌ Don't return empty strings (use null instead)
❌ Don't throw errors (return null on failure)
