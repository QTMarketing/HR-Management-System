import { jsonError, jsonOk } from "@/lib/internal-assistant/http";
import { withInternalAssistantAuth } from "@/lib/internal-assistant/route-handler";
import { getLocationRosterSummary } from "@/lib/internal-assistant/services";

export const GET = withInternalAssistantAuth(async (request) => {
  const params = new URL(request.url).searchParams;
  const location =
    params.get("locationId")?.trim() ??
    params.get("location")?.trim() ??
    params.get("store")?.trim() ??
    "";
  if (!location) {
    return jsonError("Missing `locationId`, `location`, or `store` query parameter.", 400);
  }

  const result = await getLocationRosterSummary(location);
  if (!result.ok) {
    const status = result.error === "Location not found." ? 404 : 400;
    return jsonError(result.error, status);
  }
  return jsonOk(result);
});
