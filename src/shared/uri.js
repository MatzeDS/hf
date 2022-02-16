import { resolveRelativePath } from "./path.js";
import { parseQuery, stringifyQuery } from "./query.js";

/**
 *
 * @typedef {Object} LocationNormalized
 * @property {string} path
 * @property {string} fullPath
 * @property {string} hash
 * @property {LocationQuery} query
 */

/**
 * Teilt die URI in seine Bestandteile auf.
 * @param {string} location
 * @param {String} currentLocation
 * @returns {LocationNormalized}
 */
export function parseURI(location, currentLocation = "/") {
    let path;
    let query = {};
    let searchString = "";
    let hash = "";

    const searchPos = location.indexOf("?");
    const hashPos = location.indexOf("#", searchPos > -1 ? searchPos : 0);

    if (searchPos > -1) {
        path = location.slice(0, searchPos);

        searchString = location.slice(
            searchPos + 1,
            hashPos > -1 ? hashPos : location.length
        );

        query = parseQuery(searchString);
    }

    if (hashPos > -1) {
        path = path || location.slice(0, hashPos);
        hash = location.slice(hashPos, location.length);
    }

    path = resolveRelativePath(path != null ? path : location, currentLocation);

    return {
        fullPath: path + (searchString && "?") + searchString + hash,
        path,
        query,
        hash,
    };
}

/**
 *
 * @param {{path: string, [query]: LocationQuery, [hash]: string}} location
 * @returns {string}
 */
export function stringifyURI(location) {
    const query = location.query ? stringifyQuery(location.query) : "";

    return location.path + (query && "?") + query + (location.hash || "");
}
