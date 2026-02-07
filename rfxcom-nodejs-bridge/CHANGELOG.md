# Changelog

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [2.1.14] - 2026-02-07

### 🔧 Corrections

- **Build Docker** : copie de `rfxcom_command_queue.js` dans l'image pour que l'add-on démarre dans Home Assistant (corrige « Cannot find module './rfxcom_command_queue' »)

## [2.1.13] - 2026-02-07

### 🛠️ Améliorations

- **Tests pour la file d'attente** : tests unitaires `rfxcom_command_queue.test.js` (init, jobs invalides, ARC/AC, traitement séquentiel, erreurs)
- **Queue** : try/catch autour des appels aux handlers pour ne pas bloquer la file en cas d’exception synchrone
- **Tests** : adaptation de `commands.test.js` (initCommandQueue, rfxtrxReady) et de `rfxcom_ready.test.js` (exception gérée via la queue)

## [2.1.12] - 2026-02-07

### 🛠️ Améliorations

- **File d'attente des commandes RFXCOM** :
  - Nouvelle file d'attente dans l'add-on : une seule commande est envoyée à la fois au module RFXCOM
  - Évite les timeouts « timed out waiting for response » lorsque plusieurs commandes arrivent en rafale (MQTT, API, scènes)
  - Toutes les commandes (MQTT switch/cover, API on/off/stop, pair/unpair) passent par cette file
  - Le module RFXCOM ne reçoit qu'une commande à la fois ; la suivante est envoyée après la fin (callback ou timeout) de la précédente

## [2.1.11] - 2025-01-02

### 🔧 Corrections

- **Correction du problème de doublons pour les sondes Alecto** :
  - Normalisation de l'ID des sondes pour éviter la création de plusieurs appareils pour la même sonde physique
  - Les IDs hexadécimaux sont maintenant normalisés (0x6A03, 6A03, 6a03 → 6A03)
  - Correction appliquée à la fois lors de la détection automatique et lors de la récupération depuis MQTT
  - Cela résout le problème où une même sonde créait plusieurs appareils dans Home Assistant avec des IDs différents

### 🛠️ Améliorations

- **Simplification des endpoints ARC** :
  - Suppression des endpoints redondants `/up` et `/down` pour les volets ARC
  - Seuls les endpoints `/on`, `/off` et `/stop` sont maintenant disponibles
  - Simplification de la logique de traitement des commandes

## [2.1.10] - 2025-01-02

### 🔧 Corrections

- **Correction majeure du problème avec AUTO_DISCOVERY activé** :
  - Identification du problème dans le package rfxcom : la queue de transmission (`TxQ`) ne démarre pas si `receiverstarted` n'est pas émis
  - Ajout d'un mécanisme de fallback pour forcer le démarrage de la queue de transmission si `initialising` reste à `true` après 5 secondes
  - Cela corrige définitivement le problème où les commandes ne fonctionnaient pas quand `auto_discovery` était activé
  - La queue de transmission est maintenant forcée à démarrer même si l'événement `receiverstarted` n'est pas émis

### 🛠️ Améliorations

- **Gestion améliorée de la queue de transmission RFXCOM** :
  - Détection automatique si la queue n'a pas été démarrée automatiquement
  - Démarrage forcé de la queue avec logs de diagnostic
  - Meilleure résilience face aux variations du comportement du package rfxcom

## [2.1.9] - 2025-01-02

### 🔧 Corrections

- **Correction du problème avec AUTO_DISCOVERY activé** :
  - Amélioration du fallback dans le handler 'ready' pour enregistrer les listeners si receiverstarted n'est pas émis
  - Ce fallback est crucial quand AUTO_DISCOVERY est activé car receiverstarted peut ne pas être émis dans certaines configurations
  - S'assurer que rfxtrxReady est marqué à true même si receiverstarted n'est pas émis
  - Les listeners sont maintenant enregistrés via le fallback si nécessaire
  - Ajout de logs de diagnostic pour identifier les problèmes d'initialisation

### 🛠️ Améliorations

- **Gestion améliorée de l'initialisation avec AUTO_DISCOVERY** :
  - Le fallback de 5 secondes enregistre maintenant aussi les listeners si receiverstarted n'est pas émis
  - Logs améliorés pour diagnostiquer les problèmes d'initialisation
  - Meilleure résilience quand AUTO_DISCOVERY est activé

## [2.1.8] - 2025-01-02

### 🔧 Corrections

- **Vérification que RFXCOM est prêt avant d'envoyer des commandes** :
  - Ajout d'un indicateur `rfxtrxReady` pour vérifier que le module RFXCOM est complètement prêt
  - Les commandes sont maintenant bloquées si RFXCOM n'est pas prêt (attente de l'événement `receiverstarted`)
  - Fallback après 5 secondes si l'événement `receiverstarted` n'est pas émis
  - Messages d'erreur clairs si une commande est envoyée avant que RFXCOM soit prêt

### 🛠️ Améliorations

- **Gestion de l'état de préparation RFXCOM** :
  - RFXCOM est marqué comme prêt quand l'événement `receiverstarted` est émis
  - Fallback automatique après 5 secondes si `receiverstarted` n'est pas émis (compatibilité avec certaines versions)
  - Logs améliorés pour indiquer clairement quand RFXCOM est prêt à recevoir des commandes
  - Vérification dans toutes les fonctions d'envoi de commandes (MQTT et API REST)

## [2.1.7] - 2025-01-02

### 🔧 Corrections

- **Amélioration du diagnostic des problèmes de connexion RFXCOM** :
  - Ajout de vérifications que `rfxtrx` est initialisé avant d'envoyer les commandes
  - Logs détaillés avant et après l'appel des méthodes `switchOn`/`switchOff`/`switchUp`/`switchDown`
  - Gestion des exceptions lors de l'appel des méthodes RFXCOM
  - Logs d'initialisation améliorés pour confirmer que les handlers sont créés

### 🛠️ Améliorations

- **Logs de diagnostic améliorés** :
  - Logs avant l'envoi de chaque commande au module RFXCOM
  - Confirmation que les méthodes sont appelées après l'invocation
  - Messages d'erreur plus détaillés si `rfxtrx` n'est pas initialisé
  - Logs pour identifier où se situe le problème dans la chaîne d'envoi des commandes

## [2.1.6] - 2025-12-30

### 🔧 Corrections

- **Fallback pour l'initialisation RFXCOM** :
  - Ajout d'un fallback si l'événement `ready` est émis mais que le callback `initialise` n'est pas appelé dans les 3 secondes
  - Certaines versions du package rfxcom ne déclenchent pas toujours le callback `initialise` même si `ready` est émis
  - Le fallback permet de continuer l'initialisation et de créer les handlers même si le callback n'est pas appelé
  - Cela corrige le problème où l'add-on attendait indéfiniment le callback `initialise` malgré l'émission de `ready`

- **Détection des échecs de connexion** :
  - Ajout d'un listener pour l'événement `connectfailed` pour détecter rapidement les échecs de connexion
  - Ajout d'un listener pour l'événement `connecting` pour améliorer les logs de debug
  - Meilleure gestion des erreurs pendant l'initialisation (warnings au lieu d'arrêts prématurés)

### 🛠️ Améliorations

- **Logs améliorés** :
  - Logs plus détaillés pour suivre le processus d'initialisation
  - Distinction entre les erreurs pendant l'initialisation (warnings) et après (arrêt)
  - Meilleure visibilité sur les étapes de connexion RFXCOM

## [2.1.5] - 2025-12-30

### 🔧 Corrections

- **Correction majeure de l'initialisation RFXCOM** :
  - Nettoyage complet de l'instance RFXCOM précédente avant création d'une nouvelle instance
  - Réorganisation de l'ordre d'enregistrement des listeners : les listeners sont maintenant enregistrés AVANT l'appel à `initialise()`
  - Cela corrige le problème où le callback `initialise` n'était jamais appelé, causant un timeout systématique
  - Les listeners pour `ready` et `receiverstarted` sont maintenant enregistrés avant `initialise()` pour ne pas manquer les événements
  - Protection des listeners `error` et `disconnect` avec la variable `initCompleted` pour éviter les arrêts prématurés

### 🛠️ Améliorations

- **Meilleure gestion des instances RFXCOM** :
  - Détection et nettoyage automatique d'une instance précédente si elle existe
  - Retrait de tous les listeners avant fermeture de l'ancienne instance
  - Évite les conflits et les fuites mémoire lors des redémarrages

## [2.1.4] - 2025-12-30

### 🔧 Corrections

- **Correction du problème d'initialisation RFXCOM avec auto_discovery** :
  - Les listeners pour les événements spécifiques (`temperaturerain1`, `temperaturehumidity1`) sont maintenant enregistrés uniquement après l'événement `receiverstarted`
  - Cela corrige le problème où l'initialisation RFXCOM échouait avec un timeout lorsque `auto_discovery` était activé
  - Ajout d'un fallback de sécurité si l'événement `receiverstarted` n'est pas émis dans les 5 secondes

- **L'add-on s'arrête maintenant si RFXCOM ne peut pas s'initialiser** :
  - L'add-on ne continue plus sans RFXCOM (qui est essentiel pour son fonctionnement)
  - Arrêt propre avec message d'erreur explicite en cas de :
    - Port série introuvable
    - Timeout d'initialisation (30s)
    - Erreur d'initialisation
    - Erreur de connexion série
    - Déconnexion RFXCOM

### 🛠️ Améliorations

- **Nettoyage complet des ressources à l'arrêt** :
  - Nouvelle fonction `cleanupAndExit()` qui nettoie toutes les ressources dans l'ordre :
    1. Sauvegarde des appareils
    2. Fermeture de la connexion MQTT
    3. Fermeture de RFXCOM avec retrait de TOUS les listeners (évite les fuites mémoire)
    4. Fermeture du serveur HTTP
  - Amélioration de `closeRFXCOM()` pour retirer tous les listeners spécifiques :
    - `temperaturerain1`, `temperaturehumidity1`, `ready`, `receiverstarted`, etc.
    - Appel à `removeAllListeners()` pour retirer tous les listeners restants
  - Handlers SIGTERM/SIGINT unifiés pour un nettoyage cohérent
  - Logs améliorés pour le diagnostic

## [2.1.3] - 2025-12-30

### 🔧 Corrections

- **Correction du build Docker** :
  - Ajout de `git` dans le Dockerfile pour permettre l'installation de la dépendance `rfxcom` depuis GitHub
  - Le build Docker échouait avec l'erreur "spawn git" car git n'était pas installé dans l'image

### 🛠️ Améliorations

- **Script de diagnostic pour les capteurs** :
  - Création du script `test_listening_sensor.js` pour diagnostiquer les problèmes de détection des capteurs TEMP_HUM
  - Support amélioré pour les capteurs Alecto (TH13/WS1700, temperaturerain1, temperaturehumidity1)
  - Affichage détaillé de tous les champs des messages RFXCOM reçus
  - Analyse automatique des messages pour identifier les problèmes de détection

## [2.1.2] - 2025-12-30

### ✨ Nouvelles fonctionnalités

- **Support des sondes Alecto TH13/WS1700** :
  - Détection automatique des sondes TH13/WS1700 avec packet type 0x01
  - Support de l'événement `temperaturehumidity1` du package rfxcom modifié
  - Décodage correct de la température (partie entière + fraction / 256)
  - Décodage correct de l'humidité avec facteur de conversion (raw * 100 / 327)
  - Intégration automatique dans Home Assistant via MQTT Discovery
  - Détection automatique activée si `auto_discovery` est à `true`

### 🔧 Corrections

- Utilisation du fork rfxcom avec support TH13 : `git+https://github.com/loneObserver1/node-rfxcom.git`
- Ajout du listener pour l'événement `temperaturehumidity1` en plus de `temperaturerain1`
- Amélioration de la détection des sondes avec vérification du subtype 13 (TH13)

### 🛠️ Améliorations

- Meilleure identification des types de sondes Alecto (TH13/WS1700 vs autres)
- Logs améliorés pour la détection des sondes TH13

## [2.1.1] - 2025-12-29

### 🔧 Corrections

- **Correction de la récupération du Unit Code dans le formulaire AC** :
  - Le formulaire AC récupère maintenant correctement la valeur du champ Unit Code
  - Correction du problème où `formData.get('unitCode')` récupérait le champ ARC au lieu du champ AC
  - Utilisation de `getElementById('acUnitCode')` pour récupérer directement la valeur du champ AC
  - Ajout d'une vérification pour ignorer la valeur "auto" si elle est envoyée par erreur

## [2.1.0] - 2025-12-29

### 🔧 Corrections

- **Correction de la prise en compte du Unit Code pour les appareils AC** :
  - Le Unit Code fourni lors de la création d'un appareil AC est maintenant correctement pris en compte
  - Amélioration du parsing et de la validation du Unit Code (0-16)
  - Correction de la logique de validation qui ignorait parfois le Unit Code fourni

### 🛠️ Améliorations

- Amélioration de la logique de parsing du Unit Code pour mieux gérer les nombres et chaînes
- Ajout d'une validation explicite pour s'assurer que le Unit Code est dans la plage valide (0-16)

## [2.0.9] - 2025-12-29

### ✨ Nouvelles fonctionnalités

- **Récupération automatique des appareils depuis MQTT** :
  - Si `devices.json` n'existe pas ou est vide au démarrage, tentative de récupération automatique depuis les topics de découverte Home Assistant
  - Parse les topics `homeassistant/{type}/rfxcom/{deviceId}/config` pour reconstruire les appareils
  - Support de la récupération pour ARC, AC et TEMP_HUM
  - Sauvegarde automatique des appareils récupérés dans `devices.json`
  - Republication automatique des découvertes après récupération

### 🛠️ Améliorations

- Amélioration de la gestion des erreurs lors du chargement des appareils
- Meilleure résilience en cas de perte du fichier `devices.json`

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

- Correction des deviceId MQTT (ARC* et AC* en majuscules) pour correspondre aux IDs dans devices
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
