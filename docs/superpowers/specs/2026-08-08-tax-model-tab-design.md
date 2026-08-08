# Tax model tab — design

Date: 2026-08-08. Status: approved in chat.

## Goal

Add one tab named `Tax` to the pricing workbook
(`19DQbRIu53mGDkUFeD1OcHDbx8AxEHqM1D1j00rQWs6k`). It compares two tax
scenarios for a new Spanish property-management company owned by a Swiss
tax resident (canton Zug). Plain language, no tax jargon.

## Facts the model is built on

- Owner lives in Switzerland (Zug) and runs the company from there.
- The Spanish company manages homes for owners and takes a management fee.
- Cleaning is done by external Spanish companies (pass-through cost, no staff).
- Revenue source: **Model A** (tenant-funded 15% fee), 25 homes, one year.
- Scenario 1 "Retain": profit stays in the Spanish company.
- Scenario 2 "Swiss license": a Swiss company (Zug) owned by the same person
  bills the Spanish company a license fee for the management software.

## Tab layout

Same conventions as the other tabs: title row, blue editable input cells,
computed rows below, notes in column D/E where helpful.

### Part 1 — Inputs (editable)

| Input | Start value |
|---|---|
| Homes under management | 25 |
| Yearly running costs: accountant (gestor) | 3,000 € |
| Yearly running costs: software hosting | 1,500 € |
| Yearly running costs: marketing | 6,000 € |
| Yearly running costs: bank + misc | 1,500 € |
| Spain company tax rate | 15% (new-company rate, first 2 profit years; note: later ~21–23%) |
| License fee (€ per home per month) | 30 € |
| Spain tax kept at the border on the license fee | 0% (current treaty rate; advisor must confirm) |
| Zug company tax rate | 12% |
| Tax when you later pay yourself (memo only) | 18% |

Revenue per home per year comes from ModelA / Inputs by formula
(occupied days ÷ 30 × revenue per 30 stay-days, net of VAT), not typed in.

### Part 2 — Comparison table

Two columns: Scenario 1 (Retain), Scenario 2 (Swiss license). Rows:

1. Fee revenue, net of VAT (formula from ModelA numbers × homes)
2. − Running costs (sum of inputs)
3. − License fee to Switzerland (S2 only; homes × €/month × 12)
4. = Profit in Spain
5. − Spanish company tax
6. = Kept in Spain
7. License income in Switzerland (S2 only)
8. − Zug company tax (S2 only)
9. = Kept in Switzerland (S2 only)
10. **= Total kept inside your companies** (headline row, bold)
11. Memo: estimated extra tax to move it all to your pocket today
12. Memo: what would land in your pocket

### Part 3 — Risks in plain words

Short note rows, no numbers:

- Company is run from Switzerland → Switzerland can claim it is really a
  Swiss company and tax it there. Real management or staff in Spain
  weakens that claim.
- The license fee must be a price a stranger would pay. Too high → Spain
  rejects the cost.
- The Swiss company must truly own and develop the software.
- Cleaning stays pass-through: external invoices, deductible, no employees.
- The sheet is an estimate for comparing options. A Spanish gestor and a
  Swiss advisor must confirm before acting.

## Implementation notes

- Write via Sheets REST API with the gcloud token (`x-goog-user-project:
  ebrostay`); the MCP routes do not work.
- Workbook locale is already `en_US` — comma argument separators are safe.
- Follow the formatting pattern of the existing tabs (title, blue inputs).
- All rates are inputs, never hard-coded into formulas.
