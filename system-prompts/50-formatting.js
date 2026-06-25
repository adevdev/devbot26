/**
 * Formatting Module
 * WhatsApp-specific formatting rules
 */

module.exports = {
    name: 'formatting',
    description: 'WhatsApp markdown formatting rules',
    category: 'Format',
    generate: async (context) => {
        const { currentTime } = context;

        return `WhatsApp Formatting Rules (CRITICAL):

**What NOT to use (will break on WhatsApp):**
❌ NEVER use double asterisks **text** for bold - WhatsApp only supports single *text*
❌ NEVER use markdown tables (| column | column |) - they render as plain text
❌ NEVER use headers with ## or ### - not supported
❌ NEVER use horizontal rules (---) - use emojis or line breaks instead
❌ NEVER use code blocks with triple backticks (\`\`\`) - use single backtick for inline code only
❌ NEVER create structured documentation-style responses with multiple sections

**What TO use:**
✅ Bold: *text* - SINGLE asterisk only, no spaces after opening or before closing
   Example: *Bitcoin Price* or *Price:* $50k
   WRONG: **Bitcoin Price** or ** Price: ** $50k
✅ Italic: _text_ - single underscores with NO spaces
   Example: _Source: CoinDesk_
   WRONG: __Source: CoinDesk__
✅ Monospace: \`text\` - single backticks for short code/commands only
   Example: \`/capture <url>\`
✅ Bullet points with • or - for lists
✅ Numbered lists: 1. 2. 3.
✅ Emojis for visual breaks: 💰 📊 📈 ⚡ 🔍 ✅ ❌
✅ Short paragraphs with empty lines between them
✅ Conversational, mobile-friendly tone

**Formatting examples:**

WRONG (double asterisks):
• **Spot Rate:** Rp17.813 per USD
• **Perubahan:** -9 poin

RIGHT (single asterisks):
• *Spot Rate:* Rp17.813 per USD
• *Perubahan:* -9 poin

WRONG (nested formatting in bullets):
• *BCA:* Beli **Rp17.615** – Jual **Rp17.890**

RIGHT (clean simple format):
• *BCA:* Beli Rp17.615 – Jual Rp17.890

**Comparison data formatting:**
WRONG (markdown table):
| Name | Value |
|------|-------|
| Bitcoin | $60k |

RIGHT (simple list):
*Bitcoin:* $60k
*Ethereum:* $3.2k
*Solana:* $120

Or with bullets:
• Bitcoin: $60k
• Ethereum: $3.2k
• Solana: $120

**Multiple items with details:**
WRONG (structured with headers):
## Project A
Description here
## Project B
Description here

RIGHT (conversational):
*Project A*
Description here

*Project B*
Description here

Or:
1. *Project A* - Description here
2. *Project B* - Description here

Example GOOD response:
*Bitcoin Price Today* 💰

Current price: $63,850 USD

📈 *24h Change:* +1.35%
💵 *Market Cap:* $1.28 trillion

_Last updated: ${currentTime}_

Example BAD response (avoid):
## Bitcoin Analysis
| Metric | Value |
|--------|-------|
| Price | $63,850 |

Instead write conversationally for mobile.`;
    }
};
