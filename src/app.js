import {
  DEFAULTS,
  VERSION,
  calculate,
  flutterAt,
  atmosphereAt,
  geometry,
  vortex,
  massAndLoads,
  sdofFrequency,
  parseTrajectory,
  evaluateTrajectory,
  loadCase,
} from "./physics.js";

const STORE = "star-finlab-cases-v1";
let state = { ...DEFAULTS },
  tab = "flutter",
  trajectory = [],
  trajectoryName = "",
  notice = "",
  saved = [];
try {
  saved = JSON.parse(localStorage.getItem(STORE) || "[]");
  if (!Array.isArray(saved)) saved = [];
  saved = saved
    .filter((item) => item && typeof item === "object" && item.inputs)
    .slice(0, 12);
} catch {
  saved = [];
}
const $ = (s) => document.querySelector(s);
const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (x) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        x
      ],
  );
const fmt = (v, dp = 1) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("en-US", {
        maximumFractionDigits: dp,
        minimumFractionDigits: dp,
      });
const icon = (name) =>
  ({
    fin: '<path d="M5 20 16 4l3 16Z"/><path d="M5 20h15"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>',
    print: '<path d="M7 8V3h10v5M7 17H4V8h16v9h-3M7 14h10v7H7Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
  })[name] || "";
const svgIcon = (name) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon(name)}</svg>`;

const types = {
  root: "length",
  tip: "length",
  span: "length",
  sweep: "length",
  thickness: "length",
  length: "length",
  bodyOD: "length",
  launchAltitude: "altitude",
  altitude: "altitude",
  apogee: "altitude",
  speed: "speed",
  shear: "modulus",
  sitePressure: "pressure",
  modalMass: "mass",
  extraMass: "mass",
  baseMass: "mass",
  baseCG: "station",
  assemblyX: "station",
  cp: "station",
  loadArm: "length",
};
function unit(type) {
  const imperial = state.units === "imperial";
  return (
    {
      length: imperial ? ["in", 0.0254] : ["mm", 0.001],
      altitude: imperial ? ["ft", 0.3048] : ["m", 1],
      station: imperial ? ["in", 0.0254] : ["m", 1],
      speed: imperial ? ["ft/s", 0.3048] : ["m/s", 1],
      modulus: imperial ? ["Msi", 6894757293.168] : ["GPa", 1e9],
      pressure: imperial ? ["psi", 6894.757293168] : ["kPa", 1000],
      mass: imperial ? ["lb", 0.45359237] : ["kg", 1],
    }[type] || ["", 1]
  );
}
function output(v, type, dp = 1) {
  const [u, f] = unit(type);
  return `${fmt(v == null ? null : v / f, dp)} <small>${u}</small>`;
}
function input(key, label, help = "", options = {}) {
  const [u, factor] = unit(types[key]);
  const val =
    state[key] == null ? "" : Number((state[key] / factor).toPrecision(10));
  return `<label class="field" for="${key}"><span>${label}</span><div class="input-wrap"><input id="${key}" data-key="${key}" type="number" step="any" value="${val}" ${options.optional ? 'placeholder="Not supplied"' : "required"} ${help ? `aria-describedby="${key}-help"` : ""}><span>${options.unit || u}</span></div>${help ? `<small id="${key}-help">${help}</small>` : ""}</label>`;
}
function textInput(key, label, multiline = false) {
  return `<label class="field" for="${key}"><span>${label}</span>${multiline ? `<textarea id="${key}" data-key="${key}" rows="3">${escape(state[key])}</textarea>` : `<input id="${key}" data-key="${key}" type="text" value="${escape(state[key])}">`}</label>`;
}
function select(key, label, entries) {
  return `<label class="field" for="${key}"><span>${label}</span><select id="${key}" data-key="${key}">${entries.map(([v, t]) => `<option value="${v}" ${state[key] === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>`;
}
function panel(title, subtitle, body, extra = "") {
  return `<section class="panel ${extra}"><div class="panel-heading"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div></div>${body}</section>`;
}
function metric(title, val, detail, extra = "") {
  return `<div class="metric ${extra}"><div class="eyebrow">${title}</div><div class="metric-value">${val}</div><p>${detail}</p></div>`;
}
function warning(message) {
  return `<div class="callout">${message}</div>`;
}

function sidebar() {
  return `<aside class="sidebar"><div class="section-label">DESIGN INPUTS <span>01—03</span></div>
    <details open><summary><span class="step">01</span> Fin geometry</summary><div class="detail-body">
      <p class="hint">Exposed trapezoid only. Internal tabs are excluded.</p>
      <div class="field-grid">${input("root", "Root chord · Cr")}${input("tip", "Tip chord · Ct")}${input("span", "Semispan · b")}${input("sweep", "Sweep offset · m", "Root leading edge → tip leading edge, measured parallel to the rocket axis. Positive aft; not an angle or slanted edge length.")}${input("thickness", "Plate thickness · t")}</div>
      ${select("profile", "Section treatment", [
        ["uniform", "Uniform plate"],
        ["bevel", "Beveled / airfoil edges"],
        ["taper", "Spanwise thickness taper"],
      ])}
      ${textInput("geometryBasis", "Geometry / thickness / edge-treatment source", true)}
    </div></details>
    <details open><summary><span class="step">02</span> Material</summary><div class="detail-body">
      ${select("material", "Material study", [
        ["al7075", "7075 aluminum · typical"],
        ["al6061", "6061 aluminum · typical"],
        ["g10", "G10 / fiberglass · screening"],
        ["hybrid", "Glass + carbon + epoxy · custom"],
        ["custom", "Custom material"],
      ])}
      <div class="field-grid">${input("shear", "Shear modulus · G")}${input("uncertainty", "G sensitivity", "± range, not a confidence interval.", { unit: "%" })}</div>
      ${state.material === "hybrid" ? warning("Enter a laminate-specific effective shear modulus. No automatic carbon-fiber or tip-to-tip multiplier.") : ""}
      ${textInput("materialBasis", "Material source / estimate")}
    </div></details>
    <details open><summary><span class="step">03</span> Flight condition</summary><div class="detail-body">
      <div class="field-grid">${input("speed", "Expected airspeed", "True airspeed at this altitude.")}${input("altitude", "Check altitude · AGL", "At the speed above, not apogee.")}${input("launchAltitude", "Site elevation · MSL")}${input("apogee", "Target apogee · AGL", "Context only; not used in the equation.")}</div>
      ${select("atmosphere", "Atmosphere", [
        ["standard", "Standard atmosphere"],
        ["local", "Launch-site temperature + pressure"],
      ])}
      ${state.atmosphere === "local" ? `<div class="field-grid">${input("siteTemperature", "Site temperature", "", { unit: "°C" })}${input("sitePressure", "Station absolute pressure", "Not sea-level-corrected weather pressure.")}</div>` : ""}
      ${textInput("flightBasis", "Flight source / assumptions", true)}
    </div></details>
    <div class="sidebar-foot">Everything stays in your browser.<br/>Export a case to share the assumptions.</div>
  </aside>`;
}

function finDrawing() {
  let g;
  try {
    g = geometry(state);
  } catch {
    return '<div class="empty">Enter valid geometry to preview the fin.</div>';
  }
  const { root: r, tip: t, span: b, sweep: m, thickness } = state;
  const minX = Math.min(0, m),
    maxX = Math.max(r, m + t);
  const scale = Math.min(410 / (maxX - minX), 153 / b);
  const x0 = 66 - minX * scale,
    y0 = 213;
  const x = (n) => x0 + n * scale,
    y = (n) => y0 - n * scale;
  const pts = `${x(0)},${y(0)} ${x(r)},${y(0)} ${x(m + t)},${y(b)} ${x(m)},${y(b)}`;
  return `<svg class="fin-svg" viewBox="0 0 560 280" role="img" aria-label="Live fin planform with root chord, tip chord, semispan, leading-edge sweep offset and root region">
    <defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e5ecef" stroke-width=".7"/></pattern><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6 6 0" stroke="#648679" stroke-width="1"/></pattern></defs>
    <rect x="20" y="15" width="520" height="245" rx="8" fill="url(#grid)"/>
    <path d="M45 37h48m-5-4 5 4-5 4" fill="none" stroke="#5d7479"/><text x="102" y="41" class="svg-note">AIRFLOW</text>
    <polygon points="${pts}" fill="#cdf1e3" fill-opacity=".8" stroke="#207c64" stroke-width="1.6"/>
    <path d="M${x(0)} ${y0}V${y(b)}M${x(m)} ${y(b)}v32" stroke="#7b8c94" stroke-dasharray="3 3" fill="none"/>
    <path d="M${x(0)} ${y(b) + 28}H${x(m)}M${x(0)} ${y(b) + 24}v8M${x(m)} ${y(b) + 24}v8" stroke="#207c64" fill="none"/>
    <text x="${x(m / 2)}" y="${y(b) + 20}" text-anchor="middle" class="svg-label">m ${fmt(m / unit("length")[1], 1)} ${unit("length")[0]}</text>
    <path d="M${x(0)} ${y0}H${x(r)}v9H${x(0)}Z" fill="url(#hatch)" stroke="#648679" stroke-width=".7"/>
    <path d="M${x(0)} ${y0 + 28}H${x(r)}M${x(0)} ${y0 + 24}v8M${x(r)} ${y0 + 24}v8" stroke="#7b8c94"/>
    <text x="${x(r / 2)}" y="${y0 + 47}" text-anchor="middle" class="svg-label">Cr ${fmt(r / unit("length")[1], 1)} ${unit("length")[0]}</text>
    <text x="${x(m + t / 2)}" y="${y(b) - 12}" text-anchor="middle" class="svg-label">Ct ${fmt(t / unit("length")[1], 1)}</text>
    <path d="M${x(maxX) + 20} ${y0}V${y(b)}" stroke="#7b8c94"/>
    <text x="${x(maxX) + 26}" y="${y(b / 2)}" class="svg-label">b ${fmt(b / unit("length")[1], 1)}</text>
    <circle cx="${x(g.centroidX)}" cy="${y((b * (r + 2 * t)) / (3 * (r + t)))}" r="4" fill="#207c64"/>
    <text x="${x(g.centroidX) + 10}" y="${y((b * (r + 2 * t)) / (3 * (r + t))) + 4}" class="svg-note">AREA CENTROID</text>
    <text x="${x(0) + 8}" y="${y0 - 9}" class="svg-note">FULL-THICKNESS ROOT</text>
    <text x="535" y="273" text-anchor="end" class="svg-note">t = ${fmt(thickness / unit("length")[1], 3)} ${unit("length")[0]} · SCHEMATIC</text>
  </svg>`;
}

function chart(
  series,
  {
    xLabel,
    yLabel,
    band = null,
    modes = [],
    xMax = null,
    yMax = null,
    id = "chart",
    subtitle = "",
  },
) {
  const W = 740,
    H = 260,
    L = 62,
    T = 25,
    R = 22,
    B = 48,
    w = W - L - R,
    h = H - T - B;
  const all = series.flatMap((s) => s.points);
  const xm = xMax ?? Math.max(1, ...all.map((p) => p[0]));
  const ym =
    yMax ??
    Math.max(
      1,
      ...all.map((p) => p[1]),
      ...modes.map((m) => m.value * (1 + m.percent / 100)),
    ) * 1.12;
  const px = (x) => L + (x / xm) * w,
    py = (y) => T + h - (y / ym) * h;
  const path = (points) =>
    points
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${px(p[0]).toFixed(2)},${py(p[1]).toFixed(2)}`,
      )
      .join(" ");
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-title"><title id="${id}-title">${escape(yLabel)} versus ${escape(xLabel)}. ${escape(subtitle)}</title>
    ${Array.from({ length: 5 }, (_, i) => {
      const y = (ym * i) / 4;
      return `<path d="M${L} ${py(y)}H${W - R}" stroke="#e6ecef"/><text x="${L - 10}" y="${py(y) + 4}" text-anchor="end" class="axis">${fmt(y, ym < 10 ? 1 : 0)}</text>`;
    }).join("")}
    ${Array.from({ length: 6 }, (_, i) => {
      const x = (xm * i) / 5;
      return `<text x="${px(x)}" y="${T + h + 23}" text-anchor="middle" class="axis">${fmt(x, xm < 10 ? 1 : 0)}</text>`;
    }).join("")}
    ${band ? `<path d="${path(band.low)} ${path([...band.high].reverse()).replace(/^M/, "L")}Z" fill="#37a77e" fill-opacity=".12"/>` : ""}
    ${modes.map((m) => `<rect x="${L}" y="${py(m.value * (1 + m.percent / 100))}" width="${w}" height="${((2 * m.value * m.percent) / 100 / ym) * h}" fill="#d0a450" fill-opacity=".14"/><path d="M${L} ${py(m.value)}H${W - R}" stroke="#b88832" stroke-dasharray="5 5"/><text x="${W - R - 5}" y="${py(m.value) - 5}" text-anchor="end" class="axis">${escape(m.label)}</text>`).join("")}
    ${series.map((s) => `<path d="${path(s.points)}" fill="none" stroke="${s.color}" stroke-width="2.4" ${s.dash ? 'stroke-dasharray="6 5"' : ""}/>`).join("")}
    <text x="${L}" y="13" class="axis">${escape(yLabel)}</text><text x="${W / 2}" y="${H - 4}" text-anchor="middle" class="axis">${escape(xLabel)}</text>
  </svg><div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${escape(s.name)}</span>`).join("")}${band ? '<span><i class="band-key"></i>G sensitivity band</span>' : ""}</div></div>`;
}

function flutterView(r) {
  const speedFactor = unit("speed")[1],
    altFactor = unit("altitude")[1];
  const top = Math.min(
    11000 - state.launchAltitude,
    Math.max(state.apogee, state.altitude, 1000),
  );
  const samples = Array.from({ length: 61 }, (_, i) => {
    const h = (top * i) / 60;
    const f = flutterAt(state, h);
    return [h / altFactor, f.velocity / speedFactor];
  });
  const band = {
    low: samples.map(([x, y]) => [
      x,
      y * Math.sqrt(1 - state.uncertainty / 100),
    ]),
    high: samples.map(([x, y]) => [
      x,
      y * Math.sqrt(1 + state.uncertainty / 100),
    ]),
  };
  const marginText =
    r.lowMargin == null
      ? "Enter a nonzero flight speed to compare."
      : r.lowMargin <= 0
        ? "The lower G case is at or below the entered speed."
        : "The lower G case is above the entered speed; mounting and aeroelastic effects remain unmodeled.";
  const profileWarning =
    state.profile !== "uniform"
      ? "The calculation still uses one uniform thickness. Bevels and spanwise taper are recorded, but their stiffness and aerodynamic effects are not modeled."
      : "";
  let trajectoryPanel;
  if (trajectory.length) {
    const tr = evaluateTrajectory(state, trajectory),
      step = Math.max(1, Math.floor(tr.rows.length / 400)),
      plot = tr.rows.filter(
        (_, i) => i % step === 0 || i === tr.rows.length - 1,
      );
    trajectoryPanel = `<div class="trajectory-summary"><div><strong>${escape(trajectoryName || "Imported trajectory")}</strong><p>${trajectory.length} samples · sampled minimum lower-G margin: <b>${fmt(tr.worst?.lowMargin)}%</b>${tr.worst ? ` at ${fmt(tr.worst.time, 2)} s` : ""}</p><p>Sampled max-Q: ${output(tr.maxQ.q, "pressure")} at ${fmt(tr.maxQ.time, 2)} s. CSV rows are not interpolated.</p></div><button class="quiet" data-action="clear-trajectory">Remove</button></div>
      ${chart(
        [
          {
            name: "Flutter estimate",
            color: "#27866a",
            points: plot.map((x) => [x.time, x.flutter / speedFactor]),
          },
          {
            name: "Trajectory airspeed",
            color: "#5c77b4",
            points: plot.map((x) => [x.time, x.speed / speedFactor]),
          },
        ],
        {
          xLabel: "Time (s)",
          yLabel: `Speed (${unit("speed")[0]})`,
          id: "trajectory",
          band: {
            low: plot.map((x) => [x.time, x.low / speedFactor]),
            high: plot.map((x) => [x.time, x.high / speedFactor]),
          },
        },
      )}
      <button class="quiet" data-action="export-trajectory">${svgIcon("download")} Export evaluated CSV</button>`;
  } else
    trajectoryPanel = `<div class="upload-zone">${svgIcon("upload")}<h3>Check the flight, not just one point.</h3><p>Import air-relative speed and altitude from your simulation.</p><button class="button secondary" data-action="import-trajectory">Import trajectory CSV</button><button class="text-button" data-action="template">Download CSV template</button><small>SI columns: time_s, altitude_agl_m, speed_m_s<br/>Template rows are illustrative, not LE4 flight data.</small></div>`;
  return `<div class="metrics">${metric("Flutter velocity", output(r.velocity, "speed"), `G range: ${fmt(r.low / speedFactor)}–${fmt(r.high / speedFactor)} ${unit("speed")[0]}`, "featured")}${metric("Velocity margin", `${fmt(r.margin)}<small>%</small>`, `Lower G case: ${fmt(r.lowMargin)}%`, r.lowMargin <= 0 ? "negative" : "")}${metric("Dynamic pressure", output(r.dynamicPressure, "pressure"), "At the check point; not flight max-Q.")}</div>
    ${warning(marginText)}${r.flutterMach > 1.5 ? warning("The predicted boundary is above Mach 1.5. Treat that value as an extrapolation of this preliminary relation, not a validated high-speed limit.") : ""}${profileWarning ? warning(profileWarning) : ""}
    <div class="two-panels">${panel("Your fin, in profile", "Dimensions update with your inputs.", finDrawing())}${panel("At this flight condition", "Standard units inside every calculation.", `<dl class="facts"><div><dt>Flight Mach</dt><dd>${fmt(r.mach, 3)}</dd></div><div><dt>Flutter Mach</dt><dd>${fmt(r.flutterMach, 3)}</dd></div><div><dt>Altitude MSL</dt><dd>${output(r.msl, "altitude")}</dd></div><div><dt>Static pressure</dt><dd>${output(r.pressure, "pressure")}</dd></div><div><dt>Aspect ratio / taper</dt><dd>${fmt(r.aspect, 3)} / ${fmt(r.taper, 3)}</dd></div><div><dt>Thickness / root</dt><dd>${fmt(r.thicknessRatio * 100, 2)}%</dd></div><div><dt>Centroid offset ε</dt><dd>${fmt(r.epsilon, 4)}</dd></div></dl>`)}</div>
    ${panel(
      "Flutter boundary with altitude",
      "The horizontal line holds the entered speed constant. It is not a simulated flight path.",
      chart(
        [
          { name: "Flutter estimate", color: "#27866a", points: samples },
          {
            name: "Entered airspeed",
            color: "#5c77b4",
            dash: true,
            points: [
              [0, state.speed / speedFactor],
              [top / altFactor, state.speed / speedFactor],
            ],
          },
        ],
        {
          xLabel: `Altitude AGL (${unit("altitude")[0]})`,
          yLabel: `Speed (${unit("speed")[0]})`,
          band,
          id: "altitude",
        },
      ),
    )}
    ${panel("Trajectory check", "Use a complete mass model. V1 SD is a historical screening reference.", trajectoryPanel)}
    ${panel(
      "Model choice",
      "An explicit choice, with no hidden reinforcement factors.",
      select("method", "Flutter relation", [
        ["bennett", "Bennett centroid correction · trapezoidal plate"],
        ["martin", "Martin fixed ε = 0.25 · comparison"],
      ]) +
        `<p class="hint">Uses static atmospheric pressure in the flutter equation. Root-joint compliance is not represented. No T2T ×2 modulus shortcut is applied.</p>`,
    )}
  `;
}

function vortexView() {
  const maxSpeed = trajectory.length
    ? Math.max(state.speed, ...trajectory.map((x) => x.speed))
    : state.speed;
  const v = vortex(state, maxSpeed),
    sf = unit("speed")[1];
  return `<div class="view-intro"><span class="eyebrow">VORTEX-INDUCED EXCITATION</span><h2>A different question from flutter.</h2><p>Compare an assumed shedding-frequency sweep with measured or FE modal frequencies. This does not predict response amplitude, lock-in width, or failure.</p></div>
    <div class="two-panels">${panel("Flow-frequency inputs", "Match St and characteristic length to the same flow mechanism.", `<div class="field-grid">${input("st", "Strouhal number · St", "Uses f in Hz, not angular frequency.")}${input("length", "Characteristic length · L", "Not automatically chord or plate thickness.")}</div>${textInput("stBasis", "Correlation / flow mechanism", true)}<p class="equation">fₛ = St · U / L &nbsp; · &nbsp; ωₛ = 2π fₛ</p>`)}
    ${panel("Assembly modes", "Include the slot, adhesive, struts and chassis restraint.", `${textInput("modeFrequencies", "Natural frequencies (Hz, comma-separated)")}${textInput("modeBasis", "Modal source / boundary condition")}${input("proximity", "Plot proximity band", "An arbitrary screening tolerance, not a lock-in prediction.", { unit: "%" })}`)}</div>
    <div class="metrics two">${metric("At sweep maximum", `${fmt(v.frequency)} <small>Hz</small>`, `U = ${fmt(maxSpeed / sf)} ${unit("speed")[0]}; St is an input assumption.`)}${metric("Angular frequency", `${fmt(v.omega)} <small>rad/s</small>`, "2π × frequency; do not mix definitions of St.")}</div>
    ${panel(
      "Frequency sweep",
      "All speeds from zero to the larger of the entered speed and imported trajectory maximum.",
      chart(
        [
          {
            name: "Assumed shedding frequency",
            color: "#27866a",
            points: [
              [0, 0],
              [maxSpeed / sf, v.frequency],
            ],
          },
        ],
        {
          xLabel: `Airspeed (${unit("speed")[0]})`,
          yLabel: "Frequency (Hz)",
          id: "frequency",
          modes: v.modes.map((m, i) => ({
            value: m.fn,
            percent: state.proximity,
            label: `Mode ${i + 1}: ${fmt(m.fn, 0)} Hz`,
          })),
        },
      ),
    )}
    ${v.modes.length ? `<section class="panel"><h2>Potential frequency crossings</h2><div class="table-scroll"><table><thead><tr><th>Mode</th><th>Frequency</th><th>Crossing speed</th><th>Proximity band in sweep?</th></tr></thead><tbody>${v.modes.map((m, i) => `<tr><td>${i + 1}</td><td>${fmt(m.fn)} Hz</td><td>${output(m.crossing, "speed")}</td><td>${m.intersects ? "Yes · assess response" : "No intersection in assumed band"}</td></tr>`).join("")}</tbody></table></div><p class="hint">A crossing is not a fracture prediction. Assess forcing, damping, dwell time and mode participation. Absence of a crossing does not clear flutter.</p></section>` : warning("No natural frequencies entered. There is no resonance assessment yet. Use an assembly modal test or FEA result; the flutter estimate does not supply these frequencies.")}
    ${panel("Optional single-mode estimate", "For a known effective modal mass and matching modal stiffness only.", `<div class="field-grid">${input("modalMass", "Effective modal mass", "Not necessarily the whole fin mass.", { optional: true })}${input("modalStiffness", "Effective modal stiffness", "Same generalized coordinate as the mass.", { unit: "N/m", optional: true })}</div><p class="equation">fₙ = √(k / m) / 2π = <strong>${fmt(sdofFrequency(state.modalMass, state.modalStiffness), 2)} Hz</strong></p><p class="hint">No beam/plate or joint stiffness is inferred. To compare this result, explicitly add it to the mode-frequency list above.</p>`)}
  `;
}

function mountingView() {
  const m = massAndLoads(state);
  return `<div class="view-intro"><span class="eyebrow">LOAD PATH & AFT MASS</span><h2>The root is part of the structure.</h2><p>A slot locates the fin. The tab, adhesive, receiving member and supports must transfer shear, bending and torsion into the chassis.</p></div>
    <div class="load-path"><span>FIN</span><b>→</b><span>TAB + JOINT</span><b>→</b><span>SUPPORTS</span><b>→</b><span>CHASSIS</span></div>
    ${panel(
      "Attachment concept",
      "Recorded for the case; it does not change the flutter equation.",
      `${select("mount", "Root support", [
        ["slot", "Slot mount + epoxy fillets"],
        ["strut", "Struts / angle brackets + fillets"],
        ["clamp", "Clamped root / internal frame"],
        ["other", "Other / under development"],
      ])}${textInput("mountNotes", "Load path, adhesive, layup and test notes", true)}${warning("A one-sided rear stop is not a bidirectional bending/torsion restraint. Confirm how the root transfers moments, and verify the actual assembly stiffness.")}`,
    )}
    <div class="two-panels">${panel("Assembly mass estimate", "Uniform exposed plate mass; tabs, glue, reinforcement and brackets go in additional mass.", `<div class="field-grid">${input("density", "Fin density", "For the modeled plate/laminate.", { unit: "kg/m³" })}${input("finCount", "Fin count", "Integer number of fins.")}${input("extraMass", "Additional total mass", "All tabs, fillets, added skins and supports; avoid double counting.")}</div><dl class="facts"><div><dt>One exposed fin</dt><dd>${output(m.finMass, "mass", 3)}</dd></div><div><dt>Total modeled assembly</dt><dd>${output(m.assemblyMass, "mass", 3)}</dd></div></dl><p class="hint">Bevels and thickness taper are not deducted from this estimate. Zero additional mass means it has not been budgeted.</p>`)}
    ${panel("Normal load at the check point", "A static load estimate, separate from vibration and flutter.", `<div class="field-grid">${input("normalCoefficient", "Normal-force coefficient · Cn", "Per-fin coefficient referenced to exposed planform area; not angle of attack.", { optional: true })}${input("loadArm", "Normal-force lever arm", "Perpendicular arm to the root bending axis.", { optional: true })}</div><dl class="facts"><div><dt>Force · q S Cn</dt><dd>${fmt(m.force)} N</dd></div><div><dt>Root bending moment · F ℓ</dt><dd>${fmt(m.moment, 2)} N·m</dd></div></dl><p class="hint">No torque, bond stress, peel, buckling or allowable-strength check is performed.</p>`)}</div>
    ${panel("What does aft mass do to CG?", "All stations measured aft from the same datum. CP must come from the matching configuration and flight condition.", `<div class="field-grid three">${input("baseMass", "Baseline vehicle mass", "Must EXCLUDE the entire modeled fin assembly.", { optional: true })}${input("baseCG", "Baseline CG station", "Same mass basis as above.", { optional: true })}${input("assemblyX", "Assembly centroid station", "Mass-weighted station of the entire added assembly.", { optional: true })}${input("cp", "CP station", "External input; the app does not calculate CP.", { optional: true })}${input("bodyOD", "Body outside diameter", "", { optional: true })}</div><dl class="facts inline"><div><dt>Combined CG</dt><dd>${output(m.cg, "station", 3)}</dd></div><div><dt>Static margin · (CP − CG) / D</dt><dd>${fmt(m.stability, 2)} cal</dd></div></dl>`)}
  `;
}

function designReferences() {
  return panel(
    "Design research & further reading",
    "User-supplied references, checked 2026-10-02. A reference is not a validation of this app or STAR's fin assembly.",
    `<ol class="sources research-sources">
    <li><a href="https://www.researchgate.net/publication/410793139_Subsystem-Level_Aerodynamic_Optimization_with_Max-Q-Based_System_Integration_and_Flight_Testing_of_an_Experimental_Sounding_Rocket" target="_blank" rel="noreferrer">Sathe, Bhartia, Sridhar & Radhakrishnan (2026) · Subsystem-Level Aerodynamic Optimization with Max-Q-Based System Integration and Flight Testing of an Experimental Sounding Rocket</a><p>Aerospace Science and Technology 178, 113242 · <a href="https://doi.org/10.1016/j.ast.2026.113242" target="_blank" rel="noreferrer">DOI</a>. Sections 2.1.1–2.1.3: max-Q-based integration and fin planform/section trade studies. These are design-process references, not transferable STAR dimensions. Its Eq. (2) uses a different factor-of-two convention from the pinned Bennett relation; it is not the app's numerical authority.</p></li>
    <li><a href="https://ntrs.nasa.gov/api/citations/20200002364/downloads/20200002364.pdf" target="_blank" rel="noreferrer">Li, Geiselhart & Robinson (2019) · Flutter Prediction for Aircraft Conceptual Design</a><p>NASA NTRS 20200002364. ConceptFEA and p-k flutter analysis: context for higher-fidelity aeroelastic modeling. This aircraft study is not a Strouhal correlation or a validation of the simple rocket-fin formula; the app does not implement its solver.</p></li>
    <li><a href="https://apogeerockets.com/education/downloads/Newsletter442.pdf" target="_blank" rel="noreferrer">Tim Van Milligan (2017) · What is the best fin shape for a model rocket?</a><p>Peak of Flight #442, May 2, 2017. Background on planform, induced drag, airfoil shape and spanwise thickness taper. Its low-speed model-rocket discussion is not a universal transonic optimum, and section-shaping effects are not calculated here.</p></li>
    <li><a href="https://www.apogeerockets.com/Peak-of-Flight/Newsletter615" target="_blank" rel="noreferrer">John K. Bennett · Fin Flutter Analysis Revisited (Again), Peak of Flight #615</a><p>Publication background for the flutter correction. For numerical implementation, use the pinned December 2025 revision and v1.3 workbook below, which supersede earlier example/initial-condition errors. No automatic tip-to-tip modulus multiplier is adopted.</p></li>
  </ol>`,
  );
}

function methodsView() {
  return `<div class="view-intro"><span class="eyebrow">TRANSPARENT BY DESIGN</span><h2>Know what the number includes.</h2><p>A preliminary plate-flutter estimate, with separate tools for flow frequencies and assembly bookkeeping.</p></div>
    ${panel("Bennett / Martin relation", "SI internally: metres, pascals, kilograms and seconds.", `<div class="equation-block">S = (Cr + Ct) b / 2<br/>AR = b² / S &nbsp; · &nbsp; λ = Ct / Cr &nbsp; · &nbsp; τ = t / Cr<br/>Cx = (2 Ct m + Ct² + m Cr + Ct Cr + Cr²) / [3 (Ct + Cr)]<br/>ε = Cx / Cr − ¼ &nbsp; (or explicitly fixed at ¼)<br/>D = (24 ε γ p / π) · AR³ / [τ³ (AR + 2)] · (λ + 1) / 2<br/><strong>Vf = a √(G / D)</strong></div><p>The pressure p is local <b>static</b> pressure, not dynamic pressure q. Air temperature, pressure, density and sound speed use a tropospheric lapse-rate model to 11 km MSL. Local mode anchors that profile to measured station temperature and absolute pressure.</p><p>G ± the chosen percentage produces a sensitivity band. It is not a statistical confidence interval and does not capture model uncertainty.</p>`)}
${panel("Scope and decisions", "The calculation deliberately exposes these omissions.", `<ul class="readable-list"><li>Trapezoidal, uniform-thickness plate; the centroid correction assumes uniform areal density. Triangles use Ct = 0.</li><li>Section bevels, airfoils, spanwise taper and hybrid layups require separate stiffness/aerodynamic treatment.</li><li>Root flexibility, adhesive behavior, struts, slot-wall compliance and fastener slip are not represented by this flutter formula.</li><li>No automatic doubling of G for carbon skins or tip-to-tip reinforcement. A laminate-specific input requires evidence.</li><li>Strouhal matching is a forced-response screen, not a flutter model. Its plotted band is a user-selected tolerance, not a predicted lock-in region.</li><li>The default planform comes from the 2026-10-01 CAD screenshots; confirm the exposed boundary. Nominal 3/16-in thickness is retained, not optimized. Flight altitude, speed and G sensitivity remain illustrative. The historical V1 SD simulation omitted mass; neither it nor a 7,000-ft apogee fixes the max-speed altitude.</li><li>No universal pass/fail safety factor, rule compliance, launch approval, or strength certification is inferred.</li></ul>`)}
    ${panel("Sources & implementation", "Original equations implemented independently; no reference-site UI or source code copied.", `<ol class="sources"><li><a href="https://ntrs.nasa.gov/citations/19930085030" target="_blank" rel="noreferrer">Dennis J. Martin · NACA TN 4197 (1958)</a><p>Preliminary flutter criteria. The Bennett spreadsheet labels this 4917; NASA records the report as 4197.</p></li><li><a href="https://github.com/jkb-git/Fin-Flutter-Velocity-Calculator/tree/ef5e50aeb72df2f19b5b9b08d9269467c83af76c" target="_blank" rel="noreferrer">John K. Bennett · corrected calculator, December 2025</a><p>Pinned source for the centroid-aware formula. Regression tests use the v1.3 workbook example; small atmosphere-constant differences are documented.</p></li><li><a href="https://ntrs.nasa.gov/api/citations/20160011392/downloads/20160011392.pdf" target="_blank" rel="noreferrer">NASA TM-2016-219166 · vortex-induced vibration assessment</a><p>St = fL/U and comparison with structural frequencies. Its strut/hose correlations are not adopted as fin correlations.</p></li><li><a href="https://www.clintonaluminum.com/wp-content/uploads/2014/08/Grade-7075-Text-data.pdf" target="_blank" rel="noreferrer">7075 typical property data</a> · <a href="https://online.kaiseraluminum.com/depot/PublicProductInformation/Document/1017/Kaiser_Aluminum_7075_Sheet_Coil_and_Plate.pdf" target="_blank" rel="noreferrer">Kaiser 7075 density</a><p>7075 starting G = 26.9 GPa; density = 2,800 kg/m³. Presets are screening inputs, not guaranteed stock properties.</p></li><li><a href="https://www.rocketryforum.com/rocket-calculators/fin-flutter/" target="_blank" rel="noreferrer">Rocketry Forum calculator</a><p>Interaction reference, not the equation authority. The comparison checked on 2026-10-02 gave approximately √2 times the Bennett result at ε = 0.25 with matched inputs. See the repository methods notes; the external page may change.</p></li><li><a href="https://ntrs.nasa.gov/citations/19770009539" target="_blank" rel="noreferrer">U.S. Standard Atmosphere (1976)</a><p>Basis for the tropospheric atmosphere model; not launch-day weather measurements.</p></li><li><strong>Professor Govindjee · consultation guidance, as reported by the user</strong><p>The user reported that Professor Govindjee recommended investigating the Strouhal number. This motivated the separate vortex-frequency screen. Consultation date and original notes were not supplied; this is not a verified quotation, a source for the flutter equation, or an endorsement of the software or flight safety.</p></li><li><a href="https://github.com/andyliuduoduo/STAR-fin-flutter-calculator/blob/main/docs/CAD_BASELINE.md" target="_blank" rel="noreferrer">STAR project inputs · CAD baseline and discussion</a><p>Dimensions: user-supplied Onshape screenshots dated 2026-10-01. Material direction, slot/fillet/strut concepts and flight assumptions come from project discussion; they are not attributed to Professor Govindjee or treated as validated specifications.</p></li><li><a href="https://github.com/jkb-git/Fin-Flutter-Velocity-Calculator/blob/ef5e50aeb72df2f19b5b9b08d9269467c83af76c/Calculating_Fin_Flutter_Velocity_Bennett-12-25.pdf" target="_blank" rel="noreferrer">Bennett · accompanying article, December 2025 revision</a><p>Pages 1 and 6: flutter equation and the repeated factor-of-two error. See <a href="https://github.com/andyliuduoduo/STAR-fin-flutter-calculator/blob/main/docs/METHODS.md" target="_blank" rel="noreferrer">the source and attribution register</a> for the dated forum comparison and assumptions.</p></li></ol>`)}
    ${designReferences()}
  `;
}

// Keep correction controls available even when a calculation fails.
function recoveryControls() {
  const fields =
    tab === "vortex"
      ? [
          ["st", "Strouhal number · St"],
          ["length", "Characteristic length · L"],
          ["proximity", "Frequency proximity band", "%"],
          ["modalMass", "Effective modal mass"],
          ["modalStiffness", "Effective modal stiffness", "N/m"],
        ]
      : tab === "mounting"
        ? [
            ["density", "Fin density", "kg/m³"],
            ["finCount", "Fin count"],
            ["extraMass", "Additional total mass"],
            ["baseMass", "Baseline vehicle mass"],
            ["baseCG", "Baseline CG station"],
            ["assemblyX", "Assembly centroid station"],
            ["cp", "CP station"],
            ["bodyOD", "Body outside diameter"],
            ["normalCoefficient", "Normal-force coefficient · Cn"],
            ["loadArm", "Normal-force lever arm"],
          ]
        : [];
  return panel(
    "Correct your inputs",
    "Your values are retained. No stale results are shown.",
    `<div class="field-grid">${fields.map(([key, label, u]) => input(key, label, "", { unit: u, optional: DEFAULTS[key] === null })).join("")}</div>` +
      (tab === "vortex"
        ? textInput(
            "modeFrequencies",
            "Natural frequencies (Hz, comma-separated)",
          )
        : "") +
      (tab === "flutter"
        ? select("method", "Flutter relation", [
            ["bennett", "Bennett centroid correction"],
            ["martin", "Martin fixed ε = 0.25 · comparison"],
          ]) +
          (trajectory.length
            ? '<button class="quiet" data-action="clear-trajectory">Remove trajectory</button>'
            : "")
        : ""),
  );
}

let renderTimer,
  pointerDown = false,
  pendingRender = false;
function queueRender() {
  pendingRender = true;
  if (pointerDown) return;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 0);
}
document.addEventListener("pointerdown", () => {
  pointerDown = true;
});
for (const eventName of ["pointerup", "pointercancel"])
  document.addEventListener(eventName, () => {
    pointerDown = false;
    if (pendingRender) queueRender();
  });

function render() {
  clearTimeout(renderTimer);
  pendingRender = false;
  const active = document.activeElement;
  const focusId = active?.id;
  const focusButton = active?.dataset?.tab
    ? `[data-tab="${active.dataset.tab}"]`
    : active?.dataset?.unit
      ? `[data-unit="${active.dataset.unit}"]`
      : active?.dataset?.action
        ? `[data-action="${active.dataset.action}"]`
        : null;
  const disclosureStates = [
    ...document.querySelectorAll(".sidebar details"),
  ].map((d) => d.open);
  let content;
  try {
    content =
      tab === "flutter"
        ? flutterView(calculate(state))
        : tab === "vortex"
          ? vortexView()
          : tab === "mounting"
            ? mountingView()
            : methodsView();
  } catch (e) {
    content = `<section class="panel error" role="alert"><h2>Check the inputs</h2><p>${escape(e.message)}</p><p>Results are paused until the inputs are valid.</p></section>${recoveryControls()}`;
  }
  $("#app").innerHTML =
    `<header class="topbar"><a class="brand" href="#" aria-label="STAR Fin Lab home"><span class="brand-mark">${svgIcon("fin")}</span><strong>STAR</strong><span class="brand-divider"></span><span>Fin Lab</span></a><div class="topbar-right"><span class="local-indicator">● &nbsp; Local workspace</span><a href="https://github.com/andyliuduoduo/star-fin-flutter-calculator" target="_blank" rel="noreferrer">Repository ↗</a></div></header>
    <main class="workspace"><div class="page-heading"><div><div class="eyebrow">STRUCTURES / AEROELASTICITY</div><h1>Fin flutter, with context.</h1><p>Explore geometry. Track assumptions. Understand the margin.</p></div><div class="toolbar"><button class="button secondary" data-action="print">${svgIcon("print")} Print</button><button class="button primary" data-action="export">${svgIcon("download")} Export case</button></div></div>
    <div class="casebar"><div class="case-name"><span class="case-dot"></span><label for="name">Study</label><input id="name" data-key="name" type="text" value="${escape(state.name)}" aria-label="Study name"></div><div class="case-actions"><button class="text-button" data-action="save">${svgIcon("plus")} Save snapshot</button><select id="saved-case" aria-label="Load a saved snapshot"><option value="">Saved cases (${saved.length})</option>${saved.map((s, i) => `<option value="${i}">${escape(s.inputs?.name || "Untitled")}</option>`).join("")}</select><button class="text-button" data-action="import">Import</button><button class="text-button" data-action="reset">Reset</button><div class="unit-toggle" role="group" aria-label="Units"><button data-unit="si" class="${state.units === "si" ? "selected" : ""}">SI</button><button data-unit="imperial" class="${state.units === "imperial" ? "selected" : ""}">Imperial</button></div></div></div>
    ${notice ? `<div class="notice" role="status">${escape(notice)}<button data-action="dismiss" aria-label="Dismiss message">×</button></div>` : ""}
    <div class="app-grid">${sidebar()}<div class="analysis"><nav class="tabs" aria-label="Analysis views">${[
      ["flutter", "Flutter envelope"],
      ["vortex", "Vortex & modes"],
      ["mounting", "Mounting & mass"],
      ["methods", "Method & sources"],
    ]
      .map(
        ([id, title]) =>
          `<button data-tab="${id}" aria-current="${tab === id ? "page" : "false"}" class="${tab === id ? "active" : ""}">${title}</button>`,
      )
      .join(
        "",
      )}</nav><div id="results">${content}</div><footer class="analysis-footer">PRELIMINARY DESIGN STUDY <span>Fin Lab v1.0 · No flight certification inferred</span></footer></div></div></main>
    <input type="file" id="case-file" accept=".json,application/json" hidden><input type="file" id="trajectory-file" accept=".csv,text/csv" hidden>`;
  document.querySelectorAll(".sidebar details").forEach((d, i) => {
    if (disclosureStates[i] !== undefined) d.open = disclosureStates[i];
  });
  const target = focusId
    ? document.getElementById(focusId)
    : focusButton
      ? $(focusButton)
      : null;
  if (target && target.type !== "file") target.focus({ preventScroll: true });
}

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function caseData() {
  return {
    version: VERSION,
    exportedAt: new Date().toISOString(),
    inputs: { ...state },
    trajectory,
    trajectoryName,
    assumptions:
      "Preliminary screening only; see included input sources and app Method & sources.",
  };
}
function restore(raw) {
  const c = loadCase(raw);
  state = c.inputs;
  trajectory = c.trajectory;
  trajectoryName =
    typeof raw.trajectoryName === "string"
      ? raw.trajectoryName.slice(0, 200)
      : "";
}

$("#app").addEventListener("click", (event) => {
  const btn = event.target.closest("button");
  if (!btn) return;
  if (btn.dataset.tab) {
    tab = btn.dataset.tab;
    notice = "";
    render();
    return;
  }
  if (btn.dataset.unit) {
    state.units = btn.dataset.unit;
    render();
    return;
  }
  try {
    switch (btn.dataset.action) {
      case "export":
        loadCase(caseData());
        download(
          "star-fin-lab-case.json",
          JSON.stringify(caseData(), null, 2),
          "application/json",
        );
        notice =
          "Case exported with SI inputs, assumptions and trajectory data.";
        break;
      case "save":
        loadCase(caseData());
        const updatedSaved = [caseData(), ...saved].slice(0, 12);
        localStorage.setItem(STORE, JSON.stringify(updatedSaved));
        saved = updatedSaved;
        notice = "Snapshot saved in this browser.";
        break;
      case "import":
        $("#case-file").click();
        return;
      case "import-trajectory":
        $("#trajectory-file").click();
        return;
      case "reset":
        state = { ...DEFAULTS };
        trajectory = [];
        trajectoryName = "";
        notice =
          "Loaded current CAD baseline; flight point and material properties remain assumptions. Thickness optimization deferred.";
        break;
      case "clear-trajectory":
        trajectory = [];
        trajectoryName = "";
        break;
      case "dismiss":
        notice = "";
        break;
      case "template":
        download(
          "trajectory-template.csv",
          "# Illustrative template, not LE4 flight data. Replace every row. Speed must be air-relative.\ntime_s,altitude_agl_m,speed_m_s\n0,0,0\n1,30,60\n2,150,180\n3,400,300\n4,700,280\n",
          "text/csv",
        );
        return;
      case "export-trajectory": {
        const tr = evaluateTrajectory(state, trajectory);
        download(
          "evaluated-trajectory.csv",
          "time_s,altitude_agl_m,airspeed_m_s,flutter_m_s,lower_G_flutter_m_s,upper_G_flutter_m_s,margin_pct,lower_G_margin_pct,dynamic_pressure_Pa,mach\n" +
            tr.rows
              .map((r) =>
                [
                  r.time,
                  r.altitude,
                  r.speed,
                  r.flutter,
                  r.low,
                  r.high,
                  r.margin ?? "",
                  r.lowMargin ?? "",
                  r.q,
                  r.mach,
                ].join(","),
              )
              .join("\n"),
          "text/csv",
        );
        return;
      }
      case "print":
        window.print();
        return;
      default:
        return;
    }
  } catch (e) {
    notice = e.message;
  }
  render();
});

$("#app").addEventListener("change", async (event) => {
  const el = event.target;
  try {
    if (el.id === "case-file" || el.id === "trajectory-file") {
      const file = el.files?.[0];
      if (!file) return;
      if (file.size > 2e6) throw new Error("File must be smaller than 2 MB.");
      const text = await file.text();
      if (el.id === "case-file") {
        restore(JSON.parse(text));
        notice = "Case imported. Review the recorded assumptions.";
      } else {
        const rows = parseTrajectory(text);
        evaluateTrajectory(state, rows);
        trajectory = rows;
        trajectoryName = file.name;
        notice =
          "Trajectory imported. Confirm the speed column is air-relative, not ground or vertical speed.";
      }
    } else if (el.id === "saved-case") {
      if (el.value === "") return;
      restore(saved[Number(el.value)]);
      notice = "Saved snapshot loaded.";
    } else if (el.dataset.key) {
      const key = el.dataset.key;
      if (el.type === "number") {
        state[key] =
          el.value === "" ? null : Number(el.value) * unit(types[key])[1];
      } else state[key] = el.value;
      if (key === "material") {
        const presets = {
          al7075: [
            26.9e9,
            2800,
            "Typical 7075 screening value; verify stock, temper and supplier data",
          ],
          al6061: [
            26e9,
            2700,
            "Typical 6061 screening approximation; replace with supplier data",
          ],
          g10: [
            4.136854e9,
            1850,
            "Bennett 600,000 psi G screening value; density assumed; verify laminate orientation",
          ],
          hybrid: [
            null,
            1800,
            "G REQUIRED: laminate-specific data or tested effective stiffness; density assumed",
          ],
          custom: [
            null,
            1800,
            "G REQUIRED: document supplier / test source; density assumed",
          ],
        };
        [state.shear, state.density, state.materialBasis] =
          presets[state.material];
      }
      notice = "";
    } else return;
  } catch (e) {
    notice = `Could not apply input: ${e.message}`;
  }
  queueRender();
});
render();
