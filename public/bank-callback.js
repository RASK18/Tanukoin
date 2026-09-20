const query = new URLSearchParams(location.search);
const message = {
  channel: "tanukoin-bank-auth",
  state: query.get("state"),
  code: query.get("code"),
  error: query.get("error"),
};
history.replaceState(null, "", location.pathname);
if (window.opener && message.state) {
  window.opener.postMessage(message, location.origin);
  document.getElementById("status").textContent =
    "Ya puedes cerrar esta pestaña y volver a Tanukoin.";
} else {
  document.getElementById("status").textContent =
    "No se encuentra la ventana original. Vuelve a Tanukoin e inicia de nuevo la conexión. Por seguridad no se guardan los códigos de autorización.";
}
