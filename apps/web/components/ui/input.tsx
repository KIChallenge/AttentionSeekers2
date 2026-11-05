"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

function fieldFocusProps<T extends HTMLElement>(
  props: React.HTMLAttributes<T>,
): React.HTMLAttributes<T> {
  return {
    onPointerDownCapture(event) {
      event.currentTarget.dataset.pointerFocus = "true";
      props.onPointerDownCapture?.(event);
    },
    onPointerUpCapture(event) {
      const control = event.currentTarget;
      window.setTimeout(() => {
        if (!control.contains(document.activeElement)) delete control.dataset.pointerFocus;
      }, 0);
      props.onPointerUpCapture?.(event);
    },
    onKeyDownCapture(event) {
      if (event.key === "Tab") delete event.currentTarget.dataset.pointerFocus;
      props.onKeyDownCapture?.(event);
    },
    onBlurCapture(event) {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        delete event.currentTarget.dataset.pointerFocus;
      }
      props.onBlurCapture?.(event);
    },
  };
}

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 py-1 text-base transition-[color,border-color,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus:border-ring/40 focus-visible:border-ring/40 focus-visible:ring-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-0 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-0",
        className
      )}
      {...props}
      {...fieldFocusProps<HTMLInputElement>(props)}
    />
  )
}

export { Input, fieldFocusProps }
