# RFXCOM Node.js Bridge Add-on

Add-on Home Assistant pour le bridge Node.js RFXCOM.

## Installation depuis Git

Cet add-on peut être installé depuis un dépôt Git :

```bash
# Dans Home Assistant, ajoutez le dépôt dans Paramètres > Modules complémentaires > Dépôts
# URL du dépôt: https://github.com/votre-username/rfxcom-nodejs-bridge-addon
```

## Installation manuelle

1. Clonez ce dépôt dans `ha_config/local_addons/` :
```bash
cd ha_config/local_addons
git clone https://github.com/votre-username/rfxcom-nodejs-bridge-addon rfxcom-nodejs-bridge
```

2. Dans Home Assistant, allez dans **Paramètres > Modules complémentaires > Dépôts de modules complémentaires**.

3. Ajoutez le dépôt local ou installez l'add-on manuellement.

4. Installez et démarrez l'add-on **RFXCOM Node.js Bridge**.

## Configuration

L'add-on peut être configuré via l'interface Home Assistant :

- **Port série** : Le port USB du module RFXCOM (par défaut: `/dev/ttyUSB0`)
- **Port API** : Le port HTTP pour l'API (par défaut: `8888`)

## API

L'add-on expose une API HTTP REST sur le port configuré (par défaut 8888).

### Health Check

```http
GET /health
```

Retourne l'état de l'add-on et le port série configuré.

### Envoyer une commande

```http
POST /api/command
Content-Type: application/json

{
  "protocol": "AC",
  "device_id": "02382C82",
  "unit_code": 1,
  "command": "on"
}
```

**Paramètres :**
- `protocol` (requis) : Le protocole RFXCOM (ARC, AC, PT2262, etc.)
- `device_id` (optionnel) : L'ID de l'appareil (pour Lighting2-6)
- `house_code` (optionnel) : Le code maison (pour Lighting1)
- `unit_code` (optionnel) : Le code unité
- `command` (requis) : La commande (`on`, `off`, `pair`)

**Réponse :**
```json
{
  "status": "success"
}
```

## Protocoles supportés

- **Lighting1** : ARC, X10, ABICOD, WAVEMAN, EMW100, IMPULS, RISINGSUN, PHILIPS, ENERGENIE, ENERGENIE_5, COCOSTICK
- **Lighting2** : AC, HOMEEASY_EU, ANSLUT, KAMBROOK
- **Lighting3** : IKEA_KOPPLA
- **Lighting4** : PT2262
- **Lighting5** : LIGHTWAVERF, EMW100_GDO, BBSB, RSL, LIVOLO, TRC02, AOKE, RGB_TRC02
- **Lighting6** : BLYSS

## Utilisation avec le plugin Python

Le plugin Python Home Assistant détecte automatiquement si l'add-on est disponible et l'utilise à la place du subprocess Node.js local.

## Développement

Pour construire l'image Docker localement :

```bash
cd addon/rfxcom-nodejs-bridge
docker build -t rfxcom-nodejs-bridge-amd64 .
```

Pour tester l'add-on localement :

```bash
docker run -it --rm \
  --device=/dev/ttyUSB0 \
  -p 8888:8888 \
  -e PORT=/dev/ttyUSB0 \
  -e API_PORT=8888 \
  rfxcom-nodejs-bridge-amd64
```

## Dépannage

### L'add-on ne démarre pas

- Vérifiez que le port série est correctement configuré
- Vérifiez les logs de l'add-on dans Home Assistant

### Erreur de connexion depuis le plugin Python

- Vérifiez que l'add-on est démarré
- Vérifiez que le port API (8888 par défaut) est accessible
- Vérifiez les logs du plugin Python pour plus de détails
