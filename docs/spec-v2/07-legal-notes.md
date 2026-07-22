# Ebrostay v2 — Legal research notes (Spanish rental law)

> ⚠️ **Not legal advice.** Research gathered 2026-07-22 to inform product
> decisions (stay-duration limits, billing method, deposits, platform
> compliance). Anything that reaches a real tenancy contract or the live
> platform must be confirmed by a licensed Spanish **abogado**. Confidence is
> marked per finding.

## Question
How should a furnished mid-term rental platform (1 to <12-month stays,
Zaragoza/Aragón) treat the 12-month line and bill rent — whole months vs.
daily proration?

## A. CONFIRMED — current law (LAU 29/1994, official BOE text; 3-0 adversarial)

1. **The regime is set by PURPOSE, not duration.** A let is *arrendamiento de
   vivienda* (protected, Título II) only when its primordial destination is the
   tenant's **permanent** housing need (art. 2.1). Seasonal/temporary lets
   ("por temporada") are expressly *arrendamiento para uso distinto del de
   vivienda* (art. 3.2, Título III). **There is NO 12-month threshold in the
   current statute** that flips the regime.
2. **Rent and billing are freely contractible.** For uso-distinto lets rent is
   "la que libremente estipulen las partes"; monthly payment is only the
   *default* — "**salvo pacto en contrario**, el pago de la renta será mensual"
   (art. 17). The statute imposes **no daily-proration requirement and no bar on
   it** — whole-month or prorated-by-day is the parties' choice.
3. Uso-distinto lets are governed first by the will of the parties, then
   supletorily by Título III and the Código Civil (art. 4.3) — broad freedom of
   contract.
- Source: BOE consolidated LAU — https://www.boe.es/buscar/pdf/1994/BOE-A-1994-26003-consolidado.pdf

**So the "11/12 months" we (and operators) use is a risk heuristic, not a
current statutory line.** What actually creates reclassification risk today is
the tenant using the home as their permanent residence — the longer the term,
the harder "temporary" is to defend, hence conservative caps.

## B. VERIFIED — proposed 2026 reform (NOT enacted; reputable legal publisher)

A bill amending the temporary-rental regime (report *Informe de la ponencia*
2025-12-02; political agreement 2025-11-18; **final approval still pending** as
of 2025-12-11):

- **New Art. 9 bis:** duration "no pudiendo ser inferior a **treinta y un
  días**, ni exceder de **doce meses**." → a **31-day floor and a hard 12-month
  ceiling.**
- **Over 12 months → auto-reclassified** as *arrendamiento de vivienda habitual*
  (the protected regime).
- **> 2 consecutive temporary contracts** between the same parties/property →
  retroactive reclassification as habitual residence.
- Contract must state a **documented cause of temporality**; its absence strips
  the temporary nature ("privará de su naturaleza temporal").
- Source: https://blog.sepin.es/blog/2025/12/11/regulacion-alquileres-temporales-habitaciones/

**Implication:** targeting **≥31 days and ≤12 months** is safe under both the
current practice and the incoming reform. Ebrostay's design intent ("under 12
months") is correct and forward-compatible; note the **31-day minimum** (not 30)
and the anti-chaining rule (don't renew the same guest's temporary contract more
than twice).

## C. GATHERED — reputable sources, NOT independently verified (rate limit hit)

Confirm each before relying:
- **Fianza:** commonly stated as **1 month for vivienda, 2 months for uso
  distinto/temporada** (LAU art. 36); uso distinto has no legal ceiling on extra
  guarantees. (Multiple secondary sources; not cross-verified this run.)
- **Aragón deposit registration:** an autonomic obligation to deposit the fianza
  with the Gobierno de Aragón (Dirección General de Vivienda) — **but** one
  source claims *temporada* and room rentals are **exempt** from that
  registration. **Conflicting — must confirm.** Sources:
  aragon.es tramitador; BOE Ley 10/1992 Aragón.
- **Ley 12/2023 (derecho a la vivienda):** *temporada* rentals are **excluded**
  from its rent-control/tenant-protection scope — which is precisely the
  "loophole" the 2026 reform (B) aims to close.
- **NRA — Número de Registro de Alquiler (RD 1312/2024):** as of 2025, seasonal
  rentals reportedly need a registry number, and **platforms must display and
  verify it and pull non-compliant listings.** If accurate this is a **direct
  platform-compliance obligation for Ebrostay** — high priority to confirm.

## D. Implications for the product
- **Duration limits:** enforced as **≥31 days** and **<365 days** (ADR-022 —
  a deliberately simple day count, leap years ignored, slightly stricter than
  the reform's "≤12 months"). Whole-month controls cap at 11.
- **Billing:** daily proration is **legal and our free choice** (A.2); it's also
  common in the mid-term segment via PM tooling. Decision pending — see BACKLOG.
- **Contracts (out of app scope, but note):** each contract should state the
  temporality cause; don't chain >2 temporary contracts per guest.
- **Compliance to confirm:** NRA registration + platform display/verify duty;
  Aragón fianza handling; 2-month deposit for temporada.
