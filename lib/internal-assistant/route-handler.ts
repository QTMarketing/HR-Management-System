import { validateInternalAssistantRequest } from "@/lib/internal-assistant/auth";
import { jsonError, unauthorized } from "@/lib/internal-assistant/http";
import { logInternalAssistant } from "@/lib/internal-assistant/log";

type Handler = (request: Request) => Promise<Response>;

export function withInternalAssistantAuth(handler: Handler): Handler {
  return async (request: Request) => {
    const pathname = new URL(request.url).pathname;
    logInternalAssistant("REQUEST", {
      method: request.method,
      pathname,
    });

    const auth = validateInternalAssistantRequest(request);
    if (!auth.ok) {
      return unauthorized(auth.reason ?? "invalid_api_key");
    }

    try {
      const response = await handler(request);
      logInternalAssistant("RESPONSE", {
        pathname,
        status: response.status,
      });
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error.";
      return jsonError(message, 500);
    }
  };
}
