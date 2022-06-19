import { isArray } from "../../shared/src/utils.js";

/**
 * Die Definition eines Jobs.
 * @typedef {Function} Job
 * @property {number} [id] - Eine eindeutige ID um den Job zu identifizieren
 * @property {boolean} [active] - Ist der Job aktiv, falls nicht wird er übersprungen
 * @property {boolean} [allowRecurse] - Wenn Rekursionen erlaubt sind, kann ein Job mehrfach in der selben Warteschlange stehen
 */

let isFlushing = false;
let isFlushPending = false;

const queue = [];
let flushIndex = 0;

const pendingPreFlushCallbacks = [];
let activePreFlushCallbacks = null;
let preFlushIndex = 0;

const pendingPostFlushCallbacks = [];
let activePostFlushCallbacks = null;
let postFlushIndex = 0;

const resolvedPromise = Promise.resolve();
let currentFlushPromise = null;
let currentPreFlushParentJob = null;

/**
 * Nachdem die aktuellen Jobs abgearbeitet sind, wird die Funktion ausgeführt.
 * Oder man nutzt das zurück gelieferte Promise um mit .then() eine Funktion anzuhängen.
 * @param {Function} [fn] - Die Funktion
 * @returns {Promise}
 */
export function nextTick(fn) {
    const p = currentFlushPromise || resolvedPromise;

    return fn ? p.then(fn) : p;
}

/**
 * Findet die geeignete Position für die übergebene Job-ID, um die Reihenfolge der aufsteigenden Job-IDs beizubehalten.
 * Mithilfe der binären Suche wird diese Position ermittelt.
 * @param {number} id - Die Job-ID
 * @returns {number} - Index des Jobs innerhalb der Warteschlange
 */
function findInsertionIndex(id) {
    let start = flushIndex + 1;
    let end = queue.length;

    while (start < end) {
        const middle = (start + end) >>> 1;
        const middleJobId = getId(queue[middle]);

        if (middleJobId < id) {
            start = middle + 1;
        } else {
            end = middle;
        }
    }

    return start;
}

/**
 * Fügt den Job der Warteschlange hinzu.
 * @param {Job} job - Der Job
 */
export function queueJob(job) {
    /*
     * Prüft, ob der Job schon in der Queue ist, wenn es der aktuelle Job ist,
     * muss der Job Rekursionen erlauben um, in die Queue aufgenommen zu werden.
     * Der Index enthält im Normalfall die Position des aktuellen Jobs,
     * welcher bei der Suche ausgeschlossen wird (includes wird der Index übergeben).
     */
    if (
        (queue.length === 0 ||
            !queue.includes(
                job,
                isFlushing && job.allowRecurse ? flushIndex + 1 : flushIndex)
        ) && job !== currentPreFlushParentJob
    ) {
        if (job.id == null) {
            queue.push(job);
        } else {
            queue.splice(findInsertionIndex(job.id), 0, job);
        }

        queueFlush();
    }
}

/**
 * Die aktuelle Warteschlange abarbeiten, falls der Scheduler im Moment nicht beschäftigt ist.
 */
function queueFlush() {
    if (!isFlushing && !isFlushPending) {
        isFlushPending = true;
        currentFlushPromise = resolvedPromise.then(flushJobs);
    }
}

/**
 * Einen Job aus der Warteschlange entfernen.
 * @param {Job} job - Der Job
 */
export function invalidateJob(job) {
    const idx = queue.indexOf(job);

    if (idx > flushIndex) {
        queue.splice(idx, 1);
    }
}

/**
 * Füge einen oder mehrere Callbacks der Warteschlange hinzu.
 * @param {Job|Job[]} cb - Der oder die Callbacks
 * @param {Job[]} activeQueue - Die aktive (wird gerade verarbeitet) Warteschlange
 * @param {Job[]} pendingQueue - Die als nächstes abzuarbeitende Warteschlange
 * @param {number} index - Index in der aktuellen Warteschlange
 */
function queueCallback(cb, activeQueue, pendingQueue, index) {
    if (!isArray(cb)) {
        if (!activeQueue ||
            !activeQueue.includes(cb, cb.allowRecurse ? index + 1 : index)
        ) {
            pendingQueue.push(cb);
        }
    } else {
        pendingQueue.push(...cb);
    }

    queueFlush();
}

/**
 * Füge einen Callback zu den vor den aktuell auszuführenden Callbacks hinzu.
 * @param {Job} cb - Der Callback
 */
export function queuePreFlushCallback(cb) {
    queueCallback(cb, activePreFlushCallbacks, pendingPostFlushCallbacks, preFlushIndex);
}

/**
 * Füge einen Callback zu den nach der Warteschlange auszuführenden Callbacks hinzu.
 * @param {Job|Job[]} cb - Der Callback
 */
export function queuePostFlushCallback(cb) {
    queueCallback(cb, activePostFlushCallbacks, pendingPostFlushCallbacks, postFlushIndex);
}

/**
 * Callbacks, die als vor der Warteschlange auszuführende Callbacks definierte wurden, ausführen.
 * @param {Job|null} [parentJob] - Der Job innerhalb welcher diese ausgeführt werden
 */
export function flushPreFlushCallbacks(parentJob) {
    if (pendingPreFlushCallbacks.length > 0) {
        currentPreFlushParentJob = parentJob;
        activePreFlushCallbacks = [...new Set(pendingPreFlushCallbacks)];
        pendingPreFlushCallbacks.length = 0;

        for (preFlushIndex = 0; preFlushIndex < activePreFlushCallbacks.length; preFlushIndex++) {
            activePreFlushCallbacks[preFlushIndex]();
        }

        activePreFlushCallbacks = null;
        preFlushIndex = 0;
        currentPreFlushParentJob = null;

        flushPreFlushCallbacks(parentJob);
    }
}

/**
 * Callbacks, die als nach der Warteschlange auszuführende Callbacks definierte wurden, ausführen.
 */
export function flushPostFlushCallbacks() {
    if (pendingPostFlushCallbacks.length > 0) {
        const deduped = [...new Set(pendingPostFlushCallbacks)];
        pendingPostFlushCallbacks.length = 0;

        if (activePostFlushCallbacks) {
            activePostFlushCallbacks.push(...deduped);

            return;
        }

        activePostFlushCallbacks = deduped;
        activePostFlushCallbacks.sort((a, b) => getId(a) - getId(b));

        for (postFlushIndex = 0; postFlushIndex < activePostFlushCallbacks.length; postFlushIndex++) {
            activePostFlushCallbacks[postFlushIndex]();
        }

        activePostFlushCallbacks = null;
        postFlushIndex = 0;
    }
}

/**
 * Gibt die ID des Jobs zurück.
 * @param {Job} job - Der Job
 * @returns {number} - Die ID des Jobs
 */
const getId = (job) => {
    return job.id == null ? Infinity : job.id;
};

/**
 * Die gesammelten Jobs der Warteschlange ausführen.
 */
function flushJobs() {
    isFlushPending = false;
    isFlushing = true;

    flushPreFlushCallbacks();

    queue.sort((a, b) => getId(a) - getId(b));

    try {
        for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
            const job = queue[flushIndex];

            if (job && job.active !== false) {
                job();
            }
        }
    } finally {
        flushIndex = 0;
        queue.length = 0;

        flushPostFlushCallbacks();

        isFlushing = false;
        currentFlushPromise = null;

        if (queue.length > 0 || pendingPreFlushCallbacks.length > 0 || pendingPostFlushCallbacks.length > 0) {
            flushJobs();
        }
    }
}
