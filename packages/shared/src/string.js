/**
 * Erlaubt es einer statischen String-Funktion ihre Ergebnisse zwischen zu speichern,
 * erhöht die Performance und der zusätzliche Speicherbedarf ist minimal.
 * @param {function(string): string} fn - Eine Funktion, deren Ergebnisse gecacht werden sollen
 * @returns {function(string): string} Diese Funktion liefert die selben Ergebnisse wie die übergebene Funktion,
 * aber bei gleichen Input wird das Ergebnis aus den Cache genommen
 */
const cacheStringFunction = (fn) => {
    const cache = Object.create(null);

    return str => typeof str === "string" ? cache[str] || (cache[str] = fn(str)) : "";
};

const hyphenateRE = /\B([A-Z])/g;

/**
 * Transformiert einen camelCase String in einen hyphenated String.
 * @example
 * let result = hyphenate("helloWorld") // hello-world
 * @param {string} str - Der camelCase String
 * @returns {string} Der erzeugte hyphenated String
 */
export const hyphenate = cacheStringFunction(str =>
    str.replace(hyphenateRE, "-$1").toLowerCase()
);

const camelizeRE = /-(\w)/g;

/**
 * Transformiert einen hyphenated String in einen camelCase String.
 * @example
 * let result = camelize("hello-world") // helloWorld
 * @param {string} str - Der hyphenated String
 * @returns {string} - Der erzeugte camelCase String
 */
export const camelize = cacheStringFunction(str =>
    str.replace(camelizeRE, (_, c) => (c ? c.toUpperCase() : ""))
);
