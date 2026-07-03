# Faceswap & Image-to-Video Workflow (Media Cache Solution)

## 🎯 Solution: Media Cache System

**Problem Solved:** WhatsApp message context is ephemeral - setelah user kirim message baru, AI tidak bisa akses message lama. Ini membuat faceswap workflow (butuh 2 gambar) gagal.

**Solution:** Auto-cache setiap media message dengan message ID, lalu AI bisa reference cache kapan saja (dalam 30 menit).

---

## ✅ How It Works

### Architecture:

```
User sends image 1
    ↓
mediaCacheManager.cacheMediaMessage()  ← Auto-cached
    ↓
AI receives context: "Recent Media Cache: [messageId1]"
    ↓
User sends image 2
    ↓
mediaCacheManager.cacheMediaMessage()  ← Auto-cached
    ↓
AI receives context: "Recent Media Cache: [messageId1, messageId2]"
    ↓
User: "faceswap"
    ↓
AI sees both images in cache → downloads both → uploads both → faceswap ✅
```

### New Components:

1. **`mediaCacheManager.js`** - In-memory cache (30 min TTL, max 10 per chat)
2. **`system-prompts/45-media-cache.js`** - System prompt module yang inform AI tentang cached media
3. **`tools/downloadCachedMedia.js`** - Tool untuk download dari cache by message ID
4. **`tools/uploadImage.js`** - Updated to support base64Data input

---

## 🚀 Faceswap Workflow (New - Flexible)

### Method 1: Sequential (User sends images, then command)

```
User: [sends image 1 - target body]
      (no text)

Bot: (no response, image cached silently)

User: [sends image 2 - source face]
      (no text)

Bot: (no response, image cached silently)

User: "ganti wajah cwe ini"

AI: ✅ Checks system prompt: "Recent Media Cache: 2 images available"
     ✅ Calls download_cached_media(messageId1) → gets base64
     ✅ Calls upload_image(base64Data, purpose: faceswap_target) → gets URL1
     ✅ Calls download_cached_media(messageId2) → gets base64
     ✅ Calls upload_image(base64Data, purpose: faceswap_source) → gets URL2
     ✅ Calls connectAilab.generate(mode: faceswap, targetImage: URL1, sourceImage: URL2)
     
Bot: "Processing faceswap... ⚙️"
     [Result sent via SSE]
```

### Method 2: With Instructions (User gives command with first image)

```
User: [sends image with caption: "ganti wajah cwe ini"]

AI: "Untuk faceswap butuh 2 gambar:
     1. Target (badan) ✅ sudah terima
     2. Source (wajah pengganti) - kirim sekarang"

User: [sends image 2]

AI: ✅ Downloads cached image 1 from cache
     ✅ Downloads current image 2
     ✅ Uploads both → faceswap
```

### Method 3: Quote/Reply (User quotes one of the images)

```
User: [sends image 1]
User: [sends image 2]
User: [quotes/replies to image 1]
      ".target" atau "jadikan ini target"

AI: ✅ Recognizes quoted message has image 1
     ✅ Current message context has reference
     ✅ Downloads both from cache → upload → faceswap
```

---

## 📋 Tools Reference

### 1. `download_cached_media`

**Purpose:** Download media from previously sent message using cached message ID.

**Parameters:**
```javascript
{
  messageId: "3EB0XXXXX_XXXXX@s.whatsapp.net"  // From system prompt cache
}
```

**Returns:**
```json
{
  "success": true,
  "messageId": "3EB0XXXXX...",
  "type": "image",
  "mimetype": "image/jpeg",
  "size": 245678,
  "base64Data": "iVBORw0KGgoAAAANS...",
  "caption": "optional caption",
  "message": "Media downloaded successfully. You can now pass this base64Data to upload_image tool."
}
```

### 2. `upload_image` (Updated)

**New Features:**
- ✅ Supports 3 input methods: current message, quoted message, base64Data
- ✅ base64Data parameter for cached media workflow

**Parameters:**
```javascript
{
  purpose: 'faceswap_source' | 'faceswap_target' | 'i2v_input',
  
  // Method 1: Current message (default)
  // (no extra params)
  
  // Method 2: Quoted message
  fromQuoted: true,
  
  // Method 3: From cache (via download_cached_media)
  base64Data: "<base64 string from download_cached_media>"
}
```

**Usage Examples:**

```javascript
// Workflow: Download from cache → Upload to CDN
const cached = download_cached_media({ messageId: "3EB0XXX..." });
const uploaded = upload_image({ 
  purpose: 'faceswap_target',
  base64Data: cached.base64Data  // Pass base64 from cache
});
```

### 3. System Prompt Context (Automatic)

AI automatically receives this in system prompt when media is cached:

```
## Recent Media Cache

You have access to recently sent images in this conversation:

  1. Message ID: 3EB0A12345_67890@s.whatsapp.net
     Type: image
     Sent: 2 minutes ago

  2. Message ID: 3EB0B98765_43210@s.whatsapp.net [from me]
     Type: image
     Sent: just now (caption: "this is target")

IMPORTANT FOR FACESWAP/I2V WORKFLOWS:
When user requests faceswap or image-to-video, you can reference these 
cached images using the download_cached_media tool with their message IDs...
```

---

## ⚙️ Configuration

### Cache Settings (in `mediaCacheManager.js`):

```javascript
const CACHE_DURATION_MS = 30 * 60 * 1000;  // 30 minutes
const MAX_CACHE_PER_CHAT = 10;              // Max 10 images per chat
```

**Auto-cleanup:** Every 5 minutes, expired entries removed automatically.

---

## 🧪 Testing Checklist

### Phase 1: Test Cache System

- [ ] Send image 1 → verify logged: `[MediaCache] Cached image from ...`
- [ ] Send image 2 → verify logged: `[MediaCache] Cached image from ...`
- [ ] Send AI command → verify system prompt includes "Recent Media Cache: 2 images"
- [ ] Check AI can see message IDs in prompt

### Phase 2: Test Download Tool

- [ ] AI calls `download_cached_media` with valid message ID
- [ ] Verify returns base64Data
- [ ] Test error: call with invalid/expired message ID

### Phase 3: Test Upload with Base64

- [ ] AI downloads cached media → gets base64
- [ ] AI calls `upload_image` with base64Data
- [ ] Verify uploads to CDN and returns URL

### Phase 4: Full Faceswap Flow

**Sequential Method:**
```
1. Send image 1 (no text)
2. Send image 2 (no text)
3. Send: "ganti wajah"
4. ✅ AI should download both from cache
5. ✅ AI should upload both to CDN
6. ✅ AI should call faceswap with both URLs
7. ✅ Result received
```

**Command-First Method:**
```
1. Send image with text: "ganti wajah"
2. AI asks for 2nd image
3. Send image 2
4. ✅ AI downloads image 1 from cache
5. ✅ AI downloads image 2 from current message
6. ✅ Faceswap completes
```

### Phase 5: Edge Cases

- [ ] User sends 3+ images → cache only keeps recent 10
- [ ] Wait 30 minutes → cache expires → AI tells user to resend
- [ ] Send non-image media → verify not cached
- [ ] Multiple chats → verify cache isolated per chat

---

## 🔧 Backend Requirements (Same as Before)

### Endpoint: `/api/whatsapp/upload`

```http
POST /api/whatsapp/upload
Authorization: Bearer +628xxx
X-API-Key: <API_KEY>
Content-Type: multipart/form-data

Body:
  file: <binary data>

Response:
{
  "success": true,
  "url": "https://cdn.adevdev.com/uploads/temp/abc123.jpg"
}
```

**Status:** ✅ Already implemented (confirmed by user)

---

## 💡 Advantages of Media Cache Approach

✅ **Flexible workflow** - User bisa kirim gambar dulu, command kemudian  
✅ **Natural UX** - Tidak ada timing pressure, user santai aja  
✅ **Multiple patterns supported** - Sequential, command-first, quote, reply  
✅ **Resilient** - Cache bertahan 30 menit, user punya waktu  
✅ **Auto-managed** - Cache auto-expire, no manual cleanup needed  
✅ **Isolated** - Setiap chat punya cache sendiri, tidak bentrok  
✅ **AI-aware** - AI tahu exactly ada berapa gambar available di cache  

---

## 📝 Code Changes Summary

**New Files:**
- `mediaCacheManager.js` - Cache manager
- `system-prompts/45-media-cache.js` - System prompt module
- `tools/downloadCachedMedia.js` - Download from cache tool

**Modified Files:**
- `commands/ai.js` - Import cache manager, auto-cache media, add to context
- `tools/uploadImage.js` - Support base64Data parameter

**Total Lines Added:** ~450 lines

---

## 🚀 Deployment Steps

1. **Stop bot** (untuk load new files)
2. **Restart bot** (mediaCacheManager auto-initializes)
3. **Test cache** - send images, verify logged
4. **Test workflow** - try faceswap dengan sequential method
5. **Monitor logs** - check for any errors

---

## 📊 Monitoring & Debugging

**Key Log Messages:**

```
[MediaCache] Cached image from 120363...@g.us: 3EB0...
[MediaCache] Cleaned up 2 expired entries
[DownloadCachedMedia] Attempting to download from message ID: 3EB0...
[DownloadCachedMedia] Downloaded 245678 bytes
[UploadImage] Using base64Data from download_cached_media...
[UploadImage] Base64 decoded: 245678 bytes
```

**Common Issues:**

| Issue | Cause | Fix |
|-------|-------|-----|
| "Message not found in cache" | Expired (>30min) or never cached | Ask user to resend image |
| "Failed to download media" | WhatsApp message deleted | Ask user to resend |
| AI doesn't see cache | System prompt module not loaded | Check `45-media-cache.js` in directory |
| Cache not working | mediaCacheManager not imported | Check `ai.js` imports |

---

## 🎯 Next Steps

1. ✅ Implementation complete
2. ⏳ Deploy and restart bot
3. ⏳ Test with real faceswap request
4. ⏳ Monitor logs for issues
5. ⏳ Adjust cache duration if needed (currently 30min)
6. ⏳ Consider MongoDB persistent cache (optional, for longer retention)

---

**Status: Ready for Testing** 🚀

