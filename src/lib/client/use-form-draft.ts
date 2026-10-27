"use client";
import { useEffect, useRef, useState } from "react";
export function useFormDraft(key: string, watch: any, reset: any, getValues: any) {
    const [notice, setNotice] = useState("");
    const stopped = useRef(false);
    useEffect(() => {
        stopped.current = false;
        try {
            const draft = JSON.parse(sessionStorage.getItem(key) || "null");
            if (draft?.expires > Date.now() && draft.values && typeof draft.values === "object") {
                reset({ ...getValues(), ...draft.values, termsAccepted: false, declarationAccepted: false });
                setNotice("Your draft was restored on this device. Review your answers and accept the declaration again.");
            }
        } catch { setNotice("Draft storage is unavailable on this device. Keep this page open until submission is confirmed."); }
        const subscription = watch((values: any) => {
            if (stopped.current) return;
            try { sessionStorage.setItem(key, JSON.stringify({ expires: Date.now() + 86400000, values })); }
            catch { setNotice("Draft could not be saved on this device. Your current answers remain on this page."); }
        });
        return () => subscription.unsubscribe();
    }, [key, watch, reset, getValues]);
    return { notice, clear: () => { stopped.current = true; try { sessionStorage.removeItem(key); } catch { } } };
}
