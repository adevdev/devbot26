# DevBot26 - WhatsApp Bot with Web Dashboard 2026 edition

WhatsApp bot built with [Wachan](https://npmjs.com/package/wachan) library, featuring a secure web dashboard for monitoring and control.

## Features

- **Web Dashboard** - Real-time monitoring with authentication
- **Command System** - Modular command architecture
- **Sticker Creation** - Convert images/videos/GIFs to stickers
- **Code Compiler** - Execute code in multiple languages (JS, PHP, Python, C, Lua, Ruby)
- **Auto Ephemeral** - Messages auto-expire after 1 year
- **Pairing Code Auth** - Link device via QR or pairing code
- **Session Persistence** - Credentials saved, no re-login needed

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
```

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

## First Run

1. Start bot
2. Open dashboard in browser
3. Login with credentials from `.env`
4. Enter phone number (with country code, no symbols)
5. Link device:
   - **QR Code**: Scan in WhatsApp > Linked Devices
   - **Pairing Code**: Enter 8-digit code in WhatsApp

After first auth, credentials saved in `./wachan/state/creds.json` - no phone number needed on restart.

## Available Commands

### General
- `.menu` / `.help` / `.commands` - Show command list
- `.ping` - Test bot response
- `.echo <text>` - Echo back text
- `.halo` - Greeting

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

Can reply to message containing code.

## Project Structure

```
devbot26/
├── commands/          # Command modules
│   ├── compiler.js    # Code execution
│   ├── stiker.js      # Sticker maker
│   ├── menu.js        # Help menu
│   ├── ping.js        # Ping test
│   ├── echo.js        # Echo command
│   └── halo.js        # Greeting
├── utils/
│   └── typing.js      # Typing indicator helpers
├── public/            # Dashboard frontend
├── wachan/            # Bot session data
├── index.js           # Bot entry point
├── dashboard.js       # Dashboard server
├── obfuscate.js       # Build script
└── package.json
```

## Dashboard Features

- **Real-time Logs** - See all bot activity
- **Bot Control** - Start/stop/restart bot
- **Status Monitor** - Connection status indicator
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
