# Argus Simulator (sender serves the built web app). Build from repo root.
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY apps/web/package.json apps/web/package-lock.json apps/web/
RUN cd apps/web && npm ci
COPY apps/sender/package.json apps/sender/package-lock.json apps/sender/
RUN cd apps/sender && npm ci
COPY apps/web apps/web
COPY apps/sender apps/sender
RUN cd apps/web && npm run build && cd ../sender && npm run build

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production SIM_PORT=4173
COPY --from=build /app/apps/sender/package.json /app/apps/sender/package-lock.json apps/sender/
RUN cd apps/sender && npm ci --omit=dev
COPY --from=build /app/apps/sender/dist apps/sender/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY src/available_simulations.json src/available_simulations.json
COPY simulated_data simulated_data
EXPOSE 4173
CMD ["node", "apps/sender/dist/server.js"]
