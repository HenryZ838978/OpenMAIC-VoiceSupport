import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModel } from '@/lib/server/resolve-model';

const log = createLogger('VoiceBrief');

interface VoiceBriefTurn {
  role: 'user' | 'assistant';
  text: string;
}

interface VoiceBriefRequest {
  turns: VoiceBriefTurn[];
  pendingResponseText?: string;
  sceneTitle?: string | null;
  stageTitle?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as VoiceBriefRequest;
    const turns = Array.isArray(body.turns) ? body.turns.filter((turn) => turn?.text?.trim()) : [];

    if (turns.length === 0 && !body.pendingResponseText?.trim()) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'turns or pendingResponseText is required',
      );
    }

    const { model: languageModel } = resolveModel({});

    const transcript = [
      ...turns.map((turn) => `${turn.role === 'user' ? 'Student' : 'Teaching Assistant'}: ${turn.text.trim()}`),
      ...(body.pendingResponseText?.trim()
        ? [`Teaching Assistant (pending): ${body.pendingResponseText.trim()}`]
        : []),
    ].join('\n');

    const context = [
      body.stageTitle ? `Course: ${body.stageTitle}` : null,
      body.sceneTitle ? `Current scene: ${body.sceneTitle}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await callLLM(
      {
        model: languageModel,
        system: `You are a classroom teaching assistant. Convert a low-latency student-to-TA voice exchange into one concise student message for the teacher.

Rules:
- Return exactly one brief student message in Chinese.
- Keep it under 90 Chinese characters when possible.
- Focus on the student's final clarified question or request.
- The final message must sound like the student is now asking the teacher directly after consulting the TA.
- Do not mention VoxLabs, websocket, assistant system design, side session, brief, summary, transcript, or any system process.
- Write as if the student is now speaking to the classroom teacher directly.
- If the student intent is unclear, produce the safest concise clarification request.`,
        prompt: `${context ? `${context}\n\n` : ''}Transcript:\n${transcript}\n\nReturn only the final student message for the teacher.`,
      },
      'voice-brief',
      { retries: 1 },
    );

    const brief = result.text.trim();
    if (!brief) {
      return apiError('GENERATION_FAILED', 500, 'Failed to generate voice brief');
    }

    return apiSuccess({ brief });
  } catch (error) {
    log.error('Voice brief generation failed:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to generate voice brief',
    );
  }
}
