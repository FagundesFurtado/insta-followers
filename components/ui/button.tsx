import React from "react";
import clsx from "clsx";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "danger" | "success" | "secondary";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  children,
  className,
  variant = "default",
  size = "md",
  isLoading = false,
  disabled,
  fullWidth = false,
  leftIcon,
  rightIcon,
  ...props
}: ButtonProps) {
  const base = clsx(
    "inline-flex items-center justify-center rounded-lg font-medium",
    "transition-all duration-200 ease-in-out",
    "focus:outline-none focus:ring-2 focus:ring-offset-2",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none",
    "active:scale-[0.98]",
    {
      "w-full": fullWidth,
      "px-3 py-1.5 text-sm": size === "sm",
      "px-4 py-2 text-sm": size === "md",
      "px-6 py-3 text-base": size === "lg",
    }
  );

  const styles = {
    default: clsx(
      "bg-blue-600 text-white",
      "hover:bg-blue-700 active:bg-blue-800",
      "focus:ring-blue-500",
      "shadow-sm hover:shadow-md"
    ),
    outline: clsx(
      "border-2 border-blue-600 text-blue-600",
      "hover:bg-blue-50 active:bg-blue-100",
      "focus:ring-blue-400"
    ),
    ghost: clsx(
      "text-blue-600",
      "hover:bg-blue-50 active:bg-blue-100",
      "focus:ring-blue-400"
    ),
    danger: clsx(
      "bg-red-600 text-white",
      "hover:bg-red-700 active:bg-red-800",
      "focus:ring-red-500",
      "shadow-sm hover:shadow-md"
    ),
    success: clsx(
      "bg-green-600 text-white",
      "hover:bg-green-700 active:bg-green-800",
      "focus:ring-green-500",
      "shadow-sm hover:shadow-md"
    ),
    secondary: clsx(
      "bg-gray-600 text-white",
      "hover:bg-gray-700 active:bg-gray-800",
      "focus:ring-gray-500",
      "shadow-sm hover:shadow-md"
    ),
  };

  return (
    <button
      className={clsx(base, styles[variant], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : leftIcon ? (
        <span className="mr-2">{leftIcon}</span>
      ) : null}
      {children}
      {rightIcon && !isLoading && <span className="ml-2">{rightIcon}</span>}
    </button>
  );
}
