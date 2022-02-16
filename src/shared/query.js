import { decode, encodeQueryProperty } from "../router/encoding.js";

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
        if (search.length) {
            search += "&";
        }

        const value = query[key];
        key = encodeQueryProperty(key);

        if (value == null) {
            if (value !== undefined) {
                search += key;
            }
        } else {
            const values = Array.isArray(value)
                ? value.map(v => v && encodeQueryProperty(v))
                : [value && encodeQueryProperty(value)];

            for (let i = 0; i < values.length; i++) {
                search += (i ? "&" : "") + key;

                if (values[i] != null) {
                    search += ("=" + values[i]);
                }
            }
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
