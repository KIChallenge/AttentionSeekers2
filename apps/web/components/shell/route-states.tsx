import Link from "next/link";
import type { ReactNode } from "react";

/** Fixed-layout skeleton shared by every route's loading state (no pulse, no layout jump). */
export function RouteSkeleton({ label }: { label: string }) {
  return (
    <main aria-busy="true" className="mx-auto max-w-[1600px] space-y-4 px-4 pt-6 pb-12 sm:px-8">
      <span className="sr-only" role="status">
        {label}
      </span>
      <div className="h-7 w-64 max-w-full rounded-lg bg-gray-alpha-150" />
      <div className="h-4 w-[28rem] max-w-full rounded bg-gray-alpha-100" />
      <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl border bg-card" />
        ))}
      </div>
      <div className="h-64 rounded-2xl border bg-card" />
    </main>
  );
}

/** Centered message used by not-found and error boundaries. */
export function RouteMessage({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-xl px-4 pt-20 pb-12 text-center sm:px-8">
      <h1 className="text-2xl">{title}</h1>
      <p className="mt-2 text-muted-foreground">{body}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>
    </main>
  );
}

export function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/"
      className="rounded-control bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90"
    >
      {label}
    </Link>
  );
}
