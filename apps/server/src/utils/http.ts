export function jsonMessage(message: string, status = 400) {
  return Response.json({ message }, { status });
}
