import { EMPTY_OBJ } from "../../shared/index.js";
import { FINALIZED, webComponentExtends } from "./WebComponent.js";
import { insert, removeNode } from "./dom.js";
import { patchProps } from "./renderer.js";

/**
 * Die Basis Komponente aller Custom Elemente.
 * @class BaseComponent
 * @extends {WebComponent<HTMLElement>}
 */
export class BaseComponent extends webComponentExtends(HTMLElement) {
    static [FINALIZED] = true;

    useShadowDom = false;
    inheritAttrs = false;

    /**
     * Updated die Attribute der funktionalen Komponente.
     * @param {VNodeProps} newAttrs
     * @param {VNodeProps} oldAttrs
     * @private
     */
    _updateAttributes(newAttrs, oldAttrs = EMPTY_OBJ) {
        if (!this.inheritAttrs) {
            patchProps(this, oldAttrs, newAttrs);
        }
    }

    /**
     * Triggert ein Event an der Komponente.
     * @type {ComponentEmitter}
     */
    emit(event, data) {
        this.dispatchEvent(new CustomEvent(event, {
            detail: {
                from: this,
                data
            }
        }));
    }

    /**
     * Bindet die Basis-Komponente in den DOM ein.
     * @param {Element} container - Der Container, in den die Basis-Komponente eingebunden werden soll
     * @param {Node} [anchor] - Der Anker, vor dem die Basis-Komponente eingebunden werden soll
     */
    mount(container, anchor) {
        insert(this, container, anchor);
    }

    /**
     * Entfernt die Basis-Komponente aus dem DOM.
     */
    unmount() {
        super.unmount(() => removeNode(this));
    }

    connectedCallback() {
        let elem = this;

        if (this.useShadowDom) {
            elem = !this.isMounted
                ? this.attachShadow(typeof this.useShadowDom === "boolean"
                    ? { mode: "open" }
                    : this.useShadowDom)
                : this.shadowRoot;
        }

        super.mount(elem, null);
    }

    disconnectedCallback() {
        this.unmount();
    }
}
