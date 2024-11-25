const express = require('express');
const helmet = require('helmet');  // Helps set up secure HTTP headers
const app = express();

// Enable CSP with specific settings
app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"], // Allow resources from the same origin
        scriptSrc: ["'self'", "https://vercel.live", "https://rclinebox.vercel.app"], // Allow scripts from specific sources
        styleSrc: ["'self'", "https://vercel.live"], // Allow styles from specific sources
        imgSrc: ["'self'", "https://rclinebox.vercel.app"], // Allow images from specific sources
        connectSrc: ["'self'"], // Allow connections (e.g., XHR, WebSockets)
        fontSrc: ["'self'"], // Allow fonts from the same origin
        objectSrc: ["'none'"], // Disallow <object> tags
        childSrc: ["'none'"], // Disallow child resources (iframes)
    }
}));

// Serve static files (CSS, JS, etc.)
app.use(express.static('public'));

// Start the server
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
