/**
 * @typedef {Error} NavigationFailure
 */

/**
 * @typedef {number} ErrorType
 */

/**
 *
 * @type {ErrorType}
 */
const MATCHER_NOT_FOUND = 1;

/**
 *
 * @type {ErrorType}
 */
const NAVIGATION_GUARD_REDIRECT = 2;

/**
 *
 * @type {ErrorType}
 */
const NAVIGATION_ABORTED = 4;

/**
 *
 * @type {ErrorType}
 */
const NAVIGATION_CANCELLED = 8;

/**
 * @enum {ErrorType} ErrorTypes
 */
export const ErrorTypes = {
    MATCHER_NOT_FOUND,
    NAVIGATION_GUARD_REDIRECT,
    NAVIGATION_ABORTED,
    NAVIGATION_CANCELLED
};

const errorMessages = {
    [MATCHER_NOT_FOUND]: ({ location, currentLocation }) =>
        `No match for\n${JSON.stringify(location)}${currentLocation
            ? "\nwhile being at\n" + JSON.stringify(currentLocation)
            : ""
        }`,
    [NAVIGATION_GUARD_REDIRECT]: ({ from, to }) =>
        `Redirected from "${from.name}" to "${to.name}"`,
    [NAVIGATION_ABORTED]: ({ from, to }) =>
        `Navigation aborted from "${from.name}" to "${to.name}" via a navigation guard.`,
    [NAVIGATION_CANCELLED]: ({ from, to }) =>
        `Navigation cancelled from "${from.name}" to "${to.name}" with a new navigation.`
};

/**
 * @class NavigationError
 */
class NavigationError extends Error {
    constructor(type, params) {
        super(errorMessages[type](params));
        this.name = "NavigationError";
        this.type = type;
    }
}

/**
 * @enum {number} NavigationFailureType<number>
 */
export const NavigationFailureType = {
    aborted: NAVIGATION_ABORTED,
    cancelled: NAVIGATION_CANCELLED
};

/**
 *
 * @param {ErrorType} type
 * @param {*} params
 * @returns {NavigationFailure}
 */
export function createRouterError(type, params) {
    return new NavigationError(type, params);
}

/**
 *
 * @param {*} error
 * @param {ErrorType|NavigationFailureType} [type]
 * @returns {boolean}
 */
export function isNavigationFailure(error, type) {
    return (
        error instanceof NavigationError &&
        (type == null || !!(error.type & type))
    );
}
