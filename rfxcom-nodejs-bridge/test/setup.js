// Configuration globale pour les tests
process.env.SERIAL_PORT = '/dev/ttyUSB0';
process.env.LOG_LEVEL = 'error'; // Réduire les logs pendant les tests
process.env.AUTO_DISCOVERY = 'false';
// Utiliser un port aléatoire pour éviter les conflits
process.env.API_PORT = process.env.API_PORT || '0'; // 0 = port aléatoire
process.env.MQTT_HOST = 'localhost';
process.env.MQTT_PORT = '1883';
process.env.MQTT_USER = 'test';
process.env.MQTT_PASSWORD = 'test';

