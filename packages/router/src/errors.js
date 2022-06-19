/**
 * Die Art des Navigationsfehlers.
 * @typedef {number} ErrorType
 */

/**
 * @enum {ErrorType} ErrorTypes
 */
export const ErrorTypes = {
    MATCHER_NOT_FOUND: 1,
    NAVIGATION_GUARD_REDIRECT: 2,
    NAVIGATION_ABORTED: 4,
    NAVIGATION_CANCELLED: 8,
    NAVIGATION_DUPLICATED: 16
};

const errorMessages = {
    [ErrorTypes.MATCHER_NOT_FOUND]: ({ location, currentLocation }) =>
        `No match for\n${JSON.stringify(location)}${currentLocation
            ? "\nwhile being at\n" + JSON.stringify(currentLocation)
            : ""
        }`,
    [ErrorTypes.NAVIGATION_GUARD_REDIRECT]: ({ from, to }) =>
        `Redirected from "${from.fullPath}" to "${stringifyRoute(to)}"`,
    [ErrorTypes.NAVIGATION_ABORTED]: ({ from, to }) =>
        `Navigation aborted from "${from.fullPath}" to "${to.fullPath}" via a navigation guard.`,
    [ErrorTypes.NAVIGATION_CANCELLED]: ({ from, to }) =>
        `Navigation cancelled from "${from.fullPath}" to "${to.fullPath}" with a new navigation.`,
    [ErrorTypes.NAVIGATION_DUPLICATED]: ({ from }) =>
        `Avoided redundant navigation to current location: "${from.fullPath}".`
};

/**
 * Der Navigationsfehler.
 * @class
 */
class NavigationError extends Error {
    /**
     * Der Konstruktor für den Navigationsfehler.
     * @param {ErrorType} type - Die Art des Navigationsfehlers
     * @param {{from: RouteLocation, to: RouteLocation}} params - Die Parameter des Fehlers
     */
    constructor(type, params) {
        super(errorMessages[type](params));
        this.name = "NavigationError";
        this.type = type;
    }
}

/**
 * @enum {ErrorType} NavigationFailureType
 */
export const NavigationFailureType = {
    aborted: ErrorTypes.NAVIGATION_ABORTED,
    cancelled: ErrorTypes.NAVIGATION_CANCELLED,
    duplicated: ErrorTypes.NAVIGATION_DUPLICATED
};

/**
 * Erzeugt ein Navigationsfehler.
 * @param {ErrorType} type - Die Art des Navigationsfehlers
 * @param {*} params - Die Parameter des Fehlers
 * @returns {NavigationError} Der Fehler
 */
export function createRouterError(type, params) {
    return new NavigationError(type, params);
}

/**
 * Prüft, ob es sich um einen Navigationsfehler handelt.
 * @param {*} error - Der zu prüfende Fehler
 * @param {ErrorType|NavigationFailureType} [type] - Die Art des Fehlers
 * @returns {boolean} Wahr, wenn es sich um ein Navigationsfehler handelt
 */
export function isNavigationFailure(error, type) {
    return (
        error instanceof NavigationError &&
        (type == null || !!(error.type & type))
    );
}

const propertiesToLog = ["params", "query", "hash"];

/**
 * Gibt die Location als String zurück.
 * @param {RouteLocationRaw} to - Die Location
 * @returns {string} - Die Location als String
 */
function stringifyRoute(to) {
    if (typeof to === "string") {
        return to;
    }

    if ("path" in to) {
        return to.path;
    }

    const location = {};

    for (const key of propertiesToLog) {
        if (key in to) {
            location[key] = to[key];
        }
    }

    return JSON.stringify(location, null, 2);
}
