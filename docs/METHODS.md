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

Research-direction acknowledgment: **Professor Govindjee**, consultation guidance as reported by the user, recommended investigating the Strouhal number. Date and original consultation notes were not supplied. This is not a direct quotation or evidence that he selected St = 0.2, approved this implementation, or validated the fin design.

## 5. Verification

Node tests cover the pinned workbook fixture, the factor-of-sqrt(2) issue, atmosphere anchors, thickness/modulus scaling, geometry, sensitivity, frequency/radian conversion, crossing sweeps, CG, unit-normalized case import, CSV unit/header rejection and paired flight conditions. Additional regressions cover incomplete material studies, partial-case rejection, quoted CSV fields and partially supplied optional groups.

Chromium and WebKit browser tests cover conversions, material presets, missing composite data, independent modes/mass screens, local snapshots, JSON import/export, CSV round trips and errors, local atmosphere, zero speed, print invocation, keyboard focus, direct click-after-edit actions, unavailable storage, escaped input text, invalid-input recovery, and mobile overflow across all views. Printing tests verify invocation, not printer-specific pagination. Passing these checks verifies implementation consistency, not the physical sufficiency of the model, every browser version, or flight readiness.

## 6. Source and attribution register

| Source | Supports | Does not establish |
| --- | --- | --- |
| Martin, NACA TN 4197 (1958), linked above | Preliminary flutter-method background | Validation of this particular fin assembly |
| Bennett, December 2025 article and v1.3 workbook, pinned above | Implemented flutter relation, centroid correction and benchmark | Actual root stiffness, adhesive/laminate allowables or launch approval |
| U.S. Standard Atmosphere (1976), linked above | Standard tropospheric atmosphere | Site-specific weather |
| NASA TM-2016-219166, linked above | Strouhal/frequency-screening framework | A fin-specific St correlation |
| Professor Govindjee, user-reported consultation; date unspecified | Recommendation to investigate the Strouhal number | Authorship or endorsement of the flutter formula, numerical presets, app or safety conclusions |
| Material references in Section 4 | Typical/screening material inputs | Certified properties of purchased stock or a particular layup |
| User-provided Onshape screenshots, 2026-10-01; [CAD register](CAD_BASELINE.md) | Recorded planform and displayed edge/thickness settings | Installed exposed boundary, alloy confirmation or optimized thickness |
| STAR project discussion | Slot/fillet/strut concepts, material direction and flight assumptions | Professor's approval or released requirements |
| Rocketry Forum calculator | Interaction reference and numerical comparison | Authority overriding the pinned Bennett equation |
| Sathe et al. (2026), full reference below | Max-Q-based subsystem integration; fin planform/section trade studies | Transferable STAR dimensions or adoption of the paper's flutter coefficient |
| Li, Geiselhart & Robinson (2019), NASA NTRS 20200002364 | Higher-fidelity aircraft flutter-analysis background | A fin-specific Strouhal correlation or a solver implemented here |
| Van Milligan, Peak of Flight #442 (2017) | Planform, airfoil and thickness-taper design background | A universal transonic fin optimum |
| Bennett, Peak of Flight #615 | Original publication context for the flutter correction | Superseding the maintained, pinned revision or universal reinforcement factors |

### User-supplied design bibliography

1. **Ajinkya Shrikant Sathe, Ayyan Nikunj Bhartia, Surya Sridhar and Jayakrishnan Radhakrishnan.** “Subsystem-Level Aerodynamic Optimization with Max-Q-Based System Integration and Flight Testing of an Experimental Sounding Rocket.” *Aerospace Science and Technology* 178 (2026), 113242. [Author-uploaded full text](https://www.researchgate.net/publication/410793139_Subsystem-Level_Aerodynamic_Optimization_with_Max-Q-Based_System_Integration_and_Flight_Testing_of_an_Experimental_Sounding_Rocket); [DOI: 10.1016/j.ast.2026.113242](https://doi.org/10.1016/j.ast.2026.113242). Sections 2.1.1–2.1.3 support process-level consideration of max-Q and fin geometry/section trades. **Equation (2) displays the 2G/1.337 form; it is not the numerical authority for this app.** Do not transfer its optimized dimensions or assume max-Q is necessarily the minimum flutter-margin point for STAR. This app checks all imported trajectory samples and does not reproduce the paper's CFD, FSI or modal solvers.
2. **Rocketry Forum.** [Fin flutter velocity calculator](https://www.rocketryforum.com/rocket-calculators/fin-flutter/). Interaction reference and dated numerical comparison only; see the coefficient comparison below.
3. **Wu Li, Karl Geiselhart and Jay Robinson.** [*Flutter Prediction for Aircraft Conceptual Design*](https://ntrs.nasa.gov/api/citations/20200002364/downloads/20200002364.pdf). AIAA Aerospace Sciences Meeting, 2019; [NASA NTRS 20200002364 metadata](https://ntrs.nasa.gov/citations/20200002364). Describes ConceptFEA and p-k-based flutter prediction for aircraft concepts. This is higher-fidelity methodology background, not the source of St = 0.2 or a direct rocket-fin validation. The report ID includes 2020, but NASA lists the publication date as January 7, 2019.
4. **Tim Van Milligan.** [“What is the best fin shape for a model rocket?”](https://apogeerockets.com/education/downloads/Newsletter442.pdf), *Peak of Flight* #442, May 2, 2017. Reference for planform versus airfoil-section and spanwise-thickness effects, particularly the airfoil/taper discussion on the printed pages 6–7. Low-speed model-rocket results are not a universal transonic optimum. The app records section treatment but does not solve its aerodynamic or stiffness effects.
5. **John K. Bennett.** [“Fin Flutter Analysis Revisited (Again)”](https://www.apogeerockets.com/Peak-of-Flight/Newsletter615), *Peak of Flight* #615. Historical publication of the correction and geometry/atmosphere discussion. The implementation is pinned to the maintained December 2025 article and v1.3 workbook instead of the original webpage's worked example. The app does not automatically adopt the article's tip-to-tip G multiplier.

Checked 2026-10-02. Original PDFs and private consultation notes are not redistributed in this repository. These references inform a preliminary design study, not a certification.

### Forum comparison checked 2026-10-02

The [forum page](https://www.rocketryforum.com/rocket-calculators/fin-flutter/) displayed `Vf = a sqrt[2 G tau³ (AR+2) / (1.337 AR³ (lambda+1) p)]`. For epsilon = 0.25, the Bennett relation simplifies to the same expression **without the extra numerator factor 2** (up to rounding 1.337). The author's [December 2025 article](https://github.com/jkb-git/Fin-Flutter-Velocity-Calculator/blob/ef5e50aeb72df2f19b5b9b08d9269467c83af76c/Calculating_Fin_Flutter_Velocity_Bennett-12-25.pdf), pp. 1 and 6, explains the repeated factor-of-two error.

Matched example: root 20 in, tip 8 in, semispan 8 in, sweep 6 in, thickness 0.188 in, G = 3.77 Msi, standard atmosphere at 7,000 ft MSL. Fin Lab gives 1,553.2 ft/s; evaluating the displayed forum equation gives 2,196.4 ft/s, matching the user's forum screenshot. This dated comparison does not assume the external page remains unchanged. Neither value is a certification of structural safety.
