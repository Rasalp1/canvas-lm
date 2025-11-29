# Streaming Implementation Plan for Gemini File Search

## Executive Summary

Implement streaming responses for Gemini File Search API to solve the issue where responses get truncated after the model's "planning" phase. This will ensure complete responses are delivered to users, especially when the model internally triggers multiple generation steps.

## Problem Analysis

### Current Architecture
- **Client**: Chrome Extension (`popup-logic.js`) → 
- **Proxy**: Cloud Function (`queryCourseStore`) → 
- **API**: Gemini File Search API (non-streaming)

### Current Issue
- Non-streaming `generateContent` endpoint returns incomplete responses
- Model generates "I will search..." text, then the actual answer gets cut off
- Second generation step is not captured by non-streaming API
- No API parameter exists to force single-generation behavior

### Why Streaming Solves This
- Streaming API (`streamGenerateContent`) returns ALL generation chunks
- Captures both planning text and final answer
- Properly handles multi-step tool invocations
- Recommended by Google for File Search usage

---

## Implementation Strategy

### Approach: Server-Side Stream Aggregation
We'll aggregate the stream on the Cloud Function side and return the complete text to the client as a single response. This keeps the client-side code simple while ensuring complete responses.

**Alternative Considered (Not Chosen):**
- Client-side streaming: Would require Firebase Cloud Functions to support streaming responses, which adds complexity and potential reliability issues.

---

## Detailed Implementation Plan

### Phase 1: Update Cloud Function to Use Streaming

#### File: `functions/index.js`

**Changes Required:**

1. **Replace `generateContent` with `streamGenerateContent`**
   - Current endpoint: `models/${model}:generateContent`
   - New endpoint: `models/${model}:streamGenerateContent`

2. **Implement Stream Processing**
   ```javascript
   // Instead of single fetch + json parse:
   const response = await fetch(endpoint, options);
   const result = await response.json();
   
   // Use streaming with chunk aggregation:
   const response = await fetch(endpoint, options);
   const chunks = [];
   const reader = response.body.getReader();
   const decoder = new TextDecoder();
   
   while (true) {
     const { done, value } = await reader.read();
     if (done) break;
     chunks.push(decoder.decode(value, { stream: true }));
   }
   ```

3. **Parse Streaming Response Format**
   - Streaming returns newline-delimited JSON (NDJSON)
   - Each line is a separate JSON object with partial response
   - Need to parse each line and extract text parts
   - Concatenate all text parts to build complete response

4. **Handle Grounding Metadata**
   - Citations are in the final chunk
   - Extract from last complete response object
   - Pass to client along with complete text

5. **Error Handling**
   - Handle stream interruptions
   - Timeout after 180 seconds (increase from default 60s)
   - Handle malformed JSON in stream chunks
   - Log partial responses if stream fails

6. **Increase Function Timeout**
   ```javascript
   exports.queryCourseStore = onCall({
     timeoutSeconds: 180,  // 3 minutes for complex queries
     memory: '512MiB'       // Ensure enough memory for large streams
   }, async (request) => {
     // ... implementation
   });
   ```

#### Implementation Details

**Stream Parsing Logic:**
```javascript
async function parseStreamingResponse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let groundingMetadata = null;
  
  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    
    // Process all complete lines (keep last incomplete line in buffer)
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const parsed = JSON.parse(line);
        
        // Extract text from candidates
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullText += text;
        }
        
        // Extract grounding metadata (usually in last chunk)
        if (parsed.candidates?.[0]?.groundingMetadata) {
          groundingMetadata = parsed.candidates[0].groundingMetadata;
        }
      } catch (parseError) {
        logger.warn('Failed to parse streaming chunk:', parseError);
      }
    }
  }
  
  // Process any remaining buffer
  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer);
      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) fullText += text;
      if (parsed.candidates?.[0]?.groundingMetadata) {
        groundingMetadata = parsed.candidates[0].groundingMetadata;
      }
    } catch (parseError) {
      logger.warn('Failed to parse final chunk:', parseError);
    }
  }
  
  return { fullText, groundingMetadata };
}
```

**Updated queryCourseStore function:**
```javascript
exports.queryCourseStore = onCall({
  timeoutSeconds: 180,
  memory: '512MiB'
}, async (request) => {
  try {
    // ... existing validation code ...
    
    // Build request (same as before)
    const requestBody = { /* ... */ };
    
    // Use streamGenerateContent endpoint
    const response = await fetch(
      `${GEMINI_API_ENDPOINT}/models/${model}:streamGenerateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Stream request failed: ${error}`);
    }
    
    // Parse streaming response
    const { fullText, groundingMetadata } = await parseStreamingResponse(response);
    
    if (!fullText) {
      throw new Error('No response text received from stream');
    }
    
    // ... existing chat history saving code ...
    
    logger.info('Streaming query completed', { 
      model,
      courseId,
      storeName,
      userId,
      responseLength: fullText.length
    });
    
    return {
      success: true,
      answer: fullText,
      groundingMetadata: groundingMetadata,
      sessionId: sessionId,
      model: model
    };
  } catch (error) {
    logger.error('Query failed:', error);
    throw new Error(`Query failed: ${error.message}`);
  }
});
```

---

### Phase 2: Client-Side Changes (Minimal)

#### Files: `src/gemini-file-search-cloud.js`, `src/popup-logic.js`

**Changes Required:**

**No breaking changes needed!** The client already expects:
```javascript
{
  answer: string,
  groundingMetadata: object,
  model: string
}
```

The streaming happens transparently on the server side.

**Optional Enhancement - Show Streaming Indicator:**
```javascript
// In popup-logic.js, before calling queryCourseStore:
this.uiCallbacks.setIsChatLoading?.(true);
this.uiCallbacks.setChatMessages?.([
  ...this.conversationHistory,
  { role: 'user', content: question },
  { role: 'assistant', content: '⏳ Searching documents...', isLoading: true }
]);

// After receiving response:
this.uiCallbacks.setIsChatLoading?.(false);
```

---

### Phase 3: UI Enhancements (Optional)

#### File: `src/App.jsx` or relevant chat component

**Enhancement 1: Loading State During Streaming**
- Show "Searching documents..." message
- Display animated ellipsis or spinner
- Clear indicator that response is being generated

**Enhancement 2: Stream Progress Feedback**
- While we aggregate on server, we can't show real-time streaming
- But we can show estimated time based on query complexity
- Display: "This may take 10-30 seconds for complex queries"

**Enhancement 3: Timeout Warning**
- If query takes >60 seconds, show: "Still processing - complex query detected..."
- Prepares user for longer wait times

---

### Phase 4: Error Handling & Edge Cases

#### Timeout Handling
```javascript
// In Cloud Function
const STREAMING_TIMEOUT = 180000; // 3 minutes

const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('Streaming timeout after 3 minutes')), STREAMING_TIMEOUT);
});

const streamPromise = parseStreamingResponse(response);

const { fullText, groundingMetadata } = await Promise.race([
  streamPromise,
  timeoutPromise
]);
```

#### Partial Response Recovery
```javascript
// If stream fails mid-way, return what we have so far
try {
  const { fullText, groundingMetadata } = await parseStreamingResponse(response);
  return { success: true, answer: fullText, groundingMetadata };
} catch (streamError) {
  if (partialText.length > 0) {
    logger.warn('Stream failed but returning partial response:', streamError);
    return { 
      success: true, 
      answer: partialText + '\n\n[Response incomplete - please try again]',
      groundingMetadata: null 
    };
  }
  throw streamError;
}
```

#### Rate Limiting Considerations
- Streaming may take longer (30-90 seconds vs 5-10 seconds)
- Current rate limit: 50 queries/minute
- Monitor if users hit rate limits more frequently
- Consider adjusting to 30-40 queries/minute if needed

---

### Phase 5: Testing & Validation

#### Test Cases

1. **Simple Query (Baseline)**
   - Question: "What is the exam date?"
   - Expected: Quick response, no planning text
   - Verify: Complete answer received

2. **Complex Query (Primary Test)**
   - Question: "Find the last problem in instuderingsfrågor.pdf"
   - Expected: Model searches specific document, may show planning text
   - Verify: Complete answer including the actual problem, not just "I will search..."

3. **Long Response**
   - Question: "Summarize all lecture notes"
   - Expected: Multi-paragraph response
   - Verify: No truncation, complete summary

4. **Multi-Document Query**
   - Question: "Compare concepts from lecture1.pdf and lecture2.pdf"
   - Expected: Cross-document synthesis
   - Verify: Both documents referenced with complete analysis

5. **Error Conditions**
   - Timeout: Very complex query that takes >3 minutes
   - Network interruption: Simulate connection loss mid-stream
   - Malformed response: Invalid JSON in stream

6. **Performance Benchmarks**
   - Measure p50, p90, p99 response times
   - Compare to non-streaming (should be similar or slightly longer)
   - Monitor Cloud Function execution time and costs

#### Validation Metrics

- **Completeness**: No truncated responses (0% truncation rate)
- **Latency**: Response time <30s for 90% of queries
- **Reliability**: Success rate >99%
- **Cost**: <10% increase in Cloud Function costs

---

## Rollout Strategy

### Stage 1: Development & Local Testing
- Implement streaming in Cloud Function
- Test with Firebase emulators locally
- Verify with various query types

### Stage 2: Staging Deployment
- Deploy to staging Firebase project
- Test with real Gemini API
- Run all test cases from Phase 5
- Monitor for 2-3 days

### Stage 3: Production Deployment
- Deploy to production during low-usage hours
- Monitor error rates and response times closely
- Have rollback plan ready (revert to non-streaming)
- Gradual rollout: 10% → 50% → 100% of users

### Stage 4: Monitoring & Optimization
- Track metrics for 1 week
- Gather user feedback on response completeness
- Optimize timeout values based on actual usage
- Consider prompt engineering to reduce planning text

---

## Risk Assessment & Mitigation

### Risk 1: Increased Latency
**Impact**: Medium  
**Probability**: Low  
**Mitigation**: 
- Streaming should have similar latency to non-streaming
- If slower, optimize parsing logic
- Consider caching for common queries

### Risk 2: Stream Parsing Errors
**Impact**: High  
**Probability**: Low  
**Mitigation**:
- Robust error handling with try-catch around each line parse
- Return partial responses when possible
- Log all parsing errors for debugging

### Risk 3: Increased Cloud Function Costs
**Impact**: Low  
**Probability**: Medium  
**Mitigation**:
- Increased timeout means longer billable time
- Monitor costs closely during rollout
- Optimize by reducing unnecessary processing
- Estimated cost increase: 5-10%

### Risk 4: Firebase Function Timeout Limits
**Impact**: Medium  
**Probability**: Very Low  
**Mitigation**:
- Max timeout for Cloud Functions: 540 seconds (9 minutes)
- We're using 180 seconds (3 minutes) - well within limits
- Complex queries rarely exceed 90 seconds

---

## Success Criteria

1. ✅ **Zero truncated responses** in production
2. ✅ **<30 second p90 response time** for typical queries
3. ✅ **>99% success rate** (no increase in error rate)
4. ✅ **<10% cost increase** compared to non-streaming
5. ✅ **User feedback**: No complaints about incomplete answers
6. ✅ **Complete responses** for "search document X" type queries

---

## Code Changes Summary

### Files to Modify
1. ✏️ `functions/index.js` - Main streaming implementation (~150 lines changed)
2. ✏️ `functions/package.json` - Update timeout config (if using onCall options)
3. 📝 `src/popup-logic.js` - Add loading indicator (optional, ~10 lines)
4. 📝 `src/App.jsx` - Enhanced UI feedback (optional, ~20 lines)

### Files to Review (No Changes)
- ✅ `src/gemini-file-search-cloud.js` - Already compatible
- ✅ `src/firestore-helpers.js` - No changes needed
- ✅ Client-side components - Work as-is

### New Files to Create
- 📄 `functions/stream-parser.js` - Streaming utilities (optional, for modularity)
- 📄 `documentation/STREAMING_IMPLEMENTATION_PLAN.md` - This document

---

## Timeline Estimate

- **Phase 1** (Cloud Function): 4-6 hours
  - Implementation: 3 hours
  - Unit testing: 1-2 hours
  - Local emulator testing: 1 hour

- **Phase 2** (Client minimal changes): 1 hour
  - Loading state updates
  - Testing client integration

- **Phase 3** (UI enhancements): 2-3 hours (optional)
  - Better loading indicators
  - Progress feedback
  - Testing

- **Phase 4** (Error handling): 2-3 hours
  - Timeout logic
  - Partial response handling
  - Edge case testing

- **Phase 5** (Testing & validation): 4-6 hours
  - Comprehensive test suite
  - Performance benchmarking
  - User acceptance testing

- **Total Estimated Time**: 13-19 hours (1.5-2.5 days)

---

## Post-Implementation Monitoring

### Metrics to Track (First 2 Weeks)

1. **Response Completeness**
   - Log response length distribution
   - Flag responses <50 characters as potentially incomplete
   - Manual review of flagged responses

2. **Performance**
   - Cloud Function execution time (avg, p50, p90, p99)
   - Client-perceived latency
   - Memory usage

3. **Reliability**
   - Error rate (target: <1%)
   - Timeout frequency (target: <0.1%)
   - Stream parsing failures (target: 0%)

4. **Cost**
   - Cloud Function invocations
   - Execution time (billable seconds)
   - Gemini API costs (unchanged)
   - Compare to pre-streaming baseline

5. **User Experience**
   - Support tickets mentioning incomplete responses (target: 0)
   - User retention/engagement with chat feature
   - Average questions per session

---

## Maintenance & Future Improvements

### Ongoing Maintenance
- Monitor streaming response times monthly
- Review error logs for parsing issues
- Update timeout values based on usage patterns
- Keep node-fetch updated for security patches

### Future Enhancements
1. **Client-side streaming** (if Firebase adds support)
   - Real-time token-by-token display
   - Cancel button for long-running queries

2. **Response caching**
   - Cache common queries to reduce latency
   - Invalidate cache on course material updates

3. **Smart timeout adjustment**
   - Dynamically adjust timeout based on query complexity
   - Shorter timeout for simple queries, longer for complex

4. **Streaming analytics**
   - Track which types of queries trigger multi-step generation
   - Optimize prompts to reduce unnecessary planning text

---

## Appendix A: Alternative Approaches Considered

### Alternative 1: Client-Side Streaming
**Pros:**
- Real-time display of response as it generates
- Better UX with visible progress

**Cons:**
- Firebase Cloud Functions don't support streaming responses easily
- Requires significant architecture changes
- More complex error handling on client
- Network interruptions harder to manage

**Decision**: Rejected for initial implementation. Consider for future enhancement.

### Alternative 2: Multiple Non-Streaming Calls
**Pros:**
- No streaming implementation needed
- Uses existing code

**Cons:**
- Doesn't solve the root problem
- Wastes API calls and time
- Still might miss content
- Poor user experience with delays

**Decision**: Rejected. Not a reliable solution.

### Alternative 3: Prompt Engineering Only
**Pros:**
- Minimal code changes
- Quick to implement

**Cons:**
- Doesn't fully solve the problem
- Model may still generate planning text
- Not reliable for all query types

**Decision**: Rejected as sole solution. Will use as supplementary optimization.

---

## Appendix B: Gemini Streaming Response Format

### Example Streaming Response (NDJSON)

```json
{"candidates":[{"content":{"parts":[{"text":"Based on"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":450,"totalTokenCount":452}}

{"candidates":[{"content":{"parts":[{"text":" the course material, the exam"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":450,"totalTokenCount":458}}

{"candidates":[{"content":{"parts":[{"text":" date is December 15, 2025."}],"role":"model"}}],"usageMetadata":{"promptTokenCount":450,"totalTokenCount":464}}

{"candidates":[{"content":{"parts":[{"text":""}],"role":"model"},"finishReason":"STOP","groundingMetadata":{"searchEntryPoint":{"renderedContent":"<html>...</html>"},"groundingChunks":[{"web":{"uri":"files/abc123","title":"Exam Schedule"}}]}}],"usageMetadata":{"promptTokenCount":450,"candidatesTokenCount":14,"totalTokenCount":464}}
```

### Key Points:
- Each line is a separate JSON object
- Text comes in incremental chunks
- Final chunk contains `groundingMetadata` with citations
- `finishReason: "STOP"` indicates completion
- Need to concatenate all `text` parts for complete response

---

## Appendix C: Cost Analysis

### Current Cost (Non-Streaming)
- Average query: 5-10 seconds execution time
- Cloud Function cost: ~$0.0000025 per second
- Estimated: $0.000025 per query
- 1000 queries/month: $0.025

### Projected Cost (Streaming)
- Average query: 8-15 seconds execution time (estimated)
- Cloud Function cost: ~$0.0000025 per second
- Estimated: $0.000038 per query
- 1000 queries/month: $0.038

### Cost Increase
- Absolute: $0.013 per 1000 queries
- Relative: ~50% increase in Cloud Function costs
- **Note**: Cloud Function costs are minimal compared to Gemini API costs
- Total impact: <1% increase in overall costs

### Optimization Opportunities
- Cache frequent queries (could reduce costs by 30-50%)
- Optimize prompt to reduce planning text (faster responses)
- Consider batching for admin operations

---

**End of Implementation Plan**
