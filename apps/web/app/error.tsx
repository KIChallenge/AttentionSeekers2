"use client";

import { useEffect } from "react";
import { usePrefs } from "@/components/shell/providers";
import { BackLink, RouteMessage } from "@/components/shell/route-states";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = usePrefs();
  useEffect(() => {
    console.error("route_error", error.digest ?? error.message);
  }, [error]);
  return (
    <RouteMessage
      title={t.states.error}
      body={t.states.errorBody}
      action={
        <>
          <button
            type="button"
            onClick={reset}
            className="rounded-control border px-3 py-1.5 text-sm hover:border-foreground/40"
          >
            {t.states.retry}
          </button>
          <BackLink label={t.states.back} />
        </>
      }
    />
  );
}
