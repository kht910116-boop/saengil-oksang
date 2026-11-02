FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=8787 DB_PATH=/app/data/rooftop.db
VOLUME ["/app/data"]
EXPOSE 8787
CMD ["node", "--no-warnings", "server/index.js"]
