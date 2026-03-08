/**
 * Agent core — Claude API agentic loop with tool use.
 * Uses manual loop for human-in-the-loop confirmation on write tools.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getToolDefinitions, executeTool, isWriteTool } from "./tools/index.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Load system prompt from CLAUDE.md ────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(resolve(__dirname, "..", "CLAUDE.md"), "utf-8");

// ── Types ────────────────────────────────────────────────────────────

export interface AgentMessage {
  type: "text" | "tool_call" | "confirm_request" | "error" | "done";
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolUseId?: string;
}

type ConfirmCallback = (
  toolName: string,
  toolInput: Record<string, unknown>,
  toolUseId: string,
) => Promise<boolean>;

// ── Session store ────────────────────────────────────────────────────

interface Session {
  messages: Anthropic.MessageParam[];
}

const sessions = new Map<string, Session>();

export function getOrCreateSession(sessionId: string): Session {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { messages: [] });
  }
  return sessions.get(sessionId)!;
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// ── Agent loop ───────────────────────────────────────────────────────

// Lazy-init: the Anthropic client must be created AFTER dotenv loads .env,
// but ES module imports resolve before index.ts calls dotenv.config().
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}
const MODEL = "claude-sonnet-4-6";
const MAX_TURNS = 15;

/**
 * Run the agent loop for a user message.
 * Yields AgentMessage events as the agent processes.
 * `onConfirm` is called for write tools — must resolve true/false.
 */
export async function* runAgent(
  sessionId: string,
  userMessage: string,
  onConfirm: ConfirmCallback,
): AsyncGenerator<AgentMessage> {
  const session = getOrCreateSession(sessionId);

  // Add user message
  session.messages.push({ role: "user", content: userMessage });

  const tools = getToolDefinitions();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // Call Claude
    let response: Anthropic.Message;
    try {
      response = await getClient().messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools,
        messages: session.messages,
      });
    } catch (err: any) {
      yield { type: "error", content: `Claude API error: ${err.message}` };
      return;
    }

    // Append assistant response to conversation
    session.messages.push({ role: "assistant", content: response.content });

    // Process content blocks
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        yield { type: "text", content: block.text };
      } else if (block.type === "tool_use") {
        const { name, input, id } = block;
        const toolInput = input as Record<string, unknown>;

        // Check if write tool — needs confirmation
        if (isWriteTool(name)) {
          yield {
            type: "confirm_request",
            content: `I want to call **${name}** with:\n\`\`\`json\n${JSON.stringify(toolInput, null, 2)}\n\`\`\`\nApprove this change?`,
            toolName: name,
            toolInput,
            toolUseId: id,
          };

          const approved = await onConfirm(name, toolInput, id);

          if (!approved) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: id,
              content: "User denied this operation. Do not retry — inform the user the action was cancelled.",
              is_error: true,
            });
            continue;
          }
        }

        // Execute tool
        yield {
          type: "tool_call",
          content: `Calling ${name}...`,
          toolName: name,
          toolInput,
          toolUseId: id,
        };

        const result = await executeTool(name, toolInput);

        toolResults.push({
          type: "tool_result",
          tool_use_id: id,
          content: result,
        });
      }
    }

    // If Claude is done (no tool calls, or end_turn)
    if (response.stop_reason === "end_turn" || toolResults.length === 0) {
      yield { type: "done", content: "" };
      return;
    }

    // Send tool results back
    session.messages.push({ role: "user", content: toolResults });
  }

  yield {
    type: "error",
    content: "Agent reached maximum turns. Please start a new message.",
  };
}
