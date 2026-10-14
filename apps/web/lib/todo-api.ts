/** Saves one change to a todo. Throws when the server didn't take it, so callers can retry or revert. */
export async function patchTodo(id: number, body: Record<string, unknown>, opts: { keepalive?: boolean } = {}): Promise<void> {
  const res = await fetch(`/api/todos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: opts.keepalive,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Save failed (${res.status})`);
  }
}
