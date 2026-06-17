# Research

Market research behind the corporate-rental outreach effort.

## Files

- **`plaza-companies-outreach.xlsx`** — the source workbook (two sheets).
- **`plaza-companies.csv`** — export of the `PLAZA Companies` sheet (diff-able / viewable on GitHub).
- **`notes-gdpr.csv`** — export of the `Notes & GDPR` sheet (methodology, status legend, GDPR basis).

> CSVs are generated from the workbook for easy viewing on GitHub. If you edit
> the `.xlsx`, re-export the CSVs so they stay in sync.

## What's in it

A B2B prospect list of **685 Zaragoza-area companies** to approach about renting
the furnished apartments for corporate / relocation / medium-stay housing.
**680 of the 685 have a usable email** (426 verbatim/published, 294 pattern-inferred; some have both).

Entry points (see the `Source / Entry point` column):

1. **PLAZA Logística** park directory (34 companies).
2. **Páginas Amarillas + public registries** (eInforma, elEconomista/Empresite,
   Axesor, Cámara Zaragoza, Aliaragón) — 24 companies.
3. **elEconomista company ranking** — 19 large/medium Zaragoza employers (batch 2).
4. **Directory harvest across Aragón** (batch 3, 2026-06-13) — 213 companies from
   Zaragoza-city polígonos (Cogullada, San Valero, Malpica, Alcalde Caballero),
   the Ebro corridor (Pedrola, Figueruelas, Alagón, Zuera), Cuarte/La Muela/Utebo,
   Calatayud/Cariñena, the Cinco Villas/Tarazona/Borja north, and Zaragoza
   engineering/IT clusters. Broadened filter (SMEs included); most are `list-only`
   or `partial` with a verbatim or generic-inferred email.

Per company the sheet records: sector, HQ/locations, employee count, website,
general email, phone, LinkedIn, any named HR/leadership contact, an email
confidence flag, source(s), a relevance note, and a status. Two dedicated email
columns were added in an enrichment pass (2026-06-13):

- **All emails found (verbatim)** — every published email located for the
  company (general, department, DPO, named-person), each with its source.
  63 of 77 companies have at least one verbatim address.
- **Inferred emails (pattern + basis)** — best-guess address for the named
  HR/leadership contact, built from the company's email pattern (e.g.
  `first.last@`, `finitial+last@`) with the basis noted. **All are flagged
  `(UNVERIFIED)` — verify before sending.**

### Status legend

- `enriched` — has a named HR/leadership contact, or a confirmed general email + LinkedIn + size.
- `partial` — has general email/website/LinkedIn but no named HR contact yet.
- `list-only` — directory baseline only; needs a second enrichment pass.

### Top targets flagged

Pikolin, Grupo Sesé, Saica, Grupo SAMCA, Hiberus Tecnología and BSH/Balay —
large Zaragoza employers with active hiring/relocation and (mostly) identifiable
HR functions.

## ⚠️ Before using contacts

- **Inferred emails are unverified.** Any address marked `INFERRED` or
  "guess" is built from an email pattern, not confirmed — verify before sending.
- **GDPR / Spanish LOPDGDD & LSSI:** this is a B2B list. Outreach to named
  individuals relies on the legitimate-interest basis (GDPR Art. 6(1)(f)), must
  be relevant to the person's professional role, and must include a clear
  opt-out in every message. Honour opt-outs and keep a record of the
  legitimate-interest assessment.
