import { toast as sonnerToast } from 'sonner';

/**
 * Error toast styling configuration
 */
const ERROR_TOAST_STYLE = {
  background: 'var(--red-9)',
  color: 'white',
  border: '1px solid var(--red-10)',
};

/**
 * Success toast styling configuration
 */
const SUCCESS_TOAST_STYLE = {
  background: 'var(--green-9)',
  color: 'white',
  border: '1px solid var(--green-10)',
};

/**
 * Display a standardized error toast
 */
export function showErrorToast(message: string) {
  sonnerToast.error(message, {
    style: ERROR_TOAST_STYLE,
  });
}

/**
 * Display a standardized success toast
 */
export function showSuccessToast(message: string) {
  sonnerToast.success(message, {
    style: SUCCESS_TOAST_STYLE,
  });
}

/**
 * Display a standardized info toast
 */
export function showInfoToast(message: string) {
  sonnerToast.info(message);
}

/**
 * Display a standardized warning toast
 */
export function showWarningToast(message: string) {
  sonnerToast.warning(message);
}
