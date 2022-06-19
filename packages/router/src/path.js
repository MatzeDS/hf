/**
 * Gibt den letzten Teil des Pfades zurück, wahlweise ohne Dateierweiterung.
 * @param {string} path - Der Pfad
 * @param {string|boolean} [ext] - Keine oder eine bestimmte Die Dateierweiterung, welche nicht mit ausgegeben werden soll.
 * @returns {string} Der letzte Teil des Pfades
 */
export const basename = (path, ext) => {
    let idx = path.lastIndexOf("/");
    let basename = path;

    if (idx >= 0) {
        basename = path.substr(idx + 1);
    }

    if (ext) {
        idx = basename.lastIndexOf(typeof ext === "string" ? ext : ".");

        if (idx > 0) {
            basename = basename.substring(0, idx);
        }
    }

    return basename;
};

/**
 * Gibt das Verzeichnis des Pfades zurück.
 * @param {string} path - Der Pfad
 * @returns {string} - Das Verzeichnis
 */
export const dirname = (path) => {
    const idx = path.lastIndexOf("/");

    if (idx >= 0) {
        return path.substring(0, idx);
    }

    return path;
};

/**
 * Verbindet Pfade oder Pfadteile miteinander.
 * @param {...string} paths - Die Pfade oder Pfadteile
 * @return {string} - Der verbundene Pfad
 */
export const join = (...paths) => {
    return normalize(paths.filter(path => path && typeof path === "string").join("/"));
};


/**
 * Normalisiert ein Array aus Pfadteilen.
 * @param {string[]} parts - Die Teile des Pfads
 * @param {boolean} allowAboveRoot - Kann der Pfad über den Root hinaus ragen
 * @return {*}
 */
function normalizeArray(parts, allowAboveRoot) {
    let up = 0;

    for (let i = parts.length - 1; i >= 0; i--) {
        const last = parts[i];

        if (last === ".") {
            parts.splice(i, 1);
        } else if (last === "..") {
            parts.splice(i, 1);
            up++;
        } else if (up) {
            parts.splice(i, 1);
            up--;
        }
    }

    if (allowAboveRoot) {
        for (; up--; up) {
            parts.unshift("..");
        }
    }

    return parts;
}

/**
 * Normalisiert den Pfad, in dem es //, ./ und relative Teile entfernt.
 * @param {string} path - Der Pfad
 * @return {string} - Der normalisierte Pfad
 */
export const normalize = (path) => {
    const isAbsolute = path.startsWith("/");
    const trailingSlash = path.endsWith("/");

    let normalizedPath = normalizeArray(path.split("/").filter(Boolean), !isAbsolute).join("/");

    if (normalizedPath && trailingSlash) {
        normalizedPath += "/";
    }

    return (isAbsolute ? "/" : "") + normalizedPath;
};

/**
 * Bestimmt die Tiefe des Pfades (die Anzahl der Ebenen bis zum Root)
 * @param {string} path - Der Pfad
 * @return {number} - Die Tiefe
 */
export const depth = (path) => {
    let count = 0;
    let idx = -1;

    while ((idx = path.indexOf("/", idx + 1)) >= 0) {
        count++;
    }

    return count;
};

/**
 * Auflösen des relativen Pfades, in Abhängigkeit vom aktuellen Pfad.
 * @param {string} to - Der relative Pfad
 * @param {string} from - Der aktuelle Pfad
 * @returns {string} Der absolute Pfad
 */
export function resolveRelativePath(to, from) {
    if (to.startsWith("/")) {
        return to;
    }

    if (!to) {
        return from;
    }

    const fromSegments = from.split("/");
    const toSegments = to.split("/");

    let position = fromSegments.length - 1;
    let toPosition;
    let segment;

    for (toPosition = 0; toPosition < toSegments.length; toPosition++) {
        segment = toSegments[toPosition];

        if (position !== 1 && segment !== ".") {
            if (segment === "..") {
                position--;
            } else {
                break;
            }
        }
    }

    return (
        fromSegments.slice(0, position).join("/") + "/" + toSegments
            .slice(toPosition - (toPosition === toSegments.length ? 1 : 0))
            .join("/")
    );
}

const TRAILING_SLASH_RE = /\/$/;

/**
 * Entfernt Slash am Ende des Pfades.
 * @param {string} path - Der Pfad
 * @returns {string} Der Pfad ohne Slash am Ende
 */
export const removeTrailingSlash = (path) => path.replace(TRAILING_SLASH_RE, "");
