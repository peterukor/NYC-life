# NYC Life server (server/): accounts, cloud saves, leaderboards, gallery,
# transfers and the real-time city rooms. One container, one port.
#
#   docker build -t nyc-life-server .
#   docker run -p 2567:2567 -v nyc-data:/data -e GAME_URL=https://peterukor.github.io/NYC-life/ nyc-life-server
#
# Keep /data on a persistent volume: it holds the SQLite database.
FROM node:22-slim
WORKDIR /app
# The server shares the game's clock (game days, seasons).
COPY src/core ./src/core
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev && npm cache clean --force
COPY server/src ./server/src
WORKDIR /app/server
ENV NODE_ENV=production PORT=2567 DB_PATH=/data/nyc-life.db TRUST_PROXY=1
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
