# Guide de test local de l'add-on

## Pourquoi tester localement ?

Tester le build Docker localement permet de :
- Détecter les erreurs de build avant de les pousser sur GitHub
- Vérifier que le Dockerfile est correct
- Tester l'add-on sans passer par Home Assistant Supervisor
- Déboguer plus rapidement

## Méthode 1: Test du build Docker

### Étape 1: Tester le build

```bash
cd rfxcom-nodejs-bridge
./test-build.sh
```

Ou manuellement :

```bash
cd rfxcom-nodejs-bridge
docker build --build-arg BUILD_FROM=node:20-alpine -t rfxcom-test .
```

### Étape 2: Tester l'image

```bash
# Tester l'image (sans port série réel)
docker run --rm -it -p 8888:8888 rfxcom-test

# Ou avec un port série (si disponible)
docker run --rm -it \
  --device=/dev/ttyUSB0 \
  -p 8888:8888 \
  -e PORT=/dev/ttyUSB0 \
  -e API_PORT=8888 \
  rfxcom-test
```

### Étape 3: Tester l'API

Dans un autre terminal :

```bash
# Test health
curl http://localhost:8888/health

# Test init
curl -X POST http://localhost:8888/api/init \
  -H "Content-Type: application/json" \
  -d '{"port": "/dev/ttyUSB0"}'
```

## Méthode 2: Test dans Home Assistant local (Docker)

### Étape 1: Copier l'add-on dans le répertoire local

```bash
# Depuis votre projet
cd /Users/thibault.boulay/rfxcom-auto

# Copier l'add-on dans ha_config/local_addons
mkdir -p ha_config/local_addons
cp -r addon/rfxcom-nodejs-bridge ha_config/local_addons/rfxcom-nodejs-bridge
```

### Étape 2: Redémarrer Home Assistant

```bash
docker compose restart homeassistant
```

### Étape 3: Vérifier dans Home Assistant

1. Allez dans **Paramètres > Modules complémentaires**
2. Cliquez sur **"Add-on store"** (bouton en bas à droite)
3. Cliquez sur les **trois points** (⋮) en haut à droite
4. Cliquez sur **"Rechercher des mises à jour"**
5. L'add-on devrait apparaître dans **"Local add-ons"**

### Étape 4: Installer et démarrer

1. Cliquez sur l'add-on
2. Cliquez sur **"Installer"**
3. Configurez le port série si nécessaire
4. Cliquez sur **"Démarrer"**

## Méthode 3: Test direct avec Docker Compose

Créez un `docker-compose.test.yml` :

```yaml
version: '3.8'

services:
  rfxcom-bridge:
    build:
      context: ./rfxcom-nodejs-bridge
      args:
        BUILD_FROM: node:20-alpine
    container_name: rfxcom-bridge-test
    ports:
      - "8888:8888"
    devices:
      - /dev/ttyUSB0:/dev/ttyUSB0
    environment:
      - PORT=/dev/ttyUSB0
      - API_PORT=8888
    restart: unless-stopped
```

Puis :

```bash
docker compose -f docker-compose.test.yml up --build
```

## Dépannage

### Erreur de build

Si le build échoue, vérifiez :
1. Que le Dockerfile est valide
2. Que tous les fichiers sont présents (package.json, rfxcom_bridge_server.js)
3. Les logs de build : `docker build --progress=plain -t test .`

### L'add-on n'apparaît pas dans Home Assistant

1. Vérifiez que l'add-on est dans `ha_config/local_addons/rfxcom-nodejs-bridge`
2. Vérifiez que `config.yaml` est présent (pas `config.json`)
3. Vérifiez que le YAML est valide : `python3 -c "import yaml; yaml.safe_load(open('config.yaml'))"`
4. Redémarrez Home Assistant
5. Rafraîchissez le cache du navigateur (Ctrl+F5 ou Cmd+Shift+R)

### Erreur "An unknown error occurred while trying to build"

Consultez les logs du supervisor :
```bash
# Depuis le conteneur Home Assistant
docker exec -it homeassistant-test bash
ha supervisor logs | tail -100
```

Ou depuis l'interface :
- **Paramètres > Système > Logs > Superviseur**

## Commandes utiles

### Vérifier la structure
```bash
cd rfxcom-nodejs-bridge
ls -la
# Doit contenir: Dockerfile, config.yaml, build.json, package.json, rfxcom_bridge_server.js
```

### Valider le YAML
```bash
python3 -c "import yaml; yaml.safe_load(open('config.yaml'))"
```

### Tester le build avec logs détaillés
```bash
docker build --progress=plain --no-cache -t test .
```

### Nettoyer les images de test
```bash
docker rmi rfxcom-test test
```

