import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster({ ...props }: ToasterProps) {
    return (
        <Sonner
            theme="light"
            position="bottom-right"
            expand={false}
            richColors
            closeButton
            duration={4000}
            toastOptions={{
                style: {
                    fontFamily: 'var(--font-sans)',
                },
                classNames: {
                    toast: 'group toast rounded-xl shadow-lg border-border bg-card',
                    title: 'text-foreground font-medium',
                    description: 'text-muted-foreground text-sm',
                    actionButton: 'bg-primary text-primary-foreground hover:bg-primary/90',
                    cancelButton: 'bg-muted text-muted-foreground hover:bg-muted/80',
                    closeButton: 'text-muted-foreground hover:text-foreground',
                },
            }}
            {...props}
        />
    );
}
