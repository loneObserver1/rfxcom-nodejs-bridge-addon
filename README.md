# RFXCOM Node.js Bridge Add-on pour Home Assistant

Add-on Home Assistant pour contrôler les appareils RFXCOM via le protocole ARC et autres protocoles supportés.

## Prérequis

### Installation de MQTT

**IMPORTANT** : Cet add-on nécessite que l'add-on MQTT (Mosquitto) soit installé et démarré dans Home Assistant pour créer automatiquement les entités.

1. Allez dans **Paramètres** → **Modules complémentaires** → **Boutique des modules complémentaires**
2. Recherchez **MQTT** ou **Mosquitto broker**
3. Installez l'add-on **Mosquitto broker**
4. Démarrez l'add-on
5. Configurez-le avec les paramètres par défaut (aucune authentification nécessaire dans le réseau Docker)

L'add-on RFXCOM Node.js Bridge se connectera automatiquement au broker MQTT via `core-mosquitto:1883`.

## Installation

1. Ajoutez ce dépôt dans Home Assistant :
   - Allez dans **Paramètres** → **Modules complémentaires** → **Boutique des modules complémentaires**
   - Cliquez sur les trois points en haut à droite → **Dépôts**
   - Ajoutez l'URL de ce dépôt
   - Cliquez sur **Ajouter**

2. Installez l'add-on **RFXCOM Node.js Bridge**

3. Configurez l'add-on :
   - **Port série** : Sélectionnez votre émetteur RFXCOM (ex: `/dev/serial/by-id/usb-RFXCOM_RFXtrx433_...`)
   - **Niveau de log** : `info` (ou `debug` pour plus de détails)
   - **Détection automatique** : `true` pour détecter automatiquement les nouveaux appareils
   - **Port API** : `8888` (par défaut)

4. Démarrez l'add-on

## Utilisation

### Ajouter un appareil ARC (volet roulant)

#### Méthode 1 : Via l'API HTTP

1. **Créer l'appareil** :
```bash
curl -X POST http://localhost:8888/api/devices/arc \
  -H "Content-Type: application/json" \
  -d '{"name": "Volet Salon"}'
```

L'add-on trouvera automatiquement un house code et unit code libre.

2. **Mettre l'appareil en mode appairage** :
   - Suivez les instructions de votre volet roulant pour le mettre en mode appairage

3. **Envoyer la commande d'appairage** :
```bash
curl -X POST http://localhost:8888/api/devices/arc/pair \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "ARC_A_1"}'
```

4. **Confirmer l'appairage** :
```bash
curl -X POST http://localhost:8888/api/devices/arc/confirm-pair \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "ARC_A_1", "confirmed": true}'
```

5. **Tester les commandes** :
```bash
# Tester ON (monter)
curl -X POST http://localhost:8888/api/devices/arc/test \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "ARC_A_1", "command": "on"}'

# Tester OFF (descendre)
curl -X POST http://localhost:8888/api/devices/arc/test \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "ARC_A_1", "command": "off"}'
```

#### Méthode 2 : Détection automatique

Si la détection automatique est activée, l'add-on détectera automatiquement les nouveaux appareils ARC lorsqu'ils envoient des signaux.

### Contrôler depuis Home Assistant

Une fois l'appareil ajouté, une entité de type **volet** (`cover`) sera automatiquement créée dans Home Assistant via MQTT.

Vous pouvez la contrôler depuis l'interface Home Assistant :
- **Monter** : Ouvre le volet
- **Descendre** : Ferme le volet
- **Arrêter** : Arrête le mouvement

## API HTTP

L'add-on expose une API HTTP sur le port configuré (par défaut 8888) :

### Endpoints disponibles

- `GET /health` - Health check
- `GET /api/devices` - Liste tous les appareils
- `GET /api/devices/:id` - Obtenir un appareil spécifique
- `POST /api/devices/arc` - Ajouter un appareil ARC
- `POST /api/devices/arc/pair` - Envoyer la commande d'appairage
- `POST /api/devices/arc/confirm-pair` - Confirmer l'appairage
- `POST /api/devices/arc/test` - Tester un appareil (commandes: `on`, `off`, `up`, `down`, `stop`)
- `DELETE /api/devices/:id` - Supprimer un appareil

## Dépannage

### L'add-on ne se connecte pas à MQTT

1. Vérifiez que l'add-on MQTT (Mosquitto) est installé et démarré
2. Vérifiez les logs de l'add-on RFXCOM pour voir les erreurs de connexion
3. Le broker MQTT doit être accessible via `core-mosquitto:1883` depuis le réseau Docker

### Les entités Home Assistant ne sont pas créées

1. Vérifiez que MQTT est bien connecté (regardez les logs)
2. Vérifiez que l'appareil a bien été ajouté : `GET /api/devices`
3. Les entités sont créées automatiquement lors de l'ajout d'un appareil ARC

### Le port série n'est pas détecté

1. Vérifiez que l'émetteur RFXCOM est bien branché
2. Redémarrez l'add-on après avoir branché l'émetteur
3. Vérifiez les permissions sur le port série dans les logs

## Support

Pour plus d'informations, consultez les logs de l'add-on dans Home Assistant.



