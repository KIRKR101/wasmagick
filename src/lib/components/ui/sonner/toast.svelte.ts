export type ToastOptions = {
	duration?: number | null;
	loading?: boolean;
	action?: {
		label: string;
		onClick: () => void;
	};
};

export type ToastMessage = {
	id: number;
	message: string;
	action?: ToastOptions['action'];
	loading: boolean;
};

let toasts = $state<ToastMessage[]>([]);
let nextId = 0;
const dismissTimers = new Map<number, ReturnType<typeof setTimeout>>();

export const toastState = {
	get items() {
		return toasts;
	}
};

export function toast(message: string, options: ToastOptions = {}): number {
	const id = ++nextId;
	toasts = [...toasts, { id, message, action: options.action, loading: options.loading ?? false }];
	if (options.duration !== null) {
		dismissTimers.set(
			id,
			setTimeout(() => dismissToast(id), options.duration ?? 2400)
		);
	}
	return id;
}

export function dismissToast(id?: number): void {
	if (id === undefined) {
		for (const timer of dismissTimers.values()) clearTimeout(timer);
		dismissTimers.clear();
		toasts = [];
		return;
	}
	const timer = dismissTimers.get(id);
	if (timer) clearTimeout(timer);
	dismissTimers.delete(id);
	toasts = toasts.filter((item) => item.id !== id);
}
