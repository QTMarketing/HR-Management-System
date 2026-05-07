/**
 * Tiny client-only signal so the Cmd+K command palette (mounted in the
 * dashboard shell) can ask the EmployeeHub to open the existing
 * `EmployeeTimeOffRequestModal` without coupling the two via context.
 *
 * - When the user is already on the hub: dispatch a CustomEvent and the hub
 *   listener flips `setTimeOffOpen(true)` synchronously.
 * - When the user is on a different route: stash a sessionStorage flag and
 *   navigate to "/". The hub picks up the flag on mount and opens the modal.
 */

export const REQUEST_TIME_OFF_EVENT = "hr:request-time-off";
export const REQUEST_TIME_OFF_FLAG = "hr.requestTimeOff.pending";

export function emitRequestTimeOff(opts?: { alreadyOnHub: boolean }) {
  if (typeof window === "undefined") return;
  if (opts?.alreadyOnHub) {
    window.dispatchEvent(new CustomEvent(REQUEST_TIME_OFF_EVENT));
    return;
  }
  try {
    window.sessionStorage.setItem(REQUEST_TIME_OFF_FLAG, "1");
  } catch {
    // sessionStorage may be unavailable (privacy mode) — fall through.
  }
}

export function consumeRequestTimeOffFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.sessionStorage.getItem(REQUEST_TIME_OFF_FLAG);
    if (v) {
      window.sessionStorage.removeItem(REQUEST_TIME_OFF_FLAG);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
