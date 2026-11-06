import type { ComponentProps, ReactNode } from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Page shell (docs/ui-simplification.md, "Design system"): one content width, one gutter,
 * one vertical rhythm. Sections are direct children and sit 2rem apart; nothing inside a
 * page adds its own outer margin.
 */
export function Page({
  children,
  width = "default",
  className,
}: {
  children: ReactNode;
  /** `default` 1280px for reading screens, `wide` 1600px for dashboards with wide tables. */
  width?: "default" | "wide" | "full";
  className?: string;
}) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full min-w-0 flex-col gap-8 px-4 pt-8 pb-16 sm:px-8",
        width === "default" && "max-w-[1280px]",
        width === "wide" && "max-w-[1600px]",
        width === "full" && "max-w-[1800px]",
        className,
      )}
    >
      {children}
    </main>
  );
}

/**
 * Title and primary action. Titles must speak for themselves: the page subtitle (`sub`) is
 * accepted for compatibility but no longer rendered.
 */
export function PageHead({
  title,
  sub,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end sm:gap-8">
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? <Meta>{eyebrow}</Meta> : null}
        <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>
      ) : null}
    </header>
  );
}

/**
 * A section of a page: title row (title, optional description, optional action) and body.
 * `card` draws the hairline card, `plain` uses a title row with a separator, for content
 * that is itself a table or a list of cards.
 */
export function Section({
  title,
  description,
  action,
  children,
  variant = "card",
  className,
  bodyClassName,
  id,
  prose = false,
  ...rest
}: {
  title?: ReactNode;
  /** Only rendered with `prose` (pages whose descriptions are content, like the method note). */
  description?: ReactNode;
  prose?: boolean;
  action?: ReactNode;
  children: ReactNode;
  variant?: "card" | "plain";
  className?: string;
  bodyClassName?: string;
  id?: string;
} & Omit<ComponentProps<"section">, "title" | "ref">) {
  const head = title ? (
    <SectionHead title={title} description={prose ? description : undefined} action={action} />
  ) : null;
  if (variant === "plain") {
    return (
      <section id={id} className={cn("min-w-0 space-y-4", className)} {...rest}>
        {head ? (
          <>
            {head}
            <Separator />
          </>
        ) : null}
        <div className={cn("min-w-0", bodyClassName)}>{children}</div>
      </section>
    );
  }
  return (
    <section
      id={id}
      className={cn(
        "min-w-0 rounded-2xl border bg-card p-5 shadow-none sm:p-6",
        head && "space-y-5",
        className,
      )}
      {...rest}
    >
      {head}
      <div className={cn("min-w-0", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Title row of a section: base-size semibold title, muted description, action on the right. */
export function SectionHead({
  title,
  description,
  action,
  className,
  level = 2,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  level?: 2 | 3;
}) {
  const H = level === 3 ? "h3" : "h2";
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-2", className)}>
      <div className="min-w-0 space-y-1">
        <H className="text-base font-semibold tracking-tight">{title}</H>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Quiet label above a group of values (the only uppercase text in the system). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "text-[11px] font-medium tracking-wide text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Metadata line: smaller and muted, numbers tabular. */
export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("num text-xs text-muted-foreground", className)}>{children}</div>;
}

/** Label and value pair for key figures inside a section. */
export function Stat({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num mt-1 text-sm">{children}</dd>
    </div>
  );
}

/** Empty state for a section or table: title, one sentence, optional action. */
export function EmptyState({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("min-h-40 border p-8", className)}>
      <EmptyHeader>
        <EmptyTitle className="text-sm">{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {children}
    </Empty>
  );
}

export function StubNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
