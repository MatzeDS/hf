import { hyphenate, isFunction } from "../../shared/index.js";
import { FINALIZED, webComponentExtends } from "./WebComponent.js";

/**
 * Die funktionale Komponente ist kein Custom Element, aber hat die gleichen Funktionen wie die Basis-Komponente.
 * @class FunctionalComponent
 * @extends {WebComponent<Object>}
 */
export class FunctionalComponent extends webComponentExtends(Object) {
    static [FINALIZED] = true;
    static get isFunctional() {
        return true;
    }

    get isFunctional() {
        return true;
    }

    #eventHandlers;

    /**
     * Updated die Attribute der funktionalen Komponente.
     * @param {} newAttrs
     * @private
     */
    _updateAttributes(newAttrs) {
        this.#eventHandlers = newAttrs
            ? Object.keys(newAttrs)
                .filter(attr => attr.startsWith("on"))
                .reduce((handlers, attr) => {
                    if (isFunction(newAttrs[attr])) {
                        const event = hyphenate(name.slice(2));
                        handlers[event] = newAttrs[attr];
                    }

                    return handlers;
                }, {})
            : null;
    }

    /**
     * Triggert ein Event an der Komponente.
     * @type {ComponentEmitter}
     */
    emit(event, data) {
        this.#eventHandlers?.[event]?.(data);
    }

    /**
     * Bindet die funktionale Komponente in den DOM ein.
     * @param {Element} container - Der Container, in den die funktionale Komponente eingebunden werden soll
     * @param {Node} [anchor] - Der Anker, vor dem die funktionale Komponente eingebunden werden soll
     */
    mount(container, anchor) {
        super.mount(container, anchor);
    }

    /**
     * Entfernt die funktionale Komponente aus dem DOM.
     */
    unmount() {
        super.unmount();
    }
}
