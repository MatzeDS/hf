const HASH_RE = /#/g; // %23
const AMPERSAND_RE = /&/g; // %26
const SLASH_RE = /\//g; // %2F
const EQUAL_RE = /=/g; // %3D
const IM_RE = /\?/g; // %3F

const ENC_BRACKET_OPEN_RE = /%5B/g; // [
const ENC_BRACKET_CLOSE_RE = /%5D/g; // ]
const ENC_CARET_RE = /%5E/g; // ^
const ENC_BACKTICK_RE = /%60/g; // `
const ENC_CURLY_OPEN_RE = /%7B/g; // {
const ENC_PIPE_RE = /%7C/g; // |
const ENC_CURLY_CLOSE_RE = /%7D/g; // }

/**
 * Grundlegendes Encoding der URI
 * @param {string|number} text - Text zum codieren
 * @returns {string} Codierter Text
 */
function commonEncode(text) {
    return encodeURI(String(text))
        .replace(ENC_PIPE_RE, "|")
        .replace(ENC_BRACKET_OPEN_RE, "[")
        .replace(ENC_BRACKET_CLOSE_RE, "]");
}

/**
 * Codiert den Hash der URI
 * @param {string} hash - Hash zum codieren
 * @returns {string} Codierter Hash
 */
export function encodeHash(hash) {
    return commonEncode(hash)
        .replace(ENC_CURLY_OPEN_RE, "{")
        .replace(ENC_CURLY_CLOSE_RE, "}")
        .replace(ENC_CARET_RE, "^");
}

/**
 * Codiert die Properties der Query einer URI
 * @param {string|number} prop - Property zum codieren
 * @returns {string} Codierter Property
 */
export function encodeQueryProperty(prop) {
    return commonEncode(prop)
        .replace(HASH_RE, "%23")
        .replace(AMPERSAND_RE, "%26")
        .replace(EQUAL_RE, "%3D")
        .replace(ENC_BACKTICK_RE, "`")
        .replace(ENC_CURLY_OPEN_RE, "{")
        .replace(ENC_CURLY_CLOSE_RE, "}")
        .replace(ENC_CARET_RE, "^");
}

/**
 * Codiert den Pfad der URI
 * @param {string|number} path - Pfad zum codieren
 * @returns {string} Codierter Pfad
 */
export function encodePath(path) {
    return commonEncode(path)
        .replace(HASH_RE, "%23")
        .replace(IM_RE, "%3F");
}

/**
 * Codiert Parameter der URI
 * @param {string|number} param - Parameter zum codieren
 * @returns {string} Codierter Parameter
 */
export function encodeParam(param) {
    return encodePath(param)
        .replace(SLASH_RE, "%2F");
}

/**
 * Decodiert einen Text.
 * @param {string|number} text - Text zum decodieren
 * @returns {string}
 */
export function decode(text) {
    try {
        return decodeURIComponent(String(text));
    } catch (err) {}

    return String(text);
}
