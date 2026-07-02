import { jsonError, jsonOk } from "@/lib/internal-assistant/http";
import { withInternalAssistantAuth } from "@/lib/internal-assistant/route-handler";
import { lookupEmployee } from "@/lib/internal-assistant/services";

export const GET = withInternalAssistantAuth(async (request) => {
  const q =
    new URL(request.url).searchParams.get("q")?.trim() ??
    new URL(request.url).searchParams.get("query")?.trim() ??
    "";
  if (!q) return jsonError("Missing query parameter `q`.", 400);

  const result = await lookupEmployee(q);
  if (!result.ok) return jsonError(result.error, 400);
  return jsonOk({ employees: result.employees, count: result.count });
});
