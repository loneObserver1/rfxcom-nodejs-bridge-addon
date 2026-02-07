# Tests Jest pour RFXCOM Node.js Bridge

## Installation

Installer les dépendances de développement :

```bash
npm install --save-dev jest supertest
```

## Exécution des tests

### Tous les tests avec couverture

```bash
npm test
```

### Tests en mode watch

```bash
npm run test:watch
```

### Tests spécifiques

```bash
npx jest test/api.test.js
npx jest test/utils.test.js
npx jest test/mqtt_helper.test.js
```

## Structure des tests

- **`api.test.js`** : Tests des endpoints API (GET, POST, PUT, DELETE)
- **`app_functions.test.js`** : Tests des fonctions internes de l'application
- **`commands.test.js`** : Tests des commandes RFXCOM (sendArcCommand, sendAcCommand) via API
- **`error_handling.test.js`** : Tests de gestion des erreurs
- **`mqtt_helper.test.js`** : Tests unitaires pour la classe MQTTHelper
- **`mqtt.test.js`** : Tests de l'intégration MQTT via API
- **`rfxcom.test.js`** : Tests de l'intégration RFXCOM via API
- **`rfxcom_ready.test.js`** : Tests de la vérification que RFXCOM est prêt avant d'envoyer des commandes (v2.1.8+)
- **`rfxcom_command_queue.test.js`** : Tests unitaires de la file d'attente des commandes RFXCOM (v2.1.12+) — traitement séquentiel, callbacks, erreurs
- **`utils.test.js`** : Tests des fonctions utilitaires via API

## File d'attente des commandes (v2.1.12)

Le fichier `rfxcom_command_queue.test.js` teste le module `rfxcom_command_queue.js` :

- **init et push sans init** : la queue doit être initialisée avant tout `push`, sinon la commande est ignorée
- **Jobs invalides** : jobs sans `type`, sans `deviceId` ou sans `command` sont ignorés
- **Commandes ARC** : `on`/`off`/`stop` et mapping `open`/`close` (cover)
- **Commandes AC** : `on`/`off` et format `0x{deviceId}/{unitCode}`
- **Traitement séquentiel** : une seule commande traitée à la fois, la suivante après le callback
- **Erreurs** : appareil introuvable, handler null, callback d’erreur du package rfxcom

Les tests des commandes API (`commands.test.js`) initialisent désormais `rfxtrxReady` et `initCommandQueue()` pour que les commandes passent par la file.

## Nouveaux tests (v2.1.8)

Le fichier `rfxcom_ready.test.js` contient les tests pour la nouvelle fonctionnalité de vérification que RFXCOM est prêt :

- **Commandes bloquées si RFXCOM n'est pas prêt** : Vérifie que les commandes sont bloquées si les handlers ne sont pas initialisés ou si `rfxtrxReady` est `false`
- **Commandes MQTT avec vérification** : Vérifie que les commandes MQTT respectent également la vérification de `rfxtrxReady`
- **Initialisation RFXCOM** : Vérifie que `rfxtrxReady` est correctement initialisé
- **Gestion des erreurs** : Vérifie que les erreurs et exceptions sont correctement gérées lors de l'envoi de commandes

## Objectif de couverture

L'objectif est d'atteindre **70% de couverture** pour :
- Branches
- Functions
- Lines
- Statements

## Mocks

Les tests utilisent des mocks pour :
- `fs` : Système de fichiers
- `rfxcom` : Module RFXCOM
- `mqtt` : Client MQTT
- `mqtt_helper` : Helper MQTT

## Notes

- Les fonctions internes de `app.js` ne sont pas exportées, donc elles sont testées via les endpoints HTTP
- Le serveur Express démarre automatiquement lors du chargement de `app.js`, ce qui est géré dans les tests
- Les tests utilisent `supertest` pour tester les endpoints HTTP

