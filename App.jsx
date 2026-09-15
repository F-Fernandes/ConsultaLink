import React, { useState, useMemo } from "react";
import { Cable, Route as RouteIcon, AlertTriangle, Gauge } from "lucide-react";

/* ---------------------------------------------------------
   Paletas de cores — Telebrás (NBR) e Internacional (TIA/EIA-598)
--------------------------------------------------------- */
const STANDARDS = {
  telebras: {
    label: "Telebrás",
    sub: "Padrão nacional (NBR 13487/13488)",
    colors: [
      { name: "Verde", hex: "#1E7A46", text: "#fff" },
      { name: "Amarelo", hex: "#F0C231", text: "#20210f" },
      { name: "Branco", hex: "#F2F1EC", text: "#20210f", border: true },
      { name: "Azul", hex: "#215FA6", text: "#fff" },
      { name: "Vermelho", hex: "#BF382C", text: "#fff" },
      { name: "Violeta", hex: "#6A3E93", text: "#fff" },
      { name: "Marrom", hex: "#6A4A35", text: "#fff" },
      { name: "Rosa", hex: "#E191AC", text: "#20210f" },
      { name: "Preto", hex: "#201F1D", text: "#fff" },
      { name: "Laranja", hex: "#D97A29", text: "#fff" },
      { name: "Grafite", hex: "#71757C", text: "#fff" },
      { name: "Água", hex: "#1E9EA8", text: "#fff" },
    ],
  },
  internacional: {
    label: "Internacional",
    sub: "EIA/TIA-598-C",
    colors: [
      { name: "Azul", hex: "#215FA6", text: "#fff" },
      { name: "Laranja", hex: "#D97A29", text: "#fff" },
      { name: "Verde", hex: "#1E7A46", text: "#fff" },
      { name: "Marrom", hex: "#6A4A35", text: "#fff" },
      { name: "Cinza", hex: "#8A8E96", text: "#20210f" },
      { name: "Branco", hex: "#F2F1EC", text: "#20210f", border: true },
      { name: "Vermelho", hex: "#BF382C", text: "#fff" },
      { name: "Preto", hex: "#201F1D", text: "#fff" },
      { name: "Amarelo", hex: "#F0C231", text: "#20210f" },
      { name: "Violeta", hex: "#6A3E93", text: "#fff" },
      { name: "Rosa", hex: "#E191AC", text: "#20210f" },
      { name: "Água", hex: "#1E9EA8", text: "#fff" },
    ],
  },
};

const PRESETS = [
  { capacity: 6, groups: 1 },
  { capacity: 12, groups: 1 },
  { capacity: 24, groups: 2 },
  { capacity: 48, groups: 4 },
  { capacity: 72, groups: 6 },
  { capacity: 96, groups: 8 },
  { capacity: 144, groups: 12 },
  { capacity: 216, groups: 18 },
  { capacity: 288, groups: 24 },
];

const WAVELENGTHS = [
  { value: 850, label: "850 nm · multimodo", coef: 3.5 },
  { value: 1300, label: "1300 nm · multimodo", coef: 1.5 },
  { value: 1310, label: "1310 nm · monomodo", coef: 0.35 },
  { value: 1550, label: "1550 nm · monomodo", coef: 0.22 },
  { value: 1625, label: "1625 nm · monomodo", coef: 0.24 },
];

/* ---------------------------------------------------------
   Cor do tubo/grupo
   Telebrás (tubo loose): tubo 1 = Verde, tubo 2 = Amarelo,
   demais tubos = Branco (sequência não repete as 12 cores).
   Internacional: segue o ciclo completo das 12 cores.
--------------------------------------------------------- */
function getGroupColor(standardKey, groupNum) {
  const palette = STANDARDS[standardKey].colors;
  if (standardKey === "telebras") {
    if (groupNum === 1) return palette.find((c) => c.name === "Verde");
    if (groupNum === 2) return palette.find((c) => c.name === "Amarelo");
    return palette.find((c) => c.name === "Branco");
  }
  const idx = ((groupNum - 1) % 12) + 1;
  return palette[idx - 1];
}

/* ---------------------------------------------------------
   Lógica de identificação de fibra
--------------------------------------------------------- */
function getFiberInfo(standardKey, capacity, groups, fiberNumber) {
  const cap = Number(capacity);
  const grp = Number(groups);
  const fib = Number(fiberNumber);
  if (!cap || !grp || cap < 1 || grp < 1) return null;
  const fibersPerGroup = cap / grp;
  if (!Number.isInteger(fibersPerGroup)) {
    return { error: `${cap} fibras não se dividem igualmente em ${grp} grupos.` };
  }
  if (!fib || fib < 1 || fib > cap) {
    return { error: `Informe um número de fibra entre 1 e ${cap}.` };
  }
  const group = Math.ceil(fib / fibersPerGroup);
  const positionInGroup = ((fib - 1) % fibersPerGroup) + 1;
  let subTube = null;
  let colorIndex;
  if (fibersPerGroup <= 12) {
    colorIndex = positionInGroup;
  } else {
    subTube = Math.ceil(positionInGroup / 12);
    colorIndex = ((positionInGroup - 1) % 12) + 1;
  }
  const palette = STANDARDS[standardKey].colors;
  return {
    fibersPerGroup,
    group,
    positionInGroup,
    subTube,
    fiberColor: palette[colorIndex - 1],
    groupColor: getGroupColor(standardKey, group),
  };
}

/* ---------------------------------------------------------
   Swatch helper
--------------------------------------------------------- */
function Swatch({ color, size = 18 }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        background: color.hex,
        border: color.border ? "1px solid #3a3f47" : "none",
      }}
    />
  );
}

/* ---------------------------------------------------------
   Tab 1 — Identificação de fibra
--------------------------------------------------------- */
function FiberTab() {
  const [standard, setStandard] = useState("internacional");
  const [capacity, setCapacity] = useState(144);
  const [groups, setGroups] = useState(12);
  const [fiberNumber, setFiberNumber] = useState(24);

  const info = useMemo(
    () => getFiberInfo(standard, capacity, groups, fiberNumber),
    [standard, capacity, groups, fiberNumber]
  );

  const palette = STANDARDS[standard].colors;
  const fibersPerGroup = info && !info.error ? info.fibersPerGroup : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Padrão */}
      <div>
        <label className="text-sm mb-2 block" style={{ color: "#8A94A6" }}>
          Padrão de cores
        </label>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(STANDARDS).map(([key, s]) => (
            <button
              key={key}
              onClick={() => setStandard(key)}
              className="text-left rounded-lg p-3 transition-colors"
              style={{
                background: standard === key ? "#1A2530" : "#14171C",
                border: `1px solid ${standard === key ? "#1E9EA8" : "#262B33"}`,
              }}
            >
              <div className="font-medium" style={{ color: "#E9ECEF" }}>
                {s.label}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "#8A94A6" }}>
                {s.sub}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Presets */}
      <div>
        <label className="text-sm mb-2 block" style={{ color: "#8A94A6" }}>
          Configurações comuns
        </label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = Number(capacity) === p.capacity && Number(groups) === p.groups;
            return (
              <button
                key={`${p.capacity}-${p.groups}`}
                onClick={() => {
                  setCapacity(p.capacity);
                  setGroups(p.groups);
                }}
                className="px-3 py-1.5 rounded-md text-sm"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  background: active ? "#1E9EA8" : "#14171C",
                  color: active ? "#0B0D10" : "#C4CBD6",
                  border: `1px solid ${active ? "#1E9EA8" : "#262B33"}`,
                }}
              >
                {p.capacity}F/{p.groups}G
              </button>
            );
          })}
        </div>
      </div>

      {/* Capacidade / grupos / fibra */}
      <div className="grid grid-cols-3 gap-3">
        <NumField label="Capacidade" value={capacity} onChange={setCapacity} suffix="fibras" />
        <NumField label="Grupos" value={groups} onChange={setGroups} suffix="tubos" />
        <NumField label="Nº da fibra" value={fiberNumber} onChange={setFiberNumber} suffix="" highlight />
      </div>

      {/* Resultado */}
      <div className="rounded-xl p-5" style={{ background: "#14171C", border: "1px solid #262B33" }}>
        {!info && (
          <p className="text-sm" style={{ color: "#8A94A6" }}>
            Preencha a capacidade, os grupos e o número da fibra.
          </p>
        )}
        {info?.error && (
          <div className="flex items-center gap-2 text-sm" style={{ color: "#E39A4A" }}>
            <AlertTriangle size={16} />
            {info.error}
          </div>
        )}
        {info && !info.error && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex items-center gap-3">
              <Swatch color={info.fiberColor} size={40} />
              <div>
                <div className="text-xs" style={{ color: "#8A94A6" }}>
                  Fibra {fiberNumber}
                </div>
                <div className="text-lg font-semibold" style={{ color: "#E9ECEF" }}>
                  {info.fiberColor.name}
                </div>
              </div>
            </div>
            <div className="h-px sm:h-10 sm:w-px w-full" style={{ background: "#262B33" }} />
            <div className="flex items-center gap-3">
              <Swatch color={info.groupColor} size={28} />
              <div>
                <div className="text-xs" style={{ color: "#8A94A6" }}>
                  Grupo (tubo)
                </div>
                <div className="text-base font-medium" style={{ color: "#E9ECEF" }}>
                  Grupo {info.group} · {info.groupColor.name}
                </div>
              </div>
            </div>
            {info.subTube && (
              <>
                <div className="h-px sm:h-10 sm:w-px w-full" style={{ background: "#262B33" }} />
                <div>
                  <div className="text-xs" style={{ color: "#8A94A6" }}>
                    Subgrupo
                  </div>
                  <div className="text-base font-medium" style={{ color: "#E9ECEF" }}>
                    {info.subTube} de {Math.ceil(info.fibersPerGroup / 12)}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Mapa do cabo */}
      {info && !info.error && (
        <div>
          <label className="text-sm mb-2 block" style={{ color: "#8A94A6" }}>
            Mapa do cabo — {capacity} fibras em {groups} grupos
          </label>
          <div
            className="rounded-xl p-4 flex flex-col gap-2 overflow-x-auto"
            style={{ background: "#14171C", border: "1px solid #262B33" }}
          >
            {Array.from({ length: Number(groups) }).map((_, gIdx) => {
              const groupNum = gIdx + 1;
              const groupColor = getGroupColor(standard, groupNum);
              return (
                <div key={groupNum} className="flex items-center gap-3 min-w-max">
                  <div className="flex items-center gap-1.5 w-24 shrink-0">
                    <Swatch color={groupColor} size={10} />
                    <span
                      className="text-xs"
                      style={{ color: "#8A94A6", fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      G{groupNum}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: fibersPerGroup }).map((_, fIdx) => {
                      const posInGroup = fIdx + 1;
                      const colorIdx = ((posInGroup - 1) % 12) + 1;
                      const fColor = palette[colorIdx - 1];
                      const globalFiberNum = (groupNum - 1) * fibersPerGroup + posInGroup;
                      const isSelected = globalFiberNum === Number(fiberNumber);
                      return (
                        <span
                          key={posInGroup}
                          title={`Fibra ${globalFiberNum} · ${fColor.name}`}
                          className="rounded-full"
                          style={{
                            width: 12,
                            height: 12,
                            background: fColor.hex,
                            border: isSelected
                              ? "2px solid #E9ECEF"
                              : fColor.border
                              ? "1px solid #3a3f47"
                              : "none",
                            boxShadow: isSelected ? "0 0 0 2px #1E9EA8" : "none",
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange, suffix, highlight }) {
  return (
    <div>
      <label className="text-xs mb-1.5 block" style={{ color: "#8A94A6" }}>
        {label}
      </label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          background: "#0B0D10",
          color: "#E9ECEF",
          border: `1px solid ${highlight ? "#1E9EA8" : "#262B33"}`,
        }}
      />
      {suffix && (
        <div className="text-[11px] mt-1" style={{ color: "#5C6472" }}>
          {suffix}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Tab 2 — Cálculo de rota (orçamento óptico)
--------------------------------------------------------- */
function RouteTab() {
  const [distanceKm, setDistanceKm] = useState("12.5");
  const [spliceCount, setSpliceCount] = useState(3);
  const [spliceLoss, setSpliceLoss] = useState(0.1);
  const [wavelength, setWavelength] = useState(1550);
  const [coefOverride, setCoefOverride] = useState(null);

  const [budgetOn, setBudgetOn] = useState(false);
  const [txPower, setTxPower] = useState(0);
  const [rxSensitivity, setRxSensitivity] = useState(-23);

  const wl = WAVELENGTHS.find((w) => w.value === Number(wavelength));
  const coef = coefOverride !== null && coefOverride !== "" ? Number(coefOverride) : wl.coef;

  const dist = Number(distanceKm) || 0;
  const splices = Number(spliceCount) || 0;
  const lossFiber = dist * coef;
  const lossSplices = splices * (Number(spliceLoss) || 0);
  const total = lossFiber + lossSplices;

  const budgetAvailable = Number(txPower) - Number(rxSensitivity);
  const margin = budgetAvailable - total;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs mb-1.5 block" style={{ color: "#8A94A6" }}>
            Distância do link
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.001"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              className="w-full rounded-md px-3 py-2 pr-12 text-sm outline-none"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                background: "#0B0D10",
                color: "#E9ECEF",
                border: "1px solid #1E9EA8",
              }}
            />
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: "#5C6472" }}
            >
              km
            </span>
          </div>
        </div>

        <div>
          <label className="text-xs mb-1.5 block" style={{ color: "#8A94A6" }}>
            Caixas de emenda
          </label>
          <input
            type="number"
            min={0}
            value={spliceCount}
            onChange={(e) => setSpliceCount(e.target.value)}
            className="w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              background: "#0B0D10",
              color: "#E9ECEF",
              border: "1px solid #262B33",
            }}
          />
        </div>

        <div>
          <label className="text-xs mb-1.5 block" style={{ color: "#8A94A6" }}>
            Comprimento de onda
          </label>
          <select
            value={wavelength}
            onChange={(e) => {
              setWavelength(e.target.value);
              setCoefOverride(null);
            }}
            className="w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "#0B0D10", color: "#E9ECEF", border: "1px solid #262B33" }}
          >
            {WAVELENGTHS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs mb-1.5 block" style={{ color: "#8A94A6" }}>
            Atenuação da fibra
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={coefOverride !== null ? coefOverride : wl.coef}
              onChange={(e) => setCoefOverride(e.target.value)}
              className="w-full rounded-md px-3 py-2 pr-16 text-sm outline-none"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                background: "#0B0D10",
                color: "#E9ECEF",
                border: "1px solid #262B33",
              }}
            />
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: "#5C6472" }}
            >
              dB/km
            </span>
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs mb-1.5 block" style={{ color: "#8A94A6" }}>
          Perda por emenda de fusão
        </label>
        <div className="relative max-w-[180px]">
          <input
            type="number"
            step="0.01"
            value={spliceLoss}
            onChange={(e) => setSpliceLoss(e.target.value)}
            className="w-full rounded-md px-3 py-2 pr-10 text-sm outline-none"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              background: "#0B0D10",
              color: "#E9ECEF",
              border: "1px solid #262B33",
            }}
          />
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
            style={{ color: "#5C6472" }}
          >
            dB
          </span>
        </div>
      </div>

      {/* Resultado */}
      <div className="rounded-xl p-5" style={{ background: "#14171C", border: "1px solid #262B33" }}>
        <div className="text-xs mb-3" style={{ color: "#8A94A6" }}>
          Memória de cálculo
        </div>
        <ul className="flex flex-col gap-1.5 text-sm" style={{ color: "#C4CBD6" }}>
          <LineItem label={`Fibra: ${dist} km × ${coef} dB/km`} value={lossFiber} />
          <LineItem label={`Emendas: ${splices} × ${Number(spliceLoss) || 0} dB`} value={lossSplices} />
        </ul>
        <div
          className="mt-4 pt-4 flex items-baseline justify-between"
          style={{ borderTop: "1px solid #262B33" }}
        >
          <span className="text-sm" style={{ color: "#8A94A6" }}>
            Perda total estimada
          </span>
          <span
            className="text-2xl font-semibold"
            style={{ color: "#1E9EA8", fontFamily: "'JetBrains Mono', monospace" }}
          >
            {total.toFixed(2)} dB
          </span>
        </div>
      </div>

      {/* Orçamento óptico opcional */}
      <div className="rounded-xl p-5" style={{ background: "#14171C", border: "1px solid #262B33" }}>
        <button
          onClick={() => setBudgetOn(!budgetOn)}
          className="flex items-center gap-2 text-sm w-full text-left"
          style={{ color: "#C4CBD6" }}
        >
          <Gauge size={16} style={{ color: "#1E9EA8" }} />
          Comparar com orçamento óptico do equipamento
          <span className="ml-auto text-xs" style={{ color: "#5C6472" }}>
            {budgetOn ? "ocultar" : "mostrar"}
          </span>
        </button>
        {budgetOn && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: "#8A94A6" }}>
                  Potência Tx
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={txPower}
                  onChange={(e) => setTxPower(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-sm outline-none"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    background: "#0B0D10",
                    color: "#E9ECEF",
                    border: "1px solid #262B33",
                  }}
                />
                <div className="text-[11px] mt-1" style={{ color: "#5C6472" }}>
                  dBm
                </div>
              </div>
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: "#8A94A6" }}>
                  Sensibilidade Rx
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={rxSensitivity}
                  onChange={(e) => setRxSensitivity(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-sm outline-none"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    background: "#0B0D10",
                    color: "#E9ECEF",
                    border: "1px solid #262B33",
                  }}
                />
                <div className="text-[11px] mt-1" style={{ color: "#5C6472" }}>
                  dBm
                </div>
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm" style={{ color: "#8A94A6" }}>
                Margem líquida do link
              </span>
              <span
                className="text-xl font-semibold"
                style={{
                  color: margin >= 0 ? "#4FAE7A" : "#C4544A",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {margin.toFixed(2)} dB
              </span>
            </div>
            <p className="text-xs" style={{ color: "#5C6472" }}>
              {margin >= 0
                ? "O orçamento óptico cobre a perda estimada do link."
                : "A perda estimada excede o orçamento óptico disponível."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function LineItem({ label, value }) {
  return (
    <li className="flex items-baseline justify-between">
      <span>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value.toFixed(2)} dB</span>
    </li>
  );
}

/* ---------------------------------------------------------
   App
--------------------------------------------------------- */
export default function App() {
  const [tab, setTab] = useState("fiber");

  return (
    <div
      className="min-h-screen w-full flex justify-center px-4 py-8"
      style={{ background: "#0B0D10" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { font-family: 'Space Grotesk', sans-serif; }
        input:focus, select:focus { border-color: #1E9EA8 !important; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
      `}</style>

      <div className="w-full max-w-2xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold" style={{ color: "#E9ECEF" }}>
            Consulta-link
          </h1>
          <p className="text-sm mt-1" style={{ color: "#8A94A6" }}>
            Identificação de fibras ópticas e orçamento de perda de rota
          </p>
        </header>

        <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ background: "#14171C" }}>
          <button
            onClick={() => setTab("fiber")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-colors"
            style={{
              background: tab === "fiber" ? "#1E9EA8" : "transparent",
              color: tab === "fiber" ? "#0B0D10" : "#8A94A6",
            }}
          >
            <Cable size={16} />
            Identificar fibra
          </button>
          <button
            onClick={() => setTab("route")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-colors"
            style={{
              background: tab === "route" ? "#1E9EA8" : "transparent",
              color: tab === "route" ? "#0B0D10" : "#8A94A6",
            }}
          >
            <RouteIcon size={16} />
            Calcular rota
          </button>
        </div>

        {tab === "fiber" ? <FiberTab /> : <RouteTab />}
      </div>
    </div>
  );
}
