# DevBot26 - WhatsApp AI Assistant

AI-powered WhatsApp bot with web dashboard. Built with [Wachan](https://npmjs.com/package/wachan).

<img width="847" height="467" alt="Dashboard" src="https://github.com/user-attachments/assets/9ec54f3a-34d4-47af-98fe-e82613380aeb" />

## Features

- **AI Assistant** - OpenAI/Anthropic with vision, web search, memory, per-user models
- **Web Dashboard** - Real-time control, whitelist management, secure auth
- **Tools** - Sticker maker, code compiler (JS/Python/PHP/C/Lua/Ruby)
- **MongoDB** - Optional storage for credentials/whitelist (deploy-friendly)
- **API** - Send messages via HTTP endpoints

## Quick Start

```bash
npm install
```

Create `.env`:
```env
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=your_password
SESSION_SECRET=random_secret
OWNER_ID=6212345678910@s.whatsapp.net

AI_API_KEY=your_openai_or_anthropic_key
# AI_API_ENDPOINT=ai2.adevdev.com  # optional proxy
# EXA_API_KEY=your_exa_key         # optional, free tier works

GLOBAL_STORAGE=file                # or 'mongodb'
MONGO_URI=mongodb://localhost:27017/whatsapp-bot

BOT_API_SECRET=your_api_secret
HTTPS_ENABLED=false
```

Run:
```bash
npm run dev
```

Open `http://localhost:3000`, login, enter phone number, link via pairing code.

## AI Behavior

**Private chats:** All messages route to AI automatically (no prefix needed, whitelist only or auto-whitelist)
**Groups:** Use `.ai <question>` or any unknown command (e.g., `.translate`, `.summarize`)

**Commands:** (owner only)
- `.aiadd @mention` - Add to whitelist 
- `.ailist` - List whitelisted users
- `.airem @mention` - Remove from whitelist

Assign models per user via dashboard. Auto-switches to Claude Sonnet 4.5 for images (Adjustable via dashboard).

## Other Commands

`.menu` - Command list | `.s` - Sticker | `.js <code>` - Run code | `dev` - Stats

## License

ISC - Devrian
