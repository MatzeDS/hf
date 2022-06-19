import { isArray } from "../../shared/index.js";

const HASH = "#"; // %23
const AMPERSAND = "&"; // %26
const SLASH = "/"; // %2F
const EQUAL = "="; // %3D
const IM = "?"; // %3F
const PLUS = "+"; // %2B

const ENC_BRACKET_OPEN = "%5B"; // [
const ENC_BRACKET_CLOSE = "%5D"; // ]
const ENC_CARET = "%5E"; // ^
const ENC_BACKTICK = "%60"; // `
const ENC_CURLY_OPEN = "%7B"; // {
const ENC_PIPE = "%7C"; // |
const ENC_CURLY_CLOSE = "%7D"; // }
const ENC_SPACE = "%20"; //

/**
 * Grundlegendes Encoding der URI.
 * @param {string|number} text - Text zum Kodieren
 * @returns {string} Kodierter Text
 */
function commonEncode(text) {
    return encodeURI(String(text))
        .replaceAll(ENC_PIPE, "|")
        .replaceAll(ENC_BRACKET_OPEN, "[")
        .replaceAll(ENC_BRACKET_CLOSE, "]");
}

/**
 * Kodiert den Hash der URI.
 * @param {string} hash - Hash zum Kodieren
 * @returns {string} Kodierter Hash
 */
export function encodeHash(hash) {
    return commonEncode(hash)
        .replaceAll(ENC_CURLY_OPEN, "{")
        .replaceAll(ENC_CURLY_CLOSE, "}")
        .replaceAll(ENC_CARET, "^");
}

/**
 * Kodiert den Wert eines Query-Properties einer URI.
 * @param {string|number} value - Wert zum Kodieren
 * @returns {string} Kodierter Wert
 */
export function encodeQueryValue(value) {
    return commonEncode(value)
        .replaceAll(PLUS, "%2B")
        .replaceAll(ENC_SPACE, "+")
        .replaceAll(HASH, "%23")
        .replaceAll(AMPERSAND, "%26")
        .replaceAll(ENC_BACKTICK, "`")
        .replaceAll(ENC_CURLY_OPEN, "{")
        .replaceAll(ENC_CURLY_CLOSE, "}")
        .replaceAll(ENC_CARET, "^");
}

/**
 * Kodiert den Schlüssel eines Query-Properties einer URI.
 * @param {string|number} key - Schlüssel zum Kodieren
 * @returns {string} Kodierter Schlüssel
 */
export function encodeQueryKey(key) {
    return encodeQueryValue(key).replace(EQUAL, "%3D");
}

/**
 * Kodiert die Properties der Query einer URI.
 * @param {string|number} prop - Property zum Kodieren
 * @returns {string} Kodierter Property
 */
export function encodeQueryProperty(prop) {
    return commonEncode(prop)
        .replaceAll(HASH, "%23")
        .replaceAll(AMPERSAND, "%26")
        .replaceAll(EQUAL, "%3D")
        .replaceAll(ENC_BACKTICK, "`")
        .replaceAll(ENC_CURLY_OPEN, "{")
        .replaceAll(ENC_CURLY_CLOSE, "}")
        .replaceAll(ENC_CARET, "^");
}

/**
 * Kodiert den Pfad der URI.
 * @param {string|number} path - Pfad zum Kodieren
 * @returns {string} Kodierter Pfad
 */
export function encodePath(path) {
    return commonEncode(path)
        .replaceAll(HASH, "%23")
        .replaceAll(IM, "%3F");
}

/**
 * Kodiert Parameter der URI.
 * @param {string|number} param - Parameter zum Kodieren
 * @returns {string} Kodierter Parameter
 */
export function encodeParam(param) {
    return param == null ? "" : encodePath(param).replaceAll(SLASH, "%2F");
}

/**
 * Kodiert die Parameter.
 * @param {Record<string, string|string[]>} params - Die Parameter
 * @returns {Record<string, string|string[]>} Die kodierten Parameter
 */
export function encodeParams(params) {
    const newParams = {};

    for (const key in params) {
        const value = params[key];
        newParams[key] = isArray(value) ? value.map(encodeParam) : encodeParam(value);
    }

    return newParams;
}

/**
 * Dekodiert einen Text.
 * @param {string|number} text - Text zum Dekodieren
 * @returns {string} Dekodierter Text
 */
export function decode(text) {
    try {
        return decodeURIComponent(String(text));
    } catch (err) {}

    return String(text);
}

/**
 * Dekodiert die Parameter.
 * @param {Record<string, string|string[]>} params - Die Parameter
 * @returns {Record<string, string|string[]>} Die dekodierten Parameter
 */
export function decodeParams(params) {
    const newParams = {};

    for (const key in params) {
        const value = params[key];
        newParams[key] = isArray(value) ? value.map(decode) : decode(value);
    }

    return newParams;
}
