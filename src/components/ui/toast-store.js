export const TOAST_LIMIT = 20;
export const DEFAULT_TOAST_DURATION_MS = 5000;
export const TOAST_REMOVE_DELAY_MS = 300;

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
};

export function toastReducer(state, action) {
  switch (action.type) {
    case actionTypes.ADD_TOAST:
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case actionTypes.UPDATE_TOAST:
      return {
        ...state,
        toasts: state.toasts.map((item) =>
          item.id === action.toast.id ? { ...item, ...action.toast } : item
        ),
      };

    case actionTypes.DISMISS_TOAST:
      return {
        ...state,
        toasts: state.toasts.map((item) =>
          item.id === action.toastId || action.toastId === undefined
            ? { ...item, open: false }
            : item
        ),
      };

    case actionTypes.REMOVE_TOAST:
      if (action.toastId === undefined) {
        return { ...state, toasts: [] };
      }
      return {
        ...state,
        toasts: state.toasts.filter((item) => item.id !== action.toastId),
      };

    default:
      return state;
  }
}

export function createToastStore({
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  let count = 0;
  let memoryState = { toasts: [] };
  const listeners = new Set();
  const dismissTimers = new Map();
  const removeTimers = new Map();

  function emit() {
    for (const listener of listeners) listener(memoryState);
  }

  function clearTimer(timers, toastId) {
    const handle = timers.get(toastId);
    if (handle === undefined) return;
    cancel(handle);
    timers.delete(toastId);
  }

  function dropDetached(ids) {
    for (const id of ids) {
      if (memoryState.toasts.some((item) => item.id === id)) continue;
      clearTimer(dismissTimers, id);
      clearTimer(removeTimers, id);
    }
  }

  function removeLater(toastId) {
    if (removeTimers.has(toastId)) return;
    const handle = schedule(() => {
      removeTimers.delete(toastId);
      memoryState = toastReducer(memoryState, {
        type: actionTypes.REMOVE_TOAST,
        toastId,
      });
      emit();
    }, TOAST_REMOVE_DELAY_MS);
    removeTimers.set(toastId, handle);
  }

  function dismiss(toastId) {
    const ids = toastId === undefined
      ? memoryState.toasts.map((item) => item.id)
      : [toastId];
    for (const id of ids) clearTimer(dismissTimers, id);
    memoryState = toastReducer(memoryState, {
      type: actionTypes.DISMISS_TOAST,
      toastId,
    });
    emit();
    for (const id of ids) removeLater(id);
  }

  function toast(props) {
    count = (count + 1) % Number.MAX_SAFE_INTEGER;
    const id = count.toString();
    const duration = props.duration === undefined
      ? DEFAULT_TOAST_DURATION_MS
      : props.duration;
    const previousIds = memoryState.toasts.map((item) => item.id);

    memoryState = toastReducer(memoryState, {
      type: actionTypes.ADD_TOAST,
      toast: {
        ...props,
        id,
        open: true,
        onOpenChange: (open) => {
          if (!open) dismiss(id);
        },
      },
    });
    emit();
    dropDetached(previousIds);

    if (Number.isFinite(duration) && duration >= 0) {
      const handle = schedule(() => {
        dismissTimers.delete(id);
        dismiss(id);
      }, duration);
      dismissTimers.set(id, handle);
    }

    return {
      id,
      dismiss: () => dismiss(id),
      update: (next) => {
        memoryState = toastReducer(memoryState, {
          type: actionTypes.UPDATE_TOAST,
          toast: { ...next, id },
        });
        emit();
      },
    };
  }

  return {
    toast,
    dismiss,
    getState: () => memoryState,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
