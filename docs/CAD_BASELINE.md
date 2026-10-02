# Current fin CAD baseline — 2026-10-01

Status: **recorded geometry; thickness optimization deferred; not a flight release**.

Source: user-provided Onshape screenshots named `Screenshot 2026-10-01 at 21.42.14.png` (sketch), `21.42.24.png` (chamfer), and `21.42.35.png` (extrusion). Screenshots are not redistributed in this repository.

| Parameter | Imperial | SI | Evidence / status |
| --- | ---: | ---: | --- |
| Root chord, Cr | 20 in | 508 mm | Sketch dimension |
| Tip chord, Ct | 8 in | 203.2 mm | Sketch dimension |
| Semispan, b | 8 in | 203.2 mm | Sketch dimension; verify exposed span after installation |
| Tip trailing-edge setback from root trailing edge | 6 in | 152.4 mm | Sketch dimension |
| Leading-edge sweep offset, m | 6 in | 152.4 mm | Derived: 20 − 8 − 6 |
| Nominal plate thickness used by app | 0.1875 in (3/16) | 4.7625 mm | Prior design direction retained; not optimized |
| Displayed extrusion depth | 0.188 in | 4.7752 mm if literal | Screenshot display; exact expression not visible; symmetric checked |
| Chamfer offset | 0.1 in | 2.54 mm | Distance-and-angle operation shown |
| Chamfer angle | 30° | 30° | Face directions and residual edge thickness need CAD verification |

The displayed 0.188 in may be a rounded representation of 0.1875 in. Do not treat their difference as a confirmed design revision. Alloy/temper is not established by these screenshots: the app retains the prior 7075 study assumption and typical, unverified material properties.

## Sweep convention

`m` is the axial distance from the root leading edge to the tip leading edge, positive aft. It is not the sloping edge length, a span, or a sweep angle. Coordinates `(axial, span)` in inches are `(0,0), (20,0), (14,8), (6,8)`.

- Leading-edge angle relative to the spanwise direction: atan(6/8) ≈ 36.87°.
- Half-chord offset: 6 + 8/2 − 20/2 = 0 in; half-chord sweep = 0°.
- Sloping leading/trailing edge length: sqrt(6² + 8²) = 10 in.
- One-fin planform area: (20 + 8) × 8 / 2 = 112 in².
- Taper ratio: 0.4; one-fin aspect ratio b²/S: 4/7 ≈ 0.5714.

These geometric checks do not establish flutter safety. The existing plate model does not resolve bevels, epoxy fillets, struts, slot compliance, hardware, or laminate stiffness. The installed root/exposed boundary must be checked before interpreting any result. No new thickness search has been performed.

## Flight comparison caution

The separate calculator screenshot uses 7,000 ft as its evaluation altitude. This project's 7,000-ft value is an apogee target, not a verified altitude at maximum airspeed. Compare calculators only with matched speed/altitude, altitude datum, atmosphere, thickness, shear modulus and equation settings. A displayed margin is not a structural certification.

Existing saved snapshots are not overwritten. Use Reset to load this baseline, or enter the dimensions in an existing study and update its source notes.
