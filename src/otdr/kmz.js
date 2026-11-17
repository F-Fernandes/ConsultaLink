import JSZip from "jszip";
import { esc, fmtM, localText } from "./route.js";
import { eventLabel } from "./sor.js";

/* ---------------------------------------------------------
   Leitura de KMZ (zip) ou KML (xml) — linhas e pontos
--------------------------------------------------------- */
function parseCoords(text) {
  return (text || "")
    .trim()
    .split(/\s+/)
    .map((t) => t.split(",").map(Number))
    .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [c[1], c[0]]); // KML é lon,lat → [lat, lon]
}

export function parseKml(text) {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Não consegui ler o KML (XML inválido).");
  }
  const lines = [];
  const points = [];
  const placemarks = Array.from(doc.getElementsByTagNameNS("*", "Placemark"));
  for (const pm of placemarks) {
    const nameEl = Array.from(pm.children).find((c) => c.localName === "name");
    const name = (nameEl?.textContent || "").trim();
    for (const ls of Array.from(pm.getElementsByTagNameNS("*", "LineString"))) {
      const ce = ls.getElementsByTagNameNS("*", "coordinates")[0];
      const coords = parseCoords(ce?.textContent);
      if (coords.length >= 2) lines.push({ name, coords });
    }
    for (const pt of Array.from(pm.getElementsByTagNameNS("*", "Point"))) {
      const ce = pt.getElementsByTagNameNS("*", "coordinates")[0];
      const c = parseCoords(ce?.textContent)[0];
      if (c) points.push({ name, lat: c[0], lon: c[1] });
    }
  }
  return { lines, points };
}

export async function readKmz(file) {
  let zip = null;
  let kmlPath = "doc.kml";
  let kmlText;
  if (file.name.toLowerCase().endsWith(".kmz")) {
    zip = await JSZip.loadAsync(file);
    const entry = zip.file("doc.kml") || zip.file(/\.kml$/i)[0];
    if (!entry) throw new Error("O KMZ não contém nenhum arquivo .kml.");
    kmlPath = entry.name;
    kmlText = await entry.async("string");
  } else {
    kmlText = await file.text();
  }
  const parsed = parseKml(kmlText);
  if (!parsed.lines.length) throw new Error("Não encontrei linhas (traçado) no arquivo.");
  return { zip, kmlPath, kmlText, fileName: file.name, ...parsed };
}

/* ---------------------------------------------------------
   Exportação: KMZ original + pasta com os pontos de atenuação
--------------------------------------------------------- */
const ICONS = {
  both: "http://maps.google.com/mapfiles/kml/paddle/red-circle.png",
  A: "http://maps.google.com/mapfiles/kml/paddle/blu-circle.png",
  B: "http://maps.google.com/mapfiles/kml/paddle/ylw-circle.png",
};

function describeItem(it) {
  const rows = [];
  if (it.a) rows.push(fiberRow("Fibra A", it.a));
  if (it.b) rows.push(fiberRow("Fibra B", it.b));
  rows.push(`Posição na rota: ${fmtM(it.routeM)} m`);
  rows.push(`Local: ${esc(localText(it))}`);
  rows.push(`Coordenada: ${it.lat.toFixed(6)}, ${it.lon.toFixed(6)}`);
  return rows.join("<br/>");
}

function fiberRow(label, e) {
  return (
    `${label}: ${fmtM(e.fiberM)} m na fibra · perda ${fmtM(e.lossDb, 2)} dB` +
    (e.reflective ? ` · refl. ${fmtM(e.reflDb, 1)} dB` : "") +
    ` · ${esc(eventLabel(e))}`
  );
}

function titleOf(it) {
  const who = it.kind === "both" ? "A+B" : it.kind;
  const loss = Math.max(Math.abs(it.a?.lossDb ?? 0), Math.abs(it.b?.lossDb ?? 0));
  const end = (it.a || it.b).endOfFiber ? " (fim)" : "";
  return `#${it.n} ${who} ${fmtM(loss, 2)} dB${end}`;
}

function buildFragment(items) {
  const styles = Object.entries(ICONS)
    .map(
      ([k, href]) =>
        `<Style id="otdr-${k}"><IconStyle><scale>1.1</scale><Icon><href>${href}</href></Icon></IconStyle></Style>`
    )
    .join("");
  const marks = items
    .map(
      (it) =>
        `<Placemark><name>${esc(titleOf(it))}</name>` +
        `<description><![CDATA[${describeItem(it)}]]></description>` +
        `<styleUrl>#otdr-${it.kind === "both" ? "both" : it.kind}</styleUrl>` +
        `<Point><coordinates>${it.lon},${it.lat},0</coordinates></Point></Placemark>`
    )
    .join("");
  return `${styles}<Folder><name>Atenuações OTDR</name>${marks}</Folder>`;
}

export async function exportKmz(kmz, items) {
  const KML_NS = "http://www.opengis.net/kml/2.2";
  const fragDoc = new DOMParser().parseFromString(
    `<kml xmlns="${KML_NS}"><Document>${buildFragment(items)}</Document></kml>`,
    "text/xml"
  );
  if (fragDoc.getElementsByTagName("parsererror").length) {
    throw new Error("Falha ao montar os pontos para exportação.");
  }
  const orig = new DOMParser().parseFromString(kmz.kmlText, "text/xml");
  const root = orig.documentElement;
  let target = Array.from(root.children).find((c) => c.localName === "Document");
  if (!target) {
    target = orig.createElementNS(root.namespaceURI, "Document");
    while (root.firstChild) target.appendChild(root.firstChild);
    root.appendChild(target);
  }
  const fragDocEl = fragDoc.documentElement.firstElementChild;
  // estilos devem vir antes dos Placemarks/Folders no Document
  const styleNodes = Array.from(fragDocEl.children).filter((c) => c.localName === "Style");
  const folderNodes = Array.from(fragDocEl.children).filter((c) => c.localName === "Folder");
  const firstNonStyle = Array.from(target.children).find((c) => c.localName !== "Style");
  for (const s of styleNodes) {
    const node = orig.importNode(s, true);
    if (firstNonStyle) target.insertBefore(node, firstNonStyle);
    else target.appendChild(node);
  }
  for (const f of folderNodes) target.appendChild(orig.importNode(f, true));

  let xml = new XMLSerializer().serializeToString(orig);
  if (!xml.startsWith("<?xml")) xml = `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;

  const out = kmz.zip || new JSZip();
  out.file(kmz.kmlPath, xml);
  return out.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    mimeType: "application/vnd.google-earth.kmz",
  });
}
