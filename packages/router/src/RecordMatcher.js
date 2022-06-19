import { assign } from "../../shared/index.js";

/**
 * Der Token repräsentiert einen Teil des Pfades.
 * @typedef {Object} Token
 * @property {TokenType} type - Der Typ des Tokens
 * @property {string|Token[]} value - Der Wert des Tokens
 * @property {string} [regexp] - Der benutzerdefinierte RegExp
 * @property {boolean} [optional] - Ist der Token optional
 * @property {boolean} [repeatable] - Ist der Token wiederholbar
 */

/**
 * Die Beschreibung eines Parameterschlüssels.
 * @typedef {Object} ParamKey
 * @property {string} name - Der Name des Parameters
 * @property {boolean} repeatable - Ist es ein wiederholender Parameter
 * @property {boolean} optional - Ist der Parameter optional
 */

/**
 * Die Optionen für die Pfade des Matchers.
 * @typedef {Object} PathOptions
 * @property {boolean} [sensitive] - Macht die RegExp case sensitive
 * @property {boolean} [strict] - Einen abschließenden Slash nicht zulassen
 * @property {boolean} [start]
 * @property {boolean} [end] - Sollen die RegExp bis zum Ende passen und mit einem "$" abschließen
 */

const MULTIPLIER = 10;

const PathScore = {
    ROOT: 9 * MULTIPLIER, // just /
    Segment: 4 * MULTIPLIER, // /a-segment
    SubSegment: 3 * MULTIPLIER, // /multiple-:things-in-one-:segment
    Static: 4 * MULTIPLIER, // /static
    Dynamic: 2 * MULTIPLIER, // /:someId
    BonusCustomRegExp: MULTIPLIER, // /:someId(\\d+)
    BonusWildcard: (-4 * MULTIPLIER) - MULTIPLIER, // /:namedWildcard(.*) we remove the bonus added by the custom regexp
    BonusRepeatable: -2 * MULTIPLIER, // /:w+ or /:w*
    BonusOptional: -0.8 * MULTIPLIER, // /:w? or /:w*
    // these two have to be under 0.1 so a strict /:page is still lower than /:a-:b
    BonusStrict: 0.07 * MULTIPLIER, // when options strict: true is passed, as the regex omits \/?
    BonusCaseSensitive: 0.025 * MULTIPLIER, // when options strict: true is passed, as the regex omits \/?
};

const BASE_PARAM_PATTERN = "[^/]+?";
const REGEX_CHARS_RE = /[.+*?^${}()[\]/\\]/g;
const VALID_PARAM_RE = /\w/;

/**
 * Die Basis Optionen für die Pfade des Matchers.
 * @type {PathOptions}
 */
const BASE_PATH_OPTIONS = {
    sensitive: false,
    strict: false,
    start: true,
    end: true,
};

/**
 *
 * @enum {string} TokenizerState
 */
const TokenizerState = {
    Static: "Static",
    Param: "Param",
    ParamRegExp: "ParamRegExp",
    ParamRegExpEnd: "ParamRegExpEnd",
    EscapeNext: "EscapeNext"
};

/**
 * Die Art des Tokens.
 * @enum {string} TokenType
 */
export const TokenType = {
    Static: "Static",
    Param: "Param",
    Group: "Group"
};

/**
 *
 * @type {Token}
 */
const ROOT_TOKEN = {
    type: TokenType.Static,
    value: ""
};

/**
 * Der Matcher für eine einzelne Route.
 * @class
 */
export class RouteRecordMatcher {
    /**
     * Matcher für Sub-Pfade.
     * @type {RouteRecordMatcher[]}
     */
    children = [];
    /**
     * Alternative Matcher für die gleiche Route.
     * @type {RouteRecordMatcher[]}
     */
    alias = [];
    /**
     * Der Eintrag der Route.
     * @type {RouteRecord}
     */
    record;
    /**
     * Der Eltern-Matcher.
     * @type {RouteRecordMatcher}
     */
    parent;
    /**
     * Die Segmente mit den Tokens.
     * @type {Array<Token[]>}
     */
    #segments;
    /**
     * Die Schlüssel der Parameter.
     * @type {ParamKey[]}
     */
    #keys;
    /**
     * Der RegExp zur identifizierung der Route.
     * @type {RegExp}
     */
    #re;
    /**
     * Der Score der Route.
     * @type {Array<number[]>}
     */
    #score;

    /**
     * Der Konstruktor für den Routen-Matcher.
     * @param {RouteRecord} record - Der Routen-Eintrag
     * @param {RouteRecordMatcher} [parent] - Der Eltern-Matcher
     * @param {PathOptions} [options] - Die Optionen des Matchers
     */
    constructor(record, parent, options) {
        this.record = record;
        this.patent = parent;

        this.#segments = tokenizePath(record.path);
        const [score, keys, re] = handleTokens(this.#segments, options);

        this.#score = score;
        this.#keys = keys;
        this.#re = re;

        if (parent) {
            if (!record.aliasOf === !parent.record.aliasOf) {
                parent.children.push(this);
            }
        }
    }

    /**
     * Der Score der Route.
     * @return {Array<number[]>}
     */
    get score() {
        return this.#score;
    }

    /**
     * Parst den Pfad, um die Parameter zu erhalten.
     * @param {string} path - Der Pfad
     * @returns {RouteParams|null}
     */
    parse(path) {
        const match = path.match(this.#re);
        const params = {};

        if (!match) {
            return null;
        }

        for (let i = 1; i < match.length; i++) {
            const value = match[i] || "";
            const key = this.#keys[i - 1];

            params[key.name] = value && key.repeatable ? value.split("/") : value;
        }

        return params;
    }

    /**
     * Liefert den Pfad der Route, abhängig von den Parametern.
     * @param {RouteParams} [params] - Die Parameter für den Pfad
     * @returns {string} Der erzeugte Pfad
     */
    stringify(params) {
        let path = "";
        // for optional parameters to allow to be empty
        let avoidDuplicatedSlash = false;

        for (const segment of this.#segments) {
            if (!avoidDuplicatedSlash || !path.endsWith("/")) {
                path += "/";
            }

            avoidDuplicatedSlash = false;

            for (const token of segment) {
                if (token.type === TokenType.Static) {
                    path += token.value;
                } else if (token.type === TokenType.Param) {
                    const { value, repeatable, optional } = token;
                    const param = value in params ? params[value] : "";

                    if (Array.isArray(param) && !repeatable) {
                        throw new Error(`Provided param "${value}" is an array but it is not repeatable (* or + modifiers)`);
                    }

                    const text = Array.isArray(param) ? param.join("/") : param;

                    if (!text) {
                        if (optional) {
                            // if we have more than one optional param like /:a?-static and there are more segments, we don't need to
                            // care about the optional param
                            if (segment.length < 2 && this.#segments.length > 1) {
                                // remove the last slash as we could be at the end
                                if (path.endsWith("/")) {
                                    path = path.slice(0, -1);
                                } else {
                                    // do not append a slash on the next iteration
                                    avoidDuplicatedSlash = true;
                                }
                            }
                        } else {
                            throw new Error(`Missing required param "${value}"`);
                        }
                    }

                    path += text;
                }
            }
        }

        return path;
    }

    /**
     * Prüft, ob der durch den Matcher repräsentierten Pfad mit dem übergebenen Pfad zusammen passt.
     * @param {string} path - Der zu testende Pfad
     * @return {boolean} Der Pfad passt zum Matcher
     */
    test(path) {
        return this.#re.test(path);
    }
}


/**
 * Erzeugt Tokens aus dem Pfad.
 * @param {string} path - Der Pfad
 * @returns {Array<Token[]>} Segmente mit Tokens
 */
function tokenizePath(path) {
    if (!path) {
        return [[]];
    }

    if (path === "/") {
        return [[ROOT_TOKEN]];
    }

    if (!path.startsWith("/")) {
        throw new Error(`Invalid path "${path}"`);
    }

    function crash(message) {
        throw new Error(`ERR (${state})/"${buffer}": ${message}`);
    }

    let state = TokenizerState.Static;
    let previousState = state;
    const segments = [];
    let segment;

    function finalizeSegment() {
        if (segment) {
            segments.push(segment);
        }

        segment = [];
    }

    // Index im Pfad
    let i = 0;
    // Zeichen an Indexposition
    let char;
    // buffer of the value read
    let buffer = "";
    // custom regexp for a param
    let customRe = "";

    function consumeBuffer() {
        if (!buffer) {
            return;
        }

        if (state === TokenizerState.Static) {
            segment.push({
                type: TokenType.Static,
                value: buffer,
            });
        } else if (
            state === TokenizerState.Param ||
            state === TokenizerState.ParamRegExp ||
            state === TokenizerState.ParamRegExpEnd
        ) {
            if (segment.length > 1 && (char === "*" || char === "+")) {
                crash(`A repeatable param (${buffer}) must be alone in its segment. eg: '/:ids+.`);
            }

            segment.push({
                type: TokenType.Param,
                value: buffer,
                regexp: customRe,
                repeatable: char === "*" || char === "+",
                optional: char === "*" || char === "?",
            });
        } else {
            crash("Invalid state to consume buffer");
        }

        buffer = "";
    }

    function addCharToBuffer() {
        buffer += char;
    }

    while (i < path.length) {
        char = path[i++];

        if (char === "\\" && state !== TokenizerState.ParamRegExp) {
            previousState = state;
            state = TokenizerState.EscapeNext;
        } else {
            switch (state) {
                case TokenizerState.Static:
                    if (char === "/") {
                        if (buffer) {
                            consumeBuffer();
                        }

                        finalizeSegment();
                    } else if (char === ":") {
                        consumeBuffer();
                        state = TokenizerState.Param;
                    } else {
                        addCharToBuffer();
                    }

                    break;

                case TokenizerState.EscapeNext:
                    addCharToBuffer();
                    state = previousState;
                    break;

                case TokenizerState.Param:
                    if (char === "(") {
                        state = TokenizerState.ParamRegExp;
                    } else if (VALID_PARAM_RE.test(char)) {
                        addCharToBuffer();
                    } else {
                        consumeBuffer();
                        state = TokenizerState.Static;
                        // go back one character if we were not modifying
                        if (char !== "*" && char !== "?" && char !== "+") i--;
                    }

                    break;

                case TokenizerState.ParamRegExp:
                    if (char === ")") {
                        // handle the escaped )
                        if (customRe[customRe.length - 1] === "\\") {
                            customRe = customRe.slice(0, -1) + char;
                        } else {
                            state = TokenizerState.ParamRegExpEnd;
                        }
                    } else {
                        customRe += char;
                    }

                    break;

                case TokenizerState.ParamRegExpEnd:
                    // same as finalizing a param
                    consumeBuffer();
                    state = TokenizerState.Static;
                    // go back one character if we were not modifying
                    if (char !== "*" && char !== "?" && char !== "+") i--;
                    customRe = "";
                    break;

                default:
                    crash("Unknown state");
                    break;
            }
        }
    }

    if (state === TokenizerState.ParamRegExp) {
        crash(`Unfinished custom RegExp for param "${buffer}"`);
    }

    consumeBuffer();
    finalizeSegment();

    return segments;
}

/**
 * Erzeugt aus den Tokens eines Pfads einen Score, die Parameter und ein RegExp.
 * @param {Array<Token[]>} segments - Sie Segmente mit den Tokens
 * @param {PathOptions} pathOptions - Die Optionen des
 * @returns {{score: number[], keys: ParamKey, re: RegExp}}
 */
function handleTokens(segments, pathOptions) {
    const options = assign({}, BASE_PATH_OPTIONS, pathOptions);

    let pattern = options.start ? "^" : "";
    const score = [];
    const keys = [];

    for (const segment of segments) {
        const segmentScores = segment.length > 0 ? [] : [PathScore.ROOT];

        if (options.strict && segment.length === 0) {
            pattern += "/";
        }

        for (let tokenIndex = 0; tokenIndex < segment.length; tokenIndex++) {
            const token = segment[tokenIndex];
            // In einem Untersegment wird der Score zurückgesetzt
            let subSegmentScore = PathScore.Segment + (options.sensitive ? PathScore.BonusCaseSensitive : 0);

            if (token.type === TokenType.Static) {
                // Ein neues Segment mit einem Slash beginnen
                if (tokenIndex === 0) {
                    pattern += "/";
                }

                pattern += token.value.replace(REGEX_CHARS_RE, "\\$&");
                subSegmentScore += PathScore.Static;
            } else if (token.type === TokenType.Param) {
                const { value, repeatable, optional, regexp } = token;

                keys.push({
                    name: value,
                    repeatable,
                    optional,
                });

                const re = regexp || BASE_PARAM_PATTERN;

                // Ein Benutzerdefinierter regulärer Ausdruck
                if (re !== BASE_PARAM_PATTERN) {
                    subSegmentScore += PathScore.BonusCustomRegExp;

                    // Sicher gehen, dass es sich um einen richtigen regulären Ausdruck handelt
                    try {
                        // eslint-disable-next-line no-new
                        new RegExp(`(${re})`);
                    } catch (err) {
                        throw new Error(`Invalid custom RegExp for param "${value}" (${re}): ${err.message}`);
                    }
                }

                // Einen führenden Slash, wenn es sich um einen wiederholenden Token handelt
                let subPattern = repeatable ? `((?:${re})(?:/(?:${re}))*)` : `(${re})`;

                // Bei einem neuen Segment mit einem Slash beginnen
                if (!tokenIndex) {
                    subPattern = optional && segment.length < 2
                        ? `(?:/${subPattern})`
                        : "/" + subPattern;
                }

                if (optional) {
                    subPattern += "?";
                }

                pattern += subPattern;

                subSegmentScore += PathScore.Dynamic;

                if (optional) {
                    subSegmentScore += PathScore.BonusOptional;
                }

                if (repeatable) {
                    subSegmentScore += PathScore.BonusRepeatable;
                }

                if (re === ".*") {
                    subSegmentScore += PathScore.BonusWildcard;
                }
            }

            segmentScores.push(subSegmentScore);
        }

        score.push(segmentScores);
    }

    // Der strenge Bonus soll nur auf die letzte Punktzahl angewendet werden
    if (options.strict && options.end) {
        const i = score.length - 1;
        score[i][score[i].length - 1] += PathScore.BonusStrict;
    }

    if (!options.strict) {
        pattern += "/?";
    }

    if (options.end) {
        pattern += "$";
    } else if (options.strict) {
        pattern += "(?:/|$)";
    }

    return {
        score,
        keys,
        re: new RegExp(pattern, options.sensitive ? "" : "i")
    };
}

/**
 * Prüft, ob der Matcher ein Alias ist.
 * @param {RouteRecordMatcher} matcher - Der zu prüfende Matcher
 * @returns {boolean}
 */
export function isAliasRecord(matcher) {
    while (matcher) {
        if (matcher.record.aliasOf) {
            return true;
        }

        matcher = matcher.parent;
    }

    return false;
}

/**
 * Prüft, ob der Matcher ein Sub-Matcher vom anderen ist.
 * @param {RouteRecordMatcher} record - Der zu prüfende Matcher
 * @param {RouteRecordMatcher} parent - Ist Sub-Matcher von diesem Matcher
 * @returns {boolean}
 */
export function isRecordChildOf(record, parent) {
    return parent.children.some(child => child === record || isRecordChildOf(record, child));
}

/**
 * Vergleicht zwei Arrays mit Zahlen miteinander.
 * Die Funktion kann benutzt werden um ein Array mit "sort" zu sortieren.
 * @param {number[]} a - Erstes Array mit Zahlen
 * @param {number[]} b - Zweites Array mit Zahlen
 * @returns {number} 0, wenn beide gleich sind;
 * < 0, wenn a als erstes einsortiert werden soll;
 * > 0, wenn b als erstes einsortiert werden soll
 */
function compareScoreArray(a, b) {
    let i = 0;

    while (i < a.length && i < b.length) {
        const diff = b[i] - a[i];

        // nur weitermachen wenn diff === 0
        if (diff) {
            return diff;
        }

        i++;
    }

    // Wenn das letzte Untersegment statisch war, sollten die kürzeren Segmente zuerst sortiert werden,
    // andernfalls wird zuerst das längste Segment einsortiert
    if (a.length < b.length) {
        return a.length === 1 && a[0] === PathScore.Static + PathScore.Segment
            ? -1
            : 1;
    } else if (a.length > b.length) {
        return b.length === 1 && b[0] === PathScore.Static + PathScore.Segment
            ? 1
            : -1;
    }

    return 0;
}

/**
 * Vergleichsfunktion, die mit "sort" verwendet werden kann, um ein Array von Matchern zu sortieren.
 * @param {RouteRecordMatcher} a - Erster Matcher
 * @param {RouteRecordMatcher} b - Zweiter Matcher
 * @returns {number} 0, wenn beide gleich sind;
 * < 0, wenn a als erstes einsortiert werden soll;
 * > 0, wenn b als erstes einsortiert werden soll
 */
export function comparePathScore(a, b) {
    let i = 0;
    const aScore = a.score;
    const bScore = b.score;

    while (i < aScore.length && i < bScore.length) {
        const comp = compareScoreArray(aScore[i], bScore[i]);

        // nicht zurückkehren, wenn beide gleich sind
        if (comp) {
            return comp;
        }

        i++;
    }

    // Wenn a und b die gleichen Punktzahleinträge teilen, aber b mehr hat, sortiere zuerst b ein
    return bScore.length - aScore.length;
}
