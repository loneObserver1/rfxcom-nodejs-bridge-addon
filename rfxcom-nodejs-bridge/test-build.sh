#!/bin/bash
# Script pour tester le build Docker localement

set -e

echo "🔨 Test du build Docker pour l'add-on RFXCOM Node.js Bridge"
echo ""

# Détecter l'architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        BUILD_ARCH="amd64"
        ;;
    aarch64|arm64)
        BUILD_ARCH="aarch64"
        ;;
    armv7l)
        BUILD_ARCH="armv7"
        ;;
    armv6l)
        BUILD_ARCH="armhf"
        ;;
    i386|i686)
        BUILD_ARCH="i386"
        ;;
    *)
        echo "⚠️  Architecture non reconnue: $ARCH, utilisation de amd64 par défaut"
        BUILD_ARCH="amd64"
        ;;
esac

echo "📋 Architecture détectée: $ARCH -> $BUILD_ARCH"
echo ""

# Lire l'image de base depuis build.json
BUILD_FROM=$(grep -A 1 "\"$BUILD_ARCH\"" build.json | grep -o '"[^"]*"' | head -1 | tr -d '"')
if [ -z "$BUILD_FROM" ]; then
    BUILD_FROM="node:20-alpine"
    echo "⚠️  Impossible de lire build.json, utilisation de node:20-alpine par défaut"
fi

echo "🐳 Image de base: $BUILD_FROM"
echo ""

# Construire l'image
IMAGE_NAME="rfxcom-nodejs-bridge-test"
echo "🔨 Construction de l'image Docker..."
echo ""

docker build \
    --build-arg BUILD_FROM="$BUILD_FROM" \
    -t "$IMAGE_NAME" \
    .

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build réussi!"
    echo ""
    echo "📋 Pour tester l'image:"
    echo "   docker run --rm -it -p 8888:8888 $IMAGE_NAME"
    echo ""
    echo "🧹 Pour nettoyer:"
    echo "   docker rmi $IMAGE_NAME"
else
    echo ""
    echo "❌ Build échoué!"
    echo "   Vérifiez les erreurs ci-dessus"
    exit 1
fi

