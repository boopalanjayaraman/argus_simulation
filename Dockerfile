# Argus Simulator (sender serves the built web app). Build from repo root.
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY src/apps/web/package.json src/apps/web/package-lock.json src/apps/web/
RUN cd src/apps/web && npm ci
COPY src/apps/sender/package.json src/apps/sender/package-lock.json src/apps/sender/
RUN cd src/apps/sender && npm ci
COPY src/apps/web src/apps/web
COPY src/apps/sender src/apps/sender
RUN cd src/apps/web && npm run build && cd ../sender && npm run build

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production SIM_PORT=4173
COPY --from=build /app/src/apps/sender/package.json /app/src/apps/sender/package-lock.json src/apps/sender/
RUN cd src/apps/sender && npm ci --omit=dev
COPY --from=build /app/src/apps/sender/dist src/apps/sender/dist
COPY --from=build /app/src/apps/web/dist src/apps/web/dist
COPY src/available_simulations.json src/available_simulations.json
COPY simulated_data simulated_data
EXPOSE 4173
CMD ["node", "src/apps/sender/dist/server.js"]
