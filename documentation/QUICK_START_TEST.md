# Quick Start Guide: Testing File Search Migration

## Prerequisites
✅ Extension built successfully (`npm run build`)  
✅ Gemini API key ready ([Get one here](https://aistudio.google.com/app/apikey))  
✅ Access to a Canvas course with PDFs  

## Step 1: Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist` folder from your project
5. Extension should appear with green checkmark

## Step 2: Configure API Key

1. Click the Canvas RAG Assistant icon in Chrome toolbar
2. Click "Options" or right-click → "Options"
3. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
4. Create API key (if you don't have one)
5. Copy the API key
6. Paste into settings page
7. Click "Save API Key"
8. You should see "✅ API key saved successfully!"

## Step 3: Sign In to Chrome

1. Click your Chrome profile icon (top right)
2. Sign in with your Google account
3. This enables Firestore database access
4. Reload the extension popup

## Step 4: Navigate to Canvas Course

1. Go to a Canvas course page (e.g., `canvas.education.lu.se/courses/12345`)
2. Open the extension popup
3. You should see "✅ Canvas course detected!"
4. Course information will be displayed

## Step 5: Scan Course & Upload to File Search

1. Click "🚀 Scan Course & Build Knowledge Base"
2. Smart Navigator will:
   - Expand all modules
   - Visit pages, assignments, files
   - Find all PDFs in the course
3. Watch the progress:
   - "📦 Creating File Search store..." (one-time per course)
   - "📤 Uploading 1/X: filename.pdf..." (for each PDF)
   - Processing takes ~5-10 seconds per PDF
4. When complete, you'll see:
   - "✅ Course setup complete: X PDFs uploaded to File Search"
   - "💬 Chat interface now available below!"

## Step 6: Chat with Course Materials

1. Chat interface should appear automatically after upload
2. Type a question in the text box, e.g.:
   - "What topics are covered in this course?"
   - "Explain the main concepts from chapter 1"
   - "What are the key formulas I need to know?"
3. Press Enter or click "Send"
4. Wait 2-5 seconds for response
5. AI will respond with:
   - Answer based on your course PDFs
   - Citations showing which documents were used

## What to Expect

### First Time Setup (per course)
- ⏱️ **Time**: 5-10 seconds per PDF
- 💰 **Cost**: ~$0.15 per 1M tokens (one-time)
- 📦 **Storage**: Permanent (no expiration!)

### Chat Queries
- ⏱️ **Speed**: 2-5 seconds per question
- 💰 **Cost**: ~$0.075 per 1M tokens (only relevant chunks)
- 🔍 **Search**: Semantic search across all course PDFs

## Example Test Workflow

```
1. Navigate to: https://canvas.education.lu.se/courses/12345
2. Click extension icon
3. Verify: "✅ Canvas course detected!"
4. Click: "🚀 Scan Course & Build Knowledge Base"
5. Wait for scan: ~30 seconds for 5 PDFs
6. Verify: Chat interface appears
7. Type: "Summarize the main topics in this course"
8. Press: Enter
9. Wait: 3 seconds
10. Verify: Answer with citations appears
```

## Troubleshooting

### Extension not loading
- Check: Is `dist` folder selected (not root folder)?
- Check: Did webpack build succeed?
- Check: Any errors in `chrome://extensions/`?

### API key errors
- Check: Did you copy the full key (starts with "AIza...")?
- Check: Is the key saved in settings?
- Check: Is the key valid (test at [AI Studio](https://aistudio.google.com/))

### Upload failing
- Check: Are PDFs accessible (not behind authentication)?
- Check: Is API quota available?
- Check: Network connection stable?

### Chat not working
- Check: Did File Search store creation succeed?
- Check: Are PDFs marked as "completed" in Firestore?
- Check: Using gemini-2.5-flash or gemini-2.5-pro model?

### No PDFs found
- Check: Does course have actual PDF files?
- Check: Are PDFs in Canvas Files section?
- Check: Are PDFs linked in modules/assignments?

## Monitoring

### Chrome DevTools
1. Right-click extension popup → "Inspect"
2. Check Console for logs:
   - "✅ File Search Manager initialized"
   - "✅ File Search store created: ..."
   - "✅ [1/X] Uploaded: filename.pdf"

### Firestore Console
1. Go to Firebase Console
2. Navigate to Firestore Database
3. Check collections:
   - `courses/{courseId}` - should have `fileSearchStoreName`
   - `courses/{courseId}/documents/{docId}` - should have `fileSearchDocumentName`

### Google AI Studio
1. Go to [AI Studio](https://aistudio.google.com/)
2. Check API usage
3. Monitor costs

## Success Indicators

✅ **Store Created**: Console shows "✅ File Search store created: fileSearchStores/..."  
✅ **PDFs Uploaded**: Console shows "✅ [X/X] Uploaded: ..." for each PDF  
✅ **Chat Available**: Chat interface visible below results  
✅ **Queries Working**: AI responds with answers + citations  
✅ **Firestore Updated**: Course has `fileSearchStoreName`, documents have `fileSearchDocumentName`  

## Performance Benchmarks

| Metric | Expected Value |
|--------|----------------|
| **Store creation** | 2-3 seconds |
| **PDF upload** | 5-10 seconds each |
| **Chat query** | 2-5 seconds |
| **First upload** | ~1 minute for 10 PDFs |

## Next Steps After Testing

1. ✅ Verify all PDFs uploaded successfully
2. ✅ Test multiple queries in chat
3. ✅ Check conversation history works (follow-up questions)
4. ✅ Verify citations are accurate
5. ✅ Test with different courses
6. ✅ Monitor API costs in AI Studio

## Common Questions

**Q: Do I need to re-scan every 48 hours?**  
A: No! File Search storage is permanent. Upload once, use forever.

**Q: Can I use the old gemini-rag.js?**  
A: It's still there but not recommended. File Search is 98% cheaper and 5-10x faster.

**Q: What happens to old File API uploads?**  
A: They'll expire after 48 hours. Re-scan courses to migrate to File Search.

**Q: Can I delete a course's File Search store?**  
A: Yes, but you'd need to implement a delete function. Currently, stores persist forever.

**Q: How much will this cost?**  
A: For a typical student with 10 courses × 10 PDFs × 100 queries:
- Upload: ~$1.50 (one-time)
- Queries: ~$0.75
- Total: **~$2.25** vs $600 with old File API!

## Support

- 📚 [Migration Guide](./documentation/FILE_SEARCH_MIGRATION_GUIDE.md)
- 📊 [File API vs File Search Comparison](./documentation/FILE_API_VS_FILE_SEARCH.md)
- 🔧 [Migration Complete Summary](./MIGRATION_COMPLETE.md)

Happy testing! 🚀
