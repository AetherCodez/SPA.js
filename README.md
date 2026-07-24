<p align="center">
  <a href="https://github.com/AetherCodez/SPA.js">
    <img src="logo.png" alt="SPA.js Logo" width="200"/>
  </a>
</p>

<p align="center">
  Transform any website into a Single Page Application with seamless navigation, URL synchronization, and modern web app behavior.
</p>

<br>

## What is SPA.js?

SPA.js converts traditional multi-page websites into smooth, app-like experiences without requiring any backend changes or framework rewrites. Just include one script and your site instantly gains SPA superpowers.

## The Problem

Traditional websites suffer from:

* Page refreshes that break user flow
* Lost scroll position on navigation
* Slow loading between pages
* Jarring user experience compared to modern web apps

## The Solution

SPA.js creates a seamless single-page experience by:

* **Eliminating page refreshes** - Navigation happens instantly
* **Maintaining browser history** - Back/forward buttons work perfectly
* **Preserving scroll state** - Users never lose their place
* **Synchronizing everything** - URLs, titles, favicons stay in perfect sync
* **Zero configuration** - Works with any existing website

## Features

* **Instant Navigation** - No more page refreshes or loading states
* **Perfect URL Sync** - Browser address bar stays current with content
* **Browser History** - Back/forward buttons work as expected
* **Scroll Preservation** - Smooth transitions without position loss
* **Title & Favicon Updates** - Full metadata synchronization
* **External Link Handling** - Smart detection and proper redirects
* **Zero Dependencies** - Pure vanilla JavaScript
* **Tiny Footprint** - Only ~2KB minified

## Quick Start

### CDN

```html
<script src="https://cdn.jsdelivr.net/gh/AetherCodez/SPA.js/spa.min.js"></script>
```

### Local Installation

```bash
# Download to your project
curl -O https://raw.githubusercontent.com/AetherCodez/SPA.js/main/spa.min.js
```

### Usage

Add one line to any webpage:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Website</title>
</head>
<body>
    <!-- Your existing content -->

    <script src="spa.min.js"></script>
</body>
</html>
```

**That's it!** Your website now behaves like a modern SPA.

## How It Works

SPA.js uses a clever iframe-based architecture:

1. **Auto-Detection** - Detects if running in the main window or iframe context
2. **Seamless Wrapping** - Creates a fullscreen iframe container for content
3. **Navigation Interception** - Captures internal link clicks
4. **State Synchronization** - Keeps the parent and iframe perfectly in sync
5. **History Management** - Maintains the proper browser history stack

The result? Users experience seamless navigation while maintaining all the benefits of traditional web architecture.

## Use Cases

### Transform Existing Sites

* Blog platforms into app-like experiences
* Documentation sites with instant navigation
* E-commerce sites with smooth browsing
* Corporate websites with a modern feel

### Developer Tools

* Website preview systems
* Content management interfaces
* Educational platform integrations
* Dashboard embedded applications

### When to Use SPA.js

* You want SPA benefits without a framework migration
* You need to modernize a legacy website quickly
* You're building tools that embed external content
* You want a seamless multi-page experience

## Browser Support

* Chrome/Edge 60+
* Firefox 55+
* Safari 11+

Requires modern browsers with `postMessage` and the History API.

## Configuration

SPA.js works automatically, but you can listen for navigation events:

```javascript
window.addEventListener('message', (e) => {
    if (e.data.type === 'spa-nav') {
        console.log('User navigated to:', e.data.url);
        // Analytics, custom handling, etc.
    }
});
```

### Available Events

* `spa-nav` - User navigated to a new page
* `spa-external` - An external link was clicked
* `spa-title` - The page title changed
* `spa-favicon` - The page favicon changed
* `spa-bgcolor` - The page background color changed

## Security

SPA.js uses iframe sandboxing with minimal required permissions:

* `allow-scripts` - JavaScript execution
* `allow-same-origin` - Same-origin communication
* `allow-forms` - Form submissions
* `allow-popups` - Popup handling

External links are automatically detected and safely redirected.

## Understanding the Code

Want to see how the magic works? Check out the **non-minified version**:

* **[spa.js](https://raw.githubusercontent.com/AetherCodez/SPA.js/main/spa.js)** - Full source code with comments
* **[spa.min.js](https://raw.githubusercontent.com/AetherCodez/SPA.js/main/spa.min.js)** - Production-ready minified version

The source code is clean, well-commented, and easy to follow if you want to understand the iframe-based SPA transformation technique.

## Development

```bash
git clone https://github.com/AetherCodez/SPA.js.git
cd SPA.js

# Source: spa.js (readable)
# Production: spa.min.js (minified)
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/improvement`)
3. Commit your changes (`git commit -m 'Add improvement'`)
4. Push your branch (`git push origin feature/improvement`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

* **Issues**: [GitHub Issues](https://github.com/AetherCodez/SPA.js/issues)
* **Discussions**: [GitHub Discussions](https://github.com/AetherCodez/SPA.js/discussions)
* **Star this repo** if it helped you!

---

Transform your website into a modern web app experience in seconds.
