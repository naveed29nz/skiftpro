import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();
  if (toasts.length === 0) return null;

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, open, onOpenChange, duration, ...props }) {
        const closed = open === false;
        return (
          <Toast
            key={id}
            {...props}
            data-state={closed ? "closed" : "open"}
            className={closed ? "pointer-events-none" : "pointer-events-auto"}
          >
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose onClick={() => onOpenChange?.(false)} />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
} 