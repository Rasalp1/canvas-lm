
User experience:
1. They open Canvas
2. Click your extension
3. The extension scans the page (or uses API token)
4. PDFs are detected → backend → stored in Gemini File Search
5. User chats with the course material in a nice UI
6. Data never leaves the user unless they authorize it

🏗️ Summary: What You Need to Build
Component	Purpose
Content script:	Extract links from Canvas pages (using user API) by querying "GET /api/v1/courses/{course_id}/pages" and extracting the course_id from the current url.
Backend: Use a backend provider like supabase and use their edge functions to upload files to Gemini File Search Tool
Google:	Store files using Gemini File Search Tool
Extension UI:	Let user ask questions, show results
Google Gemini RAG:	Enterprise-grade retrieval

Implementation Inspiration:

Step 1 — Supabase Auth

User signs in using Google or email magic link
↓
Supabase gives your extension:

access_token

user.id

Step 2 — Supabase Database Structure

Recommend this schema:

users table (extends auth.users)
column	type
user_id	uuid (PK, linked to auth.users)
file_search_store_id	text
created_at	timestamp
documents table
column	type
id	uuid
user_id	uuid
course_id	text
file_name	text
gemini_file_id	text
uploaded_at	timestamp
Step 3 — Supabase Functions (your Gemini backend)

You will create serverless endpoints like:

/upload-pdf

receives binary PDF from extension

uses Gemini File Search API to upload & index it

stores metadata in Supabase database

/chat

receives question from extension

looks up user’s file_search_store_id

calls generate_content with File Search

returns answer to extension

-------------

Solution: Use Google Gemini’s Signed Upload URLs (The Proper Way)

This is how you fix it — and it’s surprisingly clean:

1. Your Supabase Edge Function does NOT receive the whole PDF.

Instead, it does this:

Calls Gemini File Search API to create an upload session

Gemini returns a signed upload URL

Supabase returns this URL to the extension

Architecture with Signed URLs (Best Practice)
Chrom Extension → Supabase Function → Gemini create upload session
Chrom Extension ← receives signed upload URL
Chrom Extension → uploads PDF directly to Gemini
Gemini → stores PDF + indexes it
Supabase Function → stores store_id & file metadata
User can now query via File Search


This avoids every size limitation.

🎯 Why This Is the Best Method

Works for ANY file size (up to Gemini’s 100 MB per-file limit)

Zero strain on Supabase functions

No risk of timeouts

Fully secure

Industry standard practice (Firebase, AWS, GCP all use signed URLs)

🧪 Example Flow (In Simple Terms)
(A) Supabase Function: createUploadSession
// pseudo-code
const session = await gemini.files.uploadSession({
   mime_type: "application/pdf",
   display_name: fileName,
   file_search_store: userStoreId
});

return {
  uploadUrl: session.upload_url,
  fileId: session.file_id
};

(B) Chrome Extension: Upload Directly
await fetch(uploadUrl, {
  method: "PUT",
  headers: {
    "Content-Type": "application/pdf"
  },
  body: pdfBlob
});

(C) Supabase Function: finalize file
await gemini.files.finalizeUpload(fileId);

DONE — the PDF is now indexed in Google Gemini File Search.
🧩 What This Means For You

You CAN use Supabase Functions
→ and still handle large PDFs
→ without bandwidth limits
→ without redesigning your backend

Just use signed upload URLs.