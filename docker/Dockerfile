# Headless Chromium with the Chrome DevTools Protocol exposed on :9222.
# Built once, then launched fresh by the backend each time you hit "Start Browser".
FROM zenika/alpine-chrome:latest

# Chrome 111+ ignores --remote-debugging-address and binds CDP to 127.0.0.1 only,
# so a Docker -p mapping can't reach it. socat bridges 0.0.0.0:9222 -> 127.0.0.1:9223.
USER root
RUN apk add --no-cache socat
USER chrome

EXPOSE 9222

# Start the bridge, then exec Chromium (headless) listening on localhost:9223.
#   --remote-allow-origins=*  required for Chrome 111+ to accept the CDP websocket
#   --no-sandbox              required inside a container
#   --disable-dev-shm-usage   avoids /dev/shm exhaustion crashes
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["socat TCP-LISTEN:9222,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:9223 & exec chromium-browser --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --remote-debugging-port=9223 --remote-allow-origins=* --window-size=1280,800 --hide-scrollbars about:blank"]
