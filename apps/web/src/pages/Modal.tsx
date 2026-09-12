import { useEffect, useRef, type ReactNode } from "react";

export function Modal({
  open,
  onClose,
  children,
  testid,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  testid?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const prev = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      if (!el.open) {
        prev.current = document.activeElement as HTMLElement | null;
        el.showModal();
        const focusable = el.querySelector<HTMLElement>("input, textarea, button, select, [tabindex]:not([tabindex='-1'])");
        focusable?.focus();
      }
    } else if (el.open) {
      el.close();
      prev.current?.focus?.();
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      data-testid={testid}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
