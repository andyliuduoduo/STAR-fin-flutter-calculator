# Calculation methods

## 1. Plate-flutter screening

Notation: root chord `r`, tip chord `c`, exposed semispan `b`, axial leading-edge sweep offset `m`, uniform thickness `t`, shear modulus `G`. Internally every value is SI.

```
S = (r + c) b / 2
AR = b² / S
lambda = c / r
tau = t / r
Cx = (2 c m + c² + m r + c r + r²) / [3 (c + r)]
epsilon = Cx / r - 0.25
D = (24 epsilon gamma p / pi) AR³ / [tau³ (AR + 2)] (lambda + 1) / 2
Vf = a sqrt(G / D)
```

`p` is local **static pressure** in Pa; `gamma=1.4`. This is the algebraic form of the pinned Bennett workbook with its sea-level pressure terms canceled. It does not add the extra factor of two present in older overpredicting forms. The alternative fixed-epsilon selection sets `epsilon=0.25` explicitly. Epsilon <= 0 is rejected for the centroid-corrected relation. No claim is made that all planforms with positive epsilon are validated.

Area centroid represents mass centroid only for uniform areal density. Swept geometry uses the source's preliminary correction, not an aeroelastic solution. Airfoil/thickness taper does not alter the result: the UI calls out that it remains a uniform-plate surrogate.

Sources:

- [Martin, NACA TN 4197 (1958)](https://ntrs.nasa.gov/citations/19930085030). NASA's report number is 4197; Bennett's document/workbook uses the transposed number 4917.
- [Bennett calculator, commit ef5e50aeb72df2f19b5b9b08d9269467c83af76c](https://github.com/jkb-git/Fin-Flutter-Velocity-Calculator/tree/ef5e50aeb72df2f19b5b9b08d9269467c83af76c), `Fin Flutter Boundary Calculator-V1-3.xlsx`, December 2025.

### Independent benchmark

The workbook's saved Imperial/LST example uses r=7.5 in, c=2.5 in, b=3 in, m=4.285 in, t=0.1875 in, G=600000 psi, no T2T multiplier, speed=1500 ft/s, AGL=2200 ft, launch elevation=4500 ft, launch T=95 °F, station pressure=14.73462 psi. Cell E66 is **2087.5807058708865 ft/s** and E71 is **39.1720470580591%**. Fin Lab uses physical SI atmosphere constants and yields approximately **2087.30846 ft/s**, **39.15390%**. Regression tolerance is 0.1%; actual difference is about 0.013%.

The reference forum page is an interaction example, not the regression oracle. No unsafe legacy multiplier is introduced to force agreement with another website.

## 2. Atmosphere and flight path

Standard atmosphere: T0=288.15 K, p0=101325 Pa, lapse=0.0065 K/m, R=287.05287 J/(kg K), g=9.80665 m/s². Standard height is launch MSL + flight AGL. Local mode anchors T0 and p0 at the launch site and uses flight AGL. Both use:

```
T = T0 - lapse * h
p = p0 * (T/T0)^(g/(R*lapse))
rho = p/(R*T)
a = sqrt(gamma*R*T)
q = rho*U²/2
```

The upper model limit is 11 km MSL. Sources: [US Standard Atmosphere, 1976](https://ntrs.nasa.gov/citations/19770009539), [NASA sound speed](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/speed-of-sound/).

Point margin = `100*(Vf/U - 1)`; undefined at zero speed. G sensitivity ±u gives Vf bounds through `sqrt(1±u)`, with geometry and atmosphere fixed. Imported trajectories calculate these values at every row and find the minimum sampled lower-G margin and maximum sampled q. No interpolation, extrapolation, mass correction or trajectory simulation is performed. The altitude chart's constant-speed line is clearly not a flight path.

## 3. Strouhal and modes

```
St = f_s * L / U
f_s = St * U / L
omega_s = 2*pi*f_s
U_cross = f_n*L/St
```

A user-selected ±frequency proximity tolerance is plotted around each mode. It is not a predicted lock-in band or an acceptance margin. The sweep covers zero through the larger of the point airspeed and imported peak airspeed. Default St=0.2 and L=4.7625 mm are **illustrative placeholders**, not fin-correlated values. Select L from the same definition as the chosen correlation and address Reynolds/Mach/geometry dependencies externally.

Manual modes should come from assembly FEA or testing, including mounting compliance. An optional single-degree-of-freedom estimate `sqrt(k_eff/m_eff)/(2*pi)` only operates on supplied, consistently normalized effective modal quantities; no modal mass or stiffness is derived from the plate geometry.

Source: [NASA TM-2016-219166](https://ntrs.nasa.gov/api/citations/20160011392/downloads/20160011392.pdf), vortex-induced vibration assessment. The report's strut/hose values are not used as fin correlations.

## 4. Mounting, loads and mass

Uniform exposed fin mass is `S*t*density`. Assembly mass = `finCount*finMass + additionalMass`. Additional mass includes any tabs, glue, extra reinforcement and supports not already in the plate density/thickness. Profile shaping is not deducted. Composite material properties are user inputs; the app does not perform classical laminate theory or infer stiffness from constituent fibers.

For baseline mass M and centroid x that **exclude** the added assembly, combined CG is `(M*x + assemblyMass*assemblyX)/(M+assemblyMass)`. Stations are positive aft from a common datum. Static margin uses externally supplied CP: `(CP-CG)/OD`; neither CP nor vehicle stability is solved.

Optional per-fin normal load uses `F=q*S*Cn`, with Cn referenced to the modeled exposed planform, and root moment uses `M=F*leverArm` about the specified bending axis. No torsional load, peel stress, adhesive allowables, frame stiffness, buckling or strength calculation is performed.

Material starting points:

- 7075: G=26.9 GPa typical; [property sheet](https://www.clintonaluminum.com/wp-content/uploads/2014/08/Grade-7075-Text-data.pdf). Density=2800 kg/m³ from [Kaiser 7075 data](https://online.kaiseraluminum.com/depot/PublicProductInformation/Document/1017/Kaiser_Aluminum_7075_Sheet_Coil_and_Plate.pdf). These are not guaranteed stock properties.
- 6061: G=26 GPa, density=2700 kg/m³, approximate screening assumptions. Replace with supplier data.
- G10: G=600000 psi converted to SI from Bennett's suggested screening value; density=1850 kg/m³ is an assumption. Neither represents every weave/orientation.
- Hybrid/custom: G starts blank; density starts at an explicitly assumed 1800 kg/m³. Requires user characterization.

## 5. Verification

Node tests cover the pinned workbook fixture, the factor-of-sqrt(2) issue, atmosphere anchors, thickness/modulus scaling, geometry, sensitivity, frequency/radian conversion, crossing sweeps, CG, unit-normalized case import, CSV unit/header rejection and paired flight conditions. Additional regressions cover incomplete material studies, partial-case rejection, quoted CSV fields and partially supplied optional groups.

Chromium and WebKit browser tests cover conversions, material presets, missing composite data, independent modes/mass screens, local snapshots, JSON import/export, CSV round trips and errors, local atmosphere, zero speed, print invocation, keyboard focus, direct click-after-edit actions, unavailable storage, escaped input text, invalid-input recovery, and mobile overflow across all views. Printing tests verify invocation, not printer-specific pagination. Passing these checks verifies implementation consistency, not the physical sufficiency of the model, every browser version, or flight readiness.
