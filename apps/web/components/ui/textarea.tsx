"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { fieldFocusProps } from "@/components/ui/input"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full resize-none rounded-2xl border border-transparent bg-input/50 px-3 py-3 text-base transition-[color,border-color,background-color] outline-none placeholder:text-muted-foreground focus:border-ring/40 focus-visible:border-ring/40 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-0 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-0",
        className
      )}
      {...props}
      {...fieldFocusProps<HTMLTextAreaElement>(props)}
    />
  )
}

export { Textarea }
