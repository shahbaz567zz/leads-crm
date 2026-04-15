import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", disabled, ...props },
    ref,
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-md shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
      primary:
        "bg-indigo-600 border border-transparent text-white hover:bg-indigo-700 focus:ring-indigo-500 shadow-indigo-100",
      secondary:
        "bg-teal-600 border border-transparent text-white hover:bg-teal-700 focus:ring-teal-500 shadow-teal-100",
      outline:
        "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 focus:ring-indigo-500",
      ghost:
        "bg-transparent border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-none",
      danger:
        "bg-red-600 border border-transparent text-white hover:bg-red-700 focus:ring-red-500 shadow-red-100",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2 text-sm",
      lg: "px-6 py-3 text-base px-5",
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
