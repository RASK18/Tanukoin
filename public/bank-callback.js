const query = new URLSearchParams(location.search);
const message = {
  channel: "tanukoin-bank-auth",
  state: query.get("state"),
  code: query.get("code"),
  error: query.get("error"),
};
history.replaceState(null, "", location.pathname);
if (message.state && typeof BroadcastChannel !== "undefined") {
  const channel = new BroadcastChannel(`tanukoin-bank-auth:${message.state}`);
  channel.postMessage(message);
  channel.close();
  document.getElementById("status").textContent =
    "Ya puedes cerrar esta pestaña y volver a Tanukoin. Si la autorización ha caducado, inicia de nuevo la conexión.";
  window.close();
} else {
  document.getElementById("status").textContent =
    "No se puede devolver esta autorización. Vuelve a Tanukoin e inicia de nuevo la conexión. Por seguridad no se guardan los códigos de autorización.";
}
