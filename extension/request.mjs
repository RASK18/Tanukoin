const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
export function trustedSender(url, origin, base = "/Tanukoin/") {
  try {
    const parsed = new URL(url);
    return parsed.origin === origin && parsed.pathname.startsWith(base);
  } catch {
    return false;
  }
}
export function buildRequest(message, origin) {
  if (
    !message ||
    typeof message !== "object" ||
    typeof message.action !== "string"
  )
    throw new Error("Solicitud inválida");
  if (message.action === "ping") return null;
  if (
    typeof message.token !== "string" ||
    message.token.length > 8192 ||
    !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(message.token)
  )
    throw new Error("Token inválido");
  const p = message.payload || {};
  let path,
    method = "GET",
    body;
  const id = () => {
    if (!uuid.test(p.id)) throw new Error("Identificador inválido");
    return p.id;
  };
  switch (message.action) {
    case "application":
      path = "/application";
      break;
    case "banks":
      if (!/^[A-Z]{2}$/.test(p.country)) throw new Error("País inválido");
      path = `/aspsps?country=${p.country}`;
      break;
    case "authorize":
      if (
        !p.aspsp ||
        typeof p.aspsp.name !== "string" ||
        p.aspsp.name.length > 200 ||
        !/^[A-Z]{2}$/.test(p.aspsp.country) ||
        !uuid.test(p.state) ||
        p.redirect_url !== `${origin}/Tanukoin/bank-callback.html` ||
        !Number.isFinite(Date.parse(p.valid_until))
      )
        throw new Error("Autorización inválida");
      path = "/auth";
      method = "POST";
      body = {
        access: {
          valid_until: p.valid_until,
          balances: true,
          transactions: true,
        },
        aspsp: { name: p.aspsp.name, country: p.aspsp.country },
        state: p.state,
        redirect_url: p.redirect_url,
        psu_type: "personal",
        language: "es",
      };
      break;
    case "session":
      if (typeof p.code !== "string" || p.code.length > 4096)
        throw new Error("Código inválido");
      path = "/sessions";
      method = "POST";
      body = { code: p.code };
      break;
    case "sessionStatus":
      path = `/sessions/${id()}`;
      break;
    case "revoke":
      path = `/sessions/${id()}`;
      method = "DELETE";
      break;
    case "account":
      path = `/accounts/${id()}/details`;
      break;
    case "balances":
      path = `/accounts/${id()}/balances`;
      break;
    case "transactions": {
      if (
        !date.test(p.from) ||
        !date.test(p.to) ||
        p.from > p.to ||
        (p.continuation &&
          (typeof p.continuation !== "string" || p.continuation.length > 4096))
      )
        throw new Error("Período inválido");
      const query = new URLSearchParams({ date_from: p.from, date_to: p.to });
      if (p.continuation) query.set("continuation_key", p.continuation);
      path = `/accounts/${id()}/transactions?${query}`;
      break;
    }
    default:
      throw new Error("Operación no permitida");
  }
  return {
    url: `https://api.enablebanking.com${path}`,
    options: {
      method,
      headers: {
        Authorization: `Bearer ${message.token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      credentials: "omit",
      redirect: "error",
    },
  };
}
