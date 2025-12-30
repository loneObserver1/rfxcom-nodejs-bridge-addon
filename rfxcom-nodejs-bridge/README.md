# RFXCOM Node.js Bridge - Guide d'utilisation

Bridge Node.js pour contrôler les appareils RFXCOM via les protocoles ARC et AC (DIO Chacon).

**Version actuelle : 2.0.8**

## 🆕 Nouveautés récentes

### Version 2.0.8
- **Choix du type d'appareil indépendant du protocole RFXCOM** : 
  - Ajout du champ `haDeviceType` (volet/prise/capteur) pour contrôler comment l'appareil apparaît dans Home Assistant
  - Les volets AC peuvent maintenant être configurés comme `cover` dans Home Assistant
  - Les prises ARC peuvent maintenant être configurées comme `switch` dans Home Assistant
  - Sélecteur de type dans le formulaire d'ajout d'appareil
  - Bouton "Modifier type" pour changer le type d'un appareil existant
  - Mise à jour automatique de la découverte MQTT lors du changement de type

### Version 2.0.7
- **Correction de la prise en compte des valeurs saisies** : Les Device ID et Unit Code saisis dans le formulaire sont maintenant correctement utilisés
- **Correction de l'erreur de renommage** : Fonction `fetchDevices()` corrigée pour convertir l'objet en tableau
- **Gestion correcte de unitCode = 0** : La valeur 0 est maintenant reconnue comme valide

### Version 2.0.6
- **Correction de l'erreur de renommage** : Fonction `fetchDevices()` ajoutée dans le frontend
- **Amélioration de la gestion du port série RFXCOM** : Fermeture propre du port avec retrait des listeners
- **Correction des problèmes de crash** : Gestion améliorée de la fermeture du port série pour éviter les crashes de Home Assistant

### Version 2.0.5
- Amélioration de la gestion des messages MQTT depuis Home Assistant
- Logs de debug détaillés pour diagnostiquer les problèmes MQTT
- Handler de messages attaché après la connexion MQTT pour garantir la réception

### Version 2.0.4
- Correction du bug où les commandes OFF modifiaient l'état d'appairage
- Les commandes ON/OFF n'affectent plus l'état d'appairage

### Version 2.0.3
- Ajout de la fonctionnalité de renommage d'appareils
- Mise à jour automatique de la découverte Home Assistant après renommage

### Version 2.0.2
- Génération automatique de codes (House Code/Unit Code pour ARC, Device ID/Unit Code pour AC)
- Processus d'appairage amélioré avec confirmation utilisateur
- Champs optionnels avec "Auto" par défaut dans l'interface

## 📋 Table des matières

- [Types d'appareils supportés](#types-dappareils-supportés)
- [Appairage des volets ARC](#appairage-des-volets-arc)
- [Appairage des prises AC (DIO Chacon)](#appairage-des-prises-ac-dio-chacon)
- [Commandes disponibles](#commandes-disponibles)
- [Gestion des appareils](#gestion-des-appareils)
- [Intégration Home Assistant](#intégration-home-assistant)
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
   - L'interface génère **automatiquement** un House Code et Unit Code non utilisés si vous ne les spécifiez pas
   - Vous pouvez aussi entrer manuellement un House Code (A-P) et Unit Code (1-16)
   - Format : `ARC_{HouseCode}_{UnitCode}` (ex: `ARC_A_1`)

2. **Mettre le volet en mode appairage**
   - Suivez les instructions du fabricant de votre volet
   - Généralement : maintenir un bouton pendant quelques secondes

3. **Cliquer sur "Appairer"**
   - L'interface envoie la commande **ON** (switchUp)
   - Vous serez invité à confirmer si le volet a répondu
   - Le volet est marqué comme appairé après confirmation
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

- **Génération automatique** : Si vous ne spécifiez pas de House Code/Unit Code, l'interface trouve automatiquement une combinaison libre
- **Commandes ON/OFF** : Les commandes ON/OFF n'affectent **pas** l'état d'appairage (corrigé en v2.0.4)
- **Appairage/Désappairage** : Seuls les boutons "Appairer" et "Désappairer" modifient l'état d'appairage

## 🔌 Appairage des prises AC (DIO Chacon)

### Principe
- **Appairage = action ON** : Envoyer la commande ON appaire la prise
- **Désappairage = action OFF** : Envoyer la commande OFF désappaire la prise

### Processus d'appairage

1. **Créer la prise dans l'interface**
   - L'interface génère **automatiquement** un Device ID et Unit Code non utilisés si vous ne les spécifiez pas
   - Vous pouvez aussi entrer manuellement un **Device ID** (ex: `02382C82`) et un **Unit Code** (ex: `2`)
   - Format : `AC_{DeviceID}_{UnitCode}` (ex: `AC_02382C82_2`)

2. **Mettre la prise en mode appairage**
   - Suivez les instructions du fabricant
   - Généralement : maintenir un bouton sur la prise ou la télécommande

3. **Cliquer sur "Appairer"**
   - L'interface envoie la commande **ON** (switchOn)
   - Vous serez invité à confirmer si la prise a répondu
   - La prise est marquée comme appairée après confirmation
   - La prise devrait répondre aux commandes

4. **Tester les commandes**
   - **ON** : Allume la prise
   - **OFF** : Éteint la prise

### Désappairage

- Cliquer sur "Désappairer" envoie la commande **OFF** (switchOff)
- La prise est marquée comme non appairée
- La prise ne répondra plus aux commandes

### Notes importantes

- **Génération automatique** : Si vous ne spécifiez pas de Device ID/Unit Code, l'interface trouve automatiquement une combinaison libre
- **Commandes ON/OFF** : Les commandes ON/OFF n'affectent **pas** l'état d'appairage (corrigé en v2.0.4)
- **Appairage/Désappairage** : Seuls les boutons "Appairer" et "Désappairer" modifient l'état d'appairage

## 🎮 Commandes disponibles

### Volets ARC

| Commande | Action | Méthode API | Effet sur l'appairage |
|----------|--------|-------------|----------------------|
| **ON** / **UP** | Monter le volet | `POST /api/devices/arc/:id/on` | Aucun effet |
| **OFF** / **DOWN** | Descendre le volet | `POST /api/devices/arc/:id/off` | Aucun effet |
| **STOP** | Arrêter le volet | `POST /api/devices/arc/:id/stop` | Aucun effet |

### Prises AC (DIO Chacon)

| Commande | Action | Méthode API | Effet sur l'appairage |
|----------|--------|-------------|----------------------|
| **ON** | Allumer la prise | `POST /api/devices/ac/:id/on` | Aucun effet |
| **OFF** | Éteindre la prise | `POST /api/devices/ac/:id/off` | Aucun effet |

> **Note** : Depuis la version 2.0.4, les commandes ON/OFF n'affectent plus l'état d'appairage. Seuls les boutons "Appairer" et "Désappairer" modifient cet état.

## 🛠️ Gestion des appareils

### Renommer un appareil

- Cliquez sur le bouton **"Renommer"** dans l'interface web
- Entrez le nouveau nom
- Le nom est mis à jour dans l'interface et dans Home Assistant (via MQTT)

### Supprimer un appareil

- Cliquez sur le bouton **"Supprimer"** dans l'interface web
- L'appareil est supprimé de la liste et la découverte Home Assistant est retirée

## 🏠 Intégration Home Assistant

### Découverte automatique

L'add-on publie automatiquement les entités Home Assistant via MQTT :

- **Volets ARC** : Créés comme entités `cover` dans Home Assistant
- **Prises AC** : Créées comme entités `switch` dans Home Assistant

### Commandes depuis Home Assistant

Les commandes envoyées depuis Home Assistant sont automatiquement reçues et traitées :

- **Volets ARC** : Commandes `OPEN`, `CLOSE`, `STOP` via MQTT
- **Prises AC** : Commandes `ON`, `OFF` via MQTT

### Configuration MQTT requise

- L'add-on MQTT (Mosquitto broker) doit être installé et démarré
- Les paramètres MQTT doivent être configurés dans l'add-on :
  - `mqtt_host` : Host du broker (par défaut : `core-mosquitto`)
  - `mqtt_port` : Port du broker (par défaut : `1883`)
  - `mqtt_user` : Utilisateur MQTT (optionnel)
  - `mqtt_password` : Mot de passe MQTT (optionnel)

### Dépannage MQTT

Si les commandes depuis Home Assistant ne fonctionnent pas :

1. Vérifiez que l'add-on MQTT est démarré
2. Vérifiez les logs de l'add-on pour voir si les messages MQTT sont reçus
3. Vérifiez que les topics de commande sont bien souscrits
4. Vérifiez les logs de debug pour voir le traitement des messages

## 🌐 API HTTP

### Endpoints ARC

- `POST /api/devices/arc` - Créer un volet ARC (génère automatiquement House Code/Unit Code si non fournis)
- `POST /api/devices/arc/pair` - Appairer un volet (envoie ON)
- `POST /api/devices/arc/confirm-pair` - Confirmer l'appairage d'un volet
- `POST /api/devices/arc/:id/unpair` - Désappairer un volet (envoie OFF)
- `POST /api/devices/arc/:id/on` - Monter le volet (ON/UP)
- `POST /api/devices/arc/:id/off` - Descendre le volet (OFF/DOWN)
- `POST /api/devices/arc/:id/stop` - Arrêter le volet
- `POST /api/devices/arc/:id/up` - Alias pour ON
- `POST /api/devices/arc/:id/down` - Alias pour OFF

### Endpoints AC

- `POST /api/devices/ac` - Créer une prise AC (génère automatiquement Device ID/Unit Code si non fournis)
- `POST /api/devices/ac/pair` - Appairer une prise (envoie ON)
- `POST /api/devices/ac/confirm-pair` - Confirmer l'appairage d'une prise
- `POST /api/devices/ac/:id/unpair` - Désappairer une prise (envoie OFF)
- `POST /api/devices/ac/:id/on` - Allumer la prise
- `POST /api/devices/ac/:id/off` - Éteindre la prise

### Endpoints généraux

- `GET /api/devices` - Liste tous les appareils
- `GET /api/devices/:id` - Obtenir un appareil spécifique
- `PUT /api/devices/:id/rename` - Renommer un appareil
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

1. **Appairage = ON** : Pour les deux types d'appareils, l'appairage se fait en envoyant ON via le bouton "Appairer"
2. **Désappairage = OFF** : Le désappairage se fait en envoyant OFF via le bouton "Désappairer"
3. **Commandes ON/OFF** : Les commandes ON/OFF n'affectent **pas** l'état d'appairage (depuis v2.0.4)
4. **Mode appairage** : L'appareil doit être en mode appairage avant d'envoyer la commande ON
5. **Génération automatique** : Les House Code/Unit Code (ARC) et Device ID/Unit Code (AC) sont générés automatiquement si non fournis
6. **Adresses uniques** : Chaque appareil doit avoir une adresse unique (House Code + Unit Code pour ARC, Device ID + Unit Code pour AC)
7. **Intégration MQTT** : Les entités Home Assistant sont créées automatiquement via MQTT discovery

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

