/**
 * System Prompt Module: Upload History
 *
 * Informs AI about recently uploaded images to CDN
 * so AI can reference and reuse URLs without re-uploading
 */

module.exports = {
    name: 'upload-history',
    description: 'Provides context about recent CDN uploads',
    category: 'Context',

    generate: async (context) => {
        const uploadHistoryManager = require('../uploadHistoryManager');
        const { roomJid } = context;

        if (!roomJid) {
            return null;
        }

        // Get recent uploads for this chat
        const recentUploads = uploadHistoryManager.getRecentUploads(roomJid);

        // Skip if no recent uploads
        if (!recentUploads || recentUploads.length === 0) {
            return null;
        }

        // Build upload history section
        const now = Date.now();
        const uploadList = recentUploads.slice(0, 5).map((upload, index) => {
            const ageMs = now - upload.timestamp;
            const timeAgo = formatTimeAgo(ageMs);
            const ageMinutes = Math.floor(ageMs / 60000);

            // Check if this is very recent (likely from current workflow)
            const isVeryRecent = ageMinutes < 5;
            const recentIndicator = isVeryRecent ? ' **[RECENT]**' : '';

            // Format purpose for display
            const purposeLabel = formatPurpose(upload.purpose);
            const sizeKB = (upload.size / 1024).toFixed(1);

            // Include caption if available
            const captionLine = upload.caption ? `\n     Caption: "${upload.caption}"` : '';

            return `  ${index + 1}. **${purposeLabel}**${recentIndicator}${captionLine}
     URL: ${upload.url}
     File: ${upload.filename} (${sizeKB} KB)
     Uploaded: ${timeAgo}`;
        }).join('\n\n');

        return `## Recent CDN Uploads

You have recently uploaded these images to CDN:

${uploadList}

## How to Use Upload History:

**Caption-based retrieval (preferred):**
- When user says "use that girl image", "send the red dress photo", match by caption
- Captions are user-provided descriptions that make images easy to identify
- Much clearer than purpose alone: "girl with red dress" vs "faceswap_target"

**Purpose-based retrieval:**
- When user asks "use that face image", "send that target photo", find matching purpose
- \`faceswap_source\` = face image for swapping
- \`faceswap_target\` = body/target image for faceswap
- \`i2v_input\` = input image for image-to-video
- \`general\` = general purpose upload

**Reusing URLs:**
- If user asks to "send that image I uploaded", use the URL directly with \`send_image\` tool
- For faceswap retry: reuse existing URLs instead of re-uploading
- Check timestamps - uploads expire after 30 minutes

**Best practice:**
- When calling \`upload_image\`, always pass caption from \`download_media\` result
- Example: \`upload_image(purpose: "faceswap_target", filePath: "...", caption: downloadResult.caption)\`
- This preserves user's original image description for easy reference

**Important:**
- URLs marked **[RECENT]** are from current workflow (< 5 mins ago)
- Don't re-upload same image if URL already exists for same purpose
- CDN URLs are temporary (expire per server policy, typically 24h)`;
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

/**
 * Format purpose for display
 */
function formatPurpose(purpose) {
    const labels = {
        'faceswap_source': 'Faceswap Source (Face)',
        'faceswap_target': 'Faceswap Target (Body)',
        'i2v_input': 'Image-to-Video Input',
        'general': 'General Upload'
    };

    return labels[purpose] || purpose;
}
