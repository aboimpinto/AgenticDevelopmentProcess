export type HttpTransport = typeof fetch;

export interface HttpClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export function getHttpError(body: unknown): string | null {
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  return null;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown dashboard error";
}

export function createHttpClient(transport: HttpTransport = fetch): HttpClient {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await transport(path, init);
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await response.json() : null;

    if (!response.ok) {
      throw new Error(getHttpError(body) ?? `Request failed with ${response.status}`);
    }

    return body as T;
  }

  return {
    get<T>(path: string) {
      return request<T>(path);
    },
    post<T>(path: string, body: unknown) {
      return request<T>(path, {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    },
    request,
  };
}

const defaultHttpClient = createHttpClient();

export const apiGet = defaultHttpClient.get;
export const apiPost = defaultHttpClient.post;
export const apiRequest = defaultHttpClient.request;
