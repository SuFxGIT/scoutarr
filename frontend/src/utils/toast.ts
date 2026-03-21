export type ToastItem = { id: string; variant: 'success' | 'error'; message: string };
type Listener = (item: ToastItem) => void;

const listeners = new Set<Listener>();
let _seq = 0;
function newId() { return `toast-${++_seq}`; }

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(item: ToastItem): void {
  listeners.forEach(fn => fn(item));
}

export function showErrorToast(message: string): void {
  emit({ id: newId(), variant: 'error', message });
}

export function showSuccessToast(message: string): void {
  emit({ id: newId(), variant: 'success', message });
}
