(() => {
    "use strict";

    /*
     * Single-CDN SPA Wrapper
     *
     * The script:
     * - Turns the top-level page into a full-page iframe
     * - Does NOT iframe itself again
     * - Syncs title, favicon, and URL
     * - Redirects if navigation crosses origins
     * - Does not proxy or modify network requests
     */

    const MESSAGE_TYPE = "CDN_SPA_PAGE_STATE";
    const IFRAME_MARKER = "__cdn_spa_iframe";

    // Prevent the script from wrapping the page again inside the iframe.
    const isInsideIframe = window.self !== window.top;

    if (isInsideIframe) {
        initializeIframe();
    } else {
        initializeHost();
    }

    /*
     * ============================================
     * IFRAME SIDE
     * ============================================
     */

    function initializeIframe() {
        let lastTitle = document.title;
        let lastURL = window.location.href;
        let lastFavicon = getFavicon();
        let lastBackground = getBackgroundColor();

        function sendPageState(action = "replace") {
            const state = {
                type: MESSAGE_TYPE,
                action,
                title: document.title,
                url: window.location.href,
                favicon: getFavicon(),
                background: getBackgroundColor()
            };

            try {
                window.parent.postMessage(state, "*");
            } catch {
                // Ignore messaging failures.
            }

            lastTitle = state.title;
            lastURL = state.url;
            lastFavicon = state.favicon;
            lastBackground = state.background;
        }

        function getFavicon() {
            const icon =
            document.querySelector('link[rel~="icon"]') ||
            document.querySelector('link[rel="shortcut icon"]') ||
            document.querySelector('link[rel="apple-touch-icon"]');

            if (!icon) {
                return null;
            }

            try {
                return new URL(icon.href, window.location.href).href;
            } catch {
                return icon.href || null;
            }
        }

        function getBackgroundColor() {
            const bodyBackground =
            getComputedStyle(document.body).backgroundColor;

            const htmlBackground =
            getComputedStyle(document.documentElement).backgroundColor;

            /*
             * Prefer the body's visible background.
             * If it is transparent, use the document background.
             */
            if (
                bodyBackground &&
                bodyBackground !== "rgba(0, 0, 0, 0)" &&
                bodyBackground !== "transparent"
                ) {
                return bodyBackground;
            }

            return htmlBackground || "transparent";
        }

        function checkForChanges() {
            const currentTitle = document.title;
            const currentURL = window.location.href;
            const currentFavicon = getFavicon();
            const currentBackground = getBackgroundColor();

            if (
                currentTitle !== lastTitle ||
                currentURL !== lastURL ||
                currentFavicon !== lastFavicon ||
                currentBackground !== lastBackground
                ) {
                sendPageState();
            }
        }

        /*
         * Given a candidate URL, decide whether it crosses origins.
         * Returns the resolved absolute URL, or null if it's invalid.
         */
        function resolveCrossOrigin(rawURL) {
            try {
                const currentURL = new URL(window.location.href);
                const targetURL = new URL(rawURL, currentURL.href);

                if (targetURL.origin !== currentURL.origin) {
                    return targetURL;
                }
            } catch {
                // Ignore invalid URLs.
            }

            return null;
        }

        function notifyParentOfExternalNavigation(targetURL) {
            try {
                window.parent.postMessage({
                    type: MESSAGE_TYPE,
                    navigate: targetURL.href
                }, "*");
            } catch {
                // Ignore.
            }
        }

        /*
         * Initial state.
         */
        sendPageState();

        /*
         * Detect title changes.
         */
        const titleObserver = new MutationObserver(() => {
            checkForChanges();
        });

        const titleElement = document.querySelector("title");

        if (titleElement) {
            titleObserver.observe(titleElement, {
                childList: true,
                characterData: true,
                subtree: true
            });
        }

        /*
         * Detect favicon changes and DOM changes that may create one.
         */
        const headObserver = new MutationObserver(() => {
            checkForChanges();
        });

        if (document.head) {
            headObserver.observe(document.head, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: [
                    "href",
                    "rel"
                ]
            });
        }

        /*
         * Detect URL changes.
         *
         * pushState and replaceState do not emit native events,
         * so we hook them only to notify the parent.
         */
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function (...args) {
            const result = originalPushState.apply(this, args);

            queueMicrotask(() => {
                sendPageState("push");
            });

            return result;
        };

        history.replaceState = function (...args) {
            const result = originalReplaceState.apply(this, args);

            queueMicrotask(() => {
                sendPageState("replace");
            });

            return result;
        };

        window.addEventListener("popstate", sendPageState);
        window.addEventListener("hashchange", sendPageState);

        /*
         * Handle Back/Forward navigation from the parent.
         */
        window.addEventListener("message", event => {
            if (
                event.data?.type === MESSAGE_TYPE &&
                event.data.navigate &&
                event.data.navigate !== window.location.href
                ) {
                window.location.href = event.data.navigate;
            }
        });

        /*
         * ---- Layer 1: intercept intent as early as possible ----
         *
         * Catch clicks on links and form submissions in the capture
         * phase, BEFORE the browser sends the request. This covers
         * every browser (not just ones with the Navigation API) and
         * catches the common case: a link/form whose target is
         * directly on another origin.
         *
         * NOTE: this cannot see through a same-origin URL that the
         * server later 302s to a different origin - that case is
         * handled by Layer 3 below, on the host side.
         */
        document.addEventListener("click", event => {
            if (event.defaultPrevented || event.button !== 0) {
                return;
            }

            const anchor = event.target?.closest?.("a[href]");

            if (!anchor) {
                return;
            }

            // Respect explicit new-tab/modifier-click intent.
            if (
                anchor.target === "_blank" ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
                ) {
                return;
            }

            const targetURL = resolveCrossOrigin(anchor.getAttribute("href"));

            if (targetURL) {
                event.preventDefault();
                event.stopImmediatePropagation();
                notifyParentOfExternalNavigation(targetURL);
            }
        }, true);

        document.addEventListener("submit", event => {
            if (event.defaultPrevented) {
                return;
            }

            const form = event.target;

            if (!(form instanceof HTMLFormElement)) {
                return;
            }

            const action = form.getAttribute("action") || window.location.href;
            const targetURL = resolveCrossOrigin(action);

            if (targetURL) {
                event.preventDefault();
                event.stopImmediatePropagation();
                notifyParentOfExternalNavigation(targetURL);
            }
        }, true);

        /*
         * ---- Layer 2: Navigation API, where available ----
         *
         * Belt-and-suspenders for programmatic navigations
         * (location.href = ..., location.assign(), etc.) that
         * don't go through a click or submit event.
         */
        if ("navigation" in window) {
            navigation.addEventListener("navigate", event => {
                const destination = event.destination?.url;

                if (!destination) {
                    return;
                }

                const targetURL = resolveCrossOrigin(destination);

                if (targetURL) {
                    event.preventDefault();
                    notifyParentOfExternalNavigation(targetURL);
                }
            });
        }

        /*
         * Some frameworks modify the URL in unusual ways.
         * This lightweight fallback catches those without
         * touching network requests.
         */
        setInterval(checkForChanges, 500);

        /*
         * Tell the parent that the iframe is ready.
         */
        try {
            window.parent.postMessage({
                type: MESSAGE_TYPE,
                ready: true,
                title: document.title,
                url: window.location.href,
                favicon: getFavicon(),
                background: getBackgroundColor()
            }, "*");
        } catch {
            // Ignore.
        }
    }

    /*
     * ============================================
     * HOST SIDE
     * ============================================
     */

    function initializeHost() {
        const originalURL = window.location.href;

        const iframe = document.createElement("iframe");

        iframe.setAttribute(IFRAME_MARKER, "true");

        iframe.src = originalURL;

        iframe.style.position = "fixed";
        iframe.style.inset = "0";
        iframe.style.width = "100vw";
        iframe.style.height = "100vh";
        iframe.style.border = "0";
        iframe.style.margin = "0";
        iframe.style.padding = "0";
        iframe.style.display = "block";
        iframe.style.background = "white";
        iframe.style.zIndex = "2147483647";

        // Tracks the last URL we know the iframe legitimately holds,
        // so Layer 3 (below) can bounce back to it if we detect an
        // uncontrolled cross-origin escape (e.g. a server-side redirect).
        let lastKnownGoodURL = originalURL;

        /*
         * Remove all visible original page content.
         *
         * This happens only to the outer host document.
         * The iframe loads a fresh copy of the original URL.
         */
        function mountIframe() {
            const html = document.documentElement;

            // Remove the original page content without destroying <head>.
            document.body.innerHTML = "";

            html.style.margin = "0";
            html.style.padding = "0";
            html.style.width = "100%";
            html.style.height = "100%";
            html.style.overflow = "hidden";

            document.body.style.margin = "0";
            document.body.style.padding = "0";
            document.body.style.width = "100%";
            document.body.style.height = "100%";
            document.body.style.overflow = "hidden";

            document.body.appendChild(iframe);
        }

        function setBackground(color) {
            if (!color) {
                return;
            }

            document.documentElement.style.backgroundColor = color;
            document.body.style.backgroundColor = color;
            iframe.style.backgroundColor = color;
        }

        function setFavicon(url) {
            if (!url) {
                return;
            }

            let favicon =
            document.querySelector('link[data-cdn-spa-favicon="true"]');

            if (!favicon) {
                favicon = document.createElement("link");

                favicon.rel = "icon";
                favicon.dataset.cdnSpaFavicon = "true";

                document.head.appendChild(favicon);
            }

            if (favicon.href !== url) {
                favicon.href = url;
            }
        }

        function setTitle(title) {
            if (typeof title === "string") {
                document.title = title;
            }
        }

        function syncURL(url, action = "replace") {
            try {
                const newURL = new URL(url);
                const currentURL = new URL(window.location.href);

                /*
                 * CRITICAL:
                 *
                 * If the iframe navigates to another origin,
                 * do not attempt to mirror it with history API.
                 *
                 * Just perform a normal browser navigation.
                 */
                if (newURL.origin !== currentURL.origin) {
                    iframe.style.visibility = "hidden";

                    window.location.replace(newURL.href);
                    return;
                }

                /*
                 * Same-origin URL:
                 *
                 * Update the outer browser URL without
                 * actually navigating the host page.
                 */
                const newPath =
                newURL.pathname +
                newURL.search +
                newURL.hash;

                if (action === "push") {
                    history.pushState(
                        history.state,
                        "",
                        newPath
                        );
                } else {
                    history.replaceState(
                        history.state,
                        "",
                        newPath
                        );
                }

                lastKnownGoodURL = newURL.href;
            } catch {
                // Ignore invalid URLs.
            }
        }

        /*
         * Receive state from the iframe.
         */
        window.addEventListener("message", event => {
            const data = event.data;

            if (!data || data.type !== MESSAGE_TYPE) {
                return;
            }

            /*
             * Only accept messages from our actual iframe.
             */
            if (event.source !== iframe.contentWindow) {
                return;
            }

            if (data.navigate) {
                window.location.replace(data.navigate);
                return;
            }

            if (typeof data.title === "string") {
                setTitle(data.title);
            }

            if (data.favicon) {
                setFavicon(data.favicon);
            }

            if (data.background) {
                setBackground(data.background);
            }

            if (data.url) {
                syncURL(data.url, data.action);
            }
        });

        /*
         * ---- Layer 3: catch anything that still slipped through ----
         *
         * If a same-origin link 302s to another origin at the HTTP
         * level, our in-page script never runs on the destination
         * (it's a different site), so no message ever arrives. The
         * iframe's "load" event still fires, though - even for
         * cross-origin loads. We use that as a trip wire: if we can
         * no longer read the iframe's location after a load, an
         * unauthorized cross-origin page is sitting in our iframe.
         *
         * We can't recover the URL it landed on (cross-origin read
         * access is blocked by design), but writing to a cross-origin
         * window's location IS allowed (the same mechanism behind
         * frame-busting), so we immediately steer it back rather than
         * let an external, unbranded page sit under our chrome.
         */
        iframe.addEventListener("load", () => {
            let sameOrigin = true;

            try {
                // Any property read throws if this is cross-origin.
                void iframe.contentWindow.location.href;
            } catch {
                sameOrigin = false;
            }

            if (!sameOrigin) {
                try {
                    iframe.contentWindow.location.replace(lastKnownGoodURL);
                } catch {
                    // As an absolute last resort, reload the host itself.
                    window.location.reload();
                }
            }
        });

        /*
         * Handle browser Back/Forward navigation.
         *
         * When the parent URL changes through the browser's
         * Back or Forward buttons, tell the iframe to navigate
         * to the same URL.
         */
        window.addEventListener("popstate", () => {
            iframe.contentWindow.postMessage({
                type: MESSAGE_TYPE,
                navigate: window.location.href
            }, "*");
        });

        /*
         * Mount after the script has initialized.
         */
        if (document.readyState === "loading") {
            document.addEventListener(
                "DOMContentLoaded",
                mountIframe, {
                    once: true
                }
                );
        } else {
            mountIframe();
        }
    }
})();
