import { assign } from "../../shared/index.js";
import { computed, ref, toRef } from "../../reactivity/index.js";
import {
    FunctionalComponent,
    h,
    inject,
    provide,
    registerComponent,
    watch
} from "../../runtime/index.js";
import { currentInstance } from "./Router.js";
import { isSameRouteRecord } from "./RouteRecord.js";

const viewDepthKey = Symbol("viewDepth");

export const matchedRouteKey = Symbol("matchedRoute");

/**
 * Die Integration der Komponente aus dem Router.
 * Je nach Verschachtelungsebene und Name, wird die entsprechende Komponente aus dem Router geladen.
 * @class
 * @extends {FunctionalComponent}
 */
export class RouterView extends FunctionalComponent {
    static tag = "router-view";

    static props() {
        return {
            name: {
                type: String,
                default: "default"
            }
        };
    }

    setup(props) {
        const depth = inject(viewDepthKey, 0);
        const route = currentInstance.currentRoute;

        const matchedRoute = computed(() => {
            return route.value.matched[depth];
        });

        provide(viewDepthKey, depth + 1);
        provide(matchedRouteKey, matchedRoute);

        const view = ref();

        watch(
            () => [view.value, matchedRoute.value, props.name],
            ([instance, to, name], [oldInstance, from, oldName]) => {
                if (to) {
                    to.instance[name] = instance;

                    if (from && from !== to && instance && instance === oldInstance) {
                        if (!to.leaveGuards.size) {
                            to.leaveGuards = from.leaveGuards;
                        }

                        if (!to.updateGuards) {
                            to.updateGuards = from.updateGuards;
                        }
                    }
                }

                if (instance && to && (!from || !isSameRouteRecord(to, from) || !oldInstance)) {
                    (to.enterCallbacks[name] || []).forEach(callback => callback(instance));
                }
            },
            { flush: "post" }
        );

        return {
            view,
            route,
            matchedRoute
        };
    }

    render(data, { props, attrs, slots }) {
        const view = toRef(data, "view");
        const route = data.route;
        const ViewComponent = data.matchedRoute && data.matchedRoute.components[props.name];

        if (!ViewComponent) {
            return slots.default?.();
        }

        const routePropsOption = data.matchedRoute?.props[props.name];
        const routeProps = routePropsOption
            ? routePropsOption === true
                ? route.params
                : typeof routePropsOption === "function"
                    ? routePropsOption(route)
                    : routePropsOption
            : null;

        const component = h(ViewComponent, assign({}, routeProps, attrs, {
            ref: view
        }));

        return component;
    }
}

registerComponent(RouterView);
