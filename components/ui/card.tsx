import React from "react";
import clsx from "clsx";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "bordered" | "elevated";
  padding?: "none" | "sm" | "md" | "lg";
}

export function Card({
  children,
  className,
  variant = "default",
  padding = "md",
  ...props
}: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-lg bg-white transition-all duration-200",
        {
          "border border-gray-200": variant === "default",
          "border-2 border-gray-200": variant === "bordered",
          "border border-gray-200 shadow-md hover:shadow-lg": variant === "elevated",
        },
        {
          "p-0": padding === "none",
          "p-3": padding === "sm",
          "p-4": padding === "md",
          "p-6": padding === "lg",
        },
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function CardHeader({
  title,
  description,
  action,
  className,
  ...props
}: CardHeaderProps & Omit<React.HTMLAttributes<HTMLDivElement>, keyof CardHeaderProps>) {
  return (
    <div
      className={clsx(
        "flex items-start justify-between space-y-1.5",
        className
      )}
      {...props}
    >
      <div className="space-y-1">
        {title && (
          <h3 className="text-lg font-semibold leading-none tracking-tight">
            {title}
          </h3>
        )}
        {description && (
          <p className="text-sm text-gray-500">{description}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function CardContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("mt-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "mt-4 flex items-center justify-between border-t border-gray-200 pt-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
