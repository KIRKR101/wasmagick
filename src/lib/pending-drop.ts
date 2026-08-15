let pending: File | null = null;

export function stashPendingFile(file: File): void {
	pending = file;
}

export function takePendingFile(): File | null {
	const file = pending;
	pending = null;
	return file;
}
