"use client";

import { useCallback, useEffect, useState } from "react";

import type { ApiClient } from "@/api/client";

export type PushOptInState =
  | "loading"
  | "unsupported"
  | "ios_install"
  | "blocked"
  | "off"
  | "on";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

function isIosOutsideStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  if (!isIos) return false;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return !standalone;
}

export function usePushOptIn({
  api,
  subscribePath,
  enabled = true,
}: {
  api: ApiClient;
  subscribePath:
    | "/api/v1/notifications/push-subscriptions/"
    | "/api/v1/doctor/notifications/push-subscriptions/"
    | "/api/v1/admin/notifications/push-subscriptions/";
  enabled?: boolean;
}) {
  const [state, setState] = useState<PushOptInState>("loading");
  const [publicKey, setPublicKey] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let active = true;
    const controller = new AbortController();

    async function check() {
      await Promise.resolve();
      if (!active) return;
      if (isIosOutsideStandalone()) {
        setState("ios_install");
        return;
      }
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }
      try {
        const { data } = await api.GET("/api/v1/push/public-key/", {
          signal: controller.signal,
        });
        if (!active) return;
        if (!data?.enabled || !data.public_key) {
          setState("unsupported");
          return;
        }
        setPublicKey(data.public_key);
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (active) setState(sub ? "on" : "off");
      } catch {
        if (active && !controller.signal.aborted) setState("unsupported");
      }
    }

    void check();
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, enabled]);

  const turnOn = useCallback(async () => {
    if (!publicKey || busy) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("blocked");
        return;
      }
      if (permission !== "granted") {
        setState("off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setState("off");
        return;
      }
      const { response } = await api.POST(subscribePath, {
        body: {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        },
      });
      if (response.ok) {
        setState("on");
      }
    } finally {
      setBusy(false);
    }
  }, [api, busy, publicKey, subscribePath]);

  const turnOff = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      const endpoint = sub?.endpoint ?? "";
      await sub?.unsubscribe();
      await api.DELETE(subscribePath, {
        params: { query: endpoint ? { endpoint } : undefined },
      });
      setState("off");
    } finally {
      setBusy(false);
    }
  }, [api, busy, subscribePath]);

  return { state: enabled ? state : "loading", busy, turnOn, turnOff };
}
