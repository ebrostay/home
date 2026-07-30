"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  ApiError,
  cancelImport,
  fetchImportJob,
  startImport,
  type ImportStage,
} from "@/lib/api";
import { POLL_CEILING_MS, pollDelay } from "@/lib/import";

// The read, as a state machine (ADR-033). It lives here rather than in the
// wizard page because it is one self-contained thing — three phases, one job,
// one poll — and the page it hangs off is already nine steps long.

/** What the page is showing. The nine steps are the third of three screens,
 *  not the only one: the offer comes first and the wait comes between. */
export type ImportPhase = "start" | "reading" | "wizard";

/** Stages the poll must not schedule another round after. */
const SETTLED = new Set<ImportStage>(["done", "failed", "cancelled"]);

/** `unsupported_host` → `errorUnsupportedHost`. The server's codes are stable
 *  and the copy for them lives in the message files, in both locales — one
 *  table serves the 4xx from `POST /import` and the job's own `error.code`. */
const errorKey = (code: string) =>
  `error${code
    .split("_")
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join("")}`;

export function useImportJob({
  skipOffer,
  fallback,
}: {
  /** True while a draft is being resumed: it has already answered the offer
   *  once, and asking again would be asking about a home half described. */
  skipOffer: boolean;
  /** The page's generic API-error copy, for a failure carrying no code of its
   *  own (a dropped connection mid-poll). */
  fallback: (err: unknown) => string;
}) {
  const t = useTranslations("host.import");
  const router = useRouter();
  // The read survives a reload of the page that started it — which matters
  // precisely because there is no draft yet to hang the job off.
  const resumeJobId = useSearchParams().get("import") ?? "";

  const [phase, setPhase] = useState<ImportPhase>(
    skipOffer ? "wizard" : resumeJobId ? "reading" : "start",
  );
  const [jobId, setJobId] = useState(resumeJobId);
  const [host, setHost] = useState("");
  const [stage, setStage] = useState<ImportStage>("queued");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const message = useCallback(
    (err: unknown) => {
      const code = err instanceof ApiError ? err.code : typeof err === "string" ? err : undefined;
      if (!code) return fallback(err);
      const key = errorKey(code);
      return t.has(key) ? t(key as "errorTimeout") : fallback(err);
    },
    [t, fallback],
  );

  // The poll. It is deliberately NOT tied to `phase`: "Start filling it in
  // meanwhile" is the escape hatch this whole screen exists for, and a poll
  // that stopped when the reading card unmounted would make it a lie.
  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The job's OWN start, not this component's — so a reload mid-read resumes
    // the real clock instead of restarting the stage lines from zero.
    let began = 0;

    const tick = async () => {
      try {
        const job = await fetchImportJob(jobId);
        if (stopped) return;
        const created = Date.parse(job.createdAt);
        if (!began) began = Number.isFinite(created) ? created : Date.now();
        const elapsed = Date.now() - began;
        setHost(job.host);
        setStage(job.stage);
        setElapsedMs(elapsed);

        if (SETTLED.has(job.stage)) {
          // A failure is the start screen's business — its status line is
          // where the six sites and the blank form are. Anything else lands
          // in the wizard, where the merge picks the result up.
          if (job.stage === "failed") {
            setError(message(job.error?.code));
            setPhase("start");
          } else setPhase((p) => (p === "reading" ? "wizard" : p));
          return;
        }
        if (elapsed >= POLL_CEILING_MS) {
          setError(message("timeout"));
          setPhase("start");
          return;
        }
        timer = setTimeout(tick, pollDelay(elapsed));
      } catch (err) {
        if (stopped) return;
        setError(fallback(err));
        setPhase((p) => (p === "reading" ? "start" : p));
      }
    };

    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, message, fallback]);

  const start = useCallback(
    async (url: string) => {
      setStarting(true);
      setError(null);
      try {
        const started = await startImport(url);
        setStage(started.stage);
        setElapsedMs(0);
        setJobId(started.jobId);
        setPhase("reading");
        router.replace({ pathname: "/host/new", query: { import: started.jobId } });
      } catch (err) {
        setError(message(err));
      } finally {
        setStarting(false);
      }
    },
    [router, message],
  );

  const stop = useCallback(async () => {
    const id = jobId;
    setPhase("wizard");
    if (!id) return;
    try {
      await cancelImport(id);
      setJobId("");
      setError(null);
      router.replace({ pathname: "/host/new" });
    } catch (err) {
      // `cancel_conflict`: the read outran the cancel twice and is STILL
      // running. Leaving the poll alone and saying so is the only honest
      // answer — claiming it stopped would be a lie the arriving fields
      // would then contradict.
      setError(message(err));
    }
  }, [jobId, router, message]);

  /** The escape hatch. The poll is untouched on purpose. */
  const meanwhile = useCallback(() => {
    setError(null);
    setPhase("wizard");
  }, []);

  return { phase, host, stage, elapsedMs, error, starting, start, stop, meanwhile, toWizard: meanwhile };
}
