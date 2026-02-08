/**
 * File d'attente des commandes RFXCOM.
 * Envoie une seule commande à la fois au module RFXCOM et attend la fin (callback ou timeout)
 * avant de traiter la suivante, pour éviter les timeouts "timed out waiting for response".
 */

let queue = [];
let processing = false;
let getDevices = null;
let getLighting1 = null;
let getLighting2 = null;
let logFn = null;
let onCommandComplete = null;

/**
 * Initialise la queue avec les dépendances (à appeler quand RFXCOM est prêt).
 * @param {Object} deps
 * @param {function(): Object} deps.getDevices - Retourne l'objet devices
 * @param {function(): object|null} deps.getLighting1 - Retourne lighting1Handler
 * @param {function(): object|null} deps.getLighting2 - Retourne lighting2Handler
 * @param {function(level: string, ...args)} deps.log - Fonction de log
 * @param {function(Error)} [deps.onCommandComplete] - Appelé à chaque fin de commande (err si timeout/erreur) pour détecter les séries de timeouts
 */
function init(deps) {
    getDevices = deps.getDevices;
    getLighting1 = deps.getLighting1;
    getLighting2 = deps.getLighting2;
    logFn = deps.log;
    onCommandComplete = deps.onCommandComplete || null;
    queue = [];
    processing = false;
}

/**
 * Ajoute une commande à la file.
 * @param {Object} job
 * @param {'arc'|'ac'} job.type
 * @param {string} job.deviceId
 * @param {string} job.command - 'on'|'off'|'stop' (ARC/AC switch), ou 'open'|'close'|'stop' (cover)
 * @param {function(Error)} [job.onDone] - Callback appelé quand la commande est traitée (err si erreur) ; pour pair/unpair, envoyer res.json() ici
 * @param {function()} [job.onSuccess] - Callback appelé en cas de succès (ex: publish MQTT state)
 */
function push(job) {
    if (!getDevices || !getLighting1 || !getLighting2) {
        if (logFn) logFn('warn', '⚠️ File d\'attente RFXCOM non initialisée, commande ignorée');
        return;
    }
    if (!job || !job.type || !job.deviceId || job.command === undefined) {
        if (logFn) logFn('warn', '⚠️ Job invalide ignoré (type, deviceId ou command manquant)');
        return;
    }
    queue.push(job);
    if (logFn) logFn('debug', `📋 File RFXCOM: ${queue.length} commande(s) en attente`);
    processNext();
}

/**
 * Traite la prochaine commande si aucune n'est en cours.
 */
function processNext() {
    if (processing || queue.length === 0) return;

    const job = queue.shift();
    const devices = getDevices ? getDevices() : {};
    const lighting1 = getLighting1 ? getLighting1() : null;
    const lighting2 = getLighting2 ? getLighting2() : null;

    const device = devices[job.deviceId];
    if (!device) {
        if (logFn) logFn('warn', `⚠️ Appareil ${job.deviceId} introuvable, commande ignorée`);
        finishJob(job, new Error('Appareil introuvable'));
        return setImmediate(processNext);
    }

    const runArc = () => {
        if (!lighting1) {
            finishJob(job, new Error('RFXCOM Lighting1 non initialisé'));
            return setImmediate(processNext);
        }
        const cmd = job.command === 'open' ? 'on' : job.command === 'close' ? 'off' : job.command;
        if (cmd === 'on') {
            lighting1.switchUp(device.houseCode, device.unitCode, done);
        } else if (cmd === 'off') {
            lighting1.switchDown(device.houseCode, device.unitCode, done);
        } else if (cmd === 'stop') {
            lighting1.stop(device.houseCode, device.unitCode, done);
        } else {
            finishJob(job, new Error(`Commande ARC inconnue: ${job.command}`));
            return setImmediate(processNext);
        }
    };

    const runAc = () => {
        if (!lighting2) {
            finishJob(job, new Error('RFXCOM Lighting2 non initialisé'));
            return setImmediate(processNext);
        }
        const deviceIdFormatted = `0x${device.deviceId}/${device.unitCode}`;
        const cmd = job.command === 'open' ? 'on' : job.command === 'close' ? 'off' : job.command;
        if (cmd === 'on') {
            lighting2.switchOn(deviceIdFormatted, done);
        } else if (cmd === 'off' || cmd === 'stop') {
            lighting2.switchOff(deviceIdFormatted, done);
        } else {
            finishJob(job, new Error(`Commande AC inconnue: ${job.command}`));
            return setImmediate(processNext);
        }
    };

    function done(err) {
        processing = false;
        finishJob(job, err);
        setImmediate(processNext);
    }

    processing = true;
    try {
        if (job.type === 'arc') {
            runArc();
        } else if (job.type === 'ac') {
            runAc();
        } else {
            processing = false;
            finishJob(job, new Error(`Type inconnu: ${job.type}`));
            setImmediate(processNext);
        }
    } catch (err) {
        processing = false;
        finishJob(job, err);
        setImmediate(processNext);
    }
}

function finishJob(job, err) {
    try {
        if (job.onDone) job.onDone(err);
        if (!err && job.onSuccess) job.onSuccess();
        if (onCommandComplete) onCommandComplete(err);
    } catch (e) {
        if (logFn) logFn('error', `❌ Erreur finishJob: ${e.message}`);
    }
}

function getQueueLength() {
    return queue.length;
}

function isProcessing() {
    return processing;
}

module.exports = {
    init,
    push,
    processNext,
    getQueueLength,
    isProcessing
};
