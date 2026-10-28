import type { InputHTMLAttributes } from "react";

type TextFieldProps = {
  id: string;
  label: string;
} & InputHTMLAttributes<HTMLInputElement>;


export function TextField({ id, label, ...inputProps }: TextFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-mono text-xs font-bold tracking-[0.08em] text-[#344866]">
        {label}
      </label>
      <input
        id={id}
        name={id}
        className="h-11 border-2 border-[#9eafc6] bg-white px-3 text-sm text-[#111827] outline-none transition-colors placeholder:text-[#718198] focus:border-[#183a8f] focus:ring-2 focus:ring-[#183a8f]/20"
        {...inputProps}
      />
    </div>
  );
}
