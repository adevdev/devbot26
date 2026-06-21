# DevBot26 - WhatsApp Bot with Web Dashboard 2026 edition

WhatsApp bot built with [Wachan](https://npmjs.com/package/wachan) library, featuring a secure web dashboard for monitoring and control.

<img width="847" height="467" alt="image" src="https://github.com/user-attachments/assets/9ec54f3a-34d4-47af-98fe-e82613380aeb" />

## Features

- **Web Dashboard** - Real-time monitoring with authentication
- **Command System** - Modular command architecture
- **AI Assistant** - WhatsApp AI chatbot with whitelist control, web search, time tools, and fallback routing
- **MongoDB Storage** - Optional MongoDB for credentials (deploy-friendly)
- **Sticker Creation** - Convert images/videos/GIFs to stickers
- **Code Compiler** - Execute code in multiple languages (JS, PHP, Python, C, Lua, Ruby)
- **Auto Ephemeral** - Messages auto-expire after 1 year
- **Pairing Code Auth** - Link device via QR or pairing code
- **Session Persistence** - Credentials saved, no re-login needed
- **Dev Command** - Monitor bot uptime and message statistics

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
```

### Credentials Storage

**File Storage (default)**:
- Credentials saved to `./wachan/state/creds.json`
- Simple, no database needed
- Good for single-instance deployments

**MongoDB Storage**:
- Credentials saved to MongoDB collection `devbot26`
- Deploy-friendly (Render, Heroku, Railway, etc.)
- Credentials persist across redeploys
- Requires MongoDB connection (MongoDB Atlas recommended)

To use MongoDB:
1. Set `CREDS_STORAGE=mongodb`
2. Set `MONGO_URI` to your MongoDB connection string
3. Bot auto-syncs credentials between MongoDB and local file

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

**Features:**
- Whitelist-only access (manage via dashboard)
- Automatic fallback: unknown commands → AI
- Supports OpenAI (GPT) and Anthropic (Claude)
- Context-aware: can analyze quoted messages
- **Web Search Tool**: AI can search the web for current information, news, prices, etc.
- **Time Tool**: AI knows current date/time and can provide detailed timestamp information
- **Multi-round Tool Calling**: AI can use multiple tools in sequence to answer complex queries

**AI Tools in Action:**
```
User: "what's the bitcoin price now?"
AI: Uses web_search → Returns current BTC price with sources

User: "what day is today?"
AI: Uses get_time → Returns current date, day of week, timezone

User: "what holidays are this month?"
AI: Uses get_time + web_search → Returns accurate holiday list for current month/year
```

**Configuration:**
1. Set `AI_API_KEY` in `.env`
2. Edit `commands/ai.js` to switch provider (`AI_PROVIDER = 'openai'` or `'anthropic'`)
3. Add whitelisted numbers via dashboard (Whitelist tab)

**Whitelist Management:**
- Dashboard → Whitelist tab → Add/Remove numbers
- Numbers stored in MongoDB (if configured) or `./data/whitelist.json`
- Format: `6212345678910` or `6212345678910@s.whatsapp.net`

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

Note: Set `OWNER_ID` in `.env` to your WhatsApp number with `@s.whatsapp.net` suffix.

## Project Structure

```
devbot26/
├── commands/          # Command modules
│   ├── ai.js          # AI assistant (OpenAI/Anthropic)
│   ├── compiler.js    # Code execution
│   ├── sticker.js     # Sticker maker
│   ├── cadd.js        # Dynamic command loader
│   ├── sysinfo.js     # System information
│   ├── owner.js       # Owner contact
│   ├── menu.js        # Help menu
│   ├── ping.js        # Ping test
│   ├── echo.js        # Echo command
│   └── halo.js        # Greeting
├── utils/
│   └── typing.js      # Typing indicator helpers
├── public/            # Dashboard frontend
├── data/              # Data storage (whitelist cache)
├── wachan/            # Bot session data
├── index.js           # Bot entry point
├── dashboard.js       # Dashboard server
├── whitelistManager.js   # Whitelist storage manager
├── credentialsManager.js  # Credentials storage handler
├── obfuscate.js       # Build script
└── package.json
```

## Dashboard Features

- **Real-time Logs** - See all bot activity
- **Bot Control** - Start/stop/restart bot
- **Status Monitor** - Connection status indicator
- **Command Management** - Add, view, and remove temporary commands via web interface
- **Whitelist Management** - Add/remove whitelisted numbers for AI command access
- **Secure Auth** - bcrypt password hashing, rate limiting
- **Session Management** - Persistent login sessions

## Security Features

- Helmet.js security headers
- bcrypt password hashing
- Express session management
- Rate limiting on login (5 attempts/15min)
- HTTPS support (configurable)
- Input sanitization

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
- `mongodb` - MongoDB driver for credentials storage
- `wa-sticker-formatter` - Sticker creation
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
- Prevents Baileys from auto-generating thumbnails with Sharp (which causes crashes on some platforms)

**Auto Ephemeral Messages** (`index.js`)
- Wraps `botSocket.sendMessage()` to inject `ephemeralExpiration: 31536000` (1 year)
- All outgoing messages automatically set to expire after 1 year
- Direct Baileys socket manipulation

These implementations ensure compatibility across different deployment platforms (local, Render, etc.) while maintaining full functionality.

## Notes

- **Ephemeral Messages**: All messages auto-set to 1-year expiration
- **Typing Indicator**: Continuous typing for long operations (compiler)
- **Media Download**: Sticker command handles images/videos/GIFs
- **Code Execution**: Uses external API (`apied26.adevdev.com`)

## Troubleshooting

**Dashboard 500 Error**:
```bash
npm run build
```

**Bot won't connect**:
- Check phone number format (country code, no symbols)
- Delete `./wachan/state/` to reset credentials
- Check console for pairing code

**Commands not working**:
- Verify command prefix (default: `.`)
- Check command is in `./commands/` folder
- Restart bot after adding commands

## License

ISC

## Author

Devrian

---

Built with [Wachan](https://npmjs.com/package/wachan) - Simpler way to code baileys
