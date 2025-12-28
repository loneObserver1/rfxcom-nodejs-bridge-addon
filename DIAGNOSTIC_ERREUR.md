# Diagnostic de l'erreur d'installation

## Erreur
```
Failed to to call /addons/e14c5f1e_rfxcom-nodejs-bridge/install - An unknown error occurred with addon e14c5f1e_rfxcom-nodejs-bridge
```

## Étapes de diagnostic

### 1. Consulter les logs du supervisor (OBLIGATOIRE)

L'erreur générique cache la vraie erreur. Il faut absolument consulter les logs :

**Via SSH :**
```bash
ha supervisor logs | grep -i rfxcom
```

**Ou les 50 dernières lignes :**
```bash
ha supervisor logs | tail -50
```

**Via l'interface web :**
- Paramètres > Système > Logs
- Onglet "Superviseur"
- Recherchez les erreurs liées à "rfxcom-nodejs-bridge"

### 2. Vérifier la structure du dépôt

Le dépôt doit avoir cette structure exacte :
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

### 3. Vérifier les fichiers requis

**config.json doit contenir :**
- `name`, `version`, `slug`, `description`
- `arch` (tableau des architectures)
- `startup`, `boot`
- `homeassistant` (version minimale)
- `image` (format: `nom-{arch}`)
- `build.json` doit être présent dans le dossier

**build.json doit contenir :**
- `build_from` avec toutes les architectures

### 4. Erreurs courantes

#### Erreur de build Docker
- Vérifier que le Dockerfile est valide
- Vérifier que toutes les dépendances sont dans package.json
- Vérifier que le port série est accessible

#### Erreur de validation JSON
- Vérifier que tous les fichiers JSON sont valides
- Utiliser : `python3 -m json.tool fichier.json`

#### Erreur de permissions
- Vérifier que le dépôt est accessible publiquement
- Vérifier que GitHub renvoie bien les fichiers

### 5. Tester localement

Pour tester si le build fonctionne :

```bash
cd rfxcom-nodejs-bridge
docker build -t test-rfxcom .
```

Si le build Docker échoue, c'est là le problème.

### 6. Vérifier le dépôt GitHub

Assurez-vous que :
- Le dépôt est public (ou que Home Assistant y a accès)
- Tous les fichiers sont bien commités et poussés
- La structure est correcte sur GitHub

### 7. Forcer le rafraîchissement

```bash
ha addons reload
ha supervisor restart
```

## Structure actuelle (v1.0.1)

✅ repository.json - Présent
✅ rfxcom-nodejs-bridge/config.json - Version 1.0.1
✅ rfxcom-nodejs-bridge/build.json - Simplifié
✅ rfxcom-nodejs-bridge/Dockerfile - Utilise BUILD_FROM
✅ rfxcom-nodejs-bridge/package.json - Dépendances rfxcom
✅ rfxcom-nodejs-bridge/rfxcom_bridge_server.js - Serveur HTTP

## Prochaines étapes

1. **Consultez les logs du supervisor** - C'est la clé pour comprendre l'erreur
2. Partagez les logs d'erreur pour diagnostic
3. Vérifiez que le build Docker fonctionne localement

