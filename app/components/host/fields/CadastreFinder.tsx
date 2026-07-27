"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  byNameMatch,
  preferredStreet,
  searchStreets,
  seedSearch,
  unitsAt,
  type CadastreStreet,
  type CadastreUnit,
  type CadastreUnits,
} from "@/lib/catastro";
import { TextField } from "./TextField";

// Finding the reference from the address, for the owner who does not have the
// IBI receipt to hand — the reverse of the field it sits under.
//
// It is a SEARCH, not a derivation, and that is a finding rather than a
// preference. The Catastro's street index is a closed vocabulary that inverts
// articles and surnames — Camino de las Torres is filed as "TORRES, DE LAS",
// so "TORRES" finds it and "LAS TORRES" finds nothing — and the street-type
// prefix is mandatory and unguessable: César Augusto is both an avenue and a
// square in Zaragoza. Every attempt to turn typed text into a query is a way
// to be confidently wrong, so the register's own lists do the disambiguating
// and the owner does the choosing. The address only seeds the box.
//
// Nothing is stored but the reference the owner picks. Same rule as the panel
// below: the listing keeps the question, and both the owner and the reviewer
// ask the Catastro live.

/** Long enough to read as "done typing", short enough to feel like search. */
const DEBOUNCE_MS = 500;

const keyOf = (s: CadastreStreet) => `${s.type}|${s.name}`;

export function CadastreFinder({
  address,
  postcode,
  onPick,
}: {
  address: string;
  /** The listing's postcode. Not a search key — the services do not take one —
   *  but it is what catches the plausible wrong answer: the same street name
   *  in a different district. */
  postcode: string;
  /** Fired with the 20-character reference. The panel below does the rest —
   *  it already knows how to ask the register what the reference describes. */
  onPick: (ref: string) => void;
}) {
  const t = useTranslations("host.edit.address");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 self-start rounded-(--radius-control) border border-line-strong bg-surface px-3 py-1.5 text-[0.78125rem] font-semibold text-body transition-colors duration-(--dur-standard) hover:border-ink hover:text-ink"
      >
        <Search size={13} strokeWidth={2.2} aria-hidden />
        {t("finderOpen")}
      </button>
    );
  }

  // Mounted fresh, so the search box can seed itself from the address in a
  // state initialiser rather than being pushed a value it then has to
  // reconcile against what the owner has since typed into it.
  return (
    <Finder
      address={address}
      postcode={postcode}
      onPick={(ref) => {
        onPick(ref);
        setOpen(false);
      }}
      onClose={() => setOpen(false)}
    />
  );
}

function Finder({
  address,
  postcode,
  onPick,
  onClose,
}: {
  address: string;
  postcode: string;
  onPick: (ref: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("host.edit.address");

  // Read once. The address behind it can go on being edited while the search
  // is open, and a box that rewrote itself under the owner's cursor would be
  // worse than one that started from a slightly older guess.
  const [seed] = useState(() => seedSearch(address));
  const [query, setQuery] = useState(seed.street);
  const [number, setNumber] = useState(seed.number);

  const [streets, setStreets] = useState<CadastreStreet[]>([]);
  const [searched, setSearched] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // Keyed by the question it answers, so a stale reply never gets read as an
  // answer about the street and number now on screen.
  const [answer, setAnswer] = useState<{ for: string; result: CadastreUnits } | null>(null);

  const q = query.trim();
  const searchable = q.length >= 3;

  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchStreets(q, controller.signal).then((list) => {
        if (controller.signal.aborted) return;
        setStreets(byNameMatch(list, q));
        setSearched(q);
        // The owner has already said "Calle Movera 7" once, so being asked to
        // choose between Barrio, Calle and Diseminado Movera is being asked
        // twice. `preferredStreet` selects only where the answer is not a
        // guess; everything else stays the owner's to make, because picking
        // between an avenue and a square of the same name is how a listing
        // ends up carrying somebody else's flat.
        const best = preferredStreet(list, q, seed.type);
        setPicked(best ? keyOf(best) : null);
      });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, searchable, seed.type]);

  const street = streets.find((s) => keyOf(s) === picked) ?? null;
  const num = number.trim();
  const question = street && /^\d{1,4}$/.test(num) ? `${picked}|${num}` : null;

  useEffect(() => {
    if (!street || !question) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      unitsAt(street, num, controller.signal).then((result) => {
        if (!controller.signal.aborted) setAnswer({ for: question, result });
      });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `street` is derived from `picked` and `streets`; `question` moves with
    // it and with the number, which is the whole of what makes this a new
    // question worth asking.
  }, [street, num, question]);

  // Everything below is derived from those two answers. A result that names a
  // different question is not an answer to this one — it is the previous
  // lookup still on screen, which here would mean offering the flats of the
  // wrong building.
  const result = answer?.for === question ? answer.result : null;
  const searching = searchable && searched !== q;
  const looking = question !== null && result === null;

  // Every flat at one number shares a postcode, so the first one that has it
  // speaks for the address.
  const ours = postcode.trim();
  const theirs =
    result?.kind === "units" ? (result.units.find((u) => u.postcode)?.postcode ?? null) : null;
  const mismatch = ours && theirs && theirs !== ours ? { ours, theirs } : null;

  return (
    <div className="flex flex-col gap-3.5 rounded-(--radius-control) border border-line-strong bg-surface-2 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="data text-[0.65625rem] tracking-[0.1em] text-muted">
          {t("finderTitle")}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("finderClose")}
          className="-m-1 rounded-(--radius-control) p-1 text-muted transition-colors duration-(--dur-standard) hover:text-ink"
        >
          <X size={15} strokeWidth={2.2} aria-hidden />
        </button>
      </div>

      <div className="grid items-start gap-3.5 min-[30rem]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <TextField
          label={t("finderStreet")}
          value={query}
          onChange={setQuery}
          maxLength={25}
          placeholder={t("finderStreetPlaceholder")}
          hint={t("finderStreetHint")}
        />
        <TextField
          label={t("finderNumber")}
          value={number}
          onChange={(v) => setNumber(v.replace(/\D/g, "").slice(0, 4))}
          maxLength={4}
          mono
          inputMode="numeric"
          placeholder="7"
        />
      </div>

      {searching && <Waiting label={t("finderSearching")} />}

      {/* The register's own streets. Its spelling is the only one the number
          lookup accepts, so this list is not a convenience — it is how the
          query gets written at all. */}
      {!searching && searchable && searched === q && streets.length === 0 && (
        <p className="text-[0.8125rem] leading-[1.5] text-body">{t("finderNoStreet")}</p>
      )}

      {streets.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {streets.slice(0, 10).map((s) => (
            <button
              key={keyOf(s)}
              type="button"
              aria-pressed={picked === keyOf(s)}
              onClick={() => setPicked(keyOf(s))}
              className={`data rounded-full border px-3 py-1.5 text-[0.75rem] transition-colors duration-(--dur-standard) ${
                picked === keyOf(s)
                  ? "border-river-deep bg-surface font-semibold text-river-deep"
                  : "border-line bg-surface text-body hover:border-river-deep"
              }`}
            >
              {s.type} {s.name}
            </button>
          ))}
        </div>
      )}

      {looking && <Waiting label={t("finderLooking")} />}

      {result?.kind === "numbers" && (
        <div className="flex flex-col gap-2">
          <p className="text-[0.8125rem] text-body">{t("finderNoNumber")}</p>
          <div className="flex flex-wrap gap-2">
            {result.numbers.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNumber(n)}
                className="data rounded-full border border-line bg-surface px-3 py-1.5 text-[0.75rem] text-body transition-colors duration-(--dur-standard) hover:border-river-deep"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {result?.kind === "noNumber" && (
        <p className="text-[0.8125rem] text-body">{t("finderBadNumber")}</p>
      )}

      {(result?.kind === "none" || result?.kind === "noStreet") && (
        <p className="text-[0.8125rem] text-body">{t("finderNoUnits")}</p>
      )}

      {result?.kind === "error" && (
        <p className="text-[0.8125rem] text-body">{t("cadastreUnreachable")}</p>
      )}

      {result?.kind === "units" && (
        <div className="flex flex-col gap-2">
          {/* The register's postcode for the address it just found, against
              the one on the listing. It is not a search key — neither service
              takes one — but it is the only thing that catches the answer
              that looks right and is not: Zaragoza has several streets called
              Movera, in different districts, and every one of them will
              cheerfully return a list of flats. */}
          {mismatch && (
            <p className="flex items-start gap-2.5 rounded-(--radius-control) border border-warn bg-warn-soft px-3.5 py-2.5 text-[0.8125rem] text-ink">
              <TriangleAlert
                size={15}
                strokeWidth={2}
                className="mt-0.5 shrink-0 text-warn"
                aria-hidden
              />
              {t("finderPostcode", { theirs: mismatch.theirs, ours: mismatch.ours })}
            </p>
          )}
          <p className="text-[0.8125rem] text-ink">
            {t("finderUnits", { count: result.units.length })}
          </p>
          <ul className="m-0 flex list-none flex-col gap-1.5">
            {result.units.map((u) => (
              <li key={u.ref}>
                <button
                  type="button"
                  onClick={() => onPick(u.ref)}
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-(--radius-control) border border-line bg-surface px-3 py-2 text-left transition-colors duration-(--dur-standard) hover:border-river-deep"
                >
                  <span className="text-[0.8125rem] font-semibold text-ink">
                    {describe(u, t)}
                  </span>
                  <span className="data text-[0.6875rem] text-muted">{u.ref}</span>
                </button>
              </li>
            ))}
          </ul>
          {/* Said out loud because the list cannot be filtered: the number
              lookup returns every property at the address and does not say
              what any of them is for. The panel above does, once a reference
              is chosen — it is where a garage gives itself away. */}
          <p className="text-xs leading-[1.4] text-muted">{t("finderUnitsNote")}</p>
        </div>
      )}
    </div>
  );
}

function Waiting({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-xs text-muted" role="status">
      <Loader2 size={13} strokeWidth={2.2} className="animate-spin" aria-hidden />
      {label}
    </p>
  );
}

/**
 * Where in the building, in the register's own codes.
 *
 * The codes are passed through rather than translated. The Catastro publishes
 * no table for them — "00" is the ground floor and "-1" a basement by
 * convention, but "EN", "PR" and "AT" are conventions too, and inventing a
 * vocabulary for a list whose whole job is recognition would be the one way
 * to make it unrecognisable. An owner reading "Pl. 04 Pt. B" knows their own
 * door.
 */
function describe(u: CadastreUnit, t: (key: string, values?: Record<string, string>) => string) {
  const parts = [
    u.block ? t("finderBlock", { value: u.block }) : null,
    u.stair ? t("finderStair", { value: u.stair }) : null,
    u.floor ? t("finderFloor", { value: u.floor }) : null,
    u.door ? t("finderDoor", { value: u.door }) : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : t("finderWhole");
}
