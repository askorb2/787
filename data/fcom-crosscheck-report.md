# FCOM Cross-Check Report

Every question in `data/questions.json` (213 total) was checked against the real Boeing 787 FCOM
(`B787_FCOM_R24_20261113.pdf`, revision R24) placed in the project root. For each question, the
cited `ref` was located in the real FCOM (searching past the citation by keyword when revision
numbering had drifted), the real text was compared option-by-option against the quiz's four
options and marked answer, and a verdict was assigned.

This report is identify-only, per instruction — no entries in `data/questions.json` were changed
as part of this review. Two answer-key errors were already found and fixed earlier in the same
session (before this exhaustive pass began): **p283** (ans 2→1) and **p312**/**p313** (ans 1→2,
2→3), all re-confirmed independently during this pass. They are not counted below as new findings.

## Summary

| Verdict | Count | Meaning |
|---|---|---|
| OK | 196 | Matches the real FCOM text; marked answer confirmed correct |
| SUSPICIOUS | 4 | A real quality issue found (not necessarily a wrong marked answer) |
| AMBIGUOUS | 7 | FCOM text is unclear, effectivity-dependent, or drifted since the quiz was written |
| UNVERIFIABLE | 2 | The specific fact could not be located in this FCOM revision at all |
| **Total** | **213** | |

(Already-fixed this session, re-confirmed OK: p283, p284, p312, p313 — included in the 196 OK.)

---

## SUSPICIOUS (4)

### p324 — [13-12] HYDRAULIC
**Q:** Hydraulic system에 대한 설명 중 틀린 것은?
- 0. The airplane has two independent 5000psi hydraulic systems.
- 1. Flight control system components are distributed so that any one hydraulic system can provide adequate airplane controllability.
- 2. Hydraulic fluid is supplied to each hydraulic pump from the associated system reservoir.
- 3. The reservoirs are pressurized by pump inlet pressure. **← marked answer**

**FCOM 13.20.1 (verbatim):** "The airplane has **three** independent 5000 psi hydraulic systems:
left, right, and center... The reservoirs are pressurized by pump **outlet** pressure."

**Issue:** The marked answer (option 3, "inlet" pressure) is correctly false — real text says
"outlet". But option 0 ("two independent 5000psi hydraulic systems") is *also* false — the real
count is three, not two. This question is a variant of sibling p323 (which has "two...3000psi" as
its own marked-wrong answer); when the variant was created, the psi figure in option 0 was
corrected to 5000 but the count "two" was never fixed to "three," while a new error ("inlet") was
introduced in option 3 as the intended answer. The officially marked answer is still correct, just
not uniquely so — a careful test-taker could defensibly pick option 0 instead.

### p374 — [14-12] FLIGHT CONTROL
**Q:** The spoilers automatically retract and the speedbrake lever is driven forward to the DOWN position이 되는 조건이 아닌 것은?
- 0. On the ground, when either thrust lever is moved to the takeoff range
- 1. On the ground, if there is a transition to in the air
- 2. On the ground and both thrust reverse levers are moved to the reverse idle detent **← marked answer**
- 3. In the air, when either thrust lever is beyond 90% full travel

**FCOM 9.20.23 (verbatim):** Retract conditions are "on the ground, when either thrust lever is
moved to the takeoff range, or on the ground, if there is a transition to in the air, or in the
air, when either thrust lever is **approximately 70%** of full travel." The "both thrust reverse
levers moved to reverse idle detent" condition is actually one of the automatic-*extend*
conditions, not retract.

**Issue:** The marked answer (option 2) is correctly identified as not a retract condition. But
option 3 ("beyond 90% full travel") also doesn't match the real retract condition ("approximately
70%") — it's a second option that fails to describe the real fact accurately, sitting unmarked
alongside the one that is marked. Same pattern as p324.

### p396 — [8-4] AVIONICS COMMUNICATIONS
**Q:** Cockpit Voice Recorder TEST Switch를 Push and hold for **two** seconds (on the ground and engines off) 하면 나타나는 내용 중 잘못된 것은?
- 0. Tests area microphone CVR channel
- 1. A test tone is heard from flight deck speakers
- 2. Erases voice recorder. **← marked answer**
- 3. An EICAS status message is displayed if test fails

**FCOM 5.10.26 (verbatim):** "Cockpit Voice Recorder **TEST** Switch: Push and hold for **three**
seconds (on the ground and engines off) – tests area microphone CVR channel... Cockpit Voice
Recorder **ERASE** Switch: Push and hold for **two** seconds (on the ground and engines off) –
erases voice recorder."

**Issue:** This is a stem error, not an answer-key error. "Two seconds" is the real duration for
the ERASE switch, not the TEST switch (confirmed by sibling question p398, which correctly
attributes "two seconds" to ERASE). The question stem mislabels the TEST switch's duration as two
seconds when it's actually three. The marked answer itself is still substantively correct — the
TEST switch doesn't erase the recorder regardless of how long it's held — but the premise stated
in the question is factually wrong.

### p173 — [14-8] MASTER WARNING
**Q:** GPWS 에 대한 설명 중 맞는 것은?
- 0. GPWS는 독립된 Computer가 있어 신뢰성을 증가하였다
- 1. 이륙 중이거나 Go-Around 시 Flaps and/or gear up 상태에서 고도가 감소하면 EICAS 에 DON'T SINK message와 DON'T SINK, DON'T SINK aural alert가 발생한다 **← marked answer**
- 2. HUD에는 GPWS warning이 시현 되지 않는다
- 3. GPWS warning이 발생하면 AURAL CANCEL Switch를 사용하여 Aural alert들을 취소하고 비행에만 집중해야 한다

**Finding:** Searched the entire FCOM R24 text for "DON'T SINK" (and spacing/apostrophe variants)
— zero hits anywhere in the manual. The real GPWS alert table (FCOM 15.20.29–30) lists PULL UP,
SINK RATE, TERRAIN, TOO LOW FLAPS, TOO LOW GEAR, OBSTACLE — no "DON'T SINK" alert exists in this
FCOM revision at all. This is a classic GPWS Mode 3 alert name used on many other Boeing types,
but it doesn't appear in the 787 FCOM R24.

**Why only suspicious, not a confirmed error:** the other three options are confirmed false
independently (GPWS does not have an independent dedicated computer per the FCOM's architecture
description; GPWS warnings ARE shown on the HUD per 15.20.29-30's own alert tables; canceling GPWS
alerts to "focus on flying" directly contradicts documented crew procedure), so option 1 is still
the best of the four by elimination. But the alert name itself is not verifiable against this
manual revision — it may have existed in an older FCOM revision this quiz was written against, or
it may be an error carried over from another aircraft type's GPWS documentation.

---

## AMBIGUOUS (7)

### p41 — [14-3] FIRE PROTECTION — effectivity-dependent
**Q:** Forward cargo compartment의 Smoke detector 개수 → marked answer: **18개**

FCOM 8.20.5 shows this varies by tail-number effectivity: HL7206–HL8393 register 18 detectors;
HL8515–HL8736 register 22 detectors. The quiz's answer (18) matches only the first sub-fleet. Not
necessarily wrong for the operator's actual fleet, but it's a fact that isn't universally "18" for
every 787 registered to the quiz's airline.

### p49 — [14-7] FIRE PROTECTION — effectivity-dependent
**Q:** Cargo compartment Fire extinguisher bottle 개수 → marked answer: **6개**

Similar split: HL8515–HL8538 register 5 bottles; HL7206–HL8393 and HL8570–HL8736 register 6
bottles. The majority of registered ranges match "6", so likely fine, but worth the same caveat as
p41.

### p98 — [8-2] FLIGHT MANAGEMENT — revision drift
**Q:** CDU help window "NAV DATA OUT OF DATE" message meaning

Searched FCOM R24 for this exact message string and for "OUT OF DATE" alone — zero hits anywhere
in the current manual. This CDU help message does not appear to exist in FCOM R24; it was likely
renamed or removed in a revision after this quiz question was written. The quiz's own bundled
explanation independently cites "FCOM 11.60.10" with matching content, so the quiz is internally
self-consistent — it just can't be checked against this particular revision.

### p138 — [14-12] GENERAL, EMERGENCY EQUIPMENT — minor precision mismatch
**Q:** 지상 선회 시 장애물로부터의 거리 → marked answer: **4.5 meters**

FCOM 1.10.4 states the figure as "15 feet (**4.6 m**)" — the FCOM's own metric conversion is 4.6m,
not 4.5m. A 0.1m rounding discrepancy. Still clearly the closest of the four offered values (4.5,
4.7, 4.9, 5.1) to the real figure, so this doesn't look like a polarity/logic error — just an
imprecise conversion, possibly from rounding 15 feet differently (15 ft = 4.572m, which rounds to
4.6, not 4.5).

### p163 — [14-3] MASTER WARNING — not found in FCOM
**Q:** Evacuation horn cutoff 방법 → marked answer: **Master WARNING/CAUTION Reset Switch**

Found the real Emergency Evacuation Signal System section (FCOM 1.45.1), which describes the EVAC
COMMAND switch and says turning it to OFF stops the evacuation signal — a different mechanism than
any of the four quiz options. Could not find any FCOM section that directly confirms or denies the
claim that the Master WARNING/CAUTION Reset Switch cuts off the evacuation horn specifically. This
procedure may be documented in a non-normal/supplementary procedures chapter not covered by this
FCOM-description-focused review.

### p195 — [14-3] POWER PLANT, APU — possible revision drift
**Q:** GEnx-1B74/75 engine takeoff thrust → marked answer: **74,100 pounds**

FCOM 7.20.1 states: "The engines are rated at **74,500** pounds of takeoff thrust each" (noted as
Boeing Equivalent Thrust/BET). The quiz says 74,100. Could be genuine revision drift in the BET
rating figure across FCOM revisions, or an original quiz error — cannot determine which without
the FCOM revision the quiz was actually written against.

### p216 — [14-12] POWER PLANT, APU — FCOM text itself is internally ambiguous
**Q:** EEC alternate mode에서 작동 하지 않는 것은? → marked answer: **Over speed protection**

FCOM 7.20.5/7.20.6 contains two statements that pull in different directions: "N1 and N2 red line
protection **is still available** in the alternate control mode" (suggesting overspeed protection
*does* work), vs. a separate statement that "Thrust protection is **not** provided in the
alternate mode" (allowing overboost). The quiz's answer may be conflating "thrust/overboost
protection" with "overspeed (redline) protection" — the FCOM names these as two distinct things
that resolve oppositely for alternate-mode availability. The ambiguity originates in the FCOM's
own wording, not obviously in the quiz.

---

## UNVERIFIABLE (2)

- **p380** — [5-1] OXYGEN: passenger cabin oxygen mask auto-drop altitude criteria ("13,500/14,500/
  14,000 ft, or origin/destination airfield altitude ± X ft"). Despite extensive searching
  (exact figures, "PSU," "masks automatically," "origin/destination airfield"), this specific
  criterion does not appear anywhere in the FCOM R24 text. The cited ref (1.40.18) resolves to an
  unrelated Flight Deck Door Access section. Cannot confirm or refute the marked answer.

- **p426-1** — [NEW] Cockpit-Seat-to-Nose-Gear distance (2.6m), one of two figures asked for in a
  combined question. The Nose-Gear-to-Main-Gear figure (25.8m) is confirmed against FCOM 1.10.1.
  The cockpit-seat figure is cited to "POM 5.4.14" — a completely different manual (Performance
  Operations Manual) not available in this FCOM-only review. Cannot verify or refute that half of
  the answer.
