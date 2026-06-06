importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Firebase config is injected at runtime via the query string when the
// service worker is registered (see PWAProvider.tsx).  This avoids
// hardcoding credentials in source control.
const params = new URL(self.location.href).searchParams;
firebase.initializeApp({
  apiKey: params.get("apiKey") || "",
  authDomain: params.get("authDomain") || "",
  databaseURL: params.get("databaseURL") || "",
  projectId: params.get("projectId") || "",
  storageBucket: params.get("storageBucket") || "",
  messagingSenderId: params.get("messagingSenderId") || "",
  appId: params.get("appId") || "",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { notification, data } = payload;
  const title = notification?.title || "Sky Drop";
  const options = {
    body: notification?.body || "",
    icon: "/icon-192.png",
    badge: "/favicon.svg",
    data: data || {},
    vibrate: [200, 100, 200],
    requireInteraction: true,
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === urlToOpen && "focus" in client) return client.focus();
      }
      return clients.openWindow(urlToOpen);
    })
  );
});
