/** Consume without retaining the whole body so HTTP probes can reuse sockets. */
export async function drainResponse(response) {
  if (!response.body) return
  for await (const chunk of response.body) void chunk
}
