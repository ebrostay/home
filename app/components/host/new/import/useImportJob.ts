"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { POLL_CEILING_MS, importErrorKey, isTerminalStage, pollDelay } from "@/lib/import";

// The read, as a state machine (ADR-033). It lives here rather than in the
// wizard page because it is one self-contained thing — three phases, one job,
// one poll — and the page it hangs off is already nine steps long.
//
// Nothing here decides what a terminal stage is or how a server code maps to
// copy: both are pure, both live in lib/import.ts, and both are unit-tested
// there against the real code list and both message files.

/** What the page is showing. The nine steps are the third of three screens,
 *  not the only one: the offer comes first and the wait comes between. */
export type ImportPhase = "start" | "reading" | "wizard";

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
  // Held in a ref so the poll can drop `?import=` without taking the router
  // into its dependency list — a router whose identity changed on a render
  // would tear the poll down and restart it, and the restart fires a fetch.
  // Synced in an effect rather than during render: the ref is only ever read
  // from an awaited callback, which is always after the commit.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
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
      const key = importErrorKey(code);
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

    // The read is over, however it ended.
    //
    // The phase move is GUARDED, and that guard is the whole point: an owner
    // who took "Start filling it in meanwhile" is mid-form. Sending them back
    // to the offer would put a screen in front of them whose only way onward
    // reads "Start with a blank form" — copy that says their typing is gone,
    // about a draft that is in fact still in the page. Only someone still
    // watching the wait gets moved; anyone else is told by the wizard's own
    // error line and keeps their step.
    //
    // The `?import=` goes with it. It exists to survive a reload MID-read, and
    // a settled job has nothing left to resume — left behind, a reload would
    // re-read the terminal job and re-run this same transition, which is how
    // the eviction above would come back through the front door.
    const settle = (watcherGoesTo: ImportPhase) => {
      setJobId("");
      routerRef.current.replace({ pathname: "/host/new" });
      setPhase((p) => (p === "reading" ? watcherGoesTo : p));
    };

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

        if (isTerminalStage(job.stage)) {
          // A failure is the start screen's business — its status line is
          // where the six sites and the blank form are. `done` and `cancelled`
          // hand over to the wizard, where the merge picks the result up.
          if (job.stage === "failed") setError(message(job.error?.code));
          settle(job.stage === "failed" ? "start" : "wizard");
          return;
        }
        if (elapsed >= POLL_CEILING_MS) {
          setError(message("timeout"));
          settle("start");
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
