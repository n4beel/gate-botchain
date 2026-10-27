"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "stamp" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, { bg: string; text: string; border: string }> = {
  primary: {
    bg: "var(--accent)",
    text: "var(--accent-ink)",
    border: "1px solid var(--accent)",
  },
  stamp: {
    bg: "var(--stamp-teal)",
    text: "#FFFFFF",
    border: "2px solid #06545A",
  },
  secondary: {
    bg: "var(--bg-elevated)",
    text: "var(--text-primary)",
    border: "1px solid var(--border-default)",
  },
  danger: {
    bg: "transparent",
    text: "var(--danger)",
    border: "1px solid var(--danger)",
  },
  ghost: {
    bg: "transparent",
    text: "var(--text-muted)",
    border: "1px solid transparent",
  },
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs tracking-tight",
  md: "px-4 py-2 text-sm font-semibold tracking-normal",
  lg: "px-5 py-2.5 text-base font-bold",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      className = "",
      style,
      ...props
    },
    ref,
  ) => {
    const v = variantStyles[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "inline-flex items-center justify-center gap-2 select-none cursor-pointer",
          "rounded-sm transition-all duration-150 active:translate-y-[1px]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0",
          sizeClasses[size],
          className,
        ].join(" ")}
        style={{
          background: v.bg,
          color: v.text,
          border: v.border,
          boxShadow: variant === "primary" || variant === "stamp" ? "0 1px 2px rgba(0, 0, 0, 0.1)" : undefined,
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <>
            <span
              className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);

Button.displayName = "Button";
export default Button;
