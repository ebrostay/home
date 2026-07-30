"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { uploadHostPhoto, type Bilingual, type HostListing, type HostPhoto } from "@/lib/api";
import { isEmptyDoc, type RichNode } from "@/lib/rich-text";
import { LIMITS, applyDescriptionEdit } from "@/lib/listing";
import { shrink } from "@/lib/photos";
import type { MarkFor } from "@/components/host/new/import/ImportMark";
import { TextAreaField, TextField } from "./TextField";
import { RichTextEditor, type RichTextEditorProps } from "./RichTextEditor";
import { PhotoPicker } from "./PhotoPicker";
import { PlacePicker } from "./PlacePicker";

// The words a guest reads. Bilingual is a hard requirement in this product,
// so the two languages sit side by side and neither is a second-class field.
//
// The English description carries an approval gate the other fields don't
// (ADR-027). It is the one paragraph read as the owner's own voice, and the
// only one long enough for a bad rendering to mislead — "beds: 2 dobles" says
// the same thing however it is translated; a paragraph does not. That
// rationale applies more strongly to a FORMATTED paragraph, not less — a
// bold claim or a bulleted list is even easier to render wrong than plain
// text — so the gate stays exactly where it was.
//
// 🔜 The handoff has this text machine-translated with the owner approving the
// result. The gate ships; the translation does not — there is no translate
// endpoint yet (ADR-020 keeps DeepSeek for it). So the owner writes both, and
// the button drops into this same panel later.

export function DescriptionFields({
  value,
  onChange,
  propertyId,
  onUploaded,
  mark,
}: {
  value: HostListing;
  // A real `useState` setter, not a plain `(value) => void` — both call
  // sites already pass one (`setListing`). Needed because Tiptap's onUpdate
  // (setCopyDoc) and upload() can both fire an onChange within the same
  // React batch (PhotoPicker calls onPick — which inserts the chip,
  // synchronously firing onUpdate — right after onUpload resolves, with no
  // further `await` in between). A PLAIN value call closes over whatever
  // `value` was at render time; two of them in the same batch mean the
  // second silently discards whatever the first changed. A FUNCTIONAL call
  // reads the latest queued state instead, so order stops mattering — see
  // `applyDescriptionEdit` in lib/listing.ts, which is what actually merges
  // each edit, and its own comment for why staging in a ref (round 1's fix)
  // was not enough.
  onChange: Dispatch<SetStateAction<HostListing>>;
  propertyId: string;
  /** The server's photo list right after an upload — mirrors `PhotoManager`'s
   *  prop of the same name, and exists for the same reason: the page holds a
   *  SAVED baseline separate from the working listing (`detail.listing` /
   *  `saved.listing`), and an upload applies live, so the baseline needs the
   *  new photo too. Without this, Discard would remove a photo the server
   *  already has, and an in-flight reorder elsewhere on the page would snap
   *  back to storage order the moment this fires. */
  onUploaded: (photos: HostPhoto[]) => void;
  /** The import's glyph, per field key — see `AddressFields`' own prop. Only
   *  ever on the Spanish side: the English is never imported (§10.5), and the
   *  approval gate below is untouched by an import for the same reason. */
  mark?: MarkFor;
}) {
  const t = useTranslations("host.edit.description");
  // The one word guests actually read on a photoRef/photoFigure chip
  // (`components/ui/RichText.tsx`) — reused here rather than the toolbar's
  // own "Insert photo" instruction, which is a different piece of copy for a
  // different purpose (see `RichTextEditorProps.strings`'s own comment).
  // `place` is the generic noun the editor falls back to for a placeRef/
  // placeCard chip — the editor only has the place's id, never its name, so
  // it cannot show what a guest actually sees there (the resolved name).
  const trChip = useTranslations("detail.richText");

  const setBi = (key: "details" | "beds", locale: "es" | "en", next: string) =>
    onChange((prev) => {
      const current = prev[key];
      const merged: Bilingual = { es: current?.es ?? null, en: current?.en ?? null };
      merged[locale] = next.trim() === "" ? null : next;
      return { ...prev, [key]: merged.es === null && merged.en === null ? null : merged };
    });

  // `copy` holds documents, not strings, so it gets its own setter rather
  // than sharing `setBi`. `applyDescriptionEdit` is the pure merge logic
  // (lib/listing.ts, unit tested there); this just names the edit.
  const setCopyDoc = (locale: "es" | "en", next: RichNode) =>
    onChange((prev) => applyDescriptionEdit(prev, { type: "copyChanged", locale, doc: next }));

  const approved = value.copyEnApproved;
  // Presence is not enough: a document holding only a photo chip has no
  // words, and approving nothing would satisfy the gate without anyone
  // having written a sentence.
  const hasEnglish = !isEmptyDoc(value.copy?.en);

  // Both editors — ES and EN — share one pair of pickers, held here. Only one
  // can be open at a time; which editor asked is remembered as the `insert`
  // callback itself.
  const [photoPick, setPhotoPick] = useState<((url: string, asFigure: boolean) => void) | null>(
    null,
  );
  const [placePick, setPlacePick] = useState<((entryId: string, asCard: boolean) => void) | null>(
    null,
  );

  const upload = async (file: File, alsoInGallery: boolean) => {
    // The existing endpoint — the only path by which bytes reach storage.
    // Shrunk client-side first, exactly like PhotoManager's own upload: a
    // description photo is no less likely to be a full-size camera capture,
    // and the API re-encodes regardless (lib/photos.ts).
    //
    // `hiddenFromGallery` travels to the server on this same request, exactly
    // like `isFloorplan` — the upload is what makes the photo live, so a flag
    // corrected only on the working copy would leave a description-only photo
    // publicly visible in the gallery from the moment it lands until the next
    // Save, and stranded there for good if the owner presses Discard instead.
    const uploaded = await uploadHostPhoto(propertyId, await shrink(file), false, !alsoInGallery);
    const added = uploaded[uploaded.length - 1];
    // Validated before anything touches state: an empty response must fail
    // into the picker's own error handling, not stage a url-less photo.
    if (!added) throw new Error("upload returned no photo");
    // The SAVED baseline first, exactly like PhotoManager: an upload applies
    // live, so the server already has this photo whether or not the working
    // listing is ever saved again. A SEPARATE write (the page's own
    // onUploaded/photosUploaded, to the same underlying state) — called
    // before the functional update below. Both sides are functional updaters
    // over the previous state (host/edit/page.tsx's photosUploaded included),
    // so this ordering only decides which one composes on top of the other;
    // it is not what protects the rest of the listing from a stale snapshot —
    // that guarantee has to come from onUploaded/photosUploaded itself.
    onUploaded(uploaded);
    // `added` already carries the right flag — the server was told above —
    // so this is a plain upsert via the shared reducer, correct whether or
    // not onUploaded's own append has been reflected in `prev` yet.
    onChange((prev) => applyDescriptionEdit(prev, { type: "uploaded", photo: added }));
    return added.url;
  };

  const toolbarStrings: RichTextEditorProps["strings"] = {
    bold: t("toolbar.bold"),
    italic: t("toolbar.italic"),
    heading: t("toolbar.heading"),
    bullet: t("toolbar.bullet"),
    ordered: t("toolbar.ordered"),
    note: t("toolbar.note"),
    photo: t("toolbar.photo"),
    place: t("toolbar.place"),
    undo: t("toolbar.undo"),
    redo: t("toolbar.redo"),
    photoChip: trChip("photo"),
    placeChip: trChip("place"),
  };

  return (
    <div className="flex flex-col gap-5">
      <RichTextEditor
        value={value.copy?.es ?? null}
        onChange={(next) => setCopyDoc("es", next)}
        label={t("about")}
        tag={t("aboutTagEs")}
        mark={mark?.("copy")}
        placeholder={t("aboutPlaceholder")}
        hint={t("aboutHint")}
        onInsertPhoto={(insert) => setPhotoPick(() => insert)}
        onInsertPlace={(insert) => setPlacePick(() => insert)}
        strings={toolbarStrings}
      />

      {/* River, not brand: this panel is informational — it is where the two
          languages are reconciled, not another thing to fill in. */}
      <div className="flex flex-col gap-3 rounded-(--radius-control) border border-river bg-river-soft p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="data text-[0.65625rem] tracking-[0.1em] text-river-deep">
            {approved ? t("enApproved") : t("enPending")}
          </span>
          <span className="ml-auto text-xs text-river-deep">
            {approved ? t("enApprovedHint") : t("enPendingHint")}
          </span>
        </div>

        <RichTextEditor
          value={value.copy?.en ?? null}
          onChange={(next) => setCopyDoc("en", next)}
          label={t("about")}
          tag="EN"
          placeholder={t("aboutPlaceholder")}
          onInsertPhoto={(insert) => setPhotoPick(() => insert)}
          onInsertPlace={(insert) => setPlacePick(() => insert)}
          strings={toolbarStrings}
        />

        <button
          type="button"
          // Disabled with nothing to approve: an approval of an empty
          // paragraph is a claim about nothing, and it would satisfy the
          // blocker without anyone having written a word.
          disabled={!hasEnglish}
          aria-pressed={approved}
          onClick={() => onChange((prev) => ({ ...prev, copyEnApproved: !prev.copyEnApproved }))}
          className={`flex w-fit items-center gap-2 rounded-(--radius-control) px-3.5 py-2 text-[0.78125rem] font-semibold transition-[filter,background-color] duration-(--dur-standard) disabled:cursor-not-allowed disabled:opacity-45 ${
            approved
              ? "bg-surface-2 text-muted hover:brightness-95"
              : "bg-brand text-white hover:brightness-95"
          }`}
        >
          {approved && <Check size={14} strokeWidth={3} aria-hidden />}
          {approved ? t("approvedButton") : t("approveButton")}
        </button>
      </div>

      {/* Short, factual, and read on the detail page as a table rather than as
          prose — so they get plain paired fields, not the approval treatment. */}
      <div className="grid items-start gap-3.5 min-[46rem]:grid-cols-2">
        <TextAreaField
          label={t("details")}
          tag="ES"
          mark={mark?.("details")}
          rows={3}
          value={value.details?.es ?? ""}
          onChange={(v) => setBi("details", "es", v)}
          maxLength={LIMITS.maxDetails}
          hint={t("detailsHint")}
        />
        <TextAreaField
          label={t("details")}
          tag="EN"
          rows={3}
          value={value.details?.en ?? ""}
          onChange={(v) => setBi("details", "en", v)}
          maxLength={LIMITS.maxDetails}
        />
        <TextField
          label={t("beds")}
          tag="ES"
          mark={mark?.("beds")}
          value={value.beds?.es ?? ""}
          onChange={(v) => setBi("beds", "es", v)}
          maxLength={LIMITS.maxBeds}
          placeholder={t("bedsPlaceholder")}
          hint={t("bedsHint")}
        />
        <TextField
          label={t("beds")}
          tag="EN"
          value={value.beds?.en ?? ""}
          onChange={(v) => setBi("beds", "en", v)}
          maxLength={LIMITS.maxBeds}
        />
      </div>

      <PhotoPicker
        open={photoPick !== null}
        photos={value.photos}
        onClose={() => setPhotoPick(null)}
        onPick={(url, asFigure) => photoPick?.(url, asFigure)}
        onUpload={upload}
        strings={{
          title: t("photoPicker.title"),
          asChip: t("photoPicker.asChip"),
          asFigure: t("photoPicker.asFigure"),
          upload: t("photoPicker.upload"),
          alsoInGallery: t("photoPicker.alsoInGallery"),
          uploading: t("photoPicker.uploading"),
          failed: t("photoPicker.failed"),
          empty: t("photoPicker.empty"),
        }}
      />
      <PlacePicker
        open={placePick !== null}
        entries={value.nearby}
        onClose={() => setPlacePick(null)}
        onPick={(entryId, asCard) => placePick?.(entryId, asCard)}
        strings={{
          title: t("placePicker.title"),
          asChip: t("placePicker.asChip"),
          asCard: t("placePicker.asCard"),
          empty: t("placePicker.empty"),
        }}
      />
    </div>
  );
}
