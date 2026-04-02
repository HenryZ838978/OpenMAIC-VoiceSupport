# Devlog: wsroom Teaching Assistant Integration

## Why this change

The original classroom flow in `OpenMAIC-VoiceSupport` is optimized for multi-agent teaching:

- classroom playback drives lecture narration
- `useChatSessions` drives teacher/student discussion turns
- `useDiscussionTTS` serializes segmented TTS output

VoxLabs `ws-voice` is optimized for a different product shape:

- low-latency hold-to-talk
- fast ASR/LLM/TTS round-trips
- side-conversation semantics

Directly merging VoxLabs replies into the classroom assistant stream caused two failures:

1. VoxLabs replies were only visible inside the voice stack and never entered the classroom message model.
2. VoxLabs audio and classroom TTS played independently, creating overlapping or delayed speech.

## Product decision

Instead of turning VoxLabs into a second classroom speaker, the integration now treats it as a dedicated real-time teaching assistant side session:

1. enter teaching-assistant mode
2. freeze classroom output
3. run the low-latency VoxLabs session
4. generate a brief with the configured classroom LLM
5. hand the brief back to the original classroom as a normal student message

This keeps the original teacher/student orchestration contract intact.

## Implementation notes

### 1. Stage owns the teaching-assistant orchestration

`components/stage.tsx` now owns the `voiceFloorState` lifecycle:

- `idle`
- `handRaiseActive`
- `briefing`
- `handoff`

It is the single coordinator for:

- pausing lecture playback
- ending or clearing active chat/discussion output
- preventing stale classroom callbacks from repainting while voice floor is occupied
- handing the final brief back through the existing `sendMessage`/`handleUserInterrupt` path

### 2. The realtime assistant is now a side-session, not a classroom reply source

`lib/hooks/use-voxlabs-voice.ts` keeps a local session transcript:

- user ASR turns
- assistant completed turns
- pending streamed response preview

`components/audio/voxlabs-voice-panel.tsx` shows that transcript locally and emits a session snapshot on disconnect.

The classroom chat thread no longer receives raw realtime-assistant replies.

### 3. Brief generation is isolated in its own API

`app/api/voice-brief/route.ts` converts the side-session transcript into one concise classroom-ready student message.

Important constraints:

- brief stays short
- brief is phrased as the student addressing the teacher
- brief does not mention VoxLabs, websocket, transcript, or any internal system concept

### 4. Audio floor ownership is explicit

When the teaching-assistant session starts, the classroom releases the audio floor:

- active discussion output is ended and cleared
- `discussionTTS.cleanup()` flushes queued mechanical TTS
- lecture playback is paused

When handoff succeeds, the original classroom flow resumes from the normal user-message entry point.

If the voice session ends without useful content, paused lecture playback resumes instead.

### 5. Provider abstraction replaces the VoxLabs-only assumption

The floating assistant UI is still intentionally lightweight, but the configuration model is no longer hardcoded to one backend.

This PR adds a dedicated `realtime-assistant` provider domain:

- its own provider registry
- its own settings section
- its own persisted config slice in the settings store
- its own server-provider sync bucket

The initial built-in provider list is:

- VoxLabs
- Doubao Realtime
- OpenAI Realtime
- Gemini Live

The important design choice is that the frontend now targets a normalized realtime WebSocket entry point.

That means:

- VoxLabs can still connect directly to a compatible WS endpoint
- other vendors are expected to come in through a relay/gateway layer
- the frontend sends `provider` and `model` metadata so the server can route later without another UI rewrite

### 6. Frontend polish for the assistant panel

The classroom floating assistant panel was adjusted to behave more like a tool window than a fixed overlay:

- draggable floating window to avoid covering classroom content
- assistant avatar for a softer "private TA" feel
- larger connect button
- latency display removed to keep the interaction calm and product-like

This keeps the panel visually separate from the main teacher/student classroom voice.

## Boundary we intentionally preserved

This integration does **not** rewrite:

- multi-agent turn selection
- SSE discussion generation
- classroom chat session structure
- original teacher/student prompt logic
- discussion TTS queue semantics

The only new behavior is a side-session wrapper around the existing classroom.

## Direction after this PR

The intended long-term path is a `preuser`-first personal teaching assistant:

- user topic or query can be prepared server-side before live conversation starts
- retrieval, grounding, or prompt shaping should be scoped to that user and classroom
- realtime provider choice should stay orthogonal to classroom LLM choice

What is intentionally **not** shipped in this round:

- full per-user auth
- subscription or billing UI
- SDK packaging
- full server-side relay implementations for every vendor

Those are left for the next layer once the provider abstraction and classroom-side product shape are stable.

## Expected UX

- user presses connect on the floating assistant panel
- classroom audio stops occupying the floor
- user speaks in a low-latency side session
- panel shows local transcript and streaming reply preview
- user disconnects to finish the hand-raise
- system generates a brief and injects it back as a student message
- original classroom agents continue naturally from there
