# DevBot26 - WhatsApp AI Assistant

AI-powered WhatsApp bot with web dashboard. Built with [Wachan](https://npmjs.com/package/wachan).

<img width="847" height="467" alt="Dashboard" src="https://github.com/user-attachments/assets/9ec54f3a-34d4-47af-98fe-e82613380aeb" />

## Features

- **AI Assistant** - OpenAI/Anthropic with vision, web search, memory, per-user models
- **AI Tools** - Web search (EXA), image search (Pinterest), code execution, URL fetching, time info, WhatsApp context (user/group info)
- **Web Dashboard** - Real-time control, whitelist management, secure auth
- **Bot Commands** - Sticker maker, translator, code compiler (JS/Python/PHP/C/Lua/Ruby)
- **MongoDB** - Optional storage for credentials/whitelist (deploy-friendly)
- **API** - Send messages via HTTP endpoints

## Quick Start

```bash
npm install
```

Create `.env` from `.env.example`:

```env
# Dashboard Authentication
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=your_secure_password_here
SESSION_SECRET=your_random_session_secret_here
HTTPS_ENABLED=false

# Storage Configuration
# Options: 'file' or 'mongodb'
# Storage hierarchy:
# 1. Component-specific env var (e.g., WHITELIST_STORAGE)
# 2. GLOBAL_STORAGE (fallback for all components)
# 3. Default: 'file'

GLOBAL_STORAGE=file
MONGO_URI=mongodb://localhost:27017/whatsapp-bot

# Component-specific storage (optional overrides)
# CREDENTIALS_STORAGE=file         # WhatsApp credentials (creds.json)
# WHITELIST_STORAGE=file           # AI whitelist
# MEMORY_STORAGE=file              # Conversation memory
# USERSTORE_STORAGE=file           # Contact cache (user-store.json)
# WACHAN_SETTINGS_STORAGE=file     # Wachan bot settings
# AI_SETTINGS_STORAGE=file         # AI default settings (model, quota, reset, API config)

# Bot Configuration
OWNER_ID=6212345678910@s.whatsapp.net

# AI Configuration
# IMPORTANT: These are FALLBACK values only.
# Once you configure API settings via Dashboard → AI Settings,
# the dashboard values take precedence and these env vars are ignored.

AI_API_KEY=your_ai_api_key_here
# AI_API_ENDPOINT=ai2.adevdev.com  # optional - defaults to ai2.adevdev.com
# EXA_API_KEY=your_exa_api_key     # optional - EXA free tier works without key

# External API (To access bot via API)
BOT_API_SECRET=your-secret-key-change-this
```

Run development mode:
```bash
npm run dev
```

Or build and run:
```bash
npm run build
npm start
```

Open `http://localhost:3000`, login, enter phone number, link via pairing code.

## AI Behavior

**Private chats:** All messages route to AI automatically (no prefix needed, whitelist only or auto-whitelist)
**Groups:** Use `.ai <question>` or any unknown command (e.g., `.translate`, `.summarize`), or auto fallback to AI with  prefix `.[prompt]`

**Commands:** (owner only)
- `.aiadd @mention` - Add to whitelist 
- `.ailist` - List whitelisted users
- `.airem @mention` - Remove from whitelist

Assign models per user via dashboard. Auto-switches to Claude Sonnet 4.5 for images (Adjustable via dashboard).

## Other Commands

`.menu` - Command list | `.s` - Sticker | `.js <code>` - Run code | `dev` - Stats

## License

ISC - Devrian
