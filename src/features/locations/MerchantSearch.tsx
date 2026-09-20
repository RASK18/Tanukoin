import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { useApp, Field } from "../../components/ui";
import type { MerchantResult } from "../../data/types";
import { searchMerchant } from "./search";
export function MerchantSearch({
  initialName = "",
  initialCity = "",
  onChoose,
}: {
  initialName?: string;
  initialCity?: string;
  onChoose?: (r: MerchantResult) => void;
}) {
  const { data, notify, online } = useApp();
  const [name, setName] = useState(initialName),
    [city, setCity] = useState(initialCity),
    [results, setResults] = useState<MerchantResult[] | null>(null),
    [loading, setLoading] = useState(false);
  return (
    <div className="merchant-search">
      <div className="form-grid">
        <Field label="Nombre público del comercio">
          <input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre comercial, sin datos bancarios"
          />
        </Field>
        <Field label="Localidad">
          <input
            value={city}
            maxLength={40}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Por ejemplo, Madrid"
          />
        </Field>
      </div>
      <p className="muted">
        Se enviará «{`${name} ${city}`.trim() || "nombre y localidad"}» a Photon
        y Wikipedia. No se envían cargos ni historial. Los resultados pueden ser
        incompletos.
      </p>
      <div className="button-row">
        <button
          className="button secondary"
          disabled={
            !name.trim() || loading || !online || !data.settings[0]?.search
          }
          onClick={async () => {
            setLoading(true);
            try {
              setResults(await searchMerchant(name, city));
            } catch (e) {
              notify(String(e));
            } finally {
              setLoading(false);
            }
          }}
        >
          <Search size={15} />
          {loading ? "Consultando…" : "Consultar fuentes gratuitas"}
        </button>
        {name.trim() && (
          <a
            className="text-link"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://www.google.com/search?q=${encodeURIComponent(`${name} ${city}`)}`}
          >
            Búsqueda manual <ExternalLink size={13} />
          </a>
        )}
      </div>
      {!data.settings[0]?.search && (
        <p className="muted">
          Activa las consultas externas en Ajustes para consultar desde aquí.
        </p>
      )}
      {results?.length === 0 && (
        <p>No hemos encontrado resultados. Prueba la búsqueda manual.</p>
      )}
      {results?.map((r, i) => (
        <div className="search-result" key={i}>
          <div>
            <strong>{r.name}</strong>
            <p>{r.detail}</p>
            <a href={r.url} target="_blank" rel="noopener noreferrer">
              {r.source} <ExternalLink size={12} />
            </a>
          </div>
          {onChoose && r.lat !== undefined && (
            <button
              className="button secondary small"
              onClick={() => onChoose(r)}
            >
              Usar ubicación
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
