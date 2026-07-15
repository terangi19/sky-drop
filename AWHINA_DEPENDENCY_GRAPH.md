# Āwhina Production Entry Points - Dependency Graph

## Entry Point 1: Voice Commands
**File:** `app/hooks/useAwhinaVoice.ts`
**Entry:** Voice transcription → `runVoiceCommandNow()`
**Current Flow:**
```
User speaks
↓
Speech Recognition (speech-recognition.ts)
↓
runVoiceCommandNow(trimmed: string)
↓
[LOCAL CHECK] isExactNavShortcut, isSellNavigationPhrase (local-command-engine.ts)
↓
[FORM CHECK] resolveVoiceFormCommand (awhina-voice-form-command.ts) → runFormAction
↓
[VOICE CHECK] resolveVoiceCommand (awhina-voice-command.ts) → runAction
↓
Navigation / Search / Listing / Chat actions
```

**Functions Called:**
- `resolveVoiceCommand()` from `awhina-voice-command.ts`
- `resolveVoiceFormCommand()` from `awhina-voice-form-command.ts`
- `isExactNavShortcut()` from `local-command-engine.ts`
- `runAction()` - executes VoiceCommandAction
- `runFormAction()` - executes VoiceFormCommand

---

## Entry Point 2: Typed Assistant (Sky AI Chat)
**File:** `app/api/sky-ai/route.ts`
**Entry:** POST `/api/sky-ai`
**Current Flow:**
```
User types message
↓
POST /api/sky-ai
↓
checkRateLimit()
↓
parseListingContext()
↓
loadSkyAiMessages() [conversation history]
↓
[INTENT CHECK] hasListingSellIntent (sky-ai-intent.ts)
↓
[TASK CHECK] trySkyAiTaskReply (sky-ai-task-replies.ts)
↓
[NAVIGATION CHECK] NAVIGATE_PATTERNS regex
↓
buildMessages() → OpenAI chat completion
↓
extractSkyAiReply() / stripSkyAiMachineTags()
↓
finalizeListingFill()
↓
Response to user
```

**Functions Called:**
- `hasListingSellIntent()` from `sky-ai-intent.ts`
- `trySkyAiTaskReply()` from `sky-ai-task-replies.ts`
- `detectSkyAiIntent()` from `sky-ai-intent.ts`
- `buildMessages()` - constructs OpenAI messages
- `buildSkyAiSystemPrompt()` from `sky-ai-prompt.ts`
- `extractSkyAiReply()` from `sky-ai-listing-fill.ts`
- `finalizeListingFill()` from `sky-ai-draft-merge.ts`

---

## Entry Point 3: Search Voice Commands
**File:** `app/lib/voice-search-pipeline.ts` (if exists)
**Entry:** Voice search intent
**Current Flow:**
```
User speaks search query
↓
Voice Search Pipeline
↓
Search intent detection
↓
Search execution
```

**Note:** Need to verify if this is a separate entry point or part of voice commands

---

## Entry Point 4: Sell-by-Voice
**File:** `app/lib/awhina-voice-form-command.ts`
**Entry:** Voice form commands on `/post/ai` page
**Current Flow:**
```
User on /post/ai page
↓
User speaks command
↓
resolveVoiceFormCommand()
↓
VoiceFormCommand (apply_fill, append_description, publish, cancel, etc.)
↓
dispatchAwhinaVoiceFormAction()
↓
Form state update
```

**Functions Called:**
- `resolveVoiceFormCommand()` from `awhina-voice-form-command.ts`
- `dispatchAwhinaVoiceFormAction()` from `awhina-voice-form-events.ts`

---

## Entry Point 5: Edit Listing
**File:** Various form action handlers
**Entry:** Edit listing form
**Current Flow:**
```
User edits listing
↓
Form action handlers
↓
updateListingFill
↓
Form state update
```

**Note:** Need to identify exact entry point

---

## Entry Point 6: Navigation Commands
**File:** `app/lib/local-command-engine.ts`
**Entry:** Navigation shortcuts
**Current Flow:**
```
User speaks navigation command
↓
isExactNavShortcut() / route registry matching
↓
Navigation execution
↓
Router.push()
```

**Functions Called:**
- `isExactNavShortcut()` from `local-command-engine.ts`
- Route registry matching in `local-command-engine.ts`

---

## Legacy Decision Points

### Primary Decision Functions:
1. **`resolveVoiceCommand()`** in `awhina-voice-command.ts`
   - Uses regex patterns for intent detection
   - Returns VoiceCommandAction with type, path, confidence

2. **`resolveVoiceFormCommand()`** in `awhina-voice-form-command.ts`
   - Uses regex patterns for form commands
   - Returns VoiceFormCommand

3. **`hasListingSellIntent()`** in `sky-ai-intent.ts`
   - Uses regex for sell intent detection

4. **`trySkyAiTaskReply()`** in `sky-ai-task-replies.ts`
   - Uses regex for task detection (capabilities, find_buy, etc.)

5. **`detectSkyAiIntent()`** in `sky-ai-intent.ts`
   - Uses regex for intent classification

6. **`isExactNavShortcut()`** in `local-command-engine.ts`
   - Uses regex for navigation detection

---

## Single Production Entry Point Analysis

**Primary AI Processing Entry Point:** `app/api/sky-ai/route.ts`

**Rationale:**
- All typed assistant requests go through `/api/sky-ai`
- Voice commands that require AI processing (chat, listing creation) eventually call this API
- This is the only place where OpenAI chat completions are called for assistant responses
- All other entry points (voice shortcuts, navigation) are deterministic and don't require AI

**Migration Strategy:**
Replace the legacy flow in `/api/sky-ai/route.ts` with the new architecture pipeline:
```
User Request
↓
Intent Router (awhina-intent-router-server.ts)
↓
Conversation Memory (awhina-conversation-memory.ts)
↓
Tool Selection (awhina-tool-registry.ts)
↓
Tool Execution (awhina-tool-registry.ts executeToolCall)
↓
Natural Response (from tool result or AI)
```

**Voice Command Integration:**
- Keep deterministic voice shortcuts (navigation) in local execution
- Route AI-requiring voice commands through the new API
- Remove legacy `resolveVoiceCommand()` and `resolveVoiceFormCommand()` decision making
