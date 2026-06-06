importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Firebase client config values are public by design — security is enforced
// by Firebase Security Rules and App Check, not by hiding these keys.
firebase.initializeApp({
  apiKey: "AIzaSyDwIex86XMiqO5FIxl_Uhck1pbCX8O32yI",
  authDomain: "sky-drop-de459.firebaseapp.com",
  databaseURL: "https://sky-drop-de459-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sky-drop-de459",
  storageBucket: "sky-drop-de459.firebasestorage.app",
  messagingSenderId: "564551137643",
  appId: "1:564551137643:web:8d64159394b148fc09b42e",
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
