/**
 * Die zu überwachende Operation
 * @typedef {string} TrackOpType
 */

/**
 * Die zu überwachenden Operationen.
 * @readonly
 * @enum {TrackOpType} TrackOpTypes
 */
export const TrackOpTypes = {
    GET: "get",
    HAS: "has",
    ITERATE: "iterate"
};

/**
 * Die Operation, auf die reagiert werden soll.
 * @typedef {string} TriggerOpType
 */

/**
 * Die Operationen, auf die reagiert werden soll.
 * @readonly
 * @enum {TriggerOpType} TriggerOpTypes
 */
export const TriggerOpTypes = {
    SET: "set",
    ADD: "add",
    DELETE: "delete",
    CLEAR: "clear"
};
