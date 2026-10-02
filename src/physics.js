// Independent SI implementation. See docs/METHODS.md for equations and sources.
export const VERSION = 1;
export const P0 = 101325;
const R = 287.05287,
  GAMMA = 1.4,
  LAPSE = 0.0065,
  GRAVITY = 9.80665;

export const DEFAULTS = Object.freeze({
  name: "STAR · aluminum study",
  units: "si",
  geometryBasis: "Illustrative dimensions; replace from CAD",
  root: 0.25,
  tip: 0.1,
  span: 0.1,
  sweep: 0.1,
  thickness: 0.0047625,
  material: "al7075",
  shear: 26.9e9,
  uncertainty: 20,
  density: 2800,
  materialBasis:
    "Typical 7075 screening value; verify stock, temper and supplier data",
  method: "bennett",
  profile: "uniform",
  mount: "slot",
  mountNotes:
    "Slot + epoxy fillets; root stiffness and internal support remain to be measured. Full-thickness load-transfer region.",
  launchAltitude: 609.6,
  altitude: 500,
  speed: 300,
  atmosphere: "standard",
  siteTemperature: 25,
  sitePressure: 94000,
  apogee: 2133.6,
  flightBasis:
    "Assumed study point. Mach 0.8–1.0 target; V1 SD plot omitted mass. Not a released trajectory.",
  st: 0.2,
  length: 0.0047625,
  stBasis:
    "Illustrative St only; select a geometry- and flow-matched correlation",
  modeFrequencies: "",
  modeBasis: "Not yet measured / supplied by FEA",
  proximity: 10,
  modalMass: null,
  modalStiffness: null,
  finCount: 4,
  extraMass: 0,
  baseMass: null,
  baseCG: null,
  assemblyX: null,
  cp: null,
  bodyOD: null,
  normalCoefficient: null,
  loadArm: null,
});

export function requireNumber(n, label, min = -Infinity, max = Infinity) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) {
    throw new Error(
      `${label} must be a finite number between ${min} and ${max}.`,
    );
  }
  return n;
}

export function atmosphereAt(c, altitude = c.altitude) {
  requireNumber(c.launchAltitude, "Launch elevation (m MSL)", -500, 11000);
  requireNumber(altitude, "Flight altitude (m AGL)", 0, 11500);
  const msl = c.launchAltitude + altitude;
  if (msl > 11000)
    throw new Error("This atmosphere model is limited to 11,000 m MSL.");
  let baseT = 288.15,
    baseP = P0,
    height = msl;
  if (c.atmosphere === "local") {
    requireNumber(c.siteTemperature, "Site temperature (°C)", -80, 60);
    requireNumber(
      c.sitePressure,
      "Station absolute pressure (Pa)",
      10000,
      120000,
    );
    baseT = c.siteTemperature + 273.15;
    baseP = c.sitePressure;
    height = altitude;
  }
  const temperature = baseT - LAPSE * height;
  if (temperature <= 0)
    throw new Error("Atmospheric temperature is outside this model.");
  const pressure = baseP * (temperature / baseT) ** (GRAVITY / (R * LAPSE));
  return {
    temperature,
    pressure,
    density: pressure / (R * temperature),
    soundSpeed: Math.sqrt(GAMMA * R * temperature),
    msl,
  };
}

export function geometry(c) {
  for (const key of ["root", "span", "thickness"])
    requireNumber(c[key], key, 1e-6, 10);
  requireNumber(c.tip, "Tip chord", 0, 10);
  requireNumber(c.sweep, "Sweep offset", -10, 10);
  if (c.thickness >= Math.min(c.root, c.span))
    throw new Error("Thickness must be smaller than root chord and span.");
  const { root: r, tip: t, span: b, sweep: m } = c;
  const area = ((r + t) * b) / 2;
  const centroidX = (2 * t * m + t * t + m * r + t * r + r * r) / (3 * (t + r));
  const epsilon = c.method === "martin" ? 0.25 : centroidX / r - 0.25;
  if (epsilon <= 0)
    throw new Error(
      "Centroid correction gives ε ≤ 0. This planform is outside the selected relation; change geometry or explicitly select fixed ε.",
    );
  return {
    area,
    centroidX,
    epsilon,
    aspect: (b * b) / area,
    taper: t / r,
    thicknessRatio: c.thickness / r,
  };
}

export function flutterAt(c, altitude = c.altitude, shear = c.shear) {
  requireNumber(shear, "Shear modulus (Pa)", 1e5, 1e12);
  const g = geometry(c),
    air = atmosphereAt(c, altitude);
  const denominator =
    (((((24 * g.epsilon * GAMMA * air.pressure) / Math.PI) * g.aspect ** 3) /
      (g.thicknessRatio ** 3 * (g.aspect + 2))) *
      (g.taper + 1)) /
    2;
  return {
    ...g,
    ...air,
    velocity: air.soundSpeed * Math.sqrt(shear / denominator),
  };
}

export function calculate(c) {
  requireNumber(c.speed, "Expected airspeed (m/s)", 0, 3000);
  requireNumber(c.apogee, "Target apogee (m AGL)", 0, 100000);
  requireNumber(c.uncertainty, "Modulus sensitivity (%)", 0, 90);
  const r = flutterAt(c);
  const fraction = c.uncertainty / 100;
  const low = r.velocity * Math.sqrt(1 - fraction),
    high = r.velocity * Math.sqrt(1 + fraction);
  return {
    ...r,
    low,
    high,
    mach: c.speed / r.soundSpeed,
    flutterMach: r.velocity / r.soundSpeed,
    margin: c.speed > 0 ? (r.velocity / c.speed - 1) * 100 : null,
    lowMargin: c.speed > 0 ? (low / c.speed - 1) * 100 : null,
    dynamicPressure: 0.5 * r.density * c.speed ** 2,
  };
}

export function evaluateTrajectory(c, rows) {
  const results = rows.map((row) => {
    const r = calculate({ ...c, altitude: row.altitude, speed: row.speed });
    return {
      ...row,
      flutter: r.velocity,
      low: r.low,
      high: r.high,
      margin: r.margin,
      lowMargin: r.lowMargin,
      q: r.dynamicPressure,
      mach: r.mach,
    };
  });
  const moving = results.filter((r) => r.margin !== null);
  return {
    rows: results,
    worst: moving.reduce(
      (a, b) => (!a || b.lowMargin < a.lowMargin ? b : a),
      null,
    ),
    maxQ: results.reduce((a, b) => (!a || b.q > a.q ? b : a), null),
  };
}

export function parseModes(text) {
  if (!text.trim()) return [];
  const parts = text.trim().split(/[,;\s]+/);
  if (parts.length > 12) throw new Error("Enter at most 12 modal frequencies.");
  return parts.map((s) =>
    requireNumber(Number(s), "Modal frequency (Hz)", 0.001, 1e7),
  );
}

export function vortex(c, maxSpeed = c.speed) {
  requireNumber(c.st, "Strouhal number (f-based)", 0.0001, 10);
  requireNumber(c.length, "Characteristic length (m)", 1e-6, 10);
  requireNumber(maxSpeed, "Sweep maximum speed (m/s)", 0, 3000);
  requireNumber(c.proximity, "Frequency proximity band (%)", 0, 50);
  const frequencies = parseModes(c.modeFrequencies);
  const f = (c.st * maxSpeed) / c.length;
  return {
    frequency: f,
    omega: 2 * Math.PI * f,
    modes: frequencies.map((fn) => {
      const crossing = (fn * c.length) / c.st;
      const bandLow = crossing * (1 - c.proximity / 100),
        bandHigh = crossing * (1 + c.proximity / 100);
      return {
        fn,
        omega: 2 * Math.PI * fn,
        crossing,
        bandLow,
        bandHigh,
        intersects: bandLow <= maxSpeed && bandHigh >= 0,
      };
    }),
  };
}

export function sdofFrequency(mass, stiffness) {
  if (mass == null || stiffness == null) return null;
  requireNumber(mass, "Effective modal mass (kg)", 1e-9, 1e9);
  requireNumber(stiffness, "Effective modal stiffness (N/m)", 1e-9, 1e15);
  return Math.sqrt(stiffness / mass) / (2 * Math.PI);
}

export function massAndLoads(c) {
  requireNumber(c.speed, "Expected airspeed (m/s)", 0, 3000);
  const g = geometry(c),
    air = atmosphereAt(c);
  const r = { ...g, dynamicPressure: 0.5 * air.density * c.speed ** 2 };
  requireNumber(c.density, "Fin density (kg/m³)", 1, 30000);
  requireNumber(c.finCount, "Fin count", 1, 16);
  if (!Number.isInteger(c.finCount))
    throw new Error("Fin count must be an integer.");
  requireNumber(c.extraMass, "Additional assembly mass (kg)", 0, 10000);
  const finMass = r.area * c.thickness * c.density;
  const assemblyMass = c.finCount * finMass + c.extraMass;
  let cg = null,
    stability = null,
    force = null,
    moment = null;
  if ([c.baseMass, c.baseCG, c.assemblyX].every((x) => x != null)) {
    requireNumber(c.baseMass, "Baseline mass (kg)", 1e-6, 1e9);
    requireNumber(c.baseCG, "Baseline CG (m)", 0, 1000);
    requireNumber(c.assemblyX, "Assembly centroid station (m)", 0, 1000);
    cg =
      (c.baseMass * c.baseCG + assemblyMass * c.assemblyX) /
      (c.baseMass + assemblyMass);
    if (c.cp != null && c.bodyOD != null) {
      requireNumber(c.cp, "CP station (m)", 0, 1000);
      requireNumber(c.bodyOD, "Body OD (m)", 1e-6, 100);
      stability = (c.cp - cg) / c.bodyOD;
    }
  }
  if (c.normalCoefficient != null) {
    requireNumber(c.normalCoefficient, "Normal force coefficient", -10, 10);
    force = r.dynamicPressure * r.area * c.normalCoefficient;
    if (c.loadArm != null) {
      requireNumber(c.loadArm, "Normal-force lever arm (m)", 0, 100);
      moment = force * c.loadArm;
    }
  }
  return { finMass, assemblyMass, cg, stability, force, moment };
}

const ALIASES = {
  time_s: "time",
  t_s: "time",
  "time(s)": "time",
  altitude_agl_m: "altitude",
  "altitude(m)": "altitude",
  speed_m_s: "speed",
  airspeed_m_s: "speed",
  "totalvelocity(m/s)": "speed",
  "velocity(m/s)": "speed",
};
export function parseTrajectory(csv) {
  if (csv.length > 2e6) throw new Error("CSV must be smaller than 2 MB.");
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  let header = null,
    rows = [];
  for (let line of lines) {
    const comment = line.startsWith("#");
    if (comment) line = line.replace(/^#+\s*/, "");
    const cells = line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
    if (!header) {
      const mapped = cells.map(
        (s) => ALIASES[s.toLowerCase().replace(/\s+/g, "")] || null,
      );
      if (["time", "altitude", "speed"].every((k) => mapped.includes(k))) {
        if (
          ["time", "altitude", "speed"].some(
            (k) => mapped.filter((x) => x === k).length > 1,
          )
        )
          throw new Error(
            "CSV has duplicate time, altitude, or speed columns.",
          );
        header = mapped;
        continue;
      }
      if (comment) continue;
      throw new Error(
        "CSV headers must include time_s, altitude_agl_m, speed_m_s (SI). Vertical velocity is not accepted as airspeed.",
      );
    }
    if (comment) continue;
    const row = Object.fromEntries(
      ["time", "altitude", "speed"].map((k) => {
        const value = cells[header.indexOf(k)];
        if (value === "" || value == null)
          throw new Error(`Missing ${k} in CSV row ${rows.length + 2}.`);
        return [
          k,
          requireNumber(
            Number(value),
            `CSV ${k}`,
            0,
            k === "speed" ? 3000 : 1e7,
          ),
        ];
      }),
    );
    if (rows.length && row.time <= rows.at(-1).time)
      throw new Error("CSV times must be strictly increasing.");
    rows.push(row);
    if (rows.length > 10000)
      throw new Error("Use at most 10,000 trajectory rows.");
  }
  if (!header || rows.length < 2)
    throw new Error(
      "CSV needs a recognized header and at least two data rows.",
    );
  return rows;
}

export function loadCase(raw) {
  if (
    !raw ||
    raw.version !== VERSION ||
    !raw.inputs ||
    typeof raw.inputs !== "object"
  )
    throw new Error("Expected a Fin Lab v1 case JSON.");
  const c = { ...DEFAULTS };
  for (const key of Object.keys(c)) {
    if (!(key in raw.inputs)) continue;
    const value = raw.inputs[key];
    if (DEFAULTS[key] === null) {
      if (
        value !== null &&
        (typeof value !== "number" || !Number.isFinite(value))
      )
        throw new Error(`Invalid ${key}.`);
    } else if (typeof value !== typeof DEFAULTS[key])
      throw new Error(`Invalid ${key}.`);
    if (typeof value === "string" && value.length > 4000)
      throw new Error(`${key} is too long.`);
    c[key] = value;
  }
  const enums = {
    units: ["si", "imperial"],
    method: ["bennett", "martin"],
    atmosphere: ["standard", "local"],
    material: ["al7075", "al6061", "g10", "hybrid", "custom"],
    profile: ["uniform", "bevel", "taper"],
    mount: ["slot", "strut", "clamp", "other"],
  };
  for (const [key, values] of Object.entries(enums))
    if (!values.includes(c[key])) throw new Error(`Unknown ${key}.`);
  calculate(c);
  vortex(c);
  massAndLoads(c);
  sdofFrequency(c.modalMass, c.modalStiffness);
  const trajectory = raw.trajectory || [];
  if (!Array.isArray(trajectory) || trajectory.length > 10000)
    throw new Error("Invalid trajectory.");
  trajectory.forEach((r, i) => {
    if (!r || typeof r !== "object") throw new Error("Invalid trajectory row.");
    requireNumber(r.time, "Trajectory time", 0, 1e7);
    requireNumber(r.altitude, "Trajectory altitude", 0, 11500);
    requireNumber(r.speed, "Trajectory speed", 0, 3000);
    if (i && r.time <= trajectory[i - 1].time)
      throw new Error("Trajectory times must increase.");
  });
  if (trajectory.length) evaluateTrajectory(c, trajectory);
  return { inputs: c, trajectory };
}
