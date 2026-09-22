import { getActiveChatModel } from "../features/ai/model-store";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  CalendarDays,
  ArrowRight,
  Upload,
  Landmark,
  FileSpreadsheet,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  MapPin,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useApp, PageTitle, Empty, CategoryBadge } from "../components/ui";
import {
  currencyDigits,
  displayDate,
  financialRows,
  localDate,
  money,
  occurrences,
  totals,
} from "../lib/finance";
export function Dashboard({ onImport }: { onImport: () => void }) {
  const { data, run } = useApp();
  const settings = data.settings[0];
  const chatReady = useLiveQuery(
    async () => !!(await getActiveChatModel()),
    [],
  );
  const showImport =
    data.movements.length === 0 && !settings?.hideImportWelcome;
  const showTanu = chatReady === false && !settings?.hideTanuWelcome;
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [currency, setCurrency] = useState(data.accounts[0]?.currency || "EUR");
  const factor = 10 ** currencyDigits(currency);
  const currencies = [
    ...new Set(["EUR", ...data.accounts.map((a) => a.currency)]),
  ];
  const rows = data.movements.filter(
      (m) => m.date.startsWith(month) && m.currency === currency,
    ),
    t = totals(rows, data.relations, data.movements);
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of financialRows(rows, data.relations, data.movements))
      if (m.amount < 0 || m.isRefund)
        map.set(
          m.categoryId || "",
          (map.get(m.categoryId || "") || 0) - m.amount,
        );
    return [...map.entries()]
      .filter(([, value]) => value > 0)
      .map(([id, value]) => ({
        name:
          data.categories.find((c) => c.id === id)?.name || "Sin categorizar",
        color: data.categories.find((c) => c.id === id)?.color || "#a8b3a8",
        value: value / factor,
      }));
  }, [rows, data.categories, data.relations, data.movements]);
  const evolution = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(`${month}-15T12:00:00`);
    date.setMonth(date.getMonth() - 5 + i);
    const key = localDate(date).slice(0, 7);
    const v = totals(
      data.movements.filter(
        (m) => m.date.startsWith(key) && m.currency === currency,
      ),
      data.relations,
      data.movements,
    );
    return {
      name: date.toLocaleDateString("es-ES", { month: "short" }),
      Ingresos: v.income / factor,
      Gastos: v.expense / factor,
    };
  });
  const end = localDate(
    new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  );
  const upcoming = data.recurrences
    .filter((r) => r.currency === currency)
    .flatMap((r) =>
      occurrences(r, `${month}-01`, end).map((date) => ({ ...r, date })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const totalRecurring = upcoming.reduce(
    (sum, r) => sum + Math.abs(r.amount),
    0,
  );
  const recent = [...rows]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  return (
    <>
      <PageTitle
        eyebrow="UN POCO DE CLARIDAD, CADA DÍA"
        title="Tu dinero, con perspectiva"
        description="Todo lo que necesitas saber. En un lugar que solo te pertenece."
        action={
          <div className="period-select">
            <input
              aria-label="Mes del resumen"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <select
              aria-label="Moneda del resumen"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        }
      />
      {(showImport || showTanu) && (
        <div
          className={`welcome-grid ${showImport && showTanu ? "" : "welcome-single"}`}
        >
          {showImport && (
            <section className="import-card">
              <button
                className="icon-button welcome-dismiss"
                aria-label="Ocultar ayuda de importación"
                onClick={() =>
                  void run(
                    db.settings.update("main", { hideImportWelcome: true }),
                  )
                }
              >
                <X size={16} />
              </button>
              <div className="section-heading">
                <span className="feature-icon amber">
                  <Upload size={21} />
                </span>
                <div>
                  <h2>Empieza por tus movimientos</h2>
                  <p>Trae tus datos. El resto, lo organizamos contigo.</p>
                </div>
              </div>
              <div className="import-options">
                <button onClick={onImport}>
                  <span className="feature-icon cream">
                    <FileSpreadsheet size={23} />
                  </span>
                  <span>
                    <strong>Importar un archivo</strong>
                    <small>CSV, Excel o PDF</small>
                  </span>
                  <ChevronRight size={17} />
                </button>
                <Link to="/banco">
                  <span className="feature-icon blue">
                    <Landmark size={23} />
                  </span>
                  <span>
                    <strong>Conectar tu banco</strong>
                    <small>Con Enable Banking</small>
                  </span>
                  <ChevronRight size={17} />
                </Link>
              </div>
              <p className="mini-privacy">
                <ShieldCheck size={13} /> Los archivos se procesan aquí. Nunca
                se suben.
              </p>
            </section>
          )}
          {showTanu && (
            <section className="ai-card">
              <button
                className="icon-button welcome-dismiss"
                aria-label="Ocultar presentación de Tanu"
                onClick={() =>
                  void run(
                    db.settings.update("main", { hideTanuWelcome: true }),
                  )
                }
              >
                <X size={16} />
              </button>
              <div className="ai-copy">
                <span className="eyebrow">
                  <Sparkles size={13} /> INTELIGENCIA, CON PRIVACIDAD
                </span>
                <h2>
                  Conoce a Tanu<span>.</span>
                </h2>
                <p>
                  Un poco de ayuda para entender
                  <br />
                  mejor tus finanzas. Siempre local.
                </p>
                <Link to="/ia" className="text-link">
                  Descubre tu IA local <ArrowRight size={15} />
                </Link>
              </div>
              <img
                src={`${import.meta.env.BASE_URL}tanu.webp`}
                alt="Tanu con su libreta"
              />
              <span className="ai-card-decoration">
                Tu pequeño
                <br />
                aliado financiero
              </span>
            </section>
          )}
        </div>
      )}
      <div className="metrics">
        {[
          {
            label: "Ingresos",
            amount: t.income,
            Icon: ArrowDownLeft,
            color: "green",
            detail: `${rows.filter((m) => m.amount > 0).length} abonos en el período`,
          },
          {
            label: "Gastos",
            amount: t.expense,
            Icon: ArrowUpRight,
            color: "rust",
            detail: "Incluye devoluciones vinculadas",
          },
          {
            label: "Balance del período",
            amount: t.balance,
            Icon: Scale,
            color: "teal",
            detail: "Ingresos menos gastos netos",
          },
          {
            label: "Cargos previstos",
            amount: totalRecurring,
            Icon: CalendarDays,
            color: "plum",
            detail: `${upcoming.length} vencimientos este mes`,
          },
        ].map(({ label, amount, Icon, color, detail }) => (
          <section className="metric card" key={label}>
            <div className={`metric-icon ${color}`}>
              <Icon size={21} />
            </div>
            <div>
              <span>{label}</span>
              <strong>{money(amount, currency)}</strong>
              <small>{detail}</small>
            </div>
          </section>
        ))}
      </div>
      <div className="charts-grid">
        <section className="card chart-card">
          <div className="card-heading">
            <h2>¿Dónde se va tu dinero?</h2>
            <span className="muted">Por categoría</span>
          </div>
          {byCategory.length ? (
            <div className="donut-layout">
              <div className="donut">
                <ResponsiveContainer width="100%" height={195}>
                  <PieChart>
                    <Pie
                      data={byCategory}
                      innerRadius={56}
                      outerRadius={80}
                      dataKey="value"
                      strokeWidth={3}
                    >
                      {byCategory.map((c) => (
                        <Cell key={c.name} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) =>
                        money(Math.round(Number(v) * factor), currency)
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <small>Gastos netos</small>
                  <strong>{money(t.expense, currency)}</strong>
                </div>
              </div>
              <ul className="chart-legend">
                {byCategory.slice(0, 6).map((c) => (
                  <li key={c.name}>
                    <i style={{ background: c.color }} />
                    <span>{c.name}</span>
                    <strong>
                      {money(Math.round(c.value * factor), currency)}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Empty title="Cada gasto tiene su lugar">
              Importa y categoriza tus movimientos para ver el reparto.
            </Empty>
          )}
        </section>
        <section className="card chart-card">
          <div className="card-heading">
            <h2>Tu evolución</h2>
            <span className="muted">Últimos 6 meses</span>
          </div>
          <div className="chart-key">
            <span>
              <i className="green-dot" />
              Ingresos
            </span>
            <span>
              <i className="rust-dot" />
              Gastos
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={evolution} barGap={5}>
              <CartesianGrid vertical={false} stroke="#edf0ea" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                fontSize={12}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                fontSize={11}
                width={45}
              />
              <Tooltip
                formatter={(v) =>
                  money(Math.round(Number(v) * factor), currency)
                }
              />
              <Bar
                dataKey="Ingresos"
                fill="#6f9c7f"
                radius={[3, 3, 0, 0]}
                maxBarSize={15}
              />
              <Bar
                dataKey="Gastos"
                fill="#cc947c"
                radius={[3, 3, 0, 0]}
                maxBarSize={15}
              />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
      <div className="bottom-grid">
        <section className="card recent-card">
          <div className="card-heading">
            <h2>Últimos movimientos</h2>
            <Link className="text-link" to="/movimientos">
              Ver todos <ArrowRight size={14} />
            </Link>
          </div>
          {recent.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Movimiento</th>
                    <th>Categoría</th>
                    <th>Cuenta</th>
                    <th className="align-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link
                          className="movement-link"
                          to={`/movimientos?id=${m.id}`}
                        >
                          {m.merchant || m.description}
                        </Link>
                        <small>{displayDate(m.date)}</small>
                      </td>
                      <td>
                        <CategoryBadge
                          id={m.categoryId}
                          categories={data.categories}
                        />
                      </td>
                      <td>
                        {data.accounts.find((a) => a.id === m.accountId)?.name}
                      </td>
                      <td
                        className={`align-right amount ${m.amount > 0 ? "positive" : ""}`}
                      >
                        {m.amount > 0 ? "+" : ""}
                        {money(m.amount, m.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Tu historia financiera empieza aquí"
              action={
                <button className="button secondary" onClick={onImport}>
                  <Upload size={15} /> Importar movimientos
                </button>
              }
            >
              Añade un extracto para empezar a darle sentido a tus números.
            </Empty>
          )}
        </section>
        <section className="card upcoming-card">
          <div className="card-heading">
            <h2>
              <CalendarDays size={17} /> En el calendario
            </h2>
          </div>
          {upcoming.length ? (
            <ul className="upcoming-list">
              {upcoming.slice(0, 4).map((r, i) => (
                <li key={`${r.id}-${i}`}>
                  <span className="date-box">
                    <strong>{r.date.slice(8)}</strong>
                    <small>
                      {new Date(`${r.date}T12:00:00`).toLocaleDateString(
                        "es-ES",
                        { month: "short" },
                      )}
                    </small>
                  </span>
                  <span>
                    <strong>{r.name}</strong>
                    <small>Previsto</small>
                  </span>
                  <b>{money(r.amount, r.currency)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <div className="quiet-empty">
              <CalendarDays size={30} />
              <p>Una cosa menos en la cabeza.</p>
              <small>Añade tus suscripciones y cargos fijos.</small>
            </div>
          )}
          <Link to="/suscripciones" className="text-link calendar-link">
            Abrir calendario <ArrowRight size={15} />
          </Link>
        </section>
      </div>
      <Link to="/mapa" className="map-strip">
        <span className="feature-icon sage">
          <MapPin size={20} />
        </span>
        <span>
          <strong>Un lugar para cada recuerdo</strong>
          <small>
            Relaciona tus movimientos con tu historial de ubicaciones.
          </small>
        </span>
        <ArrowRight size={19} />
      </Link>
    </>
  );
}
