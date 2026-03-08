/**
 * Coach agent runner — multi-turn Claude loop with auto-executing tools.
 *
 * Unlike the dashboard agent (src/agent.ts), Coach:
 * - Has no WebSocket streaming or human-in-the-loop confirmation
 * - Auto-executes ALL tool calls (including writes like create_task)
 * - Collects full response text for structured block parsing
 * - Uses Sonnet for hourly runs, Opus for weekly reports
 */

import Anthropic from "@anthropic-ai/sdk";
import { getCoachToolDefinitions, executeCoachTool } from "../tools/index.js";
import { buildCoachPrompt } from "./prompts.js";
import { parseCoachOutput } from "./state.js";
import type { RunMode, CoachOutput } from "./types.js";

// ── Lazy-init Anthropic client ──────────────────────────────────────

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const SONNET = "claude-sonnet-4-6";
const OPUS = "claude-opus-4-6";
const MAX_TURNS = 25;

// ── Run Coach agent ─────────────────────────────────────────────────

export async function runCoachAgent(mode: RunMode): Promise<CoachOutput & { toolCalls: number }> {
  const model = mode === "WEEKLY_REPORT" ? OPUS : SONNET;
  const maxTokens = mode === "WEEKLY_REPORT" ? 12000 : 8192;
  const { system, userMessage } = buildCoachPrompt(mode);
  const tools = getCoachToolDefinitions();

  console.log(`[COACH] Starting ${mode} run (model: ${model}, tools: ${tools.length})`);

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  const textParts: string[] = [];
  let totalToolCalls = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response: Anthropic.Message;
    try {
      response = await getClient().messages.create({
        model,
        max_tokens: maxTokens,
        system,
        tools,
        messages,
      });
    } catch (err: any) {
      console.error(`[COACH] Claude API error on turn ${turn}: ${err.message}`);
      throw err;
    }

    // Append assistant response to conversation
    messages.push({ role: "assistant", content: response.content });

    // Process content blocks
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        totalToolCalls++;
        const { name, input, id } = block;
        const toolInput = input as Record<string, unknown>;

        console.log(`[COACH]   → ${name}(${JSON.stringify(toolInput).slice(0, 120)})`);

        const result = await executeCoachTool(name, toolInput);

        toolResults.push({
          type: "tool_result",
          tool_use_id: id,
          content: result,
        });
      }
    }

    // If Claude is done (no tool calls remaining, or end_turn)
    if (response.stop_reason === "end_turn" || toolResults.length === 0) {
      break;
    }

    // Send tool results back to Claude
    messages.push({ role: "user", content: toolResults });
  }

  const rawResponse = textParts.join("\n\n");
  const output = parseCoachOutput(rawResponse);

  console.log(`[COACH] Run complete: ${totalToolCalls} tool calls, ${textParts.length} text blocks`);

  return { ...output, toolCalls: totalToolCalls };
}
