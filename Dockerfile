FROM node:20-alpine
WORKDIR /app
COPY server.js ./
COPY index.html ./public/index.html
ENV PORT=3001 DATA_DIR=/data TZ=Europe/Stockholm
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:${PORT}/healthz || exit 1
CMD ["node", "server.js"]
