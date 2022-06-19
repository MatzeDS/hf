import { decode, encodeQueryKey, encodeQueryValue } from "./encoding.js";
import { isArray } from "../../shared/src/utils.js";

/**
 * @typedef {string|null} LocationQueryValue
 */

/**
 * @typedef {Record<string, LocationQueryValue|LocationQueryValue[]>} LocationQuery
 */

/**
 * @typedef {LocationQueryValue|number|undefined} LocationQueryValueRaw
 */

/**
 * @typedef {Record<string|number, LocationQueryValueRaw|LocationQueryValueRaw[]>} LocationQueryRaw
 */

/**
 *
 * @param {LocationQueryRaw} query
 * @returns {string}
 */
export function stringifyQuery(query) {
    let search = "";

    for (let key in query) {
        const value = query[key];
        key = encodeQueryKey(key);

        if (value == null) {
            if (value !== undefined) {
                search += (search.length > 0 ? "&" : "") + key;
            }
        } else {
            const values = isArray(value)
                ? value.map(v => v && encodeQueryValue(v))
                : [value && encodeQueryValue(value)];

            values.forEach(value => {
                if (value !== undefined) {
                    search += (search.length > 0 ? "&" : "") + key;

                    if (value != null) {
                        search += "=" + value;
                    }
                }
            });
        }
    }

    return search;
}

/**
 *
 * @param {string} search
 * @returns {LocationQuery}
 */
export function parseQuery(search) {
    const query = {};

    if (search === "" || search === "?") {
        return query;
    }

    const hasLeadingIM = search[0] === "?";
    const searchParams = (hasLeadingIM ? search.slice(1) : search).split("&");

    for (let i = 0; i < searchParams.length; ++i) {
        let [key, rawValue] = searchParams[i].split("=");

        key = decode(key);
        const value = rawValue == null ? null : decode(rawValue);

        if (key in query) {
            let currentValue = query[key];

            if (!Array.isArray(currentValue)) {
                currentValue = query[key] = [currentValue];
            }

            currentValue.push(value);
        } else {
            query[key] = value;
        }
    }

    return query;
}

/**
 *
 * @param {LocationQueryRaw} query
 * @returns {LocationQuery}
 */
export function normalizeQuery(query) {
    const normalizedQuery = {};

    for (const key in query) {
        const value = query[key];

        if (value !== undefined) {
            normalizedQuery[key] = Array.isArray(value)
                ? value.map(v => (v == null ? null : String(v)))
                : value == null
                    ? value
                    : String(value);
        }
    }

    return normalizedQuery;
}
