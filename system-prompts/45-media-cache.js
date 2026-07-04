/**
 * System Prompt Module: Media Cache
 *
 * Informs AI about recently sent media messages that are cached and available
 * for use with tools like upload_image and faceswap workflows.
 */

module.exports = {
    name: 'media-cache',
    description: 'Provides context about recent media messages available in cache',
    category: 'Context',

    generate: async (context) => {
        const { recentMedia, currentTime } = context;

        // Skip if no recent media
        if (!recentMedia || recentMedia.length === 0) {
            return null; // Don't add anything to system prompt
        }

        // Filter only images (most relevant for faceswap/i2v)
        const recentImages = recentMedia.filter(m => m.type === 'image');

        if (recentImages.length === 0) {
            return null;
        }

        // Build media context section with enhanced information
        const now = Date.now();
        const mediaList = recentImages.slice(0, 5).map((media, index) => {
            const ageMs = now - media.timestamp;
            const ageMinutes = Math.floor(ageMs / 60000);
            const timeAgo = formatTimeAgo(ageMs);

            // Check if this is very recent (likely the current conversation image)
            const isVeryRecent = ageMinutes < 5;
            const recentIndicator = isVeryRecent ? ' **[RECENT - likely current conversation]**' : '';

            const caption = media.caption ? ` (user said: "${media.caption}")` : ' (no caption)';
            const fromMe = media.fromMe ? ' [sent by me]' : '';

            return `  ${index + 1}. Message ID: \`${media.messageId}\`${recentIndicator}
     Type: ${media.type}
     Sent: ${timeAgo} (${ageMinutes} minutes ago)${caption}${fromMe}`;
        }).join('\n\n');

        return `## Recent Media Cache

You have access to recently sent images in this conversation:

${mediaList}

## How to Use Cached Media:

**IMPORTANT UNDERSTANDING:**

1. **"Previous image" / "that image" references:**
   - When user asks about "previous image", "that image", or similar references, they mean the MOST RECENT image in the cache above (usually #1)
   - You MUST use the \`download_media\` tool with source="cached" and that message ID to access it
   - Even if the image was sent a few minutes ago, it's still in cache (30min TTL)

2. **For faceswap/i2v workflows:**
   - When user requests faceswap or image-to-video, you can reference these cached images
   - Step 1: Use \`download_media\` tool with source="cached" and messageId (returns filePath + base64Data)
   - Step 2: Use \`upload_image\` tool with filePath parameter (recommended) or base64Data parameter
   - Step 3: Store the returned CDN URL
   - Step 4: Repeat for second image if needed
   - Step 5: Call \`connectAilab\` with the CDN URLs (sourceImage + targetImage for faceswap)

3. **Recent conversation context:**
   - Images marked as **[RECENT]** were sent in the last 5 minutes and are likely part of current conversation
   - If user just asked about an image and now asks follow-up questions, that image is still accessible via its message ID

**Example workflows:**

User: [sends image] "what's in this?"
You: [analyze image, cache is populated]

User: "is there a cat in that image?"
You: → Call download_media(source: "cached", messageId: from #1, includeForAnalysis: true) → Re-analyze → Answer

User: [sends image 1] → [sends image 2] → "faceswap these"
You:
  1. download_media(source: "cached", messageId: #1) → get filePath1
  2. upload_image(purpose: "faceswap_target", filePath: filePath1) → get url1
  3. download_media(source: "cached", messageId: #2) → get filePath2
  4. upload_image(purpose: "faceswap_source", filePath: filePath2) → get url2
  5. connectAilab(mode: "faceswap", sourceImage: url2, targetImage: url1)`;
    }
};

/**
 * Convert timestamp to human-readable "time ago"
 */
function formatTimeAgo(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;

    return 'earlier today';
}
