"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { MAX_NOTE_LENGTH } from "@/lib/review";

// Approve or reject, in a bar that stays on screen while the reviewer reads.
//
// Approve is one press: it is the answer to a listing that is fine, and
// putting a confirmation in front of it would train the reviewer to dismiss
// dialogs. Reject asks for the note, because the note is the whole content of
// a rejection — it is what the owner reads in their portfolio, and the only
// thing that tells them what to change. The API refuses a blank one; this
// asks for it properly rather than letting the button fail.

export type Decision = "approve" | "reject";

export function DecisionBar({
  busy,
  error,
  onApprove,
  onReject,
}: {
  busy: Decision | null;
  /** A message already translated by the caller — it knows which API code
   *  came back. */
  error: string | null;
  onApprove: () => void;
  onReject: (note: string) => void;
}) {
  const t = useTranslations("admin.decision");
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");

  const submit = () => {
    setAsking(false);
    onReject(note.trim());
  };

  return (
    <>
      <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-[86rem] flex-wrap items-center justify-end gap-3">
          {error && (
            <p role="alert" className="mr-auto text-xs text-danger">
              {error}
            </p>
          )}
          <Button
            variant="secondary"
            onClick={() => setAsking(true)}
            disabled={busy !== null}
          >
            {t("reject")}
          </Button>
          <Button onClick={onApprove} disabled={busy !== null}>
            {busy === "approve" ? t("approving") : t("approve")}
          </Button>
        </div>
      </div>

      <Dialog open={asking} onClose={() => setAsking(false)} title={t("rejectTitle")}>
        <p className="text-sm leading-relaxed text-body">{t("rejectLead")}</p>
        <textarea
          autoFocus
          rows={5}
          value={note}
          maxLength={MAX_NOTE_LENGTH}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("notePlaceholder")}
          className="mt-3 w-full rounded-(--radius-control) border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted"
        />
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setAsking(false)}>
            {t("cancel")}
          </Button>
          <Button variant="danger" onClick={submit} disabled={note.trim().length === 0}>
            {t("rejectConfirm")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
