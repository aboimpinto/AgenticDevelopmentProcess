import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import type { OrchestratorErrorResponse } from "./orchestrator-error-response.js";
import { sendJson } from "./send-json.js";

export interface HttpRequestListenerOptions {
  readonly dispatch: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  readonly mapError: (error: unknown) => OrchestratorErrorResponse;
  readonly reportError: (error: unknown) => void;
}
/** Bind asynchronous request dispatch to the process-level HTTP error boundary. */
export function createHttpRequestListener(options: HttpRequestListenerOptions): RequestListener {
  return (request, response) => {
    const handleError = (error: unknown) => {
      options.reportError(error);
      const { body, statusCode } = options.mapError(error);
      sendJson(response, statusCode, body);
    };

    try {
      void options.dispatch(request, response).catch(handleError);
    } catch (error) {
      handleError(error);
    }
  };
}
