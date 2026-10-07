FROM node:20-alpine
WORKDIR /app
COPY server.js ./
COPY index.html ./public/index.html
ENV PORT=3001 DATA_DIR=/data TZ=Europe/Stockholm
VOLUME /data
EXPOSE 3001
CMD ["node", "server.js"]
