# DevBot26 - WhatsApp Bot with Web Dashboard 2026 edition

WhatsApp bot built with [Wachan](https://npmjs.com/package/wachan) library, featuring a secure web dashboard for monitoring and control.

<img width="847" height="467" alt="image" src="https://github.com/user-attachments/assets/9ec54f3a-34d4-47af-98fe-e82613380aeb" />

## Features

- **Web Dashboard** - Real-time monitoring with authentication
- **Command System** - Modular command architecture
- **AI Assistant** - WhatsApp AI chatbot with:
  - Whitelist control with per-user model assignment
  - 4 AI tools: web search (EXA), URL fetching, time/date, image search (Pinterest)
  - Vision support (auto-switches to Claude Sonnet 4.5 for images)
  - Conversation memory (100 messages per chat)
  - Automatic fallback routing for unknown commands
  - Multi-round tool calling
- **MongoDB Storage** - Optional MongoDB for credentials and whitelist (deploy-friendly)
- **Sticker Creation** - Convert images/videos/GIFs to stickers
- **Code Compiler** - Execute code in multiple languages (JS, PHP, Python, C, Lua, Ruby)
- **Auto Ephemeral** - Messages auto-expire after 1 year
- **Pairing Code Auth** - Link device via QR or pairing code
- **Session Persistence** - Credentials saved, no re-login needed
- **Dev Command** - Monitor bot uptime and message statistics
- **External API** - Send messages and wait for replies via HTTP endpoints

## Prerequisites

- Node.js 16+
- npm or yarn

## Installation

```bash
npm install
```

## Configuration

Create `.env` file:

```env
# Dashboard Auth
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=your_secure_password

# Session Secret (change this!)
SESSION_SECRET=your_random_secret_key

# Environment
NODE_ENV=development

# HTTPS (optional)
HTTPS_ENABLED=false

# Credentials Storage
CREDS_STORAGE=file  # or 'mongodb'
MONGO_URI=mongodb://localhost:27017/whatsapp-bot  # required if CREDS_STORAGE=mongodb

# Bot Owner (for owner-only commands)
OWNER_ID=6212345678910@s.whatsapp.net

# AI Assistant (optional)
AI_API_KEY=your_openai_or_anthropic_api_key_here
EXA_API_KEY=your_exa_api_key_for_web_search

# External API (optional)
BOT_API_SECRET=your_api_secret_for_external_endpoints
```

### Credentials Storage

**File Storage (default)**:
- Credentials saved to `./wachan/state/creds.json`
- Whitelist saved to `./data/whitelist.json`
- Simple, no database needed
- Good for single-instance deployments

**MongoDB Storage**:
- Credentials saved to MongoDB collection `devbot26`
- Whitelist saved to MongoDB collection `whitelist`
- Deploy-friendly (Render, Heroku, Railway, etc.)
- Data persists across redeploys
- 5-minute TTL cache for whitelist (reduces DB queries)
- Requires MongoDB connection (MongoDB Atlas recommended)

To use MongoDB:
1. Set `CREDS_STORAGE=mongodb`
2. Set `MONGO_URI` to your MongoDB connection string
3. Bot auto-syncs credentials and whitelist between MongoDB and local files

## Usage

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
# Build minified assets first
npm run build

# Start bot
npm start
```

Dashboard: `http://localhost:3000`

### Command Management (Dashboard)

The web dashboard includes a **Commands** tab for managing temporary commands:

**Features:**
- View all loaded commands (permanent and temporary)
- Add new temporary commands via web interface
- Remove temporary commands
- See command details: aliases, section, owner-only status

**Adding Commands:**
1. Login to dashboard
2. Navigate to "Commands" tab
3. Click "+ Add Command" button
4. Enter command name and code
5. Click "Add Command"

**Command Code Format:**
```javascript
module.exports = {
    response: async (context, next) => {
        const { message, command } = context;
        return "Your response here";
    },
    options: {
        description: 'Command description',
        sectionName: 'Category',
        aliases: ['alias1', 'alias2']
    }
};
```

**Notes:**
- Temporary commands exist in memory only
- Restarting bot clears all temporary commands
- Permanent commands (from `/commands` folder) cannot be removed via dashboard

## First Run

1. Start bot
2. Open dashboard in browser
3. Login with credentials from `.env`
4. Enter phone number (with country code, no symbols)
5. Link device:
   - **QR Code**: Coming soon
   - **Pairing Code**: Enter 8-digit code in WhatsApp

After first auth, credentials saved in `./wachan/state/creds.json` - no phone number needed on restart.

## Available Commands

### General
- `.menu` / `.help` / `.commands` - Show command list
- `.ping` - Test bot response
- `.echo <text>` - Echo back text
- `.halo` - Greeting
- `dev` - Show bot statistics (uptime, message counts, storage type)

### Info
- `.owner` / `.pemilik` / `.creator` - Get bot owner contact information

### AI Assistant (Whitelist Only)
- `.ai <question>` - Ask AI assistant
- `.ai` (reply to message) - Analyze quoted message
- `.ai <comment>` (reply to message) - Comment on quoted message
- `.anything <text>` - Any unknown command routes to AI (e.g., `.translate hello`, `.summarize`, etc.)
- `.aiadd <number>` - Add user to AI whitelist (owner only)
- `.ailist` - List all whitelisted users (owner only)
- `.airem <number>` - Remove user from whitelist (owner only)

**Features:**
- Whitelist-only access with per-user model assignment
- Automatic fallback: unknown commands → AI
- Supports OpenAI (GPT) and Anthropic (Claude)
- Context-aware: can analyze quoted messages
- **Vision Support**: Auto-switches to Claude Sonnet 4.5 for image analysis
- **Conversation Memory**: Maintains last 100 messages per chat for context
- **4 AI Tools Available**:
  - `web_search` - Search the web for current information (EXA API)
  - `fetch_url` - Fetch and extract content from URLs
  - `get_time` - Get current date/time with timezone info
  - `image_search` - Search Pinterest for images
- **Multi-round Tool Calling**: AI can chain multiple tools to answer complex queries

**AI Tools in Action:**
```
User: "what's the bitcoin price now?"
AI: Uses web_search → Returns current BTC price with sources

User: "what day is today?"
AI: Uses get_time → Returns current date, day of week, timezone

User: "what holidays are this month?"
AI: Uses get_time + web_search → Returns accurate holiday list for current month/year

User: "show me sunset photos"
AI: Uses image_search → Returns Pinterest images
```

**Configuration:**
1. Set `AI_API_KEY` in `.env`
2. Edit `commands/ai.js` to switch provider (`AI_PROVIDER = 'openai'` or `'anthropic'`)
3. Add whitelisted numbers via dashboard (Whitelist tab) or commands

**Whitelist Management:**
- **Via Dashboard**: Whitelist tab → Add/Remove numbers, assign AI models per user
- **Via Commands**: `.aiadd`, `.ailist`, `.airem` (owner only)
- Numbers stored in MongoDB (if configured) or `./data/whitelist.json`
- 5-minute TTL cache with background sync
- Format: `6212345678910` or `6212345678910@s.whatsapp.net`

**Per-User Model Assignment:**
- Each whitelisted user can have a different AI model assigned
- Available models: `gpt-4o`, `gpt-4o-mini`, `claude-sonnet-4.5`, `claude-opus-4`, etc.
- Assign via dashboard or modify whitelist JSON/database directly
- Vision queries auto-switch to `claude-sonnet-4.5` regardless of assigned model

**Memory Behavior:**
- Conversations stored in `./memory/{chatId}.json`
- Auto-trims to last 100 messages (50 exchanges)
- Memory cleared on bot restart if file-based storage
- MongoDB storage persists memory across restarts

### Sticker
- `.stiker` / `.s` / `.wm` - Create sticker from image/video/GIF
  - Reply to media or send as caption
  - Custom pack/author: `.s "Pack Name" "Author"`
  - Separators: `|`, `.`, newline, or quotes

### Tools
- `.compiler` - List supported languages
- `.js <code>` - Run NodeJS (use `cl()` for `console.log()`)
- `.php <code>` - Run PHP
- `.py <code>` - Run Python 3.6
- `.cp <code>` - Run C
- `.lua <code>` - Run Lua
- `.rb <code>` - Run Ruby
- `.sysinfo` / `.system` / `.info` / `.spec` - Display system information and specs

Can reply to message containing code.

### Admin (Owner Only)
- `.cadd <name> <URL>` - Load temporary command from URL with custom name
- `.cadd <URL>` - Load temporary command from URL (auto-generated name)
- `.cadd <name>` (reply to message) - Load temporary command from message with custom name
- `.cadd` (reply to message) - Load temporary command from message (auto-generated name)
- `$<command>` - Execute shell command (e.g., `$ls -la`, `$git status`)
- `#<code>` - Evaluate JavaScript code (supports async/await)

Note: Set `OWNER_ID` in `.env` to your WhatsApp number with `@s.whatsapp.net` suffix.

## Project Structure

```
devbot26/
├── commands/          # Command modules
│   ├── ai.js          # AI assistant (OpenAI/Anthropic)
│   ├── aiadd.js       # Add to AI whitelist
│   ├── ailist.js      # List AI whitelist
│   ├── airem.js       # Remove from whitelist
│   ├── compiler.js    # Code execution
│   ├── sticker.js     # Sticker maker
│   ├── cadd.js        # Dynamic command loader
│   ├── sysinfo.js     # System information
│   ├── owner.js       # Owner contact
│   ├── menu.js        # Help menu
│   ├── ping.js        # Ping test
│   ├── echo.js        # Echo command
│   └── halo.js        # Greeting
├── tools/             # AI tool implementations
│   ├── definitions.js # Tool schemas
│   ├── webSearch.js   # EXA API integration
│   ├── fetchUrl.js    # URL content fetcher
│   ├── time.js        # Date/time tool
│   ├── imageSearch.js # Pinterest search
│   └── index.js       # Tool exports
├── utils/
│   └── typing.js      # Typing indicator helpers
├── public/            # Dashboard frontend
│   ├── dashboard.html
│   ├── dashboard.js
│   ├── dashboard.min.html
│   └── dashboard.min.js
├── data/              # Data storage (whitelist cache)
├── memory/            # Conversation history (per-chat JSON files)
├── wachan/            # Bot session data
├── index.js           # Bot entry point
├── dashboard.js       # Dashboard server
├── whitelistManager.js   # Whitelist storage manager
├── credentialsManager.js # Credentials storage handler
├── memoryManager.js   # Conversation memory system
├── obfuscate.js       # Build script
└── package.json
```

## External API

Bot exposes HTTP endpoints for external integrations:

### Send Message
```bash
POST http://localhost:3000/api/send
Content-Type: application/json
Authorization: Bearer YOUR_BOT_API_SECRET

{
  "to": "6212345678910@s.whatsapp.net",
  "message": "Hello from API!"
}
```

### Wait for Reply
```bash
POST http://localhost:3000/api/wait-reply
Content-Type: application/json
Authorization: Bearer YOUR_BOT_API_SECRET

{
  "to": "6212345678910@s.whatsapp.net",
  "message": "What's your name?",
  "timeout": 60000  // milliseconds (optional, default 60000)
}
```

Returns:
```json
{
  "success": true,
  "reply": "User's reply message"
}
```

### Other Dashboard API Endpoints

All dashboard endpoints require authentication via session cookies (login first):

- `POST /api/login` - Authenticate with username/password
- `GET /api/status` - Get bot connection status
- `GET /api/commands` - List all commands
- `POST /api/commands` - Add temporary command
- `DELETE /api/commands/:name` - Remove temporary command
- `GET /api/whitelist` - List whitelisted users
- `POST /api/whitelist` - Add user to whitelist
- `DELETE /api/whitelist/:number` - Remove user from whitelist
- `GET /api/memory` - List all chat memories
- `GET /api/memory/:chatId` - Get specific chat memory
- `DELETE /api/memory/:chatId` - Clear specific chat memory

**Configuration:**
- Set `BOT_API_SECRET` in `.env` for external API authentication
- Dashboard APIs use session-based auth (login via web interface)

## Dashboard Features

- **Real-time Logs** - See all bot activity
- **Bot Control** - Start/stop/restart bot
- **Status Monitor** - Connection status indicator
- **Command Management** - Add, view, and remove temporary commands via web interface
- **Whitelist Management** - Add/remove whitelisted numbers for AI command access with per-user model assignment
- **Memory Management** - View and clear conversation history per chat
- **Secure Auth** - bcrypt password hashing, rate limiting
- **Session Management** - Persistent login sessions

## Security Features

- Helmet.js security headers
- bcrypt password hashing (10 rounds)
- Express session management with secure cookies
- Rate limiting on login (5 attempts/15min)
- HTTPS support (configurable)
- Input sanitization
- Whitelist-based AI access control
- API key authentication for external endpoints
- Owner-only command verification
- Graceful shutdown handlers (SIGINT/SIGTERM) with MongoDB connection cleanup

## Scripts

- `npm run dev` - Start in development mode
- `npm start` - Start in production mode
- `npm run build` - Build minified dashboard assets

## Dependencies

- `wachan` - WhatsApp bot framework
- `express` - Web server
- `socket.io` - Real-time dashboard updates
- `bcrypt` - Password hashing
- `helmet` - Security headers
- `express-rate-limit` - Rate limiting
- `express-session` - Session management
- `mongodb` - MongoDB driver for credentials and whitelist storage
- `wa-sticker-formatter` - Sticker creation
- `jimp` - Image thumbnail generation (prevents Sharp crashes)
- `dotenv` - Environment variables

## Development

Add new commands in `./commands/`:

```javascript
module.exports = {
    response: async (context, next) => {
        const { message, command, group } = context;
        // Your logic here
        return "Response text";
    },
    options: {
        aliases: ['cmd', 'command'],
        description: 'Command description',
        sectionName: 'Category'
    }
};
```

Commands auto-loaded from `./commands/` folder.

## Technical Implementation Notes

### Direct Baileys Usage

Some features bypass Wachan and use Baileys directly for advanced functionality:

**AI Image Search** (`commands/ai.js`)
- Image responses sent via `sock.sendMessage()` directly
- Reason: Wachan doesn't support `jpegThumbnail` field
- Thumbnails generated with Jimp (5% of original size)
- Prevents Baileys from auto-generating thumbnails with Sharp (which causes crashes on some platforms like Render)

**Auto Ephemeral Messages** (`index.js`)
- Wraps `botSocket.sendMessage()` to inject `ephemeralExpiration: 31536000` (1 year)
- All outgoing messages automatically set to expire after 1 year
- Direct Baileys socket manipulation at connection time

**Command Fallback System** (`index.js`)
- Unknown commands with prefix → check whitelist → route to AI
- Enables natural language commands (`.translate`, `.summarize`, etc.)
- Non-whitelisted users get silent ignore (prevents feature discovery spam)

**Special Command Handling**
- `dev` command: No prefix required, exclusive monitoring for owner
- `$<cmd>`: Shell execution (owner-only, silent for non-owners)
- `#<code>`: JavaScript eval with async/await support (owner-only)

**AI Tool Execution Flow**
```
User message → Check whitelist → Get assigned model →
Build prompt with conversation context (last 100 messages) →
Call API with 4 tool definitions →
Execute tools (web_search/fetch_url/get_time/image_search) →
Multi-round tool calling (AI can chain multiple tools) →
Final response → Save to memory → Send (via Wachan or Baileys for images)
```

**Console Log Interception** (`dashboard.js`)
- Pipes all `console.log()` output to dashboard in real-time via Socket.IO
- Enables remote debugging and monitoring

These implementations ensure compatibility across different deployment platforms (local, Render, Heroku, Railway) while maintaining full functionality.

## Deployment

This bot is designed for easy deployment on cloud platforms:

**Supported Platforms:**
- Render
- Heroku
- Railway
- Any Node.js hosting with persistent storage or MongoDB

**Deployment Checklist:**
1. Set all environment variables in platform settings
2. Use `CREDS_STORAGE=mongodb` for platforms with ephemeral filesystem
3. Set up MongoDB Atlas (free tier works fine)
4. Set `MONGO_URI` to your MongoDB connection string
5. Ensure `NODE_ENV=production`
6. Run `npm run build` before deployment (or add to start script)
7. Bot will auto-sync credentials and whitelist from MongoDB on startup

**Platform-Specific Notes:**
- **Render**: Use MongoDB storage, credentials persist across redeploys
- **Heroku**: Same as Render, ensure MongoDB add-on or Atlas connection
- **Railway**: Built-in persistent volumes work, but MongoDB recommended for reliability
- **Local**: File storage works perfectly, no MongoDB needed

**Build Command:** `npm run build`  
**Start Command:** `npm start`

## Notes

- **Ephemeral Messages**: All messages auto-set to 1-year expiration
- **Typing Indicator**: Continuous typing for long operations (refreshes every 8s, WhatsApp expires after ~10s)
- **Media Download**: Sticker command handles images/videos/GIFs
- **Code Execution**: Uses external API (`apied26.adev.com`) for sandboxed execution
- **Conversation Memory**: AI maintains last 100 messages per chat (50 exchanges) in `./memory/` folder
- **Whitelist Cache**: 5-minute TTL cache with background MongoDB sync to reduce DB queries
- **Thumbnail Generation**: Uses Jimp (5% resize) instead of Sharp to prevent crashes on deployment platforms

## Troubleshooting

**Dashboard 500 Error or Assets Not Loading**:
```bash
npm run build
```
This generates minified/obfuscated assets in `public/dashboard.min.html` and `public/dashboard.min.js`.

**Bot won't connect**:
- Check phone number format (country code, no symbols, e.g., `6281234567890`)
- Delete `./wachan/state/` to reset credentials
- Check console for pairing code
- Ensure WhatsApp is linked properly (don't unlink from phone)
- Check internet connection

**Commands not working**:
- Verify command prefix (default: `.`)
- Check command is in `./commands/` folder
- Restart bot after adding permanent commands
- Check if command requires owner permission
- Verify `OWNER_ID` is set correctly in `.env`

**AI commands not responding**:
- Check if user is whitelisted (use `.ailist` or dashboard)
- Verify `AI_API_KEY` is set in `.env`
- Check API provider (OpenAI/Anthropic) in `commands/ai.js`
- Check console logs for API errors
- Ensure sufficient API credits

**Web search not working**:
- Verify `EXA_API_KEY` is set in `.env`
- Check EXA API quota/limits
- Fallback: AI can still answer without web search

**Memory not persisting**:
- File storage: memory clears on bot restart (stored in `./memory/` folder)
- MongoDB storage: memory persists across restarts
- Check if MongoDB is connected properly

**MongoDB connection issues**:
- Verify `MONGO_URI` format: `mongodb+srv://user:pass@cluster.mongodb.net/dbname`
- Check MongoDB Atlas IP whitelist (allow 0.0.0.0/0 for development)
- Ensure network connectivity
- Check MongoDB Atlas cluster status

**Sticker creation fails**:
- Ensure media is downloaded properly
- Check file size (WhatsApp limits: image 500KB, video 1MB)
- Verify `wa-sticker-formatter` is installed
- Check media format (supported: JPG, PNG, MP4, GIF)

**Code compiler timeout**:
- External API might be down
- Check `apied26.adev.com` availability
- Increase timeout if needed
- Try different language/code

**Dashboard login fails**:
- Verify `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD` in `.env`
- Check rate limiting (5 attempts/15min)
- Clear browser cookies/cache
- Verify `SESSION_SECRET` is set

## FAQ

**Q: Can I use multiple WhatsApp accounts?**  
A: No, this bot supports one WhatsApp account per instance. Deploy multiple instances for multiple accounts.

**Q: Does the bot work in groups?**  
A: Yes, all commands work in groups. AI commands require the user to be whitelisted individually.

**Q: Can I change the command prefix from `.` to something else?**  
A: Yes, modify the prefix in `commands/menu.js` and other command files. The `dev`, `$cmd`, and `#eval` commands are prefix-independent.

**Q: How do I add my own AI tools?**  
A: Add tool definition in `tools/definitions.js`, implement the tool in `tools/yourTool.js`, export in `tools/index.js`, and add to the tools array in `commands/ai.js`.

**Q: Can I use other AI providers (Gemini, Llama, etc.)?**  
A: Yes, modify `commands/ai.js` to add your provider's API call. The tool calling system may need adjustment based on provider capabilities.

**Q: How much does it cost to run?**  
A: Free tier options:
- MongoDB Atlas: Free (512MB)
- Render: Free tier available (with limitations)
- AI APIs: Pay-per-use (OpenAI ~$0.002/1K tokens, Anthropic ~$0.003/1K tokens)
- EXA API: Free tier with limited searches

**Q: Is my WhatsApp account safe?**  
A: This bot uses official WhatsApp Web protocol via Baileys. However:
- Use at your own risk
- Don't spam or violate WhatsApp ToS
- Consider using a secondary number for bots
- WhatsApp may ban accounts for unusual activity

**Q: Can I run this 24/7?**  
A: Yes, deploy to cloud platforms (Render/Heroku/Railway) with MongoDB storage for 24/7 operation.

**Q: How do I backup my data?**  
A: 
- **Credentials**: Backed up in MongoDB or `./wachan/state/creds.json`
- **Whitelist**: Backed up in MongoDB or `./data/whitelist.json`
- **Memory**: In `./memory/` folder (JSON files per chat)
- Export MongoDB collections periodically for safety

**Q: Can I customize the AI personality?**  
A: Yes, edit the system prompt in `commands/ai.js` (look for the prompt that gets sent to the AI API).

**Q: Why are my messages set to ephemeral?**  
A: Auto-ephemeral is enabled by default (1 year expiration). To disable, remove the auto-ephemeral wrapper code in `index.js`.

**Q: Can I integrate this with other services?**  
A: Yes, use the External API endpoints (`/api/send`, `/api/wait-reply`) to integrate with webhooks, Zapier, n8n, or custom scripts.

## Customization Tips

**Change AI Provider:**
```javascript
// In commands/ai.js, change:
const AI_PROVIDER = 'openai'; // or 'anthropic'
```

**Add Custom AI Tool:**
1. Create `tools/myTool.js`:
```javascript
module.exports = async function myTool(params) {
    // Your tool logic
    return result;
};
```

2. Add definition in `tools/definitions.js`:
```javascript
{
    name: 'my_tool',
    description: 'What this tool does',
    input_schema: {
        type: 'object',
        properties: {
            param: { type: 'string', description: 'Parameter description' }
        },
        required: ['param']
    }
}
```

3. Export in `tools/index.js` and use in `commands/ai.js`

**Modify Dashboard Port:**
```javascript
// In dashboard.js, change:
const PORT = process.env.PORT || 3000;
```

**Customize Bot Response Style:**
Edit system prompts in `commands/ai.js` to change how the AI responds (formal, casual, specific language, etc.).

**Add Custom Middleware:**
```javascript
// In index.js, add before command handlers:
bot.middleware((context, next) => {
    // Your middleware logic
    return next();
});
```

**Change Ephemeral Duration:**
```javascript
// In index.js, modify:
ephemeralExpiration: 31536000 // seconds (current: 1 year)
```

**Customize Memory Size:**
```javascript
// In memoryManager.js, change:
const MAX_MESSAGES = 100; // currently 100 messages
```

## Performance Tips

- Use MongoDB storage for production (faster than file I/O)
- Enable whitelist cache (already enabled, 5-min TTL)
- Limit conversation memory size (default: 100 messages is optimal)
- Use `gpt-4o-mini` instead of `gpt-4o` for faster, cheaper responses
- Deploy close to your MongoDB region for lower latency
- Use Render/Railway in the same region as MongoDB Atlas
- Enable build step (`npm run build`) before production deploy
- Monitor bot memory usage and restart periodically if needed

## Contributing

Contributions welcome! Feel free to:
- Report bugs via issues
- Submit pull requests
- Suggest new features
- Improve documentation

## License

ISC

## Author

Devrian

## Links

- [Wachan Library](https://npmjs.com/package/wachan) - WhatsApp bot framework
- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) - Free MongoDB hosting
- [Render](https://render.com) - Free Node.js hosting

---

Built with [Wachan](https://npmjs.com/package/wachan) - Simpler way to code baileys
