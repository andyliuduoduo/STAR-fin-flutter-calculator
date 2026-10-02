import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS as D,
  atmosphereAt,
  geometry,
  flutterAt,
  calculate,
  vortex,
  sdofFrequency,
  massAndLoads,
  parseTrajectory,
  evaluateTrajectory,
  loadCase,
} from "../src/physics.js";

function near(actual, expected, rel = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * rel,
    `${actual} ≠ ${expected}`,
  );
}

test("standard atmosphere reproduces sea-level and 11-km reference values", () => {
  const sea = atmosphereAt({ ...D, launchAltitude: 0 }, 0);
  near(sea.pressure, 101325);
  near(sea.temperature, 288.15);
  near(sea.density, 1.225, 1e-5);
  near(sea.soundSpeed, 340.294, 1e-5);
  const high = atmosphereAt({ ...D, launchAltitude: 0 }, 11000);
  near(high.temperature, 216.65);
  near(high.pressure, 22632.04, 1e-5);
  assert.throws(
    () => atmosphereAt({ ...D, launchAltitude: 1000 }, 11000),
    /11,000/,
  );
});
test("local atmosphere preserves station T and absolute pressure at launch", () => {
  const a = atmosphereAt(
    { ...D, atmosphere: "local", siteTemperature: 30, sitePressure: 93000 },
    0,
  );
  near(a.temperature, 303.15);
  near(a.pressure, 93000);
});
test("Bennett v1.3 local-atmosphere fixture matches within 0.1 percent", () => {
  // Workbook pinned ef5e50... E66 = 2087.5807058708865 ft/s.
  // Different sound-speed/lapse constants account for the <0.014% difference.
  const r = calculate({
    ...D,
    root: 7.5 * 0.0254,
    tip: 2.5 * 0.0254,
    span: 3 * 0.0254,
    sweep: 4.285 * 0.0254,
    thickness: 0.1875 * 0.0254,
    shear: 600000 * 6894.757293168,
    speed: 1500 * 0.3048,
    launchAltitude: 4500 * 0.3048,
    altitude: 2200 * 0.3048,
    atmosphere: "local",
    siteTemperature: 35,
    sitePressure: 14.73462 * 6894.757293168,
  });
  near(r.velocity, 2087.5807058708865 * 0.3048, 0.001);
  near(r.epsilon, 0.34916666666666674);
  near(r.centroidX, 4.49375 * 0.0254);
  near(r.aspect, 0.6);
});
test("uncorrected sqrt(2) velocity is not reproduced", () => {
  const c = { ...D, method: "martin" },
    r = calculate(c),
    g = geometry(c),
    air = atmosphereAt(c);
  // Original 39.3 psi denominator (rounded by Martin) with epsilon = 1/4.
  const term =
    ((39.3 * 6894.757293168 * g.aspect ** 3) /
      (g.thicknessRatio ** 3 * (g.aspect + 2))) *
    ((g.taper + 1) / 2) *
    (air.pressure / 101325);
  near(r.velocity, air.soundSpeed * Math.sqrt(c.shear / term), 0.0002);
});
test("flutter scaling follows sqrt(G) and t^(3/2)", () => {
  const v = flutterAt(D).velocity;
  near(flutterAt({ ...D, shear: D.shear * 4 }).velocity, v * 2);
  near(flutterAt({ ...D, thickness: D.thickness * 2 }).velocity, v * 2 ** 1.5);
});
test("geometry is exposed trapezoid; triangular tips are accepted", () => {
  near(geometry(D).area, 0.0175);
  near(geometry({ ...D, tip: 0 }).area, 0.0125);
  assert.throws(() => geometry({ ...D, sweep: -2 }), /ε/);
  assert.throws(() => geometry({ ...D, span: 0 }), /span/);
});
test("mount and profile labels do not silently change stiffness", () => {
  near(
    calculate({ ...D, mount: "clamp", profile: "bevel" }).velocity,
    calculate(D).velocity,
  );
  near(
    calculate({ ...D, material: "hybrid", mount: "strut" }).velocity,
    calculate(D).velocity,
  );
});
test("modulus sensitivity is symmetric in G, not in velocity; speed zero has no margin", () => {
  const r = calculate({ ...D, uncertainty: 20, speed: 0 });
  near(r.low, r.velocity * Math.sqrt(0.8));
  near(r.high, r.velocity * Math.sqrt(1.2));
  assert.equal(r.margin, null);
});
test("invalid required numerical input cannot produce plausible results", () => {
  for (const patch of [
    { speed: -1 },
    { shear: null },
    { shear: NaN },
    { thickness: 0 },
    { uncertainty: 100 },
    { apogee: null },
    { altitude: -1 },
  ])
    assert.throws(() => calculate({ ...D, ...patch }));
});
test("Strouhal frequencies, radians and crossing-speed sweep use consistent units", () => {
  const v = vortex({
    ...D,
    st: 0.2,
    length: 0.01,
    speed: 100,
    modeFrequencies: "100, 3000",
    proximity: 10,
  });
  near(v.frequency, 2000);
  near(v.omega, 4000 * Math.PI);
  near(v.modes[0].crossing, 5);
  assert.equal(v.modes[0].intersects, true);
  assert.equal(v.modes[1].intersects, false);
  assert.throws(() => vortex({ ...D, length: 0 }));
  assert.throws(() => vortex({ ...D, modeFrequencies: "foo" }));
  assert.equal(vortex({ ...D, modeFrequencies: "" }).modes.length, 0);
});
test("effective modal quantities do not infer stiffness from mass alone", () => {
  near(sdofFrequency(2, 800), 20 / (2 * Math.PI));
  assert.equal(sdofFrequency(null, 800), null);
  assert.throws(() => sdofFrequency(-1, 800));
});
test("assembly mass and aft CG include hardware without double counting baseline", () => {
  const m = massAndLoads({
    ...D,
    density: 2800,
    extraMass: 0.2,
    baseMass: 10,
    baseCG: 1,
    assemblyX: 2,
    cp: 1.5,
    bodyOD: 0.1,
    normalCoefficient: 0.5,
    loadArm: 0.05,
  });
  near(m.finMass, 0.0175 * 0.0047625 * 2800);
  near(m.assemblyMass, 4 * m.finMass + 0.2);
  near(m.cg, (10 + 2 * m.assemblyMass) / (10 + m.assemblyMass));
  near(m.stability, (1.5 - m.cg) / 0.1);
  near(m.moment, m.force * 0.05);
  assert.ok(m.cg > 1);
  assert.throws(() => massAndLoads({ ...D, finCount: 3.5 }));
  assert.ok(
    massAndLoads({ ...D, shear: null }).finMass > 0,
    "mass is independent of unknown G",
  );
});
test("trajectory parser handles SI template and OpenRocket-style comment headers", () => {
  const csv = "# example\ntime_s,altitude_agl_m,speed_m_s\n0,0,0\n1,100,200\n";
  assert.deepEqual(parseTrajectory(csv), [
    { time: 0, altitude: 0, speed: 0 },
    { time: 1, altitude: 100, speed: 200 },
  ]);
  const ork =
    "# Simulation 1\n# Time (s),Altitude (m),Total velocity (m/s),\n0,0,0,\n1,100,200,\n";
  assert.deepEqual(parseTrajectory(ork), parseTrajectory(csv));
});
test("trajectory parser rejects incompatible units, vertical speed, gaps and nonmonotonic times", () => {
  const bad = [
    "time_s,altitude_agl_m,vertical_velocity_m_s\n0,0,0\n1,1,1",
    "time_s,altitude_agl_ft,speed_m_s\n0,0,0\n1,1,1",
    "time_s,altitude_agl_m,speed_m_s\n0,0,0\n1,1,",
    "time_s,altitude_agl_m,speed_m_s\n1,0,0\n1,1,1",
  ];
  bad.forEach((csv) => assert.throws(() => parseTrajectory(csv)));
});
test("trajectory evaluates paired altitude/speed and minimum margin across all samples", () => {
  const rows = [
    { time: 0, altitude: 0, speed: 0 },
    { time: 1, altitude: 100, speed: 300 },
    { time: 2, altitude: 2000, speed: 300 },
  ];
  const t = evaluateTrajectory(D, rows);
  assert.equal(t.worst.time, 1);
  assert.equal(t.maxQ.time, 1);
  assert.equal(t.rows[0].margin, null);
  near(
    t.rows[1].flutter,
    calculate({ ...D, altitude: 100, speed: 300 }).velocity,
  );
});
test("case round trips preserve canonical SI and validate imported enums and trajectory", () => {
  const c = loadCase({
    version: 1,
    inputs: { ...D, units: "imperial" },
    trajectory: [],
  });
  assert.equal(c.inputs.root, 0.25);
  assert.throws(() => loadCase({ version: 2, inputs: D }));
  assert.throws(() =>
    loadCase({ version: 1, inputs: { ...D, units: "meters" } }),
  );
  assert.throws(() =>
    loadCase({ version: 1, inputs: { ...D, shear: "26.9" } }),
  );
  assert.throws(() =>
    loadCase({
      version: 1,
      inputs: D,
      trajectory: [
        { time: 2, altitude: 0, speed: 0 },
        { time: 1, altitude: 0, speed: 1 },
      ],
    }),
  );
});
