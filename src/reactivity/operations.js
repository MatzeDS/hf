/**
 * @typedef {string} TrackOpType
 */

/**
 * Die zu überwachenden Operationen
 *
 * @enum {TrackOpType} TrackOpTypes
 */
export const TrackOpTypes = {
    GET: "get",
    HAS: "has",
    ITERATE: "iterate"
};

/**
 * @typedef {string} TriggerOpType
 */

/**
 * Die Operationen, auf die reagiert werden soll
 *
 * @enum {TriggerOpType} TriggerOpTypes
 */
export const TriggerOpTypes = {
    SET: "set",
    ADD: "add",
    DELETE: "delete",
    CLEAR: "clear"
};
