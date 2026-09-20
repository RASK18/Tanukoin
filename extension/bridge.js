window.addEventListener("message", async (event) => {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    event.data?.channel !== "tanukoin-bank-request" ||
    typeof event.data.id !== "string"
  )
    return;
  const { id, action, token, payload } = event.data;
  try {
    const response = await chrome.runtime.sendMessage({
      action,
      token,
      payload,
    });
    window.postMessage(
      { channel: "tanukoin-bank-response", id, ...response },
      location.origin,
    );
  } catch {
    window.postMessage(
      {
        channel: "tanukoin-bank-response",
        id,
        error: "Recarga la página después de actualizar la extensión.",
      },
      location.origin,
    );
  }
});
