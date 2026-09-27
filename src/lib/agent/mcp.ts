// A small Model Context Protocol (MCP) server, so Claude chats can use the tools.
// It speaks JSON-RPC over plain HTTP POST ("Streamable HTTP" transport, JSON responses).

import { ToolError, runTool, toolList, type ToolContext } from "./tools";

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS =
  "This is the student's GCSE revision command centre. At the start of a study session call get_session_brief for the subject. " +
  "At the end call log_session with every topic covered and an honest red/amber/green status for each. " +
  "Use add_homework / add_test for homework and tests (e.g. from screenshots), and get_priorities to decide what to study.";

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const reply = (id: JsonRpcMessage["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: JsonRpcMessage["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** Handles one JSON-RPC message. Returns null for notifications (nothing to send back). */
export async function handleMcpMessage(message: JsonRpcMessage, ctx: ToolContext) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return fail(message?.id, -32600, "Invalid request");
  }
  const { id, method, params = {} } = message;
  const isNotification = id === undefined || id === null;
  if (isNotification) return null; // e.g. notifications/initialized

  switch (method) {
    case "initialize": {
      const requested = String(params.protocolVersion ?? "");
      return reply(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "revision", title: "Revision command centre", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: toolList() });
    case "tools/call": {
      try {
        const result = await runTool(String(params.name ?? ""), params.arguments ?? {}, ctx);
        return reply(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false });
      } catch (error) {
        const text = error instanceof ToolError ? error.message : `Something went wrong: ${(error as Error)?.message ?? error}`;
        return reply(id, { content: [{ type: "text", text }], isError: true });
      }
    }
    case "resources/list":
      return reply(id, { resources: [] });
    case "prompts/list":
      return reply(id, { prompts: [] });
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}
