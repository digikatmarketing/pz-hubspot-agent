/**
 * WebSocket gateway — routes messages between browser and agent.
 */

import { WebSocket } from "ws";
import { runAgent, clearSession } from "./agent.js";
import { randomUUID } from "crypto";

// ── Per-connection state ─────────────────────────────────────────────

interface ConnectionState {
  sessionId: string;
  pendingConfirm: {
    resolve: (approved: boolean) => void;
  } | null;
}

const connections = new Map<WebSocket, ConnectionState>();

// ── Incoming message types ───────────────────────────────────────────

interface IncomingMessage {
  type: "message" | "confirm" | "new_session";
  text?: string;
  approved?: boolean;
}

// ── Handle a new WebSocket connection ────────────────────────────────

export function handleConnection(ws: WebSocket): void {
  const state: ConnectionState = {
    sessionId: randomUUID(),
    pendingConfirm: null,
  };
  connections.set(ws, state);

  console.log(`[WS] New connection: ${state.sessionId}`);

  // Send session info
  send(ws, { type: "session", sessionId: state.sessionId });

  ws.on("message", async (raw) => {
    let msg: IncomingMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", content: "Invalid JSON" });
      return;
    }

    switch (msg.type) {
      case "message":
        await handleUserMessage(ws, state, msg.text ?? "");
        break;

      case "confirm":
        handleConfirmation(state, msg.approved ?? false);
        break;

      case "new_session":
        clearSession(state.sessionId);
        state.sessionId = randomUUID();
        state.pendingConfirm = null;
        send(ws, { type: "session", sessionId: state.sessionId });
        console.log(`[WS] New session: ${state.sessionId}`);
        break;
    }
  });

  ws.on("close", () => {
    connections.delete(ws);
    console.log(`[WS] Disconnected: ${state.sessionId}`);
  });
}

// ── Handle user message → run agent ──────────────────────────────────

async function handleUserMessage(
  ws: WebSocket,
  state: ConnectionState,
  text: string,
): Promise<void> {
  if (!text.trim()) return;

  send(ws, { type: "status", content: "thinking" });

  const onConfirm = (
    toolName: string,
    toolInput: Record<string, unknown>,
    toolUseId: string,
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      state.pendingConfirm = { resolve };
      // The confirm_request message is sent by the agent loop
    });
  };

  try {
    for await (const msg of runAgent(state.sessionId, text, onConfirm)) {
      send(ws, msg);
    }
  } catch (err: any) {
    send(ws, { type: "error", content: err.message ?? String(err) });
  }

  send(ws, { type: "status", content: "idle" });
}

// ── Handle confirmation response ─────────────────────────────────────

function handleConfirmation(state: ConnectionState, approved: boolean): void {
  if (state.pendingConfirm) {
    state.pendingConfirm.resolve(approved);
    state.pendingConfirm = null;
  }
}

// ── Send helper ──────────────────────────────────────────────────────

function send(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
