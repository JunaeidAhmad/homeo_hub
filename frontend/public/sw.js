self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "HomeoHub", body: event.data.text() };
  }
  const title = payload.title || "HomeoHub";
  const options = {
    body: payload.body || "",
    tag: payload.tag || "homeohub",
    icon: "/icons/icon-192.png",
    data: { url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client && client.url) {
              try {
                const full = new URL(targetUrl, self.location.origin).href;
                if (client.url !== full) return client.navigate(full);
              } catch {
                // Ignore invalid URL.
              }
            }
            return client;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      }),
  );
});
