FROM node:20-alpine
WORKDIR /app
COPY server.js ./
COPY index.html ./public/index.html
ENV PORT=3000 DATA_DIR=/data
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]
