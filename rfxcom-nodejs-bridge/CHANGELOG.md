# Changelog

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [2.0.8] - 2025-12-29

### ✨ Nouvelles fonctionnalités
- **Choix du type d'appareil indépendant du protocole RFXCOM** :
  - Ajout du champ `haDeviceType` (volet/prise/capteur) pour contrôler comment l'appareil apparaît dans Home Assistant
  - Les volets AC peuvent maintenant être configurés comme `cover` dans Home Assistant
  - Les prises ARC peuvent maintenant être configurées comme `switch` dans Home Assistant
  - Sélecteur de type dans le formulaire d'ajout d'appareil
  - Bouton "Modifier type" pour changer le type d'un appareil existant
  - Mise à jour automatique de la découverte MQTT lors du changement de type

### 🔧 Corrections
- Correction du gestionnaire MQTT pour utiliser `haDeviceType` au lieu du protocole uniquement
- Correction du format `deviceIdFormatted` pour AC : `0x{deviceId}/{unitCode}`
- Suppression de la duplication dans `removeDiscovery()`

### 🛠️ Améliorations
- Migration automatique pour les appareils existants sans `haDeviceType`
- Fonction `publishDeviceDiscovery()` unifiée pour gérer tous les types
- Gestion correcte des commandes MQTT selon le type HA (cover/switch)

## [2.0.7] - 2025-12-29

### 🔧 Corrections
- **Correction de la prise en compte des valeurs saisies pour les appareils AC** :
  - Les valeurs Device ID et Unit Code saisies dans le formulaire sont maintenant correctement utilisées
  - Gestion correcte du cas `unitCode = 0` (valeur valide)
  - Amélioration de la validation et normalisation des valeurs
  - Logs ajoutés pour tracer les valeurs reçues et utilisées
- **Correction de l'erreur de renommage** : Fonction `fetchDevices()` corrigée pour convertir l'objet en tableau

### 🛠️ Améliorations
- Amélioration de la logique de vérification des valeurs dans le backend
- Validation explicite des valeurs du formulaire dans le frontend
- Conversion en majuscules automatique pour Device ID

### 📝 Documentation
- Ajout des fichiers de test (`test_*.js`) au suivi Git
- Retrait de `test_*.js` du `.gitignore`

## [2.0.6] - 2025-12-29

### 🔧 Corrections
- **Correction de l'erreur de renommage** : Ajout de la fonction `fetchDevices()` manquante dans le frontend
- **Amélioration de la gestion du port série RFXCOM** : 
  - Fermeture propre du port avec retrait des listeners avant fermeture
  - Handlers d'événements (`error`, `disconnect`) attachés après l'initialisation
  - Délai avant `process.exit()` pour permettre la fermeture propre
  - Correction des problèmes de crash de Home Assistant liés au port série

### 🛠️ Améliorations
- Fonction `closeRFXCOM()` dédiée pour une fermeture propre du port série
- Gestion améliorée des erreurs de connexion série
- Retrait automatique des listeners avant fermeture pour éviter les fuites mémoire

## [2.0.5] - 2025-12-29

### 🛠️ Améliorations
- Amélioration de la gestion des messages MQTT depuis Home Assistant
- Logs de debug détaillés pour diagnostiquer les problèmes MQTT
- Handler de messages attaché après la connexion MQTT pour garantir la réception
- Protection contre l'attachement multiple du handler MQTT
- Conversion explicite des messages en string avec trim()

## [2.0.4] - 2025-12-29

### 🔧 Corrections
- Correction du bug où les commandes OFF modifiaient l'état d'appairage
- Les commandes ON/OFF/STOP n'affectent plus l'état d'appairage
- L'état `paired` n'est modifié que par les endpoints `/pair` et `/unpair`

## [2.0.3] - 2025-12-29

### ✨ Nouvelles fonctionnalités
- Ajout de la fonctionnalité de renommage d'appareils
- Bouton "Renommer" dans l'interface web pour chaque appareil
- Mise à jour automatique de la découverte Home Assistant après renommage
- Endpoint `PUT /api/devices/:id/rename` pour renommer un appareil

## [2.0.2] - 2025-12-29

### ✨ Nouvelles fonctionnalités
- Génération automatique de codes pour ARC et AC si champs vides
- Fonctions `findFreeArcCode()` et `findFreeAcCode()` pour trouver des codes libres
- Processus d'appairage amélioré avec confirmation utilisateur
- Endpoints de confirmation d'appairage (`/api/devices/arc/confirm-pair`, `/api/devices/ac/confirm-pair`)
- Champs House Code/Unit Code et Device ID/Unit Code optionnels avec "Auto" par défaut

### 🔧 Corrections
- Correction des deviceId MQTT (ARC_ et AC_ en majuscules) pour correspondre aux IDs dans devices
- Synchronisation frontend/backend améliorée

## [2.0.1] - 2025-12-29

### ✨ Nouvelles fonctionnalités
- Support des volets ARC avec commandes UP/DOWN/STOP
- Support des prises AC (DIO Chacon) avec commandes ON/OFF
- Intégration MQTT Home Assistant avec découverte automatique
- Interface web pour gérer les appareils
- API REST pour contrôler les appareils

### 🔧 Corrections
- Implémentation des méthodes wrapper `switchUp`, `switchDown`, `stop` pour ARC
- Mapping correct des commandes ARC vers les méthodes Lighting1

---

## Format des versions

- **MAJOR** : Changements incompatibles avec l'API
- **MINOR** : Nouvelles fonctionnalités rétrocompatibles
- **PATCH** : Corrections de bugs rétrocompatibles

