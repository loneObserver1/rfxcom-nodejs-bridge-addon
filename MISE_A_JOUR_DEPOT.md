# Guide de mise à jour du dépôt dans Home Assistant

## Problème
Home Assistant met en cache les dépôts d'add-ons. Après avoir modifié le dépôt GitHub, Home Assistant peut ne pas récupérer les dernières modifications immédiatement.

## Solutions

### Méthode 1 : Rafraîchir le dépôt (Recommandé)

1. **Via l'interface web :**
   - Allez dans **Paramètres > Modules complémentaires > Dépôts de modules complémentaires**
   - Trouvez le dépôt "RFXCOM Node.js Bridge Repository"
   - Cliquez sur les **trois points** (⋮) à droite du dépôt
   - Sélectionnez **"Actualiser"** ou **"Refresh"**
   - Attendez quelques secondes

2. **Via la ligne de commande (SSH) :**
   ```bash
   ha addons reload
   ```

### Méthode 2 : Supprimer et réajouter le dépôt

1. **Supprimer le dépôt :**
   - Allez dans **Paramètres > Modules complémentaires > Dépôts de modules complémentaires**
   - Trouvez le dépôt "RFXCOM Node.js Bridge Repository"
   - Cliquez sur les **trois points** (⋮)
   - Sélectionnez **"Supprimer"** ou **"Remove"**

2. **Réajouter le dépôt :**
   - Cliquez sur **"Ajouter un dépôt"** ou **"Add repository"**
   - Entrez l'URL : `https://github.com/loneObserver1/rfxcom-nodejs-bridge-addon`
   - Cliquez sur **"AJOUTER"** ou **"ADD"**

3. **Installer l'add-on :**
   - Allez dans **Modules complémentaires**
   - Recherchez "RFXCOM Node.js Bridge"
   - Cliquez sur **"Installer"**

### Méthode 3 : Redémarrer le superviseur

Si les méthodes précédentes ne fonctionnent pas :

```bash
ha supervisor restart
```

Attendez 2-3 minutes que le superviseur redémarre, puis réessayez d'installer l'add-on.

## Vérifier que le dépôt est à jour

Pour vérifier que Home Assistant a bien récupéré les dernières modifications :

1. Allez dans **Paramètres > Modules complémentaires > Dépôts de modules complémentaires**
2. Cliquez sur le dépôt "RFXCOM Node.js Bridge Repository"
3. Vérifiez la date de dernière mise à jour

## Consulter les logs en cas d'erreur

Si l'installation échoue toujours :

1. **Via l'interface :**
   - Allez dans **Paramètres > Système > Logs**
   - Sélectionnez l'onglet **"Superviseur"**
   - Recherchez les erreurs liées à "rfxcom-nodejs-bridge"

2. **Via la ligne de commande :**
   ```bash
   ha supervisor logs
   ```

3. **Logs spécifiques de l'add-on (si installé) :**
   ```bash
   ha addons logs e14c5f1e_rfxcom-nodejs-bridge
   ```

## Structure attendue du dépôt

Le dépôt doit avoir cette structure :
```
rfxcom-nodejs-bridge-addon/
├── repository.json
└── rfxcom-nodejs-bridge/
    ├── config.json
    ├── build.json
    ├── Dockerfile
    ├── package.json
    └── rfxcom_bridge_server.js
```

Vérifiez que tous ces fichiers sont présents sur GitHub.

