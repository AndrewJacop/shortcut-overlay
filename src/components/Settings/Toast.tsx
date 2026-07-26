import type { FC } from "react";

export type ToastKind = "success" | "error";

export interface ToastItem {
	id: number;
	kind: ToastKind;
	message: string;
}

/** Push a transient toast. The host owns the list + auto-dismiss timers. */
export type ToastFn = (kind: ToastKind, message: string) => void;

interface ToastStackProps {
	toasts: ToastItem[];
	onDismiss: (id: number) => void;
}

/**
 * Fixed bottom-right stack of transient feedback messages (install / uninstall
 * confirmations). Purely presentational — the host ({@link SettingsPage})
 * owns the list and the 3s auto-dismiss timers. Click a toast to dismiss early.
 *
 * v0.4 Step 6: non-blocking feedback so install/uninstall outcomes don't need
 * a modal or banner to confirm success. Errors stay inline where they're
 * contextual (modal / per-row / banner); success is confirmed here.
 */
const ToastStack: FC<ToastStackProps> = ({ toasts, onDismiss }) => {
	if (toasts.length === 0) return null;
	return (
		<div
			className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2"
			role="status"
			aria-live="polite"
		>
			{toasts.map((t) => (
				<button
					key={t.id}
					type="button"
					onClick={() => onDismiss(t.id)}
					className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-md px-3 py-2 text-left text-xs text-white shadow-lg ring-1 transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
						t.kind === "success"
							? "bg-green-600 ring-green-700/50"
							: "bg-red-600 ring-red-700/50"
					}`}
				>
					<span aria-hidden="true">{t.kind === "success" ? "✓" : "✗"}</span>
					<span className="break-words">{t.message}</span>
				</button>
			))}
		</div>
	);
};

export default ToastStack;
