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

        function sendPageState(action = "replace") {
            const state = {
                type: MESSAGE_TYPE,
                action,
                title: document.title,
                url: window.location.href,
                favicon: getFavicon()
            };

            try {
                window.parent.postMessage(state, "*");
            } catch {
                // Ignore messaging failures.
            }

            lastTitle = state.title;
            lastURL = state.url;
            lastFavicon = state.favicon;
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

        function checkForChanges() {
            const currentTitle = document.title;
            const currentURL = window.location.href;
            const currentFavicon = getFavicon();

            if (
                currentTitle !== lastTitle ||
                currentURL !== lastURL ||
                currentFavicon !== lastFavicon
            ) {
                sendPageState();
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

        history.pushState = function(...args) {
            const result = originalPushState.apply(this, args);

            queueMicrotask(() => {
                sendPageState("push");
            });

            return result;
        };

        history.replaceState = function(...args) {
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
                favicon: getFavicon()
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

        /*
         * Remove all visible original page content.
         *
         * This happens only to the outer host document.
         * The iframe loads a fresh copy of the original URL.
         */
        function mountIframe() {
            document.documentElement.innerHTML = "";

            document.documentElement.style.margin = "0";
            document.documentElement.style.padding = "0";
            document.documentElement.style.width = "100%";
            document.documentElement.style.height = "100%";
            document.documentElement.style.overflow = "hidden";

            document.body = document.createElement("body");

            document.body.style.margin = "0";
            document.body.style.padding = "0";
            document.body.style.width = "100%";
            document.body.style.height = "100%";
            document.body.style.overflow = "hidden";

            document.body.appendChild(iframe);
        }

        /*
         * Store whether the favicon was explicitly changed
         * by the SPA wrapper.
         */
        let wrapperChangedFavicon = false;

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
                wrapperChangedFavicon = true;
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
                    // Prevent the iframe's navigation from causing a second
                    // synchronization cycle while the parent takes over.
                    iframe.src = "about:blank";

                    window.location.replace(newURL.href);
                    return;
                }

                /*
                 * Same-origin URL:
                 *
                 * Update the outer browser URL without
                 * actually navigating the host page.
                 */
                const currentPath =
                    currentURL.pathname +
                    currentURL.search +
                    currentURL.hash;

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

            if (typeof data.title === "string") {
                setTitle(data.title);
            }

            /*
             * Only update the favicon if the iframe
             * explicitly provides one.
             *
             * If it has no favicon, the wrapper leaves
             * the host favicon alone.
             */
            if (data.favicon) {
                setFavicon(data.favicon);
            }

            if (data.url) {
                syncURL(data.url, data.action);
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
