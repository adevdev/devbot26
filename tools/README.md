# Modular Tool System

This directory contains the **fully modular tool system** for the AI bot. Tools are automatically discovered and loaded at startup.

## 🎯 Key Features

- **Zero configuration** - Just create a file, restart the bot
- **Self-contained** - Each tool has definition, metadata, and logic in ONE file
- **Auto-loading** - Tools are discovered automatically from this directory
- **No code changes needed** - Never edit `ai.js` or `index.js` to add tools

---

## 📁 Current Tools

| Tool | File | Description |
|------|------|-------------|
| `web_search` | `webSearch.js` | Search the web using EXA API |
| `fetch_url` | `fetchUrl.js` | Fetch and read webpage content |
| `get_time` | `time.js` | Get current date and time |
| `image_search` | `imageSearch.js` | Search Pinterest for images |

---

## 🚀 Adding a New Tool

### Quick Start

1. **Create a new file** in `tools/` directory:
   ```bash
   cp tools/TEMPLATE.js tools/myNewTool.js
   ```

2. **Edit the file** - fill in definition, metadata, and execute function

3. **Restart the bot** - your tool is now available!

No other files need to be edited. The system automatically:
- ✅ Loads your tool definition
- ✅ Registers it with the AI
- ✅ Handles execution
- ✅ Displays progress messages
- ✅ Cleans up any leaked tags

---

## 📝 Tool Structure

Every tool file must export an object with three main sections:

### 1. Definition (Required)

Describes the tool to the AI:

```javascript
definition: {
    name: 'my_tool',           // Unique identifier (snake_case)
    description: '...',         // When and how to use this tool
    input_schema: {             // Parameters (OpenAPI 3.0 format)
        type: 'object',
        properties: {
            param1: { type: 'string', description: '...' }
        },
        required: ['param1']
    }
}
```

### 2. Metadata (Optional)

UI/UX configuration:

```javascript
metadata: {
    icon: '🔧',                                    // Emoji or text
    progressMessage: (input) => `Using ${input}`,  // Dynamic message
    resultType: 'text'                             // 'text', 'image', 'file'
}
```

### 3. Execute (Required)

Implementation logic:

```javascript
execute: async function(input) {
    // Your logic here
    return JSON.stringify({ success: true, result: '...' });
}
```

---

## 🎨 Result Types

### Text (default)
Standard text response:
```javascript
resultType: 'text'
```

### Image
Automatically downloads and sends image:
```javascript
resultType: 'image'

// Return format:
return JSON.stringify({
    success: true,
    images: ['https://example.com/image.jpg'],
    query: 'search term'
});
```

---

## 🔍 Examples

### Example 1: Simple Tool (No Parameters)

```javascript
// tools/serverStatus.js
module.exports = {
    definition: {
        name: 'get_server_status',
        description: 'Get bot server status and uptime',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },

    metadata: {
        icon: '🖥️',
        progressMessage: () => 'Checking server...',
        resultType: 'text'
    },

    execute: async function(input) {
        const uptime = process.uptime();
        return JSON.stringify({
            uptime: `${Math.floor(uptime / 3600)}h`,
            memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
            status: 'online'
        });
    }
};
```

### Example 2: External API Call

```javascript
// tools/weatherCheck.js
module.exports = {
    definition: {
        name: 'check_weather',
        description: 'Get current weather for any city',
        input_schema: {
            type: 'object',
            properties: {
                city: {
                    type: 'string',
                    description: 'City name (e.g., Jakarta, Tokyo)'
                }
            },
            required: ['city']
        }
    },

    metadata: {
        icon: '🌤️',
        progressMessage: (input) => `Getting weather for _${input.city}_`,
        resultType: 'text'
    },

    execute: async function(input) {
        try {
            const response = await fetch(`https://api.weather.com/v1/weather?city=${input.city}`);
            const data = await response.json();

            return JSON.stringify({
                city: input.city,
                temperature: data.temp + '°C',
                condition: data.condition,
                humidity: data.humidity + '%'
            });
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }
    }
};
```

### Example 3: Contact Lookup

```javascript
// tools/contactLookup.js
module.exports = {
    definition: {
        name: 'find_contact',
        description: 'Look up contact information by name',
        input_schema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Contact name to search for'
                }
            },
            required: ['name']
        }
    },

    metadata: {
        icon: '📇',
        progressMessage: (input) => `Looking up _${input.name}_`,
        resultType: 'text'
    },

    execute: async function(input) {
        // Your contact database/API logic here
        const contacts = [
            { name: 'John Doe', phone: '+1234567890', email: 'john@example.com' },
            { name: 'Jane Smith', phone: '+0987654321', email: 'jane@example.com' }
        ];

        const found = contacts.find(c => 
            c.name.toLowerCase().includes(input.name.toLowerCase())
        );

        if (found) {
            return JSON.stringify({
                success: true,
                contact: found
            });
        } else {
            return JSON.stringify({
                success: false,
                message: `Contact "${input.name}" not found`
            });
        }
    }
};
```

---

## 🛠️ Technical Details

### Auto-Loading Process

1. Bot starts → `tools/index.js` runs
2. Scans `tools/` directory for `*.js` files
3. Skips `index.js`, `TEMPLATE.js`, and `README.md`
4. Loads each file and validates structure
5. Registers tools in memory
6. Logs: `[Tools] Loaded: tool_name from filename.js`

### Validation

Tools are validated at load time:
- ✅ Must have `definition` object
- ✅ Must have `definition.name` string
- ✅ Must have `execute` function
- ⚠️ Invalid tools are skipped with warning

### Execution Flow

1. AI requests tool usage
2. System validates tool is in user's enabled list
3. Gets tool metadata for progress message
4. Displays progress to user
5. Calls `tool.execute(input)`
6. Handles result based on `resultType`
7. Sends result back to AI

---

## 📊 Dashboard Integration

Tools automatically appear in:
- **AI Settings → Defaults** - Select default enabled tools
- **Whitelist Management** - Configure per-user tool access
- **Tool filtering** - AI only uses tools user has access to

---

## 🔒 Security & Access Control

- Tools respect per-user `enabledTools` configuration
- Blocked tools return error to AI (silent to user)
- No progress message shown for unauthorized tools
- Tools can be temporarily added via `/tooladd` command

---

## 🐛 Troubleshooting

### Tool not loading?

Check bot startup logs:
```
[Tools] Loaded: web_search from webSearch.js
[Tools] Loaded: fetch_url from fetchUrl.js
```

If missing:
1. Check file is in `tools/` directory
2. Check file extension is `.js`
3. Check file exports proper structure
4. Check console for errors: `[Tools] Failed to load...`

### Tool not executing?

1. Check tool is enabled for user (Dashboard → Whitelist)
2. Check AI is actually calling the tool (terminal logs)
3. Check `execute` function doesn't throw unhandled errors
4. Add console.log in execute function for debugging

### Progress message not showing?

1. Check `metadata.progressMessage` is defined
2. Check function returns string
3. Check input parameters match what AI sends

---

## 📚 Best Practices

1. **Descriptive names** - Use clear, action-oriented names (`get_weather`, not `weather`)
2. **Detailed descriptions** - Help AI understand when to use the tool
3. **Error handling** - Always wrap in try-catch and return JSON errors
4. **Input validation** - Validate required parameters before processing
5. **Timeouts** - Set timeouts for external API calls
6. **Logging** - Use console.log for debugging: `[ToolName] Action`
7. **JSON responses** - Return structured JSON for consistent parsing

---

## 🔄 Temporary Tools

The system also supports temporary tools added via command:
```
.tooladd tool_name "description" '{"type":"object","properties":{"param":{"type":"string"}}}'
```

Temporary tools:
- Override static tools with same name
- Stored separately
- Can be removed without file changes

See `temporaryToolsManager.js` for details.

---

## 📝 Notes

- Tool files can be in any order (auto-loaded alphabetically)
- Tool names must be unique across all tools
- Restart bot after adding/modifying tools
- Hot-reload not supported (requires restart)
- Keep tool files focused and single-purpose

---

**Made with ❤️ for modular, maintainable AI tool development**
