FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV VITE_ADSENSE_CLIENT=ca-pub-7221066669944864
ENV VITE_ADSENSE_BANNER_SLOT=3491229115
ENV VITE_ADSENSE_INLINE_SLOT=9792767798
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.cjs"]
