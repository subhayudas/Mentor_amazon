import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Page container: `.container-page` = `mx-auto w-full max-w-[1200px] px-4
 * sm:px-6 lg:px-8` (spec §1 gutter + content width). Renders a `div` unless
 * `as` says otherwise; no landmark semantics of its own.
 */
type ContainerProps<T extends React.ElementType> = {
  as?: T;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function Container<T extends React.ElementType = "div">({
  as,
  className,
  children,
  ...props
}: ContainerProps<T>) {
  const Comp = (as ?? "div") as React.ElementType;
  return (
    <Comp className={cn("container-page", className)} {...props}>
      {children}
    </Comp>
  );
}
