import React, { useState, useMemo, useRef, useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Upload, Download } from "lucide-react";
import { parseSor, eventLabel } from "./otdr/sor.js";
import { readKmz, exportKmz } from "./otdr/kmz.js";
import * as G from "./otdr/route.js";

const COLORS = { both: "#C4544A", A: "#4C8DFF", B: "#F0C231" };
const KIND_LABEL = { both: "A + B (em comum)", A: "Só fibra A", B: "Só fibra B" };

const n = (v, d = 0) => {
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : d;
};

const card = { background: "#14171C", border: "1px solid #262B33" };
const mono = { fontFamily: "'JetBrains Mono', monospace" };

/* ---------- componentes pequenos ---------- */
function FileSlot({ title, hint, accept, summary, onFile, error, accent }) {
  return (
    <label
      className="block rounded-lg p-3 cursor-pointer"
      style={{ background: "#0B0D10", border: `1px dashed ${summary ? accent : "#262B33"}` }}
    >
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files && e.target.files[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-2 text-sm" style={{ color: "#E9ECEF" }}>
        <Upload size={14} style={{ color: accent }} />
        {title}
      </div>
      <div className="text-xs mt-1 break-words" style={{ color: error ? "#C4544A" : "#8A94A6" }}>
        {error || summary || hint}
      </div>
    </label>
  );
}

function Field({ label, value, onChange, unit, type = "number" }) {
  return (
    <div>
      <label className="text-[11px] mb-1 block" style={{ color: "#8A94A6" }}>
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md px-2.5 py-1.5 text-sm outline-none"
          style={{
            ...mono,
            paddingRight: unit ? 30 : undefined,
            background: "#0B0D10",
            color: "#E9ECEF",
            border: "1px solid #262B33",
          }}
        />
        {unit && (
          <span
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px]"
            style={{ color: "#5C6472" }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function SideSelect({ label, value, onChange }) {
  return (
    <div>
      <label className="text-[11px] mb-1 block" style={{ color: "#8A94A6" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md px-2 py-1.5 text-sm outline-none"
        style={{ background: "#0B0D10", color: "#E9ECEF", border: "1px solid #262B33" }}
      >
        <option value="start">Início da rota</option>
        <option value="end">Fim da rota</option>
      </select>
    </div>
  );
}

function popupHtml(it) {
  const row = (lbl, e) =>
    e
      ? `${lbl}: ${G.fmtM(e.fiberM)} m na fibra · ${G.fmtM(e.lossDb, 2)} dB` +
        (e.reflective ? ` · refl. ${G.fmtM(e.reflDb, 1)} dB` : "") +
        ` · ${G.esc(eventLabel(e))}<br/>`
      : "";
  return (
    `<b>#${it.n} · ${KIND_LABEL[it.kind]}</b><br/>` +
    row("Fibra A", it.a) +
    row("Fibra B", it.b) +
    `Rota: ${G.fmtM(it.routeM)} m<br/>${G.esc(G.localText(it))}<br/>` +
    `<a href="https://www.google.com/maps?q=${it.lat},${it.lon}" target="_blank" rel="noreferrer">Abrir no Google Maps</a>`
  );
}

/* ---------------------------------------------------------
   Aba principal
--------------------------------------------------------- */
export default function OtdrTab({ active }) {
  const [kmz, setKmz] = useState(null);
  const [sorA, setSorA] = useState(null);
  const [sorB, setSorB] = useState(null);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);

  const [flipped, setFlipped] = useState(false);
  const [sideA, setSideA] = useState("start");
  const [sideB, setSideB] = useState("start");
  const [offA, setOffA] = useState("0");
  const [offB, setOffB] = useState("0");
  const [boxRes, setBoxRes] = useState("20");
  const [everyM, setEveryM] = useState("500");
  const [everyRes, setEveryRes] = useState("50");
  const [boxFilter, setBoxFilter] = useState("");
  const [boxMaxDist, setBoxMaxDist] = useState("40");
  const [useMarkers, setUseMarkers] = useState(true);
  const [useJoints, setUseJoints] = useState(true);
  const [joinTol, setJoinTol] = useState("30");
  const [threshold, setThreshold] = useState("0.1");
  const [matchTol, setMatchTol] = useState("15");

  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const markersRef = useRef({});

  /* ---------- upload ---------- */
  const loadKmz = async (file) => {
    try {
      setBusy(true);
      const k = await readKmz(file);
      setKmz(k);
      setFlipped(false);
      setErr((e) => ({ ...e, kmz: null }));
    } catch (e) {
      setErr((p) => ({ ...p, kmz: e.message }));
    } finally {
      setBusy(false);
    }
  };

  const loadSor = async (slot, file) => {
    try {
      const parsed = parseSor(await file.arrayBuffer());
      const v = { name: file.name, ...parsed };
      if (slot === "A") setSorA(v);
      else setSorB(v);
      setErr((p) => ({ ...p, [slot]: null }));
    } catch (e) {
      setErr((p) => ({ ...p, [slot]: e.message }));
    }
  };

  /* ---------- rota ---------- */
  const route = useMemo(() => {
    if (!kmz) return null;
    const r = buildRouteSafe(kmz.lines, n(joinTol, 30));
    if (flipped) {
      const len = r.coords.length;
      r.coords = [...r.coords].reverse();
      r.joints = r.joints.map((j) => ({ index: len - 1 - j.index })).sort((a, b) => a.index - b.index);
    }
    const cum = G.cumulative(r.coords);
    return { ...r, cum, total: cum.length ? cum[cum.length - 1] : 0 };
  }, [kmz, joinTol, flipped]);

  const boxes = useMemo(() => {
    if (!route || !route.coords.length) return [];
    const list = [];
    if (useMarkers) {
      const terms = boxFilter
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      for (const p of kmz.points) {
        const nm = (p.name || "").toLowerCase();
        if (terms.length && !terms.some((t) => nm.includes(t))) continue;
        const pr = G.projectOnRoute([p.lat, p.lon], route.coords, route.cum);
        if (pr.dist <= n(boxMaxDist, 40)) {
          list.push({ name: p.name || "Caixa", pos: pr.pos, latlon: pr.point, source: "marcador" });
        }
      }
    }
    if (useJoints) {
      route.joints.forEach((j, i) =>
        list.push({
          name: `Junção ${i + 1}`,
          pos: route.cum[j.index],
          latlon: route.coords[j.index],
          source: "junção",
        })
      );
    }
    return G.dedupeBoxes(list);
  }, [route, kmz, useMarkers, useJoints, boxFilter, boxMaxDist]);

  const ctx = useMemo(
    () =>
      route && route.coords.length
        ? { coords: route.coords, cum: route.cum, total: route.total, boxes }
        : null,
    [route, boxes]
  );

  const reserveOpts = {
    boxReserveM: n(boxRes, 20),
    everyM: n(everyM, 500),
    everyReserveM: n(everyRes, 50),
  };
  const rKey = `${boxRes}|${everyM}|${everyRes}`;

  const locA = useMemo(
    () =>
      ctx && sorA ? G.locateEvents(sorA, ctx, { ...reserveOpts, side: sideA, offsetM: n(offA) }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, sorA, sideA, offA, rKey]
  );
  const locB = useMemo(
    () =>
      ctx && sorB ? G.locateEvents(sorB, ctx, { ...reserveOpts, side: sideB, offsetM: n(offB) }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, sorB, sideB, offB, rKey]
  );

  const merged = useMemo(() => {
    if (!ctx || (!locA && !locB)) return [];
    const th = n(threshold, 0.1);
    const a = locA ? G.filterEvents(locA.events, th) : [];
    const b = locB ? G.filterEvents(locB.events, th) : [];
    return G.mergeFibers(a, b, n(matchTol, 15), ctx);
  }, [ctx, locA, locB, threshold, matchTol]);

  /* ---------- mapa ---------- */
  useEffect(() => {
    if (mapRef.current || !mapEl.current) return undefined;
    const map = L.map(mapEl.current).setView([-15.78, -47.93], 4);
    const sat = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Imagens © Esri" }
    );
    const streets = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    });
    streets.addTo(map);
    L.control.layers({ Ruas: streets, Satélite: sat }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (active && mapRef.current) setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 60);
  }, [active]);

  useEffect(() => {
    const map = mapRef.current;
    const g = layerRef.current;
    if (!map || !g) return;
    g.clearLayers();
    markersRef.current = {};
    if (!route || !route.coords.length) return;
    L.polyline(route.coords, { color: "#1E9EA8", weight: 4, opacity: 0.95 }).addTo(g);
    boxes.forEach((b) =>
      L.circleMarker(b.latlon, {
        radius: 5,
        color: "#0B0D10",
        weight: 1,
        fillColor: "#D97A29",
        fillOpacity: 1,
      })
        .bindTooltip(`${b.name} · ${G.fmtM(b.pos, 0)} m`)
        .addTo(g)
    );
    merged.forEach((it) => {
      const m = L.circleMarker([it.lat, it.lon], {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: COLORS[it.kind],
        fillOpacity: 1,
      })
        .bindPopup(popupHtml(it))
        .addTo(g);
      markersRef.current[it.id] = m;
    });
  }, [route, boxes, merged]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route || !route.coords.length) return;
    map.fitBounds(L.latLngBounds(route.coords), { padding: [30, 30] });
  }, [kmz]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusItem = (it) => {
    const m = markersRef.current[it.id];
    const map = mapRef.current;
    if (!m || !map) return;
    if (mapEl.current) mapEl.current.scrollIntoView({ behavior: "smooth", block: "center" });
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 18));
    setTimeout(() => m.openPopup(), 450);
  };

  /* ---------- exportar ---------- */
  const download = async () => {
    try {
      const blob = await exportKmz(kmz, merged);
      const base = kmz.fileName.replace(/\.(kmz|kml)$/i, "");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${base}_atenuacoes.kmz`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    } catch (e) {
      setErr((p) => ({ ...p, export: e.message }));
    }
  };

  /* ---------- diagnóstico ---------- */
  const diag = (sor, loc, off) => {
    if (!sor || !loc || !ctx) return null;
    const span = sor.spanM - off;
    const expected = ctx.total + loc.reserveM;
    return { span, expected, diff: span - expected };
  };
  const dA = diag(sorA, locA, n(offA));
  const dB = diag(sorB, locB, n(offB));

  const beyond = merged.filter((it) => (it.a && it.a.beyondM > 5) || (it.b && it.b.beyondM > 5)).length;
  const warnings = [...(route ? route.warnings : [])];
  if (beyond) warnings.push(`${beyond} evento(s) ficam além do fim da rota (fibra medida maior que o traçado).`);
  if (kmz && ctx && !boxes.length)
    warnings.push("Nenhuma caixa de emenda identificada; as reservas por caixa não foram aplicadas.");

  const kmzSummary = kmz
    ? `${kmz.fileName} · ${kmz.lines.length} trecho(s) · ${kmz.points.length} ponto(s)`
    : null;
  const sorSummary = (s) =>
    s
      ? `${s.name} · ${s.wavelengthNm} nm · ${s.events.length} eventos · ${G.fmtM(s.spanM, 0)} m` +
        (s.fiberId ? ` · fibra ${s.fiberId}` : "")
      : null;

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Arquivos */}
      <div className="rounded-xl p-5" style={card}>
        <div className="text-sm font-medium mb-3" style={{ color: "#E9ECEF" }}>
          Arquivos
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FileSlot
            title="Traçado (KMZ/KML)"
            hint="Linhas dos trechos e marcadores das caixas"
            accept=".kmz,.kml"
            summary={busy ? "Lendo arquivo…" : kmzSummary}
            error={err.kmz}
            onFile={loadKmz}
            accent="#1E9EA8"
          />
          <FileSlot
            title="Fibra A (.sor)"
            hint="Medição OTDR da primeira fibra"
            accept=".sor,.SOR"
            summary={sorSummary(sorA)}
            error={err.A}
            onFile={(f) => loadSor("A", f)}
            accent={COLORS.A}
          />
          <FileSlot
            title="Fibra B (.sor) — opcional"
            hint="Segunda fibra, para achar pontos em comum"
            accept=".sor,.SOR"
            summary={sorSummary(sorB)}
            error={err.B}
            onFile={(f) => loadSor("B", f)}
            accent={COLORS.B}
          />
        </div>
        {(sorA?.warnings || []).concat(sorB?.warnings || []).map((w, i) => (
          <p key={i} className="text-xs mt-2" style={{ color: "#E3B84A" }}>
            {w}
          </p>
        ))}
      </div>

      {/* 2. Parâmetros */}
      <details className="rounded-xl p-5" style={card} open>
        <summary className="text-sm font-medium cursor-pointer" style={{ color: "#E9ECEF" }}>
          Parâmetros
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SideSelect label="Fibra A medida a partir do" value={sideA} onChange={setSideA} />
            <Field label="Offset da fibra A (lançamento)" value={offA} onChange={setOffA} unit="m" />
            <SideSelect label="Fibra B medida a partir do" value={sideB} onChange={setSideB} />
            <Field label="Offset da fibra B (lançamento)" value={offB} onChange={setOffB} unit="m" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Reserva por caixa" value={boxRes} onChange={setBoxRes} unit="m" />
            <Field label="Reserva a cada" value={everyM} onChange={setEveryM} unit="m" />
            <Field label="Tamanho da reserva" value={everyRes} onChange={setEveryRes} unit="m" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Perda mínima exibida" value={threshold} onChange={setThreshold} unit="dB" />
            <Field label="Tolerância ponto em comum" value={matchTol} onChange={setMatchTol} unit="m" />
            <Field label="Tolerância de junção" value={joinTol} onChange={setJoinTol} unit="m" />
            <Field label="Distância máx. caixa–rota" value={boxMaxDist} onChange={setBoxMaxDist} unit="m" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <Field
              label="Caixas: nome contém (separe por vírgula; vazio = todos)"
              value={boxFilter}
              onChange={setBoxFilter}
              type="text"
            />
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs" style={{ color: "#C4CBD6" }}>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={useMarkers} onChange={(e) => setUseMarkers(e.target.checked)} />
                Marcadores do KMZ
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={useJoints} onChange={(e) => setUseJoints(e.target.checked)} />
                Junções entre trechos
              </label>
            </div>
          </div>
          <div>
            <button
              onClick={() => setFlipped(!flipped)}
              disabled={!kmz}
              className="text-xs px-3 py-1.5 rounded-md"
              style={{
                background: "#0B0D10",
                color: kmz ? "#C4CBD6" : "#5C6472",
                border: "1px solid #262B33",
              }}
            >
              Inverter sentido da rota (início e fim)
            </button>
          </div>
        </div>
      </details>

      {/* Avisos e diagnóstico */}
      {(warnings.length > 0 || dA || dB || ctx) && (
        <div className="rounded-xl p-4 text-xs flex flex-col gap-1.5" style={card}>
          {ctx && (
            <div style={{ color: "#C4CBD6" }}>
              Rota consolidada: <b style={mono}>{G.fmtM(ctx.total, 0)} m</b> · {route.segments} trecho(s) ·{" "}
              {boxes.length} caixa(s)
            </div>
          )}
          {[
            ["A", dA],
            ["B", dB],
          ].map(
            ([lbl, d]) =>
              d && (
                <div key={lbl} style={{ color: "#8A94A6" }}>
                  Fibra {lbl}: medida <span style={mono}>{G.fmtM(d.span, 0)} m</span> · esperado pela rota +
                  reservas <span style={mono}>{G.fmtM(d.expected, 0)} m</span> · diferença{" "}
                  <span style={{ ...mono, color: Math.abs(d.diff) > 100 ? "#E3B84A" : "#4FAE7A" }}>
                    {d.diff >= 0 ? "+" : ""}
                    {G.fmtM(d.diff, 0)} m
                  </span>
                </div>
              )
          )}
          {warnings.map((w, i) => (
            <div key={i} style={{ color: "#E3B84A" }}>
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Mapa */}
      <div className="rounded-xl p-3" style={card}>
        <div ref={mapEl} style={{ height: 440, borderRadius: 8, overflow: "hidden", background: "#0B0D10" }} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 px-1 text-[11px]" style={{ color: "#8A94A6" }}>
          <Legend color="#1E9EA8" label="Rota" />
          <Legend color="#D97A29" label="Caixa de emenda" />
          <Legend color={COLORS.A} label="Fibra A" />
          <Legend color={COLORS.B} label="Fibra B" />
          <Legend color={COLORS.both} label="Em comum (A+B)" />
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl p-5" style={card}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="text-sm font-medium" style={{ color: "#E9ECEF" }}>
            Pontos de atenuação{" "}
            <span style={{ color: "#5C6472" }}>({merged.length})</span>
          </div>
          <button
            onClick={download}
            disabled={!kmz || !merged.length}
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-md"
            style={{
              background: kmz && merged.length ? "#1E9EA8" : "#0B0D10",
              color: kmz && merged.length ? "#0B0D10" : "#5C6472",
              border: "1px solid #262B33",
              fontWeight: 500,
            }}
          >
            <Download size={14} />
            Baixar KMZ com atenuações
          </button>
        </div>
        {err.export && (
          <p className="text-xs mb-2" style={{ color: "#C4544A" }}>
            {err.export}
          </p>
        )}
        {!merged.length ? (
          <p className="text-sm" style={{ color: "#5C6472" }}>
            Envie o KMZ e ao menos um arquivo .sor para ver os pontos no mapa.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 560, color: "#C4CBD6" }}>
              <thead>
                <tr style={{ color: "#8A94A6", textAlign: "left" }}>
                  <th className="pb-2 pr-3 font-normal">#</th>
                  <th className="pb-2 pr-3 font-normal">Fibra</th>
                  <th className="pb-2 pr-3 font-normal">Rota (m)</th>
                  <th className="pb-2 pr-3 font-normal">Perda (dB)</th>
                  <th className="pb-2 font-normal">Local</th>
                </tr>
              </thead>
              <tbody>
                {merged.map((it) => (
                  <tr
                    key={it.id}
                    onClick={() => focusItem(it)}
                    className="cursor-pointer"
                    style={{ borderTop: "1px solid #262B33" }}
                  >
                    <td className="py-2 pr-3" style={mono}>
                      {it.n}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span
                        className="inline-block rounded-full mr-1.5 align-middle"
                        style={{ width: 9, height: 9, background: COLORS[it.kind] }}
                      />
                      {it.kind === "both" ? "A+B" : it.kind}
                    </td>
                    <td className="py-2 pr-3" style={mono}>
                      {G.fmtM(it.routeM)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap" style={mono}>
                      {it.a && G.fmtM(it.a.lossDb, 2)}
                      {it.a && it.b && " / "}
                      {it.b && G.fmtM(it.b.lossDb, 2)}
                      {(it.a || it.b).endOfFiber && " (fim)"}
                    </td>
                    <td className="py-2">
                      {G.localText(it)}
                      {((it.a && it.a.inReserve) || (it.b && it.b.inReserve)) && (
                        <span style={{ color: "#E3B84A" }}> · dentro de reserva</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] mt-3" style={{ color: "#5C6472" }}>
          Posições estimadas: a distância medida na fibra é convertida para a rota descontando as reservas
          de cabo informadas. Confirme em campo antes de intervir.
        </p>
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block rounded-full" style={{ width: 9, height: 9, background: color }} />
      {label}
    </span>
  );
}

function buildRouteSafe(lines, tol) {
  const r = G.buildRoute(lines, tol);
  return { ...r, coords: [...r.coords], joints: [...r.joints] };
}
