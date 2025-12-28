FROM node:20-alpine

# Installer les dépendances système nécessaires
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    linux-headers \
    udev

# Créer le répertoire de travail
WORKDIR /app

# Copier package.json et installer les dépendances
COPY package.json ./
RUN npm install --production

# Copier le code de l'application
COPY rfxcom_bridge_server.js ./

# Exposer le port de l'API
EXPOSE 8888

# Démarrer le serveur
CMD ["node", "rfxcom_bridge_server.js"]

