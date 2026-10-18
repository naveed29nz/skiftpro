import { useEffect, useState } from "react";
import { createToastStore } from "@/components/ui/toast-store";

const store = createToastStore();

function toast(props) {
  return store.toast(props);
}

function useToast() {
  const [state, setState] = useState(store.getState());

  useEffect(() => store.subscribe(setState), []);

  return {
    ...state,
    toast,
    dismiss: store.dismiss,
  };
}

export { useToast, toast };
