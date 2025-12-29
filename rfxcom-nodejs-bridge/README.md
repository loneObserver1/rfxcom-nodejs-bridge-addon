# RFXCOM Node.js Bridge - Guide d'utilisation

Bridge Node.js pour contrôler les appareils RFXCOM via les protocoles ARC et AC (DIO Chacon).

## 📋 Table des matières

- [Types d'appareils supportés](#types-dappareils-supportés)
- [Appairage des volets ARC](#appairage-des-volets-arc)
- [Appairage des prises AC (DIO Chacon)](#appairage-des-prises-ac-dio-chacon)
- [Commandes disponibles](#commandes-disponibles)
- [API HTTP](#api-http)

## 🔌 Types d'appareils supportés

### ARC (volets roulants)
- **Protocole** : Lighting1 - ARC
- **Adressage** : House Code (A-P) + Unit Code (1-16)
- **Commandes** : UP (monter), DOWN (descendre), STOP (arrêter)

### AC (prises/interrupteurs DIO Chacon)
- **Protocole** : Lighting2 - AC
- **Adressage** : Device ID (hexadécimal) + Unit Code (0-16)
- **Commandes** : ON (allumer), OFF (éteindre)

## 🔄 Appairage des volets ARC

### Principe
- **Appairage = action ON** : Envoyer la commande ON (switchUp) appaire le volet
- **Désappairage = action OFF** : Envoyer la commande OFF (switchDown) désappaire le volet

### Processus d'appairage

1. **Créer le volet dans l'interface**
   - L'interface génère automatiquement un House Code et Unit Code non utilisés
   - Format : `ARC_{HouseCode}_{UnitCode}` (ex: `ARC_A_1`)

2. **Mettre le volet en mode appairage**
   - Suivez les instructions du fabricant de votre volet
   - Généralement : maintenir un bouton pendant quelques secondes

3. **Cliquer sur "Appairer"**
   - L'interface envoie la commande **ON** (switchUp)
   - Le volet est automatiquement marqué comme appairé
   - Le volet devrait répondre aux commandes

4. **Tester les commandes**
   - **ON/UP** : Monte le volet
   - **OFF/DOWN** : Descend le volet
   - **STOP** : Arrête le volet

### Désappairage

- Cliquer sur "Désappairer" envoie la commande **OFF** (switchDown)
- Le volet est marqué comme non appairé
- Le volet ne répondra plus aux commandes

### Notes importantes

- **ON peut désappairer** : Si vous envoyez ON à un volet non appairé, il sera automatiquement appairé
- **OFF désappaire** : Si vous envoyez OFF à un volet appairé, il sera automatiquement désappairé
- Les commandes ON/OFF gèrent automatiquement l'état d'appairage

## 🔌 Appairage des prises AC (DIO Chacon)

### Principe
- **Appairage = action ON** : Envoyer la commande ON appaire la prise
- **Désappairage = action OFF** : Envoyer la commande OFF désappaire la prise

### Processus d'appairage

1. **Créer la prise dans l'interface**
   - Entrez un **Device ID** (ex: `02382C82`) et un **Unit Code** (ex: `2`)
   - Format : `AC_{DeviceID}_{UnitCode}` (ex: `AC_02382C82_2`)

2. **Mettre la prise en mode appairage**
   - Suivez les instructions du fabricant
   - Généralement : maintenir un bouton sur la prise ou la télécommande

3. **Cliquer sur "Appairer"**
   - L'interface envoie la commande **ON** (switchOn)
   - La prise est automatiquement marquée comme appairée
   - La prise devrait répondre aux commandes

4. **Tester les commandes**
   - **ON** : Allume la prise
   - **OFF** : Éteint la prise

### Désappairage

- Cliquer sur "Désappairer" envoie la commande **OFF** (switchOff)
- La prise est marquée comme non appairée
- La prise ne répondra plus aux commandes

### Notes importantes

- **ON peut désappairer** : Si vous envoyez ON à une prise non appairée, elle sera automatiquement appairée
- **OFF désappaire** : Si vous envoyez OFF à une prise appairée, elle sera automatiquement désappairée
- Les commandes ON/OFF gèrent automatiquement l'état d'appairage

## 🎮 Commandes disponibles

### Volets ARC

| Commande | Action | Méthode API | Effet sur l'appairage |
|----------|--------|-------------|----------------------|
| **ON** / **UP** | Monter le volet | `POST /api/devices/arc/:id/on` | Appaire si non appairé |
| **OFF** / **DOWN** | Descendre le volet | `POST /api/devices/arc/:id/off` | Désappaire si appairé |
| **STOP** | Arrêter le volet | `POST /api/devices/arc/:id/stop` | Aucun effet |

### Prises AC (DIO Chacon)

| Commande | Action | Méthode API | Effet sur l'appairage |
|----------|--------|-------------|----------------------|
| **ON** | Allumer la prise | `POST /api/devices/ac/:id/on` | Appaire si non appairée |
| **OFF** | Éteindre la prise | `POST /api/devices/ac/:id/off` | Désappaire si appairée |

## 🌐 API HTTP

### Endpoints ARC

- `POST /api/devices/arc` - Créer un volet ARC
- `POST /api/devices/arc/pair` - Appairer un volet (envoie ON)
- `POST /api/devices/arc/:id/unpair` - Désappairer un volet (envoie OFF)
- `POST /api/devices/arc/:id/on` - Monter le volet (ON/UP)
- `POST /api/devices/arc/:id/off` - Descendre le volet (OFF/DOWN)
- `POST /api/devices/arc/:id/stop` - Arrêter le volet
- `POST /api/devices/arc/:id/up` - Alias pour ON
- `POST /api/devices/arc/:id/down` - Alias pour OFF

### Endpoints AC

- `POST /api/devices/ac` - Créer une prise AC
- `POST /api/devices/ac/pair` - Appairer une prise (envoie ON)
- `POST /api/devices/ac/:id/unpair` - Désappairer une prise (envoie OFF)
- `POST /api/devices/ac/:id/on` - Allumer la prise
- `POST /api/devices/ac/:id/off` - Éteindre la prise

### Endpoints généraux

- `GET /api/devices` - Liste tous les appareils
- `GET /api/devices/:id` - Obtenir un appareil spécifique
- `DELETE /api/devices/:id` - Supprimer un appareil

## 📝 Exemples d'utilisation

### Appairer un volet ARC

```bash
# 1. Créer le volet
curl -X POST http://localhost:8889/api/devices/arc \
  -H "Content-Type: application/json" \
  -d '{"name": "Volet Salon"}'

# 2. Mettre le volet en mode appairage (manuellement)

# 3. Appairer (envoie ON)
curl -X POST http://localhost:8889/api/devices/arc/pair \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "ARC_A_1"}'

# 4. Tester
curl -X POST http://localhost:8889/api/devices/arc/ARC_A_1/on
```

### Appairer une prise AC

```bash
# 1. Créer la prise
curl -X POST http://localhost:8889/api/devices/ac \
  -H "Content-Type: application/json" \
  -d '{"name": "Prise Salon", "deviceId": "02382C82", "unitCode": 2}'

# 2. Mettre la prise en mode appairage (manuellement)

# 3. Appairer (envoie ON)
curl -X POST http://localhost:8889/api/devices/ac/pair \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "AC_02382C82_2"}'

# 4. Tester
curl -X POST http://localhost:8889/api/devices/ac/AC_02382C82_2/on
```

## ⚠️ Notes importantes

1. **Appairage = ON** : Pour les deux types d'appareils, l'appairage se fait en envoyant ON
2. **Désappairage = OFF** : Le désappairage se fait en envoyant OFF
3. **Gestion automatique** : Les commandes ON/OFF gèrent automatiquement l'état d'appairage
4. **Mode appairage** : L'appareil doit être en mode appairage avant d'envoyer la commande ON
5. **Adresses uniques** : Chaque appareil doit avoir une adresse unique (House Code + Unit Code pour ARC, Device ID + Unit Code pour AC)

## 🔧 Dépannage

### L'appareil ne répond pas après l'appairage

1. Vérifiez que l'appareil était bien en mode appairage
2. Réessayez l'appairage (ON)
3. Vérifiez les logs de l'add-on pour voir les erreurs

### L'appareil ne s'appaire pas

1. Vérifiez que l'adresse (House Code/Unit Code ou Device ID/Unit Code) est correcte
2. Vérifiez que le protocole ARC ou AC est activé dans votre RFXCOM
3. Vérifiez que l'appareil est compatible avec le protocole utilisé

### Les commandes ne fonctionnent pas

1. Vérifiez que l'appareil est bien appairé (statut dans l'interface)
2. Vérifiez que vous utilisez la bonne adresse
3. Vérifiez les logs pour voir si les commandes sont bien envoyées

