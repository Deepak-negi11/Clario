const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

type ApiErrorBody = {
  message?: string;
  error?: string;
};

type ApiRequestOptions<TBody> = {
  method?: "GET" | "POST" | "DELETE";
  token?: string;
  body?: TBody;
};

async function readErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return body?.message ?? body?.error ?? `Request failed: ${response.status}`;
}

export async function apiRequest<TResponse, TBody = never>(
  path: string,
  options: ApiRequestOptions<TBody> = {},
) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as TResponse;
}
