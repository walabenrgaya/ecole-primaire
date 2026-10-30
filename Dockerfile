# =====================================================================
# DOCKERFILE MULTI-STAGE POUR APPLICATION MERN MONO-ÉCOLE
# Conforme aux Chapitres 13, 15 et 18 du Cahier des Charges
# =====================================================================

# --- Étape 1 : Build du client React ---
FROM node:20-alpine AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# --- Étape 2 : Image d'exécution de production ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Installation des dépendances serveur
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci --only=production

# Copie du code serveur et de la base de données
COPY server/ ./
COPY database/ /app/database/

# Copie des fichiers statiques compilés du client
COPY --from=client-builder /app/client/dist /app/client/dist

# Création du dossier d'uploads avec permissions adéquates
RUN mkdir -p uploads && chown -R node:node /app

USER node

EXPOSE 5000

CMD ["node", "index.js"]
