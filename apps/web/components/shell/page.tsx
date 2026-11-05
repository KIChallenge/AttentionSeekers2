import type { ReactNode } from "react";

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[1600px] px-8 pt-6 pb-12">{children}</main>;
}

export function PageHead({
  title,
  sub,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-6">
      <div>
        <h1 className="text-2xl">{title}</h1>
        {sub ? <p className="mt-1 max-w-3xl text-muted-foreground">{sub}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StubNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
