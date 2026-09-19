import { Toaster as Sonner } from "sonner";

import { useDirection } from "@/hooks/useDirection";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Sonner renderer (P1-28, §11b): reads the direction itself so toasts sit at
 * the inline-end and Arabic text aligns correctly; 6s default (error toasts
 * carrying an action should pass `duration: Infinity`); close button always
 * visible. Styling goes through `toastOptions.classNames` with tokens — the
 * `group-[.toaster]:` prefix out-specifies sonner's own attribute selectors.
 */
export function SonnerToaster({ toastOptions, ...props }: ToasterProps) {
  const { dir } = useDirection();
  return (
    <Sonner
      theme="light"
      dir={dir}
      position={dir === "rtl" ? "bottom-left" : "bottom-right"}
      className="toaster group"
      expand={false}
      closeButton
      duration={6000}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-lg group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:shadow-elevated group-[.toaster]:font-sans",
          title: "group-[.toast]:text-body-sm group-[.toast]:font-medium",
          description: "group-[.toast]:text-body-sm group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-secondary group-[.toast]:text-secondary-foreground group-[.toast]:rounded-md",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-md",
          closeButton:
            "group-[.toast]:border-border group-[.toast]:bg-card group-[.toast]:text-muted-foreground group-[.toast]:hover:text-foreground",
          success: "group-[.toaster]:border-success/30 [&_[data-icon]]:text-success",
          error: "group-[.toaster]:border-destructive/40 [&_[data-icon]]:text-destructive",
          warning: "group-[.toaster]:border-warning-border [&_[data-icon]]:text-warning-icon",
          info: "group-[.toaster]:border-border [&_[data-icon]]:text-secondary",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
}

export { SonnerToaster as Toaster };
