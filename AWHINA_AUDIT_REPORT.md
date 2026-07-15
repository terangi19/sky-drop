# Āwhina AI System Audit Report

**Date:** July 16, 2026
**Phase:** Phase 1 - Audit
**Objective:** Complete examination of existing AI system before major refactoring

---

## Executive Summary

The Āwhina AI system is a complex voice and text assistant with multiple pipelines, but it relies heavily on prompt engineering and free-form text rather than structured tools. The current architecture works but has significant complexity, duplication, and performance bottlenecks that make it difficult to maintain and extend.

**Key Findings:**
- Two-pipeline architecture (local + AI) but with significant overlap
- Heavy reliance on regex-based intent detection
- No structured tool calling system
- Conversation memory exists but is simple (no context tracking)
- Voice and text flows are largely separate
- Prompt-based AI responses (not structured outputs)
- Performance bottlenecks in speech recognition and AI calls

---

## 1. Voice Pipeline

### Components:

**useAwhinaVoice.ts (1,492 lines)**
- Main voice hook with complex state management (14 state variables, 18 refs)
- Phases: idle, listening, processing, speaking, paused, error, confirming
- Manages speech recognition, command resolution, action execution
- Handles confirmation flow for medium-confidence commands
- Inactivity timer (45s) and busy recovery (15s)
- Mic restart logic with multiple fallback attempts
- Direct API calls to `/api/sky-ai` for AI processing

**Speech Recognition:**
- Browser Web Speech API (on-device preferred, cloud fallback)
- Server-side Whisper transcription as fallback
- Brave browser detection and special handling
- Voice Activity Detection (VAD) for silence detection
- Dynamic silence window for listing descriptions

**Command Resolution:**
- Two-pipeline: local command engine → AI conversation engine
- Local engine handles navigation, search, page actions instantly
- AI engine used for conversational queries
- Phonetic correction for mispronounced commands

### Issues:
- **Complex state management:** 14 state variables and 18 refs in a single hook
- **Mic instability:** Multiple restart attempts needed (up to 3 retries)
- **No structured outputs:** AI returns free-form text requiring regex parsing
- **Performance:** Every non-local command hits OpenAI API (8s timeout)
- **Duplicated logic:** Voice and text paths have separate command resolution

---

## 2. Command Parser

### Components:

**awhina-voice-command.ts (341 lines)**
- Two-pipeline architecture (local + AI)
- Local pipeline: exact match → phonetic match → route registry → search intent → sell intent
- AI pipeline: conversational intent detection (regex-based)
- Confidence levels: high, medium, low
- Debug logging for analytics

**local-command-engine.ts (1,265 lines)**
- Context actions (go back, scroll, refresh, close)
- Voice toggle (stop, resume)
- Page actions (open listing, message seller, refine search)
- Navigation shortcuts (exact aliases for sell, sales, home)
- Route registry matching with prefix stripping
- Phonetic correction for mispronounced routes
- Search intent parsing with filters (price, location, category)
- Profile navigation with username extraction
- Tab switching on profile page
- Fast nav check using compact-form Set lookup

**awhina-voice-form-command.ts (205 lines)**
- Form-specific commands on `/post/ai` page
- Actions: apply_fill, append_description, publish, cancel
- Field updates: title, price, condition, location, pickup/shipping
- Confirmation flow for publish action

### Issues:
- **Regex-heavy:** Intent detection relies on complex regex patterns
- **Duplicated regex:** Similar patterns across multiple files
- **No structured parsing:** Field extraction is regex-based, fragile
- **Hard-coded aliases:** Navigation shortcuts are manually maintained
- **No entity extraction:** Prices, locations, etc. extracted via regex
- **Confidence scoring:** Manual heuristics, not data-driven

---

## 3. Prompt Generation

### Components:

**sky-ai-prompt.ts (380 lines)**
- System prompt builder with context injection
- Site map from GUIDE_DESTINATIONS
- Listing context integration (draft JSON)
- Intent hint injection per message
- Image handling prompts
- State awareness (just generated listing)
- Listing intent detection rules
- Voice/style guidelines for descriptions

**Prompts:**
- LISTING DESCRIPTION VOICE (NZ seller persona)
- AWHINA_DRAFT_UPDATE_MODE
- AWHINA_TASK_COMPLETION_RULES
- AWHINA_PRICING_RESPONSE_FORMAT
- SKY_AI_PROJECT_KNOWLEDGE

### Issues:
- **Prompt engineering:** Heavy reliance on prompt instructions
- **No structured outputs:** AI must follow text instructions (e.g., "Output [[LISTING_FILL]]")
- **Regex extraction:** Machine tags like `[[NAV:/path]]` require regex parsing
- **Prompt bloat:** System prompt can be very large with full draft JSON
- **No tool definitions:** AI doesn't know available tools, must infer from text
- **Context injection:** Full draft JSON injected into every message on sell page

---

## 4. AI Providers

### Components:

**/api/sky-ai/route.ts (624 lines)**
- OpenAI API integration (gpt-4o-mini default)
- Rate limiting (500 for authenticated, 100 for anonymous)
- Navigation shortcuts (rule-based before AI)
- Task replies (rule-based completions)
- Streaming and non-streaming modes
- Image support (vision model for listing photos)
- Conversation history loading (last 30 messages)
- Listing context parsing and merging
- Quality logging

**AI Flow:**
1. Rate limit check
2. Load conversation history from Firestore
3. Check navigation shortcuts (rule-based)
4. Check task replies (rule-based)
5. If no rule match, call OpenAI
6. Parse response for [[NAV:]], [[LISTING_FILL]], etc.
7. Merge listing fill with draft context
8. Save to Firestore

### Issues:
- **No tool calling:** AI uses free-form text, not function calling
- **Regex parsing:** Response parsing relies on regex for machine tags
- **Single provider:** Only OpenAI, no fallback
- **No request routing:** All requests go to same model
- **No caching:** Same prompts sent repeatedly
- **Error handling:** Basic OpenAI error mapping

---

## 5. Conversation Memory

### Components:

**sky-ai-firestore.ts (132 lines)**
- Firestore-based conversation storage
- Collection: `skyAiConversations`
- Subcollection: `messages`
- Fields: uid, email, title, createdAt, updatedAt, messageCount, lastPreview
- Message fields: role, content, navigateTo, createdAt
- Operations: create, list, load messages, append exchange, delete

### Issues:
- **No context tracking:** No memory of previous intents or entities
- **No summarization:** Full message history sent to AI (last 30 messages)
- **No entity memory:** Can't remember "BMW" from previous turn
- **No conversation state:** Doesn't track what user is working on
- **No pruning:** Old conversations not archived or summarized
- **No context window management:** Could exceed token limits

---

## 6. Navigation Logic

### Components:

**Local Command Engine:**
- Exact navigation shortcuts (sell, sales, home)
- Route registry with aliases and phonetic aliases
- Prefix stripping ("take me to", "go to", "open")
- Phonetic correction for mispronounced routes
- Admin access control
- Same-page detection

**AI Navigation:**
- GUIDE_DESTINATIONS array with title, path, blurb
- Navigation shortcuts in API route
- Intent-based routing (find_buy → search, sell_list → sell page)
- Regex pattern matching for navigation intent

### Issues:
- **Duplicated logic:** Navigation logic exists in local engine and AI shortcuts
- **No unified routing:** Two separate systems for navigation
- **Hard-coded destinations:** Route registry manually maintained
- **No dynamic routing:** Can't adapt to new routes without code changes
- **No context awareness:** Doesn't consider current page for smart routing

---

## 7. Search Logic

### Components:

**voice-search-pipeline.ts** (referenced but not examined)
- Search intent detection
- Query extraction
- Filter parsing (price, location, category)
- URL parameter construction

**Local Command Engine:**
- Search intent regex (find, show me, looking for, etc.)
- Price parsing (under $X, over $Y)
- Location parsing (in Auckland, etc.)
- Category hints
- Query normalization

### Issues:
- **Regex-based:** Query parsing relies on regex patterns
- **No structured extraction:** Filters extracted via regex
- **No query refinement:** Can't say "under $10k" after "show BMWs"
- **No search history:** Doesn't remember previous searches
- **No faceted search:** Limited to basic filters

---

## 8. Sell-by-Voice Flow

### Components:

**Listing Intent Detection:**
- Regex patterns for selling intent
- Structured listing detection (year/make, key-value pairs)
- Price/dollar sign detection
- Vehicle brand detection
- Item signal detection

**Listing Fill:**
- AI generates LISTING_FILL JSON block
- Parsed via regex from AI response
- Merged with draft context
- Dispatched to form via Redux-like pattern

**Voice Form Commands:**
- Field-specific updates (title, price, condition, location)
- Delivery options (pickup, shipping, both)
- Description appending
- Publish with confirmation

### Issues:
- **No structured generation:** AI must follow text instructions for JSON format
- **Regex parsing:** LISTING_FILL extracted via regex
- **No validation:** No schema validation on parsed JSON
- **No incremental updates:** Full regeneration on every change
- **No field tracking:** Doesn't know which fields were updated

---

## 9. Edit-by-Voice Flow

### Components:

**awhina-voice-form-command.ts**
- "Change title to X" pattern
- "Set price to $Y" pattern
- "Update condition to Z" pattern
- "Add [description]" pattern
- Publish confirmation flow

### Issues:
- **Pattern-specific:** Each field has its own regex pattern
- **No general parsing:** Can't handle "make it red" for color
- **No AI integration:** All local, no AI for complex edits
- **No undo:** No way to revert changes
- **No context:** Doesn't know current field values

---

## 10. Message Handling

### Components:

**Chat Interface:**
- SkyAiChatPanel component
- Streaming responses
- Message history display
- Navigation actions from AI
- Listing fill application

**Voice Responses:**
- Reply actions (text-to-speech display)
- Visual feedback (heard text, action text)
- Confirmation prompts
- Error handling

### Issues:
- **No structured messages:** All free-form text
- **No action buttons:** AI can't suggest clickable actions
- **No rich responses:** Only text and navigation
- **No message types:** No distinction between info, action, error messages

---

## 11. Duplicated Logic

### Major Duplications:

1. **Intent Detection:**
   - awhina-voice-command.ts (voice)
   - sky-ai-intent.ts (text)
   - Similar regex patterns for sell, find, price intents

2. **Navigation Logic:**
   - local-command-engine.ts (voice)
   - /api/sky-ai/route.ts shortcuts (AI)
   - GUIDE_DESTINATIONS (both)

3. **Search Logic:**
   - voice-search-pipeline.ts (voice)
   - AI search responses (text)
   - Similar filter parsing logic

4. **Listing Context:**
   - Multiple files parse listing context
   - Different normalization approaches

5. **Error Handling:**
   - OpenAI error mapping
   - Speech recognition error mapping
   - No unified error types

---

## 12. Performance Bottlenecks

### Identified Bottlenecks:

1. **Speech Recognition:**
   - Browser STT can be slow or blocked (Brave)
   - Fallback to server transcription adds latency
   - Mic restart attempts add delay

2. **AI Calls:**
   - Every non-local command hits OpenAI
   - No caching of repeated requests
   - Full context sent every time (draft JSON, history)
   - 8s timeout indicates slow responses

3. **Command Resolution:**
   - Multiple regex checks in sequence
   - Phonetic correction adds overhead
   - Route registry lookup for every command

4. **Conversation Loading:**
   - Firestore read for every message
   - No caching of conversation history
   - Full history sent to AI (last 30 messages)

5. **Prompt Construction:**
   - System prompt rebuilt every message
   - Full draft JSON injected
   - Large prompts increase latency and cost

---

## 13. Architectural Weaknesses

### Critical Weaknesses:

1. **No Tool Calling:**
   - AI uses free-form text, not structured tools
   - No function calling API
   - AI must infer actions from text instructions
   - High risk of misinterpretation

2. **No Intent Router:**
   - Intent detection is regex-based, not AI-driven
   - No confidence scoring from AI
   - No clarification questions for low confidence

3. **No Entity Extraction:**
   - All entity extraction is regex-based
   - No AI-powered entity recognition
   - Fragile to language variations

4. **No Conversation Memory:**
   - No tracking of entities across turns
   - No context summarization
   - No conversation state machine

5. **No Structured Outputs:**
   - AI responses require regex parsing
   - No JSON mode or structured outputs
   - Machine tags are fragile

6. **No Local Execution Layer:**
   - Common commands still hit AI
   - No caching of frequent requests
   - No deterministic routing

7. **Tight Coupling:**
   - Voice and text flows are separate
   - No shared abstractions
   - Duplicated logic across pipelines

8. **No Observability:**
   - Limited logging (debug logs only)
   - No performance metrics
   - No error tracking
   - No analytics on intent distribution

---

## 14. File Inventory

### Core Voice Files:
- useAwhinaVoice.ts (1,492 lines) - Main voice hook
- awhina-voice-command.ts (341 lines) - Voice command resolver
- local-command-engine.ts (1,265 lines) - Local command execution
- awhina-voice-form-command.ts (205 lines) - Form editing commands
- awhina-voice-end-of-speech.ts - Speech completion detection
- awhina-voice-page-actions.ts - Page-specific voice actions
- speech-recognition.ts (608 lines) - STT helpers
- voice-phonetic.ts - Phonetic correction
- voice-search-pipeline.ts - Search intent parsing
- command-registry.ts - Route aliases
- command-logger.ts - Analytics logging

### Core AI Files:
- /api/sky-ai/route.ts (624 lines) - Main AI API
- sky-ai-prompt.ts (380 lines) - Prompt generation
- sky-ai-intent.ts (229 lines) - Intent detection
- sky-ai-types.ts (48 lines) - Type definitions
- sky-ai-firestore.ts (132 lines) - Conversation memory
- sky-ai-listing-fill.ts - Listing fill parsing
- sky-ai-draft-merge.ts - Draft context merging
- sky-ai-form-actions.ts - Form enhancement
- sky-ai-task-replies.ts - Rule-based completions
- sky-ai-knowledge.ts - Project knowledge
- sky-ai-prompts.ts - Prompt templates
- guide-assistant.ts - Navigation destinations

### UI Components:
- AwhinaGlobalAssistant.tsx (197 lines) - Global assistant wrapper
- AwhinaVoiceBar.tsx - Voice controls
- AwhinaVoiceStatusCard.tsx - Status display
- FloatingActionDock.tsx (324 lines) - FAB container
- SkyAiChatPanel.tsx - Chat interface
- SkyAiChat.tsx - Chat entry point

**Total Lines of Code:** ~6,000+ lines across ~30 files

---

## 15. Recommendations for Refactoring

### Phase 2 - Intent Router:
- Create unified intent router using AI (not regex)
- Return structured intent with confidence score
- Support clarification questions for low confidence
- Unify voice and text intent detection

### Phase 3 - Tool Calling:
- Implement OpenAI function calling API
- Define tool schema for all actions
- AI returns tool calls, not free-form text
- Application executes tools (AI never manipulates UI)

### Phase 4 - Structured Outputs:
- Use JSON mode for all AI responses
- Define response schemas
- Eliminate regex parsing
- Add schema validation

### Phase 5 - Conversation Memory:
- Implement entity memory across turns
- Track conversation state
- Summarize old messages
- Context window management

### Phase 6 - Local Execution:
- Cache common commands
- Deterministic routing for simple queries
- Reduce AI calls by 50%+
- Pre-warm speech recognition

### Phase 7 - Confidence:
- AI provides confidence scores
- Single clarification questions
- Never guess on low confidence

### Phase 8 - Logging:
- Structured logging for every request
- Performance metrics
- Error tracking
- Intent analytics

### Phase 9 - Performance:
- Implement request caching
- Reduce prompt size
- Batch Firestore operations
- Optimize speech recognition

### Phase 10 - Testing:
- Unit tests for intent router
- Integration tests for tool calling
- E2E tests for voice flows
- Performance benchmarks

---

## Conclusion

The current Āwhina system is functional but heavily reliant on prompt engineering and regex-based parsing. The two-pipeline architecture (local + AI) is a good foundation, but the lack of structured tool calling, unified intent routing, and conversation memory makes it difficult to maintain and extend.

The refactoring to a GPT-Style architecture with tool calling, structured outputs, and proper conversation memory will significantly improve reliability, performance, and extensibility while making the codebase easier to maintain.

**Next Step:** Proceed to Phase 2 - Intent Router implementation
