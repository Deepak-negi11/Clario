import type { ReactNode } from "react";
import { cn } from "./cn"




type CardProps = {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (


    <div className={cn("rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-[0_18px_48px_rgba(0,0,0,0.12)]", className)}>
      {children}

    </div>
  )
}
