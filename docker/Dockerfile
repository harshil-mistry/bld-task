# Headless Chromium with the Chrome DevTools Protocol exposed on :9222.
# Built once, then launched fresh by the backend each time you hit "Start Browser".
FROM zenika/alpine-chrome:latest

EXPOSE 9222

ENTRYPOINT ["chromium-browser"]

# --remote-allow-origins=* is REQUIRED for Chrome 111+ to accept the CDP websocket.
# --no-sandbox is required inside a container. --disable-dev-shm-usage avoids /dev/shm crashes.
CMD ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--remote-debugging-address=0.0.0.0", "--remote-debugging-port=9222", "--remote-allow-origins=*", "--window-size=1280,800", "--hide-scrollbars", "about:blank"]
